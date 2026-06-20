import { motion, AnimatePresence } from 'framer-motion';
import { X, Leaf, CheckCircle, AlertCircle } from 'lucide-react';
import SustainabilityGauge from '../charts/SustainabilityGauge';

export const SUSTAINABILITY_DETAILS = {
  score: 78,
  max: 100,
  statusLabel: 'Sustainable',
  esgLabel: 'ESG Security Score',
  summary:
    'Organizational sustainability reflects identity security maturity, governance discipline, and operational resilience across all business units.',
  pillars: [
    { label: 'Identity Governance', score: 82, trend: '↑ 4 pts', color: '#22c55e' },
    { label: 'Operational Resilience', score: 76, trend: '↑ 2 pts', color: '#3b82f6' },
    { label: 'Access Hygiene', score: 74, trend: 'Stable', color: '#eab308' },
    { label: 'Green IAM Practices', score: 81, trend: '↑ 6 pts', color: '#22c55e' },
  ],
  indicators: [
    { label: 'Carbon-neutral auth flows', value: 'Enabled', status: 'ok' },
    { label: 'Zero-trust adoption', value: '87%', status: 'ok' },
    { label: 'Data minimization', value: 'In Progress', status: 'warn' },
    { label: 'Access review cadence', value: '91% compliant', status: 'ok' },
    { label: 'Automated deprovisioning', value: '94%', status: 'ok' },
    { label: 'Session efficiency (avg)', value: '12 min saved/user', status: 'ok' },
  ],
  recommendations: [
    'Accelerate data minimization across legacy identity stores.',
    'Extend zero-trust coverage to contractor and partner identities.',
    'Increase automated access review completion in Operations division.',
  ],
};

const STATUS_ICON = {
  ok: { icon: CheckCircle, className: 'text-green-400' },
  warn: { icon: AlertCircle, className: 'text-orange-400' },
};

export default function SustainabilityDetailsModal({ open, onClose, score = SUSTAINABILITY_DETAILS.score }) {
  const details = { ...SUSTAINABILITY_DETAILS, score };

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black/70 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="fixed inset-x-4 top-[8vh] md:inset-x-auto md:left-1/2 md:-translate-x-1/2 md:w-full md:max-w-lg z-[101] max-h-[84vh] overflow-y-auto rounded-2xl p-5"
            style={{
              background: 'rgba(8,10,18,0.98)',
              border: '1px solid rgba(34,197,94,0.25)',
              boxShadow: '0 24px 80px rgba(0,0,0,0.6), 0 0 40px rgba(34,197,94,0.08)',
            }}
          >
            <div className="flex items-start justify-between gap-3 mb-4">
              <div className="flex items-center gap-2">
                <Leaf size={16} className="text-green-400" />
                <div>
                  <h2 className="text-sm font-bold text-white font-orbitron tracking-wide uppercase">
                    Sustainability Index Details
                  </h2>
                  <p className="text-[10px] text-slate-500 font-orbitron mt-0.5">{details.esgLabel}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="p-1.5 rounded-lg hover:bg-white/5 text-slate-500 hover:text-white transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            <div className="flex justify-center mb-4">
              <SustainabilityGauge score={details.score} max={details.max} statusLabel={details.statusLabel} />
            </div>

            <p className="text-xs text-slate-400 leading-relaxed mb-5">{details.summary}</p>

            <h3 className="text-[10px] font-orbitron font-bold uppercase tracking-wider text-slate-400 mb-2">
              Score Pillars
            </h3>
            <div className="space-y-2.5 mb-5">
              {details.pillars.map((p) => (
                <div key={p.label}>
                  <div className="flex justify-between text-[11px] mb-1">
                    <span className="text-slate-300 font-orbitron">{p.label}</span>
                    <span className="text-slate-500 font-orbitron">
                      {p.score}% · <span className="text-green-400/80">{p.trend}</span>
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${p.score}%` }}
                      transition={{ duration: 0.8, ease: 'easeOut' }}
                      className="h-full rounded-full"
                      style={{ background: p.color, boxShadow: `0 0 8px ${p.color}66` }}
                    />
                  </div>
                </div>
              ))}
            </div>

            <h3 className="text-[10px] font-orbitron font-bold uppercase tracking-wider text-slate-400 mb-2">
              ESG Indicators
            </h3>
            <div className="rounded-xl border border-white/5 divide-y divide-white/5 mb-5">
              {details.indicators.map((ind) => {
                const cfg = STATUS_ICON[ind.status] || STATUS_ICON.ok;
                const Icon = cfg.icon;
                return (
                  <div key={ind.label} className="flex items-center justify-between gap-3 px-3 py-2.5">
                    <span className="text-[11px] text-slate-400">{ind.label}</span>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="text-[11px] text-white font-orbitron">{ind.value}</span>
                      <Icon size={12} className={cfg.className} />
                    </div>
                  </div>
                );
              })}
            </div>

            <h3 className="text-[10px] font-orbitron font-bold uppercase tracking-wider text-slate-400 mb-2">
              Recommendations
            </h3>
            <ul className="space-y-1.5 mb-2">
              {details.recommendations.map((rec) => (
                <li key={rec} className="text-[11px] text-slate-400 leading-relaxed flex gap-2">
                  <span className="text-green-400 shrink-0">•</span>
                  {rec}
                </li>
              ))}
            </ul>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
