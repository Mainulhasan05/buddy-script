'use client';

import InlineSpinner from './InlineSpinner';

const VARIANT_STYLES = {
  primary: { background: '#377DFF', color: '#fff', border: '1px solid #377DFF' },
  danger: { background: '#ef4444', color: '#fff', border: '1px solid #ef4444' },
  ghost: { background: 'transparent', color: '#334155', border: '1px solid #d9e2ef' },
};

export default function Button({
  children,
  loading = false,
  loadingLabel = 'Working...',
  variant = 'primary',
  disabled = false,
  className = '',
  style,
  ...props
}) {
  return (
    <button
      {...props}
      className={className}
      disabled={disabled || loading}
      aria-busy={loading}
      style={{
        ...VARIANT_STYLES[variant],
        minWidth: style?.minWidth || 96,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        opacity: disabled || loading ? 0.75 : 1,
        cursor: disabled || loading ? 'not-allowed' : 'pointer',
        ...style,
      }}
    >
      {loading && <InlineSpinner />}
      <span>{loading ? loadingLabel : children}</span>
    </button>
  );
}
