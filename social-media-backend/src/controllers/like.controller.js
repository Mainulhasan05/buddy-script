const likeService = require('../services/like.service');
const { sendSuccess } = require('../utils/response.util');

const toggle = async (req, res, next) => {
  try {
    const { targetId, targetType } = req.body;
    const result = await likeService.toggle({
      userId: req.user.id,
      targetId,
      targetType,
    });
    sendSuccess(res, result.isLiked ? 'Liked' : 'Unliked', result);
  } catch (err) {
    next(err);
  }
};

const getLikers = async (req, res, next) => {
  try {
    const { targetType, targetId } = req.params;
    const { cursor, limit } = req.query;
    const result = await likeService.getLikers({ targetId, targetType, cursor, limit });
    sendSuccess(res, 'Likers fetched', result.likers, 200, result.pagination);
  } catch (err) {
    next(err);
  }
};

module.exports = { toggle, getLikers };
