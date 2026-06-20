import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  AlertTriangle, Shield, Eye, X, Target, Key, Activity, Sparkles,
  ChevronDown, ChevronUp, Globe, TrendingDown, Layers, FileText,
} from 'lucide-react';
import GlassCard from '../../components/shared/GlassCard';
import SeverityBadge from '../../components/shared/SeverityBadge';
import PlatformIcon from '../../components/shared/PlatformIcon';
import AnimatedCounter from '../../components/shared/AnimatedCounter';
import { getIdentities, getRiskEvents, getLifecycleEvents } from '../../services/storageService';
import { useScenario } from '../../context/ScenarioContext';


const PLATFORM_LABELS = { active_directory: 'Active Directory', aws_iam: 'AWS IAM', okta: 'Okta', salesforce: 'Salesforce' };

const ROOT_CAUSES = {
  cross_platform_admin: 'Admin privileges granted on multiple platforms without justification or periodic review',
  mfa_disabled: 'MFA enforcement policy not applied or user bypassed enrollment',
  privilege_escalation: 'Role assigned outside approved change window or without manager approval',
  sod_violation: 'Toxic privilege combination across platforms violates separation of duties',
  offboarding_gap: 'HR termination not propagated to all platform account provisioning systems',
  stale_account: 'No automated account recertification — dormant access persists beyond policy threshold',
  token_abuse: 'API token/PAT exceeds rotation policy age with anomalous usage pattern',
  orphaned_account: 'Employee terminated in HR system but platform accounts remain active',
  over_privileged: 'Privilege accumulation over time without periodic access review',
};

const IMPACTS = {
  cross_platform_admin: 'Single credential compromise enables lateral movement across entire infrastructure',
  mfa_disabled: 'Account vulnerable to credential stuffing, brute force, and phishing attacks',
  privilege_escalation: 'Unauthorized admin access enables data exfiltration and configuration tampering',
  sod_violation: 'Conflicting roles enable fraud, unauthorized changes, and audit failures',
  offboarding_gap: 'Former employee retains access to sensitive corporate data and systems',
  stale_account: 'Dormant credentials can be exploited without triggering behavioral alerts',
  token_abuse: 'Compromised token enables automated data extraction at scale',
  orphaned_account: 'Unmonitored active account provides persistent unauthorized access',
  over_privileged: 'Excessive permissions expand blast radius of any credential compromise',
};

const ACTIONS = {
  cross_platform_admin: 'Implement JIT access; remove standing admin on non-essential platforms',
  mfa_disabled: 'Enforce MFA enrollment immediately; block access until MFA is active',
  privilege_escalation: 'Revoke unauthorized role; investigate who granted access; audit changes made',
  sod_violation: 'Separate conflicting roles across different identities; add compensating controls',
  offboarding_gap: 'Disable all platform accounts immediately; audit access logs since termination',
  stale_account: 'Verify account necessity with manager; disable if not justified within 48 hours',
  token_abuse: 'Rotate token immediately; enforce 90-day rotation policy; review API logs',
  orphaned_account: 'Disable all accounts; revoke tokens; archive data; update offboarding automation',
  over_privileged: 'Conduct access review; remove unnecessary permissions; enforce least privilege',
};

function computeReduction(type, score) {
  const pcts = { cross_platform_admin: 0.4, mfa_disabled: 0.15, privilege_escalation: 0.35, sod_violation: 0.3, offboarding_gap: 1.0, stale_account: 0.8, token_abuse: 0.25, orphaned_account: 1.0, over_privileged: 0.3 };
  const reduction = Math.round(score * (pcts[type] || 0.2));
  return { before: score, after: Math.max(0, score - reduction), reduction };
}

