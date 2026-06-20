import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Zap, UserX, KeyRound, ShieldAlert, Key, Users, CheckCircle, AlertTriangle, Loader, Bot, Target, Route, ChevronDown, ChevronUp } from 'lucide-react';
import GlassCard from '../../components/shared/GlassCard';
import SeverityBadge from '../../components/shared/SeverityBadge';
import { useScenario } from '../../context/ScenarioContext';
import { getIdentities, getRiskEvents } from '../../services/storageService';

const SCENARIO_BUTTONS = [
  { key: 'dormant_admin', icon: KeyRound, label: 'Create Dormant Admin', color: 'from-orange-500 to-red-600' },
  { key: 'offboarding_failure', icon: UserX, label: 'Create Offboarding Failure', color: 'from-red-500 to-pink-600' },
  { key: 'privilege_escalation', icon: ShieldAlert, label: 'Create Privilege Escalation', color: 'from-purple-500 to-indigo-600' },
  { key: 'token_abuse', icon: Key, label: 'Create Token Abuse', color: 'from-amber-500 to-orange-600' },
  { key: 'cross_platform_admin', icon: Users, label: 'Create Cross Platform Admin', color: 'from-red-500 to-rose-600' },
];

const STATUS_STEPS = [
  { key: 'detected', icon: AlertTriangle, label: 'Risk Detected', color: 'text-red-400' },
  { key: 'analyzing', icon: Loader, label: 'Analyzing', color: 'text-yellow-400' },
  { key: 'incident_created', icon: Zap, label: 'Incident Created', color: 'text-red-400' },
  { key: 'resolved', icon: CheckCircle, label: 'Resolved', color: 'text-green-400' },
];

function CopilotCard({ text }) {
  const [expanded, setExpanded] = useState(false);
  if (!text) return null;
  return (
    <div className="glass rounded-xl p-4">
      <div className="flex items-center gap-2 mb-2 text-xs font-semibold text-amber-400">
        <Bot size={14} /> AI Copilot
      </div>
      <p className={`text-xs text-slate-400 leading-relaxed ${expanded ? '' : 'line-clamp-4'}`}>{text}</p>
      <button
        onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}
        className="mt-3 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500/10 text-red-400 text-[11px] font-semibold border border-red-500/20 hover:bg-red-500/20 hover:text-red-300 transition-all cursor-pointer"
      >
        {expanded ? <><ChevronUp size={12} /> Show Less</> : <><ChevronDown size={12} /> Show More</>}
      </button>
    </div>
  );
}

