import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ShieldCheck, AlertTriangle, CheckCircle, XCircle, FileText, Eye,
  ChevronRight, Activity, X, Search, Users, Target, Shield, Sparkles,
  TrendingDown, Key, ArrowRight,
} from 'lucide-react';
import GlassCard from '../../components/shared/GlassCard';
import AnimatedCounter from '../../components/shared/AnimatedCounter';
import SeverityBadge from '../../components/shared/SeverityBadge';
import PlatformIcon from '../../components/shared/PlatformIcon';
import { COMPLIANCE_MAP } from '../../data/mockData';
import { getIdentities, getRiskEvents } from '../../services/storageService';
import { usePlatformData } from '../../context/PlatformDataContext';

const FRAMEWORK_DATA = [
  {
    framework: 'NIST 800-53', color: '#00bcd4', score: 82,
    controls: [
      { id: 'AC-2', name: 'Account Management', status: 'partial', findings: 172, evidence: 'Orphaned accounts, offboarding gaps, stale accounts detected', recommendation: 'Automate account lifecycle management and enforce timely deprovisioning', gap: 'Accounts not disabled within 24h of termination', effort: 'Medium' },
      { id: 'AC-6', name: 'Least Privilege', status: 'fail', findings: 178, evidence: 'Over-privileged users, cross-platform admins, SoD violations', recommendation: 'Implement JIT access, periodic access reviews, and privilege reduction', gap: 'Excessive admin privileges across platforms', effort: 'High' },
      { id: 'IA-4', name: 'Identifier Management', status: 'partial', findings: 167, evidence: 'MFA gaps, stale tokens across platforms', recommendation: 'Enforce MFA on all accounts, implement token rotation policy', gap: 'MFA not enforced on all active accounts', effort: 'Low' },
    ],
  },
  {
    framework: 'CIS Controls v8', color: '#ff9800', score: 75,
    controls: [
      { id: 'Control 5', name: 'Account Management', status: 'partial', findings: 172, evidence: 'Account lifecycle gaps across AD, Okta, AWS, Salesforce', recommendation: 'Centralize identity governance with automated provisioning', gap: 'No centralized identity lifecycle automation', effort: 'High' },
      { id: 'Control 6', name: 'Access Control Management', status: 'fail', findings: 452, evidence: 'Excessive privileges, missing MFA, SoD violations, token abuse', recommendation: 'Deploy role-based access control with periodic certification', gap: 'No periodic access certification program', effort: 'High' },
    ],
  },
  {
    framework: 'ISO 27001:2022', color: '#9c27b0', score: 80,
    controls: [
      { id: 'A.5.15', name: 'Access Control', status: 'partial', findings: 178, evidence: 'Over-privileged accounts and lack of regular access reviews', recommendation: 'Establish quarterly access review campaigns', gap: 'No quarterly access review process', effort: 'Medium' },
      { id: 'A.5.16', name: 'Identity Management', status: 'partial', findings: 60, evidence: 'Orphaned accounts across multiple platforms', recommendation: 'Implement automated identity lifecycle management', gap: 'Orphaned accounts not auto-detected', effort: 'Medium' },
      { id: 'A.5.17', name: 'Authentication Information', status: 'fail', findings: 167, evidence: 'MFA gaps and stale credentials', recommendation: 'Enforce MFA and credential rotation policies', gap: 'No enforced credential rotation policy', effort: 'Low' },
      { id: 'A.8.2', name: 'Privileged Access Rights', status: 'fail', findings: 119, evidence: 'Cross-platform admin sprawl without justification', recommendation: 'Implement privileged access management (PAM)', gap: 'No PAM solution deployed', effort: 'High' },
    ],
  },
  {
    framework: 'GDPR', color: '#4caf50', score: 70,
    controls: [
      { id: 'Art. 5', name: 'Data Processing Principles', status: 'partial', findings: 199, evidence: 'Orphaned accounts with access to personal data, SoD violations', recommendation: 'Ensure data minimization through regular access reviews', gap: 'Data access not minimized per role', effort: 'Medium' },
      { id: 'Art. 32', name: 'Security of Processing', status: 'fail', findings: 306, evidence: 'MFA gaps, token abuse, privilege escalation, offboarding failures', recommendation: 'Implement comprehensive security controls for data processing', gap: 'Multiple security control gaps identified', effort: 'High' },
    ],
  },
];

