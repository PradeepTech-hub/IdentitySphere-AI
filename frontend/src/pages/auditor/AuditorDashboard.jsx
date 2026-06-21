import { motion } from 'framer-motion';
import { useMemo } from 'react';
import { FileText, Download, Eye, ShieldCheck, AlertTriangle } from 'lucide-react';
import GlassCard from '../../components/shared/GlassCard';
import PageHeader from '../../components/shared/PageHeader';
import RoleWelcomeBar from '../../components/shared/RoleWelcomeBar';
import SectionHeader from '../../components/shared/SectionHeader';
import StatCard from '../../components/shared/StatCard';
import FloatingCounter from '../../components/shared/FloatingCounter';
import InteractivePieChart from '../../components/charts/InteractivePieChart';
import { getRiskEvents, getIdentities } from '../../services/storageService';
import { usePlatformData } from '../../context/PlatformDataContext';
import { buildComplianceMap, buildEvidencePack, computeComplianceScore } from '../../utils/liveMetrics';
import { Outlet, NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

function CompliancePage() {
  const { data } = usePlatformData();
  const risks = useMemo(() => getRiskEvents(), [data]);
  const identities = useMemo(() => getIdentities(), [data]);
  const complianceMap = useMemo(() => buildComplianceMap(risks, identities), [risks, identities]);
  const complianceScore = useMemo(() => computeComplianceScore(identities, risks), [identities, risks]);
  const passCount = complianceMap.filter((r) => r.count === 0).length;
  const pieData = [
    { name: 'pass', value: Math.max(1, passCount), color: '#22c55e' },
    { name: 'partial', value: Math.max(1, Math.ceil(complianceMap.length * 0.35)), color: '#eab308' },
    { name: 'fail', value: Math.max(1, complianceMap.filter((r) => r.count > 50).length), color: '#E31937' },
  ];

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
        <StatCard label="NIST 800-53 Controls" value={5} icon={ShieldCheck} color="text-cyan-400" bg="from-cyan-500/10 to-blue-500/5" delay={0.05} />
        <StatCard label="Risk Events" value={risks.length} icon={AlertTriangle} color="text-red-400" bg="from-red-500/10 to-rose-500/5" delay={0.1} />
        <StatCard label="Compliance Score" value={complianceScore} suffix="%" icon={ShieldCheck} color="text-green-400" bg="from-green-500/10 to-emerald-500/5" delay={0.15} />
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <GlassCard hover={false} className="lg:col-span-2" delay={0.2}>
          <SectionHeader title="Framework Alignment Matrix" icon={FileText} />
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-[10px] text-slate-500 uppercase border-b border-white/5 tracking-wide font-medium">
                <th className="text-left pb-2.5 font-medium">Capability</th><th className="text-left pb-2.5 font-medium">NIST</th>
                <th className="text-left pb-2.5 font-medium">MITRE</th><th className="text-left pb-2.5 font-medium">GDPR</th>
                <th className="text-left pb-2.5 font-medium">CIS</th><th className="text-right pb-2.5 font-medium">Findings</th>
              </tr></thead>
              <tbody>{complianceMap.map((r, i) => (
                <motion.tr key={r.capability} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.25 + i * 0.04 }}
                  className="border-b border-white/[0.03] hover:bg-white/[0.02]">
                  <td className="py-2 text-white font-medium text-xs">{r.capability}</td>
                  <td className="py-2 text-cyan-400 font-mono text-[11px]">{r.nist}</td>
                  <td className="py-2 text-red-400 font-mono text-[11px]">{r.mitre}</td>
                  <td className="py-2 text-purple-400 text-[11px]">{r.gdpr}</td>
                  <td className="py-2 text-amber-400 font-mono text-[11px]">{r.cis}</td>
                  <td className="py-2 text-right"><FloatingCounter value={r.count} color="red" size="2xl" /></td>
                </motion.tr>
              ))}</tbody>
            </table>
          </div>
        </GlassCard>
        <GlassCard hover={false} delay={0.25}>
          <InteractivePieChart data={pieData} height={220} title="Control Status" />
        </GlassCard>
      </div>
    </div>
  );
}

