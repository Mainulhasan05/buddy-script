import axiosInstance from './axiosInstance';

export const postApi = {
  getFeed: (cursor) =>
    axiosInstance.get('/posts/feed', { params: { cursor, limit: 20 } }),

  getMyPosts: (cursor) =>
    axiosInstance.get('/posts/my', { params: { cursor, limit: 20 } }),

  getPost: (postId) => axiosInstance.get(`/posts/${postId}`),

  createPost: (formData, config = {}) =>
    axiosInstance.post('/posts', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      ...config,
    }),

  deletePost: (postId) => axiosInstance.delete(`/posts/${postId}`),
};
