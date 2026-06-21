import { useState, useRef, useLayoutEffect } from 'react';
import { ResponsiveContainer } from 'recharts';

/**
 * Recharts 3 charts read size from ResponsiveContainerContext — they ignore
 * width/height props on AreaChart/PieChart directly. Measure the parent, then
 * mount ResponsiveContainer with numeric dimensions once layout is stable.
 */
export default function ChartContainer({ children, height = 300, className = '' }) {
  const ref = useRef(null);
  const [width, setWidth] = useState(0);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;

    const measure = () => {
      const next = Math.floor(el.getBoundingClientRect().width);
      if (next > 0) setWidth((prev) => (prev === next ? prev : next));
    };

    measure();

    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    ro?.observe(el);

    window.addEventListener('resize', measure);
    document.addEventListener('visibilitychange', measure);

    const timers = [100, 350, 700, 1200].map((ms) => window.setTimeout(measure, ms));
    const fallback = window.setTimeout(() => {
      const w = el.offsetWidth;
      if (w > 10) setWidth((prev) => (prev > 0 ? prev : w));
    }, 400);

    return () => {
      ro?.disconnect();
      window.removeEventListener('resize', measure);
      document.removeEventListener('visibilitychange', measure);
      timers.forEach((t) => window.clearTimeout(t));
      window.clearTimeout(fallback);
    };
  }, [height]);

  const ready = width > 0;

  return (
    <div
      ref={ref}
      className={`chart-shell ${className}`.trim()}
      style={{ width: '100%', minWidth: 0, height, minHeight: height, position: 'relative' }}
    >
      {ready ? (
        <ResponsiveContainer width={width} height={height} debounce={0}>
          {children}
        </ResponsiveContainer>
      ) : null}
    </div>
  );
}
