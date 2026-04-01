'use client';

import { useState, useRef } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { closeCreatePostModal } from '@/src/store/slices/uiSlice';
import { prependPost, setCreating } from '@/src/store/slices/feedSlice';
import { postApi } from '@/src/api/post.api';

const MAX_CHARS = 2000;

export default function CreatePostModal() {
  const dispatch = useDispatch();
  const user = useSelector((s) => s.auth.user);
  const creating = useSelector((s) => s.feed.creating);

  const [content, setContent] = useState('');
  const [visibility, setVisibility] = useState('public');
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [error, setError] = useState('');
  const fileRef = useRef(null);

  const handleImageChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!content.trim()) { setError('Post content is required'); return; }
    setError('');
    dispatch(setCreating(true));

    try {
      const formData = new FormData();
      formData.append('content', content.trim());
      formData.append('visibility', visibility);
      if (imageFile) formData.append('image', imageFile);

      const { data } = await postApi.createPost(formData);
      dispatch(prependPost(data.data));
      dispatch(closeCreatePostModal());
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to create post');
      dispatch(setCreating(false));
    }
  };

  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999,
      }}
      onClick={() => dispatch(closeCreatePostModal())}
    >
      <div
        style={{
          background: '#fff', borderRadius: 12, padding: 24, width: '100%',
          maxWidth: 560, maxHeight: '90vh', overflowY: 'auto',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <img
              src={user?.avatar?.url || '/assets/images/txt_img.png'}
              alt=""
              style={{ width: 40, height: 40, borderRadius: '50%', objectFit: 'cover' }}
            />
            <span style={{ fontWeight: 600 }}>{user?.firstName} {user?.lastName}</span>
          </div>
          <button
            type="button"
            onClick={() => dispatch(closeCreatePostModal())}
            style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', lineHeight: 1 }}
          >
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          {/* Content textarea */}
          <div style={{ position: 'relative', marginBottom: 8 }}>
            <textarea
              className="form-control _textarea"
              placeholder="What's on your mind?"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              maxLength={MAX_CHARS}
              rows={5}
              style={{ resize: 'none', width: '100%' }}
            />
            <span style={{
              position: 'absolute', bottom: 8, right: 12,
              fontSize: 12, color: content.length >= MAX_CHARS * 0.9 ? '#e53e3e' : '#999',
            }}>
              {content.length}/{MAX_CHARS}
            </span>
          </div>

          {/* Image preview */}
          {imagePreview && (
            <div style={{ position: 'relative', marginBottom: 12 }}>
              <img
                src={imagePreview}
                alt="Preview"
                style={{ width: '100%', maxHeight: 260, objectFit: 'cover', borderRadius: 8 }}
              />
              <button
                type="button"
                onClick={() => { setImageFile(null); setImagePreview(null); if (fileRef.current) fileRef.current.value = ''; }}
                style={{
                  position: 'absolute', top: 8, right: 8,
                  background: 'rgba(0,0,0,0.6)', color: '#fff', border: 'none',
                  borderRadius: '50%', width: 28, height: 28, cursor: 'pointer', fontSize: 16,
                }}
              >
                ×
              </button>
            </div>
          )}

          {error && <p style={{ color: '#e53e3e', fontSize: 13, marginBottom: 8 }}>{error}</p>}

          {/* Bottom toolbar */}
          <div className="_feed_inner_text_area_bottom" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div className="_feed_inner_text_area_item" style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              {/* Photo upload */}
              <button
                type="button"
                className="_feed_inner_text_area_bottom_photo_link"
                onClick={() => fileRef.current?.click()}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="none" viewBox="0 0 20 20">
                  <path fill="#666" d="M13.916 0c3.109 0 5.18 2.429 5.18 5.914v8.17c0 3.486-2.072 5.916-5.18 5.916H5.999C2.89 20 .827 17.572.827 14.085v-8.17C.827 2.43 2.897 0 6 0h7.917zm-7.085 4.64c-1.265 0-2.292 1.125-2.292 2.51 0 1.386 1.027 2.511 2.292 2.511s2.291-1.125 2.291-2.51c0-1.386-1.026-2.51-2.291-2.51z"/>
                </svg>
                Photo
              </button>
              <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={handleImageChange} style={{ display: 'none' }} />

              {/* Visibility toggle */}
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
                <select
                  value={visibility}
                  onChange={(e) => setVisibility(e.target.value)}
                  style={{ border: '1px solid #ddd', borderRadius: 6, padding: '4px 8px', fontSize: 13 }}
                >
                  <option value="public">🌐 Public</option>
                  <option value="private">🔒 Private</option>
                </select>
              </label>
            </div>

            <button
              type="submit"
              className="_feed_inner_text_area_btn_link"
              disabled={creating || !content.trim()}
            >
              <svg className="_mar_img" xmlns="http://www.w3.org/2000/svg" width="14" height="13" fill="none" viewBox="0 0 14 13">
                <path fill="#fff" fillRule="evenodd" d="M6.37 7.879l2.438 3.955a.335.335 0 00.34.162c.068-.01.23-.05.289-.247l3.049-10.297a.348.348 0 00-.09-.35.341.341 0 00-.34-.088L1.75 4.03a.34.34 0 00-.247.289.343.343 0 00.16.347L5.666 7.17 9.2 3.597a.5.5 0 01.712.703L6.37 7.88z" clipRule="evenodd" />
              </svg>
              <span>{creating ? 'Posting...' : 'Post'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
