# Performance Audit

Application: Buddy Script social media platform  
Audit date: 2026-06-14  
Scope: `social-media-backend`, `social-media-frontend`, deployment config, static template assets  
Status: Audit complete; implementation intentionally paused pending approval.

## Executive Summary

The codebase already includes several good performance foundations: cursor pagination, `.lean()` reads, denormalized author snapshots, denormalized like/comment counters, bounded page sizes, Redis cache wrappers, versioned feed cache invalidation, RabbitMQ worker scaffolding, gzip compression, and MongoDB compound indexes for the main feed and comment paths.

The highest-risk performance issue is the like counter architecture. `like.service.js` updates counters synchronously and also publishes like events. When RabbitMQ is configured, `like.worker.js` consumes those same events and updates the counters again. This creates duplicate writes, incorrect counters, extra database load, and cache drift. Fixing that is high ROI because it reduces write amplification and prevents data corruption.

The next largest opportunities are cache invalidation correctness for comment pages, frontend asset delivery and rendering, upload memory pressure, and operational guardrails around queue publishing and MongoDB pool sizing.

## Architecture Observed

| Area | Current design | Performance notes |
|---|---|---|
| Backend | Express 4 route -> controller -> service pattern | Simple and maintainable; no excessive dependency graph observed. |
| Database | MongoDB via Mongoose | Uses query-specific indexes, lean reads, cursor pagination, denormalized snapshots. |
| Cache | Redis via `ioredis`, optional no-op fallback | Feed, post, comment, and like-state caches exist; invalidation has gaps. |
| Queue | RabbitMQ via `amqplib`, optional fallback | Worker batching exists, but counter ownership conflicts with synchronous updates. |
| Frontend | Next.js 16 App Router, React 19, Redux Toolkit, Axios | Mostly client-rendered feed; static template CSS/images/fonts loaded globally. |
| Media | Multer memory storage -> Cloudinary upload stream | Simple path, but memory pressure grows with concurrent 5 MB uploads. |
| Deployment | Netlify frontend config only | No backend process/container config found in this repo. |

## Positive Findings

- Feed and comment endpoints avoid `skip()` and use cursor pagination.
- Feed, posts, comments, replies, and like-state reads use bounded `limit` values.
- Feed and comment list reads use `.lean()` to avoid Mongoose document hydration overhead.
- Posts and comments store an author snapshot, avoiding feed-time `populate()` or `$lookup`.
- Likes have a compound unique index to enforce idempotence.
- Comments and replies have compound indexes aligned with their read paths.
- Feed cache invalidation uses a version key instead of scanning and deleting all feed keys.
- Rate limiters can use Redis when available and fall back in development.
- HTTP compression is enabled globally.

## Bottlenecks And Risks

### P0. Like counters are double-updated when RabbitMQ is enabled

Evidence:
- `social-media-backend/src/services/like.service.js` performs `Model.updateOne(... $inc likeCount ...)` on every like/unlike.
- The same service publishes `LIKE_CREATED` and `LIKE_DELETED`.
- `social-media-backend/src/workers/like.worker.js` consumes those events and performs `bulkWrite` `$inc` updates again.

Impact: Critical. Like counts can drift by 2x, and every like action creates both a direct write and a queued write. Under high reaction traffic this doubles counter write load and makes reads unreliable.

Root cause: Counter ownership is split between the synchronous request path and the async worker path.

Recommended fix: Choose one counter owner. The lowest-risk fix is to keep synchronous counter updates for now and stop publishing like counter events or stop starting the like counter worker. The more scalable fix is to remove synchronous counter updates and make the worker the single owner, with a fallback path only when RabbitMQ is unavailable.

Risk: Medium if switching to fully async counters because UI/read-after-write semantics change slightly. Low if disabling duplicate queue updates while preserving synchronous updates.

