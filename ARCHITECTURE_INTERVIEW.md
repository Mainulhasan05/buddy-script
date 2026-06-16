# Buddy Script — System Architecture (Interview Walkthrough)

A presentation companion for the architecture video. Every decision below is grounded in the
actual implementation. Each is framed as **Problem → Decision → Why → Trade-off** — the framing
that demonstrates you reasoned about alternatives, not just coded a thing.

Target context to state up front: *"A social feed for a very large student population (read-heavy,
spiky writes, lots of media), so I optimized for read latency, bounded memory, and graceful
behavior under bursts rather than raw feature count."*

---

## 1. System Context (draw this first)

```
                    ┌──────────────────────────────┐
                    │        Browser (Next.js)      │
                    │  App Router + Redux Toolkit    │
                    │  • cursor infinite scroll      │
                    │  • optimistic likes            │
                    │  • bounded in-memory state     │
                    └───────────────┬───────────────┘
                                    │ HTTPS (JWT access in header,
                                    │        httpOnly refresh cookie)
                                    ▼
                    ┌──────────────────────────────┐
                    │     Load Balancer (ALB)       │
                    └───────────────┬───────────────┘
                                    │  (stateless → N replicas)
                    ┌───────────────▼───────────────┐
                    │      Express API (stateless)   │
                    │  route → controller → service  │
                    │  helmet · cors · compression    │
                    │  rate-limit · sanitize · authn  │
                    └───┬───────┬─────────┬──────┬────┘
                        │       │         │      │
              ┌─────────▼─┐ ┌───▼────┐ ┌──▼───┐ ┌▼─────────────┐
              │ MongoDB   │ │ Redis  │ │Rabbit│ │  Cloudinary  │
              │ (Atlas)   │ │ cache+ │ │ MQ   │ │ (media CDN)  │
              │ primary + │ │ rate   │ │      │ │              │
              │ replicas  │ │ limit  │ │      │ │              │
              └───────────┘ └────────┘ └──┬───┘ └──────────────┘
                                          │ consumes
                              ┌───────────▼────────────┐
                              │  Workers (async)        │
                              │  • like-counter (batch) │
                              │  • feed-invalidation    │
                              └─────────────────────────┘
```

**One-liner:** *"Stateless API tier behind a load balancer; MongoDB as the source of truth; Redis as
a read accelerator and shared coordination layer; RabbitMQ to decouple high-frequency writes; a
CDN for media. Everything that can grow without bound has an explicit cap."*

---

## 2. The Two Hot Paths (draw these — they carry the whole interview)

### 2a. Feed read (the most-hit endpoint) — cache-first, no N+1, bounded

```
GET /api/posts?cursor=...
  │
  ├─ first page & no cursor? ──► Redis: ONE pipelined round-trip
  │                               (feed:version + feed payload)
  │        hit ─────────────────► return cached posts ──┐
  │        miss/stale            ┌──────────────────────┘
  │            │                 │
  ▼            ▼                 │
 Mongo: find({deletedAt:null, visibility:'public'})    │
        .select(projection)      │  uses compound index │
        .sort({createdAt:-1,_id:-1})                     │
        .limit(limit+1)  ◄── limit+1 = "hasMore" probe   │
        .lean()          ◄── plain JS objects, not docs  │
            │                                            │
        cache first page (tagged with version) ──────────┘
            │
            ▼
   isLiked layered AFTER cache:
   ONE batched query  Like.find({ userId, targetId:{$in:[...]} })
   → Set membership   (NOT a query per post → no N+1)
```

**Talking points:**
- *Cache is user-agnostic.* The cached feed has no per-user data; `isLiked` is layered on afterward
  with a single batched `$in` query. One cache entry serves every user → huge hit-rate, tiny memory.
- *Only the first page is cached.* Deeper cursors are near-unique per user/scroll position, so
  caching them would bloat Redis for almost no reuse. First page = the page everyone hits.
