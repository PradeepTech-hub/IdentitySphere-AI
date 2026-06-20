import { useState } from 'react';
import { motion } from 'framer-motion';
import { CheckCircle, Clock, Eye, AlertTriangle } from 'lucide-react';
import GlassCard from '../../components/shared/GlassCard';
import PageHeader from '../../components/shared/PageHeader';
import StatCard from '../../components/shared/StatCard';
import SeverityBadge from '../../components/shared/SeverityBadge';
import { getIncidents, saveIncidents } from '../../services/storageService';
import { useScenario } from '../../context/ScenarioContext';

const STATUS_CONFIG = {
  open: { icon: AlertTriangle, color: 'text-red-400', bg: 'bg-red-500/10', label: 'Open' },
  review: { icon: Eye, color: 'text-yellow-400', bg: 'bg-yellow-500/10', label: 'In Review' },
  approved: { icon: Clock, color: 'text-blue-400', bg: 'bg-blue-500/10', label: 'Approved' },
  resolved: { icon: CheckCircle, color: 'text-green-400', bg: 'bg-green-500/10', label: 'Resolved' },
  detected: { icon: AlertTriangle, color: 'text-purple-400', bg: 'bg-purple-500/10', label: 'Detected' },
  analyzing: { icon: Eye, color: 'text-cyan-400', bg: 'bg-cyan-500/10', label: 'Analyzing' },
  incident_created: { icon: AlertTriangle, color: 'text-red-400', bg: 'bg-red-500/10', label: 'Incident Created' },
};

export default function Incidents() {
  const { scenarios, resolveScenario } = useScenario();
  const [incidents, setIncidents] = useState(() => getIncidents());

  const allIncidents = [
    ...scenarios.filter(s => s.status !== 'resolved').map(s => ({
      id: s.incidentId || s.id, title: s.title, severity: s.severity,
      status: s.status, identity: s.identity, created: s.createdAt,
      type: s.type, isSimulated: true, scenarioId: s.id,
    })),
    ...incidents,
  ];

  const advance = (id, scenarioId) => {
    if (scenarioId) {
      resolveScenario(scenarioId);
    } else {
      setIncidents(prev => {
        const updated = prev.map(inc => {
          if (inc.id !== id) return inc;
          const flow = { open: 'review', review: 'approved', approved: 'resolved' };
          return { ...inc, status: flow[inc.status] || inc.status };
        });
        saveIncidents(updated);
        return updated;
      });
    }
  };

  const statusCounts = {
    open: allIncidents.filter(i => i.status === 'open').length,
    review: allIncidents.filter(i => i.status === 'review').length,
    approved: allIncidents.filter(i => i.status === 'approved').length,
    resolved: allIncidents.filter(i => i.status === 'resolved').length,
  };

  return (
    <div className="space-y-6">
      <PageHeader
        badge="Incident Response"
        title="Security Incident Command Center"
        subtitle="Workflow: Open → Review → Approve → Resolved"
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
        <StatCard label="Open" value={statusCounts.open} icon={AlertTriangle} color="text-red-400" bg="from-red-500/10 to-rose-500/5" delay={0.05} />
        <StatCard label="In Review" value={statusCounts.review} icon={Eye} color="text-yellow-400" bg="from-yellow-500/10 to-amber-500/5" delay={0.1} />
        <StatCard label="Approved" value={statusCounts.approved} icon={Clock} color="text-blue-400" bg="from-blue-500/10 to-cyan-500/5" delay={0.15} />
        <StatCard label="Resolved" value={statusCounts.resolved} icon={CheckCircle} color="text-green-400" bg="from-green-500/10 to-emerald-500/5" delay={0.2} />
      </div>

      <div className="space-y-3">
        {allIncidents.map((inc, i) => {
          const cfg = STATUS_CONFIG[inc.status] || STATUS_CONFIG.open;
          return (
            <motion.div key={inc.id} initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
              <GlassCard className={`${inc.isSimulated ? 'border-purple-500/20' : ''} !p-3`}>
                <div className="flex items-center gap-4">
                  <div className={`w-10 h-10 rounded-xl ${cfg.bg} flex items-center justify-center`}>
                    <cfg.icon size={18} className={cfg.color} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-white">{inc.title}</span>
                      {inc.isSimulated && <span className="text-[9px] bg-purple-500/20 text-purple-400 px-2 py-0.5 rounded-full font-bold font-orbitron">SIMULATED</span>}
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-[11px] text-slate-500">
                      <span>{inc.id}</span><span className="text-white/10">|</span>
                      <span>{inc.identity}</span><span className="text-white/10">|</span>
                      <span>{inc.type?.replace(/_/g, ' ')}</span>
                    </div>
                  </div>
                  <SeverityBadge severity={inc.severity} pulse />
                  <span className={`text-xs font-medium px-2.5 py-1 rounded-lg font-orbitron uppercase tracking-wider ${cfg.bg} ${cfg.color}`}>{cfg.label}</span>
                  {inc.status !== 'resolved' && (
                    <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
                      onClick={() => advance(inc.id, inc.scenarioId)}
                      className="px-3 py-1.5 rounded-lg bg-red-500/10 text-red-400 text-xs font-medium border border-red-500/20 hover:bg-red-500/20 transition-all"
                    >
                      {inc.status === 'approved' ? 'Resolve' : inc.status === 'review' ? 'Approve' : 'Review'}
                    </motion.button>
                  )}
                </div>
              </GlassCard>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
