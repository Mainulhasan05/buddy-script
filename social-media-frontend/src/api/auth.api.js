import axiosInstance from './axiosInstance';

const API_URL = (process.env.NEXT_PUBLIC_API_URL || '').replace(/\/$/, '');

export const authApi = {
  register: (data) => axiosInstance.post('/auth/register', data),
  login: (data) => axiosInstance.post('/auth/login', data),
  logout: () => axiosInstance.post('/auth/logout'),
  refresh: () => axiosInstance.post('/auth/refresh'),
  getMe: () => axiosInstance.get('/auth/me'),
  getGoogleLoginUrl: (redirectTo = '/feed') => {
    if (!API_URL) {
      throw new Error('NEXT_PUBLIC_API_URL is not configured');
    }

    return `${API_URL}/auth/google?redirectTo=${encodeURIComponent(redirectTo)}`;
  },
};
