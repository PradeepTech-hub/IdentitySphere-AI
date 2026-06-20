import { motion } from 'framer-motion';
import { FileText, Download, Eye, ShieldCheck, AlertTriangle } from 'lucide-react';
import GlassCard from '../../components/shared/GlassCard';
import PageHeader from '../../components/shared/PageHeader';
import RoleWelcomeBar from '../../components/shared/RoleWelcomeBar';
import SectionHeader from '../../components/shared/SectionHeader';
import StatCard from '../../components/shared/StatCard';
import FloatingCounter from '../../components/shared/FloatingCounter';
import InteractivePieChart from '../../components/charts/InteractivePieChart';
import { COMPLIANCE_MAP } from '../../data/mockData';
import { getRiskEvents } from '../../services/storageService';
import { Outlet, NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

function CompliancePage() {
  const risks = getRiskEvents();
  const complianceScore = 78;
  const pieData = [
    { name: 'pass', value: 2, color: '#22c55e' },
    { name: 'partial', value: 3, color: '#eab308' },
    { name: 'fail', value: 4, color: '#E31937' },
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
              <thead><tr className="text-[10px] text-slate-500 uppercase border-b border-white/5 font-orbitron tracking-wider">
                <th className="text-left pb-2.5 font-medium">Capability</th><th className="text-left pb-2.5 font-medium">NIST</th>
                <th className="text-left pb-2.5 font-medium">MITRE</th><th className="text-left pb-2.5 font-medium">GDPR</th>
                <th className="text-left pb-2.5 font-medium">CIS</th><th className="text-right pb-2.5 font-medium">Findings</th>
              </tr></thead>
              <tbody>{COMPLIANCE_MAP.map((r, i) => (
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
  const evidence = [
    { id: 'EV-001', finding: 'Orphaned accounts detected', source: 'DetectionEngine', controls: 'AC-2, T1078', count: 60 },
    { id: 'EV-002', finding: 'Cross-platform admin exposure', source: 'PrivilegeCalculator', controls: 'AC-6, T1098', count: 119 },
    { id: 'EV-003', finding: 'MFA gaps across platforms', source: 'DetectionEngine', controls: 'IA-4, T1078', count: 155 },
    { id: 'EV-004', finding: 'Privilege escalation events', source: 'DetectionEngine + AuditEvents', controls: 'AC-2, T1098', count: 107 },
    { id: 'EV-005', finding: 'Stale tokens > 180 days', source: 'TokenAbuseDetector', controls: 'IA-4, T1550', count: 12 },
    { id: 'EV-006', finding: 'Offboarding gaps', source: 'OffboardingGapDetector', controls: 'AC-2', count: 32 },
  ];
  return (
    <div className="space-y-3">
      <SectionHeader title="Audit Evidence Pack" icon={Eye} subtitle="Findings mapped to controls and detection sources" />
      {evidence.map((e, i) => (
        <motion.div key={e.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
          <GlassCard className="!p-3">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-white font-orbitron tracking-wide truncate">{e.finding}</p>
                <p className="text-[10px] text-slate-500 font-orbitron mt-1">{e.source} · {e.controls}</p>
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
                    <p className="text-sm font-medium text-white font-orbitron tracking-wide truncate">{f.name}</p>
                    <p className="text-[9px] text-slate-500 font-orbitron uppercase tracking-wider">{f.rows} rows · {f.size}</p>
                  </div>
                </div>
                <button className="px-2.5 py-1 rounded-lg bg-red-500/10 text-red-400 text-[10px] font-orbitron uppercase tracking-wider border border-red-500/20 hover:bg-red-500/20 transition-all shrink-0">
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
              `flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-orbitron uppercase tracking-wider transition-all ${isActive ? 'bg-red-500/10 text-red-400 border border-red-500/20 shadow-sm shadow-red-500/10' : 'text-slate-400 hover:text-slate-300 hover:bg-white/5 border border-transparent'}`
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