Expected gains:
- Response time: modest improvement if queue publish is removed from hot like path.
- Throughput: high improvement for like-heavy workloads due to fewer writes.
- Memory: neutral.
- Database load: high reduction, roughly one avoided counter write per like event when RabbitMQ is enabled.
- Infrastructure cost: lower MongoDB write IOPS and queue traffic.

### P1. Comment cache invalidation deletes the wrong key

Evidence:
- `getComments` reads and writes keys like `post:${postId}:first:comments` through `CACHE_KEYS.POST_COMMENTS(`${postId}:${cursor || 'first'}`)`.
- `addComment` invalidates `CACHE_KEYS.POST_COMMENTS(postId)`, which is a different key and will not clear cached comment pages.

Impact: High. Users can see stale comments for up to the cache TTL. Stale comment pages also waste cache memory because invalidation is ineffective.

Root cause: The same key helper is used for both a post-level namespace and a page-level cache key, but invalidation calls only the base post id.

Recommended fix: Introduce a versioned comment cache namespace per post, similar to feed versioning, or maintain a short targeted page-key pattern and use safe scan/delete only for that post's comment keys.

Risk: Low to medium. Versioned cache is safer than pattern deletion and avoids broad scans.

Expected gains:
- Response time: improved freshness; cache hit quality improves.
- Throughput: fewer unnecessary DB reloads caused by stale/mismatched invalidation behavior.
- Memory: less orphaned cache data.
- Database load: reduced after writes because caches are coherent.
- Infrastructure cost: lower Redis waste and fewer support/debug cycles.

### P1. Feed cache page selection is ineffective

Evidence:
- `getFeed` attempts to infer `pageNum` from a decoded cursor using a `"pageNum"` field.
- `encodeCursor` only stores `{ createdAt, _id }`, not `pageNum`.
- As a result, `pageNum` is effectively always `1` for cursor pages and all cursor pages may be considered cacheable despite `MAX_CACHED_FEED_PAGES`.

Impact: Medium to high depending on traffic depth. Deep feed pages have low cache reuse and can expand Redis memory usage.

Root cause: Cache policy depends on a field that the cursor encoder never emits.

Recommended fix: Either remove page-number logic and only cache the first page, or encode page depth in a separate client/server pagination metadata field. The lowest-risk change is first-page-only cache.

Risk: Low.

Expected gains:
- Response time: neutral for first page, possibly slightly lower cache hit rate for deep pages but avoids low-value caching.
- Throughput: neutral to positive.
- Memory: lower Redis memory growth.
- Database load: may increase slightly for deep pages but those pages have low reuse.
- Infrastructure cost: lower Redis cost.

### P1. Frontend ships global template CSS and many static assets without Next image optimization

Evidence:
- `app/layout.js` globally loads Bootstrap plus `common.css`, `main.css`, and `responsive.css`.
- Components render many plain `<img>` tags from `/assets/images/...`.
- `next.config.mjs` has no image `remotePatterns`, cache header customization, bundle analyzer, or asset optimization settings.

Impact: High for first-load and mobile performance. Global CSS blocks rendering across all routes, unused template rules inflate CSS cost, and plain `<img>` misses Next image sizing, optimization, and priority controls.

Root cause: Template assets were integrated wholesale into the App Router rather than split by route/component and optimized through Next's asset pipeline.

Recommended fix: Measure bundle and asset weights with `next build` and analyzer, then prioritize route-scoped CSS, replacing high-impact feed/auth images with `next/image`, adding remote Cloudinary image config, and pruning unused public/template duplicates.

Risk: Medium because template CSS may be tightly coupled to markup.

Expected gains:
- Response time: faster FCP/LCP on auth and feed pages.
- Throughput: lower CDN/network transfer.
- Memory: lower browser memory and style recalculation cost.
- Database load: neutral.
- Infrastructure cost: lower bandwidth.

### P1. Upload path buffers entire files in memory

Evidence:
- `upload.middleware.js` uses `multer.memoryStorage()`.
- Upload limit is 5 MB, and `upload.service.js` streams the in-memory buffer to Cloudinary.

