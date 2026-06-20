import { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft, Shield, Users, Key, AlertTriangle, CheckCircle,
  XCircle, Activity, FileText, Target, Wrench, Lock, Unlock,
  Eye, Layers, ChevronRight, Hash, Globe, UserCheck, UserX,
  ShieldAlert, ShieldCheck, Zap, Info, Clock, Server,
} from 'lucide-react';
import { ReactFlow, Background, Controls } from 'reactflow';
import 'reactflow/dist/style.css';
import GlassCard from '../../components/shared/GlassCard';
import SeverityBadge from '../../components/shared/SeverityBadge';
import PlatformIcon from '../../components/shared/PlatformIcon';
import AnimatedCounter from '../../components/shared/AnimatedCounter';
import { AreaChart, Area, XAxis, YAxis, Tooltip } from 'recharts';
import ChartContainer from '../../components/shared/ChartContainer';
import { getIdentities as getStoredIdentities, getRiskEvents, getLifecycleEvents, getReviewHistory } from '../../services/storageService';
import { getIdentityById, fetchScore, getRiskEventsAsync } from '../../services/dataService';

/* ── Platform colors for correlation graph ─────────────────────────── */
const PLATFORM_COLORS = {
  active_directory: { bg: '#080a12', border: '#00a4ef', color: '#00a4ef' },
  aws_iam:          { bg: '#080a12', border: '#ff9900', color: '#ff9900' },
  okta:             { bg: '#080a12', border: '#007dc1', color: '#007dc1' },
  salesforce:       { bg: '#080a12', border: '#00a1e0', color: '#00a1e0' },
};

const PLATFORM_LABELS = {
  active_directory: 'Active Directory',
  aws_iam: 'AWS IAM',
  okta: 'Okta',
  salesforce: 'Salesforce',
};

/* ── Tab definitions ───────────────────────────────────────────────── */
const TABS = [
  { key: 'overview',    label: 'Overview',     icon: Eye },
  { key: 'correlation', label: 'Correlation',  icon: Globe },
  { key: 'privileges',  label: 'Privileges',   icon: Key },
  { key: 'risk',        label: 'Risk Analysis', icon: AlertTriangle },
  { key: 'timeline',    label: 'Risk Timeline', icon: Clock },
  { key: 'remediation', label: 'Remediation',  icon: Wrench },
];

/* ── Severity color helpers ────────────────────────────────────────── */
function severityColor(severity) {
  switch (severity) {
    case 'critical': return '#ef4444';
    case 'high':     return '#f97316';
    case 'medium':   return '#eab308';
    case 'low':      return '#22c55e';
    default:         return '#94a3b8';
  }
}

function riskScoreColor(score) {
  if (score >= 80) return '#ef4444';
  if (score >= 60) return '#f97316';
  if (score >= 40) return '#eab308';
  return '#22c55e';
}

/* ── Status chip ───────────────────────────────────────────────────── */
function StatusChip({ status }) {
  const isActive = status?.toLowerCase() === 'active';
  return (
    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border backdrop-blur-sm ${
      isActive
        ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
        : 'bg-slate-500/15 text-slate-400 border-slate-500/30'
    }`}>
      {isActive ? <CheckCircle size={12} /> : <XCircle size={12} />}
      {status || 'Unknown'}
    </span>
  );
}

/* ── Mini stat card ────────────────────────────────────────────────── */
function MiniStatCard({ icon: Icon, label, value, color = '#E31937', delay = 0 }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay }}
      className="flex-1 min-w-[140px] rounded-xl p-4"
      style={{
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(227,25,55,0.15)',
        backdropFilter: 'blur(8px)',
      }}
    >
      <div className="flex items-center gap-2 mb-2">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: color + '18' }}>
          <Icon size={16} style={{ color }} />
        </div>
        <span className="text-xs text-slate-500 uppercase tracking-wider">{label}</span>
      </div>
      <div className="text-2xl font-bold text-white">
        <AnimatedCounter value={value || 0} />
      </div>
    </motion.div>
  );
}

/* ══════════════════════════════════════════════════════════════════════
   MAIN COMPONENT
   ══════════════════════════════════════════════════════════════════════ */
export default function IdentityDetail() {
  const { personId } = useParams();
  const navigate = useNavigate();

  const [identity, setIdentity] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('overview');

  useEffect(() => {
    let cancelled = false;
    async function loadIdentity() {
      setLoading(true);
      setError(null);
      try {
        const [detail, score, allRisks] = await Promise.all([
          getIdentityById(personId).catch(() => null),
          fetchScore(personId).catch(() => null),
          getRiskEventsAsync().catch(() => getRiskEvents()),
        ]);
        if (cancelled) return;

        const found = detail || getStoredIdentities().find((i) => i.person_id === personId) || null;
        if (!found) {
          setError('Identity not found');
          setIdentity(null);
          return;
        }

        if (score) {
          found.risk_score = score.final_score ?? found.risk_score;
          found.severity = score.severity ?? found.severity;
          found.score_breakdown = (score.factors || []).map((f) => ({
            factor: (f.name || '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
            value: Math.round((f.weighted_value ?? f.raw_value ?? 0) * 100) / 100,
            description: f.description || f.name,
          }));
          found.suppressions = score.suppressions || [];
        }

        const identityRisks = allRisks.filter((r) => r.identityId === found.person_id);
        const riskEvent = identityRisks.sort((a, b) => (b.score || 0) - (a.score || 0))[0];
        const platforms = found.platforms || [];
        const isAdmin = found.is_admin;

        if (!found.score_breakdown?.length) {
          const factors = riskEvent?.factors || {};
          if (Object.keys(factors).length > 0) {
            found.score_breakdown = Object.entries(factors).map(([k, v]) => ({
              factor: k.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
              value: Math.round(v * 100) / 100,
              description: k,
            }));
          }
        }

        if (!found.remediation_steps?.length) {
          const steps = [];
          identityRisks.forEach((r) => (r.remediation_steps || []).forEach((s) => steps.push(s)));
          if (riskEvent?.remediation_steps) steps.push(...riskEvent.remediation_steps);
          found.remediation_steps = [...new Set(steps)].slice(0, 8);
        }

        if (!found.compliance_refs?.length && riskEvent?.compliance_refs) {
          found.compliance_refs = riskEvent.compliance_refs;
        }

        found.identity_risks = identityRisks;
        setIdentity({ ...found });
      } catch {
        if (!cancelled) setError('Failed to load identity');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    loadIdentity();
    return () => { cancelled = true; };
  }, [personId]);

  /* ── Loading state ──────────────────────────────────────────────── */
  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, duration: 1.2, ease: 'linear' }}
          className="w-12 h-12 rounded-full border-2 border-red-500/30 border-t-red-500"
        />
      </div>
    );
  }

  /* ── Error state ────────────────────────────────────────────────── */
  if (error || !identity) {
    return (
      <div className="space-y-6">
        <button
          onClick={() => navigate('/admin/identities')}
          className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors"
        >
          <ArrowLeft size={18} /> Back to Identities
        </button>
        <GlassCard hover={false}>
          <div className="flex flex-col items-center gap-4 py-12">
            <AlertTriangle size={48} className="text-red-400" />
            <p className="text-lg text-slate-300">{error || 'Identity not found'}</p>
            <p className="text-sm text-slate-500">Person ID: {personId}</p>
          </div>
        </GlassCard>
      </div>
    );
  }

  const id = identity;

  /* ═══════════════════════════════════════════════════════════════════ */
  return (
    <div className="space-y-6 pb-12">
      {/* ── HEADER ──────────────────────────────────────────────────── */}
      <Header identity={id} navigate={navigate} />

      {/* ── TAB NAVIGATION ──────────────────────────────────────────── */}
      <div className="flex gap-1 p-1 rounded-xl overflow-x-auto" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(227,25,55,0.12)' }}>
        {TABS.map(tab => {
          const Icon = tab.icon;
          const active = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
                active
                  ? 'bg-red-500/20 text-red-400 border border-red-500/30 shadow-lg shadow-red-500/10'
                  : 'text-slate-400 hover:text-slate-300 hover:bg-white/5 border border-transparent'
              }`}
            >
              <Icon size={15} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* ── TAB CONTENT ─────────────────────────────────────────────── */}
      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.25 }}
        >
          {activeTab === 'overview'    && <OverviewTab identity={id} />}
          {activeTab === 'correlation' && <CorrelationTab identity={id} />}
          {activeTab === 'privileges'  && <PrivilegesTab identity={id} />}
          {activeTab === 'risk'        && <RiskAnalysisTab identity={id} />}
          {activeTab === 'timeline'    && <TimelineTab identity={id} />}
          {activeTab === 'remediation' && <RemediationTab identity={id} />}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════
   HEADER
   ══════════════════════════════════════════════════════════════════════ */
