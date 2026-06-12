# UX Improvement Plan

Phase 2 plan for applying production-grade UX consistently across the social media app. This plan is based on `UX_AUDIT.md` and must be approved before Phase 3 shared infrastructure work begins.

## UX Standard

Every user action must answer four questions clearly:

- What is happening?
- Did it work?
- If it failed, what can I do next?
- Is my current session still valid?

No user-facing action should fail silently. No raw API errors, status codes, stack traces, or backend wording should be shown directly to users.

## 1. Loading States

Initial page/data load:

- Use skeleton screens, not generic spinners.
- Feed: `PostSkeleton`.
- Comments: new `CommentSkeleton`.
- Like list / user list: new `UserListItemSkeleton`.
- Auth session hydration: small page-level skeleton or stable auth shell, never blank white.

Button actions:

- Use one shared `Button` component.
- Props: `loading`, `loadingLabel`, `variant`, `disabled`, `children`.
- Loading state preserves button width, disables click, and shows an inline spinner next to the loading label.
- Examples:
  - `Login now` -> `Logging in...`
  - `Register now` -> `Creating account...`
  - `Post` -> `Posting...`
  - `Reply` -> `Replying...`
  - `Delete Post` -> `Deleting...`
  - `Log Out` -> `Logging out...`

Background refetch:

- Use subtle inline text or a small non-blocking indicator near the section being refreshed.
- Do not hide existing content during background loading.

File/image upload:

- Use an upload progress bar with percentage in the create-post modal.
- Label: `Uploading your photo...`
- Keep the modal open until the upload finishes or fails.
- If upload fails, preserve the draft and image selection when possible.

Infinite scroll / pagination:

- Use a bottom spinner or compact bottom loading row, not a full post skeleton after content already exists.
- Feed class/component: `PaginationSpinner`.
- Comments/replies: `LoadMoreButton` with inline loading state.

Exact shared components/classes to add in Phase 3:

- `src/components/ui/Button.jsx`
- `src/components/ui/InlineSpinner.jsx`
- `src/components/ui/PaginationSpinner.jsx`
- `src/components/ui/skeletons/PostSkeleton.jsx` or keep existing `PostSkeleton` and export through a skeletons barrel.
- `src/components/ui/skeletons/CommentSkeleton.jsx`
- `src/components/ui/skeletons/UserListItemSkeleton.jsx`

## 2. Error Messages

All API errors must pass through a normalized client error object:

```js
{
  type: 'network' | 'validation' | 'auth' | 'forbidden' | 'not_found' | 'server' | 'rate_limit' | 'unknown',
  message: 'Human message for toast/inline fallback',
  fieldErrors: { fieldName: 'Human field message' },
  status: 500,
  retryAfter: null
}
```

Network errors:

- Message: `We couldn't connect. Check your internet and try again.`
- Show as toast for actions, inline retry state for page/list loads.

Validation errors:

- Show inline under the relevant field.
- Do not use a generic toast when field errors are available.
- Preserve user input.
- Backend field names must map to frontend fields:
  - `firstName`, `lastName`, `email`, `password`, `content`, `visibility`, `image`.

Auth errors:

- On `401 AUTH_TOKEN_EXPIRED`, try refresh once through the API client.
- If refresh fails or no refresh token exists:
  - Clear auth and feed state.
  - Redirect to `/login?reason=session-expired&redirectTo=<current path>`.
  - Show: `Your session has expired. Please log in again.`

Forbidden errors:

- Show an inline or page-level message: `You don't have permission to do that.`
- For protected page access, show a 403 page with a return-to-feed action.

Not found errors:

- Post not found: `We couldn't find that post. It may have been deleted.`
- Comment not found: `We couldn't find that comment. It may have been deleted.`
- Include a navigation option where the whole page is affected.

Server errors:

- Message: `We're having trouble right now. Please try again.`
- Provide a retry button for page/list loads.
- For button actions, restore the original button state and show a toast.

Rate limit errors:

- Message without retry header: `Too many attempts. Please wait a few minutes and try again.`
- Message with retry header: `Too many attempts. Please try again in {time}.`

Upload errors:

- File too large: `That image is too large. Choose an image under 5 MB.`
- Unsupported type: `Use a JPEG, PNG, or WebP image.`
- Upload/server failure: `We couldn't upload your photo. Please try again.`

Action-specific messages:

- Login invalid credentials: `That email or password doesn't look right.`
- Email taken: `That email is already registered. Try logging in instead.`
- Create post failed: `We couldn't publish your post. Please try again.`
- Delete post failed: `We couldn't delete that post. Please try again.`
- Comment failed: `We couldn't post your comment. Please try again.`
- Reply failed: `We couldn't post your reply. Please try again.`
- Like failed: `We couldn't update your reaction. Please try again.`
- Likes list failed: `We couldn't load the likes. Please try again.`

## 3. Success Feedback

Form submissions that navigate away:

- Login/register need no success toast because navigation is the feedback.
- Preserve intended navigation after login.

Form submissions that stay on the same page:

- Use toast notification, top-right on desktop and top-center on mobile.
- Auto-dismiss after 3 seconds.
- Dismissible.

Messages:

- Post creation: `Your post is live.`
- Comment creation: `Comment posted.`
- Reply creation: `Reply posted.`
- Delete post: `Post deleted.`
- Logout: no toast needed after redirect.
- Upload completion inside modal: `Uploaded successfully.`

Destructive actions:

- Show confirmation modal first.
- Then run the action with a loading state.
- Then show success toast and remove the item immediately.
- Never use `window.confirm()`.

Optimistic actions:

- Like/unlike updates instantly.
- On error, revert silently and show a subtle toast: `We couldn't update your reaction. Please try again.`
- Do not block the feed while the request is in flight.

## 4. Form Validation

Validation timing:

- Validate on blur.
- After a field has shown an error once, re-validate that field on change.
- On submit attempt, show all field errors at once.

Submit behavior:

- Disable submit only while a request is in flight.
- Do not disable because of validation state; show errors instead.
- Prevent duplicate submissions with `loading`.

Required fields:

- Mark labels clearly with a subtle `Required` indicator or `*`.

Character limits:

- Post content: show live counter when content reaches 1800/2000.
- Comment/reply: show live counter when content reaches 900/1000.
- Use warning color near limit and error color at limit.

Password fields:

- Add show/hide toggle to login and register password fields.
- Register password validation:
  - At least 8 characters.
  - One uppercase letter.
  - One number.
- Confirm password validation:
  - `Passwords do not match.`

Server validation:

- Map `errors[]` from the API into field-level messages.
- Show non-field validation as an inline form alert only when no field can own the error.

## 5. Empty States

Every list/feed section must use one shared `EmptyState` component:

- Props: `icon`, `heading`, `subtext`, optional `actionLabel`, optional `onAction`/`href`.
- Never leave a blank white area.

Required empty states:

- Feed: heading `No posts yet`; subtext `Be the first to share something with your community.`; action `Create a post`.
- Comments: heading `No comments yet`; subtext `Start the conversation.`
- Replies: heading `No replies yet`; subtext `Reply to keep the conversation going.`
- Likes list: heading `No likes yet`; subtext `Reactions will appear here.`
- Search/static areas until implemented: either remove fake controls or show `Search is not available yet.`

## 6. Transition & Navigation Flow

Page transitions:

- Avoid blank white flashes by keeping layout shells stable and using skeletons.

Login flow:

- Logged-out protected access redirects to `/login?redirectTo=<path>`.
- After login/register, redirect to `redirectTo` when safe; otherwise `/feed`.
- Show session-expired message when `reason=session-expired`.

Logout flow:

- On logout click:
  - Show button loading.
  - Call logout API best effort.
  - Clear auth and feed state before redirect.
  - Redirect to `/login`.

Creation flow:

- After post creation, prepend post immediately and close modal.
- After comment/reply creation, append item immediately and update visible counts.
- Preserve draft content on failed create/comment/reply.

Deletion flow:

- Delete post after confirmation.
- Remove item immediately on success without full page reload.
- Keep item visible if deletion fails.

Scroll flow:

- Preserve feed scroll position when opening/closing comments and likes modal.
- Preserve feed scroll position when navigating away and back where possible.

## 7. Auth Edge Cases

Expired access token:

- API client silently refreshes once.
- Queued requests wait for refresh.
- If refresh fails, clear state and redirect with session-expired message.

Logged-out protected access:

- Middleware redirects to login with `redirectTo`.
- Login page displays normal login form, not an error.
- After successful login, return to the intended route.

Forbidden access:

- Add a reusable forbidden state/page.
- Message: `You don't have permission to view this.`
- Action: `Back to Feed`.

Invalid refresh cookie:

- Client detects on first API call and redirects with session-expired message.
- Longer-term backend/middleware validation can be considered later, but Phase 3 should handle client UX first.

## Shared UX Infrastructure To Build In Phase 3

1. Toast / notification system
   - API: `toast.success(message)`, `toast.error(message)`, `toast.info(message)`.
   - Multiple stacked toasts.
   - ARIA live region.
   - Top-right desktop, top-center mobile.
   - Configurable duration, default 3000 ms.

2. API client wrapper
   - Attach auth headers.
   - Normalize errors.
   - Refresh token on 401.
   - Redirect with session-expired reason when refresh fails.
   - Never leak raw Axios errors to components.

3. Loading button
   - Reusable `Button`.
   - `loading`, `loadingLabel`, `variant`, `disabled`.
   - Width-preserving inline spinner.

4. Form error display
   - `FormFieldError`.
   - `FormAlert`.
   - Field-level errors from client or server.

5. Skeletons
   - `PostSkeleton`.
   - `CommentSkeleton`.
   - `UserListItemSkeleton`.
   - `ProfileCardSkeleton` for future profile work.

6. Confirmation modal
   - Props: `title`, `message`, `confirmLabel`, `cancelLabel`, `onConfirm`, `variant`.
   - Used for delete post and future destructive actions.

