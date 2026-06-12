'use client';

import Button from './Button';

export default function EmptyState({ heading, subtext, actionLabel, onAction }) {
  return (
    <div style={{ textAlign: 'center', padding: '36px 18px', color: '#64748b' }}>
      <h4 style={{ margin: '0 0 6px', color: '#1f2937', fontSize: 17, fontWeight: 700 }}>
        {heading}
      </h4>
      {subtext && <p style={{ margin: '0 auto 16px', maxWidth: 360, fontSize: 14 }}>{subtext}</p>}
      {actionLabel && onAction && (
        <Button type="button" onClick={onAction} style={{ padding: '9px 16px' }}>
          {actionLabel}
        </Button>
      )}
    </div>
  );
}
