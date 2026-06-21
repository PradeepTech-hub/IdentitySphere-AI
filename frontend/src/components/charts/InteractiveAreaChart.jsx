import { useState } from 'react';
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend,
} from 'recharts';
import { GlassTooltip, AXIS_TICK, GRID_STROKE } from './chartTheme';

/**
 * Interactive multi-series area chart with gradients, hover dots, and legend toggle.
 */
export default function InteractiveAreaChart({
  data,
  series = [],
  height = 260,
  showLegend = true,
  title,
  xKey = 'day',
}) {
  const [hidden, setHidden] = useState({});

  const toggle = (key) => setHidden((h) => ({ ...h, [key]: !h[key] }));

  return (
    <div>
      {title && <h3 className="text-sm font-semibold text-slate-300 mb-4 font-orbitron">{title}</h3>}
      <div style={{ width: '100%', height }}>
      <ResponsiveContainer>
        <AreaChart data={data} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
          <defs>
            {series.map((s) => (
              <linearGradient key={s.key} id={`grad-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={s.color} stopOpacity={0.35} />
                <stop offset="100%" stopColor={s.color} stopOpacity={0} />
              </linearGradient>
            ))}
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} vertical={false} />
          <XAxis dataKey={xKey} tick={AXIS_TICK} axisLine={false} tickLine={false} dy={8} />
          <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} dx={-4} />
          <Tooltip content={<GlassTooltip />} cursor={{ stroke: 'rgba(227,25,55,0.3)', strokeWidth: 1 }} />
          {showLegend && (
            <Legend
              wrapperStyle={{ fontSize: 11, paddingTop: 12 }}
              formatter={(value, entry) => (
                <span
                  style={{
                    color: hidden[entry.dataKey] ? '#475569' : entry.color,
                    cursor: 'pointer',
                    textTransform: 'capitalize',
                  }}
                  onClick={() => toggle(entry.dataKey)}
                >
                  {value}
                </span>
              )}
            />
          )}
          {series.map((s) =>
            hidden[s.key] ? null : (
              <Area
                key={s.key}
                type="monotone"
                dataKey={s.key}
                name={s.name || s.key}
                stroke={s.color}
                fill={s.dashed ? 'none' : `url(#grad-${s.key})`}
                strokeWidth={s.dashed ? 2 : 2.5}
                dot={false}
                activeDot={{
                  r: 6,
                  fill: s.color,
                  stroke: '#fff',
                  strokeWidth: 2,
                  style: { filter: `drop-shadow(0 0 6px ${s.color})` },
                }}
                animationDuration={1200}
                animationEasing="ease-out"
                strokeDasharray={s.dashed ? '6 4' : undefined}
              />
            )
          )}
        </AreaChart>
      </ResponsiveContainer>
      </div>
    </div>
  );
}
