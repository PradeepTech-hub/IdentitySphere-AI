import { useState } from 'react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Sector } from 'recharts';
import { PieTooltip } from './chartTheme';

const DEFAULT_COLORS = ['#E31937', '#f97316', '#eab308', '#22c55e'];

/** Active slice render — pops out on hover */
function ActiveShape(props) {
  const { cx, cy, innerRadius, outerRadius, startAngle, endAngle, fill } = props;
  return (
    <Sector
      cx={cx}
      cy={cy}
      innerRadius={innerRadius}
      outerRadius={outerRadius + 8}
      startAngle={startAngle}
      endAngle={endAngle}
      fill={fill}
      style={{ filter: `drop-shadow(0 0 10px ${fill})` }}
    />
  );
}

/**
 * Interactive donut chart — hover to highlight slice, click legend items.
 */
export default function InteractivePieChart({ data = [], height = 220, title }) {
  const [activeIndex, setActiveIndex] = useState(null);

  const chartData = data.map((d, i) => ({
    ...d,
    color: d.color || DEFAULT_COLORS[i % DEFAULT_COLORS.length],
  }));

  if (!chartData.length) {
    return (
      <div className="flex items-center justify-center text-slate-500 text-sm" style={{ height }}>
        No data
      </div>
    );
  }

  return (
    <div>
      {title && <h3 className="text-sm font-semibold text-slate-300 mb-4 font-orbitron">{title}</h3>}
      <div style={{ width: '100%', height }}>
      <ResponsiveContainer>
        <PieChart>
          <Pie
            data={chartData}
            cx="50%"
            cy="50%"
            innerRadius={55}
            outerRadius={80}
            paddingAngle={3}
            dataKey="value"
            nameKey="name"
            activeIndex={activeIndex}
            activeShape={ActiveShape}
            onMouseEnter={(_, i) => setActiveIndex(i)}
            onMouseLeave={() => setActiveIndex(null)}
            animationBegin={0}
            animationDuration={900}
          >
            {chartData.map((d, i) => (
              <Cell
                key={d.name}
                fill={d.color}
                stroke="rgba(5,6,13,0.8)"
                strokeWidth={2}
                opacity={activeIndex === null || activeIndex === i ? 1 : 0.45}
                style={{ cursor: 'pointer', transition: 'opacity 0.2s' }}
              />
            ))}
          </Pie>
          <Tooltip content={<PieTooltip />} />
        </PieChart>
      </ResponsiveContainer>
      </div>
      <div className="flex flex-wrap gap-3 justify-center mt-2">
        {chartData.map((d, i) => (
          <button
            key={d.name}
            type="button"
            onMouseEnter={() => setActiveIndex(i)}
            onMouseLeave={() => setActiveIndex(null)}
            className="flex items-center gap-1.5 text-[11px] text-slate-400 hover:text-white transition-colors capitalize"
          >
            <span className="w-2.5 h-2.5 rounded-full" style={{ background: d.color, boxShadow: activeIndex === i ? `0 0 8px ${d.color}` : 'none' }} />
            {d.name} ({d.value})
          </button>
        ))}
      </div>
    </div>
  );
}
