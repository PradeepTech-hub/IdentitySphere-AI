import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Users, AlertTriangle, Bell, Activity, Server, Key, Sparkles, Target, Shield } from 'lucide-react';
import GlassCard from '../../components/shared/GlassCard';
import FloatingCounter from '../../components/shared/FloatingCounter';
import PageHeader from '../../components/shared/PageHeader';
import RoleWelcomeBar from '../../components/shared/RoleWelcomeBar';
import StatCard from '../../components/shared/StatCard';
import SeverityBadge from '../../components/shared/SeverityBadge';
import PlatformIcon from '../../components/shared/PlatformIcon';
import SectionHeader from '../../components/shared/SectionHeader';
import InteractiveAreaChart from '../../components/charts/InteractiveAreaChart';
import InteractivePieChart from '../../components/charts/InteractivePieChart';
import IdentityGlobe from '../../components/three/IdentityGlobe';
import { getIdentities, getRiskEvents, getIncidents } from '../../services/storageService';
import { useAuth } from '../../context/AuthContext';
import { TREND_DATA } from '../../data/mockData';

const PIE_COLORS = { critical: '#E31937', high: '#f97316', medium: '#eab308', low: '#22c55e' };

export default function Overview() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const identities = useMemo(() => getIdentities(), []);
  const risks = useMemo(() => getRiskEvents(), []);
  const incidents = useMemo(() => getIncidents(), []);

  const totalIdentities = identities.length;
  const criticalRisks = risks.filter(r => r.severity === 'critical').length;
  const highRisks = risks.filter(r => r.severity === 'high').length;
  const crossPlatformAdmins = identities.filter(i => i.is_admin && (i.platforms?.length || 0) >= 2).length;
  const mfaGaps = identities.filter(i => !i.mfa_complete && i.status === 'Active').length;
  const dormantAccounts = identities.filter(i => i.status === 'Dormant' || (i.max_dormancy_days || 0) > 90).length;
  const orphanedAccounts = identities.filter(i => i.status === 'Orphaned').length;
  const activeIncidents = incidents.filter(i => i.status !== 'resolved').length;
  const platforms = new Set(identities.flatMap(i => i.platforms || [])).size;

  const sevDist = { critical: criticalRisks, high: highRisks, medium: risks.filter(r => r.severity === 'medium').length, low: risks.filter(r => r.severity === 'low').length };
  const pieData = Object.entries(sevDist).filter(([, v]) => v > 0).map(([name, value]) => ({ name, value, color: PIE_COLORS[name] }));

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
      <PageHeader
        badge="IdentitySphere AI · SOC"
        title="Identity Security Operations Center"
        subtitle="Real-time identity threat intelligence across your hybrid enterprise"
      />

      <RoleWelcomeBar user={user} />

      <GlassCard className="border-red-500/20 bg-red-500/[0.04]" glow>
        <div className="flex flex-wrap items-center gap-4">
          <span className="relative flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75" />
            <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500" />
          </span>
          <span className="text-xs font-bold uppercase tracking-widest text-red-400 font-orbitron">
            Threat Level: {criticalRisks >= 5 ? 'Critical' : criticalRisks >= 2 ? 'Elevated' : 'Normal'}
          </span>
          <span className="text-[11px] text-slate-400 font-orbitron tracking-wide">{criticalRisks} critical · {highRisks} high · {platforms} platforms</span>
        </div>
      </GlassCard>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
        {STAT_CARDS.map((s, i) => (
          <StatCard key={s.label} {...s} delay={i * 0.05} />
        ))}
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <GlassCard hover={false} glow="red" delay={0.15} className="lg:col-span-2">
          <SectionHeader title="AI Security Posture" icon={Sparkles} titleClassName="text-white" className="mb-3" />
          <div className="grid lg:grid-cols-2 gap-4">
            <div className="space-y-3">
              <div className="rounded-lg p-3 glass">
                <p className="text-[10px] text-slate-500 uppercase font-orbitron">High Risk Users</p>
                <FloatingCounter value={identities.filter(i => (i.risk_score || 0) >= 60).length} color="red" />
              </div>
              <div className="rounded-lg p-3 glass">
                <p className="text-[10px] text-slate-500 uppercase font-orbitron">Critical Users</p>
                <FloatingCounter value={identities.filter(i => i.severity === 'critical').length} color="red" />
              </div>
              <div className="rounded-lg p-3 glass">
                <p className="text-[10px] text-slate-500 uppercase font-orbitron">Top Risk Category</p>
                <p className="text-sm font-bold text-yellow-400 font-orbitron mt-1">{topCategory ? topCategory[0].replace(/_/g, ' ') : 'None'}</p>
              </div>
            </div>
            <div className="h-[220px] rounded-xl overflow-hidden">
              <IdentityGlobe className="w-full h-full" />
            </div>
          </div>
        </GlassCard>

        <GlassCard delay={0.2} hover={false}>
          <InteractivePieChart data={pieData} height={220} title="Severity Distribution" />
        </GlassCard>
      </div>

      <GlassCard delay={0.25} hover={false}>
        <InteractiveAreaChart
          title="Risk Trend (30 Days)"
          data={TREND_DATA}
          height={280}
          series={[
            { key: 'critical', color: '#E31937', name: 'critical' },
            { key: 'high', color: '#f97316', name: 'high' },
            { key: 'resolved', color: '#22c55e', name: 'resolved', dashed: true },
          ]}
        />
      </GlassCard>

      <GlassCard delay={0.35} hover={false}>
        <SectionHeader title="Top Risky Identities" className="mb-3" />
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-[11px] text-slate-500 uppercase border-b border-white/[0.03] font-orbitron">
              <th className="text-left pb-3 font-medium">Identity</th>
              <th className="text-left pb-3 font-medium">Department</th>
              <th className="text-left pb-3 font-medium">Platforms</th>
              <th className="text-left pb-3 font-medium">Severity</th>
              <th className="text-right pb-3 font-medium">Score</th>
            </tr></thead>
            <tbody>
              {topRiskyUsers.map((u, i) => (
                <motion.tr key={u.person_id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.4 + i * 0.05 }}
                  className="border-b border-white/[0.03] hover:bg-white/[0.04] transition-colors cursor-pointer"
                  onClick={() => navigate(`/admin/identities/${u.person_id}`)}>
                  <td className="py-3 font-medium text-white">{u.display_name}</td>
                  <td className="py-3 text-slate-400">{u.department}</td>
                  <td className="py-3"><div className="flex gap-1">{(u.platforms || []).map(p => <PlatformIcon key={p} platform={p} size="sm" />)}</div></td>
                  <td className="py-3">{u.severity && <SeverityBadge severity={u.severity.toLowerCase()} pulse={u.severity === 'critical'} />}</td>
                  <td className="py-3 text-right"><FloatingCounter value={u.risk_score || 0} color="red" size="2xl" /></td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>
      </GlassCard>
    </div>
  );
}
