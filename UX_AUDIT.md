# UX Audit

Phase 1 audit for the existing social media app in `social-media-backend` and `social-media-frontend`.

## Backend Overview

- Framework/language: Node.js, Express 4, CommonJS JavaScript.
- Database/cache/async services: MongoDB via Mongoose, optional Redis via ioredis, optional RabbitMQ via amqplib.
- Auth: short-lived JWT access token in `Authorization: Bearer ...`; refresh token stored as an httpOnly cookie.
- Uploads: Multer memory storage for post images, then Cloudinary upload.
- API base: `/api`.
- Health checks:
  - `GET /health` returns `{ status, uptime, timestamp }`.
  - `GET /api/health` returns `{ success: true, message: "API is running", timestamp }`.

## Backend Response Standard

Success responses use `sendSuccess`:

```json
{
  "success": true,
  "message": "Message",
  "data": {},
  "pagination": {
    "nextCursor": null,
    "hasMore": false
  }
}
```

`pagination` is only included for paginated list endpoints.

Error responses usually use `sendError`:

```json
{
  "success": false,
  "message": "Message",
  "code": "ERROR_CODE",
  "errors": []
}
```

Variations:

- Express rate limiters return the configured JSON message directly, matching `{ success, message, code }` but without `errors`.
- `GET /health` is outside the shared response envelope.
- Zod and Mongoose validation errors include `errors: [{ field, message }]`.
- Upload middleware returns field-agnostic upload errors such as `FILE_TOO_LARGE` and `UNSUPPORTED_MEDIA_TYPE`.

## API Endpoint Inventory

| Method | Route | Auth | Success | Failure / validation |
|--------|-------|------|---------|----------------------|
| POST | `/api/auth/register` | No | `201`, `{ user, accessToken }`, message `Registration successful`; sets refresh cookie | `422 VALIDATION_ERROR` for firstName, lastName, email, password; `409 EMAIL_TAKEN`; `429 RATE_LIMITED`; `500 SERVER_ERROR` |
| POST | `/api/auth/login` | No | `200`, `{ user, accessToken }`, message `Login successful`; sets refresh cookie | `422 VALIDATION_ERROR`; `401 INVALID_CREDENTIALS`; `429 RATE_LIMITED`; `500 SERVER_ERROR` |
| POST | `/api/auth/refresh` | Refresh cookie | `200`, `{ accessToken }`, message `Token refreshed`; rotates refresh cookie | `401 AUTH_TOKEN_MISSING`, `AUTH_TOKEN_INVALID`, `AUTH_TOKEN_REUSED`, `USER_NOT_FOUND`; `500 SERVER_ERROR` |
| POST | `/api/auth/logout` | No | `200`, `data: null`, message `Logged out successfully`; clears refresh cookie | Best effort; can still return `500 SERVER_ERROR` |
| GET | `/api/auth/me` | Yes | `200`, user object, message `User fetched` | `401 AUTH_TOKEN_MISSING/EXPIRED/INVALID`; `404 USER_NOT_FOUND`; `500 SERVER_ERROR` |
| GET | `/api/posts/feed` | Yes | `200`, `data: posts[]`, `pagination`, message `Feed fetched` | `401`; invalid cursor is ignored; `500 SERVER_ERROR` |
| GET | `/api/posts/my` | Yes | `200`, `data: posts[]`, `pagination`, message `My posts fetched` | `401`; invalid cursor is ignored; `500 SERVER_ERROR` |
| POST | `/api/posts` | Yes | `201`, post object, message `Post created` | `422 VALIDATION_ERROR` for content/visibility; `413 FILE_TOO_LARGE`; `415 UNSUPPORTED_MEDIA_TYPE`; Cloudinary failure -> `500`; `401`; `404 USER_NOT_FOUND` |
| GET | `/api/posts/:postId` | Yes | `200`, post object, message `Post fetched` | `400 INVALID_ID`; `401`; `404 POST_NOT_FOUND`; private posts for non-authors also return `404` |
| DELETE | `/api/posts/:postId` | Yes | `200`, `data: null`, message `Post deleted` | `400 INVALID_ID`; `401`; `403 FORBIDDEN`; `404 POST_NOT_FOUND`; `500` |
| GET | `/api/posts/:postId/comments` | Yes | `200`, `data: comments[]`, `pagination`, message `Comments fetched` | `400 INVALID_ID`; `401`; invalid cursor ignored; `500` |
| POST | `/api/posts/:postId/comments` | Yes | `201`, comment object, message `Comment added` | `422 VALIDATION_ERROR` for content; `400 INVALID_ID`; `401`; `404 POST_NOT_FOUND/USER_NOT_FOUND`; `500` |
| GET | `/api/comments/:commentId/replies` | Yes | `200`, `data: replies[]`, `pagination`, message `Replies fetched` | `400 INVALID_ID`; `401`; invalid cursor ignored; `500` |
| POST | `/api/comments/:commentId/replies` | Yes | `201`, reply object, message `Reply added` | `422 VALIDATION_ERROR` for content; `400 INVALID_ID/MAX_DEPTH_EXCEEDED`; `401`; `404 COMMENT_NOT_FOUND/USER_NOT_FOUND`; `500` |
| POST | `/api/likes/toggle` | Yes | `200`, `{ isLiked, likeCount }`, message `Liked` or `Unliked` | `422 VALIDATION_ERROR` for `targetId`/`targetType`; invalid ObjectId can become `500` in service paths; `401`; `500` |
| GET | `/api/likes/:targetType/:targetId` | Yes | `200`, `data: likers[]`, `pagination`, message `Likers fetched` | No route-level validation for params; invalid ObjectId can become `500`; `401`; `500` |