export default function Risks() {
  const navigate = useNavigate();
  const [filter, setFilter] = useState('all');
  const [expandedId, setExpandedId] = useState(null);
  const { scenarios } = useScenario();

  const identities = useMemo(() => getIdentities(), []);
  const lifecycleEvents = useMemo(() => getLifecycleEvents(), []);

  const findings = useMemo(() => {
    const storedRisks = getRiskEvents();
    const simRisks = scenarios.filter(s => s.status !== 'resolved').map(s => ({
      id: s.id, identity: s.identity, identityId: s.personId || s.id, department: s.department,
      type: s.type, severity: s.severity, score: s.score, platforms: s.platforms,
      title: s.title, factors: {}, isSimulated: true,
    }));

    const seen = new Set();
    const deduped = [];
    [...simRisks, ...storedRisks].forEach(r => {
      const key = `${r.identityId}-${r.type}`;
      if (!seen.has(key)) { seen.add(key); deduped.push(r); }
    });

    return deduped.map(r => {
      const id = identities.find(i => i.person_id === r.identityId);
      const jmlEvent = lifecycleEvents.find(e => e.identity === r.identity);
      const est = computeReduction(r.type, r.score);
      return { ...r, identityData: id, jmlEvent, rootCause: ROOT_CAUSES[r.type] || 'Policy violation detected', impact: IMPACTS[r.type] || 'Potential unauthorized access', action: ACTIONS[r.type] || 'Investigate and remediate', riskReduction: est };
    }).sort((a, b) => b.score - a.score);
  }, [identities, scenarios, lifecycleEvents]);

  const filtered = filter === 'all' ? findings : findings.filter(r => r.severity === filter);

  const typeCounts = {};
  findings.forEach(r => { typeCounts[r.type] = (typeCounts[r.type] || 0) + 1; });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <AlertTriangle className="w-7 h-7 text-sg-red" /> Threat Detection Center
          </h1>
          <p className="text-sm text-slate-500 mt-1">{findings.length} findings across {Object.keys(typeCounts).length} risk types</p>
        </div>
        <div className="flex gap-2">
          {['all', 'critical', 'high', 'medium', 'low'].map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${filter === f ? 'bg-red-500/20 text-red-400 border border-red-500/30' : 'text-slate-400 hover:text-slate-300 hover:bg-white/5'}`}>
              {f === 'all' ? `All (${findings.length})` : `${f} (${findings.filter(r => r.severity === f).length})`}
            </button>
          ))}
        </div>
      </div>

      {/* Risk Type Summary */}
      <div className="flex flex-wrap gap-2">
        {Object.entries(typeCounts).sort(([,a],[,b]) => b - a).map(([type, count]) => (
          <div key={type} className="flex items-center gap-2 px-3 py-1.5 rounded-lg" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
            <span className="text-xs text-slate-400">{type.replace(/_/g, ' ')}</span>
            <span className="text-xs font-bold text-red-400">{count}</span>
          </div>
        ))}
      </div>

      <div className="space-y-3">
        {filtered.length === 0 && (
          <GlassCard hover={false}><div className="flex flex-col items-center gap-3 py-12"><Shield size={36} className="text-emerald-400" /><p className="text-sm text-slate-400">No findings match this filter</p></div></GlassCard>
        )}
        <AnimatePresence mode="popLayout">
          {filtered.map((r, i) => {
            const isExp = expandedId === r.id;
            const id = r.identityData;
            const red = r.riskReduction;
            return (
              <motion.div key={r.id} layout initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }} transition={{ delay: i * 0.02 }}>
                <GlassCard hover={false} className={`${r.isSimulated ? 'border-purple-500/20' : 'border-red-500/10'}`}>
                  {/* Main row */}
                  <div className="flex items-start gap-4 cursor-pointer" onClick={() => setExpandedId(isExp ? null : r.id)}>
                    <div className="flex flex-col items-center gap-1 pt-1 shrink-0">
                      <div className={`w-11 h-11 rounded-xl flex items-center justify-center text-lg font-black ${r.severity === 'critical' ? 'bg-red-500/15 text-red-400' : r.severity === 'high' ? 'bg-orange-500/15 text-orange-400' : 'bg-yellow-500/15 text-yellow-400'}`}>
                        {r.score.toFixed(0)}
                      </div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className="text-sm font-semibold text-white">{r.identity}</span>
                        <SeverityBadge severity={r.severity} pulse={r.severity === 'critical'} />
                        <span className="text-[10px] px-2 py-0.5 rounded bg-slate-500/10 text-slate-400 border border-slate-500/10 font-medium">{r.type.replace(/_/g, ' ')}</span>
                        {r.isSimulated && <span className="text-[9px] bg-purple-500/20 text-purple-400 px-2 py-0.5 rounded-full font-bold">SIM</span>}
                      </div>
                      <p className="text-sm text-slate-400 mb-2">{r.title}</p>
                      <div className="flex items-center gap-3 text-[11px] text-slate-500 mb-2">
                        <span>{r.department}</span>
                        <span className="text-white/10">|</span>
                        <div className="flex gap-1">{(r.platforms || []).map(p => <PlatformIcon key={p} platform={p} size="sm" />)}</div>
                        <span className="text-white/10">|</span>
                        <span className="text-emerald-400 font-semibold flex items-center gap-1"><TrendingDown size={10} /> -{red.reduction} pts if remediated</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {r.factors && Object.keys(r.factors).length > 0 && (
                        <div className="hidden xl:block text-[10px] text-slate-500 space-y-0.5 mr-2">
                          {Object.entries(r.factors).slice(0, 3).map(([k, v]) => (
                            <div key={k} className="flex justify-between gap-4"><span>{k.replace(/_/g, ' ')}</span><span className="font-mono text-slate-400">{typeof v === 'number' ? v.toFixed(1) : v}</span></div>
                          ))}
                        </div>
                      )}
                      <Eye size={14} className={`transition-colors ${isExp ? 'text-red-400' : 'text-slate-600'}`} />
                    </div>
                  </div>

                  {/* Expanded Detail */}
                  <AnimatePresence>
                    {isExp && (
                      <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                        className="mt-4 pt-4 border-t border-white/5 space-y-4">

                        {/* Root Cause / Impact / Action */}
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
                          <div className="rounded-lg p-3" style={{ background: 'rgba(239,68,68,0.04)', border: '1px solid rgba(239,68,68,0.1)' }}>
                            <p className="text-[10px] text-red-400 uppercase tracking-wider mb-1.5 font-semibold">Root Cause</p>
                            <p className="text-xs text-slate-300 leading-relaxed">{r.rootCause}</p>
                          </div>
                          <div className="rounded-lg p-3" style={{ background: 'rgba(249,115,22,0.04)', border: '1px solid rgba(249,115,22,0.1)' }}>
                            <p className="text-[10px] text-orange-400 uppercase tracking-wider mb-1.5 font-semibold">Potential Impact</p>
                            <p className="text-xs text-slate-300 leading-relaxed">{r.impact}</p>
                          </div>
                          <div className="rounded-lg p-3" style={{ background: 'rgba(16,185,129,0.04)', border: '1px solid rgba(16,185,129,0.1)' }}>
                            <p className="text-[10px] text-emerald-400 uppercase tracking-wider mb-1.5 font-semibold">Recommended Action</p>
                            <p className="text-xs text-emerald-300 leading-relaxed">{r.action}</p>
                          </div>
                        </div>

                        {/* Risk Reduction + Identity + Navigation */}
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
                          <div className="rounded-lg p-3" style={{ background: 'rgba(16,185,129,0.05)', border: '1px solid rgba(16,185,129,0.12)' }}>
                            <p className="text-[10px] text-emerald-500 uppercase tracking-wider mb-1.5 font-semibold">Expected Risk Reduction</p>
                            <div className="flex items-center gap-3">
                              <div><p className="text-lg font-black text-red-400">{red.before}</p><p className="text-[9px] text-slate-500">Current</p></div>
                              <span className="text-slate-600">→</span>
                              <div><p className="text-lg font-black text-emerald-400">{red.after}</p><p className="text-[9px] text-slate-500">After Fix</p></div>
                              <div className="ml-auto"><p className="text-lg font-black text-emerald-400">-{red.reduction}</p><p className="text-[9px] text-slate-500">Reduction</p></div>
                            </div>
                          </div>

                          {id && (
                            <div className="rounded-lg p-3" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
                              <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1.5">Identity Details</p>
                              <div className="space-y-1 text-xs text-slate-400">
                                <div className="flex justify-between"><span>Status</span><span className="text-white">{id.status}</span></div>
                                <div className="flex justify-between"><span>Admin</span><span className={id.is_admin ? 'text-red-400 font-bold' : 'text-slate-500'}>{id.is_admin ? 'Yes' : 'No'}</span></div>
                                <div className="flex justify-between"><span>MFA</span><span className={id.mfa_complete ? 'text-emerald-400' : 'text-red-400'}>{id.mfa_complete ? 'Enabled' : 'Disabled'}</span></div>
                                <div className="flex justify-between"><span>Platforms</span><span className="text-white">{id.platforms?.length || 0}</span></div>
                              </div>
                            </div>
                          )}

                          <div className="rounded-lg p-3 flex flex-col gap-2" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
                            <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Investigate</p>
                            {r.identityId && (
                              <button onClick={() => navigate(`/admin/identities/${r.identityId}`)}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-500/10 text-blue-400 text-[10px] font-semibold border border-blue-500/20 hover:bg-blue-500/20 transition-all w-full">
                                <Globe size={10} /> Identity & Privileges
                              </button>
                            )}
                            <button onClick={() => navigate('/admin/attack-paths', { state: { personId: r.identityId } })}
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500/10 text-red-400 text-[10px] font-semibold border border-red-500/20 hover:bg-red-500/20 transition-all w-full">
                              <Activity size={10} /> Attack Path
                            </button>
                            <button onClick={() => navigate('/admin/blast-radius', { state: { personId: r.identityId } })}
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-orange-500/10 text-orange-400 text-[10px] font-semibold border border-orange-500/20 hover:bg-orange-500/20 transition-all w-full">
                              <Target size={10} /> Blast Radius
                            </button>
                          </div>
                        </div>

                        {/* Compliance + Lifecycle Link */}
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                          <div className="rounded-lg p-3" style={{ background: 'rgba(59,130,246,0.04)', border: '1px solid rgba(59,130,246,0.1)' }}>
                            <p className="text-[10px] text-blue-400 uppercase tracking-wider mb-1.5 font-semibold">Compliance Impact</p>
                            <div className="flex flex-wrap gap-1.5">
                              {(r.type.includes('admin') || r.type.includes('privilege') || r.type.includes('sod')) && <span className="text-[10px] px-2 py-0.5 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/15 font-mono">NIST AC-6</span>}
                              {(r.type.includes('orphan') || r.type.includes('offboard') || r.type.includes('stale')) && <span className="text-[10px] px-2 py-0.5 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/15 font-mono">NIST AC-2</span>}
                              {r.type.includes('mfa') && <span className="text-[10px] px-2 py-0.5 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/15 font-mono">NIST IA-4</span>}
                              {r.type.includes('token') && <span className="text-[10px] px-2 py-0.5 rounded bg-red-500/10 text-red-400 border border-red-500/15 font-mono">MITRE T1550</span>}
                              <span className="text-[10px] px-2 py-0.5 rounded bg-purple-500/10 text-purple-400 border border-purple-500/15 font-mono">CIS 5/6</span>
                              <span className="text-[10px] px-2 py-0.5 rounded bg-green-500/10 text-green-400 border border-green-500/15 font-mono">GDPR Art.32</span>
                            </div>
                          </div>

                          {r.jmlEvent && (
                            <div className="rounded-lg p-3" style={{ background: 'rgba(168,85,247,0.04)', border: '1px solid rgba(168,85,247,0.1)' }}>
                              <p className="text-[10px] text-purple-400 uppercase tracking-wider mb-1.5 font-semibold">Related Lifecycle Event</p>
                              <div className="flex items-center gap-2 text-xs text-slate-300">
                                <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${r.jmlEvent.type === 'joiner' ? 'bg-emerald-500/10 text-emerald-400' : r.jmlEvent.type === 'leaver' ? 'bg-red-500/10 text-red-400' : 'bg-blue-500/10 text-blue-400'}`}>
                                  {r.jmlEvent.type.toUpperCase()}
                                </span>
                                <span>{r.jmlEvent.identity}</span>
                                <span className="text-slate-500">|</span>
                                <span className="text-slate-500">{r.jmlEvent.date}</span>
                                <span className="text-slate-500">|</span>
                                <span className="text-slate-500">{r.jmlEvent.status}</span>
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Affected Platforms Detail */}
                        <div className="flex flex-wrap gap-2">
                          {(r.platforms || []).map(p => (
                            <div key={p} className="flex items-center gap-2 px-3 py-1.5 rounded-lg" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
                              <PlatformIcon platform={p} size="sm" />
                              <span className="text-xs text-slate-300">{PLATFORM_LABELS[p] || p}</span>
                              <span className="text-[9px] text-red-400 font-semibold">Affected</span>
                            </div>
                          ))}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </GlassCard>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </div>
  );
}
