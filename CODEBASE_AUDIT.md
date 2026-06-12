# CODEBASE AUDIT — Phase 0

> **Application**: Buddy Script Social Media Platform  
> **Target Scale**: 1M active users, high read/write concurrency  
> **Audit Date**: 2026-06-12  
> **Status**: Complete — awaiting review before Phase 1

---

## Technology Stack Summary

| Layer | Technology | Version |
|---|---|---|
| Runtime | Node.js | ≥18.0.0 |
| Framework | Express | 4.21.2 |
| Database | MongoDB (via Mongoose) | 8.9.5 |
| Cache | Redis (via ioredis) | 5.4.2 |
| Message Queue | RabbitMQ (via amqplib) | 0.10.4 |
| Auth | JWT (jsonwebtoken) | 9.0.2 |
| Password Hashing | bcryptjs | 2.4.3 |
| File Upload | Multer → Cloudinary | 1.4.5/2.5.1 |
| Validation | Zod | 3.24.1 |
| Security | Helmet, express-mongo-sanitize, express-rate-limit, CORS | Various |
| Logging | Winston + Morgan | 3.17.0 / 1.10.0 |
| Frontend | Next.js 16 + React 19 + Redux Toolkit + Axios | — |

---

## Section 1: MongoDB Schema Review

### 1.1 `users` Collection