## Validation Rules

Register:

- `firstName`: required, trimmed, 2-50 characters.
- `lastName`: required, trimmed, 2-50 characters.
- `email`: required, trimmed, lowercased, valid email.
- `password`: required, at least 8 characters, must contain uppercase letter and number.

Login:

- `email`: required valid email.
- `password`: required.

Create post:

- `content`: required, trimmed, 1-2000 characters.
- `visibility`: `public` or `private`, defaults to `public`.
- `image`: optional JPEG, PNG, or WebP; max 5 MB.

Comments/replies:

- `content`: required, trimmed, 1-1000 characters.
- Replies to replies are rejected with `400 MAX_DEPTH_EXCEEDED`.

Likes:

- `targetId`: required string.
- `targetType`: `post` or `comment`.

## Long-Running / Async Operations

- Post image upload to Cloudinary can be slow and has no client progress indication.
- Post creation invalidates feed cache and publishes a post-created event.
- Like toggles publish RabbitMQ events for async counter updates; response still returns a DB count.
- Comment/reply creation publishes events and also updates counters synchronously as a fallback.
- Logout may wait on refresh-token deletion.

## Frontend Overview

- Framework/build tool: Next.js App Router 16, React 19, JavaScript.
- State management: Redux Toolkit via `auth`, `feed`, and `ui` slices.
- API layer: Axios instance with auth-header attachment and global 401 refresh retry.
- Routes:
  - `/` redirects to `/feed`.
  - `/login` renders `LoginForm`.
  - `/register` renders `RegisterForm`.
  - `/feed` renders the protected feed layout.
  - `not-found.jsx` provides a basic 404 page.
- Middleware protects `/feed` using presence of `refreshToken` cookie and redirects authenticated users away from `/login` and `/register`.

## Frontend API Usage By Area

- `LoginForm`: `POST /auth/login`.
- `RegisterForm`: `POST /auth/register`.
- `Navbar`: `POST /auth/logout`.
- `FeedContainer` via `useFeed`: `GET /posts/feed`.
- `CreatePostModal`: `POST /posts`.
- `PostCard`: `DELETE /posts/:postId`.
- `PostActions`/`LikeList`: opens likes modal, `GET /likes/:targetType/:targetId`.
- `LikeButton`/`useOptimisticLike`: `POST /likes/toggle`.
- `CommentSection`: `GET /posts/:postId/comments`, `POST /posts/:postId/comments`.
- `CommentItem`: `GET /comments/:commentId/replies`, `POST /comments/:commentId/replies`.

## Current UX Handling Summary

- Loading:
  - Feed initial load has post skeletons.
  - Infinite scroll uses another `PostSkeleton`, not a bottom spinner.
  - Auth submit buttons change text and disable.
  - Create post submit changes text and disables, but no upload progress.
  - Comments/replies use text such as `...` or `Loading comments...`.
  - Likers modal uses plain `Loading...`.
- Errors:
  - Auth forms show one generic alert using raw server messages.
  - Create post shows one inline generic error.
  - Feed stores `error` in Redux but does not render it.
  - Post delete silently swallows failures.
  - Like toggle silently reverts failures.
  - Comment/reply load and submit failures are silent.
  - Like list failures are silent.
  - Axios refresh failure redirects to `/login` without a preserved session-expired message or intended return path.
- Success:
  - Login/register success navigates to `/feed`.
  - Post creation closes modal and prepends new post.
  - Comment/reply creation inserts locally.
  - Delete removes post locally.
  - No success toasts for stay-on-page actions.
- Forms:
  - Browser-native `required`, `minLength`, `maxLength` are used in auth forms.
  - No blur-based validation.
  - No field-level server validation mapping.
  - Password fields have no show/hide toggle.
  - Create post has a character counter always visible.
  - Comment/reply forms have maxLength but no counter or validation feedback.
