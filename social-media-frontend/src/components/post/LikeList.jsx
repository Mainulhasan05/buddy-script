'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import { useDispatch, useSelector } from 'react-redux';
import { closeLikeListModal, showToast } from '@/src/store/slices/uiSlice';
import { likeApi } from '@/src/api/like.api';
import Button from '@/src/components/ui/Button';
import EmptyState from '@/src/components/ui/EmptyState';
import RetryState from '@/src/components/ui/RetryState';
import { getErrorMessage } from '@/src/utils/apiError';

const MAX_LOCAL_LIKERS = 100; // Client memory safety guard

export default function LikeList() {
  const dispatch = useDispatch();
  const { open, targetId, targetType } = useSelector((s) => s.ui.likeListModal);

  const [likers, setLikers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [nextCursor, setNextCursor] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open || !targetId) return;
    setLikers([]);
    setNextCursor(null);
    fetchLikers(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, targetId]);

  const fetchLikers = async (cursor) => {
    setLoading(true);
    setError('');
    try {
      const { data } = await likeApi.getLikers(targetType, targetId, cursor);
      setLikers((prev) => {
        const combined = cursor ? [...prev, ...data.data] : data.data;
        // Cap the list length to protect client DOM rendering performance
        return combined.slice(0, MAX_LOCAL_LIKERS);
      });
      setNextCursor(data.pagination?.nextCursor ?? null);
      setHasMore(data.pagination?.hasMore ?? false);
    } catch (err) {
      const message = getErrorMessage(err, "We couldn't load the likes. Please try again.");
      if (cursor) dispatch(showToast({ message, type: 'error' }));
      else setError(message);
    } finally {
      setLoading(false);
    }
  };

  if (!open) return null;

  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999,
      }}
      onClick={() => dispatch(closeLikeListModal())}
    >
      <div
        style={{
          background: '#fff', borderRadius: 12, padding: '24px', width: '100%',
          maxWidth: 420, maxHeight: '80vh', overflow: 'auto',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h4 style={{ margin: 0 }}>Likes</h4>
          <button
            type="button"
            onClick={() => dispatch(closeLikeListModal())}
            style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer' }}
          >
            ×
          </button>
        </div>

        {loading && likers.length === 0 ? (
          <p style={{ textAlign: 'center', color: '#888' }}>Loading likes...</p>
        ) : error ? (
          <RetryState message={error} onRetry={() => fetchLikers(null)} retrying={loading} />
        ) : likers.length === 0 ? (
          <EmptyState heading="No likes yet" subtext="Reactions will appear here." />
        ) : (
          <>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {likers.map((item, i) => (
                <li key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0', borderBottom: '1px solid #f0f0f0' }}>
                  <Image
                    src={item.user.avatarUrl || '/assets/images/profile.png'}
                    alt={item.user.firstName}
                    width={36}
                    height={36}
                    style={{ width: 36, height: 36, borderRadius: '50%', objectFit: 'cover' }}
                  />
                  <span>{item.user.firstName} {item.user.lastName}</span>
                </li>
              ))}
            </ul>
            {hasMore && likers.length < MAX_LOCAL_LIKERS && (
              <Button
                type="button"
                onClick={() => fetchLikers(nextCursor)}
                loading={loading}
                loadingLabel="Loading likes..."
                variant="ghost"
                style={{ marginTop: 12, width: '100%', padding: '8px' }}
              >
                Load more
              </Button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
