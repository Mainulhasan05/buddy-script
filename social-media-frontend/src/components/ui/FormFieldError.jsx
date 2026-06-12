'use client';

export default function FormFieldError({ error }) {
  if (!error) return null;
  return (
    <div
      style={{
        color: '#e53e3e',
        fontSize: '13px',
        marginTop: '4px',
        display: 'block',
        textAlign: 'left',
      }}
    >
      {error}
    </div>
  );
}
