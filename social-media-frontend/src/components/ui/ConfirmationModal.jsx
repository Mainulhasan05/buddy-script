'use client';

import Button from './Button';

export default function ConfirmationModal({
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'danger',
  loading = false,
  onConfirm,
  onCancel,
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirmation-title"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15, 23, 42, 0.55)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10000,
        padding: 16,
      }}
      onClick={loading ? undefined : onCancel}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 420,
          background: '#fff',
          borderRadius: 8,
          padding: 22,
          boxShadow: '0 18px 45px rgba(15, 23, 42, 0.22)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id="confirmation-title" style={{ margin: 0, color: '#111827', fontSize: 18, fontWeight: 700 }}>
          {title}
        </h3>
        <p style={{ margin: '10px 0 20px', color: '#64748b', fontSize: 14, lineHeight: 1.5 }}>
          {message}
        </p>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <Button type="button" variant="ghost" onClick={onCancel} disabled={loading} style={{ padding: '9px 15px' }}>
            {cancelLabel}
          </Button>
          <Button
            type="button"
            variant={variant}
            onClick={onConfirm}
            loading={loading}
            loadingLabel="Deleting..."
            style={{ padding: '9px 15px' }}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
