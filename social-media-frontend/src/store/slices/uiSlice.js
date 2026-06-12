'use client';

import { createSlice } from '@reduxjs/toolkit';

const initialState = {
  createPostModal: false,
  likeListModal: {
    open: false,
    targetId: null,
    targetType: null,
  },
  toast: {
    message: '',
    type: 'info', // 'info' | 'success' | 'error'
    visible: false,
  },
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
      const { message, type = 'info' } = action.payload;
      state.toast = { message, type, visible: true };
    },
    hideToast(state) {
      state.toast.visible = false;
    },
    toggleDarkMode(state) {
      state.darkMode = !state.darkMode;
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
} = uiSlice.actions;

export default uiSlice.reducer;