- *`limit + 1` trick* tells us `hasMore` without a second `count()` query.

### 2b. Like toggle (highest-frequency write) — decoupled, eventually consistent

```
POST /api/likes/toggle
  │
  ├─ atomic Like.findOneAndDelete()  ── exists? ─► UNLIKE (delta -1)
  │                                   └ none ───► CREATE like (delta +1)
  │                                               (unique index = idempotent)
  ▼
 publish(LIKE_CREATED/DELETED, {targetId, delta})   ◄── fire-and-forget, non-blocking
  │     (if broker down → synchronous $inc fallback)
  ▼
 return {isLiked, delta} immediately  ◄── user never waits on the counter write
        │
        │  ... meanwhile, asynchronously ...
        ▼
 like-worker: accumulate deltas in a Map for 500ms or 100 msgs
   key = "post:123" → collapses +1 -1 +1 into ONE update
   flush → Post.bulkWrite([...$inc ops], {ordered:false})
   ack all msgs · retry w/ header · DLQ after 3 tries
```

**Talking points:**
- *Why a queue at all?* A viral post can take thousands of likes/second. Writing each one
  synchronously to the same document creates **write contention on one hot row**. The queue absorbs
  the spike and the worker collapses many deltas into one `$inc` per document per flush window.
- *Single owner of the counter.* The worker owns counter writes; the request path only writes
  synchronously as a **fallback** when the broker is unreachable. This prevents the classic
  double-counting / drift bug where two code paths both increment.
- *Eventually consistent on purpose.* The like count is non-financial; the user sees their own action
  instantly via optimistic UI, and the true count converges within a flush window. I traded strict
  consistency for throughput — a deliberate, scoped choice.

---

## 3. Key Design Decisions (the meat — pick 5–6 to narrate)

### D1. Denormalized author snapshot → kills N+1 and $lookup
- **Problem:** Showing a feed needs each post's author name + avatar. The naive approach is a join
  (`$lookup`) or a query per post (N+1).
- **Decision:** Store a small `{_id, firstName, lastName, avatarUrl}` snapshot **on the post/comment
  document** at write time.
- **Why:** Feed reads (the hot path) become a single-collection query with zero joins. Reads vastly
  outnumber profile edits, so denormalize toward the read.
- **Trade-off:** Author renames go stale on old posts. Acceptable for a feed; if needed, a background
  job can backfill. *State this trade-off out loud — it shows you know the cost.*

### D2. Compound indexes that match the query shape exactly (ESR)
- **Problem:** Feed/comment queries filter + sort; without the right index that's a collection scan.
- **Decision:** `{deletedAt:1, visibility:1, createdAt:-1, _id:-1}` for the feed — Equality fields
  first, then Sort fields, in sort order. Same discipline for comments `{postId, parentId, deletedAt,
  createdAt, _id}` and the likes unique key `{userId, targetId, targetType}`.
- **Why:** The DB satisfies filter **and** sort from one index, no in-memory sort, no scan.
- **Trade-off:** Indexes cost write time + storage. Justified because this is read-heavy.

### D3. Cursor pagination, never offset/skip
- **Problem:** `skip(N)` re-scans N documents every page → O(N) and gets slower as you scroll; it also
  double-shows or skips items when new posts arrive mid-scroll.
- **Decision:** Keyset cursor on `(createdAt, _id)`, base64-encoded, with `$or` tiebreak on `_id`.
- **Why:** Every page is O(log n) via the index regardless of depth; stable under inserts.
- **Trade-off:** No "jump to page 50." Fine for an infinite-scroll feed.

### D4. Versioned O(1) cache invalidation (avoid the SCAN/DEL trap)
- **Problem:** When a new post lands, *every* cached feed page is stale. Deleting them with
  `SCAN feed:*` is O(N) and can stall Redis at scale; deleting the wrong key silently serves stale data.
- **Decision:** Keep an integer `feed:version`. Invalidation = `INCR feed:version` (O(1)). Cached
  payloads are tagged with the version they were built under and validated on read; a mismatch is
  treated as a miss. Old entries just expire by TTL.
