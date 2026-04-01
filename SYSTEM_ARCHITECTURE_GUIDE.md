# Social Media Platform — Full System Architecture Guide
### Target: 200M+ Students in Bangladesh | Stack: Next.js · Node.js · MongoDB · Redis · RabbitMQ

---

## TABLE OF CONTENTS

1. [Project Overview & Constraints](#1-project-overview--constraints)
2. [Monorepo Folder Structure](#2-monorepo-folder-structure)
3. [Database Design (MongoDB)](#3-database-design-mongodb)
4. [Backend Architecture](#4-backend-architecture)
5. [Frontend Architecture](#5-frontend-architecture)
6. [Redis Caching Strategy](#6-redis-caching-strategy)
7. [RabbitMQ Event Architecture](#7-rabbitmq-event-architecture)
8. [Security Architecture](#8-security-architecture)
9. [API Contract Reference](#9-api-contract-reference)
10. [Claude Code Prompt Instructions](#10-claude-code-prompt-instructions)

---

## 1. PROJECT OVERVIEW & CONSTRAINTS

| Attribute | Value |
|-----------|-------|
| Architecture | Monolith with async event processing |
| Target Users | 200M+ students, 14–20 yrs, Bangladesh |
| Read/Write Ratio | ~95% reads, ~5% writes |
| Auth | JWT (Access + Refresh token pair) |
| Image Storage | Cloudinary (free tier initially) |
| Primary DB | MongoDB Atlas (sharded) |
| Cache | Redis (read cache + session store) |
| Queue | RabbitMQ (fan-out for notifications, likes, counters) |
| Frontend | Next.js 15 App Router + Redux Toolkit |
| Backend | Node.js (Express) — monolith, service-layer pattern |

### Scalability Philosophy
- **Cache-first reads**: Feed, post counts, like states → Redis
- **Write async**: Counters (likes, comments) updated via RabbitMQ workers, not synchronous DB writes
- **Denormalize strategically**: Store author's `firstName + lastName + avatar` snapshot on post/comment documents to avoid JOIN-like lookups
- **Soft pagination**: Cursor-based (`createdAt` + `_id`) — never use `skip()` at scale
- **Index everything used in queries**: Compound indexes designed per query pattern

---

## 2. MONOREPO FOLDER STRUCTURE

```
project/
├── social-media-backend/
│   ├── src/
│   │   ├── config/
│   │   │   ├── db.js                  # Mongoose connection
│   │   │   ├── redis.js               # Redis client
│   │   │   ├── rabbitmq.js            # RabbitMQ channel setup
│   │   │   ├── cloudinary.js          # Cloudinary SDK init
│   │   │   └── env.js                 # Validated env vars (joi/zod)
│   │   ├── constants/
│   │   │   ├── queue.constants.js     # Queue/exchange names
│   │   │   ├── cache.constants.js     # Cache key patterns + TTLs
│   │   │   └── error.constants.js     # Error codes & messages
│   │   ├── models/
│   │   │   ├── User.model.js
│   │   │   ├── Post.model.js
│   │   │   ├── Comment.model.js
│   │   │   ├── Like.model.js
│   │   │   └── RefreshToken.model.js
│   │   ├── routes/
│   │   │   ├── index.js               # Mount all routers
│   │   │   ├── auth.routes.js
│   │   │   ├── post.routes.js
│   │   │   ├── comment.routes.js
│   │   │   └── like.routes.js
│   │   ├── controllers/
│   │   │   ├── auth.controller.js
│   │   │   ├── post.controller.js
│   │   │   ├── comment.controller.js
│   │   │   └── like.controller.js
│   │   ├── services/
│   │   │   ├── auth.service.js
│   │   │   ├── post.service.js
│   │   │   ├── comment.service.js
│   │   │   ├── like.service.js
│   │   │   ├── cache.service.js       # Redis abstractions
│   │   │   └── upload.service.js      # Cloudinary upload logic
│   │   ├── workers/                   # RabbitMQ consumers
│   │   │   ├── like.worker.js         # Async like counter updates
│   │   │   └── notification.worker.js
│   │   ├── middlewares/
│   │   │   ├── auth.middleware.js     # JWT verify + attach req.user
│   │   │   ├── error.middleware.js    # Global error handler
│   │   │   ├── validate.middleware.js # Zod schema validation
│   │   │   ├── rateLimit.middleware.js
│   │   │   └── upload.middleware.js   # Multer config
│   │   ├── validators/
│   │   │   ├── auth.validator.js
│   │   │   ├── post.validator.js
│   │   │   └── comment.validator.js
│   │   ├── utils/
│   │   │   ├── response.util.js       # Unified response format
│   │   │   ├── jwt.util.js
│   │   │   ├── pagination.util.js     # Cursor-based pagination helper
│   │   │   └── logger.js             # Winston logger
│   │   └── app.js                    # Express app setup
│   ├── server.js                     # Entry point
│   ├── .env.example
│   └── package.json
│
└── social-media-frontend/
    ├── src/
    │   ├── app/                       # Next.js App Router
    │   │   ├── (auth)/
    │   │   │   ├── login/
    │   │   │   │   └── page.jsx
    │   │   │   └── register/
    │   │   │       └── page.jsx
    │   │   ├── (protected)/
    │   │   │   └── feed/
    │   │   │       └── page.jsx
    │   │   ├── layout.jsx
    │   │   └── page.jsx               # Redirect to /feed or /login
    │   ├── components/
    │   │   ├── ui/                    # Reusable primitives
    │   │   │   ├── Button.jsx
    │   │   │   ├── Input.jsx
    │   │   │   ├── Modal.jsx
    │   │   │   ├── Avatar.jsx
    │   │   │   ├── Spinner.jsx
    │   │   │   └── Toast.jsx
    │   │   ├── auth/
    │   │   │   ├── LoginForm.jsx
    │   │   │   └── RegisterForm.jsx
    │   │   ├── feed/
    │   │   │   ├── FeedContainer.jsx  # Orchestrates feed
    │   │   │   ├── PostCard.jsx       # Single post display
    │   │   │   ├── PostSkeleton.jsx   # Loading skeleton
    │   │   │   ├── CreatePostModal.jsx
    │   │   │   └── InfiniteScrollTrigger.jsx
    │   │   ├── post/
    │   │   │   ├── PostActions.jsx    # Like, comment, share buttons
    │   │   │   ├── LikeButton.jsx     # Optimistic UI like toggle
    │   │   │   ├── LikeList.jsx       # Who liked modal
    │   │   │   ├── CommentSection.jsx
    │   │   │   ├── CommentItem.jsx
    │   │   │   └── ReplyItem.jsx
    │   │   └── layout/
    │   │       ├── Navbar.jsx
    │   │       └── ProtectedRoute.jsx
    │   ├── store/
    │   │   ├── index.js               # Redux store
    │   │   ├── slices/
    │   │   │   ├── authSlice.js
    │   │   │   ├── feedSlice.js
    │   │   │   ├── postSlice.js
    │   │   │   └── uiSlice.js         # Modals, toasts, loading states
    │   │   └── middleware/
    │   │       └── authPersist.js     # Persist auth to localStorage
    │   ├── api/
    │   │   ├── axiosInstance.js       # Single Axios instance (ALL calls go here)
    │   │   ├── auth.api.js
    │   │   ├── post.api.js
    │   │   ├── comment.api.js
    │   │   └── like.api.js
    │   ├── hooks/
    │   │   ├── useAuth.js
    │   │   ├── useFeed.js
    │   │   ├── useInfiniteScroll.js
    │   │   └── useOptimisticLike.js
    │   ├── utils/
    │   │   ├── formatDate.js
    │   │   └── constants.js
    │   └── styles/
    │       └── globals.css
    ├── public/
    ├── next.config.js
    └── package.json
```

---

## 3. DATABASE DESIGN (MongoDB)

### Design Principles Applied
- **Embed** what is always read together (author snapshot on Post)
- **Reference** what grows unbounded (comments, likes as separate collections)
- **Denormalize counters** (likeCount, commentCount on Post) — updated async via workers
- **No `$lookup` on hot paths** — everything needed for feed display is in the Post document
- **Compound indexes** designed around actual query patterns

---

### 3.1 — User Collection

```js
// Collection: users
{
  _id: ObjectId,
  firstName: String,           // required, max 50
  lastName: String,            // required, max 50
  email: String,               // required, unique, lowercase, indexed
  passwordHash: String,        // bcrypt, never returned in API
  avatar: {
    url: String,               // Cloudinary URL
    publicId: String           // for deletion
  },
  isActive: Boolean,           // default: true (soft delete)
  createdAt: Date,
  updatedAt: Date
}

// Indexes
{ email: 1 }                   // unique
{ createdAt: -1 }
```

---

### 3.2 — RefreshToken Collection

```js
// Collection: refresh_tokens
{
  _id: ObjectId,
  userId: ObjectId,            // ref: users
  token: String,               // hashed refresh token
  expiresAt: Date,             // TTL index — auto-delete
  userAgent: String,           // device tracking
  ip: String,
  createdAt: Date
}

// Indexes
{ token: 1 }                   // unique
{ userId: 1 }
{ expiresAt: 1 }               // TTL index — MongoDB auto-purges
```

---

### 3.3 — Post Collection ⭐ (Most Critical)

```js
// Collection: posts
{
  _id: ObjectId,
  
  // Denormalized author snapshot — NO lookup needed on feed
  author: {
    _id: ObjectId,             // ref: users (for profile link)
    firstName: String,
    lastName: String,
    avatarUrl: String
  },

  content: String,             // required, max 2000 chars
  
  image: {
    url: String,               // Cloudinary CDN URL
    publicId: String,
    width: Number,
    height: Number
  },

  visibility: {
    type: String,
    enum: ['public', 'private'],
    default: 'public'
  },

  // Counters — denormalized for O(1) read, async-updated by workers
  likeCount: { type: Number, default: 0 },
  commentCount: { type: Number, default: 0 },

  isDeleted: Boolean,          // soft delete, default: false
  createdAt: Date,
  updatedAt: Date
}

// Indexes — designed for feed query pattern
{ 'author._id': 1, visibility: 1, createdAt: -1 }   // user's own posts
{ visibility: 1, isDeleted: 1, createdAt: -1 }       // public feed (most used)
{ createdAt: -1, _id: -1 }                           // cursor pagination
{ isDeleted: 1, visibility: 1, _id: -1 }             // compound cursor
```

**Feed Query Pattern (cursor-based, NO skip):**
```js
// Page 1
db.posts.find({
  visibility: 'public',
  isDeleted: false
}).sort({ createdAt: -1, _id: -1 }).limit(20)

// Next page (using last doc's createdAt + _id as cursor)
db.posts.find({
  visibility: 'public',
  isDeleted: false,
  $or: [
    { createdAt: { $lt: cursorDate } },
    { createdAt: cursorDate, _id: { $lt: cursorId } }
  ]
}).sort({ createdAt: -1, _id: -1 }).limit(20)
```

---

### 3.4 — Comment Collection

```js
// Collection: comments
{
  _id: ObjectId,
  postId: ObjectId,            // ref: posts — indexed
  parentId: ObjectId | null,   // null = top-level comment, ObjectId = reply to comment
  depth: Number,               // 0 = comment, 1 = reply (max depth enforced at API level)

  author: {
    _id: ObjectId,
    firstName: String,
    lastName: String,
    avatarUrl: String
  },

  content: String,             // required, max 1000 chars
  likeCount: { type: Number, default: 0 },
  replyCount: { type: Number, default: 0 },  // only on depth-0 comments
  
  isDeleted: Boolean,
  createdAt: Date,
  updatedAt: Date
}

// Indexes
{ postId: 1, parentId: 1, createdAt: 1 }     // fetch comments for a post
{ postId: 1, depth: 1, createdAt: 1 }
{ 'author._id': 1 }
```

**Comment Fetching Strategy:**
```
- Top-level: parentId = null, sorted by createdAt ASC (chronological for comments)
- Replies: parentId = commentId, paginated, lazy-loaded on click
- Max depth = 1 (comment → reply only, no nested replies) — enforced in validator
```

---

### 3.5 — Like Collection ⭐ (High Volume)

```js
// Collection: likes
// Single collection for post likes, comment likes, reply likes
{
  _id: ObjectId,
  userId: ObjectId,            // ref: users
  targetId: ObjectId,          // postId OR commentId
  targetType: {
    type: String,
    enum: ['post', 'comment']  // 'comment' covers both comments and replies
  },
  createdAt: Date
}

// Indexes — this collection will be HUGE, indexes are critical
{ userId: 1, targetId: 1, targetType: 1 }   // unique (prevent duplicate likes)
{ targetId: 1, targetType: 1, createdAt: -1 } // fetch likers for a target
{ userId: 1, targetType: 1, createdAt: -1 }   // user's like history
```

**Unique Constraint:**
```js
// Compound unique index prevents duplicate likes
{ userId: 1, targetId: 1, targetType: 1 } — unique: true
```

**Like State Check (Redis-first):**
```
1. Check Redis: SISMEMBER likes:{targetType}:{targetId}  userId
2. Cache miss → query likes collection, repopulate Redis set
3. Return isLiked: true/false
```

**"Who Liked" Feature:**
```js
db.likes.aggregate([
  { $match: { targetId, targetType } },
  { $sort: { createdAt: -1 } },
  { $limit: 50 },
  { $lookup: { from: 'users', localField: 'userId', foreignField: '_id', as: 'user' } },
  { $project: { 'user.firstName': 1, 'user.lastName': 1, 'user.avatar': 1 } }
])
```

---

### 3.6 — Summary: Collection Index Map

| Collection | Key Indexes |
|------------|-------------|
| `users` | `email` (unique), `createdAt` |
| `refresh_tokens` | `token` (unique), `userId`, `expiresAt` (TTL) |
| `posts` | `(visibility, isDeleted, createdAt, _id)`, `(author._id, visibility, createdAt)` |
| `comments` | `(postId, parentId, createdAt)`, `(postId, depth, createdAt)` |
| `likes` | `(userId, targetId, targetType)` (unique), `(targetId, targetType, createdAt)` |

---

## 4. BACKEND ARCHITECTURE

### 4.1 — Unified Response Format

```js
// utils/response.util.js
// ALL responses use this format — no exceptions

// Success
{
  "success": true,
  "message": "Posts fetched successfully",
  "data": { ... },
  "pagination": {           // only on paginated endpoints
    "nextCursor": "...",
    "hasMore": true
  }
}

// Error
{
  "success": false,
  "message": "Unauthorized",
  "code": "AUTH_TOKEN_EXPIRED",
  "errors": []              // validation errors array
}
```

```js
// utils/response.util.js
exports.sendSuccess = (res, message, data = null, statusCode = 200, pagination = null) => {
  const payload = { success: true, message, data };
  if (pagination) payload.pagination = pagination;
  return res.status(statusCode).json(payload);
};

exports.sendError = (res, message, statusCode = 500, code = 'SERVER_ERROR', errors = []) => {
  return res.status(statusCode).json({ success: false, message, code, errors });
};
```

### 4.2 — JWT Strategy

```
Access Token:  15 minutes TTL — stored in memory (Redux state)
Refresh Token: 7 days TTL    — stored in httpOnly Secure cookie
                              — hashed in DB (refresh_tokens collection)

Flow:
  1. Login → issue both tokens
  2. Every request → verify access token in Authorization: Bearer header
  3. On 401 → frontend auto-calls /auth/refresh with cookie
  4. /auth/refresh → verify cookie → hash match in DB → issue new pair
  5. Logout → delete refresh token from DB + clear cookie
```

### 4.3 — Route/Controller/Service Pattern

```
Route       → validates HTTP shape (method, path, auth middleware)
Controller  → extracts req data, calls service, sends response
Service     → ALL business logic, DB queries, cache interaction, queue publishing
```

```js
// Example: post.routes.js
router.get('/feed', authenticate, postController.getFeed);
router.post('/', authenticate, upload.single('image'), validate(postSchema), postController.createPost);

// Example: post.controller.js
exports.getFeed = async (req, res, next) => {
  try {
    const { cursor, limit = 20 } = req.query;
    const result = await postService.getFeed({ userId: req.user.id, cursor, limit });
    sendSuccess(res, 'Feed fetched', result.posts, 200, result.pagination);
  } catch (err) { next(err); }
};

// Example: post.service.js
exports.getFeed = async ({ userId, cursor, limit }) => {
  const cacheKey = CACHE_KEYS.FEED(cursor || 'first');
  const cached = await cacheService.get(cacheKey);
  if (cached) return cached;

  const query = buildCursorQuery(cursor); // utility
  const posts = await Post.find({ ...query, visibility: 'public', isDeleted: false })
    .sort({ createdAt: -1, _id: -1 })
    .limit(+limit + 1)
    .lean();

  const hasMore = posts.length > limit;
  if (hasMore) posts.pop();
  const nextCursor = hasMore ? encodeCursor(posts[posts.length - 1]) : null;

  const result = { posts, pagination: { nextCursor, hasMore } };
  await cacheService.set(cacheKey, result, CACHE_TTL.FEED); // 60s
  return result;
};
```

### 4.4 — Async Like Counter Architecture (High Scale)

```
❌ WRONG (breaks at scale):
POST /like → db.posts.findOneAndUpdate({ $inc: { likeCount: 1 } })
             (millions of concurrent writes to same doc = write contention)

✅ RIGHT:
POST /like →
  1. Write to likes collection (upsert, idempotent)
  2. Publish event to RabbitMQ: like.created { postId, targetType, delta: +1 }
  3. Return response immediately (optimistic UI)

RabbitMQ Worker →
  Batch consume events every 5s
  db.posts.bulkWrite([ { updateOne: { $inc: { likeCount: delta } } } ])
```

---

## 5. FRONTEND ARCHITECTURE

### 5.1 — Axios Instance (Single Source of Truth)

```js
// src/api/axiosInstance.js
import axios from 'axios';
import { store } from '@/store';
import { logout, setAccessToken } from '@/store/slices/authSlice';

const axiosInstance = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL,
  withCredentials: true,              // sends httpOnly refresh cookie
  headers: { 'Content-Type': 'application/json' }
});

// Request interceptor — attach access token
axiosInstance.interceptors.request.use((config) => {
  const token = store.getState().auth.accessToken;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Response interceptor — handle token refresh
let isRefreshing = false;
let failedQueue = [];

axiosInstance.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config;
    if (error.response?.status === 401 && !original._retry) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        }).then(token => {
          original.headers.Authorization = `Bearer ${token}`;
          return axiosInstance(original);
        });
      }
      original._retry = true;
      isRefreshing = true;
      try {
        const { data } = await axiosInstance.post('/auth/refresh');
        store.dispatch(setAccessToken(data.data.accessToken));
        failedQueue.forEach(p => p.resolve(data.data.accessToken));
        return axiosInstance(original);
      } catch {
        store.dispatch(logout());
        failedQueue.forEach(p => p.reject(error));
        return Promise.reject(error);
      } finally {
        isRefreshing = false;
        failedQueue = [];
      }
    }
    return Promise.reject(error);
  }
);

export default axiosInstance;
```

### 5.2 — Redux Store Structure

```js
// store/slices/authSlice.js
{
  user: { id, firstName, lastName, email, avatarUrl } | null,
  accessToken: String | null,
  isAuthenticated: Boolean,
  loading: Boolean
}

// store/slices/feedSlice.js
{
  posts: [],
  nextCursor: null,
  hasMore: true,
  loading: Boolean,
  creating: Boolean
}

// store/slices/postSlice.js
{
  // keyed by postId
  comments: { [postId]: { items: [], nextCursor, hasMore, loading } },
  likeStates: { [targetKey]: Boolean }   // targetKey = `${type}:${id}`
}

// store/slices/uiSlice.js
{
  createPostModal: Boolean,
  likeListModal: { open: Boolean, targetId, targetType },
  toast: { message, type, visible }
}
```

### 5.3 — Protected Route (Middleware via Next.js)

```js
// middleware.js (root level — Next.js middleware)
import { NextResponse } from 'next/server';

export function middleware(request) {
  const { pathname } = request.nextUrl;
  const isAuth = request.cookies.get('refreshToken'); // presence check only

  const protectedRoutes = ['/feed'];
  const authRoutes = ['/login', '/register'];

  if (protectedRoutes.some(r => pathname.startsWith(r)) && !isAuth) {
    return NextResponse.redirect(new URL('/login', request.url));
  }
  if (authRoutes.some(r => pathname.startsWith(r)) && isAuth) {
    return NextResponse.redirect(new URL('/feed', request.url));
  }
  return NextResponse.next();
}

export const config = { matcher: ['/feed', '/login', '/register'] };
```

### 5.4 — Optimistic Like UI Pattern

```js
// hooks/useOptimisticLike.js
export function useOptimisticLike({ targetId, targetType, initialLiked, initialCount }) {
  const [isLiked, setIsLiked] = useState(initialLiked);
  const [count, setCount] = useState(initialCount);
  const [isPending, setIsPending] = useState(false);

  const toggle = async () => {
    if (isPending) return;
    // Optimistic update — instant UI feedback
    setIsLiked(prev => !prev);
    setCount(prev => isLiked ? prev - 1 : prev + 1);
    setIsPending(true);
    try {
      await likeApi.toggle({ targetId, targetType });
    } catch {
      // Revert on failure
      setIsLiked(prev => !prev);
      setCount(prev => isLiked ? prev + 1 : prev - 1);
    } finally {
      setIsPending(false);
    }
  };

  return { isLiked, count, toggle, isPending };
}
```

---

## 6. REDIS CACHING STRATEGY

```
Key Pattern                           TTL       Purpose
─────────────────────────────────────────────────────────────────
feed:public:{cursor}                  60s       Feed pages (invalidate on new post)
post:{postId}                         300s      Single post data
post:{postId}:comments                120s      Comment list
likes:post:{postId}                   SET       User IDs who liked (SISMEMBER)
likes:comment:{commentId}             SET       User IDs who liked
user:{userId}:session                 900s      Lightweight auth session cache
```

**Cache Invalidation Rules:**
```
New post created     → DEL feed:public:*  (wildcard via Redis SCAN or tag-based)
Post deleted         → DEL post:{postId}, DEL feed:public:*
New like             → SADD likes:{type}:{id} {userId} (async), incr local count
Unlike               → SREM likes:{type}:{id} {userId}
New comment          → DEL post:{postId}:comments
```

**Cache Warming (Feed):**
```
On server start → warm first 2 pages of public feed into Redis
On new post     → async job re-warms page 1
```

---

## 7. RABBITMQ EVENT ARCHITECTURE

```
Exchange: social.events (topic exchange)

Routing Keys & Queues:
  like.post.created    → q.like.post.counter       (update post likeCount)
  like.comment.created → q.like.comment.counter    (update comment likeCount)
  like.*.deleted       → same queues (delta = -1)
  post.created         → q.feed.invalidate          (invalidate Redis feed cache)
  comment.created      → q.comment.counter          (update post commentCount)

Worker Pattern (in workers/):
  - Each worker file = one queue consumer
  - Batch ACK every 500ms or 100 messages (whichever first)
  - Dead letter queue: social.dlq (retry 3x, then alert)
  - Prefetch: 10 (don't overwhelm worker)
```

---

## 8. SECURITY ARCHITECTURE

| Threat | Mitigation |
|--------|-----------|
| Brute force login | express-rate-limit: 5 attempts / 15min per IP |
| XSS | httpOnly cookie for refresh token, sanitize post content (DOMPurify on frontend) |
| CSRF | SameSite=Strict cookie, custom header check |
| JWT tampering | HS256 with strong secret (32+ random bytes) |
| SQL/NoSQL injection | Mongoose schema typing + zod validation |
| Sensitive data exposure | Never return passwordHash, strip with `.select('-passwordHash')` |
| Mass assignment | Only pick allowed fields in service layer |
| Private post leakage | Always filter by `visibility: 'public'` on feed; private only for `author._id === userId` |
| Image upload abuse | Multer: 5MB limit, allowed MIME types only (image/jpeg, image/png, image/webp) |
| Token rotation | Refresh token rotated on every use (old one invalidated) |

**Environment Variables Required:**
```
PORT, MONGODB_URI, REDIS_URL, RABBITMQ_URL
JWT_ACCESS_SECRET, JWT_REFRESH_SECRET
JWT_ACCESS_EXPIRES=15m, JWT_REFRESH_EXPIRES=7d
CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET
CLIENT_URL (for CORS)
NODE_ENV
```

---

## 9. API CONTRACT REFERENCE

```
AUTH
  POST   /api/auth/register         { firstName, lastName, email, password }
  POST   /api/auth/login            { email, password }
  POST   /api/auth/refresh          (uses httpOnly cookie)
  POST   /api/auth/logout           (clears cookie, deletes DB token)
  GET    /api/auth/me               → current user (protected)

POSTS
  GET    /api/posts/feed            ?cursor=&limit=20 → paginated public feed
  POST   /api/posts                 FormData: { content, image?, visibility }
  GET    /api/posts/:postId         → single post
  DELETE /api/posts/:postId         → soft delete (author only)

COMMENTS
  GET    /api/posts/:postId/comments        ?cursor=&limit=20
  POST   /api/posts/:postId/comments        { content }
  GET    /api/comments/:commentId/replies   ?cursor=&limit=10
  POST   /api/comments/:commentId/replies   { content }

LIKES
  POST   /api/likes/toggle          { targetId, targetType: 'post'|'comment' }
  GET    /api/likes/:targetType/:targetId   ?cursor= → who liked (paginated)
```

---

## 10. CLAUDE CODE PROMPT INSTRUCTIONS

Use these prompts **in order** when working with Claude Code. Each prompt builds on the previous. Copy-paste them directly.

---

### PROMPT 1 — Backend Bootstrap

```
We are building a social media app monorepo. Start with the backend.

Tech: Node.js + Express + MongoDB (Mongoose) + Redis + RabbitMQ + Cloudinary
Pattern: routes → controllers → services. One global response format.

Tasks:
1. Initialize package.json with dependencies:
   express, mongoose, redis, amqplib, jsonwebtoken, bcryptjs, 
   multer, cloudinary, multer-storage-cloudinary, zod, cors, 
   helmet, morgan, express-rate-limit, cookie-parser, winston, dotenv

2. Create the full folder structure as described in the architecture guide

3. Create these config files with proper error handling and reconnection logic:
   - src/config/db.js (Mongoose, log on connect/disconnect)
   - src/config/redis.js (ioredis, reconnect strategy)
   - src/config/rabbitmq.js (amqplib, persistent connection with reconnect)
   - src/config/cloudinary.js
   - src/config/env.js (zod validation of all env vars — fail fast on startup)

4. Create src/utils/response.util.js with sendSuccess and sendError helpers
5. Create src/utils/logger.js (Winston: info/error/warn, file + console)
6. Create src/utils/pagination.util.js (encodeCursor, decodeCursor, buildCursorQuery for createdAt+_id)
7. Create src/middlewares/error.middleware.js (catch-all, logs, returns sendError format)
8. Create src/app.js with all middleware stack: helmet, cors, rate-limit, morgan, cookie-parser, json, routes, error handler
9. Create server.js entry point

All files must use the unified response format. No placeholder comments — write real implementation code.
```

---

### PROMPT 2 — Database Models

```
Create all Mongoose models for the social media app. Follow this exact schema:

1. src/models/User.model.js
   Fields: firstName, lastName, email (unique, lowercase), passwordHash, 
   avatar: { url, publicId }, isActive (default true), timestamps
   Add instance method: toPublicJSON() that omits passwordHash
   Add static method: findByEmail(email)
   Indexes: email unique, createdAt

2. src/models/RefreshToken.model.js
   Fields: userId (ref User), token (hashed), expiresAt (TTL index), userAgent, ip, createdAt
   TTL index on expiresAt (MongoDB auto-delete)

3. src/models/Post.model.js
   Fields: author { _id, firstName, lastName, avatarUrl } (denormalized snapshot),
   content (max 2000), image { url, publicId, width, height }, 
   visibility (enum: public/private, default public),
   likeCount (default 0), commentCount (default 0), isDeleted (default false), timestamps
   Indexes: (visibility, isDeleted, createdAt, _id), (author._id, visibility, createdAt)

4. src/models/Comment.model.js
   Fields: postId (ref Post, indexed), parentId (ref Comment, null = top-level),
   depth (0 or 1), author { _id, firstName, lastName, avatarUrl },
   content (max 1000), likeCount (default 0), replyCount (default 0), isDeleted, timestamps
   Indexes: (postId, parentId, createdAt), (postId, depth, createdAt)

5. src/models/Like.model.js
   Fields: userId (ref User), targetId (ObjectId), targetType (enum: post/comment), createdAt
   Compound unique index: (userId, targetId, targetType)
   Index: (targetId, targetType, createdAt)

Write complete, production-ready Mongoose schemas. Include all indexes as schema-level index definitions.
```

---

### PROMPT 3 — Auth System

```
Implement the complete authentication system for the social media app.

Files to create:
1. src/utils/jwt.util.js
   - signAccessToken(payload) → 15m JWT
   - signRefreshToken(payload) → 7d JWT
   - verifyAccessToken(token) → decoded | throws
   - verifyRefreshToken(token) → decoded | throws
   - hashToken(token) → sha256 hex (for DB storage)

2. src/validators/auth.validator.js (Zod)
   - registerSchema: { firstName (min 2, max 50), lastName, email, password (min 8, has uppercase+number) }
   - loginSchema: { email, password }

3. src/services/auth.service.js
   Methods: register, login, refresh, logout, getMe
   - register: check duplicate email, bcrypt hash password, create user, issue tokens, save hashed refresh token to DB
   - login: find user, compare password, issue tokens
   - refresh: verify cookie token, hash match in DB, rotate token (delete old, create new), issue new pair
   - logout: delete refresh token from DB, clear cookie
   - Refresh token stored as httpOnly, Secure, SameSite=Strict cookie named 'refreshToken'

4. src/controllers/auth.controller.js (thin — just calls service, sends response)

5. src/routes/auth.routes.js
   POST /register, POST /login, POST /refresh, POST /logout, GET /me (protected)

6. src/middlewares/auth.middleware.js
   - authenticate: extract Bearer token, verify, attach req.user = { id, email }
   - Returns 401 with code AUTH_TOKEN_EXPIRED or AUTH_TOKEN_INVALID

Use the unified sendSuccess/sendError format. All errors must go through next(err).
```

---

### PROMPT 4 — Post System

```
Implement the complete post system with cursor-based pagination and Redis caching.

1. src/services/cache.service.js
   Wraps Redis with: get(key), set(key, data, ttlSeconds), del(key), 
   sAdd(key, member), sIsMember(key, member), sRem(key, member), scanDel(pattern)

2. src/constants/cache.constants.js
   CACHE_KEYS: FEED(cursor), POST(id), POST_COMMENTS(id), LIKES(type, id)
   CACHE_TTL: FEED=60, POST=300, COMMENTS=120

3. src/services/upload.service.js
   - uploadImage(file) → Cloudinary upload, return { url, publicId, width, height }
   - deleteImage(publicId) → Cloudinary destroy

4. src/middlewares/upload.middleware.js
   Multer: memory storage, 5MB limit, allowed MIME: jpeg/png/webp

5. src/validators/post.validator.js (Zod)
   content (required, max 2000), visibility (enum public/private, default public)

6. src/services/post.service.js
   Methods:
   - createPost({ userId, userSnap, content, image?, visibility }) 
     → upload image if present → save post → publish post.created to RabbitMQ → invalidate feed cache
   - getFeed({ cursor, limit=20 }) 
     → Redis cache check → cursor query → cache result → return with pagination
   - getPost(postId) → Redis cache → DB → cache
   - deletePost({ postId, userId }) → verify author → soft delete → invalidate caches
   - getMyPosts({ userId, cursor, limit }) → author's public+private posts

7. src/controllers/post.controller.js
8. src/routes/post.routes.js
   GET /feed (protected), POST / (protected, upload middleware), 
   GET /:postId (protected), DELETE /:postId (protected), GET /my (protected)

Attach author snapshot from req.user to every created post. Never skip pagination.
```

---

### PROMPT 5 — Comment & Like System + Workers

```
Implement comments, replies, likes, and async RabbitMQ workers.

1. src/constants/queue.constants.js
   EXCHANGES: { SOCIAL_EVENTS: 'social.events' }
   QUEUES: { LIKE_COUNTER: 'q.like.counter', COMMENT_COUNTER: 'q.comment.counter', FEED_INVALIDATE: 'q.feed.invalidate' }
   ROUTING_KEYS: { LIKE_CREATED: 'like.created', LIKE_DELETED: 'like.deleted', COMMENT_CREATED: 'comment.created', POST_CREATED: 'post.created' }

2. src/services/comment.service.js
   - addComment({ postId, userId, userSnap, content }) → depth=0 → save → publish comment.created
   - addReply({ commentId, userId, userSnap, content }) → validate parent depth=0 → depth=1 → save
   - getComments({ postId, cursor, limit }) → top-level only (parentId=null) with cache
   - getReplies({ commentId, cursor, limit }) → parentId=commentId

3. src/services/like.service.js
   - toggle({ userId, targetId, targetType }) 
     → upsert to likes collection (findOneAndDelete or insert) 
     → publish like.created/like.deleted to RabbitMQ
     → update Redis set (SADD / SREM)
     → return { isLiked, likeCount (optimistic) }
   - getLikers({ targetId, targetType, cursor, limit }) → paginated list with user info
   - getLikeState({ userId, targetId, targetType }) → Redis SISMEMBER first, DB fallback

4. src/workers/like.worker.js
   - Connect to RabbitMQ, consume q.like.counter
   - Batch updates: collect 100 messages or 500ms, then bulkWrite to posts/comments
   - ACK after successful write, NACK+requeue on failure (max 3 retries)

5. src/workers/notification.worker.js (stub for future)
   - Consume q.feed.invalidate, call cacheService.scanDel('feed:public:*')

6. Controllers and routes for:
   /api/posts/:postId/comments (GET, POST)
   /api/comments/:commentId/replies (GET, POST)
   /api/likes/toggle (POST)
   /api/likes/:targetType/:targetId (GET — who liked)

7. Start workers in server.js after DB/Redis/RabbitMQ connections are ready
```

---

### PROMPT 6 — Frontend Bootstrap + Auth

```
We are building the Next.js 15 frontend (App Router) for a social media app.

Setup tasks:
1. Install dependencies: @reduxjs/toolkit react-redux axios date-fns

2. Create src/api/axiosInstance.js
   - Base URL: process.env.NEXT_PUBLIC_API_URL
   - withCredentials: true (for httpOnly refresh cookie)
   - Request interceptor: attach accessToken from Redux store as Bearer header
   - Response interceptor: on 401, call /auth/refresh, update Redux token, retry original request
   - Queue failed requests during refresh (prevent race condition)
   - On refresh failure: dispatch logout(), redirect to /login

3. Create src/store/index.js and all slices:
   - authSlice: { user, accessToken, isAuthenticated, loading }
   - feedSlice: { posts, nextCursor, hasMore, loading, creating }
   - uiSlice: { createPostModal, likeListModal, toast }

4. Create src/api/ files:
   auth.api.js: register, login, logout, refresh, getMe
   post.api.js: getFeed, createPost, deletePost
   comment.api.js: getComments, addComment, getReplies, addReply
   like.api.js: toggle, getLikers

5. Create middleware.js (root level) for route protection:
   Protected: /feed — redirect to /login if no refreshToken cookie
   Auth routes: /login, /register — redirect to /feed if has cookie

6. Create layout.jsx with Redux Provider wrapper

7. Create app/(auth)/login/page.jsx and app/(auth)/register/page.jsx
   Convert the HTML template design from template/login.html and template/registration.html
   Keep the exact same visual design — just convert to Next.js + React components
   Use components: LoginForm.jsx, RegisterForm.jsx in src/components/auth/
   Forms: controlled inputs, submit calls API, store token in Redux, redirect to /feed
   Show loading state on submit button, show API errors inline

All API calls MUST go through axiosInstance — no direct fetch() calls.
```

---

### PROMPT 7 — Feed Page

```
Build the complete Feed page for the social media app.

Convert template/feed.html design to Next.js components exactly.

Components to create:

1. src/components/feed/FeedContainer.jsx
   - On mount: dispatch fetchFeed() thunk
   - Render: CreatePostButton, list of PostCard, InfiniteScrollTrigger
   - When InfiniteScrollTrigger visible: fetchNextPage using nextCursor

2. src/components/feed/PostCard.jsx
   Props: post object
   Shows: avatar, authorName, timestamp (date-fns formatRelative), 
          visibility badge (🔒 private / 🌐 public),
          content, image (if present), 
          PostActions component below

3. src/components/feed/PostSkeleton.jsx
   Animated skeleton for loading state (pulse animation)

4. src/components/feed/CreatePostModal.jsx
   - Textarea for content (max 2000 chars, show counter)
   - Image upload input (show preview)
   - Visibility toggle (public/private)
   - Submit: call createPost API, on success prepend to feed Redux state, close modal

5. src/components/post/PostActions.jsx
   Shows: LikeButton, comment count button (opens CommentSection), like list trigger

6. src/components/post/LikeButton.jsx
   - Uses useOptimisticLike hook
   - Shows filled/outlined heart icon + count
   - No double-click (disabled during pending)

7. src/components/post/LikeList.jsx
   - Modal triggered by clicking like count
   - Fetches getLikers paginated, shows user avatars + names

8. src/components/post/CommentSection.jsx
   - Lazy: fetches comments when first opened
   - List of CommentItem
   - Add comment input at bottom

9. src/components/post/CommentItem.jsx
   - Shows comment + LikeButton for comment
   - "Reply" button → shows reply input + ReplyItem list (lazy loaded)

10. src/components/feed/InfiniteScrollTrigger.jsx
    Uses IntersectionObserver to trigger loadMore when visible

11. src/hooks/useFeed.js — fetch feed, infinite scroll logic
12. src/hooks/useOptimisticLike.js — as defined in architecture doc

Redux: fetchFeed and fetchNextPage as createAsyncThunk in feedSlice
All design must match the template HTML file exactly.
All data through axiosInstance only.
```

---

### PROMPT 8 — Final Wiring + Security Hardening

```
Final integration, security hardening, and production readiness.

Backend:
1. Add rate limiters:
   - /auth/login: 5 requests per 15 min per IP
   - /auth/register: 3 requests per hour per IP
   - Global: 100 requests per minute per IP

2. Add input sanitization middleware (strip HTML from content fields using a sanitizer)

3. Ensure ALL routes that return posts filter isDeleted=false

4. Private post enforcement:
   - GET /posts/:postId → if visibility=private and author._id !== req.user.id → 403
   - Feed query ONLY returns public posts

5. Add request logging with Winston (log method, path, status, responseTime, userId)

6. Health check endpoint: GET /health → { status: 'ok', db, redis, rabbit }

Frontend:
7. Add Toast notification system (uiSlice) — show on post create, like errors, auth errors
8. Add loading skeletons in feed while fetching
9. Handle empty feed state gracefully
10. Add 404 page
11. Ensure all forms show field-level validation errors from API response
12. Add Navbar with user avatar, name, and logout button

Environment:
13. Create .env.example for backend with all required vars
14. Create .env.local.example for frontend

Write production-ready code. No TODO comments. No placeholder logic.
```

---

## NOTES FOR CLAUDE CODE SESSIONS

1. **Always run prompts in order** — later prompts depend on earlier ones
2. **After each prompt**, verify by checking: `node -e "require('./src/app')"` for backend
3. **Folder structure** is fixed — don't let Claude create new top-level folders
4. **Response format** is sacred — every API response must use `sendSuccess`/`sendError`
5. **Never use `skip()`** in MongoDB queries — always cursor-based pagination
6. **Workers must be started** after all connections are ready in `server.js`
7. If Claude Code diverges from this architecture, paste the relevant section back as context

---

*Architecture Version: 1.0 | Designed for 200M+ users | Bangladesh Student Social Network*
