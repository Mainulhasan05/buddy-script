'use client';

import { useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { fetchFeed, fetchNextPage } from '@/src/store/slices/feedSlice';

export function useFeed() {
  const dispatch = useDispatch();
  const { posts, nextCursor, hasMore, loading, error } = useSelector((s) => s.feed);

  useEffect(() => {
    if (posts.length === 0) {
      dispatch(fetchFeed());
    }
  }, [dispatch, posts.length]);

  const loadMore = () => {
    if (!loading && hasMore && nextCursor) {
      dispatch(fetchNextPage(nextCursor));
    }
  };

  return { posts, nextCursor, hasMore, loading, error, loadMore };
}
