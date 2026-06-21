import { useState, useMemo, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import {
  Target, Search, Shield, AlertTriangle, Key, Users, Server,
  Zap, Activity, ChevronRight, Eye, Globe, Info, X, ArrowRight,
} from 'lucide-react';
import GlassCard from '../../components/shared/GlassCard';
import SeverityBadge from '../../components/shared/SeverityBadge';
import AnimatedCounter from '../../components/shared/AnimatedCounter';
import PlatformIcon from '../../components/shared/PlatformIcon';
import { getIdentities, getRiskEvents } from '../../services/storageService';
import { usePlatformData } from '../../context/PlatformDataContext';
import { fetchBlastRadius } from '../../services/dataService';


const COLORS = { active_directory: '#00a4ef', aws_iam: '#ff9900', okta: '#007dc1', salesforce: '#00a1e0' };
const PLATFORM_LABELS = { active_directory: 'Active Directory', aws_iam: 'AWS IAM', okta: 'Okta', salesforce: 'Salesforce' };

const RESOURCE_MAP = {
  active_directory: ['domain-controller', 'dns-server', 'file-server', 'gpo-management', 'certificate-authority'],
  aws_iam: ['iam-console', 'ec2-instances', 's3-prod-data', 'kms-keys', 'lambda-functions', 'rds-databases'],
  okta: ['sso-config', 'api-tokens', 'mfa-policies', 'user-provisioning', 'app-integrations'],
  salesforce: ['crm-data', 'user-management', 'reports', 'apex-classes', 'api-access'],
};

function computeBlastRadius(identity, excludePlatform) {
  const allPlatforms = identity.platforms || [];
  const platforms = excludePlatform ? allPlatforms.filter(p => p !== excludePlatform) : allPlatforms;
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

  const riskScore = excludePlatform
    ? Math.max(0, Math.round((identity.risk_score || 0) * (totalResources / Math.max(computeBlastRadius(identity, null).resources, 1))))
    : (identity.risk_score || 0);

  return {
    identity: identity.display_name, id: identity.person_id, department: identity.department,
    severity, resources: totalResources, permissions: totalPermissions, adminRoles,
    platforms, byPlatform, sensitiveAssets, riskScore, isAdmin,
    mfaComplete: identity.mfa_complete, status: identity.status,
  };
}

function computeForIdentity(identity) { return computeBlastRadius(identity, null); }

export default function BlastRadius() {
  const navigate = useNavigate();
  const location = useLocation();
  const { data } = usePlatformData();
  const identities = useMemo(() => getIdentities().filter(i => i.status !== 'Disabled' && i.status !== 'Offboarded'), [data]);
  const risks = useMemo(() => getRiskEvents(), [data]);

  const preSelected = useMemo(() => {
    const pid = location.state?.personId;
    if (!pid) return null;
    const all = getIdentities().filter(i => i.status !== 'Disabled' && i.status !== 'Offboarded');
    const match = all.find(i => i.person_id === pid);
    if (match) window.history.replaceState({}, '');
    return match || null;
  }, []);

  const [searchQuery, setSearchQuery] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const [selected, setSelected] = useState(preSelected);
  const [analysis, setAnalysis] = useState(() => preSelected ? computeForIdentity(preSelected) : null);
  const [simPlatform, setSimPlatform] = useState(() => preSelected?.platforms?.[0] || '');
  const [simResult, setSimResult] = useState(null);
  const [simulating, setSimulating] = useState(false);
  const [breakdownItem, setBreakdownItem] = useState(null);

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

  const selectAndAnalyze = async (identity) => {
    setSelected(identity);
    setShowDropdown(false);
    setSearchQuery('');
    setSimResult(null);
    setBreakdownItem(null);
    setSimPlatform(identity.platforms?.[0] || '');

    try {
      const apiBr = await fetchBlastRadius(identity.person_id);
      if (apiBr?.resources != null) {
        setAnalysis({
          identity: apiBr.display_name || identity.display_name,
          id: identity.person_id,
          department: identity.department,
          severity: apiBr.severity,
          resources: apiBr.resources ?? apiBr.reachable_resources,
          permissions: apiBr.permissions ?? apiBr.reachable_permissions,
          adminRoles: apiBr.adminRoles ?? apiBr.reachable_admin_roles,
          platforms: apiBr.platforms ?? apiBr.impacted_platforms ?? identity.platforms,
          byPlatform: apiBr.byPlatform ?? apiBr.resource_by_platform ?? {},
          sensitiveAssets: apiBr.sensitiveAssets ?? apiBr.admin_resources ?? [],
          riskScore: identity.risk_score,
          isAdmin: identity.is_admin,
          mfaComplete: identity.mfa_complete,
          status: identity.status,
        });
        return;
      }
    } catch {
      /* fallback to client heuristic */
    }
    setAnalysis(computeForIdentity(identity));
  };

  const runSimulation = () => {
    if (!analysis || !simPlatform || !selected) return;
    setSimulating(true);
    setTimeout(() => {
      const before = computeForIdentity(selected);
      const after = computeBlastRadius(selected, simPlatform);
      const removedResources = RESOURCE_MAP[simPlatform] || [];
      const wasAdmin = selected.is_admin && ['active_directory', 'aws_iam', 'okta', 'salesforce'].includes(simPlatform);

      setSimResult({
        removedPlatform: simPlatform,
        before, after,
        removedResourceList: selected.is_admin ? removedResources : removedResources.slice(0, 2),
        wasAdminOnPlatform: wasAdmin,
        reductionPct: before.resources > 0 ? ((1 - after.resources / before.resources) * 100).toFixed(1) : '0',
      });
      setAnalysis(after);
      setSimulating(false);
    }, 1000);
  };

  const resetSimulation = () => {
    if (!selected) return;
    setSimResult(null);
    setBreakdownItem(null);
    setAnalysis(computeForIdentity(selected));
    setSimPlatform(selected.platforms?.[0] || '');
  };

  const chartData = analysis ? Object.entries(analysis.byPlatform).map(([p, v]) => ({ platform: PLATFORM_LABELS[p] || p, resources: v, key: p })) : [];
  const riskEvent = selected ? risks.find(r => r.identityId === selected.person_id) : null;

  const SIM_ROWS = simResult ? [
    { key: 'platform', label: 'Platform Removed', before: PLATFORM_LABELS[simResult.removedPlatform], after: 'Revoked', color: 'text-orange-400',
      detail: `All access on ${PLATFORM_LABELS[simResult.removedPlatform]} will be revoked. ${simResult.wasAdminOnPlatform ? 'Admin role will be removed.' : 'Standard user access removed.'}` },
    { key: 'resources', label: 'Resources', before: simResult.before.resources, after: simResult.after.resources, color: 'text-white',
      detail: `Removed ${simResult.removedResourceList.length} resource(s): ${simResult.removedResourceList.join(', ')}` },
    { key: 'permissions', label: 'Permissions', before: simResult.before.permissions, after: simResult.after.permissions, color: 'text-white',
      detail: `${simResult.before.permissions - simResult.after.permissions} permission(s) revoked from ${PLATFORM_LABELS[simResult.removedPlatform]}. ${simResult.wasAdminOnPlatform ? 'Includes admin-level write/delete permissions.' : 'Read-level permissions removed.'}` },
    { key: 'admin', label: 'Admin Roles', before: simResult.before.adminRoles, after: simResult.after.adminRoles, color: 'text-white',
      detail: simResult.wasAdminOnPlatform ? `Admin role on ${PLATFORM_LABELS[simResult.removedPlatform]} removed. Remaining admin roles: ${simResult.after.adminRoles}.` : 'No admin role was held on this platform.' },
    { key: 'reduction', label: 'Risk Reduction', before: null, after: `${simResult.reductionPct}%`, color: 'text-emerald-400',
      detail: `Blast radius reduced by ${simResult.reductionPct}%. Resource exposure decreased from ${simResult.before.resources} to ${simResult.after.resources} reachable targets.` },
    { key: 'score', label: 'Risk Score', before: simResult.before.riskScore, after: simResult.after.riskScore, color: 'text-emerald-400',
      detail: `Risk score drops from ${simResult.before.riskScore} to ${simResult.after.riskScore} (reduction of ${simResult.before.riskScore - simResult.after.riskScore} points). Severity: ${simResult.before.severity.toUpperCase()} → ${simResult.after.severity.toUpperCase()}.` },
  ] : [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-3">
          <Target className="w-7 h-7 text-sg-red" /> Impact Simulation Center
        </h1>
        <p className="text-sm text-slate-500 mt-1">Select an identity to analyze blast radius and simulate role revocation</p>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
        <input value={searchQuery} onChange={e => { setSearchQuery(e.target.value); setShowDropdown(true); }}
          onFocus={() => setShowDropdown(true)} placeholder="Search identity by name, ID, or department..."
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
                      <p className="text-[10px] text-slate-500">{id.person_id} | {id.department}</p>
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

      {/* Top Risk Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        {topRiskUsers.map((user, i) => {
          const br = computeForIdentity(user);
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
                <div><p className="text-lg font-black text-red-400">{br.resources}</p><p className="text-[10px] text-slate-500">Resources</p></div>
                <div><p className="text-lg font-black text-amber-400">{br.permissions}</p><p className="text-[10px] text-slate-500">Permissions</p></div>
                <div><p className="text-lg font-black text-orange-400">{br.adminRoles}</p><p className="text-[10px] text-slate-500">Admin</p></div>
              </div>
              <div className="flex gap-1 mt-2">{user.platforms?.map(p => <PlatformIcon key={p} platform={p} size="sm" />)}</div>
            </GlassCard>
          );
        })}
      </div>

      {/* Analysis */}
      {analysis && selected && (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
          {/* Header with nav buttons */}
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
              <div className="flex items-center gap-3">
                <div className="text-center"><p className="text-2xl font-black text-red-400">{analysis.resources}</p><p className="text-[9px] text-slate-500 uppercase">Resources</p></div>
                <div className="text-center"><p className="text-2xl font-black text-amber-400">{analysis.permissions}</p><p className="text-[9px] text-slate-500 uppercase">Permissions</p></div>
                <div className="text-center"><p className="text-2xl font-black text-orange-400">{analysis.adminRoles}</p><p className="text-[9px] text-slate-500 uppercase">Admin</p></div>
                <SeverityBadge severity={analysis.severity} pulse />
                {/* Navigation buttons */}
                <div className="flex gap-1.5 ml-3">
                  <button onClick={() => navigate(`/admin/identities/${selected.person_id}`)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-500/10 text-blue-400 text-[10px] font-semibold border border-blue-500/20 hover:bg-blue-500/20 transition-all">
                    <Globe size={11} /> View Correlation
                  </button>
                  <button onClick={() => navigate('/admin/attack-paths', { state: { personId: selected?.person_id } })}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500/10 text-red-400 text-[10px] font-semibold border border-red-500/20 hover:bg-red-500/20 transition-all">
                    <ArrowRight size={11} /> Attack Path
                  </button>
                </div>
              </div>
            </div>
          </GlassCard>

          <div className="grid lg:grid-cols-2 gap-6">
            {/* Chart — updates after simulation */}
            <GlassCard hover={false}>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-slate-300 flex items-center gap-2">
                  <Activity size={14} className="text-red-400" /> Resource Distribution {simResult ? '(After Simulation)' : ''}
                </h3>
                {simResult && (
                  <button onClick={resetSimulation} className="text-[10px] text-slate-500 hover:text-red-400 transition-colors flex items-center gap-1">
                    <X size={10} /> Reset
                  </button>
                )}
              </div>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={chartData}>
                  <XAxis dataKey="platform" tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ background: '#0a0f1f', border: '1px solid rgba(227,25,55,0.3)', borderRadius: 12, fontSize: 12, color: '#f1f5f9' }} wrapperStyle={{ zIndex: 1000 }} />
                  <Bar dataKey="resources" radius={[6, 6, 0, 0]} barSize={40}>
                    {chartData.map((d, i) => <Cell key={i} fill={COLORS[Object.keys(analysis.byPlatform)[i]] || '#64748b'} fillOpacity={0.8} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </GlassCard>

            {/* Simulation Panel */}
            <GlassCard hover={false}>
              <h3 className="text-sm font-semibold text-slate-300 mb-4 flex items-center gap-2">
                <Zap size={14} className="text-red-400" /> What-If Simulation
              </h3>
              <p className="text-sm text-slate-400 mb-3">Select a platform to simulate role revocation and measure risk reduction.</p>
              <div className="mb-4">
                <label className="text-[11px] text-slate-500 uppercase tracking-wider block mb-1">Remove Access From</label>
                <select value={simPlatform} onChange={e => setSimPlatform(e.target.value)}
                  className="w-full px-3 py-2.5 bg-white/5 border border-white/10 rounded-lg text-sm text-white outline-none focus:border-red-500/50">
                  {(selected.platforms || []).map(p => <option key={p} value={p} className="bg-navy-900">{PLATFORM_LABELS[p] || p}</option>)}
                </select>
              </div>
              <button onClick={runSimulation} disabled={simulating || !simPlatform}
                className="w-full py-3 rounded-xl bg-gradient-to-r from-red-600 to-red-500 text-white font-semibold text-sm disabled:opacity-50 hover:opacity-90 transition-opacity">
                {simulating ? 'Analyzing...' : `Simulate Revocation on ${PLATFORM_LABELS[simPlatform] || simPlatform}`}
              </button>

              <AnimatePresence>
                {simResult && (
                  <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mt-4 space-y-1">
                    {SIM_ROWS.map(row => (
                      <div key={row.key}>
                        <div className="flex items-center justify-between py-2 border-b border-white/5 group cursor-pointer"
                          onClick={() => setBreakdownItem(breakdownItem === row.key ? null : row.key)}>
                          <div className="flex items-center gap-2">
                            <span className="text-sm text-slate-400">{row.label}</span>
                            <button className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded hover:bg-white/5">
                              <Info size={12} className="text-slate-500" />
                            </button>
                          </div>
                          <span className={`text-sm font-bold ${row.color}`}>
                            {row.before !== null ? `${row.before} → ${row.after}` : row.after}
                          </span>
                        </div>
                        <AnimatePresence>
                          {breakdownItem === row.key && (
                            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                              className="px-3 py-2 mb-1 rounded-lg text-xs text-slate-400 leading-relaxed"
                              style={{ background: 'rgba(227,25,55,0.04)', border: '1px solid rgba(227,25,55,0.1)' }}>
                              {row.detail}
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </GlassCard>
          </div>

          {/* Bottom panels */}
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
                {analysis.adminRoles > 0 && <p><strong className="text-orange-400">{analysis.adminRoles} admin role(s)</strong> grant full control over critical infrastructure.</p>}
                {!analysis.mfaComplete && <p className="text-yellow-400">MFA is not enabled — credential compromise would expose all reachable resources.</p>}
                {riskEvent && <p>Active finding: <strong className="text-red-400">{riskEvent.title}</strong> ({riskEvent.severity})</p>}
                {simResult && (
                  <div className="mt-3 pt-3 border-t border-white/5">
                    <p className="text-emerald-400">After revoking {PLATFORM_LABELS[simResult.removedPlatform]}: blast radius reduced by <strong>{simResult.reductionPct}%</strong>, risk score <strong>{simResult.before.riskScore} → {simResult.after.riskScore}</strong>.</p>
                  </div>
                )}
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
