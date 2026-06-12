'use client';

import InlineSpinner from './InlineSpinner';

export default function PaginationSpinner({ message = 'Loading more posts...' }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        padding: '16px 0',
        width: '100%',
        color: '#64748b',
        fontSize: '14px',
      }}
    >
      <InlineSpinner size={18} color="#377DFF" />
      <span>{message}</span>
    </div>
  );
}
