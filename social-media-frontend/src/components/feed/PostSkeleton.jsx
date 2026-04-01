'use client';

export default function PostSkeleton() {
  return (
    <div className="_feed_inner_timeline_post_area _b_radious6 _padd_b24 _padd_t24 _mar_b16">
      <div className="_feed_inner_timeline_content _padd_r24 _padd_l24">
        {/* Author row skeleton */}
        <div className="_feed_inner_timeline_post_top" style={{ marginBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div
              className="_skeleton_pulse"
              style={{ width: 44, height: 44, borderRadius: '50%', background: '#e0e0e0' }}
            />
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div
                className="_skeleton_pulse"
                style={{ width: 140, height: 14, borderRadius: 4, background: '#e0e0e0' }}
              />
              <div
                className="_skeleton_pulse"
                style={{ width: 90, height: 12, borderRadius: 4, background: '#e0e0e0' }}
              />
            </div>
          </div>
        </div>

        {/* Content skeleton */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' }}>
          <div className="_skeleton_pulse" style={{ width: '100%', height: 14, borderRadius: 4, background: '#e0e0e0' }} />
          <div className="_skeleton_pulse" style={{ width: '80%', height: 14, borderRadius: 4, background: '#e0e0e0' }} />
          <div className="_skeleton_pulse" style={{ width: '60%', height: 14, borderRadius: 4, background: '#e0e0e0' }} />
        </div>

        {/* Image placeholder skeleton */}
        <div
          className="_skeleton_pulse"
          style={{ width: '100%', height: 200, borderRadius: 8, background: '#e0e0e0', marginBottom: '16px' }}
        />
      </div>

      <style>{`
        @keyframes _skeleton_pulse_anim {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
        ._skeleton_pulse {
          animation: _skeleton_pulse_anim 1.5s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
}
