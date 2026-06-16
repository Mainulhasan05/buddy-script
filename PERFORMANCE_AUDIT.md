# Performance Audit — Buddy Script Platform

**Application**: Buddy Script — social media platform (target scale: millions of student users)
**Audit Date**: 2026-06-16
**Auditor role**: Principal Software Architect / Performance Engineer
**Scope**: `social-media-backend`, `social-media-frontend`, MongoDB, Redis, RabbitMQ, asset delivery, deployment/runtime config
**Method**: Full source read of services, models, config, workers, middleware, routes, and frontend feed/auth/layout. Findings below are grounded in specific files and lines, not assumptions.

> **Status note.** A previous audit (2026-06-15) marked most backend work "SOLVED." This audit **independently verified those claims against the code** — most hold up and are genuinely good. However, the prior audit (a) declared the work essentially finished, (b) presented the RabbitMQ `waitForConfirms()` change as a pure win when it is in fact a **latency regression on the hottest endpoint**, and (c) left real, measurable bottlenecks unaddressed. This document supersedes it.

---

## 1. Executive Summary

The backend architecture is solid: denormalized author snapshots, cursor pagination, compound indexes matching every hot query, versioned O(1) cache invalidation, batched async like-counter updates, and upload guardrails. These are real and verified.

The highest-value **remaining** opportunities, in ROI order, are:

1. **[Backend] `publish()` blocks every like/post request on a broker round-trip** (`waitForConfirms()` + `persistent: true`). This silently re-couples the async path it was meant to decouple. **Highest ROI: high impact, low risk.**
2. **[Frontend] ~338 KB of render-blocking template CSS** loaded via four raw `<link>` tags, bypassing the Next.js asset pipeline (no hashing, minification beyond source, splitting, or framework-managed caching).
3. **[Frontend] Almost all images use raw `<img>`** (only the post image uses `next/image`), and **~10 MB of large unused template PNGs** ship in `public/`.
4. **[Frontend] The feed is 100% client-rendered**; initial data is fetched only after hydration, so LCP is gated on JS download + an API round-trip.
5. **[Backend] Several smaller hot-path inefficiencies**: duplicate per-request logging, two sequential Redis round-trips on feed reads, in-process workers sharing the API event loop, single-core (no clustering).

No correctness or data-integrity bugs were found in the read paths. The concerns are latency, throughput, bandwidth, and infrastructure cost.

---

## 2. Architecture Summary (verified)

| Component | Implementation | Verified strengths | Verified concerns |
|---|---|---|---|
| **API** | Express 4, route → controller → service | Lean projections, compression, helmet, graceful shutdown, keep-alive tuned for ALB | Workers run **in-process**; single core; double request logging |
| **DB** | MongoDB + Mongoose 8 | Compound indexes match every hot query; cursor pagination; `.lean()` everywhere; env-driven pool | Session-cap enforcement does find-all+deleteMany on every auth (bounded) |
| **Cache** | Redis (ioredis), cache-first reads | Versioned O(1) invalidation (feed + comments); user-agnostic feed cache; noop fallback | Feed read = 2 sequential round-trips (version GET, then payload GET) |
| **Queue** | RabbitMQ (amqplib), confirm channel | Batched like-counter worker (100/500 ms), DLQ, bounded retries, idempotent-ish bulk `$inc` | **`waitForConfirms()` on the request hot path** (see F1) |
| **Media** | Multer memory → Cloudinary stream | Concurrency gate (10), 30 s timeout, magic-byte validation | — |
| **Frontend** | Next.js 16 App Router + Redux Toolkit | `next/image` for post images; AVIF/WebP config; 200-post retention cap | Render-blocking CSS; raw `<img>`; client-only feed; unused heavy assets |

---

## 3. Verified-Solved Items (kept, not re-doing)

These were claimed solved and **confirmed correct in code**:

- **No N+1 on read paths.** `getFeed`, `getMyPosts`, `getComments`, `getReplies` all resolve `isLiked` via a single batched `$in` query (`likeService.getBatchLikeState`). `getLikers` uses application-level hydration (one `Like` query + one `User` `$in`) instead of `$lookup`. ✔ `post.service.js:114-126`, `like.service.js:188-200`
- **Indexes match queries.** Feed `{deletedAt,visibility,createdAt,_id}`, user posts `{author._id,...}`, comments `{postId,parentId,...}` and `{parentId,...}`, likes unique `{userId,targetId,targetType}` + `{targetId,targetType,createdAt}`. ✔ model files
- **Versioned O(1) cache invalidation** for feed and comments (INCR a version counter; old keys expire by TTL). ✔ `cache.service.js:108-157`
- **Feed cache is first-page-only and user-agnostic** (isLiked layered on after cache read). ✔ `post.service.js:80-126`
- **Like counters are batched** in the worker with DLQ + retry header. ✔ `like.worker.js`
- **Upload guardrails**: concurrency gate + timeout + magic bytes. ✔ `upload.middleware.js`
- **Session cap** (5) and **refresh-token TTL index**. ✔ `auth.service.js:54-62`, `RefreshToken.model.js:34`
- **Client feed retention cap** (200). ✔ `feedSlice.js:11`
- **`next/image` + AVIF/WebP** for post images. ✔ `PostCard.jsx:123`, `next.config`

---

## 4. Identified Bottlenecks (remaining)

Each finding: evidence → root cause → impact → fix → risk → expected gains.

