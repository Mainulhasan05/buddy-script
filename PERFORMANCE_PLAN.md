# Performance Plan

Status: First batches (Phases 1 & 2, and parts of Phase 3) fully implemented and verified.  
Principle: Fix correctness and high-ROI bottlenecks first, measure before broad refactors, and preserve current API contracts unless explicitly approved.

## Phase 0: Baseline And Safety

Goal: Establish a measurable baseline before changing behavior.

Tasks:

1. Add or run lightweight endpoint timing checks for:
   - `GET /api/posts/feed`
   - `POST /api/likes/toggle`
   - `GET /api/posts/:postId/comments`
   - `POST /api/posts/:postId/comments`
   - `GET /api/comments/:commentId/replies`
2. Run MongoDB `explain('executionStats')` for feed, my posts, comments, replies, and likers on representative data.
3. Run frontend build and capture route bundle size, CSS size, and image/static asset warnings.
4. Record Redis key count/memory by prefix if Redis is available.
5. Record RabbitMQ queue depth and consumer behavior if RabbitMQ is available.

Deliverable: A short baseline section appended to this plan or a separate `PERFORMANCE_BASELINE.md`.

Risk: Low. No behavior changes.

## Phase 1: High Impact / Low Risk

### 1. Fix like counter ownership

Preferred first implementation: preserve current synchronous behavior and stop the worker from applying the same counter events.

Change options:

- Option A, lowest risk: remove like counter event publishing while keeping synchronous `$inc`.
- Option B, scalable path: remove synchronous `$inc` and make RabbitMQ worker the single counter owner, with a direct fallback only when RabbitMQ is unavailable.

Recommended for first pass: Option A.

Expected impact:

- Response time: slightly faster like toggles.
- Throughput: significantly better for like-heavy workloads.
- Memory usage: neutral.
- Database load: removes duplicate counter writes when RabbitMQ is enabled.
- Infrastructure cost: lower MongoDB write IOPS and queue traffic.

Validation:

- Add/adjust tests for like/unlike counter changes.
- Verify one like increments by exactly one with RabbitMQ enabled and disabled.
- Verify optimistic frontend behavior still works.

### 2. Fix comment cache invalidation

Recommended implementation:

- Introduce a comment cache version key per post, for example `post:{postId}:comments:version`.
- Include the version in cached comment page keys.
- Increment that version on new top-level comments.

Expected impact:

- Response time: improved cache correctness.
- Throughput: better cache hit reliability.
- Memory usage: old comment page keys expire naturally.
- Database load: reduced stale/miss churn.
- Infrastructure cost: lower Redis waste and fewer DB fallbacks.

Validation:

- Create a comment, then fetch first comments page and confirm the new comment appears immediately.
- Verify old cached page key no longer serves stale data.

### 3. Correct feed cache page-bounding

Recommended implementation:

- Cache only the first public feed page initially.
- Remove the ineffective cursor `pageNum` parsing.
- Keep `MAX_CACHED_FEED_PAGES` unused only if a future cursor-depth strategy is planned; otherwise remove it.

Expected impact:

- Response time: first page remains fast.
- Throughput: neutral to positive.
- Memory usage: lower Redis memory growth.
- Database load: slightly more DB reads for deep pages, likely acceptable due to low reuse.
- Infrastructure cost: lower Redis footprint.

Validation:

- Confirm first page caches.
- Confirm cursor pages bypass cache or follow the new explicit policy.
- Confirm feed invalidation still works through version increment.

### 4. Add production guardrails for Redis/RabbitMQ degradation

Recommended implementation:

- Keep optional fallback in development.
- Add clear startup warnings or fail-fast behavior in production when required infrastructure is missing.
- Document which features are degraded when Redis/RabbitMQ are absent.

Expected impact:

- Response time: avoids accidental no-cache production mode.
- Throughput: protects production capacity.
- Memory usage: neutral.
- Database load: prevents unexpected cache-miss load.
- Infrastructure cost: prevents emergency scale-up caused by misconfiguration.

Validation:

- Start app in development without Redis/RabbitMQ and confirm graceful mode.
- Start app in production-like config with missing required services and confirm intended behavior.