Impact: Medium to high under concurrent image uploads. Ten concurrent uploads can hold around 50 MB plus overhead in Node heap/external memory before Cloudinary finishes.

Root cause: Memory storage is simple but scales with upload concurrency and file size.

Recommended fix: Stream uploads directly to Cloudinary where possible, or keep memory storage but lower per-process upload concurrency, add stricter timeout/backpressure handling, and monitor memory.

Risk: Medium if changing upload flow; low if adding guardrails and monitoring first.

Expected gains:
- Response time: neutral to improved under contention.
- Throughput: better upload stability.
- Memory: significant reduction under concurrent uploads.
- Database load: neutral.
- Infrastructure cost: fewer larger Node instances needed for upload bursts.

### P2. MongoDB pool configuration may be oversized for small deployments

Evidence:
- `config/db.js` sets `maxPoolSize: 100` and `minPoolSize: 10`.

Impact: Medium. In multi-instance deployments, this can create too many idle MongoDB connections. For example, 10 instances imply up to 1,000 connections.

Root cause: Static pool sizing is not tied to instance count, CPU, expected concurrency, or MongoDB Atlas tier.

Recommended fix: Move pool sizes to environment variables with conservative defaults and document sizing guidance.

Risk: Low.

Expected gains:
- Response time: more predictable under deployment scale.
- Throughput: neutral unless current pool causes saturation.
- Memory: lower process and MongoDB connection memory.
- Database load: lower connection overhead.
- Infrastructure cost: reduced risk of needing a larger Atlas tier due to connection pressure.

### P2. RabbitMQ publish path is fire-and-forget without confirms

Evidence:
- `config/rabbitmq.js` uses a regular channel and does not inspect the boolean return from `ch.publish`.
- Events are silently dropped when the channel is unavailable.

Impact: Medium. For non-critical analytics this is acceptable. For counter ownership or cache invalidation, lost events can cause stale caches or incorrect counters.

Root cause: Queue is configured as graceful-degradation infrastructure but some events are semantically important.

Recommended fix: If queues own counters/invalidation, use confirm channels, retry/backpressure handling, and clear ownership rules. If queues are best-effort only, do not use them for critical derived state.

Risk: Medium.

Expected gains:
- Response time: slight overhead with confirms.
- Throughput: more predictable under broker pressure.
- Memory: neutral.
- Database load: depends on chosen counter design.
- Infrastructure cost: lower data-repair cost.

### P2. Refresh token lookup depends on unique index but user/session cleanup is limited

Evidence:
- `RefreshToken` has unique `token`, TTL `expiresAt`, and `userId` index.
- `auth.service.js` creates a new refresh token on every login/refresh and deletes only the rotated token.

Impact: Medium for long-lived active users with many devices/refreshes. TTL eventually cleans up, but active churn can grow token rows.

Root cause: No per-user/session cap or bulk cleanup strategy.

Recommended fix: Add optional max active sessions per user, delete older tokens per user after issuing, and use `.lean()` where public JSON transformation is not needed.

Risk: Medium because session behavior changes.

Expected gains:
- Response time: lower token collection size over time.
- Throughput: lower auth DB churn.
- Memory: lower index memory.
- Database load: lower token storage and cleanup load.
- Infrastructure cost: lower storage/index growth.

### P2. API payloads include repeated author snapshots and full template-era field names

Evidence:
- Feed pages return author snapshot for every post. This is intentionally denormalized and avoids joins.
- Payloads are not compressed at object level beyond HTTP compression.

Impact: Low to medium. The tradeoff is currently reasonable because it avoids lookups, but repeated author data increases transfer size for users with many posts from the same authors.

Root cause: Read-optimized denormalization.

Recommended fix: Do not change yet. Revisit only if payload measurements show feed payload size as a top contributor. Possible later option: compact response DTOs or normalize authors in API response.

Risk: Medium because frontend contract changes.

Expected gains:
- Response time: lower network transfer if implemented.
- Throughput: lower bandwidth.
- Memory: lower client Redux memory.
- Database load: neutral.
- Infrastructure cost: lower egress.

