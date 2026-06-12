import { Suspense } from 'react';
import RegisterForm from '@/src/components/auth/RegisterForm';

export const metadata = {
  title: 'Register — Buddy Script',
};

export default function RegisterPage() {
  return (
    <Suspense fallback={null}>
      <RegisterForm />
    </Suspense>
  );
}