export default function Scenarios() {
  const { scenarios, processing, runScenario, resolveScenario, clearScenarios } = useScenario();

  const liveStats = useMemo(() => {
    const ids = getIdentities();
    const risks = getRiskEvents();
    const dormant = ids.filter(i => i.status === 'Dormant' || (i.max_dormancy_days || 0) > 90).length;
    const orphaned = ids.filter(i => i.status === 'Orphaned' || i.status === 'Offboarded').length;
    const admins = ids.filter(i => i.is_admin).length;
    const crossAdmins = ids.filter(i => i.is_admin && (i.platforms?.length || 0) >= 2).length;
    const tokenRisks = risks.filter(r => r.type === 'token_abuse').length;
    const privEsc = risks.filter(r => r.type === 'privilege_escalation').length;
    return { dormant, orphaned, admins, crossAdmins, tokenRisks, privEsc, total: ids.length, totalRisks: risks.length };
  }, [scenarios]);

  const buttonDescs = {
    dormant_admin: `${liveStats.dormant} dormant account(s) detected`,
    offboarding_failure: `${liveStats.orphaned} orphaned/offboarded identity(s)`,
    privilege_escalation: `${liveStats.privEsc} escalation finding(s) active`,
    token_abuse: `${liveStats.tokenRisks} token abuse finding(s) active`,
    cross_platform_admin: `${liveStats.crossAdmins} cross-platform admin(s) of ${liveStats.admins} total`,
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Zap size={24} className="text-red-400" /> Scenario Simulator
          </h1>
          <p className="text-sm text-slate-500 mt-1">{liveStats.total} identities monitored | {liveStats.totalRisks} risk findings | Create live scenarios to test detection response</p>
        </div>
        {scenarios.length > 0 && (
          <button onClick={clearScenarios} className="px-3 py-1.5 rounded-lg text-xs text-slate-400 hover:text-red-400 hover:bg-red-500/10 border border-white/5 transition-all">
            Clear All
          </button>
        )}
      </div>

      <div className="grid md:grid-cols-3 lg:grid-cols-5 gap-3">
        {SCENARIO_BUTTONS.map(s => (
          <motion.button key={s.key} whileHover={{ scale: 1.03, y: -4 }} whileTap={{ scale: 0.97 }}
            onClick={() => runScenario(s.key)} disabled={processing}
            className={`p-4 rounded-2xl bg-gradient-to-br ${s.color} text-white text-left disabled:opacity-40 transition-all group relative overflow-hidden`}
          >
            <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent" />
            <div className="relative">
              <s.icon size={24} className="mb-3 opacity-80 group-hover:opacity-100 transition-opacity" />
              <p className="text-sm font-bold mb-1">{s.label}</p>
              <p className="text-[10px] opacity-70">{buttonDescs[s.key]}</p>
            </div>
          </motion.button>
        ))}
      </div>

      <AnimatePresence mode="popLayout">
        {scenarios.map((s, i) => (
          <motion.div key={s.id} layout initial={{ opacity: 0, y: 30, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} transition={{ duration: 0.4 }}>
            <GlassCard hover={false} className={`border ${s.status === 'resolved' ? 'border-green-500/20 bg-green-500/[0.02]' : 'border-purple-500/20 bg-purple-500/[0.02]'}`}>
              <div className="flex items-start justify-between mb-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-white">{s.identity}</span>
                    <SeverityBadge severity={s.severity} pulse={s.status !== 'resolved'} />
                    <span className="text-[9px] bg-red-500/20 text-red-400 px-2 py-0.5 rounded-full font-bold">LIVE</span>
                  </div>
                  <p className="text-sm text-slate-400 mt-1">{s.title}</p>
                </div>
                {s.status === 'incident_created' && (
                  <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} onClick={() => resolveScenario(s.id)}
                    className="px-4 py-2 rounded-xl bg-green-500/10 text-green-400 text-xs font-semibold border border-green-500/20 hover:bg-green-500/20 transition-all"
                  >Approve Remediation</motion.button>
                )}
                {s.status === 'resolved' && (
                  <span className="flex items-center gap-1 text-green-400 text-xs font-semibold"><CheckCircle size={14} /> Resolved</span>
                )}
              </div>

              <div className="flex items-center gap-2 mb-5">
                {STATUS_STEPS.map((step, j) => {
                  const stepIndex = STATUS_STEPS.findIndex(st => st.key === s.status);
                  const thisIndex = j;
                  const isActive = thisIndex <= stepIndex;
                  return (
                    <div key={step.key} className="flex items-center gap-2 flex-1">
                      <div className={`w-7 h-7 rounded-full flex items-center justify-center ${isActive ? 'bg-white/10' : 'bg-white/[0.03]'}`}>
                        <step.icon size={12} className={isActive ? step.color : 'text-slate-600'} />
                      </div>
                      <span className={`text-[10px] ${isActive ? 'text-slate-300' : 'text-slate-600'}`}>{step.label}</span>
                      {j < STATUS_STEPS.length - 1 && <div className={`flex-1 h-px ${isActive ? 'bg-white/10' : 'bg-white/[0.03]'}`} />}
                    </div>
                  );
                })}
              </div>

              {s.status === 'incident_created' && (
                <div className="grid md:grid-cols-3 gap-4">
                  <div className="glass rounded-xl p-4">
                    <div className="flex items-center gap-2 mb-2 text-xs font-semibold text-red-400">
                      <Target size={14} /> Blast Radius
                    </div>
                    <p className="text-2xl font-black text-white">{s.blastRadius?.resources || 0}</p>
                    <p className="text-[10px] text-slate-500 mt-1">resources across {s.blastRadius?.platforms || 0} platform(s)</p>
                  </div>
                  <div className="glass rounded-xl p-4">
                    <div className="flex items-center gap-2 mb-2 text-xs font-semibold text-purple-400">
                      <Route size={14} /> Attack Path
                    </div>
                    <p className="text-sm text-slate-300">{s.platforms?.join(' -> ')}</p>
                    <p className="text-[10px] text-slate-500 mt-1">Cross-platform: {(s.platforms?.length || 0) >= 2 ? 'Yes' : 'No'}</p>
                  </div>
                  <CopilotCard text={s.copilotExplanation} />
                </div>
              )}

              {s.status === 'incident_created' && s.remediation && (
                <div className="mt-4 pt-4 border-t border-white/5">
                  <p className="text-xs font-semibold text-slate-300 mb-2">Recommended Remediation:</p>
                  <div className="space-y-1">
                    {s.remediation.map((step, j) => (
                      <div key={j} className="flex items-start gap-2 text-xs text-slate-400">
                        <span className="text-red-500 mt-0.5">{j + 1}.</span>
                        <span>{step}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </GlassCard>
          </motion.div>
        ))}
      </AnimatePresence>

      {scenarios.length === 0 && (
        <GlassCard hover={false} className="text-center py-16">
          <Zap size={48} className="text-slate-700 mx-auto mb-4" />
          <p className="text-sm text-slate-500">Click a scenario button above to create a live risk simulation</p>
          <p className="text-xs text-slate-600 mt-1">The detection engine, attack graph, blast radius, and AI copilot will respond in real-time</p>
        </GlassCard>
      )}
    </div>
  );
}
