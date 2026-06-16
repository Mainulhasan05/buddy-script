'use client';

import { useEffect, useState } from 'react';
import { useDispatch } from 'react-redux';
import { useRouter, useSearchParams } from 'next/navigation';
import { authApi } from '@/src/api/auth.api';
import { clearSessionExpired } from '@/src/api/axiosInstance';
import { setAccessToken, setCredentials } from '@/src/store/slices/authSlice';

export default function GoogleCallback() {
  const dispatch = useDispatch();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [message, setMessage] = useState('Finishing Google sign-in...');

  useEffect(() => {
    const finishLogin = async () => {
      const accessToken = searchParams.get('accessToken');
      const redirectTo = searchParams.get('redirectTo') || '/feed';
      const errorMessage = searchParams.get('message');

      if (!accessToken) {
        setMessage(errorMessage || "We couldn't finish Google sign-in. Please try again.");
        setTimeout(() => router.replace('/login'), 1200);
        return;
      }

      try {
        clearSessionExpired(); // fresh session — re-arm silent refresh before getMe
        dispatch(setAccessToken(accessToken));
        const { data } = await authApi.getMe();
        document.cookie = 'isLoggedIn=true; path=/; max-age=604800; SameSite=Lax';
        dispatch(setCredentials({ user: data.data, accessToken }));
        router.replace(redirectTo.startsWith('/') ? redirectTo : '/feed');
      } catch {
        setMessage("We couldn't finish Google sign-in. Please try again.");
        setTimeout(() => router.replace('/login'), 1200);
      }
    };

    finishLogin();
  }, [dispatch, router, searchParams]);

  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        color: '#334155',
        textAlign: 'center',
      }}
    >
      <p style={{ fontSize: 16, fontWeight: 600 }}>{message}</p>
    </main>
  );
}
