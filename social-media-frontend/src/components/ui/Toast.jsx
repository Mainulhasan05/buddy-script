'use client';

import { useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { hideToast } from '@/src/store/slices/uiSlice';

const BG = {
  success: '#22c55e',
  error: '#ef4444',
  info: '#3b82f6',
};

export default function Toast() {
  const dispatch = useDispatch();
  const { message, type, visible } = useSelector((s) => s.ui.toast);

  useEffect(() => {
    if (!visible) return;
    const t = setTimeout(() => dispatch(hideToast()), 3500);
    return () => clearTimeout(t);
  }, [visible, message, dispatch]);

  if (!visible) return null;

  return (
    <div
      role="alert"
      aria-live="polite"
      style={{
        position: 'fixed',
        bottom: 24,
        right: 24,
        zIndex: 99999,
        background: BG[type] || BG.info,
        color: '#fff',
        padding: '12px 20px',
        borderRadius: 8,
        fontSize: 14,
        fontWeight: 500,
        boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
        maxWidth: 360,
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        animation: 'slideUp 0.2s ease',
      }}
    >
      <span style={{ flex: 1 }}>{message}</span>
      <button
        type="button"
        onClick={() => dispatch(hideToast())}
        style={{
          background: 'none',
          border: 'none',
          color: '#fff',
          cursor: 'pointer',
          fontSize: 18,
          lineHeight: 1,
          padding: 0,
          opacity: 0.8,
        }}
        aria-label="Dismiss"
      >
        ×
      </button>
      <style>{`
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(12px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
