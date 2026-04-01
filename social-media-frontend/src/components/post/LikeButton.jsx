'use client';

import { useOptimisticLike } from '@/src/hooks/useOptimisticLike';

export default function LikeButton({ targetId, targetType, initialLiked = false, initialCount = 0 }) {
  const { isLiked, count, toggle, isPending } = useOptimisticLike({
    targetId,
    targetType,
    initialLiked,
    initialCount,
  });

  return (
    <button
      type="button"
      className={`_feed_inner_timeline_reaction_emoji _feed_reaction${isLiked ? ' _feed_reaction_active' : ''}`}
      onClick={toggle}
      disabled={isPending}
      aria-label={isLiked ? 'Unlike' : 'Like'}
    >
      <span className="_feed_inner_timeline_reaction_link">
        <span>
          {isLiked ? (
            <svg xmlns="http://www.w3.org/2000/svg" width="19" height="19" viewBox="0 0 24 24" fill="#377DFF">
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
            </svg>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
            </svg>
          )}
          {count > 0 && <span style={{ marginLeft: 4 }}>{count}</span>}
        </span>
      </span>
    </button>
  );
}