## Phase 2: High Impact / Medium Risk

### 5. Frontend asset and render optimization

Recommended implementation order:

1. Run `npm run build` in `social-media-frontend`.
2. Add a bundle analyzer or use Next build output to identify heavy routes/assets.
3. Configure `next/image` remote patterns for Cloudinary and any trusted avatar host.
4. Convert high-impact feed/auth images from `<img>` to `next/image` where dimensions are known.
5. Split or prune global template CSS after verifying visual parity.
6. Consider dynamic imports for rarely opened modals such as create post and like list.

Expected impact:

- Response time: faster route load and LCP.
- Throughput: lower network transfer.
- Memory usage: lower browser layout/style work.
- Database load: neutral.
- Infrastructure cost: lower bandwidth.

Validation:

- Compare build output before/after.
- Capture Lighthouse or Web Vitals for login and feed.
- Manually verify auth, feed, modal, and dark-mode UI.

### 6. Upload memory pressure reduction

Recommended implementation order:

1. Add upload timing and memory logging in staging.
2. Add request timeout/backpressure controls if absent at deployment level.
3. Evaluate direct streaming to Cloudinary without retaining full buffers.
4. If keeping memory storage, lower file limit or enforce stricter concurrent upload limits per process.

Expected impact:

- Response time: better under upload bursts.
- Throughput: more stable.
- Memory usage: significantly lower under concurrent uploads if streaming is implemented.
- Database load: neutral.
- Infrastructure cost: fewer memory-driven scale-ups.

Validation:

- Test valid JPEG/PNG/WebP upload.
- Test invalid MIME and spoofed magic bytes.
- Test file-size limit.
- Compare process memory during concurrent upload simulation.

### 7. Environment-driven MongoDB pool tuning

Recommended implementation:

- Add `MONGO_MAX_POOL_SIZE` and `MONGO_MIN_POOL_SIZE` env vars.
- Use conservative defaults, for example min 0-2 and max 20-50 depending on deployment.
- Document sizing formula based on app instance count and Atlas tier.

Expected impact:

- Response time: more predictable under scale.
- Throughput: neutral to positive if current pool pressure is harmful.
- Memory usage: lower idle connection memory.
- Database load: lower connection overhead.
- Infrastructure cost: lower risk of Atlas connection-tier pressure.

Validation:

- Confirm local startup with defaults.
- Confirm env overrides are parsed.
- Verify connection count in MongoDB metrics.

## Phase 3: Everything Else

### 8. RabbitMQ reliability hardening

Tasks:

- Use confirm channels for critical events if queues remain responsible for derived state.
- Handle publish backpressure.
- Fix retry metadata so retry counts are actually incremented.
- Add dead-letter queue monitoring/documentation.

Risk: Medium.

### 9. Feed memory and render control

Tasks:

- Memoize expensive post row work where useful.
- Consider list virtualization or max retained page windows after measuring real session length.
- Consider dynamic import for comments section if it is heavy.

Risk: Medium because scroll behavior can regress.

### 10. Auth token collection hygiene

Tasks:

- Add max active sessions per user if product agrees.
- Delete oldest tokens for a user after issuing a new token beyond the cap.
- Keep TTL cleanup.

Risk: Medium because session semantics change.

### 11. Comment write latency cleanup

Tasks:

- Parallelize independent `Post.findOne` and `User.findById` reads in `addComment`.
- Parallelize independent parent validation and user snapshot fetch in `addReply` only where safe.

Risk: Low.

## Proposed First Implementation Batch

After approval, implement only this batch first:

1. Stop duplicate like counter updates while preserving existing API response behavior.
2. Fix comment cache invalidation with versioned keys.
3. Correct feed cache page-bounding.
4. Add focused tests or lightweight verification scripts for those paths.
5. Re-measure the affected endpoints.

This batch is the best ROI because it addresses correctness, database write load, cache correctness, and Redis memory behavior without broad frontend or infrastructure refactors.

## Approval Gate

No refactoring has been started. Implementation should begin only after explicit approval of the first batch or a revised priority order.