- Auth flow:
  - Access token is Redux-only, so a page reload with only the refresh cookie leaves Redux unauthenticated until an API call triggers refresh.
  - Middleware only checks refresh-cookie presence, not refresh validity.
  - Intended destination after login is not preserved.
  - Refresh failure clears Redux and redirects to `/login`, but gives no message.
- Optimistic updates:
  - Likes are optimistic with silent revert.
  - Post creation is not optimistic but prepends after success.
  - Comments/replies append after success.
  - Delete removes after success only, using `window.confirm`.

## User-Facing Action Map

| Action | Page | API Call | Has Loader? | Has Error Handling? | Has Success Feedback? | Notes |
|--------|------|----------|-------------|---------------------|------------------------|-------|
| Visit root | `/` | None | N/A | N/A | Redirect | Always redirects to `/feed`; protected middleware then may redirect to login. |
| Access feed while logged out | `/feed` | None in middleware | N/A | Partial | Redirect | Redirects to `/login`, but intended path is not preserved. |
| Login | `/login` | `POST /auth/login` | Yes, button text/disabled | Partial | Redirect | Raw server message can show; no field-level validation; no password toggle; no intended-page redirect. |
| Register | `/register` | `POST /auth/register` | Yes, button text/disabled | Partial | Redirect | Server validation appears as generic alert; confirm password only generic; terms radio is cosmetic. |
| Click Google sign-in/register | `/login`, `/register` | None | No | No | No | Button is present but has no implementation or feedback. |
| Forgot password | `/login` | None | No | No | No | Text looks clickable but does nothing. |
| Initial feed load | `/feed` | `GET /posts/feed` | Yes, skeletons | No visible handling | N/A | Redux stores error but UI never shows it. |
| Empty feed | `/feed` | `GET /posts/feed` | N/A | N/A | N/A | Basic empty message exists; no reusable empty-state pattern or action button. |
| Infinite scroll load more | `/feed` | `GET /posts/feed?cursor=...` | Partial, full post skeleton | No visible handling | N/A | Error stored but hidden; skeleton shape can feel like a real new post. |
| Open create post modal | `/feed` | None | N/A | N/A | Modal opens | No focus management; closing by backdrop can discard draft without warning. |
| Select post image | `/feed` modal | None | No | No | Preview | No file type/size validation before upload; no invalid-file message client-side. |
| Remove selected image | `/feed` modal | None | N/A | N/A | Preview removed | Works locally. |
| Create post | `/feed` modal | `POST /posts` | Partial, button text | Partial | UI update | No upload progress; submit disabled for empty content due to validation state; no success toast; raw server message can show. |
| Toggle visibility | `/feed` modal | None | N/A | N/A | Selection changes | Option labels show mojibake in current output; no explanation of private/public. |
| Delete own post | `/feed` | `DELETE /posts/:postId` | No | No | UI removal after success | Uses `window.confirm`; catch is silent; no disabled/deleting state; no success/error toast. |
| Open comments | `/feed` post | `GET /posts/:postId/comments` | Partial text loader | No | Comments shown | Load failures are silent and can look like no comments. |
| Add comment | `/feed` post | `POST /posts/:postId/comments` | Partial, `...` | No | Comment appends | Errors are silent; no inline validation; post `commentCount` is not updated in the visible count. |
| Load more comments | `/feed` post | `GET /posts/:postId/comments?cursor=...` | Partial button text | No | Comments append | Errors are silent; button returns but user gets no reason. |
| Load replies | `/feed` comment | `GET /comments/:commentId/replies` | No | No | Replies shown | First click has no loading state; failures are silent. |
| Add reply | `/feed` comment | `POST /comments/:commentId/replies` | Partial, `...` | No | Reply appends | Errors are silent; no inline validation/counter; parent reply count is not updated. |
| Load more replies | `/feed` comment | `GET /comments/:commentId/replies?cursor=...` | No | No | Replies append | No try/catch on inline async handler, so failures can surface as unhandled promise rejection. |
| Like/unlike post | `/feed` post | `POST /likes/toggle` | Partial disabled state | Silent revert | Optimistic | No subtle error toast; initial liked state is always false, so already-liked content is not represented. |
| Like/unlike comment | `/feed` comment | `POST /likes/toggle` | Partial disabled state | Silent revert | Optimistic | Same issue as post likes. |
| Open likes list | `/feed` post | `GET /likes/:targetType/:targetId` | Partial text loader | No | Modal list | Fetch failures are silent and display as empty list. |
| Load more likers | `/feed` likes modal | `GET /likes/:targetType/:targetId?cursor=...` | Partial button text | No | Likers append | No error feedback. |
| Close modal | `/feed` modal | None | N/A | N/A | Modal closes | No draft discard confirmation. |
| Toggle dark mode | `/feed` | None | N/A | N/A | Theme changes | Not persisted across reload. |
| Logout | `/feed` navbar | `POST /auth/logout` | No | Intentionally ignored | Redirect | User state clears after API attempt; no loading state; repeated clicks possible; no feedback if logout request fails. |
| Navbar search | `/feed` navbar | None | No | No | No | Input exists but has no search behavior or empty feedback. |
| Sidebar explore links | `/feed` sidebars | None | No | No | No | Many anchors point to `#0`; looks functional but does nothing. |
| Suggested follow/ignore/connect | `/feed` sidebars | None | No | No | No | Buttons/links are static and provide no feedback. |
| Friend search | `/feed` right sidebar | None | No | No | No | Search field prevents submit but does not filter. |
| Visit missing route | 404 | None | N/A | Yes | Navigation option | Friendly 404 page exists. |

