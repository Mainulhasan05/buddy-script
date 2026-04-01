'use client';

import { useEffect, useRef } from 'react';

export default function InfiniteScrollTrigger({ onVisible, hasMore, loading }) {
  const ref = useRef(null);

  useEffect(() => {
    if (!hasMore || loading) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          onVisible();
        }
      },
      { rootMargin: '200px' }
    );

    const el = ref.current;
    if (el) observer.observe(el);

    return () => {
      if (el) observer.unobserve(el);
    };
  }, [onVisible, hasMore, loading]);

  if (!hasMore) return null;

  return (
    <div ref={ref} style={{ height: '1px' }} aria-hidden="true" />
  );
}
