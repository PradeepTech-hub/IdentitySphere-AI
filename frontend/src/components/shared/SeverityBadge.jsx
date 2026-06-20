const COLORS = {
  critical: 'bg-red-500/20 text-red-400 border-red-500/30',
  high: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  medium: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  low: 'bg-green-500/20 text-green-400 border-green-500/30',
};

export default function SeverityBadge({ severity, pulse = false }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border backdrop-blur-sm ${COLORS[severity] || COLORS.medium}`}
      style={{ letterSpacing: '0.025em' }}
    >
      {pulse && (
        <span
          className={`w-1.5 h-1.5 rounded-full ${
            severity === 'critical'
              ? 'bg-red-400 animate-pulse'
              : severity === 'high'
              ? 'bg-orange-400'
              : 'bg-yellow-400'
          }`}
        />
      )}
      {severity.toUpperCase()}
    </span>
  );
}
