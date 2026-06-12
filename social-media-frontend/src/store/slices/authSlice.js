'use client';

import { createSlice } from '@reduxjs/toolkit';

const initialState = {
  user: null,            // { id, firstName, lastName, email, avatar }
  accessToken: null,
  isAuthenticated: false,
  loading: false,
};

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    setCredentials(state, action) {
      const { user, accessToken } = action.payload;
      state.user = user;
      state.accessToken = accessToken;
      state.isAuthenticated = true;
      state.loading = false;
    },
    setUser(state, action) {
      state.user = action.payload;
      state.isAuthenticated = true;
      state.loading = false;
    },
    setAccessToken(state, action) {
      state.accessToken = action.payload;
    },
    setLoading(state, action) {
      state.loading = action.payload;
    },
    logout(state) {
      state.user = null;
      state.accessToken = null;
      state.isAuthenticated = false;
      state.loading = false;
    },
  },
});

export const { setCredentials, setUser, setAccessToken, setLoading, logout } = authSlice.actions;
export default authSlice.reducer;