function EvidencePage() {
  const { data } = usePlatformData();
  const risks = useMemo(() => getRiskEvents(), [data]);
  const evidence = useMemo(() => buildEvidencePack(risks), [risks]);
  return (
    <div className="space-y-3">
      <SectionHeader title="Audit Evidence Pack" icon={Eye} subtitle="Findings mapped to controls and detection sources" />
      {evidence.length === 0 && (
        <GlassCard><p className="text-sm text-slate-500">No pipeline evidence loaded.</p></GlassCard>
      )}
      {evidence.map((e, i) => (
        <motion.div key={e.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
          <GlassCard className="!p-3">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-white truncate">{e.finding}</p>
                <p className="text-[10px] text-slate-500 mt-1">{e.source} · {e.controls}</p>
              </div>
              <FloatingCounter value={e.count} color="red" size="2xl" />
            </div>
          </GlassCard>
        </motion.div>
      ))}
    </div>
  );
}

function ExportsPage() {
  const files = [
    { name: 'identities.csv', rows: 818, size: '169 KB' },
    { name: 'person_map.csv', rows: 818, size: '80 KB' },
    { name: 'groups.json', rows: 45, size: '64 KB' },
    { name: 'memberships.csv', rows: 2023, size: '197 KB' },
    { name: 'entitlements.csv', rows: 1582, size: '238 KB' },
    { name: 'audit_events.csv', rows: 800, size: '131 KB' },
    { name: 'offboarding.csv', rows: 183, size: '34 KB' },
    { name: 'ground_truth.csv', rows: 370, size: '15 KB' },
    { name: 'risk_report.html', rows: 10, size: '20 KB' },
  ];
  return (
    <div className="space-y-3">
      <SectionHeader title="Data Exports" icon={Download} subtitle="Export pipeline artifacts for external audit tools" />
      <div className="grid md:grid-cols-2 gap-2.5">
        {files.map((f, i) => (
          <motion.div key={f.name} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}>
            <GlassCard className="!p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-8 h-8 rounded-lg bg-red-500/10 border border-red-500/20 flex items-center justify-center shrink-0">
                    <Download size={14} className="text-red-400" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-white truncate">{f.name}</p>
                    <p className="text-[9px] text-slate-500 uppercase tracking-wide">{f.rows} rows · {f.size}</p>
                  </div>
                </div>
                <button type="button" className="px-2.5 py-1 rounded-lg bg-red-500/10 text-red-400 text-[10px] font-semibold uppercase tracking-wide border border-red-500/20 hover:bg-red-500/20 transition-all shrink-0">
                  Export
                </button>
              </div>
            </GlassCard>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

export default function AuditorDashboard() {
  const { user } = useAuth();
  const loc = useLocation();
  const showCompliance = loc.pathname === '/auditor' || loc.pathname === '/auditor/compliance';
  const tabs = [
    { to: '/auditor', label: 'Compliance', icon: ShieldCheck, end: true },
    { to: '/auditor/evidence', label: 'Evidence', icon: Eye },
    { to: '/auditor/exports', label: 'Exports', icon: Download },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        badge="Auditor Portal · IdentitySphere AI"
        title="Governance & Compliance Center"
        subtitle="Read-only compliance view — NIST, GDPR, CIS Controls"
      />

      <RoleWelcomeBar user={user} />

      <div className="flex gap-2 flex-wrap border-b border-white/5 pb-3">
        {tabs.map(t => (
          <NavLink key={t.to} to={t.to} end={t.end}
            className={({ isActive }) =>
              `flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium uppercase tracking-wide transition-all ${isActive ? 'bg-red-500/10 text-red-400 border border-red-500/20 shadow-sm shadow-red-500/10' : 'text-slate-400 hover:text-slate-300 hover:bg-white/5 border border-transparent'}`
            }>
            <t.icon size={14} />{t.label}
          </NavLink>
        ))}
      </div>

      {showCompliance ? <CompliancePage /> : <Outlet />}
    </div>
  );
}

export { CompliancePage, EvidencePage, ExportsPage };