## Worst Offenders: Zero Feedback

1. Comment and reply failures are silent across load, create, and pagination.
2. Delete post failure is silent after `window.confirm`.
3. Like-list fetch failure is silent and can be mistaken for "no likes".
4. Feed load errors are stored but never rendered.
5. Google sign-in/register, forgot password, search, follow/connect/ignore, and sidebar links look interactive but do nothing.
6. Expired-session redirects to login without explaining what happened.

## Errors Swallowed Silently

- `PostCard.handleDelete` catches and ignores delete failures.
- `useOptimisticLike.toggle` catches and silently reverts.
- `LikeList.fetchLikers` catches and ignores.
- `CommentSection.fetchComments` catches and ignores.
- `CommentSection.submitComment` catches and ignores.
- `CommentItem.loadReplies` catches and ignores.
- `CommentItem.submitReply` catches and ignores.
- `Navbar.handleLogout` ignores logout API failure by design.
- `CommentItem` load-more-replies inline async handler has no catch.

## Forms With Missing Validation Feedback

- Login: no blur validation, no field errors, no password visibility toggle.
- Register: no field-level server error mapping, no blur validation, no password visibility toggle, no password-rule guidance, terms control is a radio and not enforced.
- Create post: generic content error only, no server field mapping, submit disabled by validation state, no client-side image type/size errors.
- Comment form: no inline validation feedback, no server error display, no character counter near the limit.
- Reply form: same as comment form.

## Places The UI Can Get Stuck Or Mislead

- If feed fetch fails, skeleton disappears and an empty state can imply there are no posts.
- If comments fail to load, the user may see "No comments yet" or nothing instead of an error.
- If likes fail to load, the modal can show "No likes yet."
- Like count can become inconsistent: `LikeButton` owns local count, while the post count row still reads `post.likeCount` from props.
- Comment count and reply count are not updated after successful local insertion.
- Access token is Redux-only; refreshing the page can show a protected page shell with missing user data until an API request refreshes the token or fails.
- Uploading an image has no progress; slow Cloudinary uploads make the button text the only signal.

## Places Where The User Cannot Tell Whether It Worked

- Like/unlike has optimistic visual feedback, but no error feedback on revert.
- Delete post has no success toast.
- Logout has no loading state and ignores server failure.
- Static search/follow/connect/sidebar interactions provide no result or "not available" message.
- Loading replies has no visible in-flight state.

## Abrupt Or Broken Transitions

- Login/register always navigate to `/feed`; the original protected destination is lost.
- Session expiry sends the browser to `/login` with no preserved explanation.
- Closing create-post modal by backdrop instantly discards draft content.
- Post/comment/reply creation updates local lists, but counts do not update consistently.
- Back navigation to feed does not preserve scroll intentionally; the Redux feed may persist, but scroll position is not handled.

## Auth Edge Cases Not Handled

- Expired access token is refreshed globally, but refresh failure redirects without "Your session has expired. Please log in again."
- Protected-route middleware only checks for refresh cookie presence; invalid/expired refresh cookies are not detected until a client API call.
- Logged-out access to `/feed` redirects to `/login` without a `redirectTo` return path.
- Authenticated users visiting `/login` or `/register` are always redirected to `/feed`, even if they intended another page.
- No 403 page exists; forbidden API responses would need component-level handling.
- No global normalized error object; components still parse raw Axios shapes.

## Audit Conclusion

The app already has a useful foundation: a consistent backend envelope, a centralized Axios instance with token refresh, Redux slices, feed skeletons, a basic toast, and optimistic likes. The production UX gap is consistency. The highest-impact fixes should centralize normalized API errors, session-expired redirect messaging, reusable loading/button/toast/form-error components, and non-silent handling for comments, replies, likes, delete, and feed failures.
