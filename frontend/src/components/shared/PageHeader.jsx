import { motion } from 'framer-motion';

export default function PageHeader({ title, subtitle, badge }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -12 }}
      animate={{ opacity: 1, y: 0 }}
      className="mb-2"
    >
      {badge && (
        <div className="flex items-center gap-2 mb-2">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
          </span>
          <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-red-400 font-orbitron">{badge}</span>
        </div>
      )}
      <h1 className="text-2xl md:text-3xl font-black text-white font-orbitron tracking-wide">
        {title}
      </h1>
      {subtitle && (
        <p className="text-sm text-slate-400 mt-1.5 max-w-3xl font-orbitron tracking-wide leading-relaxed opacity-90 page-subtitle">
          {subtitle}
        </p>
      )}
    </motion.div>
  );
}
