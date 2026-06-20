import GlassCard from './GlassCard';
import FloatingCounter from './FloatingCounter';

const COLOR_MAP = {
  'text-red-400': 'red',
  'text-orange-400': 'orange',
  'text-amber-400': 'amber',
  'text-yellow-400': 'yellow',
  'text-green-400': 'green',
  'text-blue-400': 'blue',
  'text-cyan-400': 'blue',
  'text-purple-400': 'red',
  'text-white': 'white',
};

const ICON_BG = {
  'text-red-400': 'from-red-500/25 to-red-600/10',
  'text-orange-400': 'from-orange-500/25 to-orange-600/10',
  'text-amber-400': 'from-amber-500/25 to-amber-600/10',
  'text-yellow-400': 'from-yellow-500/25 to-yellow-600/10',
  'text-green-400': 'from-green-500/25 to-green-600/10',
  'text-blue-400': 'from-blue-500/25 to-blue-600/10',
  'text-cyan-400': 'from-cyan-500/25 to-cyan-600/10',
  'text-purple-400': 'from-purple-500/25 to-purple-600/10',
  'text-white': 'from-white/15 to-white/5',
};

const ACCENT_BAR = {
  red: '#E31937',
  orange: '#f97316',
  amber: '#f59e0b',
  yellow: '#eab308',
  green: '#22c55e',
  blue: '#3b82f6',
  white: '#94a3b8',
};

export default function StatCard({
  label,
  value,
  displayValue,
  icon: Icon,
  color = 'text-red-400',
  bg,
  suffix,
  sublabel,
  trend,
  delay = 0,
  onClick,
  active = false,
}) {
  const glowColor = COLOR_MAP[color] || 'red';
  const iconBg = ICON_BG[color] || ICON_BG['text-red-400'];

  return (
    <GlassCard
      delay={delay}
      hover={!!onClick}
      onClick={onClick}
      className={`!p-3 bg-gradient-to-br ${bg || 'from-red-500/10 to-rose-500/5'} ${active ? 'ring-1 ring-red-500/40' : ''}`}
    >
      <div className="flex items-center gap-2.5">
        {Icon && (
          <div className={`shrink-0 w-9 h-9 rounded-lg flex items-center justify-center bg-gradient-to-br ${iconBg} border border-white/10 shadow-inner`}>
            <Icon size={16} className={color} />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="text-[9px] text-slate-500 uppercase tracking-[0.16em] font-orbitron truncate leading-tight">{label}</p>
          <div className={`${color} -mt-0.5`}>
            {displayValue ? (
              <span className={`font-black text-2xl inline-block ${color}`} style={{ textShadow: `0 0 16px ${ACCENT_BAR[glowColor]}66` }}>
                {displayValue}
              </span>
            ) : (
              <FloatingCounter value={value} suffix={suffix || ''} color={glowColor} size="2xl" />
            )}
          </div>
          {sublabel && <p className="text-[9px] text-slate-500 tracking-wide mt-0.5">{sublabel}</p>}
          {trend && <p className={`text-[9px] tracking-wide mt-0.5 ${trend.color || 'text-slate-500'}`}>{trend.text}</p>}
        </div>
        <div
          className="shrink-0 w-0.5 h-8 rounded-full opacity-80"
          style={{ background: `linear-gradient(180deg, ${ACCENT_BAR[glowColor] || ACCENT_BAR.red}, transparent)` }}
        />
      </div>
    </GlassCard>
  );
}
