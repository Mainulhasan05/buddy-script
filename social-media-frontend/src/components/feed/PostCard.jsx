'use client';

import { useState } from 'react';
import Image from 'next/image';
import { useDispatch, useSelector } from 'react-redux';
import { formatRelative } from 'date-fns';
import { removePost } from '@/src/store/slices/feedSlice';
import { postApi } from '@/src/api/post.api';
import PostActions from '@/src/components/post/PostActions';
import { showToast } from '@/src/store/slices/uiSlice';
import ConfirmationModal from '@/src/components/ui/ConfirmationModal';
import { getErrorMessage } from '@/src/utils/apiError';

export default function PostCard({ post }) {
  const dispatch = useDispatch();
  const currentUser = useSelector((s) => s.auth.user);
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const isAuthor = currentUser?.id === post.author._id;

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await postApi.deletePost(post._id);
      dispatch(removePost(post._id));
      dispatch(showToast({ message: 'Post deleted.', type: 'success' }));
      setConfirmDelete(false);
    } catch (err) {
      dispatch(
        showToast({
          message: getErrorMessage(err, "We couldn't delete that post. Please try again."),
          type: 'error',
        })
      );
    } finally {
      setDeleting(false);
    }
  };

  const relativeTime = (() => {
    try {
      return formatRelative(new Date(post.createdAt), new Date());
    } catch {
      return '';
    }
  })();

  return (
    <div className="_feed_inner_timeline_post_area _b_radious6 _padd_b24 _padd_t24 _mar_b16">
      <div className="_feed_inner_timeline_content _padd_r24 _padd_l24">
        {/* Post header */}
        <div className="_feed_inner_timeline_post_top">
          <div className="_feed_inner_timeline_post_box">
            <div className="_feed_inner_timeline_post_box_image">
              <Image
                src={post.author.avatarUrl || '/assets/images/post_img.png'}
                alt={post.author.firstName}
                width={44}
                height={44}
                className="_post_img"
              />
            </div>
            <div className="_feed_inner_timeline_post_box_txt">
              <h4 className="_feed_inner_timeline_post_box_title">
                {post.author.firstName} {post.author.lastName}
              </h4>
              <p className="_feed_inner_timeline_post_box_para">
                {relativeTime} &middot;{' '}
                <span>{post.visibility === 'private' ? '🔒 Private' : '🌐 Public'}</span>
              </p>
            </div>
          </div>

          {/* Post menu (author only) */}
          {isAuthor && (
            <div className="_feed_inner_timeline_post_box_dropdown">
              <div className="_feed_timeline_post_dropdown">
                <button
                  type="button"
                  className="_feed_timeline_post_dropdown_link"
                  onClick={() => setMenuOpen((v) => !v)}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="4" height="17" fill="none" viewBox="0 0 4 17">
                    <circle cx="2" cy="2" r="2" fill="#C4C4C4" />
                    <circle cx="2" cy="8" r="2" fill="#C4C4C4" />
                    <circle cx="2" cy="15" r="2" fill="#C4C4C4" />
                  </svg>
                </button>
              </div>
              {menuOpen && (
                <div className="_feed_timeline_dropdown _timeline_dropdown" style={{ display: 'block' }}>
                  <ul className="_feed_timeline_dropdown_list">
                    <li className="_feed_timeline_dropdown_item">
                      <button
                        type="button"
                        className="_feed_timeline_dropdown_link"
                        onClick={() => { setConfirmDelete(true); setMenuOpen(false); }}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', width: '100%', textAlign: 'left' }}
                      >
                        <span>
                          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="none" viewBox="0 0 18 18">
                            <path stroke="#1890FF" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.2" d="M2.25 4.5h13.5M6 4.5V3a1.5 1.5 0 011.5-1.5h3A1.5 1.5 0 0112 3v1.5m2.25 0V15a1.5 1.5 0 01-1.5 1.5h-7.5a1.5 1.5 0 01-1.5-1.5V4.5h10.5z" />
                          </svg>
                        </span>
                        Delete Post
                      </button>
                    </li>
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Post content */}
        <p style={{ margin: '12px 0', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
          {post.content}
        </p>

        {/* Post image — next/image for automatic format and size optimization */}
        {post.image?.url && (
          <div className="_feed_inner_timeline_image" style={{ position: 'relative', width: '100%', aspectRatio: post.image.width && post.image.height ? `${post.image.width} / ${post.image.height}` : '16 / 9' }}>
            <Image
              src={post.image.url}
              alt="Post"
              fill
              sizes="(max-width: 768px) 100vw, 600px"
              style={{ objectFit: 'contain', borderRadius: 8 }}
              loading="lazy"
            />
          </div>
        )}
      </div>

      {/* Like / Comment actions */}
      <PostActions post={post} />
      {confirmDelete && (
        <ConfirmationModal
          title="Delete post?"
          message="This post will disappear from your feed. This action cannot be undone."
          confirmLabel="Delete Post"
          cancelLabel="Keep Post"
          loading={deleting}
          onConfirm={handleDelete}
          onCancel={() => setConfirmDelete(false)}
        />
      )}
    </div>
  );
}
