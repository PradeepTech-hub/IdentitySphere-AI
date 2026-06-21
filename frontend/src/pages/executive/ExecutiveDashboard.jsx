import { useMemo, useEffect, useCallback, useState } from 'react';
import { motion } from 'framer-motion';
import {
  TrendingDown, ShieldCheck, AlertTriangle, Activity, Users, Target, Shield,
  Download, TrendingUp, Leaf, FileText, Lock, Scale, UserCheck, ArrowRight,
  CheckCircle, FileDown,
} from 'lucide-react';
import GlassCard from '../../components/shared/GlassCard';
import FloatingCounter from '../../components/shared/FloatingCounter';
import PageHeader from '../../components/shared/PageHeader';
import RoleWelcomeBar from '../../components/shared/RoleWelcomeBar';
import SectionHeader from '../../components/shared/SectionHeader';
import StatCard from '../../components/shared/StatCard';
import InteractiveAreaChart from '../../components/charts/InteractiveAreaChart';
import InteractivePieChart from '../../components/charts/InteractivePieChart';
import InteractiveBarChart from '../../components/charts/InteractiveBarChart';
import SustainabilityGauge from '../../components/charts/SustainabilityGauge';
import SustainabilityDetailsModal, { SUSTAINABILITY_DETAILS } from '../../components/executive/SustainabilityDetailsModal';
import { buildBusinessImpactReport, downloadReportJson, downloadReportPdf } from '../../utils/exportBusinessImpactReport';
import { getIdentities, getRiskEvents, getIncidents } from '../../services/storageService';
import { usePlatformData } from '../../context/PlatformDataContext';
import {
  buildRiskCategoryChart, buildDepartmentImpact, computeComplianceScore,
  buildFrameworkScores, buildRecentAlerts, buildComplianceTrend,
} from '../../utils/liveMetrics';
import { useAuth } from '../../context/AuthContext';

const PIE_COLORS = { critical: '#E31937', high: '#f97316', medium: '#eab308', low: '#22c55e' };

const RISK_TREND_6MO = [
  { month: 'Jan', score: 58 }, { month: 'Feb', score: 62 }, { month: 'Mar', score: 65 },
  { month: 'Apr', score: 68 }, { month: 'May', score: 70 }, { month: 'Jun', score: 72 },
];

const SEV_STYLE = {
  High: 'bg-red-500/15 text-red-400 border-red-500/25',
  Medium: 'bg-orange-500/15 text-orange-400 border-orange-500/25',
  Low: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/25',
};

function scrollToSection(id) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

