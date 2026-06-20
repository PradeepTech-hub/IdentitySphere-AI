import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Target, Search, Shield, AlertTriangle, Key, Users, Server,
  Zap, Activity, ChevronRight, Eye,
} from 'lucide-react';
import GlassCard from '../../components/shared/GlassCard';
import PageHeader from '../../components/shared/PageHeader';
import FloatingCounter from '../../components/shared/FloatingCounter';
import SeverityBadge from '../../components/shared/SeverityBadge';
import PlatformIcon from '../../components/shared/PlatformIcon';
import InteractiveBarChart from '../../components/charts/InteractiveBarChart';
import { getIdentities, getRiskEvents } from '../../services/storageService';

const COLORS = { active_directory: '#00a4ef', aws_iam: '#ff9900', okta: '#007dc1', github: '#f0f6fc', salesforce: '#00a1e0' };
const PLATFORM_LABELS = { active_directory: 'Active Directory', aws_iam: 'AWS IAM', okta: 'Okta', github: 'GitHub', salesforce: 'Salesforce' };

const RESOURCE_MAP = {
  active_directory: ['domain-controller', 'dns-server', 'file-server', 'gpo-management', 'certificate-authority'],
  aws_iam: ['iam-console', 'ec2-instances', 's3-prod-data', 'kms-keys', 'lambda-functions', 'rds-databases'],
  okta: ['sso-config', 'api-tokens', 'mfa-policies', 'user-provisioning', 'app-integrations'],
  github: ['private-repos', 'org-settings', 'actions-secrets', 'deploy-keys', 'packages'],
  salesforce: ['crm-data', 'user-management', 'reports', 'apex-classes', 'api-access'],
};

const ROLE_MAP = {
  active_directory: { admin: 'Domain Admin', user: 'Domain User' },
  aws_iam: { admin: 'AdministratorAccess', user: 'ReadOnlyAccess' },
  okta: { admin: 'Org Admin', user: 'SSO User' },
  github: { admin: 'Owner', user: 'Contributor' },
  salesforce: { admin: 'System Administrator', user: 'Standard User' },
};

function computeBlastRadius(identity) {
  const platforms = identity.platforms || [];
  const isAdmin = identity.is_admin;
  const byPlatform = {};
  let totalResources = 0;
  let totalPermissions = 0;
  let adminRoles = 0;
  const sensitiveAssets = [];

  platforms.forEach(p => {
    const allRes = RESOURCE_MAP[p] || ['general-access'];
    const reachable = isAdmin ? allRes : allRes.slice(0, 2);
    byPlatform[p] = reachable.length;
    totalResources += reachable.length;
    totalPermissions += isAdmin ? reachable.length * 3 : reachable.length;
    if (isAdmin && ['active_directory', 'aws_iam', 'okta', 'salesforce'].includes(p)) {
      adminRoles++;
      sensitiveAssets.push(...reachable.slice(0, 2).map(r => `${PLATFORM_LABELS[p]}: ${r}`));
    }
  });

  let severity = 'low';
  if (totalResources >= 15 || adminRoles >= 3) severity = 'critical';
  else if (totalResources >= 10 || adminRoles >= 2) severity = 'high';
  else if (totalResources >= 5) severity = 'medium';

  return {
    identity: identity.display_name,
    id: identity.person_id,
    department: identity.department,
    severity,
    resources: totalResources,
    permissions: totalPermissions,
    adminRoles,
    platforms,
    byPlatform,
    sensitiveAssets,
    riskScore: identity.risk_score || 0,
    isAdmin,
    mfaComplete: identity.mfa_complete,
    status: identity.status,
  };
}

