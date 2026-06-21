import { useState, useRef, useEffect } from 'react';
import { ResponsiveContainer } from 'recharts';

/**
 * Safe chart wrapper that only renders Recharts once the container
 * has measured non-zero dimensions.  Eliminates the
 * "width(-1) and height(-1) should be greater than 0" console error.
 */
export default function ChartContainer({ children, height = 300, className = '' }) {
  const ref = useRef(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!ref.current) return;
    const check = () => {
      const { offsetWidth } = ref.current || {};
      if (offsetWidth > 0) { setReady(true); return; }
      requestAnimationFrame(check);
    };
    // First try synchronously (covers most cases)
    if (ref.current.offsetWidth > 0) { setReady(true); return; }
    // Otherwise wait for layout
    requestAnimationFrame(check);
  }, []);

  return (
    <div
      ref={ref}
      className={className}
      style={{ width: '100%', minHeight: height, position: 'relative' }}
    >
      {ready ? (
        <ResponsiveContainer width="100%" height={height}>
          {children}
        </ResponsiveContainer>
      ) : (
        <div
          className="flex items-center justify-center"
          style={{ height, color: '#475569', fontSize: 12 }}
        >
          Loading chart…
        </div>
      )}
    </div>
  );
}
