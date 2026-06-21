import { motion } from 'framer-motion';

/**
 * Glass card — compact by default, top accent line, subtle corner glow.
 */
export default function GlassCard({
  children,
  className = '',
  hover = true,
  glow,
  delay = 0,
  onClick,
  style,
  compact = true,
  id,
}) {
  const hasNoPadding = className.includes('p-0') || className.includes('!p-0');
  const padding = hasNoPadding ? '' : (compact ? 'p-2.5 sm:p-3.5' : 'p-3 sm:p-5');

  return (
    <motion.div
      id={id}
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay }}
      whileHover={hover ? { scale: 1.008, y: -1 } : {}}
      onClick={onClick}
      className={`glass-card relative rounded-xl ${padding} transition-all duration-300 ${hover || onClick ? 'cursor-pointer' : ''} ${className}`}
      style={{
        background: 'linear-gradient(145deg, rgba(8,10,18,0.82) 0%, rgba(5,6,13,0.85) 55%, rgba(13,17,26,0.80) 100%)',
        border: '1px solid rgba(227, 25, 55, 0.22)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        boxShadow: glow === 'red'
          ? '0 0 24px rgba(227, 25, 55, 0.12), inset 0 1px 0 rgba(255,255,255,0.06)'
          : '0 4px 24px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.04)',
        ...style,
      }}
      onMouseEnter={hover ? (e) => {
        e.currentTarget.style.borderColor = 'rgba(227, 25, 55, 0.4)';
        e.currentTarget.style.background = 'linear-gradient(145deg, rgba(13,17,26,0.88) 0%, rgba(8,10,18,0.90) 55%, rgba(16,20,32,0.85) 100%)';
        if (glow === 'red') {
          e.currentTarget.style.boxShadow = '0 0 32px rgba(227, 25, 55, 0.2), inset 0 1px 0 rgba(255,255,255,0.08)';
        }
      } : undefined}
      onMouseLeave={hover ? (e) => {
        e.currentTarget.style.borderColor = 'rgba(227, 25, 55, 0.22)';
        e.currentTarget.style.background = 'linear-gradient(145deg, rgba(8,10,18,0.82) 0%, rgba(5,6,13,0.85) 55%, rgba(13,17,26,0.80) 100%)';
        if (glow === 'red') {
          e.currentTarget.style.boxShadow = '0 0 24px rgba(227, 25, 55, 0.12), inset 0 1px 0 rgba(255,255,255,0.06)';
        }
      } : undefined}
    >
      <div
        className="absolute top-0 inset-x-0 h-px pointer-events-none"
        style={{ background: 'linear-gradient(90deg, transparent, rgba(227,25,55,0.35), transparent)' }}
      />
      <div className={`relative ${hasNoPadding ? 'h-full' : ''}`}>{children}</div>
    </motion.div>
  );
}