function Header({ identity: id, navigate }) {
  const scoreColor = riskScoreColor(id.risk_score ?? 0);

  return (
    <div className="space-y-4">
      {/* Back button */}
      <button
        onClick={() => navigate('/admin/identities')}
        className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors group"
      >
        <ArrowLeft size={18} className="group-hover:-translate-x-1 transition-transform" />
        <span className="text-sm">Back to Identity Inventory</span>
      </button>

      {/* Main header card */}
      <GlassCard hover={false} glow="red" delay={0.05}>
        <div className="flex flex-wrap items-start justify-between gap-6">
          {/* Left: Identity info */}
          <div className="flex items-start gap-5">
            {/* Avatar */}
            <div
              className="w-16 h-16 rounded-2xl flex items-center justify-center text-2xl font-bold shrink-0"
              style={{
                background: 'linear-gradient(135deg, rgba(227,25,55,0.25), rgba(227,25,55,0.08))',
                border: '2px solid rgba(227,25,55,0.35)',
                color: '#E31937',
              }}
            >
              {(id.display_name || '?')[0].toUpperCase()}
            </div>
            <div className="space-y-1.5">
              <h1 className="text-2xl font-bold text-white leading-tight">
                {id.display_name || 'Unknown Identity'}
              </h1>
              <div className="flex flex-wrap items-center gap-3 text-sm text-slate-400">
                <span className="flex items-center gap-1.5">
                  <Hash size={13} className="text-slate-500" />
                  {id.person_id}
                </span>
                {id.department && (
                  <span className="flex items-center gap-1.5">
                    <Users size={13} className="text-slate-500" />
                    {id.department}
                  </span>
                )}
                {id.title && (
                  <span className="flex items-center gap-1.5">
                    <FileText size={13} className="text-slate-500" />
                    {id.title}
                  </span>
                )}
              </div>
              {/* Platform icons */}
              <div className="flex gap-2 pt-1">
                {(id.platforms || []).map(p => (
                  <PlatformIcon key={p} platform={p} size="sm" />
                ))}
              </div>
            </div>
          </div>

          {/* Right: Risk + Status */}
          <div className="flex items-center gap-5">
            {/* Risk score ring */}
            <div className="relative flex items-center justify-center">
              <svg width="80" height="80" viewBox="0 0 80 80">
                <circle cx="40" cy="40" r="34" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="5" />
                <circle
                  cx="40" cy="40" r="34"
                  fill="none"
                  stroke={scoreColor}
                  strokeWidth="5"
                  strokeLinecap="round"
                  strokeDasharray={`${((id.risk_score ?? 0) / 100) * 213.6} 213.6`}
                  transform="rotate(-90 40 40)"
                  style={{ filter: `drop-shadow(0 0 6px ${scoreColor}66)` }}
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-xl font-bold" style={{ color: scoreColor }}>
                  {id.risk_score ?? 0}
                </span>
                <span className="text-[9px] text-slate-500 uppercase tracking-widest">Risk</span>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <SeverityBadge severity={id.severity || 'medium'} pulse />
              <StatusChip status={id.status} />
              {id.is_admin && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border bg-red-500/15 text-red-400 border-red-500/30">
                  <ShieldAlert size={12} /> Admin
                </span>
              )}
            </div>
          </div>
        </div>
      </GlassCard>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════
   TAB 1 : OVERVIEW
   ══════════════════════════════════════════════════════════════════════ */
function OverviewTab({ identity: id }) {
  return (
    <div className="space-y-6">
      {/* Profile + Quick flags */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Profile card */}
        <GlassCard hover={false} delay={0.05} className="lg:col-span-2">
          <h3 className="text-sm text-slate-500 uppercase tracking-wider mb-4 flex items-center gap-2">
            <UserCheck size={14} className="text-red-400" /> Identity Profile
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-y-5 gap-x-8">
            {[
              { label: 'Display Name', value: id.display_name },
              { label: 'Email', value: id.email },
              { label: 'Department', value: id.department },
              { label: 'Title', value: id.title },
              { label: 'Type', value: id.type },
              { label: 'Status', value: id.status },
            ].map(({ label, value }) => (
              <div key={label}>
                <span className="block text-[11px] text-slate-500 uppercase tracking-wider mb-1">{label}</span>
                <span className="text-sm text-white font-medium">{value || '--'}</span>
              </div>
            ))}
          </div>
        </GlassCard>

        {/* Security flags */}
        <GlassCard hover={false} delay={0.1}>
          <h3 className="text-sm text-slate-500 uppercase tracking-wider mb-4 flex items-center gap-2">
            <Shield size={14} className="text-red-400" /> Security Flags
          </h3>
          <div className="space-y-3">
            <FlagRow
              icon={id.is_admin ? ShieldAlert : ShieldCheck}
              label="Admin Privileges"
              value={id.is_admin ? 'Yes' : 'No'}
              bad={id.is_admin}
            />
            <FlagRow
              icon={id.mfa_complete ? Lock : Unlock}
              label="MFA Complete"
              value={id.mfa_complete ? 'Yes' : 'No'}
              bad={!id.mfa_complete}
            />
            <FlagRow
              icon={Clock}
              label="Max Dormancy"
              value={id.max_dormancy_days != null ? `${id.max_dormancy_days} days` : '--'}
              bad={id.max_dormancy_days > 90}
            />
            {id.anomaly_category && (
              <FlagRow
                icon={Zap}
                label="Anomaly"
                value={id.anomaly_category}
                bad
              />
            )}
          </div>
        </GlassCard>
      </div>

      {/* Stats row */}
      <div className="flex flex-wrap gap-4">
        <MiniStatCard icon={Server} label="Platforms" value={id.platform_count} color="#00a4ef" delay={0.05} />
        <MiniStatCard icon={Users} label="Groups" value={id.group_count} color="#a855f7" delay={0.1} />
        <MiniStatCard icon={Key} label="Roles" value={id.role_count} color="#f97316" delay={0.15} />
        <MiniStatCard icon={Layers} label="Entitlements" value={id.entitlement_count} color="#E31937" delay={0.2} />
      </div>

      {/* Relationships */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Good relationships */}
        <GlassCard hover={false} delay={0.15}>
          <h3 className="text-sm text-emerald-400 uppercase tracking-wider mb-4 flex items-center gap-2">
            <CheckCircle size={14} /> Good Relationships
          </h3>
          {(id.relationships_good && id.relationships_good.length > 0) ? (
            <div className="space-y-2">
              {id.relationships_good.map((rel, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: -12 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.05 * i }}
                  className="flex items-start gap-3 rounded-lg px-3 py-2.5"
                  style={{ background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.12)' }}
                >
                  <CheckCircle size={14} className="text-emerald-400 mt-0.5 shrink-0" />
                  <div>
                    <span className="text-sm font-medium text-emerald-300">{rel.label}</span>
                    <p className="text-xs text-slate-400 mt-0.5">{rel.detail}</p>
                  </div>
                </motion.div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-500 italic">No good relationships detected</p>
          )}
        </GlassCard>

        {/* Risky relationships */}
        <GlassCard hover={false} delay={0.2}>
          <h3 className="text-sm text-red-400 uppercase tracking-wider mb-4 flex items-center gap-2">
            <AlertTriangle size={14} /> Risky Relationships
          </h3>
          {(id.relationships_risky && id.relationships_risky.length > 0) ? (
            <div className="space-y-2">
              {id.relationships_risky.map((rel, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: 12 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.05 * i }}
                  className="flex items-start gap-3 rounded-lg px-3 py-2.5"
                  style={{
                    background: `${severityColor(rel.severity)}0A`,
                    border: `1px solid ${severityColor(rel.severity)}1F`,
                  }}
                >
                  <AlertTriangle size={14} className="mt-0.5 shrink-0" style={{ color: severityColor(rel.severity) }} />
                  <div className="flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium" style={{ color: severityColor(rel.severity) }}>{rel.label}</span>
                      {rel.severity && <SeverityBadge severity={rel.severity} />}
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5">{rel.detail}</p>
                  </div>
                </motion.div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-500 italic">No risky relationships detected</p>
          )}
        </GlassCard>
      </div>
    </div>
  );
}

function FlagRow({ icon: Icon, label, value, bad }) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <Icon size={14} className={bad ? 'text-red-400' : 'text-emerald-400'} />
        <span className="text-sm text-slate-400">{label}</span>
      </div>
      <span className={`text-sm font-semibold ${bad ? 'text-red-400' : 'text-emerald-400'}`}>{value}</span>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════
   TAB 2 : CORRELATION GRAPH
   ══════════════════════════════════════════════════════════════════════ */
function CorrelationTab({ identity: id }) {
  const { nodes, edges } = useMemo(() => buildCorrelationGraph(id), [id]);
  const accounts = useMemo(() => synthesizeAccounts(id), [id]);

  if (!id.platforms || id.platforms.length === 0) {
    return (
      <GlassCard hover={false}>
        <div className="flex flex-col items-center gap-4 py-16">
          <Globe size={48} className="text-slate-600" />
          <p className="text-lg text-slate-400 font-semibold">No Linked Accounts</p>
          <p className="text-sm text-slate-500 text-center max-w-md">
            {id.display_name} has no platform accounts linked. This identity may be newly provisioned or pending account creation.
          </p>
        </div>
      </GlassCard>
    );
  }

  return (
    <div className="space-y-4">
      <GlassCard hover={false} delay={0.05} className="p-0 overflow-hidden" style={{ height: 560 }}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          fitView
          fitViewOptions={{ padding: 0.25 }}
          panOnDrag
          zoomOnScroll
          minZoom={0.3}
          maxZoom={2}
          className="bg-navy-950"
          proOptions={{ hideAttribution: true }}
        >
          <Background color="#E3193708" gap={30} />
          <Controls className="bg-navy-800 border border-white/10 rounded-xl" />
        </ReactFlow>
      </GlassCard>

      {accounts.length > 0 && (
        <GlassCard hover={false} delay={0.1}>
          <h3 className="text-sm text-slate-500 uppercase tracking-wider mb-4 flex items-center gap-2">
            <Activity size={14} className="text-red-400" /> Correlated Accounts
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] text-slate-500 uppercase tracking-wider">
                  <th className="pb-3 pr-4">Platform</th>
                  <th className="pb-3 pr-4">Username</th>
                  <th className="pb-3 pr-4">Status</th>
                  <th className="pb-3 pr-4">Admin</th>
                  <th className="pb-3 pr-4">MFA</th>
                  <th className="pb-3">Dormancy</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {accounts.map((acct, i) => (
                  <motion.tr
                    key={acct.acct_id || i}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.03 * i }}
                    className="text-slate-300"
                  >
                    <td className="py-2.5 pr-4">
                      <div className="flex items-center gap-2">
                        <PlatformIcon platform={acct.platform} size="sm" />
                        <span className="text-xs text-slate-400">{PLATFORM_LABELS[acct.platform] || acct.platform}</span>
                      </div>
                    </td>
                    <td className="py-2.5 pr-4 font-mono text-xs">{acct.username}</td>
                    <td className="py-2.5 pr-4"><StatusChip status={acct.status} /></td>
                    <td className="py-2.5 pr-4">
                      {acct.is_admin
                        ? <span className="text-red-400 font-semibold text-xs">YES</span>
                        : <span className="text-slate-500 text-xs">No</span>}
                    </td>
                    <td className="py-2.5 pr-4">
                      {acct.mfa_enabled
                        ? <Lock size={14} className="text-emerald-400" />
                        : <Unlock size={14} className="text-red-400" />}
                    </td>
                    <td className="py-2.5">
                      <span className={`text-xs font-semibold ${
                        (acct.dormancy_days ?? 0) > 90 ? 'text-red-400' :
                        (acct.dormancy_days ?? 0) > 30 ? 'text-yellow-400' : 'text-slate-400'
                      }`}>
                        {acct.dormancy_days != null ? `${acct.dormancy_days}d` : '--'}
                      </span>
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        </GlassCard>
      )}
    </div>
  );
}

const PLATFORM_ROLES = {
  active_directory: { admin: 'Domain Admin', standard: 'Domain User', group: 'Server-Admins' },
  aws_iam: { admin: 'AdministratorAccess', standard: 'ReadOnlyAccess', group: 'AWS-Users' },
  okta: { admin: 'Org Admin', standard: 'SSO User', group: 'Privileged Users' },
  salesforce: { admin: 'System Administrator', standard: 'Standard User', group: 'CRM-Users' },
};

function generateUsername(displayName, platform) {
  const parts = displayName.toLowerCase().split(/\s+/);
  if (parts.length < 2) return parts[0] || 'user';
  switch (platform) {
    case 'active_directory': return `${parts[0]}.${parts[parts.length - 1]}`;
    case 'aws_iam': return `${parts[0][0]}${parts[parts.length - 1]}`;
    case 'okta': return `${parts[0]}.${parts[parts.length - 1]}`;
    case 'salesforce': return `${parts[0]}-${parts[parts.length - 1][0]}`;
    case 'salesforce': return `${parts[0]}.${parts[parts.length - 1][0]}`;
    default: return `${parts[0]}.${parts[parts.length - 1]}`;
  }
}

function synthesizeAccounts(id) {
  const platforms = id.platforms || [];
  return platforms.map(platform => ({
    acct_id: `${id.person_id}-${platform}`,
    platform,
    username: generateUsername(id.display_name || id.person_id, platform),
    status: id.status || 'Active',
    is_admin: id.is_admin && ['active_directory', 'aws_iam', 'okta'].includes(platform),
    mfa_enabled: id.mfa_complete !== false,
    dormancy_days: id.max_dormancy_days || 0,
  }));
}

function buildCorrelationGraph(id) {
  const nodes = [];
  const edges = [];
  const platforms = id.platforms || [];

  if (platforms.length === 0) return { nodes, edges };

  nodes.push({
    id: 'person',
    position: { x: 400, y: 30 },
    data: { label: `👤 ${id.display_name || id.person_id}` },
    style: {
      background: 'linear-gradient(135deg, #1a0008, #080a12)',
      color: '#E31937',
      border: '2px solid #E31937',
      borderRadius: '16px',
      padding: '14px 24px',
      fontSize: 14,
      fontWeight: 700,
      width: 220,
      textAlign: 'center',
      boxShadow: '0 0 24px rgba(227,25,55,0.25), 0 0 48px rgba(227,25,55,0.08)',
    },
    draggable: true,
  });

  const totalWidth = Math.max(platforms.length * 260, 500);
  const startX = 400 - totalWidth / 2 + 130;

  platforms.forEach((platform, pIdx) => {
    const px = startX + pIdx * 260;
    const pColors = PLATFORM_COLORS[platform] || { bg: '#080a12', border: '#64748b', color: '#64748b' };
    const roleInfo = PLATFORM_ROLES[platform] || { admin: 'Admin', standard: 'User', group: 'Users' };
    const username = generateUsername(id.display_name || 'user', platform);
    const isAdminOnPlatform = id.is_admin && ['active_directory', 'aws_iam', 'okta', 'salesforce'].includes(platform);
    const isDormant = (id.max_dormancy_days || 0) > 90;

    const platformNodeId = `platform-${platform}`;
    nodes.push({
      id: platformNodeId,
      position: { x: px, y: 160 },
      data: { label: `🖥️ ${PLATFORM_LABELS[platform] || platform}` },
      style: {
        background: pColors.bg, color: pColors.color,
        border: `2px solid ${pColors.border}`, borderRadius: '12px',
        padding: '10px 18px', fontSize: 12, fontWeight: 600,
        width: 170, textAlign: 'center',
        boxShadow: `0 0 12px ${pColors.border}22`,
      },
      draggable: true,
    });
    edges.push({
      id: `e-person-${platform}`, source: 'person', target: platformNodeId,
      animated: true, label: 'has_account',
      style: { stroke: pColors.border, strokeWidth: 2 },
      labelStyle: { fontSize: 9, fill: '#64748b' },
    });

    const acctColor = isAdminOnPlatform ? '#ef4444' : isDormant ? '#eab308' : pColors.color;
    const acctBorder = isAdminOnPlatform ? '#ef4444' : isDormant ? '#eab308' : pColors.border;
    const acctNodeId = `acct-${platform}`;
    nodes.push({
      id: acctNodeId,
      position: { x: px, y: 290 },
      data: { label: `${isAdminOnPlatform ? '🔑 ' : isDormant ? '💤 ' : ''}${username}` },
      style: {
        background: pColors.bg, color: acctColor,
        border: `1.5px solid ${acctBorder}`, borderRadius: '8px',
        padding: '8px 14px', fontSize: 11, fontWeight: 500,
        width: 150, textAlign: 'center',
      },
      draggable: true,
    });
    edges.push({
      id: `e-${platformNodeId}-${acctNodeId}`, source: platformNodeId, target: acctNodeId,
      style: { stroke: pColors.border + '88', strokeWidth: 1.5 },
    });

    const roleNodeId = `role-${platform}`;
    const roleName = isAdminOnPlatform ? roleInfo.admin : roleInfo.standard;
    nodes.push({
      id: roleNodeId,
      position: { x: px - 70, y: 410 },
      data: { label: `🛡️ ${roleName}` },
      style: {
        background: isAdminOnPlatform ? 'rgba(239,68,68,0.08)' : 'rgba(255,255,255,0.03)',
        color: isAdminOnPlatform ? '#ef4444' : '#94a3b8',
        border: `1px solid ${isAdminOnPlatform ? 'rgba(239,68,68,0.3)' : 'rgba(255,255,255,0.1)'}`,
        borderRadius: '8px', padding: '6px 12px', fontSize: 10,
        fontWeight: 500, width: 140, textAlign: 'center',
      },
      draggable: true,
    });
    edges.push({
      id: `e-${acctNodeId}-${roleNodeId}`, source: acctNodeId, target: roleNodeId,
      label: 'has_role', style: { stroke: '#64748b88', strokeWidth: 1 },
      labelStyle: { fontSize: 8, fill: '#475569' },
    });

    const groupNodeId = `group-${platform}`;
    nodes.push({
      id: groupNodeId,
      position: { x: px + 70, y: 410 },
      data: { label: `👥 ${roleInfo.group}` },
      style: {
        background: 'rgba(255,255,255,0.03)', color: '#94a3b8',
        border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px',
        padding: '6px 12px', fontSize: 10, fontWeight: 500,
        width: 140, textAlign: 'center',
      },
      draggable: true,
    });
    edges.push({
      id: `e-${acctNodeId}-${groupNodeId}`, source: acctNodeId, target: groupNodeId,
      label: 'member_of', style: { stroke: '#64748b88', strokeWidth: 1 },
      labelStyle: { fontSize: 8, fill: '#475569' },
    });
  });

  return { nodes, edges };
}

/* ══════════════════════════════════════════════════════════════════════
   TAB 3 : PRIVILEGES (Effective Privilege Calculator)
   ══════════════════════════════════════════════════════════════════════ */

const PRIV_RESOURCE_MAP = {
  active_directory: ['domain-controller', 'dns-server', 'file-server', 'gpo-management'],
  aws_iam: ['iam-console', 'ec2-instances', 's3-prod-data', 'kms-keys'],
  okta: ['sso-config', 'api-tokens', 'mfa-policies', 'user-provisioning'],
  salesforce: ['crm-data', 'user-management', 'reports', 'apex-classes'],
};

const PRIV_PERMISSION_MAP = {
  active_directory: { admin: ['full-control', 'gpo-edit', 'user-mgmt', 'dns-admin'], user: ['read', 'logon'] },
  aws_iam: { admin: ['iam:*', 'ec2:*', 's3:*', 'kms:*'], user: ['s3:GetObject', 'ec2:Describe*'] },
  okta: { admin: ['admin:api-tokens', 'admin:users', 'admin:apps', 'admin:mfa'], user: ['sso:login'] },
  salesforce: { admin: ['setup:all', 'user:manage', 'apex:execute', 'api:full'], user: ['report:view', 'record:read'] },
};

const HIGH_RISK_ROLES = ['Domain Admin', 'AdministratorAccess', 'Org Admin', 'System Administrator', 'Owner'];

function buildPrivilegeGraph(id) {
  const nodes = [];
  const edges = [];
  const platforms = id.platforms || [];
  if (platforms.length === 0) return { nodes, edges };

  nodes.push({
    id: 'identity', position: { x: 400, y: 20 },
    data: { label: `👤 ${id.display_name}` },
    style: { background: 'linear-gradient(135deg, #1a0008, #080a12)', color: '#E31937', border: '2px solid #E31937', borderRadius: '16px', padding: '12px 22px', fontSize: 13, fontWeight: 700, width: 200, textAlign: 'center', boxShadow: '0 0 20px rgba(227,25,55,0.2)' },
    draggable: true,
  });

  const totalW = Math.max(platforms.length * 280, 500);
  const startX = 400 - totalW / 2 + 140;

  platforms.forEach((p, pIdx) => {
    const px = startX + pIdx * 280;
    const pColors = PLATFORM_COLORS[p] || { bg: '#080a12', border: '#64748b', color: '#64748b' };
    const roleInfo = PLATFORM_ROLES[p] || { admin: 'Admin', standard: 'User', group: 'Users' };
    const isAdm = id.is_admin && ['active_directory', 'aws_iam', 'okta', 'salesforce'].includes(p);
    const roleName = isAdm ? roleInfo.admin : roleInfo.standard;
    const isHighRisk = HIGH_RISK_ROLES.includes(roleName);
    const perms = isAdm ? (PRIV_PERMISSION_MAP[p]?.admin || ['admin:*']) : (PRIV_PERMISSION_MAP[p]?.user || ['read']);
    const resources = isAdm ? (PRIV_RESOURCE_MAP[p] || ['resource']) : (PRIV_RESOURCE_MAP[p] || ['resource']).slice(0, 2);
    const username = generateUsername(id.display_name || 'user', p);

    const pId = `p-${p}`;
    nodes.push({ id: pId, position: { x: px, y: 120 }, data: { label: `🖥️ ${PLATFORM_LABELS[p] || p}` }, style: { background: pColors.bg, color: pColors.color, border: `2px solid ${pColors.border}`, borderRadius: '10px', padding: '8px 16px', fontSize: 11, fontWeight: 600, width: 160, textAlign: 'center' }, draggable: true });
    edges.push({ id: `e-id-${p}`, source: 'identity', target: pId, animated: true, style: { stroke: pColors.border, strokeWidth: 2 }, labelStyle: { fontSize: 8, fill: '#64748b' } });

    const aId = `a-${p}`;
    nodes.push({ id: aId, position: { x: px, y: 210 }, data: { label: `${isAdm ? '🔑 ' : ''}${username}` }, style: { background: pColors.bg, color: isAdm ? '#ef4444' : pColors.color, border: `1.5px solid ${isAdm ? '#ef4444' : pColors.border}`, borderRadius: '8px', padding: '6px 12px', fontSize: 10, width: 140, textAlign: 'center' }, draggable: true });
    edges.push({ id: `e-${pId}-${aId}`, source: pId, target: aId, label: 'account', style: { stroke: pColors.border + '88', strokeWidth: 1.5 }, labelStyle: { fontSize: 7, fill: '#475569' } });

    const gId = `g-${p}`;
    nodes.push({ id: gId, position: { x: px - 60, y: 300 }, data: { label: `👥 ${roleInfo.group}` }, style: { background: 'rgba(255,255,255,0.03)', color: '#94a3b8', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', padding: '5px 10px', fontSize: 9, width: 120, textAlign: 'center' }, draggable: true });
    edges.push({ id: `e-${aId}-${gId}`, source: aId, target: gId, label: 'member_of', style: { stroke: '#64748b55', strokeWidth: 1 }, labelStyle: { fontSize: 7, fill: '#475569' } });

    const rId = `r-${p}`;
    nodes.push({ id: rId, position: { x: px + 60, y: 300 }, data: { label: `🛡️ ${roleName}` }, style: { background: isHighRisk ? 'rgba(239,68,68,0.1)' : 'rgba(255,255,255,0.03)', color: isHighRisk ? '#ef4444' : '#94a3b8', border: `1.5px solid ${isHighRisk ? 'rgba(239,68,68,0.4)' : 'rgba(255,255,255,0.08)'}`, borderRadius: '8px', padding: '5px 10px', fontSize: 9, fontWeight: isHighRisk ? 700 : 500, width: 130, textAlign: 'center', boxShadow: isHighRisk ? '0 0 12px rgba(239,68,68,0.15)' : 'none' }, draggable: true });
    edges.push({ id: `e-${aId}-${rId}`, source: aId, target: rId, label: 'has_role', style: { stroke: isHighRisk ? '#ef444488' : '#64748b55', strokeWidth: isHighRisk ? 2 : 1 }, labelStyle: { fontSize: 7, fill: '#475569' } });

    const permId = `perm-${p}`;
    nodes.push({ id: permId, position: { x: px, y: 400 }, data: { label: `🔐 ${perms[0]}` }, style: { background: isAdm ? 'rgba(249,115,22,0.06)' : 'rgba(255,255,255,0.02)', color: isAdm ? '#f97316' : '#64748b', border: `1px solid ${isAdm ? 'rgba(249,115,22,0.2)' : 'rgba(255,255,255,0.06)'}`, borderRadius: '6px', padding: '4px 10px', fontSize: 9, width: 130, textAlign: 'center' }, draggable: true });
    edges.push({ id: `e-${rId}-${permId}`, source: rId, target: permId, label: 'grants', style: { stroke: isAdm ? '#f9731644' : '#64748b33', strokeWidth: 1 }, labelStyle: { fontSize: 7, fill: '#475569' } });

    const resId = `res-${p}`;
    nodes.push({ id: resId, position: { x: px, y: 490 }, data: { label: `📦 ${resources[0]}` }, style: { background: isAdm ? 'rgba(239,68,68,0.06)' : 'rgba(255,255,255,0.02)', color: isAdm ? '#ef4444' : '#64748b', border: `1px solid ${isAdm ? 'rgba(239,68,68,0.15)' : 'rgba(255,255,255,0.05)'}`, borderRadius: '6px', padding: '4px 10px', fontSize: 9, width: 130, textAlign: 'center' }, draggable: true });
    edges.push({ id: `e-${permId}-${resId}`, source: permId, target: resId, label: 'accesses', style: { stroke: isAdm ? '#ef444433' : '#64748b22', strokeWidth: 1 }, labelStyle: { fontSize: 7, fill: '#475569' } });
  });

  return { nodes, edges };
}

function PrivilegesTab({ identity: id }) {
  const entitlements = id.entitlements || [];
  const platforms = id.platforms || [];

  const grouped = {};
  entitlements.forEach(ent => {
    const p = ent.platform || 'unknown';
    if (!grouped[p]) grouped[p] = [];
    grouped[p].push(ent);
  });

  const { nodes: privNodes, edges: privEdges } = useMemo(() => buildPrivilegeGraph(id), [id]);

  const directPrivs = entitlements.filter(e => e.privilege_level === 'high' || e.is_admin_role);
  const inheritedPrivs = entitlements.filter(e => !e.is_admin_role && e.privilege_level !== 'high');
  const effectivePrivs = entitlements;
  const totalResources = platforms.reduce((a, p) => {
    const res = PRIV_RESOURCE_MAP[p] || [];
    return a + (id.is_admin ? res.length : Math.min(res.length, 2));
  }, 0);

  return (
    <div className="space-y-6">
      {/* Top stats */}
      <div className="flex flex-wrap gap-4">
        <MiniStatCard icon={ShieldAlert} label="Admin Entitlements" value={id.admin_entitlement_count || directPrivs.length} color="#ef4444" delay={0.05} />
        <MiniStatCard icon={AlertTriangle} label="Sensitive Permissions" value={id.sensitive_permission_count || directPrivs.length} color="#f97316" delay={0.1} />
        <MiniStatCard icon={Key} label="Total Entitlements" value={id.entitlement_count || effectivePrivs.length} color="#E31937" delay={0.15} />
      </div>

      {/* Privilege Type Summary */}
      <div className="grid grid-cols-3 gap-4">
        <GlassCard hover={false} delay={0.05} className="border-red-500/20">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-2.5 h-2.5 rounded-full bg-red-400" />
            <span className="text-xs text-slate-400 uppercase tracking-wider">Direct Privileges</span>
          </div>
          <p className="text-2xl font-black text-red-400">{directPrivs.length}</p>
          <p className="text-[10px] text-slate-500 mt-1">Explicitly assigned admin/high-privilege roles</p>
        </GlassCard>
        <GlassCard hover={false} delay={0.1} className="border-blue-500/20">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-2.5 h-2.5 rounded-full bg-blue-400" />
            <span className="text-xs text-slate-400 uppercase tracking-wider">Inherited Privileges</span>
          </div>
          <p className="text-2xl font-black text-blue-400">{inheritedPrivs.length}</p>
          <p className="text-[10px] text-slate-500 mt-1">Inherited via group membership and role hierarchy</p>
        </GlassCard>
        <GlassCard hover={false} delay={0.15} className="border-purple-500/20">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-2.5 h-2.5 rounded-full bg-purple-400" />
            <span className="text-xs text-slate-400 uppercase tracking-wider">Effective Privileges</span>
          </div>
          <p className="text-2xl font-black text-purple-400">{effectivePrivs.length}</p>
          <p className="text-[10px] text-slate-500 mt-1">{totalResources} reachable resources across {platforms.length} platform(s)</p>
        </GlassCard>
      </div>

      {/* Privilege Relationship Graph */}
      {privNodes.length > 0 && (
        <GlassCard hover={false} delay={0.2} className="p-0 overflow-hidden" style={{ height: 580 }}>
          <div className="px-5 pt-4 pb-2 flex items-center justify-between">
            <h3 className="text-sm text-slate-500 uppercase tracking-wider flex items-center gap-2">
              <Layers size={14} className="text-red-400" /> Privilege Relationship Graph
            </h3>
            <div className="flex gap-3 text-[9px]">
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-400" /> Direct / Admin</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-400" /> Inherited</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-purple-400" /> Resource</span>
            </div>
          </div>
          <div style={{ height: 530 }}>
            <ReactFlow
              nodes={privNodes}
              edges={privEdges}
              fitView
              fitViewOptions={{ padding: 0.2 }}
              panOnDrag
              zoomOnScroll
              minZoom={0.3}
              maxZoom={2}
              className="bg-navy-950"
              proOptions={{ hideAttribution: true }}
            >
              <Background color="#E3193706" gap={30} />
              <Controls className="bg-navy-800 border border-white/10 rounded-xl" />
            </ReactFlow>
          </div>
        </GlassCard>
      )}

      {/* Entitlement groups */}
      {Object.keys(grouped).length > 0 ? (
        Object.entries(grouped).map(([platform, ents], gIdx) => {
          const isAdmP = id.is_admin && ['active_directory', 'aws_iam', 'okta', 'salesforce'].includes(platform);
          const perms = isAdmP ? (PRIV_PERMISSION_MAP[platform]?.admin || []) : (PRIV_PERMISSION_MAP[platform]?.user || []);
          const resources = isAdmP ? (PRIV_RESOURCE_MAP[platform] || []) : (PRIV_RESOURCE_MAP[platform] || []).slice(0, 2);
          return (
            <GlassCard key={platform} hover={false} delay={0.05 + gIdx * 0.05}>
              <div className="flex items-center gap-3 mb-4">
                <PlatformIcon platform={platform} size="lg" />
                <h3 className="text-sm font-semibold text-white uppercase tracking-wider">
                  {PLATFORM_LABELS[platform] || platform}
                </h3>
                <span className="text-xs text-slate-500">({ents.length} entitlement{ents.length !== 1 ? 's' : ''})</span>
              </div>

              <div className="space-y-3">
                {ents.map((ent, eIdx) => (
                  <motion.div key={eIdx} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.02 * eIdx }}
                    className="rounded-lg px-4 py-3"
                    style={{ background: ent.is_admin_role ? 'rgba(239,68,68,0.06)' : 'rgba(255,255,255,0.02)', border: `1px solid ${ent.is_admin_role ? 'rgba(239,68,68,0.18)' : 'rgba(255,255,255,0.06)'}` }}>
                    <div className="flex items-center flex-wrap gap-2 mb-2">
                      <span className="text-sm font-semibold text-white">{ent.role_name || 'Direct Permission'}</span>
                      {ent.is_admin_role && <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-500/20 text-red-400 border border-red-500/30 font-semibold uppercase">Admin</span>}
                      {ent.is_sensitive && <span className="text-[10px] px-2 py-0.5 rounded-full bg-orange-500/20 text-orange-400 border border-orange-500/30 font-semibold uppercase">Sensitive</span>}
                      {ent.privilege_level && <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-500/15 text-slate-400 border border-slate-500/20 font-medium">{ent.privilege_level}</span>}
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-400 border border-purple-500/20 font-medium">{ent.is_admin_role ? 'Direct' : 'Inherited'}</span>
                    </div>
                    <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-slate-400">
                      {ent.permission_id && <span className="flex items-center gap-1"><Hash size={10} className="text-slate-500" /> {ent.permission_id}</span>}
                      {ent.resource && <span className="flex items-center gap-1"><Target size={10} className="text-slate-500" /> {ent.resource}</span>}
                      {ent.action && <span className="flex items-center gap-1"><Zap size={10} className="text-slate-500" /> {ent.action}</span>}
                    </div>
                  </motion.div>
                ))}
              </div>

              {/* Reachable resources for this platform */}
              <div className="mt-4 pt-3 border-t border-white/5">
                <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-2">Reachable Resources ({resources.length})</p>
                <div className="flex flex-wrap gap-1.5">
                  {resources.map(r => (
                    <span key={r} className={`text-[10px] px-2 py-1 rounded font-mono ${isAdmP ? 'bg-red-500/10 text-red-400 border border-red-500/15' : 'bg-white/5 text-slate-400 border border-white/5'}`}>{r}</span>
                  ))}
                </div>
                {perms.length > 0 && (
                  <div className="mt-2">
                    <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1.5">Permissions ({perms.length})</p>
                    <div className="flex flex-wrap gap-1.5">
                      {perms.map(pm => (
                        <span key={pm} className={`text-[10px] px-2 py-0.5 rounded font-mono ${isAdmP ? 'bg-orange-500/10 text-orange-400 border border-orange-500/15' : 'bg-white/5 text-slate-500 border border-white/5'}`}>{pm}</span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </GlassCard>
          );
        })
      ) : (
        <GlassCard hover={false} delay={0.1}>
          <div className="flex flex-col items-center gap-3 py-8">
            <Key size={36} className="text-slate-600" />
            <p className="text-sm text-slate-500">No detailed entitlement data available</p>
          </div>
        </GlassCard>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════
   TAB 4 : RISK ANALYSIS
   ══════════════════════════════════════════════════════════════════════ */
function RiskAnalysisTab({ identity: id }) {
  const scoreBreakdown = id.score_breakdown || [];
  const totalScore = id.risk_score ?? 0;
  const maxFactor = Math.max(...scoreBreakdown.map(f => f.value), 1);

  return (
    <div className="space-y-6">
      {/* Score summary */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Score breakdown */}
        <GlassCard hover={false} delay={0.05} className="lg:col-span-2">
          <h3 className="text-sm text-slate-500 uppercase tracking-wider mb-5 flex items-center gap-2">
            <Activity size={14} className="text-red-400" /> Explainable Risk Score
          </h3>

          {scoreBreakdown.length > 0 ? (
            <div className="space-y-4">
              {scoreBreakdown.map((factor, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: -16 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.06 * i }}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-sm text-slate-300 font-medium">{factor.factor}</span>
                    <span className="text-sm font-bold" style={{ color: riskScoreColor(factor.value * (100 / maxFactor)) }}>
                      +{factor.value}
                    </span>
                  </div>
                  {factor.description && (
                    <p className="text-xs text-slate-500 mb-1.5">{factor.description}</p>
                  )}
                  {/* Bar */}
                  <div className="w-full h-2 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
                    <motion.div
                      className="h-full rounded-full"
                      initial={{ width: 0 }}
                      animate={{ width: `${(factor.value / maxFactor) * 100}%` }}
                      transition={{ duration: 0.8, delay: 0.1 * i, ease: 'easeOut' }}
                      style={{
                        background: `linear-gradient(90deg, ${riskScoreColor(factor.value * (100 / maxFactor))}, ${riskScoreColor(factor.value * (100 / maxFactor))}88)`,
                        boxShadow: `0 0 8px ${riskScoreColor(factor.value * (100 / maxFactor))}44`,
                      }}
                    />
                  </div>
                </motion.div>
              ))}

              {/* Total */}
              <div
                className="flex items-center justify-between pt-4 mt-4"
                style={{ borderTop: '1px solid rgba(227,25,55,0.18)' }}
              >
                <span className="text-sm font-semibold text-white uppercase tracking-wider">Total Risk Score</span>
                <span className="text-2xl font-bold" style={{ color: riskScoreColor(totalScore) }}>
                  {totalScore}
                </span>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3 py-8">
              <Info size={32} className="text-slate-600" />
              <p className="text-sm text-slate-500">No score breakdown data available</p>
            </div>
          )}
        </GlassCard>

        {/* Right column: severity + compliance */}
        <div className="space-y-6">
          {/* Severity */}
          <GlassCard hover={false} delay={0.1}>
            <h3 className="text-sm text-slate-500 uppercase tracking-wider mb-4 flex items-center gap-2">
              <Shield size={14} className="text-red-400" /> Severity Assessment
            </h3>
            <div className="flex flex-col items-center gap-3 py-4">
              <div className="relative">
                <svg width="100" height="100" viewBox="0 0 100 100">
                  <circle cx="50" cy="50" r="42" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="6" />
                  <circle
                    cx="50" cy="50" r="42"
                    fill="none"
                    stroke={severityColor(id.severity)}
                    strokeWidth="6"
                    strokeLinecap="round"
                    strokeDasharray={`${(totalScore / 100) * 263.9} 263.9`}
                    transform="rotate(-90 50 50)"
                    style={{ filter: `drop-shadow(0 0 8px ${severityColor(id.severity)}66)` }}
                  />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <SeverityBadge severity={id.severity || 'medium'} pulse />
                </div>
              </div>
              <p className="text-xs text-slate-500 text-center mt-1">
                Score of {totalScore}/100 maps to {(id.severity || 'medium').toUpperCase()} severity
              </p>
            </div>
          </GlassCard>

          {/* Compliance references */}
          <GlassCard hover={false} delay={0.15}>
            <h3 className="text-sm text-slate-500 uppercase tracking-wider mb-4 flex items-center gap-2">
              <FileText size={14} className="text-red-400" /> Compliance References
            </h3>
            {(id.compliance_refs && id.compliance_refs.length > 0) ? (
              <div className="space-y-2">
                {id.compliance_refs.map((ref, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.05 * i }}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg"
                    style={{ background: 'rgba(227,25,55,0.06)', border: '1px solid rgba(227,25,55,0.12)' }}
                  >
                    <ChevronRight size={12} className="text-red-400 shrink-0" />
                    <span className="text-sm text-slate-300 font-medium">{ref}</span>
                  </motion.div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-500 italic">No compliance references</p>
            )}
          </GlassCard>
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════
   TAB 5 : RISK TIMELINE
   ══════════════════════════════════════════════════════════════════════ */

const EVENT_COLORS = { positive: '#22c55e', warning: '#eab308', danger: '#ef4444' };
const PLAT_LABELS = { active_directory: 'AD', aws_iam: 'AWS', okta: 'Okta', salesforce: 'SF' };

function generateTimelineEvents(id) {
  const events = [];
  const platforms = id.platforms || [];
  const name = id.display_name;
  const pid = id.person_id;
  const baseDate = new Date('2026-01-15');

  platforms.forEach((p, i) => {
    const d = new Date(baseDate); d.setDate(d.getDate() + i * 2);
    events.push({ date: d.toISOString(), type: 'Account Created', desc: `Account provisioned on ${PLAT_LABELS[p] || p}`, platform: p, impact: 5, category: 'warning', icon: UserCheck });
  });

  if (id.is_admin) {
    platforms.forEach((p, i) => {
      if (['active_directory', 'aws_iam', 'okta', 'salesforce'].includes(p)) {
        const d = new Date(baseDate); d.setDate(d.getDate() + 10 + i * 3);
        events.push({ date: d.toISOString(), type: 'Admin Privilege Granted', desc: `Admin role assigned on ${PLAT_LABELS[p]}`, platform: p, impact: 15, category: 'danger', icon: ShieldAlert });
      }
    });
  }

  if (id.mfa_complete) {
    const d = new Date(baseDate); d.setDate(d.getDate() + 20);
    events.push({ date: d.toISOString(), type: 'MFA Enabled', desc: 'Multi-factor authentication enabled on all accounts', platform: null, impact: -10, category: 'positive', icon: Lock });
  } else {
    const d = new Date(baseDate); d.setDate(d.getDate() + 45);
    events.push({ date: d.toISOString(), type: 'MFA Not Enrolled', desc: 'MFA enrollment deadline passed without activation', platform: null, impact: 10, category: 'danger', icon: Unlock });
  }

  if (platforms.length >= 3) {
    const d = new Date(baseDate); d.setDate(d.getDate() + 60);
    events.push({ date: d.toISOString(), type: 'Cross-Platform Detected', desc: `Identity active on ${platforms.length} platforms — cross-platform exposure flagged`, platform: null, impact: 8, category: 'warning', icon: Globe });
  }

  if ((id.max_dormancy_days || 0) > 90) {
    const d = new Date(baseDate); d.setDate(d.getDate() + 90);
    events.push({ date: d.toISOString(), type: 'Dormant Account Detected', desc: `No login activity for ${id.max_dormancy_days} days`, platform: null, impact: 12, category: 'danger', icon: Clock });
  }

  const lifecycle = getLifecycleEvents().filter(e => e.identity === name);
  lifecycle.forEach(e => {
    events.push({
      date: e.date + 'T10:00:00', type: e.type === 'joiner' ? 'Joiner Event' : e.type === 'mover' ? 'Mover Event' : 'Leaver Event',
      desc: `${e.type === 'joiner' ? 'Identity onboarded' : e.type === 'mover' ? `Transferred ${e.department}→${e.newDepartment}` : 'Identity offboarded'} — ${e.status}`,
      platform: e.platforms?.[0] || null, impact: e.type === 'leaver' ? -20 : e.type === 'joiner' ? 5 : 0,
      category: e.type === 'leaver' ? 'positive' : e.type === 'joiner' ? 'warning' : 'warning', icon: e.type === 'joiner' ? UserCheck : e.type === 'leaver' ? UserX : Activity,
    });
  });

  const risks = getRiskEvents().filter(r => r.identityId === pid);
  risks.forEach(r => {
    const d = new Date('2026-06-15');
    events.push({ date: d.toISOString(), type: 'Risk Finding', desc: r.title, platform: r.platforms?.[0] || null, impact: Math.round(r.score * 0.3), category: 'danger', icon: AlertTriangle });
  });

  const reviews = getReviewHistory().filter(h => h.identity === name);
  reviews.forEach(h => {
    events.push({
      date: h.timestamp, type: h.action === 'approved' ? 'Access Approved' : h.action === 'revoked' ? 'Privilege Revoked' : 'Access Escalated',
      desc: `${h.role} on ${PLAT_LABELS[h.platform] || h.platform} — ${h.action} by ${h.reviewer}`,
      platform: h.platform, impact: h.action === 'revoked' ? -(h.riskBefore - h.riskAfter || 5) : 0,
      category: h.action === 'revoked' ? 'positive' : h.action === 'escalated' ? 'warning' : 'positive', icon: h.action === 'revoked' ? XCircle : CheckCircle,
    });
  });

  if (id.status === 'Orphaned') {
    events.push({ date: new Date('2026-06-16').toISOString(), type: 'Orphaned Account', desc: 'Identity terminated but platform accounts remain active — compliance violation', platform: null, impact: 20, category: 'danger', icon: AlertTriangle });
  }

  const d2 = new Date('2026-06-01');
  events.push({ date: d2.toISOString(), type: 'Access Review Due', desc: 'Q2 2026 privileged access review campaign initiated', platform: null, impact: 0, category: 'warning', icon: Eye });

  return events.sort((a, b) => new Date(a.date) - new Date(b.date));
}

function buildRiskEvolution(events, baseScore) {
  let score = 0;
  const points = [{ date: 'Start', score: 0 }];
  events.forEach(e => {
    score = Math.max(0, Math.min(100, score + e.impact));
    points.push({ date: new Date(e.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }), score, event: e.type });
  });
  if (Math.abs(points[points.length - 1].score - baseScore) > 5) {
    points.push({ date: 'Current', score: baseScore });
  }
  return points;
}

function TimelineTab({ identity: id }) {
  const events = useMemo(() => generateTimelineEvents(id), [id]);
  const evolutionData = useMemo(() => buildRiskEvolution(events, id.risk_score || 0), [events, id.risk_score]);

  return (
    <div className="space-y-6">
      {/* Risk Evolution Chart */}
      <GlassCard hover={false} delay={0.05}>
        <h3 className="text-sm text-slate-500 uppercase tracking-wider mb-4 flex items-center gap-2">
          <Activity size={14} className="text-red-400" /> Risk Score Evolution
        </h3>
        <ChartContainer height={220}>
          <AreaChart data={evolutionData}>
            <defs>
              <linearGradient id="riskEvoGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#ef4444" stopOpacity={0.3} />
                <stop offset="100%" stopColor="#ef4444" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis dataKey="date" tick={{ fontSize: 9, fill: '#64748b' }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
            <YAxis domain={[0, 100]} tick={{ fontSize: 9, fill: '#64748b' }} axisLine={false} tickLine={false} width={30} />
            <Tooltip contentStyle={{ background: '#0a0f1f', border: '1px solid rgba(227,25,55,0.3)', borderRadius: 12, fontSize: 12, color: '#f1f5f9' }} />
            <Area type="monotone" dataKey="score" stroke="#ef4444" fill="url(#riskEvoGrad)" strokeWidth={2} dot={{ r: 3, fill: '#ef4444', strokeWidth: 0 }} />
          </AreaChart>
        </ChartContainer>
        <div className="flex items-center justify-between mt-2">
          <span className="text-[10px] text-slate-500">Risk score progression from account creation to present</span>
          <span className="text-xs font-mono font-bold" style={{ color: riskScoreColor(id.risk_score || 0) }}>Current: {id.risk_score || 0}/100</span>
        </div>
      </GlassCard>

      {/* Event Summary */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Positive Events', count: events.filter(e => e.category === 'positive').length, color: '#22c55e', bg: 'rgba(34,197,94,0.06)', border: 'rgba(34,197,94,0.15)' },
          { label: 'Warnings', count: events.filter(e => e.category === 'warning').length, color: '#eab308', bg: 'rgba(234,179,8,0.06)', border: 'rgba(234,179,8,0.15)' },
          { label: 'High Risk Events', count: events.filter(e => e.category === 'danger').length, color: '#ef4444', bg: 'rgba(239,68,68,0.06)', border: 'rgba(239,68,68,0.15)' },
        ].map((s, i) => (
          <GlassCard key={s.label} hover={false} delay={0.1 + i * 0.05}>
            <div className="flex items-center gap-3">
              <div className="w-3 h-3 rounded-full" style={{ background: s.color }} />
              <div>
                <p className="text-xl font-bold" style={{ color: s.color }}>{s.count}</p>
                <p className="text-[10px] text-slate-500 uppercase">{s.label}</p>
              </div>
            </div>
          </GlassCard>
        ))}
      </div>

      {/* Visual Timeline */}
      <GlassCard hover={false} delay={0.2}>
        <h3 className="text-sm text-slate-500 uppercase tracking-wider mb-5 flex items-center gap-2">
          <Clock size={14} className="text-red-400" /> Identity Risk Timeline
        </h3>
        <div className="relative">
          <div className="absolute left-5 top-0 bottom-0 w-px" style={{ background: 'rgba(227,25,55,0.15)' }} />
          <div className="space-y-1">
            {events.map((evt, i) => {
              const Icon = evt.icon;
              const dotColor = EVENT_COLORS[evt.category];
              return (
                <motion.div key={i} initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.25 + i * 0.04 }}
                  className="flex items-start gap-4 pl-0 relative">
                  <div className="relative z-10 w-10 flex justify-center shrink-0">
                    <div className="w-3 h-3 rounded-full mt-1.5" style={{ background: dotColor, boxShadow: `0 0 8px ${dotColor}66` }} />
                  </div>
                  <div className="flex-1 pb-4">
                    <div className="rounded-lg px-4 py-3" style={{ background: `${dotColor}08`, border: `1px solid ${dotColor}20` }}>
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <Icon size={13} style={{ color: dotColor }} />
                          <span className="text-sm font-semibold text-white">{evt.type}</span>
                          {evt.platform && <PlatformIcon platform={evt.platform} size="sm" />}
                        </div>
                        <div className="flex items-center gap-2">
                          {evt.impact !== 0 && (
                            <span className={`text-[10px] px-2 py-0.5 rounded font-mono font-bold ${evt.impact > 0 ? 'bg-red-500/10 text-red-400' : 'bg-green-500/10 text-green-400'}`}>
                              {evt.impact > 0 ? '+' : ''}{evt.impact} pts
                            </span>
                          )}
                          <span className="text-[10px] text-slate-500">{new Date(evt.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
                        </div>
                      </div>
                      <p className="text-xs text-slate-400">{evt.desc}</p>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
      </GlassCard>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════
   TAB 6 : REMEDIATION
   ══════════════════════════════════════════════════════════════════════ */
function RemediationTab({ identity: id }) {
  const steps = id.remediation_steps || [];

  return (
    <div className="space-y-6">
      <GlassCard hover={false} delay={0.05}>
        <h3 className="text-sm text-slate-500 uppercase tracking-wider mb-5 flex items-center gap-2">
          <Wrench size={14} className="text-red-400" /> Remediation Action Plan
        </h3>

        {steps.length > 0 ? (
          <div className="space-y-4">
            {steps.map((step, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.08 * i }}
                className="flex items-start gap-4 rounded-xl p-4"
                style={{
                  background: 'rgba(255,255,255,0.02)',
                  border: '1px solid rgba(227,25,55,0.12)',
                }}
              >
                {/* Step number badge */}
                <div
                  className="w-9 h-9 rounded-lg flex items-center justify-center text-sm font-bold shrink-0"
                  style={{
                    background: 'linear-gradient(135deg, rgba(227,25,55,0.2), rgba(227,25,55,0.08))',
                    border: '1px solid rgba(227,25,55,0.3)',
                    color: '#E31937',
                  }}
                >
                  {i + 1}
                </div>

                <div className="flex-1">
                  <p className="text-sm text-slate-200 leading-relaxed">{step}</p>
                </div>

                {/* Action indicator */}
                <div className="shrink-0">
                  <div
                    className="w-6 h-6 rounded-full flex items-center justify-center"
                    style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
                  >
                    <Target size={12} className="text-slate-500" />
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center gap-4 py-12">
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.5 }}
            >
              <CheckCircle size={48} className="text-emerald-400" />
            </motion.div>
            <p className="text-lg text-emerald-400 font-semibold">No remediation actions required</p>
            <p className="text-sm text-slate-500">This identity meets current security standards</p>
          </div>
        )}
      </GlassCard>

      {/* Compliance context (if available, also show here) */}
      {id.compliance_refs && id.compliance_refs.length > 0 && (
        <GlassCard hover={false} delay={0.15}>
          <h3 className="text-sm text-slate-500 uppercase tracking-wider mb-4 flex items-center gap-2">
            <FileText size={14} className="text-red-400" /> Related Compliance Frameworks
          </h3>
          <div className="flex flex-wrap gap-2">
            {id.compliance_refs.map((ref, i) => (
              <motion.span
                key={i}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.04 * i }}
                className="px-3 py-1.5 rounded-lg text-xs font-medium text-slate-300"
                style={{ background: 'rgba(227,25,55,0.08)', border: '1px solid rgba(227,25,55,0.15)' }}
              >
                {ref}
              </motion.span>
            ))}
          </div>
        </GlassCard>
      )}
    </div>
  );
}
