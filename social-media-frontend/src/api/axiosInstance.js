'use client';

import axios from 'axios';
import { setAccessToken, logout } from '@/src/store/slices/authSlice';
import { resetFeed } from '@/src/store/slices/feedSlice';
import { normalizeApiError } from '@/src/utils/apiError';

let store;

export const injectStore = (_store) => {
  store = _store;
};

const axiosInstance = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL,
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
});

// Request interceptor — attach access token from Redux store
axiosInstance.interceptors.request.use((config) => {
  const token = store?.getState()?.auth?.accessToken;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Response interceptor — silent token refresh on 401
let isRefreshing = false;
let failedQueue = [];

const processQueue = (error, token = null) => {
  failedQueue.forEach(({ resolve, reject }) => {
    if (error) reject(error);
    else resolve(token);
  });
  failedQueue = [];
};

const redirectToLogin = () => {
  if (typeof window === 'undefined') return;
  const current = `${window.location.pathname}${window.location.search}`;
  const redirectTo = encodeURIComponent(current || '/feed');
  window.location.href = `/login?reason=session-expired&redirectTo=${redirectTo}`;
};

const shouldAttemptRefresh = (error) => {
  const url = error.config?.url || '';
  if (!error.response || error.response.status !== 401) return false;
  return !['/auth/login', '/auth/register', '/auth/refresh', '/auth/logout'].some((path) =>
    url.includes(path)
  );
};

axiosInstance.interceptors.response.use(
  (res) => res,
  async (error) => {
    const originalRequest = error.config;

    if (shouldAttemptRefresh(error) && !originalRequest?._retry) {
      if (isRefreshing) {
        // Queue the request until token refresh completes
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        })
          .then((token) => {
            originalRequest.headers.Authorization = `Bearer ${token}`;
            return axiosInstance(originalRequest);
          })
          .catch((err) => Promise.reject(err));
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        const { data } = await axiosInstance.post('/auth/refresh');
        const newToken = data.data.accessToken;

        store?.dispatch(setAccessToken(newToken));
        processQueue(null, newToken);

        originalRequest.headers.Authorization = `Bearer ${newToken}`;
        return axiosInstance(originalRequest);
      } catch (refreshError) {
        processQueue(refreshError, null);
        store?.dispatch(logout());
        store?.dispatch(resetFeed());

        redirectToLogin();
        return Promise.reject(normalizeApiError(refreshError));
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(normalizeApiError(error));
  }
);

export default axiosInstance;