**File**: [User.model.js](file:///d:/AppifyLab/project/social-media-backend/src/models/User.model.js)

| Field | Type | Constraints |
|---|---|---|
| `firstName` | String | required, trim, max 50 |
| `lastName` | String | required, trim, max 50 |
| `email` | String | required, unique, lowercase, trim |
| `passwordHash` | String | required, `select: false` |
| `avatar.url` | String | default null |
| `avatar.publicId` | String | default null |
| `isActive` | Boolean | default true |
| `createdAt` | Date | auto (timestamps) |
| `updatedAt` | Date | auto (timestamps) |

**Existing Indexes**:
- `{ email: 1 }` — unique (auto-created by `unique: true`)
- `{ createdAt: -1 }` — admin/sort

**Query Patterns Hitting This Collection**:
| Query | Location | Index Coverage |
|---|---|---|
| `User.findOne({ email })` | auth.service.js:58 (register) | ✅ `{ email: 1 }` unique |
| `User.findByEmail(email)` → `findOne({ email }).select('+passwordHash')` | auth.service.js:92 (login) | ✅ `{ email: 1 }` unique |
| `User.findById(userId)` | auth.service.js:153, post.service.js:19, comment.service.js:13 | ✅ `{ _id: 1 }` default |
| `User.estimatedDocumentCount()` | auth.service.js:47 | ✅ metadata scan |

**Missing Indexes**: None for current queries.

**Unbounded Arrays**: None — schema is flat.

**Document Bloat Risk**: Low — fields are all bounded scalars.

---

### 1.2 `posts` Collection

**File**: [Post.model.js](file:///d:/AppifyLab/project/social-media-backend/src/models/Post.model.js)

| Field | Type | Constraints |
|---|---|---|
| `author._id` | ObjectId (ref User) | required |
| `author.firstName` | String | required |
| `author.lastName` | String | required |
| `author.avatarUrl` | String | default null |
| `content` | String | required, max 2000, trim |
| `image.url` | String | default null |
| `image.publicId` | String | default null |
| `image.width` | Number | default null |
| `image.height` | Number | default null |
| `visibility` | String | enum ['public', 'private'], default 'public' |
| `likeCount` | Number | default 0, min 0 |
| `commentCount` | Number | default 0, min 0 |
| `isDeleted` | Boolean | default false |
| `createdAt` | Date | auto |
| `updatedAt` | Date | auto |

**Existing Indexes**:
- `{ visibility: 1, isDeleted: 1, createdAt: -1 }` — public feed
- `{ 'author._id': 1, visibility: 1, createdAt: -1 }` — user's own posts
- `{ createdAt: -1, _id: -1 }` — cursor pagination
- `{ isDeleted: 1, visibility: 1, _id: -1 }` — compound cursor fallback

**Query Patterns**:
| Query | Location | Index Coverage |
|---|---|---|
| `Post.find({ visibility: 'public', isDeleted: false, ...cursor }).sort({ createdAt: -1, _id: -1 }).limit(N)` | post.service.js:67-74 (getFeed) | ⚠️ Partial — cursor `$or` may not use optimal index |
| `Post.findOne({ _id: postId, isDeleted: false })` | post.service.js:115 (getPost) | ✅ `{ _id: 1 }` default |
| `Post.findOne({ _id: postId, isDeleted: false })` | post.service.js:149 (deletePost) | ✅ `{ _id: 1 }` default |
| `Post.find({ 'author._id': userId, isDeleted: false, ...cursor }).sort({ createdAt: -1, _id: -1 }).limit(N)` | post.service.js:181-188 (getMyPosts) | ⚠️ Missing `isDeleted` in index prefix |
| `Post.updateOne({ _id }, { $inc: { commentCount: 1 } })` | comment.service.js:59 | ✅ `{ _id: 1 }` default |
| `Post.findOne({ _id: postId, isDeleted: false }).lean()` | comment.service.js:32 | ✅ `{ _id: 1 }` default |

**Missing Indexes**:
- The feed query uses `{ visibility: 'public', isDeleted: false }` + sort `{ createdAt: -1, _id: -1 }` with a cursor `$or` condition. The `$or` disrupts index usage on `{ visibility, isDeleted, createdAt }` — the sort fields `{ createdAt, _id }` are only partially covered.
- `getMyPosts` filters on `{ 'author._id', isDeleted: false }` but the index is `{ 'author._id', visibility, createdAt }` — `isDeleted` is not covered in prefix, requiring in-memory filter.

**Unbounded Arrays**: None — arrays removed; denormalized counters used instead. ✅

**Document Bloat Risk**: Low — author is a small snapshot, content capped at 2000 chars.

> [!NOTE]
> The `isDeleted: Boolean` approach (vs `deletedAt: Date`) limits soft-delete to a boolean toggle with no timestamp — cannot answer "when was this deleted?" for admin purposes.

---

### 1.3 `comments` Collection

**File**: [Comment.model.js](file:///d:/AppifyLab/project/social-media-backend/src/models/Comment.model.js)

| Field | Type | Constraints |
|---|---|---|
| `postId` | ObjectId (ref Post) | required |
| `parentId` | ObjectId (ref Comment) | default null |
| `depth` | Number | enum [0, 1], required, default 0 |
| `author._id` | ObjectId (ref User) | required |
| `author.firstName` | String | required |
| `author.lastName` | String | required |
| `author.avatarUrl` | String | default null |
| `content` | String | required, max 1000, trim |
| `likeCount` | Number | default 0, min 0 |
| `replyCount` | Number | default 0, min 0 |
| `isDeleted` | Boolean | default false |
| `createdAt` | Date | auto |
| `updatedAt` | Date | auto |

**Existing Indexes**:
- `{ postId: 1, parentId: 1, createdAt: 1 }` — fetch top-level comments or replies
- `{ postId: 1, depth: 1, createdAt: 1 }` — filter by depth
- `{ 'author._id': 1 }` — user's comments

**Query Patterns**:
| Query | Location | Index Coverage |
|---|---|---|
| `Comment.find({ postId, parentId: null, isDeleted: false, ...cursor }).sort({ createdAt: 1, _id: 1 }).limit(N)` | comment.service.js:124-132 (getComments) | ⚠️ Index `{ postId, parentId, createdAt }` — but `isDeleted` not in index |
| `Comment.find({ parentId: commentId, isDeleted: false, ...cursor }).sort({ createdAt: 1, _id: 1 }).limit(N)` | comment.service.js:167-174 (getReplies) | ⚠️ No leading field — `parentId` alone is not the first field in any index |
| `Comment.findOne({ _id: commentId, isDeleted: false })` | comment.service.js:72 (addReply) | ✅ `{ _id: 1 }` default |
| `Comment.updateOne({ _id }, { $inc: { replyCount: 1 } })` | comment.service.js:105 | ✅ `{ _id: 1 }` default |

**Missing Indexes**:
- `getReplies` queries `{ parentId: commentId, isDeleted: false }` — the index `{ postId, parentId, createdAt }` requires `postId` as prefix, so querying by `parentId` alone does a collection scan on that index unless MongoDB can use the second field (it cannot for an equality match on a non-prefix field).
- `isDeleted` filtering is not covered by any comment index — must be filtered in-memory after index scan.

**Unbounded Arrays**: None. ✅

---

### 1.4 `likes` Collection

**File**: [Like.model.js](file:///d:/AppifyLab/project/social-media-backend/src/models/Like.model.js)

| Field | Type | Constraints |
|---|---|---|
| `userId` | ObjectId (ref User) | required |
| `targetId` | ObjectId | required |
| `targetType` | String | enum ['post', 'comment'], required |
| `createdAt` | Date | auto |

**Existing Indexes**:
- `{ userId: 1, targetId: 1, targetType: 1 }` — unique (prevents duplicate likes) ✅
- `{ targetId: 1, targetType: 1, createdAt: -1 }` — "Who liked" query ✅
- `{ userId: 1, targetType: 1, createdAt: -1 }` — user's like history ✅

**Query Patterns**:
| Query | Location | Index Coverage |
|---|---|---|
| `Like.findOne({ userId, targetId, targetType })` | like.service.js:17 (toggle) | ✅ unique index |
| `Like.create({ userId, targetId, targetType })` | like.service.js:31 | ✅ |
| `Like.deleteOne({ _id })` | like.service.js:24 | ✅ `{ _id: 1 }` default |
| `Like.countDocuments({ targetId, targetType })` | like.service.js:39 | ✅ `{ targetId, targetType, createdAt }` |
| `Like.exists({ userId, targetId, targetType })` | like.service.js:113 (getLikeState) | ✅ unique index |
| `Like.aggregate([{ $match: { targetId, targetType } }, ...])` | like.service.js:62-87 (getLikers) | ✅ `{ targetId, targetType, createdAt }` |

**Missing Indexes**: None.

**Unbounded Arrays**: None — each like is a separate document. ✅

---

### 1.5 `refresh_tokens` Collection

**File**: [RefreshToken.model.js](file:///d:/AppifyLab/project/social-media-backend/src/models/RefreshToken.model.js)

| Field | Type | Constraints |
|---|---|---|
| `userId` | ObjectId (ref User) | required |
| `token` | String | required, unique (stores hash) |
| `expiresAt` | Date | required |
| `userAgent` | String | default null |
| `ip` | String | default null |
| `createdAt` | Date | auto |

**Existing Indexes**:
- `{ token: 1 }` — unique (auto from `unique: true`)
- `{ expiresAt: 1 }` — TTL index (auto-purge expired)
- `{ userId: 1 }` — revoke all user tokens

**Query Patterns**:
| Query | Location | Index Coverage |
|---|---|---|
| `RefreshToken.create({ userId, token: hash, ... })` | auth.service.js:32-38 | ✅ |
| `RefreshToken.findOne({ token: hash })` | auth.service.js:142 | ✅ unique index |
| `RefreshToken.deleteOne({ _id })` | auth.service.js:151 | ✅ `{ _id: 1 }` default |
| `RefreshToken.deleteOne({ token: hash })` | auth.service.js:176 | ✅ unique index |

**Missing Indexes**: None.

> [!WARNING]
> The field name `token` stores a hash (not plaintext), which is correct. However, the schema field name is misleading — `tokenHash` would be clearer and safer against future developer confusion.

---

## Section 2: Query Analysis

### 2.1 Feed Query (HOT PATH — called on every page load/scroll)

**Location**: [post.service.js:67-74](file:///d:/AppifyLab/project/social-media-backend/src/services/post.service.js#L67-L74)

```javascript
Post.find({
  ...cursorQuery,             // $or: [{ createdAt: { $lt } }, { createdAt, _id: { $lt } }]
  visibility: 'public',
  isDeleted: false,
})
  .sort({ createdAt: -1, _id: -1 })
  .limit(limit + 1)
  .lean()
```

| Aspect | Assessment |
|---|---|
| Index coverage | ⚠️ **Partial** — the `$or` cursor condition disrupts the compound index `{ visibility, isDeleted, createdAt }`. MongoDB may fall back to `{ createdAt: -1, _id: -1 }` and filter `visibility`/`isDeleted` in-memory. |
| Full collection scan | No — at minimum uses `{ createdAt, _id }` index |
| Projection | ❌ **Missing** — returns full documents via `.lean()` with no `.select()` |
| Over-fetching | ❌ Yes — returns `image.publicId`, `updatedAt`, `__v`, `author` sub-fields not needed by card |
| `.populate()` | ✅ None — author is denormalized |
| Hot path | 🔥 **Yes** — every feed load and infinite scroll |

### 2.2 isLiked Per-Post Query (N+1 — HOT PATH)

**Location**: [post.service.js:87-97](file:///d:/AppifyLab/project/social-media-backend/src/services/post.service.js#L87-L97)

```javascript
result.posts.map(async (post) => {
  const isLiked = await likeService.getLikeState({
    userId, targetId: post._id, targetType: 'post',
  });
  return { ...post, isLiked };
})
```

| Aspect | Assessment |
|---|---|
| Index coverage | ✅ Each individual `Like.exists()` uses the unique compound index |
| N+1 problem | ❌ **YES** — 20 posts = 20 separate `Like.exists()` queries (+ 20 Redis SISMEMBER calls) |
| Impact at scale | 🔴 **Critical** — at 20 posts per page, this is 20 extra DB round trips per feed load |

### 2.3 Like Toggle (WRITE PATH)

**Location**: [like.service.js:16-41](file:///d:/AppifyLab/project/social-media-backend/src/services/like.service.js#L16-L41)

```javascript
const existing = await Like.findOne({ userId, targetId, targetType });
if (existing) {
  await Like.deleteOne({ _id: existing._id });
} else {
  await Like.create({ userId, targetId, targetType });
}
const likeCount = await Like.countDocuments({ targetId, targetType });
```

| Aspect | Assessment |
|---|---|
| Index coverage | ✅ Uses unique compound index |
| Race condition | ❌ **Yes** — read-then-write pattern. Two concurrent unlike requests can both find the same like and both delete it, but only one decrement occurs. Two concurrent like requests can both find no existing like, both attempt create, one gets duplicate key error (unhandled). |
| `countDocuments()` in hot path | ⚠️ Questionable — `likeCount` is already denormalized on the post. This is an extra query to get the "real" count instead of using the counter. |
| Atomic alternative | Should use `findOneAndDelete` / `findOneAndUpdate` with `upsert` instead |

### 2.4 Comment Count Increment (DOUBLE INCREMENT)

**Location**: [comment.service.js:52-59](file:///d:/AppifyLab/project/social-media-backend/src/services/comment.service.js#L52-L59)

```javascript
publish(ROUTING_KEYS.COMMENT_CREATED, { postId, commentId, delta: 1 });
await Post.updateOne({ _id: postId }, { $inc: { commentCount: 1 } });
```

| Aspect | Assessment |
|---|---|
| Double counting | ⚠️ **Potential** — when RabbitMQ is connected, both the synchronous `$inc` AND the worker may process the event, leading to double-increment. However, checking the [like.worker.js](file:///d:/AppifyLab/project/social-media-backend/src/workers/like.worker.js) — the worker only handles `like.created` and `like.deleted` routing keys, NOT `comment.created`. So this is safe currently, but the architecture is confusing — there's no comment counter worker, so the RabbitMQ publish for comments is a no-op. |

### 2.5 Single Post Lookup

**Location**: [post.service.js:115](file:///d:/AppifyLab/project/social-media-backend/src/services/post.service.js#L115)

```javascript
Post.findOne({ _id: postId, isDeleted: false }).lean()
```

| Aspect | Assessment |
|---|---|
| Index coverage | ✅ `{ _id: 1 }` default — `isDeleted` filtered in-memory (acceptable for single doc) |
| Projection | ❌ **Missing** — returns full document |
| Over-fetching | ⚠️ Returns `image.publicId`, internal fields |

### 2.6 User Lookup for Author Snapshot

**Location**: [post.service.js:19](file:///d:/AppifyLab/project/social-media-backend/src/services/post.service.js#L19), [comment.service.js:13](file:///d:/AppifyLab/project/social-media-backend/src/services/comment.service.js#L13)

```javascript
User.findById(userId).lean()
```

| Aspect | Assessment |
|---|---|
| Index coverage | ✅ `{ _id: 1 }` default |
| Projection | ❌ **Missing** — fetches full user doc when only `firstName`, `lastName`, `avatar.url` needed |

### 2.7 Comments for a Post

**Location**: [comment.service.js:124-132](file:///d:/AppifyLab/project/social-media-backend/src/services/comment.service.js#L124-L132)

```javascript
Comment.find({ ...cursorQuery, postId, parentId: null, isDeleted: false })
  .sort({ createdAt: 1, _id: 1 })
  .limit(limit + 1)
  .lean()
```

| Aspect | Assessment |
|---|---|
| Index coverage | ⚠️ `{ postId, parentId, createdAt }` covers equality on `postId` + `parentId` + sort on `createdAt`, but `isDeleted` and `_id` sort are not covered |
| Projection | ❌ **Missing** |
| N+1 for isLiked | ❌ Same N+1 pattern as feed — per-comment `getLikeState()` call |

### 2.8 Replies for a Comment

**Location**: [comment.service.js:167-174](file:///d:/AppifyLab/project/social-media-backend/src/services/comment.service.js#L167-L174)

```javascript
Comment.find({ ...cursorQuery, parentId: commentId, isDeleted: false })
  .sort({ createdAt: 1, _id: 1 })
  .limit(limit + 1)
  .lean()
```

| Aspect | Assessment |
|---|---|
| Index coverage | ❌ **COLLSCAN risk** — no index has `parentId` as first field. The index `{ postId, parentId, createdAt }` requires `postId` as prefix. |
| Projection | ❌ **Missing** |
| N+1 for isLiked | ❌ Same N+1 pattern |

---

## Section 3: N+1 Query Detection

> [!CAUTION]
> **Three critical N+1 patterns found** — all in hot read paths.

### N+1 #1: Feed isLiked (post.service.js:87-97)

```javascript
const postsWithLikes = await Promise.all(
  result.posts.map(async (post) => {
    const isLiked = await likeService.getLikeState({ userId, targetId: post._id, targetType: 'post' });
    return { ...post, isLiked };
  })
);
```

**Impact**: 20 posts per page → 20 `Like.exists()` queries (even with Redis SISMEMBER, it's 20 individual calls).

**Fix**: Replace with a single `Like.find({ userId, targetId: { $in: postIds }, targetType: 'post' }).select('targetId')`, then build a `Set` and map.

### N+1 #2: My Posts isLiked (post.service.js:195-204)

Identical pattern to N+1 #1, applied to the user's own posts feed.

### N+1 #3: Comments isLiked (comment.service.js:143-155)

Identical pattern — per-comment `getLikeState()` call.

### N+1 #4: Replies isLiked (comment.service.js:182-193)

Identical pattern — per-reply `getLikeState()` call.

---

## Section 4: Schema Design Problems

### 4.1 Soft Delete Uses Boolean Instead of Date

**Problem**: `isDeleted: Boolean` on Posts and Comments provides no audit trail (when? by whom?).

**Impact**: Cannot support admin features like "show recently deleted", time-based retention policies, or legal compliance (GDPR data retention windows).

**Risk at Scale**: Low risk functionally, but limits future admin tooling.

**Recommendation**: Change to `deletedAt: Date | null` with partial index.

### 4.2 No Projection on Any Query

**Problem**: Every `.find()`, `.findOne()`, and `.lean()` call returns ALL fields. No query in the entire codebase uses `.select()` or `{ projection }`.

**Impact at Scale**: 
- Feed returns `image.publicId` (internal Cloudinary ID — security leak)
- Feed returns `updatedAt`, `__v`, full `author` object when only name/avatar needed
- Increased bandwidth and memory usage per request
- At 1M users × 20 posts per feed load, even 500 extra bytes per post = 10GB/day extra bandwidth

### 4.3 Author Snapshot Staleness

**Problem**: Author data (firstName, lastName, avatarUrl) is denormalized into every Post and Comment. When a user changes their name or avatar, all their historical posts/comments show stale data.

**Impact**: Not a correctness issue for the current app (no profile edit endpoint exists), but will become one if profile editing is added.

**Mitigation**: This is an acceptable trade-off for read performance. When profile editing is added, a background migration job should update all snapshots.

### 4.4 No Compound Index for `deletedAt`/`isDeleted` Filtering

**Problem**: `isDeleted: false` is part of every query filter, but no index includes it in a useful compound position. A standalone `{ isDeleted: 1 }` index would be low-cardinality (only `true`/`false`) and nearly useless.

**Recommendation**: Use `{ isDeleted: 1 }` as a partial filter expression component in compound indexes, not as a standalone index.

---

## Section 5: Security Vulnerabilities

### 5.1 NoSQL Injection — Partially Mitigated ✅

**Current Protection**: `express-mongo-sanitize` middleware strips `$` and `.` keys from `req.body`, `req.query`, `req.params`.

**Remaining Risk**: 
- ⚠️ The middleware strips keys but does not validate types. A string field receiving an empty object `{}` would pass through after stripping — Zod validation catches this for validated routes.
- ✅ All auth and mutation routes have Zod validation enforcing string types.
- ⚠️ `GET /likes/:targetType/:targetId` (getLikers) — `targetType` and `targetId` from `req.params` are passed directly to the aggregation `$match` without explicit type validation (no Zod schema for query params).

### 5.2 JWT Configuration — Minor Weaknesses

**Current Implementation** ([jwt.util.js](file:///d:/AppifyLab/project/social-media-backend/src/utils/jwt.util.js)):

| Aspect | Status |
|---|---|
| Algorithm | ⚠️ **Not explicitly set** — `jwt.sign(payload, secret, { expiresIn })` defaults to `HS256`, which is correct, but `algorithm: 'HS256'` should be explicit |
| Verify algorithm enforcement | ❌ **Missing** — `jwt.verify(token, secret)` without `{ algorithms: ['HS256'] }` is vulnerable to algorithm confusion attacks (attacker sends `alg: 'none'` or `alg: 'HS384'`) |
| Access token expiry | ✅ 15m (configurable via env) |
| Refresh token expiry | ✅ 7d (configurable via env) |
| Secret length validation | ✅ Zod enforces min 32 chars |
| Separate access/refresh secrets | ✅ Different env vars |
| Token hash storage | ✅ SHA-256 hash stored, not plaintext |

> [!WARNING]
> **Algorithm confusion vulnerability**: `jwt.verify()` is called without specifying `algorithms`, allowing an attacker to potentially forge tokens with `alg: 'none'`.

### 5.3 Missing Authorization Checks

| Endpoint | Issue |
|---|---|
| `POST /auth/refresh` | ⚠️ No auth middleware — by design (uses cookie), but no rate limiting specific to refresh |
| `POST /auth/logout` | ⚠️ No auth middleware — by design (idempotent), acceptable |
| `GET /likes/:targetType/:targetId` | ✅ Protected by `authenticate` middleware |
| `DELETE /posts/:postId` | ✅ Ownership check in service layer |

**Ownership Check Method**: `post.author._id.toString() !== userId` — ⚠️ Uses string comparison instead of `.equals()` for ObjectId. Currently works because `userId` comes from JWT as string, but fragile.

### 5.4 Sensitive Data Exposure

| Issue | Location | Severity |
|---|---|---|
| `image.publicId` returned in API response | All post endpoints | ⚠️ Medium — Cloudinary internal ID leaked to client |
| `__v` (version key) in responses | All `.lean()` calls | Low — minor info leak |
| `updatedAt` unnecessary in responses | All endpoints | Low |
| Password hash excluded | ✅ `select: false` on schema | ✅ Safe |
| Refresh token in httpOnly cookie only | ✅ Not in JSON body | ✅ Safe |
| Access token returned in JSON body | ✅ By design (stored in memory on frontend) | ✅ Acceptable |

### 5.5 File Upload Validation Gaps

**Current Implementation** ([upload.middleware.js](file:///d:/AppifyLab/project/social-media-backend/src/middlewares/upload.middleware.js)):

| Check | Status |
|---|---|
| MIME type filter | ⚠️ **Trusts Content-Type header** — `file.mimetype` comes from the client-provided Content-Type, NOT from magic byte inspection. An attacker can upload a PHP file with `.php` extension and set Content-Type to `image/jpeg`. |
| File size limit | ✅ 5MB enforced in multer `limits` |
| Filename sanitization | ✅ N/A — uploads go to Cloudinary which generates its own key |
| GIF not allowed | ℹ️ Only jpeg, png, webp — GIF is excluded (may be intentional) |
| Magic byte validation | ❌ **Missing** — no `file-type` or similar library to validate actual file content |

> [!CAUTION]
> MIME type validation relies entirely on the `Content-Type` header, which is attacker-controlled. Must validate magic bytes of the file buffer.

### 5.6 Rate Limiting Gaps

**Current Implementation**:

| Layer | Config | Issue |
|---|---|---|
| Global | 100 req / 15 min / IP | ⚠️ **Too restrictive** — legitimate browsing will hit this quickly (feed loads + comment loads + like toggles). At 100 req/15 min, a user scrolling the feed would exhaust their budget in ~2 minutes. |
| Auth (login + register) | 5 req / 15 min / IP (same limiter) | ⚠️ **Too strict for login** — 5 attempts in 15 min includes BOTH register AND login. A user who fails login 4 times cannot even register. |
| Post creation | ❌ **None** |
| Comment creation | ❌ **None** |
| Like toggling | ❌ **None** |
| File upload | ❌ **None** |
| Rate limiter backend | ❌ **In-memory** — not shared across server instances. Useless in clustered/multi-instance deployment. |
| Retry-After header | ✅ Via `standardHeaders: true` |
| Per-user rate limiting | ❌ **None** — all limits are per-IP only |
| Account lockout on failed logins | ❌ **Not implemented** |

### 5.7 Security Headers

**Current**: `helmet()` with defaults. ✅ Good baseline.

**Missing explicit config**:
- CSP not explicitly configured (helmet defaults to very permissive)
- `X-Powered-By` — helmet removes it by default ✅
- HSTS — helmet sets it by default ✅
- `Permissions-Policy` — ❌ not set by default helmet

### 5.8 CORS Configuration

**Current** ([app.js:21-28](file:///d:/AppifyLab/project/social-media-backend/src/app.js#L21-L28)):

```javascript
cors({
  origin: env.CLIENT_URL,     // 'http://localhost:3000' in dev
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
})
```

| Aspect | Status |
|---|---|
| Origin whitelist | ✅ Single configured origin (not wildcard) |
| Credentials | ✅ `credentials: true` for httpOnly cookie |
| Methods | ✅ Specific list |
| Multiple origins support | ❌ Only one origin — needs array support for staging/production |

### 5.9 Secrets and Environment

| Check | Status |
|---|---|
| `.env` in `.gitignore` | ✅ Present in both root and backend `.gitignore` |
| `.env.example` committed | ✅ With placeholder values |
| Env validation on startup | ✅ Zod schema validates and crashes with clear error |
| MongoDB URI contains credentials | ⚠️ **Yes** — real credentials visible in `.env` file (expected for dev, but `.env` must never reach production as-is) |
| JWT secrets in dev .env | ⚠️ Weak dev secrets (`bscript_dev_access_secret_key_32chars_long!!`) — acceptable for dev, must be random in production |
| Env var for `NODE_ENV` validated | ✅ Enum: development, production, test |
| Missing `JWT_REFRESH_SECRET ≠ JWT_ACCESS_SECRET` validation | ❌ Not enforced — same secret for both would weaken security |

---

## Section 6: Connection and Infrastructure

### 6.1 MongoDB Connection Pool

**Current** ([db.js:5-9](file:///d:/AppifyLab/project/social-media-backend/src/config/db.js#L5-L9)):

```javascript
const MONGO_OPTIONS = {
  maxPoolSize: 10,
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 45000,
};
```

| Setting | Current | Recommended (1M users) | Issue |
|---|---|---|---|
| `maxPoolSize` | **10** | 50–100 | ❌ **Critically low** — 10 concurrent connections is a bottleneck. At 1M users with even 1% concurrency, 10K concurrent requests compete for 10 connections. |
| `minPoolSize` | **0** (default) | 10 | ❌ Cold start penalty — connections are created on demand |
| `socketTimeoutMS` | 45000 | 45000 | ✅ |
| `serverSelectionTimeoutMS` | 5000 | 5000 | ✅ |
| `retryWrites` | **Not set** | `true` | ⚠️ Missing — should be explicit |
| `w` (write concern) | **Not set** | `'majority'` | ⚠️ Missing — defaults to `w: 1`, which can lose data on replica set failover |
| `heartbeatFrequencyMS` | **Not set** | 10000 | ⚠️ Missing |

### 6.2 Connection Event Handling

**Current**: ✅ Handlers exist for `disconnected`, `reconnected`, and `error` events.

**Missing**: 
- ❌ No `mongoose.connection.on('connected')` handler (minor)
- ⚠️ The `isConnected` flag is managed manually — not needed with Mongoose 8's built-in connection state management

### 6.3 Graceful Shutdown

**Current** ([server.js:44-51](file:///d:/AppifyLab/project/social-media-backend/src/server.js#L44-L51)):

```javascript
const shutdown = async (signal) => {
  logger.info(`${signal} received — shutting down gracefully`);
  process.exit(0);
};
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
```

> [!CAUTION]
> **Graceful shutdown is incomplete.** The handler calls `process.exit(0)` immediately without:
> 1. Stopping the HTTP server from accepting new connections (`server.close()`)
> 2. Waiting for in-flight requests to complete
> 3. Closing the MongoDB connection (`mongoose.connection.close()`)
> 4. Closing Redis connection
> 5. Closing RabbitMQ connection
> 
> This can cause data corruption — in-flight writes to MongoDB may be interrupted mid-operation.

### 6.4 Unhandled Promise Rejections and Uncaught Exceptions

**Current**: Winston logger has `exceptionHandlers` and `rejectionHandlers` configured to log to files. ✅

**Missing**:
- ❌ No explicit `process.on('unhandledRejection')` handler with process exit
- ❌ No explicit `process.on('uncaughtException')` handler
- The Winston handlers only log — they don't trigger a graceful shutdown

### 6.5 Redis Connection — Graceful Degradation

**Current**: ✅ Well-implemented noop fallback when Redis is not configured. App works without Redis.

**Missing**: 
- ⚠️ Redis instance is exported as a mutable module-level variable. If Redis connection fails after initial connect, the fallback to `createNoopRedis()` replaces the local variable but callers that already imported `redis` still hold the broken reference.

### 6.6 RabbitMQ — Graceful Degradation

**Current**: ✅ Well-implemented. `publish()` silently drops events if not connected. Workers only start if `RABBITMQ_URL` is set.

**Missing**:
- ⚠️ Like worker creates its own connection (separate from the shared `rabbitmq.js` connection) — 2 connections total when workers are active. Minor resource waste.

---

## API Endpoint Summary

| Method | Route | Auth | Validation | Rate Limit |
|---|---|---|---|---|
| `POST` | `/api/auth/register` | ❌ | ✅ Zod | ✅ 5/15min |
| `POST` | `/api/auth/login` | ❌ | ✅ Zod | ✅ 5/15min |
| `POST` | `/api/auth/refresh` | ❌ (cookie) | ❌ | ❌ None specific |
| `POST` | `/api/auth/logout` | ❌ | ❌ | ❌ Global only |
| `GET` | `/api/auth/me` | ✅ | ❌ | ❌ Global only |
| `GET` | `/api/posts/feed` | ✅ | ❌ | ❌ Global only |
| `GET` | `/api/posts/my` | ✅ | ❌ | ❌ Global only |
| `POST` | `/api/posts` | ✅ | ✅ Zod + Multer | ❌ None specific |
| `GET` | `/api/posts/:postId` | ✅ | ❌ | ❌ Global only |
| `DELETE` | `/api/posts/:postId` | ✅ | ❌ | ❌ Global only |
| `GET` | `/api/posts/:postId/comments` | ✅ | ❌ | ❌ Global only |
| `POST` | `/api/posts/:postId/comments` | ✅ | ✅ Zod | ❌ None specific |
| `GET` | `/api/comments/:commentId/replies` | ✅ | ❌ | ❌ Global only |
| `POST` | `/api/comments/:commentId/replies` | ✅ | ✅ Zod | ❌ None specific |
| `POST` | `/api/likes/toggle` | ✅ | ✅ Zod | ❌ None specific |
| `GET` | `/api/likes/:targetType/:targetId` | ✅ | ❌ | ❌ Global only |
| `GET` | `/health` | ❌ | ❌ | ❌ None |
| `GET` | `/api/health` | ❌ | ❌ | ❌ Global only |

---

## Frontend Security Posture

### Token Storage

| Token | Storage | Secure? |
|---|---|---|
| Access token | Redux store (JavaScript memory) | ✅ Correct — not persisted to localStorage |
| Refresh token | httpOnly, Secure, SameSite=Strict cookie | ✅ Correct |

### Silent Refresh Flow

✅ Well-implemented in [axiosInstance.js](file:///d:/AppifyLab/project/social-media-frontend/src/api/axiosInstance.js):
- Intercepts 401 responses
- Queues concurrent requests during refresh
- Redirects to login on refresh failure
- Does NOT attempt refresh on auth endpoints (prevents loops)

### Client-Side Sensitive Data

- ⚠️ `image.publicId` from Cloudinary is visible in API responses but not used by the frontend — unnecessary exposure
- ✅ No password hash, no refresh tokens in Redux state
- ✅ No sensitive data in localStorage

---

## Summary of Critical Findings

| # | Finding | Severity | Category |
|---|---|---|---|
| 1 | **N+1 query on feed isLiked** — 20 individual queries per page load | 🔴 Critical | Performance |
| 2 | **Connection pool maxPoolSize=10** — bottleneck at scale | 🔴 Critical | Infrastructure |
| 3 | **Graceful shutdown not implemented** — data corruption risk | 🔴 Critical | Infrastructure |
| 4 | **JWT algorithm not enforced in verify** — algorithm confusion attack | 🟠 High | Security |
| 5 | **MIME type validation trusts Content-Type header** — bypass possible | 🟠 High | Security |
| 6 | **Like toggle race condition** — read-then-write pattern | 🟠 High | Data integrity |
| 7 | **No projection on any query** — over-fetching everywhere | 🟡 Medium | Performance |
| 8 | **Rate limiting too restrictive globally, missing per-action** | 🟡 Medium | Security |
| 9 | **Rate limiter is in-memory** — useless in multi-instance deployment | 🟡 Medium | Infrastructure |
| 10 | **Missing indexes for replies query** — COLLSCAN risk | 🟡 Medium | Performance |
| 11 | **`isDeleted` boolean → `deletedAt` Date** — no soft-delete audit trail | 🟢 Low | Schema |
| 12 | **Global rate limit 100/15min too restrictive** — blocks legitimate users | 🟡 Medium | Availability |
| 13 | **No `unhandledRejection` / `uncaughtException` handlers** | 🟡 Medium | Reliability |
| 14 | **Write concern not set to `majority`** | 🟡 Medium | Data safety |

---

> **Phase 0 is complete.** Please review this audit and provide feedback before I proceed to Phase 1 (SCALE_PLAN.md).
