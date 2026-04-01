'use client';

import { useState } from 'react';
import { likeApi } from '@/src/api/like.api';

export function useOptimisticLike({ targetId, targetType, initialLiked, initialCount }) {
  const [isLiked, setIsLiked] = useState(initialLiked);
  const [count, setCount] = useState(initialCount);
  const [isPending, setIsPending] = useState(false);

  const toggle = async () => {
    if (isPending) return;

    // Optimistic update — instant UI feedback before server responds
    setIsLiked((prev) => !prev);
    setCount((prev) => (isLiked ? prev - 1 : prev + 1));
    setIsPending(true);

    try {
      const { data } = await likeApi.toggle({ targetId, targetType });
      // Sync with server count
      setCount(data.data.likeCount);
      setIsLiked(data.data.isLiked);
    } catch {
      // Revert on failure
      setIsLiked((prev) => !prev);
      setCount((prev) => (isLiked ? prev + 1 : prev - 1));
    } finally {
      setIsPending(false);
    }
  };

  return { isLiked, count, toggle, isPending };
}
