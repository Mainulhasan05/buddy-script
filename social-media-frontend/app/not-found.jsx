import Link from 'next/link';

export const metadata = {
  title: '404 — Page Not Found | Buddy Script',
};

export default function NotFound() {
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        padding: '0 24px',
      }}
    >
      <h1 style={{ fontSize: 80, fontWeight: 800, margin: 0, color: '#112032', lineHeight: 1 }}>
        404
      </h1>
      <h2 style={{ fontSize: 24, fontWeight: 600, marginTop: 12, color: '#333' }}>
        Page not found
      </h2>
      <p style={{ color: '#888', marginTop: 8, fontSize: 15 }}>
        The page you&apos;re looking for doesn&apos;t exist or has been moved.
      </p>
      <Link
        href="/feed"
        style={{
          marginTop: 28,
          background: '#377DFF',
          color: '#fff',
          padding: '12px 28px',
          borderRadius: 8,
          textDecoration: 'none',
          fontWeight: 600,
          fontSize: 15,
        }}
      >
        Back to Feed
      </Link>
    </div>
  );
}
