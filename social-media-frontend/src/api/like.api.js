import axiosInstance from './axiosInstance';

export const likeApi = {
  toggle: ({ targetId, targetType }) =>
    axiosInstance.post('/likes/toggle', { targetId, targetType }),

  getLikers: (targetType, targetId, cursor) =>
    axiosInstance.get(`/likes/${targetType}/${targetId}`, { params: { cursor, limit: 20 } }),
};
