'use client';

export default function InlineSpinner({ size = 14, color = 'currentColor' }) {
  return (
    <span
      aria-hidden="true"
      style={{
        width: size,
        height: size,
        border: `2px solid ${color}`,
        borderRightColor: 'transparent',
        borderRadius: '50%',
        display: 'inline-block',
        animation: '_inline_spinner 0.7s linear infinite',
        flex: '0 0 auto',
      }}
    >
      <style>{`
        @keyframes _inline_spinner {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </span>
  );
}
