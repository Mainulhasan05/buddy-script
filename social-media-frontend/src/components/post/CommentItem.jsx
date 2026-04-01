'use client';

import { useState } from 'react';
import { commentApi } from '@/src/api/comment.api';
import LikeButton from './LikeButton';

export default function CommentItem({ comment }) {
  const [showReplies, setShowReplies] = useState(false);
  const [replies, setReplies] = useState([]);
  const [replyText, setReplyText] = useState('');
  const [replyLoading, setReplyLoading] = useState(false);
  const [repliesLoaded, setRepliesLoaded] = useState(false);
  const [repliesCursor, setRepliesCursor] = useState(null);
  const [repliesHasMore, setRepliesHasMore] = useState(false);

  const loadReplies = async () => {
    if (repliesLoaded) { setShowReplies((v) => !v); return; }
    try {
      const { data } = await commentApi.getReplies(comment._id);
      setReplies(data.data);
      setRepliesCursor(data.pagination?.nextCursor ?? null);
      setRepliesHasMore(data.pagination?.hasMore ?? false);
      setRepliesLoaded(true);
      setShowReplies(true);
    } catch { /* silent */ }
  };

  const submitReply = async (e) => {
    e.preventDefault();
    if (!replyText.trim()) return;
    setReplyLoading(true);
    try {
      const { data } = await commentApi.addReply(comment._id, replyText.trim());
      setReplies((prev) => [...prev, data.data]);
      setReplyText('');
      setShowReplies(true);
    } catch { /* silent */ } finally { setReplyLoading(false); }
  };

  return (
    <div className="_comment_main" style={{ marginBottom: 16 }}>
      <div className="_comment_image">
        <img
          src={comment.author.avatarUrl || '/assets/images/txt_img.png'}
          alt={comment.author.firstName}
          className="_comment_img1"
        />
      </div>
      <div className="_comment_area">
        <div className="_comment_details">
          <div className="_comment_details_top">
            <div className="_comment_name">
              <h4 className="_comment_name_title">
                {comment.author.firstName} {comment.author.lastName}
              </h4>
            </div>
          </div>
          <div className="_comment_status">
            <p className="_comment_status_text">{comment.content}</p>
          </div>
          <div className="_total_reactions" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <LikeButton
              targetId={comment._id}
              targetType="comment"
              initialLiked={false}
              initialCount={comment.likeCount || 0}
            />
            {comment.depth === 0 && (
              <button
                type="button"
                onClick={loadReplies}
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: '#666' }}
              >
                {comment.replyCount > 0
                  ? `${showReplies ? 'Hide' : 'View'} ${comment.replyCount} repl${comment.replyCount === 1 ? 'y' : 'ies'}`
                  : 'Reply'}
              </button>
            )}
          </div>
        </div>

        {showReplies && (
          <div style={{ marginTop: 12, paddingLeft: 16 }}>
            {replies.map((r) => (
              <CommentItem key={r._id} comment={r} />
            ))}
            {repliesHasMore && (
              <button
                type="button"
                onClick={async () => {
                  const { data } = await commentApi.getReplies(comment._id, repliesCursor);
                  setReplies((prev) => [...prev, ...data.data]);
                  setRepliesCursor(data.pagination?.nextCursor ?? null);
                  setRepliesHasMore(data.pagination?.hasMore ?? false);
                }}
                style={{ fontSize: 13, color: '#377DFF', background: 'none', border: 'none', cursor: 'pointer' }}
              >
                Load more replies
              </button>
            )}
            {comment.depth === 0 && (
              <form onSubmit={submitReply} style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <input
                  type="text"
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  placeholder="Write a reply..."
                  maxLength={1000}
                  className="form-control _comment_textarea"
                  style={{ flex: 1 }}
                />
                <button
                  type="submit"
                  className="_feed_inner_text_area_btn_link"
                  disabled={replyLoading || !replyText.trim()}
                  style={{ padding: '6px 14px', whiteSpace: 'nowrap' }}
                >
                  {replyLoading ? '...' : 'Reply'}
                </button>
              </form>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
