'use client';

import { useState } from 'react';
import { useDispatch } from 'react-redux';
import { openLikeListModal } from '@/src/store/slices/uiSlice';
import LikeButton from './LikeButton';
import CommentSection from './CommentSection';

export default function PostActions({ post }) {
  const dispatch = useDispatch();
  const [showComments, setShowComments] = useState(false);

  return (
    <>
      {/* Reaction counts row */}
      <div className="_feed_inner_timeline_total_reacts _padd_r24 _padd_l24 _mar_b26">
        <div className="_feed_inner_timeline_total_reacts_image">
          {post.likeCount > 0 && (
            <p className="_feed_inner_timeline_total_reacts_para">{post.likeCount}</p>
          )}
        </div>
        <div className="_feed_inner_timeline_total_reacts_txt">
          <p className="_feed_inner_timeline_total_reacts_para1">
            <button
              type="button"
              onClick={() => dispatch(openLikeListModal({ targetId: post._id, targetType: 'post' }))}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', padding: 0 }}
            >
              <span>{post.likeCount}</span> Likes
            </button>
          </p>
          <p className="_feed_inner_timeline_total_reacts_para2">
            <button
              type="button"
              onClick={() => setShowComments((v) => !v)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', padding: 0 }}
            >
              <span>{post.commentCount}</span> Comment{post.commentCount !== 1 ? 's' : ''}
            </button>
          </p>
        </div>
      </div>

      {/* Action buttons row */}
      <div className="_feed_inner_timeline_reaction">
        <LikeButton
          targetId={post._id}
          targetType="post"
          initialLiked={post.isLiked || false}
          initialCount={post.likeCount}
        />

        <button
          type="button"
          className="_feed_inner_timeline_reaction_comment _feed_reaction"
          onClick={() => setShowComments((v) => !v)}
        >
          <span className="_feed_inner_timeline_reaction_link">
            <span>
              <svg className="_reaction_svg" xmlns="http://www.w3.org/2000/svg" width="21" height="21" fill="none" viewBox="0 0 21 21">
                <path stroke="#000" d="M1 10.5c0-.464 0-.696.009-.893A9 9 0 019.607 1.01C9.804 1 10.036 1 10.5 1v0c.464 0 .696 0 .893.009a9 9 0 018.598 8.598c.009.197.009.429.009.893v6.046c0 1.36 0 2.041-.317 2.535a2 2 0 01-.602.602c-.494.317-1.174.317-2.535.317H10.5c-.464 0-.696 0-.893-.009a9 9 0 01-8.598-8.598C1 11.196 1 10.964 1 10.5v0z" />
                <path stroke="#000" strokeLinecap="round" strokeLinejoin="round" d="M6.938 9.313h7.125M10.5 14.063h3.563" />
              </svg>
              Comment
            </span>
          </span>
        </button>
      </div>

      {/* Comment section — lazy loaded on toggle */}
      {showComments && <CommentSection postId={post._id} />}
    </>
  );
}
