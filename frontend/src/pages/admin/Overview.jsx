import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Users, AlertTriangle, ShieldCheck, Bell, TrendingDown, Activity, Server, Key, Sparkles, Target, Shield } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, PieChart, Pie, Cell } from 'recharts';
import ChartContainer from '../../components/shared/ChartContainer';
import GlassCard from '../../components/shared/GlassCard';
import AnimatedCounter from '../../components/shared/AnimatedCounter';
import SeverityBadge from '../../components/shared/SeverityBadge';
import PlatformIcon from '../../components/shared/PlatformIcon';
import PrivilegeHeatmap from '../../components/shared/PrivilegeHeatmap';
import { getIdentities, getRiskEvents, getIncidents } from '../../services/storageService';
import { usePlatformData } from '../../context/PlatformDataContext';
import { TREND_DATA } from '../../data/mockData';

const PIE_COLORS = ['#ef4444', '#f97316', '#eab308', '#22c55e'];

export default function Overview() {
  const navigate = useNavigate();
  const { data } = usePlatformData();
  const identities = useMemo(() => getIdentities(), [data]);
  const risks = useMemo(() => getRiskEvents(), [data]);
  const incidents = useMemo(() => getIncidents(), [data]);

  const totalIdentities = identities.length;
  const activeIdentities = identities.filter(i => i.status === 'Active').length;
  const adminUsers = identities.filter(i => i.is_admin);
  const crossPlatformAdmins = adminUsers.filter(i => (i.platforms?.length || 0) >= 2).length;
  const criticalRisks = risks.filter(r => r.severity === 'critical').length;
  const highRisks = risks.filter(r => r.severity === 'high').length;
  const mfaGaps = identities.filter(i => !i.mfa_complete && i.status === 'Active').length;
  const dormantAccounts = identities.filter(i => i.status === 'Dormant' || (i.max_dormancy_days || 0) > 90).length;
  const orphanedAccounts = identities.filter(i => i.status === 'Orphaned').length;
  const activeIncidents = incidents.filter(i => i.status !== 'resolved').length;
  const platforms = new Set(identities.flatMap(i => i.platforms || [])).size;

  const sevDist = { critical: criticalRisks, high: highRisks, medium: risks.filter(r => r.severity === 'medium').length, low: risks.filter(r => r.severity === 'low').length };
  const pieData = Object.entries(sevDist).filter(([, v]) => v > 0).map(([name, value]) => ({ name, value }));

  const riskTypeDist = {};
  risks.forEach(r => { riskTypeDist[r.type] = (riskTypeDist[r.type] || 0) + 1; });
  const topCategory = Object.entries(riskTypeDist).sort(([,a],[,b]) => b - a)[0];

  const topRiskyUsers = [...identities].sort((a, b) => (b.risk_score || 0) - (a.risk_score || 0)).slice(0, 6);

  const STAT_CARDS = [
    { label: 'Total Identities', value: totalIdentities, icon: Users, color: 'text-red-400', bg: 'from-red-500/10 to-rose-500/5' },
    { label: 'Critical Risks', value: criticalRisks, icon: AlertTriangle, color: 'text-red-400', bg: 'from-red-500/10 to-orange-500/5' },
    { label: 'Active Incidents', value: activeIncidents, icon: Bell, color: 'text-orange-400', bg: 'from-orange-500/10 to-red-500/5' },
    { label: 'Platforms', value: platforms, icon: Server, color: 'text-amber-400', bg: 'from-amber-500/10 to-orange-500/5' },
    { label: 'Cross-Admins', value: crossPlatformAdmins, icon: Key, color: 'text-orange-400', bg: 'from-orange-500/10 to-red-500/5' },
    { label: 'MFA Gaps', value: mfaGaps, icon: Shield, color: 'text-yellow-400', bg: 'from-yellow-500/10 to-amber-500/5' },
    { label: 'Dormant', value: dormantAccounts, icon: Activity, color: 'text-amber-400', bg: 'from-amber-500/10 to-yellow-500/5' },
    { label: 'Orphaned', value: orphanedAccounts, icon: Target, color: 'text-red-400', bg: 'from-red-500/10 to-rose-500/5' },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Identity Security Operations Center</h1>
        <p className="text-sm text-slate-500 mt-1">Real-time identity threat intelligence across your hybrid enterprise</p>
      </div>

      <GlassCard className="border-red-500/20 bg-red-500/[0.04]" glow>
        <div className="flex items-center gap-4">
          <span className="relative flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75" />
            <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500" />
          </span>
          <div className="flex items-center gap-3">
            <span className="text-xs font-bold uppercase tracking-widest text-red-400">
              Threat Level: {criticalRisks >= 5 ? 'Critical' : criticalRisks >= 2 ? 'Elevated' : 'Normal'}
            </span>
            <span className="text-[11px] text-slate-500">|</span>
            <span className="text-[11px] text-slate-400">{criticalRisks} critical and {highRisks} high-severity risks across {platforms} platforms</span>
          </div>
        </div>
      </GlassCard>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {STAT_CARDS.map((s, i) => (
          <GlassCard key={s.label} delay={i * 0.05} className={`bg-gradient-to-br ${s.bg}`}>
            <div className="flex items-start justify-between">
              <div>
                <p className="text-[11px] text-slate-500 uppercase tracking-wider">{s.label}</p>
                <p className={`text-3xl font-black mt-1 ${s.color}`}><AnimatedCounter value={s.value} suffix={s.suffix || ''} /></p>
              </div>
              <s.icon size={20} className={s.color + ' opacity-40'} />
            </div>
          </GlassCard>
        ))}
      </div>

      {/* AI Security Posture Summary */}
      <GlassCard hover={false} glow="red" delay={0.15}>
        <div className="flex items-center gap-2 mb-4">
          <Sparkles size={16} className="text-red-400" />
          <h3 className="text-sm font-semibold text-white">AI Security Posture Summary</h3>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
          <div className="rounded-lg p-3" style={{ background: 'rgba(239,68,68,0.05)', border: '1px solid rgba(239,68,68,0.12)' }}>
            <p className="text-[10px] text-slate-500 uppercase">High Risk Users</p>
            <p className="text-xl font-bold text-red-400">{identities.filter(i => (i.risk_score || 0) >= 60).length}</p>
          </div>
          <div className="rounded-lg p-3" style={{ background: 'rgba(239,68,68,0.05)', border: '1px solid rgba(239,68,68,0.12)' }}>
            <p className="text-[10px] text-slate-500 uppercase">Critical Users</p>
            <p className="text-xl font-bold text-red-400">{identities.filter(i => i.severity === 'critical').length}</p>
          </div>
          <div className="rounded-lg p-3" style={{ background: 'rgba(234,179,8,0.05)', border: '1px solid rgba(234,179,8,0.12)' }}>
            <p className="text-[10px] text-slate-500 uppercase">Top Risk Category</p>
            <p className="text-sm font-bold text-yellow-400">{topCategory ? topCategory[0].replace(/_/g, ' ') : 'None'}</p>
          </div>
        </div>
        <p className="text-xs text-slate-400 leading-relaxed">
          Monitoring <strong className="text-white">{totalIdentities}</strong> identities across <strong className="text-white">{platforms}</strong> platforms.{' '}
          <strong className="text-red-400">{crossPlatformAdmins}</strong> cross-platform admins detected.{' '}
          {mfaGaps > 0 && <><strong className="text-yellow-400">{mfaGaps}</strong> accounts lack MFA. </>}
          {dormantAccounts > 0 && <><strong className="text-amber-400">{dormantAccounts}</strong> dormant account(s) require review. </>}
          {orphanedAccounts > 0 && <><strong className="text-red-400">{orphanedAccounts}</strong> orphaned account(s) need immediate remediation.</>}
        </p>
      </GlassCard>

      <div className="grid lg:grid-cols-3 gap-6">
        <GlassCard delay={0.2} hover={false} className="lg:col-span-2">
          <h3 className="text-sm font-semibold text-slate-300 mb-4">Risk Trend (30 Days)</h3>
          <ChartContainer height={260}>
            <AreaChart data={TREND_DATA} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="ovCritGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#ef4444" stopOpacity={0.3}/><stop offset="100%" stopColor="#ef4444" stopOpacity={0}/></linearGradient>
                <linearGradient id="ovHighGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#f97316" stopOpacity={0.2}/><stop offset="100%" stopColor="#f97316" stopOpacity={0}/></linearGradient>
              </defs>
              <XAxis dataKey="day" tick={{ fontSize: 9, fill: '#64748b' }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
              <YAxis tick={{ fontSize: 9, fill: '#64748b' }} axisLine={false} tickLine={false} width={30} />
              <Tooltip contentStyle={{ background: '#0a0f1f', border: '1px solid rgba(227,25,55,0.3)', borderRadius: 12, fontSize: 12, color: '#f1f5f9' }} />
              <Area type="monotone" dataKey="critical" stroke="#ef4444" fill="url(#ovCritGrad)" strokeWidth={2} />
              <Area type="monotone" dataKey="high" stroke="#f97316" fill="url(#ovHighGrad)" strokeWidth={2} />
              <Area type="monotone" dataKey="resolved" stroke="#22c55e" fill="none" strokeWidth={1.5} strokeDasharray="4 4" />
            </AreaChart>
          </ChartContainer>
        </GlassCard>

        <GlassCard delay={0.3} hover={false}>
          <h3 className="text-sm font-semibold text-slate-300 mb-4">Severity Distribution</h3>
          {pieData.length > 0 ? (
            <>
              <ChartContainer height={200}>
                <PieChart>
                  <Pie data={pieData} cx="50%" cy="50%" innerRadius={40} outerRadius={65} paddingAngle={4} dataKey="value">
                    {pieData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                  </Pie>
                  <Tooltip contentStyle={{ background: '#0a0f1f', border: '1px solid rgba(227,25,55,0.3)', borderRadius: 12, fontSize: 12, color: '#f1f5f9' }} />
                </PieChart>
              </ChartContainer>
              <div className="flex flex-wrap gap-3 justify-center mt-2">
                {pieData.map((d, i) => (
                  <span key={d.name} className="flex items-center gap-1.5 text-[11px] text-slate-400">
                    <span className="w-2 h-2 rounded-full" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />{d.name} ({d.value})
                  </span>
                ))}
              </div>
            </>
          ) : (
            <div className="flex items-center justify-center h-48 text-slate-500 text-sm">No risk events</div>
          )}
        </GlassCard>
      </div>

      <GlassCard delay={0.35} hover={false}>
        <h3 className="text-sm font-semibold text-slate-300 mb-4">Top Risky Identities</h3>
        <div className="overflow-x-auto -mx-2 px-2">
          <table className="w-full text-sm" style={{ minWidth: 500 }}>
            <thead><tr className="text-[11px] text-slate-500 uppercase border-b border-white/[0.03]">
              <th className="text-left pb-3 font-medium">Identity</th>
              <th className="text-left pb-3 font-medium">Department</th>
              <th className="text-left pb-3 font-medium">Platforms</th>
              <th className="text-left pb-3 font-medium">Severity</th>
              <th className="text-right pb-3 font-medium">Score</th>
            </tr></thead>
            <tbody>
              {topRiskyUsers.map((u, i) => (
                <motion.tr key={u.person_id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.4 + i * 0.05 }}
                  className="border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors cursor-pointer"
                  onClick={() => navigate(`/admin/identities/${u.person_id}`)}>
                  <td className="py-3 font-medium text-white">{u.display_name}</td>
                  <td className="py-3 text-slate-400">{u.department}</td>
                  <td className="py-3"><div className="flex gap-1">{(u.platforms || []).map(p => <PlatformIcon key={p} platform={p} size="sm" />)}</div></td>
                  <td className="py-3">{u.severity && <SeverityBadge severity={u.severity.toLowerCase()} pulse={u.severity === 'critical'} />}</td>
                  <td className="py-3 text-right font-mono font-bold text-white">{u.risk_score || 0}</td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>
      </GlassCard>

      <PrivilegeHeatmap />
    </div>
  );
}
