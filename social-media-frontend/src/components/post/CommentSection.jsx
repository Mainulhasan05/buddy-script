'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import { useDispatch, useSelector } from 'react-redux';
import { commentApi } from '@/src/api/comment.api';
import CommentItem from './CommentItem';
import { incrementCommentCount } from '@/src/store/slices/feedSlice';
import { showToast } from '@/src/store/slices/uiSlice';
import Button from '@/src/components/ui/Button';
import EmptyState from '@/src/components/ui/EmptyState';
import RetryState from '@/src/components/ui/RetryState';
import { getErrorMessage } from '@/src/utils/apiError';

export default function CommentSection({ postId }) {
  const dispatch = useDispatch();
  const user = useSelector((s) => s.auth.user);

  const [comments, setComments] = useState([]);
  const [nextCursor, setNextCursor] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [fieldError, setFieldError] = useState('');

  // Lazy load on first render
  useEffect(() => {
    if (!loaded) { fetchComments(null); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchComments = async (cursor) => {
    setLoading(true);
    setLoadError('');
    try {
      const { data } = await commentApi.getComments(postId, cursor);
      setComments((prev) => (cursor ? [...prev, ...data.data] : data.data));
      setNextCursor(data.pagination?.nextCursor ?? null);
      setHasMore(data.pagination?.hasMore ?? false);
      setLoaded(true);
    } catch (err) {
      setLoadError(getErrorMessage(err, "We couldn't load comments. Please try again."));
    } finally {
      setLoading(false);
    }
  };

  const submitComment = async (e) => {
    e.preventDefault();
    if (!commentText.trim()) {
      setFieldError('Write a comment before posting.');
      return;
    }
    setFieldError('');
    setSubmitting(true);
    try {
      const { data } = await commentApi.addComment(postId, commentText.trim());
      setComments((prev) => [...prev, data.data]);
      dispatch(incrementCommentCount(postId));
      dispatch(showToast({ message: 'Comment posted.', type: 'success' }));
      setCommentText('');
    } catch (err) {
      if (err.fieldErrors?.content) {
        setFieldError(err.fieldErrors.content);
      }
      const message = err.message || "We couldn't post your comment. Please try again.";
      dispatch(showToast({ message, type: 'error' }));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="_feed_inner_timeline_cooment_area">
      {/* Comment input */}
      <div className="_feed_inner_comment_box">
        <form className="_feed_inner_comment_box_form" onSubmit={submitComment}>
          <div className="_feed_inner_comment_box_content">
            <div className="_feed_inner_comment_box_content_image">
              <Image
                src={user?.avatar?.url || '/assets/images/comment_img.png'}
                alt=""
                width={44}
                height={44}
                className="_comment_img"
              />
            </div>
            <div className="_feed_inner_comment_box_content_txt">
              <textarea
                className="form-control _comment_textarea"
                placeholder="Write a comment..."
                value={commentText}
                onChange={(e) => {
                  setCommentText(e.target.value);
                  if (fieldError && e.target.value.trim()) setFieldError('');
                }}
                maxLength={1000}
                rows={1}
              />
              {commentText.length >= 900 && (
                <div
                  style={{
                    fontSize: '11px',
                    color: commentText.length >= 1000 ? '#e53e3e' : '#f59e0b',
                    textAlign: 'right',
                    marginTop: '2px',
                  }}
                >
                  {commentText.length}/1000
                </div>
              )}
            </div>
          </div>
          <div className="_feed_inner_comment_box_icon">
            <Button
              type="submit"
              className="_feed_inner_text_area_btn_link"
              loading={submitting}
              loadingLabel="Posting..."
              style={{ padding: '6px 14px', minWidth: 72 }}
            >
              Post
            </Button>
          </div>
        </form>
        {fieldError && <p style={{ color: '#dc2626', fontSize: 13, margin: '6px 0 0 52px' }}>{fieldError}</p>}
      </div>

      {/* Comment list */}
      <div className="_timline_comment_main">
        {loading && comments.length === 0 && (
          <p style={{ color: '#888', fontSize: 13, padding: '8px 0' }}>Loading comments...</p>
        )}
        {!loading && loadError && comments.length === 0 && (
          <RetryState message={loadError} onRetry={() => fetchComments(null)} retrying={loading} />
        )}
        {comments.map((c) => (
          <CommentItem key={c._id} comment={c} />
        ))}
        {hasMore && (
          <button
            type="button"
            className="_previous_comment_txt"
            onClick={() => fetchComments(nextCursor)}
            disabled={loading}
          >
            {loading ? 'Loading comments...' : 'View more comments'}
          </button>
        )}
        {!loading && !loadError && loaded && comments.length === 0 && (
          <EmptyState heading="No comments yet" subtext="Start the conversation." />
        )}
      </div>
    </div>
  );
}
