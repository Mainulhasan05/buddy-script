'use client';

import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { postApi } from '@/src/api/post.api';

// ─── Async Thunks ────────────────────────────────────────────────────────────

export const fetchFeed = createAsyncThunk('feed/fetchFeed', async (_, { rejectWithValue }) => {
  try {
    const { data } = await postApi.getFeed();
    return { posts: data.data, pagination: data.pagination };
  } catch (err) {
    return rejectWithValue(err.response?.data?.message || 'Failed to load feed');
  }
});

export const fetchNextPage = createAsyncThunk(
  'feed/fetchNextPage',
  async (cursor, { rejectWithValue }) => {
    try {
      const { data } = await postApi.getFeed(cursor);
      return { posts: data.data, pagination: data.pagination };
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || 'Failed to load more posts');
    }
  }
);

// ─── Slice ────────────────────────────────────────────────────────────────────

const initialState = {
  posts: [],
  nextCursor: null,
  hasMore: true,
  loading: false,
  creating: false,
  error: null,
};

const feedSlice = createSlice({
  name: 'feed',
  initialState,
  reducers: {
    setCreating(state, action) {
      state.creating = action.payload;
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
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      // fetchFeed
      .addCase(fetchFeed.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchFeed.fulfilled, (state, action) => {
        const { posts, pagination } = action.payload;
        state.posts = posts;
        state.nextCursor = pagination?.nextCursor ?? null;
        state.hasMore = pagination?.hasMore ?? false;
        state.loading = false;
      })
      .addCase(fetchFeed.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })
      // fetchNextPage
      .addCase(fetchNextPage.pending, (state) => {
        state.loading = true;
      })
      .addCase(fetchNextPage.fulfilled, (state, action) => {
        const { posts, pagination } = action.payload;
        state.posts.push(...posts);
        state.nextCursor = pagination?.nextCursor ?? null;
        state.hasMore = pagination?.hasMore ?? false;
        state.loading = false;
      })
      .addCase(fetchNextPage.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      });
  },
});

export const {
  setCreating,
  prependPost,
  removePost,
  updatePostLikeCount,
  resetFeed,
} = feedSlice.actions;

export default feedSlice.reducer;