### P2. Client feed grows unbounded in Redux during infinite scroll

Evidence:
- `feedSlice.js` appends every fetched page to `state.posts`.
- No windowing, list virtualization, or max retained page count exists.

Impact: Medium for long scrolling sessions. Browser memory and render time increase as the array grows.

Root cause: Infinite scroll stores and renders all loaded posts.

Recommended fix: Add virtualization or bounded retention after measuring typical session length. Use memoized post rows and stable callbacks first.

Risk: Medium because virtualization can affect layout and scroll behavior.

Expected gains:
- Response time: smoother long sessions.
- Throughput: neutral.
- Memory: lower browser memory.
- Database load: neutral.
- Infrastructure cost: neutral.

### P3. Comment/reply creation uses sequential database operations

Evidence:
- `addComment` checks post existence, fetches user snapshot, creates comment, then increments post counter.
- `addReply` checks parent, fetches user snapshot, creates reply, then increments reply counter.

Impact: Low to medium. Writes are clear and safe, but request latency includes multiple sequential DB round trips.

Root cause: Simple service flow; no transaction or bulk composition.

Recommended fix: Keep for now unless write latency is measured as a problem. Later, parallelize independent reads (`post`/`user`) and consider async counter ownership for comments.

Risk: Low for parallel independent reads; medium for async counters.

Expected gains:
- Response time: moderate improvement on comment writes.
- Throughput: slight improvement.
- Memory: neutral.
- Database load: neutral number of queries, shorter request time.
- Infrastructure cost: neutral.

### P3. Runtime observability is insufficient for re-measurement

Evidence:
- No endpoint timing middleware, query explain tooling, request histogram, or frontend bundle analyzer config was found.

Impact: Medium for ongoing performance work. Optimizations cannot be confidently ranked without timing, payload, and query metrics.

Root cause: Performance telemetry is not yet part of the app.

Recommended fix: Add lightweight request duration logging, slow query logging in development/staging, and documented benchmark commands before deeper refactors.

Risk: Low.

Expected gains:
- Response time: indirect.
- Throughput: indirect.
- Memory: neutral.
- Database load: indirect.
- Infrastructure cost: prevents low-ROI work.

## Database Review

### Query plans and index usage

Current index coverage is mostly appropriate:

- Feed: `{ deletedAt: 1, visibility: 1, createdAt: -1, _id: -1 }`
- My posts: `{ 'author._id': 1, deletedAt: 1, createdAt: -1, _id: -1 }`
- Comments: `{ postId: 1, parentId: 1, deletedAt: 1, createdAt: 1, _id: 1 }`
- Replies: `{ parentId: 1, deletedAt: 1, createdAt: 1, _id: 1 }`
- Likes: unique `{ userId: 1, targetId: 1, targetType: 1 }`, target lookup `{ targetId: 1, targetType: 1, createdAt: -1 }`
- Refresh tokens: unique token plus TTL index

No obvious N+1 query remains in feed, comments, or replies. Batch like-state lookup is already in place.

Recommended query-plan work:

- Run `.explain('executionStats')` for feed, my posts, comments, replies, and likers on production-like data.
- Validate that cursor `$or` queries use compound indexes without blocking sort.
- Validate `Like.aggregate` uses `{ targetId, targetType, createdAt }` before `$lookup`.

### Pagination

The code correctly avoids `skip()`. Cursor encoding is stable using `createdAt` and `_id`. The main issue is cache page-depth detection, not pagination correctness.

### Aggregate queries

`getLikers` uses `$lookup` after `$match`, `$sort`, and `$limit`, which is the right order. It is acceptable because the "who liked" modal is not the hottest path.

## Application Layer Review

The service layer is straightforward. The main performance/correctness issue is ownership of derived counters. Validation overhead from Zod is acceptable and bounded. Serialization overhead is also reasonable due to projections and lean reads.

Potential improvements:

- Add DTO functions for response shaping if payload size becomes measurable pain.
- Avoid importing unused modules such as unused loggers where present only after lint confirmation.
- Parallelize independent read operations in comment creation only after tests are added.

## Caching Review

Current cache strengths:

- Feed cache is versioned and TTL-bound.
- Post detail cache exists.
- Comment page cache exists.
- Like-state Redis sets exist with TTL.

Current cache risks:

- Comment invalidation misses page keys.
- Feed page-depth cache bound is ineffective.
- Like-state sets can represent only known liked users; negative states are not cached, so repeated negative checks hit DB for single-detail views.
- Cache fallback silently disables cache when Redis is absent; fine for dev, risky if production accidentally lacks Redis.

## Queue Review

RabbitMQ is optional and graceful. That is useful for local development, but queue-dependent work must not be both critical and best-effort.

Current queue risks:

- Like worker duplicates synchronous counter updates.
- Retry headers are read but not incremented on requeue, so retry counting may not work as intended.
- Worker and app create separate RabbitMQ connections/channels.
- Publish does not use confirms or backpressure handling.

## API Performance Review

Hot endpoints:

- `GET /api/posts/feed`
- `POST /api/likes/toggle`
- `GET /api/posts/:postId/comments`
- `POST /api/posts/:postId/comments`
- `GET /api/comments/:commentId/replies`

Strengths:

- Bounded limits.
- Compression.
- Cursor pagination.
- Private `Cache-Control` on feed.

Risks:

- Like toggle write amplification.
- Stale comment cache.
- Upload request memory pressure.
- No endpoint latency budget or measurement harness.

## Frontend Performance Review

Strengths:

- Feed uses pagination and lazy image loading for post images.
- Infinite scroll avoids manual scroll listeners by using `IntersectionObserver`.
- React Compiler is enabled.

Risks:

- Feed is fully client-rendered.
- Global template CSS is loaded for all routes.
- Many plain `<img>` tags bypass Next image optimization.
- Infinite feed state and rendered DOM grow without virtualization.
- Auth and feed pages load template assets that may not be needed for the current route.

## Infrastructure Review

Observed:

- Netlify frontend deployment config exists.
- Backend deployment/container/process manager config was not found.
- MongoDB pool is statically configured.
- Redis and RabbitMQ are optional and can silently degrade.

Recommended:

- Add backend deployment documentation with worker process topology.
- Configure environment-driven MongoDB pool sizes.
- Make production fail fast when required performance infrastructure is missing, or explicitly document degraded mode.

## Prioritized ROI Summary

| Priority | Optimization | Impact | Risk | ROI |
|---|---|---:|---:|---:|
| P0 | Fix like counter ownership/double updates | Very high | Low-medium | Very high |
| P1 | Fix comment cache invalidation | High | Low-medium | Very high |
| P1 | Correct feed cache page-bounding | Medium-high | Low | High |
| P1 | Measure and optimize frontend asset loading | High | Medium | High |
| P1 | Add upload memory guardrails | Medium-high | Low-medium | High |
| P2 | Env-driven MongoDB pool sizing | Medium | Low | Medium-high |
| P2 | Clarify RabbitMQ reliability/confirm behavior | Medium | Medium | Medium |
| P2 | Add performance instrumentation | Medium | Low | Medium |
| P2 | Bound or virtualize long feed sessions | Medium | Medium | Medium |
| P3 | Parallelize comment creation reads | Low-medium | Low | Medium |

## Measurement Gaps

No live benchmark or production telemetry was available during this audit. Expected gains are estimates from static analysis. Before and after implementation, measure:

- p50/p95/p99 latency for feed, like toggle, comments, replies, auth refresh, and upload.
- MongoDB query execution stats and index usage.
- Redis hit rate and memory usage by key prefix.
- RabbitMQ queue depth, publish failures, consumer lag, and dead-letter count.
- Next.js build output, route JS size, CSS size, LCP, CLS, INP, and image transfer size.