7. Empty state
   - Reusable `EmptyState`.
   - Supports icon, heading, subtext, optional action.

8. Retryable state
   - `RetryState` for failed page/list loads.
   - Shows message and retry button.

## Page / Component Change List By Priority

### Critical

1. `src/api/axiosInstance.js`
   - Normalize all errors.
   - Preserve session-expired message and redirect target.
   - Clear auth/feed state on unrecoverable auth failure.

2. `src/components/post/CommentSection.jsx`
   - Replace silent catches with visible retry/toast/inline errors.
   - Use comment skeleton for initial load.
   - Add field validation and inline field error.
   - Update visible comment count after success.

3. `src/components/post/CommentItem.jsx`
   - Add loading state for first reply load.
   - Add catch handling for load-more replies.
   - Add reply validation and inline errors.
   - Update reply count after success.

4. `src/components/feed/FeedContainer.jsx`
   - Render feed error state with retry instead of hidden Redux error.
   - Keep skeleton only for initial load.
   - Use bottom spinner for pagination.

5. `src/components/feed/PostCard.jsx`
   - Replace `window.confirm()` with confirmation modal.
   - Add delete loading state.
   - Show success/error toast.

### High

6. `src/components/auth/LoginForm.jsx`
   - Add field-level validation on blur.
   - Add password show/hide toggle.
   - Map API errors to user-friendly copy.
   - Support `redirectTo` and `reason=session-expired`.
   - Use shared loading button.

7. `src/components/auth/RegisterForm.jsx`
   - Add field-level validation on blur.
   - Add password show/hide toggles.
   - Show password rules and confirm-password error.
   - Map server validation errors inline.
   - Replace terms radio with checkbox and enforce it.
   - Use shared loading button.

8. `src/components/feed/CreatePostModal.jsx`
   - Add client-side image validation.
   - Add upload progress.
   - Preserve draft on failure.
   - Show success toast after creation.
   - Stop disabling submit due only to validation state.
   - Add discard confirmation when closing with unsaved content.

9. `src/hooks/useOptimisticLike.js` and `src/components/post/LikeButton.jsx`
   - Use normalized error handling.
   - Show subtle toast on revert.
   - Sync visible counts consistently with parent/feed state.
   - Support real initial liked state when backend provides it later.

10. `src/components/post/LikeList.jsx`
    - Use user-list skeleton.
    - Show retry state on failed fetch.
    - Use reusable empty state.
    - Add loading button for pagination.

### Medium

11. `src/components/layout/Navbar.jsx`
    - Add logout loading state.
    - Clear state before redirect.
    - Decide whether search is implemented; if not, remove or disable with clear feedback.

12. `middleware.js`
    - Preserve `redirectTo` when redirecting logged-out users.
    - Avoid always forcing authenticated users to `/feed` if a safe target exists.

13. `src/components/ui/Toast.jsx`
    - Replace single-toast Redux state with stackable toast system.
    - Move to top-right/top-center.
    - Improve mobile placement and accessibility.

14. `src/store/slices/feedSlice.js`
    - Separate initial loading from pagination loading.
    - Store normalized errors.
    - Add reducers for count updates after comment/reply/like changes.

15. `app/not-found.jsx`
    - Keep current friendly 404, but align styling with shared error/empty-state language.

### Polish

16. `src/components/layout/LeftSidebar.jsx` and `RightSidebar.jsx`
    - Remove fake actionable links/buttons or mark unavailable with clear feedback.
    - Avoid `href="#0"` for non-routes.

17. Dark mode
    - Persist preference.
    - Ensure modal/toast/skeleton states are readable in dark mode.

18. Text and mojibake cleanup
    - Replace broken characters in close buttons, visibility labels, and comments.
    - Keep copy plain and consistent.

19. Scroll preservation
    - Preserve feed scroll when navigating away and back.
    - Ensure modal open/close does not jump page position.

## Implementation Order After Approval

Phase 3 shared infrastructure:

1. Toast system.
2. API client normalization and auth redirect flow.
3. Shared `Button`, `InlineSpinner`, and pagination loader.
4. Form error components and validation helpers.
5. Skeletons.
6. Confirmation modal.
7. Empty and retry states.

Phase 4 pages/components:

1. Auth pages: login/register.
2. Feed page loading/error/empty states.
3. Post creation and deletion.
4. Comments and replies.
5. Likes and optimistic reactions.
6. Navbar/logout/session flow.
7. Static sidebar controls and polish items.

## Acceptance Checklist

Before a page/component is marked complete:

- Initial data load uses skeletons or stable shell.
- Every async button has inline loading and prevents duplicate clicks.
- Every API call has visible error handling.
- Validation errors show inline when field-specific.
- No raw API strings are exposed to users.
- Success is clear through navigation, toast, or immediate UI change.
- Destructive actions use confirmation modal.
- Empty lists use `EmptyState`.
- Auth expiry redirects with preserved message and intended destination.
- Loading always stops on success or failure.
