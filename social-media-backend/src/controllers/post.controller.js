const postService = require('../services/post.service');
const { sendSuccess } = require('../utils/response.util');

const createPost = async (req, res, next) => {
  try {
    const { content, visibility } = req.body;

    const post = await postService.createPost({
      userId: req.user.id,
      content,
      file: req.file || null,
      visibility,
    });

    sendSuccess(res, 'Post created', post, 201);
  } catch (err) {
    next(err);
  }
};

const getFeed = async (req, res, next) => {
  try {
    const { cursor, limit } = req.query;
    const result = await postService.getFeed({ cursor, limit, userId: req.user?.id });
    // Allow browser to cache feed for 10s — reduces backend load during rapid scroll
    res.set('Cache-Control', 'private, max-age=10');
    sendSuccess(res, 'Feed fetched', result.posts, 200, result.pagination);
  } catch (err) {
    next(err);
  }
};

const getPost = async (req, res, next) => {
  try {
    const post = await postService.getPost(req.params.postId, req.user.id);
    sendSuccess(res, 'Post fetched', post);
  } catch (err) {
    next(err);
  }
};

const deletePost = async (req, res, next) => {
  try {
    await postService.deletePost({ postId: req.params.postId, userId: req.user.id });
    sendSuccess(res, 'Post deleted');
  } catch (err) {
    next(err);
  }
};

const getMyPosts = async (req, res, next) => {
  try {
    const { cursor, limit } = req.query;
    const result = await postService.getMyPosts({ userId: req.user.id, cursor, limit });
    sendSuccess(res, 'My posts fetched', result.posts, 200, result.pagination);
  } catch (err) {
    next(err);
  }
};

module.exports = { createPost, getFeed, getPost, deletePost, getMyPosts };
