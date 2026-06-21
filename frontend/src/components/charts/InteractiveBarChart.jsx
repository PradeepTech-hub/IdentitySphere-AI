import { useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell,
} from 'recharts';
import { GlassTooltip, AXIS_TICK, GRID_STROKE } from './chartTheme';

/**
 * Interactive horizontal or vertical bar chart with hover glow on bars.
 */
export default function InteractiveBarChart({
  data,
  dataKey = 'value',
  labelKey = 'label',
  layout = 'vertical',
  height = 300,
  title,
  colorKey = 'color',
  defaultColor = '#E31937',
}) {
  const [activeBar, setActiveBar] = useState(null);

  const isVertical = layout === 'vertical';

  return (
    <div>
      {title && <h3 className="text-sm font-semibold text-slate-300 mb-4 font-orbitron">{title}</h3>}
      <div className="w-full min-w-0" style={{ minHeight: Math.max(height - 20, 160) }}>
      <ResponsiveContainer width="99%" height={height}>
        <BarChart
          data={data}
          layout={isVertical ? 'vertical' : 'horizontal'}
          margin={{ top: 4, right: 12, left: isVertical ? 4 : 0, bottom: 4 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} horizontal={!isVertical} vertical={isVertical} />
          {isVertical ? (
            <>
              <XAxis type="number" tick={AXIS_TICK} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey={labelKey} tick={{ ...AXIS_TICK, fill: '#94a3b8', fontSize: 11 }} axisLine={false} tickLine={false} width={120} />
            </>
          ) : (
            <>
              <XAxis dataKey={labelKey} tick={AXIS_TICK} axisLine={false} tickLine={false} />
              <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} />
            </>
          )}
          <Tooltip content={<GlassTooltip />} cursor={{ fill: 'rgba(227,25,55,0.06)' }} />
          <Bar
            dataKey={dataKey}
            radius={isVertical ? [0, 8, 8, 0] : [8, 8, 0, 0]}
            barSize={22}
            animationDuration={1000}
            onMouseEnter={(_, i) => setActiveBar(i)}
            onMouseLeave={() => setActiveBar(null)}
          >
            {data.map((d, i) => {
              const c = d[colorKey] || defaultColor;
              const active = activeBar === i;
              return (
                <Cell
                  key={i}
                  fill={c}
                  fillOpacity={active ? 1 : 0.72}
                  style={{
                    filter: active ? `drop-shadow(0 0 8px ${c})` : 'none',
                    transition: 'all 0.2s ease',
                  }}
                />
              );
            })}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      </div>
    </div>
  );
}
