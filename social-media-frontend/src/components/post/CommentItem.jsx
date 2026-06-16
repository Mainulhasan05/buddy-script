'use client';

import { useState } from 'react';
import Image from 'next/image';
import { useDispatch } from 'react-redux';
import { commentApi } from '@/src/api/comment.api';
import LikeButton from './LikeButton';
import { showToast } from '@/src/store/slices/uiSlice';
import Button from '@/src/components/ui/Button';
import EmptyState from '@/src/components/ui/EmptyState';
import InlineSpinner from '@/src/components/ui/InlineSpinner';
import { getErrorMessage } from '@/src/utils/apiError';

export default function CommentItem({ comment }) {
  const dispatch = useDispatch();
  const [showReplies, setShowReplies] = useState(false);
  const [replies, setReplies] = useState([]);
  const [replyText, setReplyText] = useState('');
  const [replyLoading, setReplyLoading] = useState(false);
  const [repliesLoading, setRepliesLoading] = useState(false);
  const [moreRepliesLoading, setMoreRepliesLoading] = useState(false);
  const [repliesLoaded, setRepliesLoaded] = useState(false);
  const [repliesCursor, setRepliesCursor] = useState(null);
  const [repliesHasMore, setRepliesHasMore] = useState(false);
  const [replyCount, setReplyCount] = useState(comment.replyCount || 0);
  const [replyError, setReplyError] = useState('');

  const loadReplies = async () => {
    if (repliesLoaded) {
      setShowReplies((v) => !v);
      return;
    }
    setRepliesLoading(true);
    try {
      const { data } = await commentApi.getReplies(comment._id);
      setReplies(data.data);
      setRepliesCursor(data.pagination?.nextCursor ?? null);
      setRepliesHasMore(data.pagination?.hasMore ?? false);
      setRepliesLoaded(true);
      setShowReplies(true);
    } catch (err) {
      dispatch(
        showToast({
          message: getErrorMessage(err, "We couldn't load replies. Please try again."),
          type: 'error',
        })
      );
    } finally {
      setRepliesLoading(false);
    }
  };

  const loadMoreReplies = async () => {
    setMoreRepliesLoading(true);
    try {
      const { data } = await commentApi.getReplies(comment._id, repliesCursor);
      setReplies((prev) => [...prev, ...data.data]);
      setRepliesCursor(data.pagination?.nextCursor ?? null);
      setRepliesHasMore(data.pagination?.hasMore ?? false);
    } catch (err) {
      dispatch(
        showToast({
          message: getErrorMessage(err, "We couldn't load more replies. Please try again."),
          type: 'error',
        })
      );
    } finally {
      setMoreRepliesLoading(false);
    }
  };

  const submitReply = async (e) => {
    e.preventDefault();
    if (!replyText.trim()) {
      setReplyError('Write a reply before posting.');
      return;
    }
    setReplyError('');
    setReplyLoading(true);
    try {
      const { data } = await commentApi.addReply(comment._id, replyText.trim());
      setReplies((prev) => [...prev, data.data]);
      setReplyCount((c) => c + 1);
      dispatch(showToast({ message: 'Reply posted.', type: 'success' }));
      setReplyText('');
      setShowReplies(true);
    } catch (err) {
      if (err.fieldErrors?.content) {
        setReplyError(err.fieldErrors.content);
      }
      const message = err.message || "We couldn't post your reply. Please try again.";
      dispatch(showToast({ message, type: 'error' }));
    } finally {
      setReplyLoading(false);
    }
  };

  return (
    <div className="_comment_main" style={{ marginBottom: 16 }}>
      <div className="_comment_image">
        <Image
          src={comment.author.avatarUrl || '/assets/images/txt_img.png'}
          alt={comment.author.firstName}
          width={40}
          height={40}
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
              initialLiked={comment.isLiked || false}
              initialCount={comment.likeCount || 0}
            />
            {comment.depth === 0 && (
              <button
                type="button"
                onClick={loadReplies}
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: '#666' }}
              >
                {repliesLoading
                  ? 'Loading replies...'
                  : replyCount > 0
                  ? `${showReplies ? 'Hide' : 'View'} ${replyCount} repl${replyCount === 1 ? 'y' : 'ies'}`
                  : 'Reply'}
              </button>
            )}
          </div>
        </div>

        {showReplies && (
          <div style={{ marginTop: 12, paddingLeft: 16 }}>
            {repliesLoading && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#64748b', fontSize: 13, padding: '8px 0' }}>
                <InlineSpinner />
                <span>Loading replies...</span>
              </div>
            )}
            {replies.map((r) => (
              <CommentItem key={r._id} comment={r} />
            ))}
            {!repliesLoading && repliesLoaded && replies.length === 0 && replyCount > 0 && (
              <EmptyState heading="No replies yet" subtext="Reply to keep the conversation going." />
            )}
            {repliesHasMore && (
              <button
                type="button"
                onClick={loadMoreReplies}
                disabled={moreRepliesLoading}
                style={{ fontSize: 13, color: '#377DFF', background: 'none', border: 'none', cursor: 'pointer', marginBottom: 8 }}
              >
                {moreRepliesLoading ? 'Loading replies...' : 'Load more replies'}
              </button>
            )}
            {comment.depth === 0 && (
              <div>
                <form onSubmit={submitReply} style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  <input
                    type="text"
                    value={replyText}
                    onChange={(e) => {
                      setReplyText(e.target.value);
                      if (replyError && e.target.value.trim()) setReplyError('');
                    }}
                    placeholder="Write a reply..."
                    maxLength={1000}
                    className="form-control _comment_textarea"
                    style={{ flex: 1 }}
                  />
                  <Button
                    type="submit"
                    className="_feed_inner_text_area_btn_link"
                    loading={replyLoading}
                    loadingLabel="Replying..."
                    style={{ padding: '6px 14px', whiteSpace: 'nowrap', minWidth: 78 }}
                  >
                    Reply
                  </Button>
                </form>
                {replyText.length >= 900 && (
                  <div
                    style={{
                      fontSize: '11px',
                      color: replyText.length >= 1000 ? '#e53e3e' : '#f59e0b',
                      textAlign: 'right',
                      marginTop: '2px',
                      marginRight: '88px',
                    }}
                  >
                    {replyText.length}/1000
                  </div>
                )}
              </div>
            )}
            {replyError && <p style={{ color: '#dc2626', fontSize: 13, marginTop: 6 }}>{replyError}</p>}
          </div>
        )}
      </div>
    </div>
  );
}
