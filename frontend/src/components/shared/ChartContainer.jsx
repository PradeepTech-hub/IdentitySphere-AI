import { useState, useRef, useEffect, useCallback } from 'react';
import { ResponsiveContainer } from 'recharts';

/**
 * Deferred chart wrapper — waits for the DOM element to have a real
 * width before rendering ResponsiveContainer.  Uses ResizeObserver
 * with a setTimeout fallback so it always renders within 500ms.
 */
export default function ChartContainer({ children, height = 300, className = '' }) {
  const ref = useRef(null);
  const [dims, setDims] = useState(null);

  const measure = useCallback(() => {
    if (!ref.current) return;
    const w = ref.current.offsetWidth;
    if (w > 10) setDims({ w, h: height });
  }, [height]);

  useEffect(() => {
    measure();
    if (dims) return;

    // ResizeObserver fires when the element gets layout dimensions
    let ro;
    if (typeof ResizeObserver !== 'undefined' && ref.current) {
      ro = new ResizeObserver(() => measure());
      ro.observe(ref.current);
    }

    // Fallback: force-render after 400ms even if observer hasn't fired
    const timer = setTimeout(() => {
      if (!dims) setDims({ w: ref.current?.offsetWidth || 400, h: height });
    }, 400);

    return () => {
      ro?.disconnect();
      clearTimeout(timer);
    };
  }, [measure, dims, height]);

  return (
    <div ref={ref} className={className} style={{ width: '100%', height }}>
      {dims ? (
        <ResponsiveContainer width="100%" height={height}>
          {children}
        </ResponsiveContainer>
      ) : null}
    </div>
  );
}
