/**
 * Consistent Orbitron section heading used inside cards and panels.
 */
export default function SectionHeader({
  title,
  subtitle,
  icon: Icon,
  iconClassName = 'text-red-400',
  titleClassName = 'text-slate-300',
  className = '',
}) {
  return (
    <div className={`mb-3 ${className}`}>
      <div className="flex items-center gap-2">
        {Icon && <Icon size={14} className={`shrink-0 ${iconClassName}`} />}
        <h3 className={`text-xs font-bold uppercase tracking-[0.14em] font-orbitron ${titleClassName}`}>
          {title}
        </h3>
        <div className="flex-1 h-px ml-1 bg-gradient-to-r from-red-500/25 to-transparent" />
      </div>
      {subtitle && (
        <p className="text-[11px] text-slate-500 font-orbitron tracking-wide mt-1.5 ml-5 leading-relaxed">
          {subtitle}
        </p>
      )}
    </div>
  );
}