### F1 — [P0] `publish()` blocks the request on a broker confirm (hot path)
- **Evidence**: `rabbitmq.js:65-85` — `publish()` calls `ch.publish(..., { persistent: true })` then `await ch.waitForConfirms()`. It is `await`ed inside `like.service.toggle()` (`like.service.js:24,58`) and `post.service.createPost()` (`post.service.js:53`), both directly in the request path. The like-toggle endpoint is the single highest-frequency write in a social app.
- **Root cause**: A reliability fix (confirm channel) was applied on the synchronous request path. `waitForConfirms()` resolves only after the broker acknowledges — and with `persistent: true` on a durable queue, the broker **fsyncs to disk before acking**. Worse, `waitForConfirms()` waits for **all outstanding confirms on the shared channel**, so concurrent requests' publishes serialize each other's latency.
- **Impact**: Every like/unlike now pays a RabbitMQ round-trip + broker disk sync (typically +3–20 ms, much worse under broker load or network jitter) *before responding*. This defeats the purpose of the async queue (which exists precisely so the user doesn't wait on the counter write) and caps like throughput at the channel's confirm rate. Under a like storm (viral post), the shared-channel confirm barrier becomes a convoy.
- **Recommended fix**: Do **not** block the request on confirms. Keep the confirm channel for observability, but in the request path publish fire-and-forget (return `true` when a channel exists) and rely on the existing worker + the existing synchronous fallback for the channel-down case. Attach channel-level `return`/`error` handlers for logging. Counters are eventually-consistent, non-financial data — this matches the system's existing tolerance (the cache already serves stale counts for up to its TTL).
- **Risk**: **Low–Medium.** Trade strict per-message publish acknowledgment for throughput. Mitigated by: worker idempotency via accumulation, durable queue, DLQ, and the sync fallback. No user-visible correctness change (counts already converge asynchronously).
- **Expected gains**: Like-toggle p50 latency **−30% to −70%**; removes a throughput ceiling on the hottest endpoint; lower tail latency under concurrency. Response time ↓↓, throughput ↑↑, DB load unchanged, infra cost ↓ (fewer blocked event-loop ticks → fewer instances).

### F2 — [P1] ~338 KB of render-blocking template CSS via raw `<link>` tags
- **Evidence**: `app/layout.js:22-27` injects four stylesheets into `<head>`: `bootstrap.min.css` (153 KB), `main.css` (140 KB), `common.css` (23 KB), `responsive.css` (22 KB) — all served from `/public/assets/css` outside the Next pipeline.
- **Root cause**: Stylesheets were dropped into `public/` and linked manually instead of imported through Next, so they are render-blocking, not minified/split/tree-shaken by the framework, not content-hashed, and not served with the framework's immutable long-cache headers.
- **Impact**: ~338 KB (≈55–70 KB gzipped) of CSS blocks first paint on **every** page. Directly inflates FCP/LCP, especially on the mobile/low-bandwidth networks typical of the target audience.
- **Recommended fix**: Import the stylesheets through the Next.js CSS pipeline (global import in `app/globals.css` / `layout.js`) so they are minified, hashed, and long-cached; audit Bootstrap usage and drop it if the template's custom CSS already covers the components in use (the app uses a handful of `_feed_*` classes, not the full Bootstrap grid/JS).
- **Risk**: **Low.** Requires visual parity verification (cascade order must be preserved).
- **Expected gains**: FCP/LCP **−20% to −40%**; smaller transferred CSS; better cache hit ratio on repeat visits. Response time ↓, bandwidth/CDN egress ↓.

### F3 — [P1] Raw `<img>` everywhere + ~10 MB unused template assets
- **Evidence**: Only `PostCard.jsx` post image uses `next/image`. Avatars and decorative imagery use raw `<img>` in `FeedContainer`, `CommentSection`, `CommentItem`, `LikeList`, `Navbar`, `LeftSidebar`, `RightSidebar`, `LoginForm`, `RegisterForm`, `CreatePostModal`. `public/assets/images` is **17 MB / 103 files**, including large **unreferenced** PNGs: `top_img.png` (4.5 MB), `group-single.png` (2.9 MB), `profile-cover-img.png` (2.0 MB), `timeline_img.png` (1.2 MB) ≈ **10.6 MB dead weight**; referenced decorative PNGs (`people1-3`, `feed_event1` 293 KB, `recommend1-4` up to 480 KB) are unoptimized.
- **Root cause**: Template HTML was ported to JSX largely verbatim; images weren't routed through `next/image`, and the template's full image set was copied into `public/` without pruning.
- **Impact**: Raw `<img>` ships original-resolution PNGs with no AVIF/WebP conversion, no responsive `srcset`, and inconsistent lazy-loading → wasted bandwidth and extra LCP/CLS risk. The 10.6 MB of unused assets bloat the deploy artifact and git repo (no runtime cost unless referenced, but real CI/deploy/storage cost).
- **Recommended fix**: (a) Delete unreferenced heavy PNGs. (b) Convert referenced avatars/decorative images to `next/image` with explicit dimensions (remote avatar hosts are already whitelisted in `next.config`). (c) Re-export the referenced decorative PNGs as compressed WebP.
- **Risk**: **Low.** Per-image visual check; confirm no dynamic references to "unused" files first.
- **Expected gains**: Per-image bytes **−40% to −80%** (AVIF/WebP + right-sizing); deploy artifact ↓ ~10 MB; better LCP and lower CDN egress.

### F4 — [P2] Feed is fully client-rendered; LCP gated on JS + API round-trip
- **Evidence**: `useFeed.js` fetches the first page in a `useEffect` after hydration; `FeedContainer`/`PostCard` are `'use client'`. Initial HTML is skeletons only.
- **Root cause**: App Router is used, but the feed page is a client island that fetches its own data post-mount.
- **Impact**: LCP waits for: HTML → JS bundle → hydration → `fetchFeed` API round-trip → render. On slow networks this is several seconds of skeletons. SEO/shareability of public feed also suffers.
- **Recommended fix**: Render the first feed page on the server (RSC or server-fetch) and hydrate Redux from it; keep infinite scroll client-side. Requires resolving auth (access token is currently client-held) — a deliberate, scoped change.
- **Risk**: **Medium.** Touches auth/data-flow boundary; needs care to avoid leaking private posts and to keep the cache user-agnostic.
- **Expected gains**: LCP/TTI **−30% to −50%** on first load; removes one client round-trip from the critical path.

### F5 — [P2] Duplicate per-request logging
- **Evidence**: `app.js:56` uses `morgan('combined')` (logs every request) **and** `requestTimer.middleware.js` logs every request again at `info`. Two winston writes per request.
- **Root cause**: Two overlapping logging mechanisms added independently.
- **Impact**: 2× log volume and 2× synchronous-ish log I/O per request; meaningful at high RPS and inflates log storage cost.
- **Recommended fix**: Keep `requestTimer` (it has the latency signal) and drop `morgan`, or gate `requestTimer`'s success log behind the slow threshold only (it already separates SLOW vs normal — log only SLOW at `warn`, sample the rest).
- **Risk**: **Low.**
- **Expected gains**: ~50% fewer log lines; lower CPU and log-ingest cost at scale.

### F6 — [P2] Feed read makes two sequential Redis round-trips
- **Evidence**: `post.service.getFeed` calls `cacheService.getFeedVersion()` (GET) then `cacheService.get(cacheKey)` (GET) — sequential awaits. Same shape in comments (`getCommentVersion` then `get`).
- **Root cause**: Version and payload are fetched in separate calls.
- **Impact**: Adds one Redis RTT to every cached feed/comment read. Small per-call, but feed is the most-hit endpoint.
- **Recommended fix**: Pipeline the two reads (`MGET`/pipeline), or fold the version into the cached payload's validation. Minor, mechanical.
- **Risk**: **Low.**
- **Expected gains**: −1 RTT (~0.2–1 ms) on the hottest read; modest throughput headroom.

### F7 — [P3] In-process workers + single-core runtime
- **Evidence**: `server.js` starts `startLikeWorker()`/`startNotificationWorker()` inside the API process; no clustering/PM2. The like worker does `bulkWrite` batches on the same event loop that serves HTTP.
- **Root cause**: Simplicity — one process does everything.
- **Impact**: Worker DB flushes compete with request handling for the single event loop; the app uses one CPU core regardless of host size. Limits per-instance throughput and couples worker load to API latency.
- **Recommended fix**: (a) Run workers as a separate process/deployment (same image, different entrypoint). (b) Run the API under `cluster`/PM2 with one worker per core behind the existing keep-alive config. Document as infra change.
- **Risk**: **Medium** (deployment topology change).
- **Expected gains**: Near-linear throughput scaling with cores; isolates batch-write spikes from request latency.

### F8 — [P3] Minor application-layer costs
- **`auth.service.issueTokens`** (`:54-62`) issues a token, then `find()`-all-tokens + `deleteMany` on **every** login/register/refresh. Bounded (≤6 docs) but it's 2–3 round-trips per auth; could be a single capped operation. Low priority.
- **`express-mongo-sanitize`** (`app.js:81`) deep-traverses every request body/query/params on every call. Cheap individually; with `express.json({limit:'10kb'})` the payload is small, so low impact — note only.
- **`date-fns formatRelative`** recomputed each `PostCard` render (`PostCard.jsx:42`); React 19 compiler is enabled and largely mitigates this. Note only.

---

## 5. ROI Prioritization

| Rank | Finding | Impact | Risk | Effort | ROI |
|---|---|---|---|---|---|
| 1 | **F1** Remove `waitForConfirms()` from request path | High (hot-path latency/throughput) | Low–Med | XS | ★★★★★ |
| 2 | **F2** Move template CSS into Next pipeline (+drop Bootstrap if unused) | High (FCP/LCP) | Low | S | ★★★★★ |
| 3 | **F3** `next/image` for avatars + delete/compress heavy assets | Med–High (bandwidth/LCP) | Low | S–M | ★★★★ |
| 4 | **F5** De-duplicate request logging | Med (cost at scale) | Low | XS | ★★★★ |
| 5 | **F6** Pipeline feed/comment Redis reads | Low–Med | Low | XS | ★★★ |
| 6 | **F4** Server-render first feed page | Med–High (LCP/TTI) | Med | M–L | ★★★ |
| 7 | **F7** Separate worker process + clustering | Med (throughput/isolation) | Med | M | ★★★ |
| 8 | **F8** Auth session-cap & misc micro-opts | Low | Low | XS | ★★ |

**Recommended first batch (high impact / low risk):** F1, F2, F3, F5, F6.
**Second batch (high impact / medium risk):** F4, F7.
**Everything else:** F8.

---

## 6. Measurement Plan (before/after)

- **Backend hot paths**: the existing `requestTimer` already records per-request ms. Capture p50/p95 for `POST /api/likes/toggle`, `GET /api/posts` (feed), `POST /api/posts` before and after F1/F6 using a short `autocannon`/`k6` run against the seeded dataset (`scripts/seed.js`: 1k users / 10k posts).
- **Frontend**: Lighthouse (mobile, throttled) FCP/LCP/TBT and Network panel transfer size for `/feed` and `/login`, before and after F2/F3/F4. Confirm CSS is hashed/minified and images are served as `image/avif`/`image/webp`.
- **Queue**: confirm like-toggle latency drop and that worker `flushBatch` throughput is unchanged after F1.

> No production traffic numbers were available at audit time; impact ranges above are engineering estimates from request-path analysis and asset sizes, to be confirmed by the measurements above.

---

## 7. Constraints Honored During Future Implementation

- Preserve all existing functionality and response shapes (no breaking API changes).
- Maintain the existing route→controller→service structure and code conventions.
- Keep graceful-degradation behavior (Redis/RabbitMQ optional in dev).
- Add/adjust tests where behavior changes (F1 publish semantics, F5 logging).
- No premature optimization: F8 items are explicitly deferred.
