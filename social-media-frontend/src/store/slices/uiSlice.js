'use client';

import { createSlice } from '@reduxjs/toolkit';

const initialState = {
  createPostModal: false,
  likeListModal: {
    open: false,
    targetId: null,
    targetType: null,
  },
  toasts: [],
  darkMode: false,
};

const uiSlice = createSlice({
  name: 'ui',
  initialState,
  reducers: {
    openCreatePostModal(state) {
      state.createPostModal = true;
    },
    closeCreatePostModal(state) {
      state.createPostModal = false;
    },
    openLikeListModal(state, action) {
      const { targetId, targetType } = action.payload;
      state.likeListModal = { open: true, targetId, targetType };
    },
    closeLikeListModal(state) {
      state.likeListModal = { open: false, targetId: null, targetType: null };
    },
    showToast(state, action) {
      const { message, type = 'info', duration = 3000 } = action.payload;
      state.toasts.push({
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        message,
        type,
        duration,
      });
    },
    hideToast(state, action) {
      state.toasts = state.toasts.filter((toast) => toast.id !== action.payload);
    },
    toggleDarkMode(state) {
      state.darkMode = !state.darkMode;
    },
    setDarkMode(state, action) {
      state.darkMode = action.payload;
    },
  },
});

export const {
  openCreatePostModal,
  closeCreatePostModal,
  openLikeListModal,
  closeLikeListModal,
  showToast,
  hideToast,
  toggleDarkMode,
  setDarkMode,
} = uiSlice.actions;

export default uiSlice.reducer;