- **Why:** Invalidation is a single atomic counter bump, not a key sweep. Same pattern per-post for
  comments (`post:{id}:comments:version`).
- **Trade-off:** Briefly wastes the memory of now-orphaned keys until TTL — cheap and self-cleaning.
- *(Recent optimization: version + payload are fetched in **one pipelined round-trip** instead of two
  sequential GETs.)*

### D5. RabbitMQ to decouple spiky writes (covered in §2b)
- Confirm channel for observability, **non-blocking publish** on the request path, synchronous
  fallback when the broker is down, DLQ + bounded retries for poison messages. Graceful degradation:
  if RabbitMQ isn't configured (dev), counters just update synchronously.

### D6. Stateless auth → horizontal scale + secure sessions
- **Problem:** Server-side sessions pin a user to one server and don't scale horizontally.
- **Decision:** Short-lived **access JWT** (in memory / header) + long-lived **httpOnly refresh
  cookie**. Refresh tokens are **hashed** in Mongo, **rotated** on every refresh, **capped at 5 per
  user**, and auto-expire via a **TTL index**.
- **Why:** Any API replica can validate a request with no shared session store. Rotation + hashing
  limits blast radius if a token leaks; the cap + TTL stop the token collection growing unbounded.
- **Trade-off:** Can't instantly revoke an access token mid-window (15 min) — standard JWT trade-off,
  mitigated by the short lifetime.

### D7. Upload safety: bounded memory + real content validation
- **Problem:** Image uploads buffered in memory can OOM the process under a burst; clients can spoof
  the `Content-Type` header.
- **Decision:** Multer memory storage **streamed** to Cloudinary, behind a **concurrency gate (max
  10)**, a **30s timeout** that releases the buffer, and **magic-byte validation** (`file-type`) that
  verifies the real bytes, not the header.
- **Why:** Caps worst-case upload memory (~10 × 5 MB) and rejects spoofed/malicious files.
- **Trade-off:** Rejects the 11th concurrent upload with a 503 — backpressure beats crashing.

---

## 4. Scaling Story (the "1M+ users" slide)

| Dimension | How it scales |
|---|---|
| **API tier** | Stateless (JWT) → add replicas behind the ALB. No sticky sessions. |
| **Reads** | Redis cache-first + denormalization absorb the read flood; Mongo replicas serve overflow. |
| **Write spikes** | RabbitMQ absorbs like storms; worker batches collapse N deltas → 1 `$inc`. |
| **Hot documents** | Batching avoids contention on a single viral post's counter. |
| **Connection limits** | Env-driven Mongo pool sizing so M replicas don't exhaust Atlas connections. |
| **Coordination** | Redis is the shared layer for cache, rate-limit counters, and like-state. |
| **Next step (state it!)** | Split workers into their own deployment; run API under cluster (1 proc/core). Documented in the perf audit (F7). |

**Resilience / graceful degradation (interviewers love this):**
- Redis down → cache service returns `null` on every op (try/catch), app falls back to Mongo. Never crashes.
- RabbitMQ down → `publish()` returns false → synchronous counter fallback.
- Mongo blip → retryable writes + reconnect handlers.
- LB → `keepAliveTimeout` (65s) set **above** the ALB idle timeout to avoid 502s on reused connections.
- Graceful shutdown drains in-flight requests, then closes Mongo/Redis cleanly on SIGTERM.

---

## 5. Memory Optimization (your highlighted theme — give it its own slide)