const STATUS_STYLES = {
  pass: { label: 'PASS', color: 'text-green-400', bg: 'bg-green-500/10', border: 'border-green-500/30', icon: CheckCircle },
  partial: { label: 'PARTIAL', color: 'text-yellow-400', bg: 'bg-yellow-500/10', border: 'border-yellow-500/30', icon: AlertTriangle },
  fail: { label: 'FAIL', color: 'text-red-400', bg: 'bg-red-500/10', border: 'border-red-500/30', icon: XCircle },
};

const EFFORT_COLORS = { Low: 'text-green-400', Medium: 'text-yellow-400', High: 'text-red-400' };

const allControls = FRAMEWORK_DATA.flatMap(f => f.controls.map(c => ({ ...c, framework: f.framework, frameworkColor: f.color })));

export default function Compliance() {
  const [selectedFramework, setSelectedFramework] = useState(null);
  const [expandedControl, setExpandedControl] = useState(null);
  const [activePanel, setActivePanel] = useState(null);
  const [controlDetail, setControlDetail] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');

  const { data } = usePlatformData();
  const identities = useMemo(() => getIdentities(), [data]);
  const risks = useMemo(() => getRiskEvents(), [data]);
  const liveCompliance = data?.compliance_mapping || [];
  const capabilityRows = liveCompliance.length ? liveCompliance : [];

  const totalControls = allControls.length;
  const passControls = allControls.filter(c => c.status === 'pass').length;
  const partialControls = allControls.filter(c => c.status === 'partial').length;
  const failControls = allControls.filter(c => c.status === 'fail').length;
  const overallScore = Math.round(FRAMEWORK_DATA.reduce((a, f) => a + f.score, 0) / FRAMEWORK_DATA.length);

  const adminUsers = identities.filter(i => i.is_admin);
  const mfaGapUsers = identities.filter(i => !i.mfa_complete && i.status === 'Active');
  const orphanedUsers = identities.filter(i => i.status === 'Orphaned');
  const dormantUsers = identities.filter(i => i.status === 'Dormant' || (i.max_dormancy_days || 0) > 90);

  const frameworks = selectedFramework
    ? FRAMEWORK_DATA.filter(f => f.framework === selectedFramework)
    : FRAMEWORK_DATA;

  const filteredControls = useMemo(() => {
    let list = allControls;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(c => c.id.toLowerCase().includes(q) || c.name.toLowerCase().includes(q) || c.framework.toLowerCase().includes(q));
    }
    return list;
  }, [searchQuery]);

  const violatingUsersForControl = (control) => {
    if (control.name.includes('Privilege') || control.name.includes('Access Control') || control.id === 'AC-6') return adminUsers.slice(0, 5);
    if (control.name.includes('Authentication') || control.name.includes('MFA') || control.id === 'IA-4') return mfaGapUsers.slice(0, 5);
    if (control.name.includes('Account Management') || control.id === 'AC-2') return [...orphanedUsers, ...dormantUsers].slice(0, 5);
    if (control.name.includes('Identity')) return orphanedUsers.slice(0, 5);
    return identities.filter(i => i.risk_score > 50).slice(0, 5);
  };

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-3">
          <ShieldCheck className="w-7 h-7 text-sg-red" />
          Compliance Center
        </h1>
        <p className="text-slate-400 text-sm mt-1">Continuous compliance monitoring across NIST, CIS, ISO 27001, and GDPR</p>
      </div>

      {/* Clickable Stats Row */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {[
          { key: 'score', label: 'Overall Score', value: overallScore, suffix: '%', color: 'text-emerald-400', activeColor: 'border-emerald-500/40', icon: ShieldCheck },
          { key: 'total', label: 'Total Controls', value: totalControls, color: 'text-white', activeColor: 'border-white/30', icon: Shield },
          { key: 'passing', label: 'Passing', value: passControls, color: 'text-green-400', activeColor: 'border-green-500/40', icon: CheckCircle },
          { key: 'partial', label: 'Partial', value: partialControls, color: 'text-yellow-400', activeColor: 'border-yellow-500/40', icon: AlertTriangle },
          { key: 'failing', label: 'Failing', value: failControls, color: 'text-red-400', activeColor: 'border-red-500/40', icon: XCircle },
        ].map((s, i) => (
          <motion.div key={s.key} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: i * 0.05 }}
            whileHover={{ scale: 1.03, y: -2 }} whileTap={{ scale: 0.97 }}
            onClick={() => setActivePanel(activePanel === s.key ? null : s.key)}
            className={`cursor-pointer rounded-2xl p-6 transition-all duration-300 ${activePanel === s.key ? `${s.activeColor} border` : ''}`}
            style={{
              background: activePanel === s.key ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.04)',
              border: activePanel === s.key ? undefined : '1px solid rgba(227,25,55,0.18)',
              backdropFilter: 'blur(12px)',
              ...(activePanel === s.key ? { boxShadow: '0 0 20px rgba(227,25,55,0.12)' } : {}),
            }}>
            <div className="p-2 text-center">
              <s.icon className={`w-5 h-5 ${s.color} mx-auto mb-2 ${activePanel === s.key ? 'opacity-100' : 'opacity-50'}`} />
              <AnimatedCounter value={s.value} suffix={s.suffix || ''} className={`text-3xl font-bold ${s.color}`} />
              <p className={`text-[10px] uppercase tracking-wider mt-1 ${activePanel === s.key ? 'text-slate-300' : 'text-slate-500'}`}>{s.label}</p>
            </div>
          </motion.div>
        ))}
      </div>

      {capabilityRows.length > 0 && (
        <GlassCard hover={false} delay={0.1}>
          <h3 className="text-sm font-semibold text-white mb-3">Live Pipeline Compliance Evidence</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-slate-500 border-b border-white/5">
                  <th className="text-left py-2">Capability</th>
                  <th className="text-left py-2">NIST</th>
                  <th className="text-left py-2">MITRE</th>
                  <th className="text-right py-2">Findings</th>
                </tr>
              </thead>
              <tbody>
                {capabilityRows.map((row) => (
                  <tr key={row.capability} className="border-b border-white/[0.03]">
                    <td className="py-2 text-slate-300">{row.capability}</td>
                    <td className="py-2 text-cyan-400">{row.nist_800_53}</td>
                    <td className="py-2 text-orange-400">{row.mitre_attack}</td>
                    <td className="py-2 text-right font-mono text-white">{row.findings_count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </GlassCard>
      )}

      {/* Drill-Down Panels */}
      <AnimatePresence mode="wait">
        {activePanel === 'score' && (
          <motion.div key="score" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
            <GlassCard hover={false} glow="red">
              <div className="flex items-center justify-between mb-5">
                <h3 className="text-sm font-semibold text-white flex items-center gap-2"><ShieldCheck size={16} className="text-emerald-400" /> Compliance Score Breakdown</h3>
                <button onClick={() => setActivePanel(null)} className="p-1 rounded-lg hover:bg-white/5 text-slate-500 hover:text-white"><X size={14} /></button>
              </div>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                {FRAMEWORK_DATA.map(f => (
                  <div key={f.framework} className="rounded-xl p-4" style={{ background: 'rgba(255,255,255,0.03)', border: `1px solid ${f.color}30` }}>
                    <div className="flex items-center gap-2 mb-3">
                      <div className="w-2.5 h-2.5 rounded-full" style={{ background: f.color }} />
                      <span className="text-xs text-slate-300 font-medium">{f.framework}</span>
                    </div>
                    <p className="text-2xl font-black" style={{ color: f.color }}>{f.score}%</p>
                    <div className="w-full h-1.5 rounded-full mt-2 overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
                      <motion.div className="h-full rounded-full" initial={{ width: 0 }} animate={{ width: `${f.score}%` }}
                        transition={{ duration: 1, delay: 0.3 }} style={{ background: f.color }} />
                    </div>
                    <p className="text-[10px] text-slate-500 mt-2">{f.controls.filter(c => c.status === 'pass').length}/{f.controls.length} controls passing</p>
                  </div>
                ))}
              </div>
              <div>
                <p className="text-xs text-slate-500 uppercase tracking-wider mb-3">Top Failing Controls Affecting Score</p>
                <div className="space-y-2">
                  {allControls.filter(c => c.status === 'fail').slice(0, 4).map(c => (
                    <div key={`${c.framework}-${c.id}`} className="flex items-center gap-3 px-3 py-2 rounded-lg" style={{ background: 'rgba(239,68,68,0.05)', border: '1px solid rgba(239,68,68,0.12)' }}>
                      <XCircle size={14} className="text-red-400 shrink-0" />
                      <span className="text-xs text-white font-medium flex-1">{c.name}</span>
                      <span className="text-[10px] font-mono" style={{ color: c.frameworkColor }}>{c.id}</span>
                      <span className="text-[10px] text-slate-500">{c.framework}</span>
                    </div>
                  ))}
                </div>
              </div>
            </GlassCard>
          </motion.div>
        )}

        {activePanel === 'total' && (
          <motion.div key="total" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
            <GlassCard hover={false}>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-white flex items-center gap-2"><Shield size={16} className="text-red-400" /> All Controls</h3>
                <div className="flex items-center gap-2">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
                    <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Search controls..."
                      className="pl-8 pr-3 py-1.5 bg-white/5 border border-white/10 rounded-lg text-xs text-white placeholder-slate-500 outline-none focus:border-red-500/50 w-48" />
                  </div>
                  <button onClick={() => setActivePanel(null)} className="p-1 rounded-lg hover:bg-white/5 text-slate-500 hover:text-white"><X size={14} /></button>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="text-[11px] text-slate-500 uppercase border-b border-white/5">
                    <th className="text-left pb-3 font-medium">Control ID</th><th className="text-left pb-3 font-medium">Name</th>
                    <th className="text-left pb-3 font-medium">Framework</th><th className="text-left pb-3 font-medium">Status</th>
                    <th className="text-right pb-3 font-medium">Findings</th><th className="text-left pb-3 font-medium">Effort</th>
                  </tr></thead>
                  <tbody>
                    {filteredControls.map((c, i) => {
                      const stCfg = STATUS_STYLES[c.status];
                      return (
                        <motion.tr key={`${c.framework}-${c.id}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.02 }}
                          className="border-b border-white/3 hover:bg-white/[0.02] cursor-pointer" onClick={() => { setControlDetail(c); setActivePanel('control-detail'); }}>
                          <td className="py-2.5 font-mono text-xs" style={{ color: c.frameworkColor }}>{c.id}</td>
                          <td className="py-2.5 text-white font-medium">{c.name}</td>
                          <td className="py-2.5 text-slate-400 text-xs">{c.framework}</td>
                          <td className="py-2.5"><span className={`flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full ${stCfg.bg} ${stCfg.color} border ${stCfg.border} font-semibold w-fit`}><stCfg.icon size={10} />{stCfg.label}</span></td>
                          <td className="py-2.5 text-right font-mono text-white">{c.findings}</td>
                          <td className={`py-2.5 text-xs font-semibold ${EFFORT_COLORS[c.effort] || 'text-slate-400'}`}>{c.effort}</td>
                        </motion.tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </GlassCard>
          </motion.div>
        )}

        {activePanel === 'passing' && (
          <motion.div key="passing" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
            <GlassCard hover={false} className="border-green-500/20">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-green-400 flex items-center gap-2"><CheckCircle size={16} /> Passing Controls</h3>
                <button onClick={() => setActivePanel(null)} className="p-1 rounded-lg hover:bg-white/5 text-slate-500 hover:text-white"><X size={14} /></button>
              </div>
              {passControls === 0 ? (
                <div className="flex flex-col items-center gap-3 py-12">
                  <AlertTriangle size={36} className="text-yellow-400" />
                  <p className="text-sm text-slate-400">No controls are fully compliant yet</p>
                  <p className="text-xs text-slate-500">Address partial and failing controls to achieve compliance</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {allControls.filter(c => c.status === 'pass').map(c => (
                    <div key={`${c.framework}-${c.id}`} className="flex items-center justify-between px-4 py-3 rounded-lg" style={{ background: 'rgba(34,197,94,0.05)', border: '1px solid rgba(34,197,94,0.12)' }}>
                      <div className="flex items-center gap-3"><CheckCircle size={14} className="text-green-400" /><span className="text-sm text-white">{c.name}</span><span className="text-[10px] font-mono" style={{ color: c.frameworkColor }}>{c.id}</span></div>
                      <span className="text-[10px] text-slate-500">{c.framework}</span>
                    </div>
                  ))}
                </div>
              )}
            </GlassCard>
          </motion.div>
        )}

        {activePanel === 'partial' && (
          <motion.div key="partial" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
            <GlassCard hover={false} className="border-yellow-500/20">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-yellow-400 flex items-center gap-2"><AlertTriangle size={16} /> Partially Compliant Controls</h3>
                <button onClick={() => setActivePanel(null)} className="p-1 rounded-lg hover:bg-white/5 text-slate-500 hover:text-white"><X size={14} /></button>
              </div>
              <div className="space-y-3">
                {allControls.filter(c => c.status === 'partial').map((c, i) => (
                  <motion.div key={`${c.framework}-${c.id}`} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
                    className="rounded-xl p-4 cursor-pointer hover:bg-white/[0.02] transition-colors"
                    style={{ background: 'rgba(234,179,8,0.04)', border: '1px solid rgba(234,179,8,0.12)' }}
                    onClick={() => { setControlDetail(c); setActivePanel('control-detail'); }}>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-bold" style={{ color: c.frameworkColor }}>{c.id}</span>
                        <span className="text-sm text-white font-medium">{c.name}</span>
                      </div>
                      <span className={`text-xs font-semibold ${EFFORT_COLORS[c.effort]}`}>Effort: {c.effort}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-4 mt-3">
                      <div>
                        <p className="text-[10px] text-slate-500 uppercase mb-1">Compliance Gap</p>
                        <p className="text-xs text-yellow-300">{c.gap}</p>
                      </div>
                      <div>
                        <p className="text-[10px] text-slate-500 uppercase mb-1">Recommendation</p>
                        <p className="text-xs text-emerald-400">{c.recommendation}</p>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            </GlassCard>
          </motion.div>
        )}

        {activePanel === 'failing' && (
          <motion.div key="failing" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
            <GlassCard hover={false} className="border-red-500/20">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-red-400 flex items-center gap-2"><XCircle size={16} /> Failing Controls — Highest Priority</h3>
                <button onClick={() => setActivePanel(null)} className="p-1 rounded-lg hover:bg-white/5 text-slate-500 hover:text-white"><X size={14} /></button>
              </div>
              <div className="space-y-4">
                {allControls.filter(c => c.status === 'fail').map((c, i) => {
                  const violators = violatingUsersForControl(c);
                  return (
                    <motion.div key={`${c.framework}-${c.id}`} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }}
                      className="rounded-xl p-4 cursor-pointer hover:bg-white/[0.02] transition-colors"
                      style={{ background: 'rgba(239,68,68,0.04)', border: '1px solid rgba(239,68,68,0.15)' }}
                      onClick={() => { setControlDetail(c); setActivePanel('control-detail'); }}>
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <XCircle size={14} className="text-red-400" />
                          <span className="font-mono text-xs font-bold" style={{ color: c.frameworkColor }}>{c.id}</span>
                          <span className="text-sm text-white font-medium">{c.name}</span>
                        </div>
                        <span className="text-[10px] text-slate-500">{c.framework} | {c.findings} findings</span>
                      </div>
                      <div className="grid grid-cols-3 gap-4">
                        <div>
                          <p className="text-[10px] text-slate-500 uppercase mb-1.5">Violating Users</p>
                          <div className="space-y-1">
                            {violators.map(u => (
                              <div key={u.person_id} className="flex items-center gap-2">
                                <div className="w-5 h-5 rounded flex items-center justify-center text-[9px] font-bold" style={{ background: 'rgba(227,25,55,0.15)', color: '#E31937' }}>{(u.display_name || '?')[0]}</div>
                                <span className="text-xs text-slate-300">{u.display_name}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                        <div>
                          <p className="text-[10px] text-slate-500 uppercase mb-1.5">Risk Impact</p>
                          <p className="text-xs text-red-400 font-medium">{c.gap}</p>
                          <p className="text-[10px] text-slate-500 mt-1">Effort: <span className={EFFORT_COLORS[c.effort]}>{c.effort}</span></p>
                        </div>
                        <div>
                          <p className="text-[10px] text-slate-500 uppercase mb-1.5">Remediation</p>
                          <p className="text-xs text-emerald-400">{c.recommendation}</p>
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </GlassCard>
          </motion.div>
        )}

        {activePanel === 'control-detail' && controlDetail && (
          <motion.div key="control-detail" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
            <GlassCard hover={false} glow="red">
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-3">
                  <button onClick={() => setActivePanel(null)} className="p-1.5 rounded-lg hover:bg-white/5 text-slate-400 hover:text-white"><ArrowRight size={14} className="rotate-180" /></button>
                  <span className="font-mono text-sm font-bold" style={{ color: controlDetail.frameworkColor }}>{controlDetail.id}</span>
                  <span className="text-lg text-white font-semibold">{controlDetail.name}</span>
                  {(() => { const sc = STATUS_STYLES[controlDetail.status]; return <span className={`flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full ${sc.bg} ${sc.color} border ${sc.border} font-semibold`}><sc.icon size={10} />{sc.label}</span>; })()}
                </div>
                <button onClick={() => { setActivePanel(null); setControlDetail(null); }} className="p-1 rounded-lg hover:bg-white/5 text-slate-500 hover:text-white"><X size={14} /></button>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div className="rounded-lg p-4" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
                    <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-2">Compliance Mapping</p>
                    <div className="grid grid-cols-2 gap-3 text-xs">
                      <div><span className="text-slate-500">Framework:</span> <span className="text-white ml-1">{controlDetail.framework}</span></div>
                      <div><span className="text-slate-500">Findings:</span> <span className="text-red-400 font-mono ml-1">{controlDetail.findings}</span></div>
                      <div><span className="text-slate-500">Fix Effort:</span> <span className={`ml-1 ${EFFORT_COLORS[controlDetail.effort]}`}>{controlDetail.effort}</span></div>
                      <div><span className="text-slate-500">Gap:</span> <span className="text-yellow-400 ml-1">{controlDetail.gap}</span></div>
                    </div>
                  </div>
                  <div className="rounded-lg p-4" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
                    <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-2">Evidence</p>
                    <p className="text-xs text-slate-300">{controlDetail.evidence}</p>
                  </div>
                  <div className="rounded-lg p-4" style={{ background: 'rgba(16,185,129,0.05)', border: '1px solid rgba(16,185,129,0.15)' }}>
                    <p className="text-[10px] text-emerald-500 uppercase tracking-wider mb-2">AI Recommendation</p>
                    <p className="text-xs text-emerald-400">{controlDetail.recommendation}</p>
                  </div>
                </div>

                <div>
                  <div className="rounded-lg p-4" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
                    <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-3">Affected Identities</p>
                    <div className="space-y-2">
                      {violatingUsersForControl(controlDetail).map(u => (
                        <div key={u.person_id} className="flex items-center justify-between px-3 py-2 rounded-lg hover:bg-white/[0.03] transition-colors"
                          style={{ background: 'rgba(255,255,255,0.01)', border: '1px solid rgba(255,255,255,0.04)' }}>
                          <div className="flex items-center gap-3">
                            <div className="w-7 h-7 rounded-lg flex items-center justify-center text-[10px] font-bold"
                              style={{ background: 'rgba(227,25,55,0.12)', color: '#E31937' }}>{(u.display_name || '?')[0]}</div>
                            <div>
                              <p className="text-xs text-white font-medium">{u.display_name}</p>
                              <p className="text-[10px] text-slate-500">{u.department} | {u.person_id}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            <div className="flex gap-0.5">{(u.platforms || []).slice(0, 3).map(p => <PlatformIcon key={p} platform={p} size="sm" />)}</div>
                            <span className="text-xs font-mono text-red-400">{u.risk_score}</span>
                            {u.severity && <SeverityBadge severity={u.severity.toLowerCase()} />}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </GlassCard>
          </motion.div>
        )}
      </AnimatePresence>

      {/* AI Compliance Insights */}
      <GlassCard hover={false} delay={0.1}>
        <h3 className="text-sm font-semibold text-slate-300 mb-4 flex items-center gap-2">
          <Sparkles size={14} className="text-red-400" /> AI Compliance Insights
        </h3>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="rounded-lg p-4" style={{ background: 'rgba(227,25,55,0.04)', border: '1px solid rgba(227,25,55,0.12)' }}>
            <p className="text-xs text-red-400 font-semibold mb-2">Root Cause Analysis</p>
            <p className="text-xs text-slate-300 leading-relaxed">
              {Math.round((failControls / Math.max(totalControls, 1)) * 100)}% of compliance failures are caused by <strong className="text-white">excessive privileges</strong> and <strong className="text-white">dormant accounts</strong>.
              {adminUsers.length} identities hold cross-platform admin access, and {mfaGapUsers.length} accounts lack MFA enforcement.
            </p>
          </div>
          <div className="rounded-lg p-4" style={{ background: 'rgba(227,25,55,0.04)', border: '1px solid rgba(227,25,55,0.12)' }}>
            <p className="text-xs text-red-400 font-semibold mb-2">Framework Most at Risk</p>
            <div className="space-y-2">
              {FRAMEWORK_DATA.sort((a, b) => a.score - b.score).slice(0, 2).map(f => (
                <div key={f.framework} className="flex items-center justify-between">
                  <span className="text-xs text-slate-300">{f.framework}</span>
                  <span className="text-xs font-bold" style={{ color: f.color }}>{f.score}%</span>
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-lg p-4 lg:col-span-2" style={{ background: 'rgba(16,185,129,0.04)', border: '1px solid rgba(16,185,129,0.12)' }}>
            <p className="text-xs text-emerald-400 font-semibold mb-2">Recommended Remediation Priority</p>
            <div className="flex flex-wrap gap-3">
              {[
                { step: '1', text: `Remove excessive admin permissions (${adminUsers.length} users)`, color: '#ef4444' },
                { step: '2', text: `Enforce MFA on ${mfaGapUsers.length} accounts`, color: '#f97316' },
                { step: '3', text: `Disable ${orphanedUsers.length + dormantUsers.length} orphaned/dormant accounts`, color: '#eab308' },
                { step: '4', text: 'Implement quarterly access review campaigns', color: '#22c55e' },
              ].map(r => (
                <div key={r.step} className="flex items-center gap-2 px-3 py-1.5 rounded-lg" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <span className="w-5 h-5 rounded flex items-center justify-center text-[10px] font-bold" style={{ background: r.color + '20', color: r.color }}>{r.step}</span>
                  <span className="text-xs text-slate-300">{r.text}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </GlassCard>

      {/* Framework Filter */}
      <div className="flex gap-2 flex-wrap">
        <button onClick={() => setSelectedFramework(null)}
          className={`px-3 py-2 rounded-lg text-xs font-medium transition-all ${!selectedFramework ? 'bg-red-500/20 text-red-400 border border-red-500/30' : 'text-slate-400 hover:text-slate-300 hover:bg-white/5 border border-transparent'}`}>
          All Frameworks
        </button>
        {FRAMEWORK_DATA.map(f => (
          <button key={f.framework} onClick={() => setSelectedFramework(f.framework === selectedFramework ? null : f.framework)}
            className={`px-3 py-2 rounded-lg text-xs font-medium transition-all ${selectedFramework === f.framework ? 'bg-red-500/20 text-red-400 border border-red-500/30' : 'text-slate-400 hover:text-slate-300 hover:bg-white/5 border border-transparent'}`}
            style={selectedFramework === f.framework ? { borderColor: f.color + '60' } : {}}>
            {f.framework}
          </button>
        ))}
      </div>

      {/* Framework Cards */}
      {frameworks.map((fw, fIdx) => (
        <GlassCard key={fw.framework} hover={false} delay={0.05 + fIdx * 0.05}>
          <div className="flex items-center gap-3 mb-4">
            <div className="w-3 h-3 rounded-full" style={{ background: fw.color }} />
            <h3 className="text-sm font-semibold text-white">{fw.framework}</h3>
            <span className="text-[10px] text-slate-500">({fw.controls.length} controls)</span>
            <span className="text-xs font-bold ml-auto" style={{ color: fw.color }}>{fw.score}%</span>
          </div>
          <div className="space-y-2">
            {fw.controls.map((control, cIdx) => {
              const statusCfg = STATUS_STYLES[control.status];
              const StatusIcon = statusCfg.icon;
              const isExpanded = expandedControl === `${fw.framework}-${control.id}`;
              return (
                <motion.div key={control.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.03 * cIdx }}>
                  <div className="rounded-lg px-4 py-3 cursor-pointer transition-all hover:bg-white/[0.03]"
                    style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}
                    onClick={() => setExpandedControl(isExpanded ? null : `${fw.framework}-${control.id}`)}>
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-xs font-bold" style={{ color: fw.color }}>{control.id}</span>
                      <span className="text-sm text-white flex-1">{control.name}</span>
                      <span className="font-mono text-xs text-slate-400">{control.findings} findings</span>
                      <span className={`flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full ${statusCfg.bg} ${statusCfg.color} border ${statusCfg.border} font-semibold`}>
                        <StatusIcon size={10} /> {statusCfg.label}
                      </span>
                      <ChevronRight size={14} className={`text-slate-500 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                    </div>
                  </div>
                  <AnimatePresence>
                    {isExpanded && (
                      <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="pl-6 pr-4 pb-3">
                        <div className="mt-2 p-4 rounded-lg space-y-3" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
                          <div>
                            <span className="text-[10px] text-slate-500 uppercase tracking-wider">Evidence</span>
                            <p className="text-xs text-slate-300 mt-0.5">{control.evidence}</p>
                          </div>
                          <div>
                            <span className="text-[10px] text-slate-500 uppercase tracking-wider">Compliance Gap</span>
                            <p className="text-xs text-yellow-400 mt-0.5">{control.gap}</p>
                          </div>
                          <div>
                            <span className="text-[10px] text-slate-500 uppercase tracking-wider">Recommendation</span>
                            <p className="text-xs text-emerald-400 mt-0.5">{control.recommendation}</p>
                          </div>
                          <div className="flex items-center justify-between pt-2 border-t border-white/5">
                            <span className="text-[10px] text-slate-500">Fix Effort: <span className={EFFORT_COLORS[control.effort]}>{control.effort}</span></span>
                            <button onClick={(e) => { e.stopPropagation(); setControlDetail({ ...control, framework: fw.framework, frameworkColor: fw.color }); setActivePanel('control-detail'); }}
                              className="text-[10px] px-3 py-1 rounded-lg bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 transition-all font-semibold flex items-center gap-1">
                              <Eye size={10} /> View Details
                            </button>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              );
            })}
          </div>
        </GlassCard>
      ))}

      {/* Detection-to-Compliance Mapping */}
      <GlassCard hover={false} delay={0.3}>
        <h3 className="text-sm font-semibold text-slate-300 mb-4 flex items-center gap-2">
          <Activity size={14} className="text-red-400" /> Detection Capability Mapping
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-[11px] text-slate-500 uppercase border-b border-white/5">
              <th className="text-left pb-3 font-medium">Capability</th><th className="text-left pb-3 font-medium">NIST</th>
              <th className="text-left pb-3 font-medium">MITRE</th><th className="text-left pb-3 font-medium">GDPR</th>
              <th className="text-left pb-3 font-medium">CIS</th><th className="text-left pb-3 font-medium">ISO 27001</th>
              <th className="text-right pb-3 font-medium">Findings</th>
            </tr></thead>
            <tbody>
              {COMPLIANCE_MAP.map((r, i) => (
                <motion.tr key={r.capability} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.35 + i * 0.03 }}
                  className="border-b border-white/[0.03] hover:bg-white/[0.02]">
                  <td className="py-2.5 text-white font-medium">{r.capability}</td>
                  <td className="py-2.5 text-cyan-400 font-mono text-xs">{r.nist}</td>
                  <td className="py-2.5 text-red-400 font-mono text-xs">{r.mitre}</td>
                  <td className="py-2.5 text-purple-400 text-xs">{r.gdpr}</td>
                  <td className="py-2.5 text-amber-400 font-mono text-xs">{r.cis}</td>
                  <td className="py-2.5 text-fuchsia-400 font-mono text-xs">{r.nist.includes('AC-2') ? 'A.5.16' : r.nist.includes('AC-6') ? 'A.5.15, A.8.2' : 'A.5.17'}</td>
                  <td className="py-2.5 text-right font-mono font-bold text-white">{r.count}</td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>
      </GlassCard>
    </motion.div>
  );
}
