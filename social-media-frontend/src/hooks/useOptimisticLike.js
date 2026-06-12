'use client';

import { useState } from 'react';
import { useDispatch } from 'react-redux';
import { likeApi } from '@/src/api/like.api';
import { showToast } from '@/src/store/slices/uiSlice';
import { updatePostLikeCount } from '@/src/store/slices/feedSlice';
import { getErrorMessage } from '@/src/utils/apiError';

export function useOptimisticLike({ targetId, targetType, initialLiked, initialCount }) {
  const dispatch = useDispatch();
  const [isLiked, setIsLiked] = useState(initialLiked);
  const [count, setCount] = useState(initialCount);
  const [isPending, setIsPending] = useState(false);

  const toggle = async () => {
    if (isPending) return;

    const originalLiked = isLiked;
    const originalCount = count;
    const nextLiked = !originalLiked;
    const nextCount = originalLiked ? originalCount - 1 : originalCount + 1;

    // Optimistic update — instant UI feedback before server responds
    setIsLiked(nextLiked);
    setCount(nextCount);
    setIsPending(true);

    if (targetType === 'post') {
      dispatch(updatePostLikeCount({ postId: targetId, likeCount: nextCount, isLiked: nextLiked }));
    }

    try {
      const { data } = await likeApi.toggle({ targetId, targetType });
      // Server returns { isLiked, delta } — sync state with confirmed values
      const serverLiked = data.data.isLiked;
      // If server returned delta=0 (race condition), restore original state
      const serverDelta = data.data.delta ?? 0;
      const confirmedCount = serverDelta === 0 ? originalCount : nextCount;
      setCount(confirmedCount);
      setIsLiked(serverLiked);
      if (targetType === 'post') {
        dispatch(updatePostLikeCount({ postId: targetId, likeCount: confirmedCount, isLiked: serverLiked }));
      }
    } catch (err) {
      // Revert on failure
      setIsLiked(originalLiked);
      setCount(originalCount);
      if (targetType === 'post') {
        dispatch(updatePostLikeCount({ postId: targetId, likeCount: originalCount, isLiked: originalLiked }));
      }
      dispatch(
        showToast({
          message: getErrorMessage(err, "We couldn't update your reaction. Please try again."),
          type: 'error',
        })
      );
    } finally {
      setIsPending(false);
    }
  };

  return { isLiked, count, toggle, isPending };
}
