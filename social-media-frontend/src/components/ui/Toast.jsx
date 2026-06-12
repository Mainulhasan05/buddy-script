'use client';

import { useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { hideToast } from '@/src/store/slices/uiSlice';

const BG = {
  success: '#16a34a',
  error: '#dc2626',
  info: '#2563eb',
};

export default function Toast() {
  const dispatch = useDispatch();
  const toasts = useSelector((s) => s.ui.toasts || []);

  useEffect(() => {
    if (toasts.length === 0) return undefined;
    const timers = toasts.map((toast) =>
      setTimeout(() => dispatch(hideToast(toast.id)), toast.duration || 3000)
    );
    return () => timers.forEach(clearTimeout);
  }, [toasts, dispatch]);

  if (toasts.length === 0) return null;

  return (
    <div
      aria-live="polite"
      aria-relevant="additions removals"
      style={{
        position: 'fixed',
        top: 24,
        right: 24,
        zIndex: 99999,
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        width: 'min(360px, calc(100vw - 32px))',
      }}
    >
      {toasts.map(({ id, message, type }) => (
        <div
          key={id}
          role="alert"
          style={{
            background: BG[type] || BG.info,
            color: '#fff',
            padding: '12px 16px',
            borderRadius: 8,
            fontSize: 14,
            fontWeight: 500,
            boxShadow: '0 10px 24px rgba(0,0,0,0.16)',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            animation: 'slideDown 0.2s ease',
          }}
        >
          <span style={{ flex: 1 }}>{message}</span>
          <button
            type="button"
            onClick={() => dispatch(hideToast(id))}
            style={{
              background: 'none',
              border: 'none',
              color: '#fff',
              cursor: 'pointer',
              fontSize: 18,
              lineHeight: 1,
              padding: 0,
              opacity: 0.85,
            }}
            aria-label="Dismiss notification"
          >
            x
          </button>
        </div>
      ))}
      <style>{`
        @keyframes slideDown {
          from { opacity: 0; transform: translateY(-12px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @media (max-width: 640px) {
          [aria-live="polite"] {
            right: 50% !important;
            transform: translateX(50%);
          }
        }
      `}</style>
    </div>
  );
}
