import { Suspense } from 'react';
import GoogleCallback from '@/src/components/auth/GoogleCallback';

export const metadata = {
  title: 'Signing in — Buddy Script',
};

export default function GoogleCallbackPage() {
  return (
    <Suspense fallback={null}>
      <GoogleCallback />
    </Suspense>
  );
}
