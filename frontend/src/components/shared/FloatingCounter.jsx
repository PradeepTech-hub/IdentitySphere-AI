import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';

const COLOR_GLOW = {
  red: '0 0 20px rgba(227,25,55,0.5)',
  orange: '0 0 18px rgba(249,115,22,0.45)',
  amber: '0 0 18px rgba(245,158,11,0.4)',
  yellow: '0 0 16px rgba(234,179,8,0.4)',
  green: '0 0 16px rgba(34,197,94,0.4)',
  blue: '0 0 16px rgba(59,130,246,0.4)',
  white: '0 0 14px rgba(255,255,255,0.25)',
};

/** Orbitron floating stat numbers — matches landing page hero counters */
export default function FloatingCounter({
  value,
  duration = 1.8,
  suffix = '',
  prefix = '',
  className = '',
  color = 'red',
  size = '3xl',
}) {
  const [count, setCount] = useState(0);
  const end = typeof value === 'number' ? value : parseFloat(value) || 0;
  const isFloat = typeof value === 'number' && value % 1 !== 0;

  useEffect(() => {
    let start = null;
    const step = (ts) => {
      if (!start) start = ts;
      const p = Math.min((ts - start) / (duration * 1000), 1);
      const eased = 1 - Math.pow(1 - p, 3);
      setCount(end * eased);
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }, [value, duration, end]);

  const sizeClass = {
    '2xl': 'text-2xl',
    '3xl': 'text-3xl',
    '4xl': 'text-4xl',
    '5xl': 'text-5xl',
  }[size] || 'text-3xl';

  return (
    <motion.span
      className={`font-black inline-block animate-float ${sizeClass} ${className}`}
      style={{ textShadow: COLOR_GLOW[color] || COLOR_GLOW.red }}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6 }}
    >
      {prefix}{isFloat ? count.toFixed(1) : Math.floor(count).toLocaleString()}{suffix}
    </motion.span>
  );
}
