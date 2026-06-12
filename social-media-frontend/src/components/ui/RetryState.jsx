'use client';

import Button from './Button';

export default function RetryState({ message, onRetry, retrying = false }) {
  return (
    <div style={{ padding: '28px 18px', textAlign: 'center', color: '#64748b' }} role="alert">
      <p style={{ margin: '0 0 14px', color: '#334155', fontWeight: 500 }}>
        {message || "We couldn't load this. Please try again."}
      </p>
      {onRetry && (
        <Button type="button" onClick={onRetry} loading={retrying} loadingLabel="Retrying..." style={{ padding: '9px 18px' }}>
          Try again
        </Button>
      )}
    </div>
  );
}
