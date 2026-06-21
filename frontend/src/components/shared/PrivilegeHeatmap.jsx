import { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Shield, AlertTriangle, Users, Lock, Clock, Target, ChevronRight } from 'lucide-react';
import GlassCard from './GlassCard';
import SeverityBadge from './SeverityBadge';
import PlatformIcon from './PlatformIcon';
import { getIdentities, getRiskEvents } from '../../services/storageService';
import { usePlatformData } from '../../context/PlatformDataContext';

const PLATFORM_LABELS = {
  active_directory: 'AD', azure_ad: 'Azure AD', aws_iam: 'AWS',
  okta: 'Okta', salesforce: 'SF', servicenow: 'SN', github: 'GitHub',
};

function cellColor(val) {
  if (val >= 31) return { bg: 'rgba(239,68,68,0.55)', text: '#fca5a5', label: 'Critical' };
  if (val >= 21) return { bg: 'rgba(249,115,22,0.50)', text: '#fdba74', label: 'High' };
  if (val >= 11) return { bg: 'rgba(234,179,8,0.40)', text: '#fde047', label: 'Medium' };
  if (val > 0) return { bg: 'rgba(34,197,94,0.35)', text: '#86efac', label: 'Low' };
  return { bg: 'rgba(100,116,139,0.15)', text: '#64748b', label: 'None' };
}

