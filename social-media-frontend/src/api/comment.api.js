import axiosInstance from './axiosInstance';

export const commentApi = {
  getComments: (postId, cursor) =>
    axiosInstance.get(`/posts/${postId}/comments`, { params: { cursor, limit: 20 } }),

  addComment: (postId, content) =>
    axiosInstance.post(`/posts/${postId}/comments`, { content }),

  getReplies: (commentId, cursor) =>
    axiosInstance.get(`/comments/${commentId}/replies`, { params: { cursor, limit: 10 } }),

  addReply: (commentId, content) =>
    axiosInstance.post(`/comments/${commentId}/replies`, { content }),
};