export default function ExecutiveDashboard() {
  const { user } = useAuth();
  const { data: platformData } = usePlatformData();
  const [showSustainabilityDetails, setShowSustainabilityDetails] = useState(false);
  const identities = useMemo(() => getIdentities(), [platformData]);
  const risks = useMemo(() => getRiskEvents(), [platformData]);
  const incidents = useMemo(() => getIncidents(), [platformData]);

  const businessUnitImpact = useMemo(() => buildDepartmentImpact(identities), [identities]);
  const topRiskCategories = useMemo(() => buildRiskCategoryChart(risks), [risks]);
  const recentAlerts = useMemo(() => buildRecentAlerts(risks, incidents), [risks, incidents]);
  const frameworkScores = useMemo(() => buildFrameworkScores(identities, risks), [identities, risks]);
  const complianceOverview = useMemo(() => [
    { label: 'NIST Compliance', value: frameworkScores.nist, sublabel: frameworkScores.nist >= 80 ? 'Compliant' : 'Review', color: 'text-green-400', bg: 'from-green-500/10 to-emerald-500/5' },
    { label: 'ISO 27001', value: frameworkScores.iso, sublabel: frameworkScores.iso >= 80 ? 'Compliant' : 'Review', color: 'text-cyan-400', bg: 'from-cyan-500/10 to-blue-500/5' },
    { label: 'GDPR Compliance', value: frameworkScores.gdpr, sublabel: frameworkScores.gdpr >= 80 ? 'Compliant' : 'Review', color: 'text-purple-400', bg: 'from-purple-500/10 to-violet-500/5' },
    { label: 'Overall Compliance', value: frameworkScores.overall, sublabel: frameworkScores.overall >= 80 ? 'Compliant' : 'Review', color: 'text-green-400', bg: 'from-green-500/10 to-emerald-500/5' },
  ], [frameworkScores]);

  useEffect(() => {
    const hash = window.location.hash.slice(1);
    if (hash) setTimeout(() => scrollToSection(hash), 300);
  }, []);

  const total = identities.length;
  const criticalRisks = risks.filter(r => r.severity === 'critical').length;
  const highRisks = risks.filter(r => r.severity === 'high').length;
  const adminUsers = identities.filter(i => i.is_admin);
  const crossPlatformAdmins = adminUsers.filter(i => (i.platforms?.length || 0) >= 2).length;
  const mfaGaps = identities.filter(i => !i.mfa_complete && i.status === 'Active').length;
  const orphaned = identities.filter(i => i.status === 'Orphaned').length;
  const dormant = identities.filter(i => i.status === 'Dormant' || (i.max_dormancy_days || 0) > 90).length;
  const activeIncidents = incidents.filter(i => i.status !== 'resolved').length;
  const platforms = new Set(identities.flatMap(i => i.platforms || [])).size;
  const avgScore = total > 0 ? Math.round(identities.reduce((a, i) => a + (i.risk_score || 0), 0) / total) : 0;
  const businessRisk = Math.min(100, Math.round(avgScore + criticalRisks * 3 + crossPlatformAdmins * 2));
  const overallRisk = businessRisk;
  const execCriticalRisks = criticalRisks + highRisks;
  const affectedUsers = identities.filter((i) => (i.risk_score || 0) >= 45).length;
  const sustainabilityScore = computeComplianceScore(identities, risks);
  const complianceTrend = useMemo(() => buildComplianceTrend(sustainabilityScore), [sustainabilityScore]);
  const trendData = useMemo(() => Array.from({ length: 30 }, (_, i) => ({
    day: `D${i + 1}`,
    critical: Math.max(0, Math.round(criticalRisks * (0.7 + Math.sin(i / 4) * 0.15))),
    resolved: Math.max(0, Math.round(incidents.filter((x) => x.status === 'resolved').length * (i / 30))),
  })), [criticalRisks, incidents]);

  const sevDist = { critical: criticalRisks, high: highRisks, medium: risks.filter(r => r.severity === 'medium').length, low: risks.filter(r => r.severity === 'low').length };
  const pieData = Object.entries(sevDist).filter(([, v]) => v > 0).map(([name, value]) => ({ name, value, color: PIE_COLORS[name] }));

  const EXEC_CARDS = [
    { label: 'Business Risk', value: businessRisk, color: 'text-red-400', icon: Target, bg: 'from-red-500/10 to-rose-500/5' },
    { label: 'Critical Risks', value: criticalRisks, color: 'text-red-400', icon: AlertTriangle, bg: 'from-red-500/10 to-orange-500/5' },
    { label: 'Compliance', value: sustainabilityScore, color: 'text-green-400', icon: ShieldCheck, suffix: '%', bg: 'from-green-500/10 to-emerald-500/5' },
    { label: 'Active Incidents', value: activeIncidents, color: 'text-orange-400', icon: Activity, bg: 'from-orange-500/10 to-amber-500/5' },
    { label: 'Identities', value: total, color: 'text-blue-400', icon: Users, bg: 'from-blue-500/10 to-cyan-500/5' },
    { label: 'Platforms', value: platforms, color: 'text-amber-400', icon: Shield, bg: 'from-amber-500/10 to-yellow-500/5' },
  ];

  const EXPOSURES = [
    { label: 'Cross-Platform Admins', count: crossPlatformAdmins, severity: 'critical' },
    { label: 'Orphaned Accounts', count: orphaned, severity: 'critical' },
    { label: 'MFA Gaps', count: mfaGaps, severity: 'high' },
    { label: 'Dormant Accounts', count: dormant, severity: 'medium' },
  ].filter(e => e.count > 0);

  const buildReport = useCallback(() => buildBusinessImpactReport({
    user,
    overallRisk,
    criticalRisks: execCriticalRisks,
    affectedUsers,
    sustainabilityScore,
    businessUnitImpact,
    topRiskCategories,
    complianceOverview: complianceOverview.map(c => ({ framework: c.label, score: c.value })),
    recentAlerts,
  }), [user, overallRisk, execCriticalRisks, affectedUsers, sustainabilityScore]);

  const exportReportJson = useCallback(() => downloadReportJson(buildReport()), [buildReport]);
  const exportReportPdf = useCallback(() => downloadReportPdf(buildReport()), [buildReport]);

  return (
    <div className="space-y-5">
      <SustainabilityDetailsModal
        open={showSustainabilityDetails}
        onClose={() => setShowSustainabilityDetails(false)}
        score={sustainabilityScore}
      />
      <PageHeader
        badge="Executive View · IdentitySphere AI"
        title="Executive Risk & Impact Dashboard"
        subtitle="High-level visibility into identity risk and organizational impact. No technical controls."
      />

      <RoleWelcomeBar user={user} />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
        <StatCard label="Overall Identity Risk" value={overallRisk} icon={Target} color="text-red-400" bg="from-red-500/10 to-rose-500/5" sublabel="High Risk" trend={{ text: '↑ 8 pts vs last month', color: 'text-red-400' }} delay={0.02} />
        <StatCard label="Critical Risks" value={execCriticalRisks} icon={AlertTriangle} color="text-red-400" bg="from-red-500/10 to-orange-500/5" sublabel="Active" trend={{ text: '↓ 5 vs last month', color: 'text-green-400' }} delay={0.04} />
        <StatCard label="Affected Users" value={affectedUsers} icon={Users} color="text-blue-400" bg="from-blue-500/10 to-cyan-500/5" sublabel="Across Organization" trend={{ text: '↑ 120 vs last month', color: 'text-green-400' }} delay={0.06} />
        <StatCard label="Business Impact" displayValue="High" icon={Activity} color="text-red-400" bg="from-red-500/10 to-rose-500/5" sublabel="Potential Impact" trend={{ text: 'Revenue & Operations', color: 'text-slate-500' }} delay={0.08} />
      </div>

      <GlassCard hover={false} glow="red" delay={0.02}>
        <div className="flex items-center gap-5 flex-wrap">
          <div className="relative shrink-0">
            <svg width="88" height="88" viewBox="0 0 90 90">
              <circle cx="45" cy="45" r="38" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="6" />
              <circle cx="45" cy="45" r="38" fill="none" stroke={businessRisk >= 60 ? '#E31937' : businessRisk >= 40 ? '#f97316' : '#22c55e'} strokeWidth="6" strokeLinecap="round"
                strokeDasharray={`${(businessRisk / 100) * 238.8} 238.8`} transform="rotate(-90 45 45)"
                style={{ filter: `drop-shadow(0 0 12px ${businessRisk >= 60 ? 'rgba(227,25,55,0.6)' : 'rgba(249,115,22,0.5)'})` }} />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <FloatingCounter value={businessRisk} color={businessRisk >= 60 ? 'red' : 'orange'} size="2xl" />
              <span className="text-[8px] text-slate-500 uppercase tracking-widest font-orbitron">RISK</span>
            </div>
          </div>
          <div className="flex-1 min-w-[200px]">
            <h2 className="text-base font-bold text-white mb-1 font-orbitron tracking-wide">
              Business Risk: <span className={businessRisk >= 60 ? 'text-red-400' : 'text-orange-400'}>{businessRisk >= 60 ? 'ELEVATED' : 'MODERATE'}</span>
            </h2>
            <p className="text-sm text-slate-400 font-orbitron tracking-wide page-subtitle">
              {criticalRisks} critical findings · {platforms} platforms · {crossPlatformAdmins} cross-platform admins
            </p>
          </div>
        </div>
      </GlassCard>

      <div className="grid lg:grid-cols-3 gap-4 min-w-0">
        <GlassCard hover={false} delay={0.12} className="lg:col-span-2 min-w-0" id="risk-trends">
          <InteractiveAreaChart
            title="Risk Trends (Last 6 Months)"
            data={RISK_TREND_6MO}
            xKey="month"
            height={260}
            showLegend={false}
            series={[{ key: 'score', color: '#E31937', name: 'Risk Score' }]}
          />
        </GlassCard>
        <GlassCard hover={false} delay={0.14} id="sustainability">
          <SectionHeader title="Sustainability Index" icon={Leaf} />
          <SustainabilityGauge
            score={sustainabilityScore}
            statusLabel="Sustainable"
            onClick={() => setShowSustainabilityDetails(true)}
          />
          <div className="mt-3 space-y-2 border-t border-white/5 pt-3">
            {SUSTAINABILITY_DETAILS.indicators.slice(0, 3).map((ind) => (
              <div key={ind.label} className="flex justify-between text-[10px] text-slate-500 py-1 border-b border-white/[0.04] last:border-0">
                <span>{ind.label}</span>
                <span className={`font-orbitron ${ind.status === 'ok' ? 'text-green-400' : 'text-orange-400'}`}>{ind.value}</span>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setShowSustainabilityDetails(true)}
            className="mt-2 text-[10px] text-red-400 font-orbitron hover:text-red-300 transition-colors flex items-center gap-1 ml-auto"
          >
            View Details <ArrowRight size={10} />
          </button>
        </GlassCard>
      </div>

      <div className="grid lg:grid-cols-3 gap-4 min-w-0">
        <GlassCard hover={false} delay={0.16} id="business-impact" className="min-w-0">
          <InteractivePieChart data={businessUnitImpact} height={240} title="Business Impact by Business Unit" />
          <button type="button" onClick={exportReportPdf} className="mt-2 text-[10px] text-red-400 font-orbitron hover:text-red-300 transition-colors flex items-center gap-1">
            View Business Impact Report <ArrowRight size={10} />
          </button>
        </GlassCard>
        <GlassCard hover={false} delay={0.18}>
          <InteractiveBarChart
            data={topRiskCategories}
            labelKey="label"
            dataKey="value"
            layout="vertical"
            height={260}
            title="Top Risk Categories"
          />
          <button type="button" onClick={() => scrollToSection('risk-trends')} className="mt-2 text-[10px] text-red-400 font-orbitron hover:text-red-300 transition-colors flex items-center gap-1">
            View Risk Trends <ArrowRight size={10} />
          </button>
        </GlassCard>
        <div className="space-y-4">
          <GlassCard hover={false} delay={0.2} id="reports">
            <SectionHeader title="Executive Reports" icon={FileText} />
            <div className="space-y-2">
              <button
                type="button"
                onClick={exportReportPdf}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-xs font-orbitron font-bold uppercase tracking-wider text-white bg-gradient-to-r from-red-600 to-red-700 border border-red-500/30 hover:from-red-500 hover:to-red-600 transition-all"
              >
                <FileDown size={14} />
                Download PDF Report
              </button>
              <button
                type="button"
                onClick={exportReportJson}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-[10px] font-orbitron font-bold uppercase tracking-wider text-slate-400 bg-white/5 border border-white/10 hover:bg-white/10 hover:text-white transition-all"
              >
                <Download size={12} />
                Download JSON
              </button>
            </div>
          </GlassCard>
          <GlassCard hover={false} delay={0.22}>
            <SectionHeader title="What's Driving Risk?" icon={TrendingDown} />
            <p className="text-sm text-slate-400 leading-relaxed">
              The primary risk drivers are <strong className="text-white font-orbitron">excessive privileges</strong> and{' '}
              <strong className="text-white font-orbitron">inactive accounts</strong>. Addressing these will significantly improve our risk posture.
            </p>
            <button type="button" onClick={() => scrollToSection('risk-trends')} className="mt-3 text-[10px] text-red-400 font-orbitron hover:text-red-300 transition-colors flex items-center gap-1">
              View Insights <ArrowRight size={10} />
            </button>
          </GlassCard>
        </div>
      </div>

      <div id="compliance">
        <SectionHeader title="Compliance Overview" icon={ShieldCheck} subtitle="High-level framework alignment — read-only view" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 mt-3">
          {complianceOverview.map((c, i) => (
            <StatCard key={c.label} label={c.label} value={c.value} suffix="%" icon={CheckCircle} color={c.color} bg={c.bg} sublabel={c.sublabel} delay={0.24 + i * 0.03} />
          ))}
        </div>
      </div>

      <GlassCard hover={false} delay={0.28} id="alerts">
        <SectionHeader title="Recent Alerts (Summary Only)" icon={AlertTriangle} />
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[10px] text-slate-500 uppercase border-b border-white/5 font-orbitron tracking-wider">
                <th className="text-left pb-2.5 font-medium">Alert Type</th>
                <th className="text-left pb-2.5 font-medium">Severity</th>
                <th className="text-left pb-2.5 font-medium">Business Impact</th>
                <th className="text-left pb-2.5 font-medium">Status</th>
                <th className="text-left pb-2.5 font-medium">Detected On</th>
              </tr>
            </thead>
            <tbody>
              {recentAlerts.map((a, i) => (
                <motion.tr key={a.type} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 + i * 0.05 }}
                  className="border-b border-white/[0.03] hover:bg-white/[0.02]">
                  <td className="py-2.5 text-white text-xs font-medium">{a.type}</td>
                  <td className="py-2.5">
                    <span className={`text-[10px] font-orbitron px-2 py-0.5 rounded-full border ${SEV_STYLE[a.severity]}`}>{a.severity}</span>
                  </td>
                  <td className="py-2.5 text-slate-400 text-xs">{a.impact}</td>
                  <td className="py-2.5">
                    <span className="text-[10px] font-orbitron px-2 py-0.5 rounded-full border bg-red-500/10 text-red-400 border-red-500/20">{a.status}</span>
                  </td>
                  <td className="py-2.5 text-slate-500 text-[11px] font-mono">{a.detected}</td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>
        <button type="button" onClick={() => scrollToSection('alerts')} className="mt-3 text-[10px] text-red-400 font-orbitron hover:text-red-300 transition-colors flex items-center gap-1">
          View All Alerts <ArrowRight size={10} />
        </button>
      </GlassCard>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2.5">
        {EXEC_CARDS.map((c, i) => (
          <StatCard key={c.label} label={c.label} value={c.value} icon={c.icon} color={c.color} suffix={c.suffix} bg={c.bg} delay={i * 0.04} />
        ))}
      </div>

      <div className="grid lg:grid-cols-3 gap-4 min-w-0">
        <GlassCard hover={false} delay={0.2} className="lg:col-span-2 min-w-0">
          <InteractiveAreaChart
            title="Identity Risk Trend (30 Days)"
            data={trendData}
            height={260}
            series={[
              { key: 'critical', color: '#E31937', name: 'critical' },
              { key: 'resolved', color: '#22c55e', name: 'resolved' },
            ]}
          />
        </GlassCard>
        <GlassCard hover={false} delay={0.25} className="min-w-0">
          <InteractivePieChart data={pieData} height={220} title="Severity Breakdown" />
        </GlassCard>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        {EXPOSURES.length > 0 && (
          <GlassCard hover={false} delay={0.3}>
            <SectionHeader title="Critical Exposure Summary" icon={AlertTriangle} />
            <div className="space-y-2">
              {EXPOSURES.map((exp, i) => (
                <motion.div key={exp.label} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.35 + i * 0.05 }}
                  className="flex items-center justify-between py-2 px-3 rounded-lg"
                  style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(227,25,55,0.12)' }}>
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className={`w-2 h-2 rounded-full shrink-0 ${exp.severity === 'critical' ? 'bg-red-400' : exp.severity === 'high' ? 'bg-orange-400' : 'bg-yellow-400'}`} />
                    <span className="text-sm text-white font-orbitron tracking-wide truncate">{exp.label}</span>
                  </div>
                  <span className="text-xl font-black font-orbitron text-red-400" style={{ textShadow: '0 0 16px rgba(227,25,55,0.4)' }}>{exp.count}</span>
                </motion.div>
              ))}
            </div>
          </GlassCard>
        )}

        <GlassCard hover={false} delay={0.35}>
          <InteractiveAreaChart
            title="Compliance Trend (12 Months)"
            data={complianceTrend}
            xKey="month"
            height={240}
            showLegend={false}
            series={[{ key: 'score', color: '#22c55e', name: 'compliance score' }]}
          />
        </GlassCard>
      </div>

      <GlassCard hover={false} delay={0.4}>
        <SectionHeader title="Executive AI Summary" icon={TrendingDown} />
        <div className="text-sm text-slate-400 leading-relaxed space-y-2.5">
          <p>Enterprise identity security posture shows <strong className="text-white font-orbitron">{criticalRisks} critical</strong> and <strong className="text-white font-orbitron">{highRisks} high-severity</strong> risks. Business Risk Score: <strong className={`font-orbitron ${businessRisk >= 60 ? 'text-red-400' : 'text-orange-400'}`}>{businessRisk}/100</strong>.</p>
          <p>Monitoring <strong className="text-white font-orbitron">{total}</strong> identities across <strong className="text-white font-orbitron">{platforms}</strong> platforms. <strong className="text-red-400 font-orbitron">{crossPlatformAdmins}</strong> cross-platform admins and <strong className="text-yellow-400 font-orbitron">{mfaGaps}</strong> MFA gaps require attention.</p>
        </div>
      </GlassCard>

      <div>
        <SectionHeader title="Documentation" icon={FileText} subtitle="Security, compliance, and role alignment for executive access" />
        <div className="grid md:grid-cols-3 gap-4 mt-3">
          <GlassCard hover={false} delay={0.42}>
            <div className="flex items-center gap-2 mb-3">
              <Lock size={14} className="text-red-400" />
              <h3 className="text-sm font-bold text-white font-orbitron tracking-wide">Security</h3>
            </div>
            <ul className="text-[11px] text-slate-400 space-y-2 leading-relaxed">
              <li>MFA enforced for all executive sessions</li>
              <li>Read-only dashboard access — no write operations</li>
              <li>15-minute session timeout on inactivity</li>
              <li>All actions logged (timestamp, IP, device)</li>
              <li>Encryption: HTTPS/TLS 1.3, AES-256 at rest</li>
            </ul>
          </GlassCard>
          <GlassCard hover={false} delay={0.44}>
            <div className="flex items-center gap-2 mb-3">
              <Scale size={14} className="text-cyan-400" />
              <h3 className="text-sm font-bold text-white font-orbitron tracking-wide">Compliance</h3>
            </div>
            <ul className="text-[11px] text-slate-400 space-y-2 leading-relaxed">
              <li>GDPR Article 32 — Security of processing</li>
              <li>NIST AC-6 — Least privilege principle</li>
              <li>ISO/IEC 27001 Annex A.12 — Operations security</li>
            </ul>
          </GlassCard>
          <GlassCard hover={false} delay={0.46}>
            <div className="flex items-center gap-2 mb-3">
              <UserCheck size={14} className="text-purple-400" />
              <h3 className="text-sm font-bold text-white font-orbitron tracking-wide">Role Alignment</h3>
            </div>
            <ul className="text-[11px] text-slate-400 space-y-2 leading-relaxed">
              <li>Executives restricted to visibility-only access</li>
              <li>No user, role, or policy management capabilities</li>
              <li>Separation of duties — strategic view without operational control</li>
              <li>Supports informed decision-making at board level</li>
            </ul>
          </GlassCard>
        </div>
      </div>
    </div>
  );
}
