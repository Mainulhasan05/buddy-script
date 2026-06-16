'use client';

import { useEffect, useRef } from 'react';

export default function InfiniteScrollTrigger({ onVisible, hasMore, loading }) {
  const ref = useRef(null);

  useEffect(() => {
    if (!hasMore || loading) return;

    // The main scroll container is ._layout_middle_wrap, not the viewport.
    // Specifying it as root is required since ._main_layout has overflow: hidden.
    const scrollContainer = document.querySelector('._layout_middle_wrap');

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          onVisible();
        }
      },
      { 
        root: scrollContainer || null,
        rootMargin: '200px' 
      }
    );

    const el = ref.current;
    if (el) observer.observe(el);

    return () => {
      if (el) observer.unobserve(el);
    };
  }, [onVisible, hasMore, loading]);

  if (!hasMore) return null;

  return (
    <div ref={ref} style={{ height: '10px', margin: '10px 0' }} aria-hidden="true" />
  );
}
