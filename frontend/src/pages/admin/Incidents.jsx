import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { CheckCircle, Clock, Eye, AlertTriangle } from 'lucide-react';
import GlassCard from '../../components/shared/GlassCard';
import SeverityBadge from '../../components/shared/SeverityBadge';
import { getIncidents, saveIncidents } from '../../services/storageService';
import { usePlatformData } from '../../context/PlatformDataContext';
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
  const { data } = usePlatformData();
  const [incidents, setIncidents] = useState(() => getIncidents());

  useEffect(() => {
    setIncidents(getIncidents());
  }, [data]);

  const allIncidents = [
    ...scenarios.filter(s => s.status !== 'resolved').map(s => ({
      id: s.incidentId || s.id,
      title: s.title,
      severity: s.severity,
      status: s.status,
      identity: s.identity,
      created: s.createdAt,
      type: s.type,
      isSimulated: true,
      scenarioId: s.id,
    })),
    ...incidents,
  ];

  const advance = (id, scenarioId) => {
    if (scenarioId) {
      resolveScenario(scenarioId);
      return;
    }
    setIncidents(prev => {
      const updated = prev.map(inc => {
        if (inc.id !== id) return inc;
        const flow = { open: 'review', review: 'approved', approved: 'resolved' };
        return { ...inc, status: flow[inc.status] || inc.status };
      });
      saveIncidents(updated);
      return updated;
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Security Incident Command Center</h1>
        <p className="text-sm text-slate-500 mt-1">DBSCAN-clustered incidents from pipeline + workflow states</p>
      </div>

      <div className="flex gap-4 mb-2">
        {['open', 'review', 'approved', 'resolved'].map(s => {
          const cfg = STATUS_CONFIG[s];
          const count = allIncidents.filter(i => i.status === s).length;
          return (
            <div key={s} className={`flex items-center gap-2 px-3 py-1.5 rounded-lg ${cfg.bg}`}>
              <cfg.icon size={14} className={cfg.color} />
              <span className="text-xs font-medium text-slate-300">{cfg.label} ({count})</span>
            </div>
          );
        })}
      </div>

      <div className="space-y-3">
        {allIncidents.map((inc, i) => {
          const cfg = STATUS_CONFIG[inc.status] || STATUS_CONFIG.open;
          return (
            <motion.div
              key={inc.id}
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04 }}
            >
              <GlassCard className={inc.isSimulated ? 'border-purple-500/20' : ''}>
                <div className="flex items-center gap-4">
                  <div className={`w-10 h-10 rounded-xl ${cfg.bg} flex items-center justify-center`}>
                    <cfg.icon size={18} className={cfg.color} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-white">{inc.title}</span>
                      {inc.isSimulated && (
                        <span className="text-[9px] bg-purple-500/20 text-purple-400 px-2 py-0.5 rounded-full font-bold">
                          SIMULATED
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {inc.identity} · {(inc.type || 'incident').replace(/_/g, ' ')}
                    </p>
                    {inc.narrative && (
                      <p className="text-[11px] text-slate-400 mt-1">{inc.narrative}</p>
                    )}
                  </div>
                  <SeverityBadge severity={inc.severity} />
                  {inc.status !== 'resolved' && (
                    <button
                      type="button"
                      onClick={() => advance(inc.id, inc.scenarioId)}
                      className="px-3 py-1.5 rounded-lg bg-red-500/10 border border-red-500/20 text-xs text-red-400 hover:bg-red-500/20 transition-colors"
                    >
                      Advance
                    </button>
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