### Backend
| Technique | Effect on memory |
|---|---|
| **`.lean()` on every read** | Returns plain JS objects, not full Mongoose documents (which carry change-tracking, getters/setters, prototype overhead). Big heap savings on list endpoints. |
| **Field projections** (`.select(...)`) | Only the fields the view needs leave the DB and live in heap — never the full document, never `passwordHash`/`image.publicId`. Smaller payloads too. |
| **`limit + 1` cursor pages** | Result sets are bounded (≤51 docs), never "load everything." |
| **First-page-only feed cache** | Bounds Redis memory — caching every cursor page would be near-unbounded. |
| **TTL on every cache key + versioning** | Keys self-expire; orphaned versions don't accumulate. No unbounded key growth. |
| **Upload concurrency gate + timeout** | Caps worst-case buffer memory; timeout frees a hung buffer. Streamed to Cloudinary, not held. |
| **Worker delta accumulation** | A `Map` keyed by target collapses duplicate events; flushed and cleared every 500ms — bounded working set. |
| **Session cap + TTL index** | Refresh-token collection can't grow without bound per user. |

### Frontend
| Technique | Effect on memory |
|---|---|
| **200-post retention cap** in Redux | Infinite scroll trims oldest posts → browser heap + DOM node count stay bounded over long sessions. |
| **100-liker cap** in the like-list modal | Bounds a modal that could otherwise load thousands of rows. |
| **`next/image` lazy loading** | Offscreen images aren't decoded into memory until near the viewport; AVIF/WebP shrink decoded size. |
| **Cursor pagination, not load-all** | Only a window of data is ever in memory. |
| **CSS through the Next pipeline** | Minified/hashed/split instead of 4 render-blocking raw stylesheets. |

**Soundbite:** *"My rule was: anything that grows with usage gets an explicit ceiling — feed length,
liker lists, upload concurrency, sessions per user, cache pages. That keeps both heap and Redis flat
under load instead of creeping toward an OOM."*

---

## 6. Common Problems I Deliberately Avoided (rapid-fire slide)

- **N+1 queries** → denormalized snapshots + batched `$in` for `isLiked`.
- **`$lookup` on the hot path** → application-level hydration for the likers list (one `Like` query +
  one batched `User` query) instead of an aggregation that locks.
- **Counter drift / double-counting** → single-owner worker + fallback, never both.
- **Cache stampede / wrong-key invalidation** → version counters, not key sweeps.
- **Offset-pagination slowdown & dupes** → keyset cursors.
- **Upload OOM & MIME spoofing** → concurrency gate + magic bytes.
- **Token-table bloat** → session cap + TTL index.
- **502s behind the LB** → keep-alive timeout ordering.
- **Infinite refresh-token loop** → server clears the httpOnly cookie on failed refresh; client has a
  durable "session dead" latch so it logs out instead of looping.
- **Render-blocking assets** → CSS via the build pipeline, images via `next/image`, ~16 MB of unused
  template assets pruned.

---

## 7. "What I'd Do Next" (always end here — shows you know the limits)

1. **Separate worker deployment + API clustering** — isolate batch DB writes from request latency,
   use all cores.
2. **Server-render the first feed page** — currently client-fetched after hydration; SSR would cut LCP.
3. **Fan-out-on-write feed** (per-user timelines) if the social graph grows — current model is
   fan-out-on-read (one global public feed), which is simpler and correct for now.
4. **Observability** — the app already logs slow requests (>500ms); next is real APM + metrics
   (p95 dashboards, queue depth alerts).

---

## 8. Suggested Video Flow (≈8–10 min)

1. Context diagram (§1) — 60s, set the read-heavy/spiky-write framing.
2. Feed read path (§2a) — cache-first, no N+1, bounded. 2 min.
3. Like toggle path (§2b) — the queue/decoupling story. 2 min. *(Your strongest slide.)*
4. Pick 3 decisions from §3 (D1 denormalization, D4 versioned cache, D6 auth). 2 min.
5. Memory slide (§5) — your highlighted theme. 90s.
6. Scaling + resilience (§4) and "what's next" (§7). 90s.

> Keep repeating the meta-pattern: **"reads outnumber writes, so I optimized toward reads; anything
> unbounded got a cap; anything spiky got a queue; everything degrades gracefully instead of
> crashing."** That single sentence is what they'll remember.
```