export default function PrivilegeHeatmap() {
  const { data } = usePlatformData();
  const heatmap = data?.privilege_heatmap;
  const [selected, setSelected] = useState(null);
  const [hovered, setHovered] = useState(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });

  const identities = useMemo(() => getIdentities(), [data]);
  const risks = useMemo(() => getRiskEvents(), [data]);

  const { platforms, departments, matrix, cellData } = useMemo(() => {
    if (!heatmap?.matrix?.length) return { platforms: [], departments: [], matrix: [], cellData: {} };
    const cd = {};
    const plats = heatmap.platforms || [];
    const depts = heatmap.departments || [];
    plats.forEach((plat, pi) => {
      depts.forEach((dept, di) => {
        const key = `${plat}:${dept}`;
        const matching = identities.filter(i => (i.platforms || []).includes(plat) && i.department === dept);
        const matchingRisks = risks.filter(r => (r.platforms || []).includes(plat) && matching.some(m => m.person_id === r.identityId));
        cd[key] = {
          platform: plat, department: dept,
          avgRisk: heatmap.matrix[pi]?.[di] ?? 0,
          count: matching.length,
          admins: matching.filter(i => i.is_admin).length,
          critical: matchingRisks.filter(r => r.severity === 'critical').length,
          dormant: matching.filter(i => i.status === 'Dormant' || (i.max_dormancy_days || 0) > 90).length,
          mfaGaps: matching.filter(i => !i.mfa_complete && i.status === 'Active').length,
          topIdentities: [...matching].sort((a, b) => (b.risk_score || 0) - (a.risk_score || 0)).slice(0, 5),
          riskDrivers: computeDrivers(matchingRisks),
        };
      });
    });
    return { platforms: plats, departments: depts, matrix: heatmap.matrix, cellData: cd };
  }, [heatmap, identities, risks, data]);

  const summaryMetrics = useMemo(() => {
    if (!platforms.length) return null;
    let maxPlatRisk = { name: '', val: 0 }, maxDeptRisk = { name: '', val: 0 }, totalCritical = 0, maxPrivDept = { name: '', val: 0 };
    const platAvg = {}, deptAvg = {}, deptAdmin = {};
    platforms.forEach((p, pi) => {
      const vals = matrix[pi]?.filter(v => v > 0) || [];
      const avg = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
      platAvg[p] = avg;
      if (avg > maxPlatRisk.val) maxPlatRisk = { name: PLATFORM_LABELS[p] || p, val: avg };
    });
    departments.forEach((d, di) => {
      const vals = platforms.map((_, pi) => matrix[pi]?.[di] || 0).filter(v => v > 0);
      const avg = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
      if (avg > maxDeptRisk.val) maxDeptRisk = { name: d, val: avg };
      const deptIds = identities.filter(i => i.department === d);
      const admCount = deptIds.filter(i => i.is_admin).length;
      deptAdmin[d] = admCount;
      if (admCount > maxPrivDept.val) maxPrivDept = { name: d, val: admCount };
    });
    Object.values(cellData).forEach(c => { totalCritical += c.critical; });
    return { maxPlatRisk, maxDeptRisk, totalCritical, maxPrivDept };
  }, [platforms, departments, matrix, cellData, identities]);

  if (!platforms.length) {
    return <GlassCard hover={false}><p className="text-sm text-slate-500">Privilege heatmap loads after backend pipeline run.</p></GlassCard>;
  }

  const sel = selected ? cellData[`${selected.plat}:${selected.dept}`] : null;

  return (
    <div className="space-y-4">
      <GlassCard hover={false}>
        <h3 className="text-sm font-semibold text-white mb-0.5">Cross-Platform Privilege Exposure Heatmap</h3>
        <p className="text-[11px] text-slate-500 mb-4">Effective privilege exposure and risk concentration across platforms and departments</p>

        {/* Summary Metrics */}
        {summaryMetrics && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-5">
            {[
              { label: 'Highest Risk Platform', value: summaryMetrics.maxPlatRisk.name, sub: `Avg: ${summaryMetrics.maxPlatRisk.val.toFixed(1)}`, color: 'text-red-400' },
              { label: 'Highest Risk Department', value: summaryMetrics.maxDeptRisk.name, sub: `Avg: ${summaryMetrics.maxDeptRisk.val.toFixed(1)}`, color: 'text-orange-400' },
              { label: 'Critical Findings', value: summaryMetrics.totalCritical, sub: 'Across all cells', color: 'text-red-400' },
              { label: 'Most Privileged Dept', value: summaryMetrics.maxPrivDept.name, sub: `${summaryMetrics.maxPrivDept.val} admins`, color: 'text-amber-400' },
            ].map(m => (
              <div key={m.label} className="rounded-lg p-2.5" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(227,25,55,0.1)' }}>
                <p className="text-[9px] text-slate-500 uppercase tracking-wider">{m.label}</p>
                <p className={`text-sm font-bold ${m.color}`}>{m.value}</p>
                <p className="text-[9px] text-slate-600">{m.sub}</p>
              </div>
            ))}
          </div>
        )}

        {/* Heatmap Grid */}
        <div className="overflow-x-auto">
          <table className="w-full text-[10px] border-collapse">
            <thead>
              <tr>
                <th className="text-left p-2 text-slate-500 font-medium sticky left-0" style={{ background: 'rgba(5,6,13,0.95)' }}>Platform</th>
                {departments.map(d => <th key={d} className="p-1.5 text-slate-500 font-medium text-center min-w-[48px]">{d.slice(0, 7)}</th>)}
              </tr>
            </thead>
            <tbody>
              {platforms.map((plat, pi) => (
                <tr key={plat}>
                  <td className="p-2 text-slate-300 whitespace-nowrap sticky left-0" style={{ background: 'rgba(5,6,13,0.95)' }}>
                    <div className="flex items-center gap-1.5">
                      <PlatformIcon platform={plat} size="sm" />
                      <span>{PLATFORM_LABELS[plat] || plat}</span>
                    </div>
                  </td>
                  {departments.map((dept, di) => {
                    const val = matrix[pi]?.[di] ?? 0;
                    const c = cellColor(val);
                    const key = `${plat}:${dept}`;
                    const isHovered = hovered === key;
                    return (
                      <td key={di} className="p-0.5">
                        <div
                          className="rounded h-9 flex items-center justify-center font-semibold cursor-pointer transition-all duration-150"
                          style={{ background: c.bg, color: c.text, outline: isHovered ? '2px solid rgba(227,25,55,0.6)' : 'none' }}
                          onClick={() => setSelected(selected?.plat === plat && selected?.dept === dept ? null : { plat, dept })}
                          onMouseEnter={(e) => { setHovered(key); const r = e.currentTarget.getBoundingClientRect(); setTooltipPos({ x: r.right + 8, y: r.top }); }}
                          onMouseLeave={() => setHovered(null)}
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

        {/* Floating Tooltip — rendered outside table to avoid overlap */}
        {hovered && cellData[hovered] && (
          <div className="fixed pointer-events-none" style={{
            left: Math.min(tooltipPos.x, window.innerWidth - 230),
            top: Math.max(tooltipPos.y - 20, 60),
            zIndex: 9999,
          }}>
            <div className="w-52 rounded-lg p-3" style={{ background: 'rgba(5,6,13,0.97)', border: '1px solid rgba(227,25,55,0.3)', boxShadow: '0 8px 32px rgba(0,0,0,0.7)' }}>
              <p className="text-xs font-bold text-white mb-1.5">{PLATFORM_LABELS[cellData[hovered].platform] || cellData[hovered].platform} × {cellData[hovered].department}</p>
              <div className="space-y-1 text-[10px]">
                <Row label="Avg Risk Score" value={cellData[hovered].avgRisk} color="text-red-400" />
                <Row label="Identities" value={cellData[hovered].count} color="text-blue-400" />
                <Row label="Admin Accounts" value={cellData[hovered].admins} color="text-orange-400" />
                <Row label="Critical Findings" value={cellData[hovered].critical} color="text-red-400" />
                <Row label="Dormant Accounts" value={cellData[hovered].dormant} color="text-yellow-400" />
                <Row label="MFA Gaps" value={cellData[hovered].mfaGaps} color="text-amber-400" />
              </div>
              <p className="text-[9px] text-slate-600 mt-2">Click cell to investigate</p>
            </div>
          </div>
        )}

        {/* Legend */}
        <div className="flex items-center gap-4 mt-3 text-[9px] text-slate-500">
          <span className="font-medium">Exposure:</span>
          {[
            { label: '0-10 Low', bg: 'rgba(34,197,94,0.4)' },
            { label: '11-20 Medium', bg: 'rgba(234,179,8,0.45)' },
            { label: '21-30 High', bg: 'rgba(249,115,22,0.5)' },
            { label: '31+ Critical', bg: 'rgba(239,68,68,0.55)' },
          ].map(l => (
            <span key={l.label} className="flex items-center gap-1">
              <span className="w-3 h-3 rounded-sm" style={{ background: l.bg }} />
              {l.label}
            </span>
          ))}
        </div>
      </GlassCard>

      {/* Investigation Panel */}
      <AnimatePresence>
        {sel && (
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
            <GlassCard hover={false}>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <PlatformIcon platform={selected.plat} size="lg" />
                  <div>
                    <h3 className="text-sm font-bold text-white">{PLATFORM_LABELS[selected.plat] || selected.plat} × {selected.dept}</h3>
                    <p className="text-[10px] text-slate-500">Privilege exposure investigation</p>
                  </div>
                </div>
                <button onClick={() => setSelected(null)} className="p-1.5 rounded-lg hover:bg-white/5 text-slate-500 hover:text-white"><X size={16} /></button>
              </div>

              {/* Quick Stats */}
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 mb-5">
                {[
                  { icon: Target, label: 'Avg Risk', value: sel.avgRisk, color: 'text-red-400' },
                  { icon: Users, label: 'Identities', value: sel.count, color: 'text-blue-400' },
                  { icon: Shield, label: 'Admins', value: sel.admins, color: 'text-orange-400' },
                  { icon: AlertTriangle, label: 'Critical', value: sel.critical, color: 'text-red-400' },
                  { icon: Clock, label: 'Dormant', value: sel.dormant, color: 'text-yellow-400' },
                  { icon: Lock, label: 'MFA Gaps', value: sel.mfaGaps, color: 'text-amber-400' },
                ].map(s => (
                  <div key={s.label} className="rounded-lg p-2 text-center" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                    <s.icon size={14} className={`${s.color} mx-auto mb-1 opacity-60`} />
                    <p className={`text-lg font-bold ${s.color}`}>{s.value}</p>
                    <p className="text-[9px] text-slate-500">{s.label}</p>
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Top Contributing Identities */}
                <div>
                  <h4 className="text-xs text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <Users size={12} className="text-red-400" /> Top Contributing Identities
                  </h4>
                  {sel.topIdentities.length > 0 ? (
                    <div className="space-y-1.5">
                      {sel.topIdentities.map((id, i) => (
                        <div key={id.person_id} className="flex items-center gap-3 rounded-lg px-3 py-2" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
                          <span className="text-[10px] font-bold text-red-400 w-4">{i + 1}</span>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs text-white font-medium truncate">{id.display_name}</p>
                            <p className="text-[10px] text-slate-500">{id.person_id}</p>
                          </div>
                          <span className="text-xs font-mono font-bold text-red-400">{id.risk_score || 0}</span>
                          <SeverityBadge severity={id.severity || 'low'} />
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-slate-500 italic">No identities in this cell</p>
                  )}
                </div>

                {/* Risk Drivers + Compliance */}
                <div className="space-y-4">
                  <div>
                    <h4 className="text-xs text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                      <AlertTriangle size={12} className="text-orange-400" /> Risk Drivers
                    </h4>
                    {sel.riskDrivers.length > 0 ? (
                      <div className="space-y-2">
                        {sel.riskDrivers.map(d => (
                          <div key={d.type}>
                            <div className="flex items-center justify-between mb-0.5">
                              <span className="text-[11px] text-slate-300">{d.type.replace(/_/g, ' ')}</span>
                              <span className="text-[10px] font-mono text-slate-400">{d.pct}%</span>
                            </div>
                            <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
                              <div className="h-full rounded-full" style={{ width: `${d.pct}%`, background: d.pct > 30 ? '#ef4444' : d.pct > 15 ? '#f97316' : '#eab308' }} />
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-slate-500 italic">No findings in this cell</p>
                    )}
                  </div>

                  <div>
                    <h4 className="text-xs text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                      <Shield size={12} className="text-blue-400" /> Compliance Impact
                    </h4>
                    <div className="space-y-1">
                      {[
                        { ref: 'NIST AC-6', label: 'Least Privilege violations', count: sel.admins },
                        { ref: 'GDPR Art.32', label: 'Security of Processing findings', count: sel.mfaGaps + sel.dormant },
                        { ref: 'CIS Control 6', label: 'Access Control gaps', count: sel.critical },
                      ].filter(c => c.count > 0).map(c => (
                        <div key={c.ref} className="flex items-center justify-between px-2.5 py-1.5 rounded-lg" style={{ background: 'rgba(59,130,246,0.04)', border: '1px solid rgba(59,130,246,0.1)' }}>
                          <span className="text-[10px] text-blue-400 font-semibold">{c.ref}</span>
                          <span className="text-[10px] text-slate-400">{c.count} {c.label}</span>
                        </div>
                      ))}
                      {sel.admins === 0 && sel.mfaGaps === 0 && sel.dormant === 0 && sel.critical === 0 && (
                        <p className="text-xs text-emerald-400">No compliance violations detected</p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </GlassCard>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Row({ label, value, color }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-slate-400">{label}</span>
      <span className={`font-semibold ${color}`}>{value}</span>
    </div>
  );
}

function computeDrivers(risks) {
  const counts = {};
  risks.forEach(r => { counts[r.type] = (counts[r.type] || 0) + 1; });
  const total = risks.length || 1;
  return Object.entries(counts)
    .map(([type, count]) => ({ type, count, pct: Math.round((count / total) * 100) }))
    .sort((a, b) => b.pct - a.pct)
    .slice(0, 5);
}
