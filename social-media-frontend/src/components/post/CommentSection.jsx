'use client';

import { useState, useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { commentApi } from '@/src/api/comment.api';
import CommentItem from './CommentItem';
import { incrementCommentCount } from '@/src/store/slices/feedSlice';
import { showToast } from '@/src/store/slices/uiSlice';

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

  // Lazy load on first render
  useEffect(() => {
    if (!loaded) { fetchComments(null); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchComments = async (cursor) => {
    setLoading(true);
    try {
      const { data } = await commentApi.getComments(postId, cursor);
      setComments((prev) => (cursor ? [...prev, ...data.data] : data.data));
      setNextCursor(data.pagination?.nextCursor ?? null);
      setHasMore(data.pagination?.hasMore ?? false);
      setLoaded(true);
    } catch (err) {
      dispatch(showToast({ message: err.response?.data?.message || 'Failed to load comments', type: 'error' }));
    } finally {
      setLoading(false);
    }
  };

  const submitComment = async (e) => {
    e.preventDefault();
    if (!commentText.trim()) return;
    setSubmitting(true);
    try {
      const { data } = await commentApi.addComment(postId, commentText.trim());
      setComments((prev) => [...prev, data.data]);
      dispatch(incrementCommentCount(postId));
      dispatch(showToast({ message: 'Comment added successfully', type: 'success' }));
      setCommentText('');
    } catch (err) {
      dispatch(showToast({ message: err.response?.data?.message || 'Failed to add comment', type: 'error' }));
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
              <img
                src={user?.avatar?.url || '/assets/images/comment_img.png'}
                alt=""
                className="_comment_img"
              />
            </div>
            <div className="_feed_inner_comment_box_content_txt">
              <textarea
                className="form-control _comment_textarea"
                placeholder="Write a comment..."
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                maxLength={1000}
                rows={1}
              />
            </div>
          </div>
          <div className="_feed_inner_comment_box_icon">
            <button
              type="submit"
              className="_feed_inner_text_area_btn_link"
              disabled={submitting || !commentText.trim()}
              style={{ padding: '6px 14px' }}
            >
              {submitting ? '...' : 'Post'}
            </button>
          </div>
        </form>
      </div>

      {/* Comment list */}
      <div className="_timline_comment_main">
        {loading && comments.length === 0 && (
          <p style={{ color: '#888', fontSize: 13, padding: '8px 0' }}>Loading comments...</p>
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
            {loading ? 'Loading...' : 'View more comments'}
          </button>
        )}
        {!loading && loaded && comments.length === 0 && (
          <p style={{ color: '#888', fontSize: 13, padding: '8px 0' }}>No comments yet. Be the first!</p>
        )}
      </div>
    </div>
  );
}
