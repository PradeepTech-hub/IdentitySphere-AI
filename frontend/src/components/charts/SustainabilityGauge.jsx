import FloatingCounter from '../shared/FloatingCounter';

/** Semi-circular gauge for executive sustainability / ESG security score */
export default function SustainabilityGauge({
  score = 78,
  max = 100,
  statusLabel = 'Sustainable',
  onClick,
  compact = false,
}) {
  const pct = Math.min(1, Math.max(0, score / max));
  const arcLength = 188.5;
  const offset = arcLength * (1 - pct);
  const color = score >= 70 ? '#22c55e' : score >= 50 ? '#f97316' : '#E31937';
  const glowColor = score >= 70 ? 'green' : score >= 50 ? 'orange' : 'red';

  const Wrapper = onClick ? 'button' : 'div';
  const wrapperProps = onClick
    ? { type: 'button', onClick, className: 'w-full flex flex-col items-center py-2 rounded-xl hover:bg-white/[0.03] transition-colors cursor-pointer group' }
    : { className: 'flex flex-col items-center py-2' };

  return (
    <Wrapper {...wrapperProps}>
      <div className={`relative w-full ${compact ? 'max-w-[180px]' : 'max-w-[220px]'}`}>
        <svg viewBox="0 0 160 90" className="w-full">
          <path
            d="M20 80 A60 60 0 0 1 140 80"
            stroke="rgba(255,255,255,0.08)"
            strokeWidth="10"
            fill="none"
            strokeLinecap="round"
          />
          <path
            d="M20 80 A60 60 0 0 1 140 80"
            stroke={color}
            strokeWidth="10"
            fill="none"
            strokeLinecap="round"
            strokeDasharray={arcLength}
            strokeDashoffset={offset}
            style={{
              filter: `drop-shadow(0 0 8px ${color}88)`,
              transition: 'stroke-dashoffset 1.6s cubic-bezier(0.4, 0, 0.2, 1)',
            }}
          />
        </svg>
        <div className="absolute inset-x-0 bottom-0 flex flex-col items-center">
          <FloatingCounter value={score} suffix={`/${max}`} color={glowColor} size={compact ? '2xl' : '3xl'} />
        </div>
      </div>
      <p className="text-xs font-orbitron font-bold text-green-400 tracking-wider mt-1">{statusLabel}</p>
      {!compact && (
        <>
          <p className="text-[10px] text-slate-500 text-center mt-2 leading-relaxed max-w-[220px]">
            Measures identity security, governance, and operational resilience.
          </p>
          {onClick && (
            <p className="text-[9px] text-red-400/80 font-orbitron uppercase tracking-wider mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
              Click for details
            </p>
          )}
        </>
      )}
    </Wrapper>
  );
}
