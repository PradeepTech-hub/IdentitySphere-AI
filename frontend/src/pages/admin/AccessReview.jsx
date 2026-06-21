import { useState, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  CheckCircle, XCircle, AlertTriangle, Clock, Shield, Users, Eye,
  Key, ArrowUpRight, FileText, X, Layers, Target, Globe, Sparkles,
  TrendingDown,
} from 'lucide-react';
import GlassCard from '../../components/shared/GlassCard';
import SeverityBadge from '../../components/shared/SeverityBadge';
import PlatformIcon from '../../components/shared/PlatformIcon';
import AnimatedCounter from '../../components/shared/AnimatedCounter';
import {
  getIdentities, updateIdentity,
  getAccessRequests, saveAccessRequests,
  getReviewHistory, saveReviewHistory,
} from '../../services/storageService';

const PLATFORM_LABELS = { active_directory: 'Active Directory', aws_iam: 'AWS IAM', okta: 'Okta', salesforce: 'Salesforce' };
const STATUS_STYLES = {
  approved: { label: 'Approved', color: 'text-green-400', bg: 'bg-green-500/10', icon: CheckCircle },
  revoked: { label: 'Revoked', color: 'text-red-400', bg: 'bg-red-500/10', icon: XCircle },
  escalated: { label: 'Escalated', color: 'text-orange-400', bg: 'bg-orange-500/10', icon: ArrowUpRight },
  pending: { label: 'Pending', color: 'text-yellow-400', bg: 'bg-yellow-500/10', icon: Clock },
};
const ROLE_MAP = { active_directory: { admin: 'Domain Admin', user: 'Domain User' }, aws_iam: { admin: 'AdministratorAccess', user: 'ReadOnlyAccess' }, okta: { admin: 'Org Admin', user: 'SSO User' }, salesforce: { admin: 'System Administrator', user: 'Standard User' } };
const HIGH_RISK_ROLES = ['Domain Admin', 'AdministratorAccess', 'Org Admin', 'System Administrator', 'Owner', 'PowerUserAccess'];

function getWhyFlagged(id) {
  const r = [];
  if (id.is_admin) r.push('Critical Privilege');
  if (id.is_admin && (id.platforms?.length || 0) >= 2) r.push('Cross-Platform Admin');
  if (!id.mfa_complete) r.push('Missing MFA');
  if ((id.max_dormancy_days || 0) > 90) r.push('Dormant Access');
  if (id.status === 'Orphaned') r.push('Orphaned Account');
  if ((id.risk_score || 0) >= 60) r.push('High Risk Score');
  return r.length ? r : ['Periodic Review'];
}

function getAiRec(id, p) {
  if (id.status === 'Orphaned' || id.status === 'Dormant') return { action: 'Revoke', reason: `Account is ${id.status.toLowerCase()} — revoke all access` };
  if (!id.mfa_complete && id.is_admin) return { action: 'Escalate', reason: `Admin without MFA — enforce MFA immediately` };
  if (id.is_admin && (id.platforms?.length || 0) >= 3) return { action: 'Revoke', reason: `Excessive cross-platform admin` };
  if ((id.risk_score || 0) >= 70) return { action: 'Revoke', reason: `Risk ${id.risk_score} exceeds threshold` };
  if (id.is_admin) return { action: 'Escalate', reason: `Admin on ${PLATFORM_LABELS[p]} — verify justification` };
  return { action: 'Approve', reason: `Standard access — within policy` };
}

function explainRisk(id) {
  const lines = [];
  if (id.is_admin) lines.push(`${id.display_name} holds admin privileges on ${id.platforms?.length || 0} platform(s). A single credential compromise would grant full control over ${id.is_admin ? 'critical infrastructure' : 'user data'}.`);
  if (!id.mfa_complete) lines.push('MFA is not enabled — the account is vulnerable to credential stuffing, phishing, and brute force attacks.');
  if ((id.max_dormancy_days || 0) > 90) lines.push(`Account has been dormant for ${id.max_dormancy_days} days. Dormant credentials can be exploited without triggering behavioral alerts.`);
  if (id.status === 'Orphaned') lines.push('This identity is terminated in HR but still has active platform accounts. This is a critical offboarding gap.');
  if (id.is_admin && (id.platforms?.length || 0) >= 3) lines.push(`Cross-platform admin on ${id.platforms?.join(', ')} creates a toxic combination where compromise on one platform cascades across the enterprise.`);
  if (lines.length === 0) lines.push('This identity has elevated or sensitive access that requires periodic review per organizational policy.');
  return lines;
}

