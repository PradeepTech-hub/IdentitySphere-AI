/** Shared Recharts styling — matches IdentitySphere landing page */

export const CHART_TOOLTIP_STYLE = {
  background: 'rgba(8, 10, 18, 0.96)',
  border: '1px solid rgba(227, 25, 55, 0.35)',
  borderRadius: 12,
  fontSize: 12,
  color: '#f1f5f9',
  boxShadow: '0 12px 40px rgba(0,0,0,0.5), 0 0 20px rgba(227,25,55,0.15)',
  padding: '10px 14px',
};

export const AXIS_TICK = { fontSize: 10, fill: '#64748b', fontFamily: 'Inter, sans-serif' };

export const GRID_STROKE = 'rgba(227, 25, 55, 0.08)';

export function GlassTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={CHART_TOOLTIP_STYLE}>
      {label && <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1.5 font-orbitron">{label}</p>}
      {payload.map((p) => (
        <p key={p.dataKey} className="text-sm font-medium" style={{ color: p.color }}>
          <span className="capitalize">{p.name || p.dataKey}</span>: {p.value}
        </p>
      ))}
    </div>
  );
}

export function PieTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const d = payload[0];
  return (
    <div style={CHART_TOOLTIP_STYLE}>
      <p className="text-sm font-medium capitalize text-white">{d.name}</p>
      <p className="text-lg font-orbitron font-bold mt-1" style={{ color: d.payload?.color || d.color }}>
        {d.value}
      </p>
    </div>
  );
}
