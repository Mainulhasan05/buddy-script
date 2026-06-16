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

// Durable "session is dead" latch. Once a refresh fails, we stop attempting any
// further refreshes until the user logs in again. It lives in sessionStorage so it
// survives the hard redirect/reload below — otherwise the interceptor's module state
// resets on reload and re-arms the refresh, producing an infinite refresh loop when
// the refresh endpoint keeps returning 401.
const SESSION_DEAD_KEY = 'authSessionExpired';

const isSessionDead = () => {
  if (typeof window === 'undefined') return false;
  try {
    return window.sessionStorage.getItem(SESSION_DEAD_KEY) === '1';
  } catch {
    return false;
  }
};

const markSessionDead = () => {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(SESSION_DEAD_KEY, '1');
  } catch {
    /* sessionStorage unavailable (private mode etc.) — latch degrades to in-memory only */
  }
};

// Called on successful login/register so a fresh session can refresh again.
export const clearSessionExpired = () => {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.removeItem(SESSION_DEAD_KEY);
  } catch {
    /* ignore */
  }
};

const processQueue = (error, token = null) => {
  failedQueue.forEach(({ resolve, reject }) => {
    if (error) reject(error);
    else resolve(token);
  });
  failedQueue = [];
};

const redirectToLogin = () => {
  if (typeof window === 'undefined') return;
  // Already on the login page — don't redirect again (prevents reload loops when
  // the route middleware or another in-flight request bounces us back here).
  if (window.location.pathname.startsWith('/login')) return;
  const current = `${window.location.pathname}${window.location.search}`;
  const redirectTo = encodeURIComponent(current || '/feed');
  window.location.href = `/login?reason=session-expired&redirectTo=${redirectTo}`;
};

const shouldAttemptRefresh = (error) => {
  const url = error.config?.url || '';
  if (!error.response || error.response.status !== 401) return false;
  // Never attempt a refresh once the session has been marked dead — this is the
  // primary guard that breaks the refresh loop.
  if (isSessionDead()) return false;
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
        // Refresh failed for good — latch the session as dead so no further request
        // (queued or future, even across the reload below) attempts another refresh.
        markSessionDead();
        processQueue(refreshError, null);
        document.cookie = 'isLoggedIn=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
        store?.dispatch(logout());
        store?.dispatch(resetFeed());

        redirectToLogin();
        return Promise.reject(normalizeApiError(refreshError));
      } finally {
        isRefreshing = false;
      }
    }

    // 401 on a protected request while the session is already latched as dead:
    // don't refresh (would loop), just make sure the user lands on /login.
    if (error.response?.status === 401 && isSessionDead()) {
      redirectToLogin();
    }

    return Promise.reject(normalizeApiError(error));
  }
);

export default axiosInstance;
