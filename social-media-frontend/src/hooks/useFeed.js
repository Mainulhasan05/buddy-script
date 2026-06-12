'use client';

import { useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { fetchFeed, fetchNextPage } from '@/src/store/slices/feedSlice';

export function useFeed() {
  const dispatch = useDispatch();
  const { posts, nextCursor, hasMore, loading, loadingMore, error } = useSelector((s) => s.feed);

  useEffect(() => {
    if (posts.length === 0) {
      dispatch(fetchFeed());
    }
  }, [dispatch, posts.length]);

  const loadMore = () => {
    if (!loading && !loadingMore && hasMore && nextCursor) {
      dispatch(fetchNextPage(nextCursor));
    }
  };

  const retry = () => dispatch(fetchFeed());

  return { posts, nextCursor, hasMore, loading, loadingMore, error, loadMore, retry };
}
