import { useMemo } from 'react';
import GlassCard from './GlassCard';
import { usePlatformData } from '../../context/PlatformDataContext';

const PLATFORM_LABELS = {
  active_directory: 'AD',
  azure_ad: 'Azure AD',
  aws_iam: 'AWS',
  okta: 'Okta',
  salesforce: 'SF',
  servicenow: 'SN',
  github: 'GitHub',
};

function cellColor(value) {
  if (value >= 50) return 'bg-red-500/70';
  if (value >= 35) return 'bg-orange-500/60';
  if (value >= 20) return 'bg-yellow-500/50';
  if (value > 0) return 'bg-emerald-500/40';
  return 'bg-slate-700/40';
}

export default function PrivilegeHeatmap() {
  const { data } = usePlatformData();
  const heatmap = data?.privilege_heatmap;

  const { platforms, departments, matrix } = useMemo(() => {
    if (!heatmap?.matrix?.length) {
      return { platforms: [], departments: [], matrix: [] };
    }
    return heatmap;
  }, [heatmap]);

  if (!platforms.length) {
    return (
      <GlassCard hover={false}>
        <p className="text-sm text-slate-500">Privilege heatmap loads from pipeline API after backend run.</p>
      </GlassCard>
    );
  }

  return (
    <GlassCard hover={false} delay={0.15}>
      <h3 className="text-sm font-semibold text-white mb-1">Cross-Platform Privilege Heatmap</h3>
      <p className="text-[11px] text-slate-500 mb-4">Average composite risk score by platform × department</p>
      <div className="overflow-x-auto">
        <table className="w-full text-[10px] border-collapse">
          <thead>
            <tr>
              <th className="text-left p-2 text-slate-500 font-medium">Platform</th>
              {departments.map((d) => (
                <th key={d} className="p-2 text-slate-500 font-medium text-center min-w-[52px]">{d.slice(0, 8)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {platforms.map((plat, pi) => (
              <tr key={plat}>
                <td className="p-2 text-slate-300 whitespace-nowrap">{PLATFORM_LABELS[plat] || plat}</td>
                {departments.map((_, di) => {
                  const val = matrix[pi]?.[di] ?? 0;
                  return (
                    <td key={di} className="p-1">
                      <div
                        className={`rounded-md h-8 flex items-center justify-center text-white font-medium ${cellColor(val)}`}
                        title={`${PLATFORM_LABELS[plat] || plat} × ${departments[di]}: ${val}`}
                      >
                        {val > 0 ? val : '—'}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </GlassCard>
  );
}