export default function AccessReview() {
  const navigate = useNavigate();
  const [reviewHistory, setReviewHistory] = useState(() => getReviewHistory());
  const [filter, setFilter] = useState('all');
  const [actionResults, setActionResults] = useState({});
  const [reviewStatuses, setReviewStatuses] = useState({});
  const [drawerUser, setDrawerUser] = useState(null);

  const identities = useMemo(() => getIdentities(), [reviewStatuses]);
  const pendingRequests = useMemo(() => getAccessRequests().filter(r => r.status === 'pending'), [reviewStatuses]);

  const reviewItems = useMemo(() => {
    const flagged = identities.filter(i => i.is_admin || !i.mfa_complete || i.status === 'Orphaned' || i.status === 'Dormant' || (i.risk_score || 0) >= 50);
    const items = [];
    flagged.forEach(id => {
      (id.platforms || []).forEach(p => {
        const role = id.is_admin ? (ROLE_MAP[p]?.admin || 'Admin') : (ROLE_MAP[p]?.user || 'User');
        const isHR = HIGH_RISK_ROLES.includes(role);
        if (!id.is_admin && !isHR && id.mfa_complete && id.status === 'Active') return;
        const key = `${id.person_id}-${p}`;
        items.push({ key, personId: id.person_id, identity: id.display_name, department: id.department, platform: p, role, riskScore: id.risk_score || 0, severity: id.severity || 'medium', status: reviewStatuses[key] || 'pending', isHighRisk: isHR, whyFlagged: getWhyFlagged(id), aiRec: getAiRec(id, p), identityData: id });
      });
    });
    return items.sort((a, b) => b.riskScore - a.riskScore);
  }, [identities, reviewStatuses]);

  const grouped = useMemo(() => {
    const map = {};
    reviewItems.forEach(item => {
      if (!map[item.personId]) map[item.personId] = { identity: item.identity, personId: item.personId, department: item.department, riskScore: item.riskScore, severity: item.severity, identityData: item.identityData, items: [] };
      map[item.personId].items.push(item);
    });
    return Object.values(map);
  }, [reviewItems]);

  const filteredGroups = filter === 'all' ? grouped : grouped.filter(g => g.items.some(i => i.status === filter));
  const stats = { pending: reviewItems.filter(i => i.status === 'pending').length, approved: reviewItems.filter(i => i.status === 'approved').length, revoked: reviewItems.filter(i => i.status === 'revoked').length, escalated: reviewItems.filter(i => i.status === 'escalated').length };

  const handleAction = useCallback((key, action, item) => {
    setReviewStatuses(prev => ({ ...prev, [key]: action }));
    const before = item.riskScore;
    const reduction = action === 'revoked' ? Math.round(before * 0.35) : action === 'escalated' ? Math.round(before * 0.1) : 0;
    const after = Math.max(0, before - reduction);
    setActionResults(prev => ({ ...prev, [key]: { action, beforeScore: before, afterScore: after, reduction } }));
    if (action === 'revoked') updateIdentity(item.personId, { risk_score: after, severity: after >= 70 ? 'critical' : after >= 45 ? 'high' : after >= 25 ? 'medium' : 'low' });
    setReviewHistory(prev => { const u = [{ id: `HIST-${Date.now()}`, reviewId: key, identity: item.identity, platform: item.platform, role: item.role, action, reviewer: 'Pradeep M', timestamp: new Date().toISOString(), riskBefore: before, riskAfter: after }, ...prev]; saveReviewHistory(u); return u; });
  }, []);

  const bulkAction = useCallback((action) => {
    const pending = reviewItems.filter(i => i.status === 'pending');
    const newStatuses = {};
    pending.forEach(item => {
      newStatuses[item.key] = action;
      const before = item.riskScore;
      const reduction = action === 'revoked' ? Math.round(before * 0.35) : action === 'escalated' ? Math.round(before * 0.1) : 0;
      const after = Math.max(0, before - reduction);
      setActionResults(prev => ({ ...prev, [item.key]: { action, beforeScore: before, afterScore: after, reduction } }));
      if (action === 'revoked') updateIdentity(item.personId, { risk_score: after, severity: after >= 70 ? 'critical' : after >= 45 ? 'high' : after >= 25 ? 'medium' : 'low' });
    });
    setReviewStatuses(prev => ({ ...prev, ...newStatuses }));
    const entries = pending.map(item => ({ id: `HIST-${Date.now()}-${item.key}`, reviewId: item.key, identity: item.identity, platform: item.platform, role: item.role, action, reviewer: 'Pradeep M', timestamp: new Date().toISOString(), riskBefore: item.riskScore, riskAfter: Math.max(0, item.riskScore - (action === 'revoked' ? Math.round(item.riskScore * 0.35) : 0)) }));
    setReviewHistory(prev => { const u = [...entries, ...prev]; saveReviewHistory(u); return u; });
  }, [reviewItems]);

  const handleRequestAction = useCallback((reqId, action) => {
    const allReqs = getAccessRequests();
    saveAccessRequests(allReqs.map(r => r.id !== reqId ? r : { ...r, status: action, reviewedBy: 'Pradeep M', reviewedAt: new Date().toISOString(), expiresAt: action === 'approved' ? new Date(Date.now() + r.durationDays * 86400000).toISOString() : null }));
    const req = allReqs.find(r => r.id === reqId);
    if (req) setReviewHistory(prev => { const u = [{ id: `HIST-${Date.now()}`, reviewId: reqId, identity: req.employeeName, platform: req.platform, role: req.role, action: action === 'approved' ? 'approved' : 'revoked', reviewer: 'Pradeep M', timestamp: new Date().toISOString() }, ...prev]; saveReviewHistory(u); return u; });
    setReviewStatuses(prev => ({ ...prev, [`req-${reqId}`]: action }));
  }, []);

  const drawer = drawerUser ? grouped.find(g => g.personId === drawerUser) : null;

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3"><Shield className="w-7 h-7 text-sg-red" /> Access Review & Certification</h1>
          <p className="text-slate-400 text-sm mt-1">{reviewItems.length} items across {grouped.length} identities</p>
        </div>
        {stats.pending > 0 && (
          <div className="flex gap-2">
            <motion.button whileTap={{ scale: 0.95 }} onClick={() => bulkAction('approved')} className="px-3 py-1.5 rounded-lg bg-green-500/10 text-green-400 text-[10px] font-semibold border border-green-500/20 hover:bg-green-500/20 transition-all">Approve All ({stats.pending})</motion.button>
            <motion.button whileTap={{ scale: 0.95 }} onClick={() => bulkAction('revoked')} className="px-3 py-1.5 rounded-lg bg-red-500/10 text-red-400 text-[10px] font-semibold border border-red-500/20 hover:bg-red-500/20 transition-all">Revoke All</motion.button>
            <motion.button whileTap={{ scale: 0.95 }} onClick={() => bulkAction('escalated')} className="px-3 py-1.5 rounded-lg bg-orange-500/10 text-orange-400 text-[10px] font-semibold border border-orange-500/20 hover:bg-orange-500/20 transition-all">Escalate All</motion.button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-4 gap-3">
        {[{ label: 'Pending', value: stats.pending, color: 'text-yellow-400', icon: Clock }, { label: 'Approved', value: stats.approved, color: 'text-green-400', icon: CheckCircle }, { label: 'Revoked', value: stats.revoked, color: 'text-red-400', icon: XCircle }, { label: 'Escalated', value: stats.escalated, color: 'text-orange-400', icon: ArrowUpRight }].map((s, i) => (
          <GlassCard key={s.label} delay={i * 0.05}><div className="flex items-center gap-3 p-1"><s.icon className={`w-5 h-5 ${s.color} opacity-60`} /><div><AnimatedCounter value={s.value} className={`text-2xl font-bold ${s.color}`} /><p className="text-[10px] text-slate-500 uppercase tracking-wider">{s.label}</p></div></div></GlassCard>
        ))}
      </div>

      <div className="flex gap-2">
        {['all', 'pending', 'approved', 'revoked', 'escalated'].map(f => (
          <button key={f} onClick={() => setFilter(f)} className={`px-3 py-2 rounded-lg text-xs font-medium transition-all ${filter === f ? 'bg-red-500/20 text-red-400 border border-red-500/30' : 'text-slate-400 hover:text-slate-300 hover:bg-white/5 border border-transparent'}`}>
            {f === 'all' ? `All (${reviewItems.length})` : `${f.charAt(0).toUpperCase() + f.slice(1)} (${stats[f]})`}
          </button>
        ))}
      </div>

      {/* Compact User Cards */}
      <div className="space-y-2">
        {filteredGroups.length === 0 ? (
          <GlassCard hover={false}><div className="flex flex-col items-center gap-3 py-12"><CheckCircle size={36} className="text-emerald-400" /><p className="text-sm text-slate-400">{filter === 'all' ? 'No items to review' : `No ${filter} items`}</p></div></GlassCard>
        ) : filteredGroups.map((group, gIdx) => {
          const pendingItems = group.items.filter(i => i.status === 'pending');
          const topAiRec = group.items[0]?.aiRec;
          return (
            <motion.div key={group.personId} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: gIdx * 0.02 }}
              className="rounded-xl px-5 py-3.5" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(227,25,55,0.1)' }}>
              <div className="flex items-center gap-4">
                <div className="w-9 h-9 rounded-lg flex items-center justify-center text-sm font-bold shrink-0"
                  style={{ background: 'rgba(227,25,55,0.12)', color: '#E31937', border: '1px solid rgba(227,25,55,0.25)' }}>
                  {(group.identity || '?')[0]}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-white">{group.identity}</span>
                    <SeverityBadge severity={group.severity?.toLowerCase() || 'medium'} />
                    <span className="text-xs font-mono text-red-400">{group.riskScore}</span>
                  </div>
                  <div className="flex items-center gap-2 mt-0.5 text-[11px] text-slate-500">
                    <span>{group.department}</span><span className="text-white/10">|</span>
                    <div className="flex gap-0.5">{[...new Set(group.items.map(i => i.platform))].map(p => <PlatformIcon key={p} platform={p} size="sm" />)}</div>
                    <span className="text-white/10">|</span>
                    <span>{group.items.length} privilege(s)</span>
                    {pendingItems.length > 0 && <><span className="text-white/10">|</span><span className="text-yellow-400 font-semibold">{pendingItems.length} pending</span></>}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {topAiRec && (
                    <span className={`text-[10px] font-semibold flex items-center gap-1 ${topAiRec.action === 'Revoke' ? 'text-red-400' : topAiRec.action === 'Escalate' ? 'text-orange-400' : 'text-green-400'}`}>
                      <Sparkles size={10} /> AI: {topAiRec.action}
                    </span>
                  )}
                  {pendingItems.length > 0 && (
                    <div className="flex gap-1">
                      <motion.button whileTap={{ scale: 0.95 }} onClick={() => pendingItems.forEach(it => handleAction(it.key, 'approved', it))}
                        className="px-2 py-1 rounded bg-green-500/10 text-green-400 text-[10px] font-semibold border border-green-500/20 hover:bg-green-500/20 transition-all">Approve</motion.button>
                      <motion.button whileTap={{ scale: 0.95 }} onClick={() => pendingItems.forEach(it => handleAction(it.key, 'revoked', it))}
                        className="px-2 py-1 rounded bg-red-500/10 text-red-400 text-[10px] font-semibold border border-red-500/20 hover:bg-red-500/20 transition-all">Revoke</motion.button>
                    </div>
                  )}
                  <button onClick={() => setDrawerUser(group.personId)}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white/5 text-slate-300 text-[10px] font-semibold border border-white/10 hover:bg-white/10 transition-all">
                    <Eye size={10} /> Details
                  </button>
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* Slide-out Drawer */}
      <AnimatePresence>
        {drawer && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm" onClick={() => setDrawerUser(null)} />
            <motion.div initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }} transition={{ type: 'spring', damping: 30, stiffness: 300 }}
              className="fixed right-0 top-0 bottom-0 w-full max-w-lg z-50 overflow-y-auto"
              style={{ background: 'rgba(5,6,13,0.98)', borderLeft: '1px solid rgba(227,25,55,0.2)' }}>
              <div className="p-6 space-y-5">
                {/* Drawer Header */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold"
                      style={{ background: 'rgba(227,25,55,0.15)', color: '#E31937', border: '1.5px solid rgba(227,25,55,0.3)' }}>
                      {(drawer.identity || '?')[0]}
                    </div>
                    <div>
                      <h2 className="text-lg font-bold text-white">{drawer.identity}</h2>
                      <p className="text-[11px] text-slate-500">{drawer.personId} | {drawer.department}</p>
                    </div>
                  </div>
                  <button onClick={() => setDrawerUser(null)} className="p-2 rounded-lg hover:bg-white/5 text-slate-500 hover:text-white transition-colors"><X size={18} /></button>
                </div>

                <div className="flex items-center gap-3">
                  <SeverityBadge severity={drawer.severity?.toLowerCase() || 'medium'} pulse />
                  <span className="text-sm font-mono text-red-400">Risk: {drawer.riskScore}</span>
                  <div className="flex gap-0.5">{[...new Set(drawer.items.map(i => i.platform))].map(p => <PlatformIcon key={p} platform={p} size="sm" />)}</div>
                  <button onClick={() => { setDrawerUser(null); navigate(`/admin/identities/${drawer.personId}`); }}
                    className="ml-auto flex items-center gap-1 px-3 py-1.5 rounded-lg bg-blue-500/10 text-blue-400 text-[10px] font-semibold border border-blue-500/20 hover:bg-blue-500/20 transition-all"><Globe size={10} /> Profile</button>
                </div>

                {/* Explain Risk */}
                <div className="rounded-lg p-4" style={{ background: 'rgba(239,68,68,0.04)', border: '1px solid rgba(239,68,68,0.12)' }}>
                  <p className="text-[10px] text-red-400 uppercase tracking-wider mb-2 font-semibold flex items-center gap-1.5"><AlertTriangle size={11} /> Why Flagged</p>
                  <div className="flex flex-wrap gap-1.5 mb-3">
                    {drawer.items[0]?.whyFlagged.map(r => (
                      <span key={r} className="text-[10px] px-2 py-0.5 rounded bg-yellow-500/10 text-yellow-400 border border-yellow-500/15">{r}</span>
                    ))}
                  </div>
                  <div className="space-y-2">
                    {explainRisk(drawer.identityData).map((line, i) => (
                      <p key={i} className="text-xs text-slate-300 leading-relaxed">{line}</p>
                    ))}
                  </div>
                </div>

                {/* AI + Risk Reduction */}
                <div className="rounded-lg p-4" style={{ background: 'rgba(16,185,129,0.04)', border: '1px solid rgba(16,185,129,0.12)' }}>
                  <p className="text-[10px] text-emerald-400 uppercase tracking-wider mb-2 font-semibold flex items-center gap-1.5"><Sparkles size={11} /> AI Recommendation</p>
                  {drawer.items.map(item => (
                    <div key={item.key} className="flex items-center gap-2 text-xs mb-1.5">
                      <PlatformIcon platform={item.platform} size="sm" />
                      <span className={`font-semibold ${item.aiRec.action === 'Revoke' ? 'text-red-400' : item.aiRec.action === 'Escalate' ? 'text-orange-400' : 'text-green-400'}`}>{item.aiRec.action}</span>
                      <span className="text-slate-500">— {item.aiRec.reason}</span>
                    </div>
                  ))}
                  <div className="mt-3 pt-3 border-t border-white/5">
                    <p className="text-[10px] text-slate-500 mb-1">Expected Risk Reduction (on full revocation)</p>
                    <div className="flex items-center gap-3">
                      <span className="text-lg font-black text-red-400">{drawer.riskScore}</span>
                      <span className="text-slate-600">→</span>
                      <span className="text-lg font-black text-emerald-400">{Math.max(0, Math.round(drawer.riskScore * 0.35))}</span>
                      <span className="text-xs text-emerald-400 font-semibold flex items-center gap-1"><TrendingDown size={10} /> -{Math.round(drawer.riskScore * 0.65)} pts</span>
                    </div>
                  </div>
                </div>

                {/* Privilege Breakdown */}
                <div className="grid grid-cols-3 gap-3">
                  <div className="rounded-lg p-3" style={{ background: 'rgba(239,68,68,0.04)', border: '1px solid rgba(239,68,68,0.1)' }}>
                    <div className="flex items-center gap-1.5 mb-1"><div className="w-2 h-2 rounded-full bg-red-400" /><span className="text-[10px] text-slate-400 uppercase">Direct</span></div>
                    <p className="text-xl font-bold text-red-400">{drawer.items.filter(i => i.isHighRisk).length}</p>
                  </div>
                  <div className="rounded-lg p-3" style={{ background: 'rgba(59,130,246,0.04)', border: '1px solid rgba(59,130,246,0.1)' }}>
                    <div className="flex items-center gap-1.5 mb-1"><div className="w-2 h-2 rounded-full bg-blue-400" /><span className="text-[10px] text-slate-400 uppercase">Inherited</span></div>
                    <p className="text-xl font-bold text-blue-400">{drawer.items.filter(i => !i.isHighRisk).length}</p>
                  </div>
                  <div className="rounded-lg p-3" style={{ background: 'rgba(168,85,247,0.04)', border: '1px solid rgba(168,85,247,0.1)' }}>
                    <div className="flex items-center gap-1.5 mb-1"><div className="w-2 h-2 rounded-full bg-purple-400" /><span className="text-[10px] text-slate-400 uppercase">Effective</span></div>
                    <p className="text-xl font-bold text-purple-400">{drawer.items.length}</p>
                  </div>
                </div>

                {/* Per-platform Items with Actions */}
                <div className="space-y-2">
                  <p className="text-[10px] text-slate-500 uppercase tracking-wider">Platform Privileges</p>
                  {drawer.items.map(item => {
                    const stCfg = STATUS_STYLES[item.status]; const StIcon = stCfg.icon; const result = actionResults[item.key];
                    return (
                      <div key={item.key} className="rounded-lg px-4 py-3" style={{ background: item.isHighRisk ? 'rgba(239,68,68,0.04)' : 'rgba(255,255,255,0.02)', border: `1px solid ${item.isHighRisk ? 'rgba(239,68,68,0.12)' : 'rgba(255,255,255,0.05)'}` }}>
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center gap-2">
                            <PlatformIcon platform={item.platform} size="sm" />
                            <span className="text-sm text-white font-medium">{item.role}</span>
                            {item.isHighRisk && <span className="text-[9px] px-1.5 py-0.5 rounded bg-red-500/15 text-red-400 font-bold">HIGH RISK</span>}
                            <span className={`flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full ${stCfg.bg} ${stCfg.color}`}><StIcon size={10} /> {stCfg.label}</span>
                          </div>
                          {result && <span className="text-[10px] font-mono text-emerald-400">{result.beforeScore} → {result.afterScore}</span>}
                        </div>
                        {item.status === 'pending' && (
                          <div className="flex gap-1.5 mt-2">
                            <motion.button whileTap={{ scale: 0.95 }} onClick={() => handleAction(item.key, 'approved', item)} className="px-2.5 py-1 rounded bg-green-500/10 text-green-400 text-[10px] font-semibold border border-green-500/20 hover:bg-green-500/20 transition-all">Approve</motion.button>
                            <motion.button whileTap={{ scale: 0.95 }} onClick={() => handleAction(item.key, 'revoked', item)} className="px-2.5 py-1 rounded bg-red-500/10 text-red-400 text-[10px] font-semibold border border-red-500/20 hover:bg-red-500/20 transition-all">Revoke</motion.button>
                            <motion.button whileTap={{ scale: 0.95 }} onClick={() => handleAction(item.key, 'escalated', item)} className="px-2.5 py-1 rounded bg-orange-500/10 text-orange-400 text-[10px] font-semibold border border-orange-500/20 hover:bg-orange-500/20 transition-all">Escalate</motion.button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Compliance */}
                <div className="rounded-lg p-3" style={{ background: 'rgba(59,130,246,0.04)', border: '1px solid rgba(59,130,246,0.1)' }}>
                  <p className="text-[10px] text-blue-400 uppercase tracking-wider mb-1 font-semibold">Compliance Impact</p>
                  <p className="text-xs text-slate-400">
                    {drawer.identityData?.is_admin ? 'NIST AC-6 (Least Privilege), CIS 6. ' : ''}
                    {!drawer.identityData?.mfa_complete ? 'NIST IA-4 (MFA gap). ' : ''}
                    {drawer.identityData?.status === 'Orphaned' ? 'NIST AC-2, MITRE T1078. ' : ''}
                    Revoking would improve compliance by ~{drawer.items.filter(i => i.isHighRisk).length * 3}%.
                  </p>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Employee Requests */}
      {pendingRequests.length > 0 && (
        <GlassCard hover={false} className="border-blue-500/20">
          <h3 className="text-sm font-semibold text-blue-400 mb-3 flex items-center gap-2"><Key size={14} /> Employee Access Requests ({pendingRequests.length})</h3>
          <div className="space-y-2">
            {pendingRequests.map((req, i) => (
              <div key={req.id} className="flex items-center gap-4 px-4 py-2.5 rounded-lg" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(59,130,246,0.12)' }}>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2"><span className="text-sm text-white font-medium">{req.employeeName}</span><span className="text-[10px] text-slate-500">→</span><span className="text-sm text-blue-400">{req.role}</span><PlatformIcon platform={req.platform} size="sm" /></div>
                  <p className="text-[10px] text-slate-500 mt-0.5">{req.durationDays}d | {req.justification}</p>
                </div>
                <div className="flex gap-1.5 shrink-0">
                  <motion.button whileTap={{ scale: 0.95 }} onClick={() => handleRequestAction(req.id, 'approved')} className="px-2.5 py-1 rounded bg-green-500/10 text-green-400 text-[10px] font-semibold border border-green-500/20 hover:bg-green-500/20">Approve</motion.button>
                  <motion.button whileTap={{ scale: 0.95 }} onClick={() => handleRequestAction(req.id, 'rejected')} className="px-2.5 py-1 rounded bg-red-500/10 text-red-400 text-[10px] font-semibold border border-red-500/20 hover:bg-red-500/20">Reject</motion.button>
                </div>
              </div>
            ))}
          </div>
        </GlassCard>
      )}

      {/* History */}
      {reviewHistory.length > 0 && (
        <GlassCard hover={false} delay={0.1}>
          <h3 className="text-sm font-semibold text-slate-300 mb-3 flex items-center gap-2"><FileText size={14} className="text-red-400" /> Review History</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-[11px] text-slate-500 uppercase tracking-wider border-b border-white/6">
                <th className="text-left pb-2 font-medium">Time</th><th className="text-left pb-2 font-medium">Identity</th>
                <th className="text-left pb-2 font-medium">Platform</th><th className="text-left pb-2 font-medium">Role</th>
                <th className="text-left pb-2 font-medium">Action</th><th className="text-left pb-2 font-medium">Impact</th>
              </tr></thead>
              <tbody>
                {reviewHistory.slice(0, 15).map((h, i) => {
                  const ac = STATUS_STYLES[h.action] || STATUS_STYLES.pending;
                  return (
                    <tr key={h.id} className="border-b border-white/3">
                      <td className="py-1.5 text-[11px] text-slate-500">{new Date(h.timestamp).toLocaleString()}</td>
                      <td className="py-1.5 text-white text-xs">{h.identity}</td>
                      <td className="py-1.5"><PlatformIcon platform={h.platform} size="sm" /></td>
                      <td className="py-1.5 text-slate-400 text-xs">{h.role}</td>
                      <td className="py-1.5"><span className={`text-[10px] px-2 py-0.5 rounded-full ${ac.bg} ${ac.color} font-semibold`}>{ac.label}</span></td>
                      <td className="py-1.5 text-xs font-mono">{h.riskBefore != null ? <span className="text-emerald-400">{h.riskBefore}→{h.riskAfter}</span> : <span className="text-slate-600">—</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </GlassCard>
      )}
    </motion.div>
  );
}
