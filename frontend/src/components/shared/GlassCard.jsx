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
  const padding = compact ? 'p-3.5' : 'p-5';

  return (
    <motion.div
      id={id}
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay }}
      whileHover={hover ? { scale: 1.008, y: -1 } : {}}
      onClick={onClick}
      className={`glass-card relative overflow-hidden rounded-xl ${padding} transition-all duration-300 ${hover || onClick ? 'cursor-pointer' : ''} ${className}`}
      style={{
        background: 'linear-gradient(145deg, rgba(255,255,255,0.07) 0%, rgba(255,255,255,0.025) 55%, rgba(227,25,55,0.04) 100%)',
        border: '1px solid rgba(227, 25, 55, 0.22)',
        backdropFilter: 'blur(14px)',
        WebkitBackdropFilter: 'blur(14px)',
        boxShadow: glow === 'red'
          ? '0 0 24px rgba(227, 25, 55, 0.12), inset 0 1px 0 rgba(255,255,255,0.06)'
          : '0 4px 24px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.05)',
        ...style,
      }}
      onMouseEnter={hover ? (e) => {
        e.currentTarget.style.borderColor = 'rgba(227, 25, 55, 0.4)';
        e.currentTarget.style.background = 'linear-gradient(145deg, rgba(255,255,255,0.09) 0%, rgba(255,255,255,0.035) 55%, rgba(227,25,55,0.06) 100%)';
        if (glow === 'red') {
          e.currentTarget.style.boxShadow = '0 0 32px rgba(227, 25, 55, 0.2), inset 0 1px 0 rgba(255,255,255,0.08)';
        }
      } : undefined}
      onMouseLeave={hover ? (e) => {
        e.currentTarget.style.borderColor = 'rgba(227, 25, 55, 0.22)';
        e.currentTarget.style.background = 'linear-gradient(145deg, rgba(255,255,255,0.07) 0%, rgba(255,255,255,0.025) 55%, rgba(227,25,55,0.04) 100%)';
        if (glow === 'red') {
          e.currentTarget.style.boxShadow = '0 0 24px rgba(227, 25, 55, 0.12), inset 0 1px 0 rgba(255,255,255,0.06)';
        }
      } : undefined}
    >
      <div
        className="absolute top-0 inset-x-0 h-px pointer-events-none"
        style={{ background: 'linear-gradient(90deg, transparent, rgba(227,25,55,0.55), transparent)' }}
      />
      <div className="absolute -top-10 -right-10 w-20 h-20 rounded-full bg-red-500/[0.07] blur-2xl pointer-events-none" />
      <div className="relative z-[1]">{children}</div>
    </motion.div>
  );
}