export default function BlastRadius() {
  const identities = useMemo(() => getIdentities().filter(i => i.status !== 'Disabled' && i.status !== 'Offboarded'), []);
  const risks = useMemo(() => getRiskEvents(), []);
  const [searchQuery, setSearchQuery] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const [selected, setSelected] = useState(null);
  const [analysis, setAnalysis] = useState(null);
  const [simulating, setSimulating] = useState(false);
  const [simResult, setSimResult] = useState(null);
  const [simPlatform, setSimPlatform] = useState('');

  const topRiskUsers = useMemo(() =>
    identities.filter(i => i.risk_score > 40 || i.is_admin).sort((a, b) => (b.risk_score || 0) - (a.risk_score || 0)).slice(0, 6),
  [identities]);

  const filteredIdentities = useMemo(() => {
    if (!searchQuery.trim()) return identities.slice(0, 12);
    const q = searchQuery.toLowerCase();
    return identities.filter(i =>
      i.display_name?.toLowerCase().includes(q) || i.person_id?.toLowerCase().includes(q) || i.department?.toLowerCase().includes(q)
    ).slice(0, 12);
  }, [searchQuery, identities]);

  const selectAndAnalyze = (identity) => {
    setSelected(identity);
    setShowDropdown(false);
    setSearchQuery('');
    setSimResult(null);
    const br = computeBlastRadius(identity);
    setAnalysis(br);
    setSimPlatform(identity.platforms?.[0] || '');
  };

  const runSimulation = () => {
    if (!analysis || !simPlatform) return;
    setSimulating(true);
    setTimeout(() => {
      const remaining = { ...analysis.byPlatform };
      const removedCount = remaining[simPlatform] || 0;
      delete remaining[simPlatform];
      const afterResources = Object.values(remaining).reduce((a, b) => a + b, 0);
      const afterAdminRoles = Math.max(0, analysis.adminRoles - (analysis.isAdmin ? 1 : 0));
      const afterPermissions = analysis.permissions - (removedCount * (analysis.isAdmin ? 3 : 1));
      const reductionPct = analysis.resources > 0 ? ((1 - afterResources / analysis.resources) * 100) : 0;
      const beforeScore = analysis.riskScore;
      const afterScore = Math.max(0, Math.round(beforeScore * (afterResources / Math.max(analysis.resources, 1))));

      setSimResult({
        removedPlatform: simPlatform,
        removedResources: removedCount,
        originalResources: analysis.resources,
        afterResources,
        originalPermissions: analysis.permissions,
        afterPermissions: Math.max(0, afterPermissions),
        originalAdminRoles: analysis.adminRoles,
        afterAdminRoles,
        reductionPct: reductionPct.toFixed(1),
        beforeScore,
        afterScore,
      });
      setSimulating(false);
    }, 1200);
  };

  const chartData = analysis ? Object.entries(analysis.byPlatform).map(([p, v]) => ({
    label: PLATFORM_LABELS[p] || p,
    value: v,
    color: COLORS[p] || '#64748b',
    key: p,
  })) : [];
  const riskEvent = selected ? risks.find(r => r.identityId === selected.person_id) : null;

  return (
    <div className="space-y-6">
      <PageHeader
        badge="Blast Radius"
        title="Impact Simulation Center"
        subtitle="Select an identity to analyze blast radius and simulate role revocation"
      />

      {/* User Selector */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
        <input value={searchQuery} onChange={e => { setSearchQuery(e.target.value); setShowDropdown(true); }}
          onFocus={() => setShowDropdown(true)}
          placeholder="Search identity by name, ID, or department..."
          className="w-full pl-10 pr-4 py-2.5 bg-white/3 border border-white/6 rounded-lg text-sm text-white placeholder-slate-500 outline-none focus:border-red-500/50 transition-colors" />
        <AnimatePresence>
          {showDropdown && filteredIdentities.length > 0 && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setShowDropdown(false)} />
              <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
                className="absolute z-50 top-full mt-1 left-0 right-0 max-h-72 overflow-y-auto rounded-xl"
                style={{ background: 'rgba(8,10,18,0.98)', border: '1px solid rgba(227,25,55,0.2)', backdropFilter: 'blur(20px)' }}>
                {filteredIdentities.map(id => (
                  <button key={id.person_id} onClick={() => selectAndAnalyze(id)}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-white/5 transition-colors border-b border-white/3 last:border-0">
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold shrink-0"
                      style={{ background: 'rgba(227,25,55,0.15)', color: '#E31937', border: '1px solid rgba(227,25,55,0.3)' }}>
                      {(id.display_name || '?')[0]}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-white font-medium truncate">{id.display_name}</p>
                      <p className="text-[10px] text-slate-500">{id.person_id} | {id.department} | {id.platforms?.length || 0} platforms</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-xs font-mono text-red-400">{id.risk_score}</span>
                      {id.severity && <SeverityBadge severity={id.severity.toLowerCase()} />}
                    </div>
                  </button>
                ))}
              </motion.div>
            </>
          )}
        </AnimatePresence>
      </div>

      {/* Quick-select: Top Risk Users */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        {topRiskUsers.map((user, i) => {
          const br = computeBlastRadius(user);
          const isActive = selected?.person_id === user.person_id;
          return (
            <GlassCard key={user.person_id} delay={i * 0.04} onClick={() => selectAndAnalyze(user)}
              className={`cursor-pointer ${isActive ? 'border-red-500/30 bg-red-500/[0.03]' : ''}`}>
              <div className="flex items-start justify-between mb-2">
                <div>
                  <p className="text-sm font-semibold text-white">{user.display_name}</p>
                  <p className="text-[10px] text-slate-500">{user.person_id} | {user.department}</p>
                </div>
                <SeverityBadge severity={br.severity} />
              </div>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div><FloatingCounter value={br.resources} color="red" size="2xl" /><p className="text-[10px] text-slate-500 font-orbitron uppercase tracking-wider">Resources</p></div>
                <div><FloatingCounter value={br.permissions} color="amber" size="2xl" /><p className="text-[10px] text-slate-500 font-orbitron uppercase tracking-wider">Permissions</p></div>
                <div><FloatingCounter value={br.adminRoles} color="orange" size="2xl" /><p className="text-[10px] text-slate-500 font-orbitron uppercase tracking-wider">Admin Roles</p></div>
              </div>
              <div className="flex gap-1 mt-2">{user.platforms?.map(p => <PlatformIcon key={p} platform={p} size="sm" />)}</div>
            </GlassCard>
          );
        })}
      </div>

      {/* Analysis Results */}
      {analysis && (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
          {/* Summary Header */}
          <GlassCard hover={false} glow="red">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl flex items-center justify-center text-lg font-bold"
                  style={{ background: 'linear-gradient(135deg, rgba(227,25,55,0.25), rgba(227,25,55,0.08))', border: '2px solid rgba(227,25,55,0.35)', color: '#E31937' }}>
                  {(analysis.identity || '?')[0]}
                </div>
                <div>
                  <h2 className="text-lg font-bold text-white">{analysis.identity}</h2>
                  <p className="text-xs text-slate-400">{analysis.id} | {analysis.department} | Risk Score: <span className="text-red-400 font-mono">{analysis.riskScore}</span></p>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="text-center"><FloatingCounter value={analysis.resources} color="red" size="2xl" /><p className="text-[9px] text-slate-500 uppercase font-orbitron tracking-wider">Resources</p></div>
                <div className="text-center"><FloatingCounter value={analysis.permissions} color="amber" size="2xl" /><p className="text-[9px] text-slate-500 uppercase font-orbitron tracking-wider">Permissions</p></div>
                <div className="text-center"><FloatingCounter value={analysis.adminRoles} color="orange" size="2xl" /><p className="text-[9px] text-slate-500 uppercase font-orbitron tracking-wider">Admin</p></div>
                <SeverityBadge severity={analysis.severity} pulse />
              </div>
            </div>
          </GlassCard>

          <div className="grid lg:grid-cols-2 gap-6">
            {/* Resource Distribution */}
            <GlassCard hover={false}>
              <InteractiveBarChart
                data={chartData}
                dataKey="value"
                labelKey="label"
                layout="horizontal"
                height={250}
                title="Resource Distribution"
                colorKey="color"
              />
            </GlassCard>

            {/* What-If Simulation */}
            <GlassCard hover={false}>
              <h3 className="text-sm font-semibold text-slate-300 mb-4 flex items-center gap-2">
                <Zap size={14} className="text-red-400" /> What-If Simulation
              </h3>
              <p className="text-sm text-slate-400 mb-3">Select a platform to simulate role revocation and measure risk reduction.</p>
              <div className="mb-4">
                <label className="text-[11px] text-slate-500 uppercase tracking-wider block mb-1">Remove Access From</label>
                <select value={simPlatform} onChange={e => setSimPlatform(e.target.value)}
                  className="w-full px-3 py-2.5 bg-white/5 border border-white/10 rounded-lg text-sm text-white outline-none focus:border-red-500/50">
                  {analysis.platforms.map(p => <option key={p} value={p} className="bg-navy-900">{PLATFORM_LABELS[p] || p}</option>)}
                </select>
              </div>
              <button onClick={runSimulation} disabled={simulating || !simPlatform}
                className="w-full py-3 rounded-xl bg-gradient-to-r from-red-600 to-red-500 text-white font-semibold text-sm disabled:opacity-50 hover:opacity-90 transition-opacity">
                {simulating ? 'Analyzing...' : `Simulate Revocation on ${PLATFORM_LABELS[simPlatform] || simPlatform}`}
              </button>
              <AnimatePresence>
                {simResult && (
                  <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mt-4 space-y-2.5">
                    {[
                      { label: 'Platform Removed', value: PLATFORM_LABELS[simResult.removedPlatform] || simResult.removedPlatform, color: 'text-orange-400' },
                      { label: 'Resources', value: `${simResult.originalResources} → ${simResult.afterResources}`, color: 'text-white' },
                      { label: 'Permissions', value: `${simResult.originalPermissions} → ${simResult.afterPermissions}`, color: 'text-white' },
                      { label: 'Admin Roles', value: `${simResult.originalAdminRoles} → ${simResult.afterAdminRoles}`, color: 'text-white' },
                      { label: 'Risk Reduction', value: `${simResult.reductionPct}%`, color: 'text-emerald-400' },
                      { label: 'Risk Score', value: `${simResult.beforeScore} → ${simResult.afterScore}`, color: 'text-emerald-400' },
                    ].map(row => (
                      <div key={row.label} className="flex items-center justify-between py-2 border-b border-white/5">
                        <span className="text-sm text-slate-400">{row.label}</span>
                        <span className={`text-sm font-bold ${row.color}`}>{row.value}</span>
                      </div>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </GlassCard>
          </div>

          {/* Sensitive Assets + Risk Explanation */}
          <div className="grid lg:grid-cols-2 gap-6">
            <GlassCard hover={false}>
              <h3 className="text-sm font-semibold text-slate-300 mb-4 flex items-center gap-2">
                <Shield size={14} className="text-red-400" /> Sensitive Assets at Risk
              </h3>
              {analysis.sensitiveAssets.length > 0 ? (
                <div className="space-y-2">
                  {analysis.sensitiveAssets.map((asset, i) => (
                    <motion.div key={i} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }}
                      className="flex items-center gap-2 px-3 py-2 rounded-lg" style={{ background: 'rgba(239,68,68,0.05)', border: '1px solid rgba(239,68,68,0.12)' }}>
                      <AlertTriangle size={12} className="text-red-400 shrink-0" />
                      <span className="text-xs text-slate-300">{asset}</span>
                    </motion.div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-slate-500 italic">No sensitive admin assets — standard user access</p>
              )}
            </GlassCard>

            <GlassCard hover={false}>
              <h3 className="text-sm font-semibold text-slate-300 mb-4 flex items-center gap-2">
                <Eye size={14} className="text-red-400" /> Risk Explanation
              </h3>
              <div className="text-sm text-slate-400 leading-relaxed space-y-2">
                <p><strong className="text-white">{analysis.identity}</strong> has access to <strong className="text-red-400">{analysis.resources} resources</strong> across <strong className="text-white">{analysis.platforms.length} platform(s)</strong>.</p>
                {analysis.adminRoles > 0 && <p><strong className="text-orange-400">{analysis.adminRoles} admin role(s)</strong> grant full control over critical infrastructure including {analysis.sensitiveAssets.slice(0, 2).join(', ')}.</p>}
                {!analysis.mfaComplete && <p className="text-yellow-400">MFA is not enabled — credential compromise would expose all reachable resources.</p>}
                {riskEvent && <p>Active finding: <strong className="text-red-400">{riskEvent.title}</strong> ({riskEvent.severity})</p>}
                <p className="text-xs text-slate-500 mt-2">Blast Radius Severity: <strong className={analysis.severity === 'critical' ? 'text-red-400' : analysis.severity === 'high' ? 'text-orange-400' : 'text-yellow-400'}>{analysis.severity.toUpperCase()}</strong></p>
              </div>
            </GlassCard>
          </div>
        </motion.div>
      )}

      {!analysis && (
        <GlassCard hover={false}>
          <div className="flex flex-col items-center gap-4 py-16">
            <Target size={48} className="text-slate-600" />
            <p className="text-sm text-slate-500">Select an identity above or use the search to analyze blast radius</p>
            <p className="text-xs text-slate-600">Blast radius is calculated from the user's actual platforms, roles, and admin privileges</p>
          </div>
        </GlassCard>
      )}
    </div>
  );
}
