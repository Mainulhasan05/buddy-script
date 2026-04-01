'use client';

import { createSlice } from '@reduxjs/toolkit';

const initialState = {
  posts: [],
  nextCursor: null,
  hasMore: true,
  loading: false,
  creating: false,
};

const feedSlice = createSlice({
  name: 'feed',
  initialState,
  reducers: {
    setLoading(state, action) {
      state.loading = action.payload;
    },
    setCreating(state, action) {
      state.creating = action.payload;
    },
    setPosts(state, action) {
      const { posts, nextCursor, hasMore } = action.payload;
      state.posts = posts;
      state.nextCursor = nextCursor;
      state.hasMore = hasMore;
      state.loading = false;
    },
    appendPosts(state, action) {
      const { posts, nextCursor, hasMore } = action.payload;
      state.posts.push(...posts);
      state.nextCursor = nextCursor;
      state.hasMore = hasMore;
      state.loading = false;
    },
    prependPost(state, action) {
      state.posts.unshift(action.payload);
      state.creating = false;
    },
    removePost(state, action) {
      state.posts = state.posts.filter((p) => p._id !== action.payload);
    },
    updatePostLikeCount(state, action) {
      const { postId, likeCount } = action.payload;
      const post = state.posts.find((p) => p._id === postId);
      if (post) post.likeCount = likeCount;
    },
    resetFeed(state) {
      state.posts = [];
      state.nextCursor = null;
      state.hasMore = true;
      state.loading = false;
    },
  },
});

export const {
  setLoading,
  setCreating,
  setPosts,
  appendPosts,
  prependPost,
  removePost,
  updatePostLikeCount,
  resetFeed,
} = feedSlice.actions;

export default feedSlice.reducer;
