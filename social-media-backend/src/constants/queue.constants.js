const EXCHANGES = {
  SOCIAL_EVENTS: 'social.events',
};

const QUEUES = {
  LIKE_COUNTER: 'q.like.counter',
  COMMENT_COUNTER: 'q.comment.counter',
  FEED_INVALIDATE: 'q.feed.invalidate',
};

const ROUTING_KEYS = {
  LIKE_CREATED: 'like.created',
  LIKE_DELETED: 'like.deleted',
  COMMENT_CREATED: 'comment.created',
  POST_CREATED: 'post.created',
};

module.exports = { EXCHANGES, QUEUES, ROUTING_KEYS };
