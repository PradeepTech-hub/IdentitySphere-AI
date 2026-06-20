import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle } from 'lucide-react';
import GlassCard from '../../components/shared/GlassCard';
import PageHeader from '../../components/shared/PageHeader';
import StatCard from '../../components/shared/StatCard';
import FloatingCounter from '../../components/shared/FloatingCounter';
import SeverityBadge from '../../components/shared/SeverityBadge';
import PlatformIcon from '../../components/shared/PlatformIcon';
import SectionHeader from '../../components/shared/SectionHeader';
import InteractivePieChart from '../../components/charts/InteractivePieChart';
import { getRiskEvents } from '../../services/storageService';
import { useScenario } from '../../context/ScenarioContext';

const SEV_COLORS = { critical: '#E31937', high: '#f97316', medium: '#eab308', low: '#22c55e' };

export default function Risks() {
  const navigate = useNavigate();
  const [filter, setFilter] = useState('all');
  const { scenarios } = useScenario();

  const storedRisks = getRiskEvents();
  const allRisks = [
    ...scenarios.filter(s => s.status !== 'resolved').map(s => ({
      id: s.id, identity: s.identity, identityId: s.id, department: s.department,
      type: s.type, severity: s.severity, score: s.score, platforms: s.platforms,
      title: s.title, factors: {}, isSimulated: true,
    })),
    ...storedRisks,
  ];

  const filtered = filter === 'all' ? allRisks : allRisks.filter(r => r.severity === filter);
  const FILTERS = ['all', 'critical', 'high', 'medium', 'low'];

  const sevCounts = {
    critical: allRisks.filter(r => r.severity === 'critical').length,
    high: allRisks.filter(r => r.severity === 'high').length,
    medium: allRisks.filter(r => r.severity === 'medium').length,
    low: allRisks.filter(r => r.severity === 'low').length,
  };

  const pieData = Object.entries(sevCounts).filter(([, v]) => v > 0).map(([name, value]) => ({
    name, value, color: SEV_COLORS[name],
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        badge="Threat Detection"
        title="Threat Detection Center"
        subtitle={`${allRisks.length} findings across 8 risk types — click legend to explore severity mix`}
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="Critical" value={sevCounts.critical} icon={AlertTriangle} color="text-red-400" bg="from-red-500/10 to-rose-500/5" delay={0.05} />
        <StatCard label="High" value={sevCounts.high} icon={AlertTriangle} color="text-orange-400" bg="from-orange-500/10 to-amber-500/5" delay={0.1} />
        <StatCard label="Medium" value={sevCounts.medium} icon={AlertTriangle} color="text-yellow-400" bg="from-yellow-500/10 to-amber-500/5" delay={0.15} />
        <StatCard label="Low" value={sevCounts.low} icon={AlertTriangle} color="text-green-400" bg="from-green-500/10 to-emerald-500/5" delay={0.2} />
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <GlassCard hover={false} className="lg:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <SectionHeader title="All Findings" className="mb-0" />
            <div className="flex gap-2 flex-wrap">
              {FILTERS.map(f => (
                <button key={f} onClick={() => setFilter(f)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium font-orbitron uppercase tracking-wider transition-all ${filter === f ? 'bg-red-500/20 text-red-400 border border-red-500/30' : 'text-slate-400 hover:text-slate-300 hover:bg-white/5'}`}
                >{f === 'all' ? `All (${allRisks.length})` : `${f} (${allRisks.filter(r => r.severity === f).length})`}</button>
              ))}
            </div>
          </div>
          <AnimatePresence mode="popLayout">
            <div className="space-y-3 max-h-[520px] overflow-y-auto pr-1">
              {filtered.map((r, i) => (
                <motion.div key={r.id} layout initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }} transition={{ delay: i * 0.03 }}>
                  <GlassCard className={`cursor-pointer !p-3 ${r.isSimulated ? 'border-purple-500/30 bg-purple-500/[0.03]' : ''}`}
                    onClick={() => r.identityId && navigate(`/admin/identities/${r.identityId}`)}>
                    <div className="flex items-start gap-4">
                      <div className="flex flex-col items-center gap-1 pt-1 min-w-[48px]">
                        <FloatingCounter value={Math.round(r.score)} color={r.severity === 'critical' ? 'red' : r.severity === 'high' ? 'orange' : 'yellow'} size="2xl" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <span className="text-sm font-semibold text-white">{r.identity}</span>
                          <SeverityBadge severity={r.severity} pulse />
                          {r.isSimulated && <span className="text-[9px] bg-purple-500/20 text-purple-400 px-2 py-0.5 rounded-full font-bold font-orbitron">SIMULATED</span>}
                        </div>
                        <p className="text-sm text-slate-400 mb-2">{r.title}</p>
                        <div className="flex items-center gap-3 text-[11px] text-slate-500">
                          <span>{r.department}</span>
                          <span className="text-white/10">|</span>
                          <span>{r.type.replace(/_/g, ' ')}</span>
                          <span className="text-white/10">|</span>
                          <div className="flex gap-1">{r.platforms.map(p => <PlatformIcon key={p} platform={p} />)}</div>
                        </div>
                      </div>
                    </div>
                  </GlassCard>
                </motion.div>
              ))}
            </div>
          </AnimatePresence>
        </GlassCard>
        <GlassCard hover={false}>
          <InteractivePieChart data={pieData} height={280} title="Severity Mix" />
        </GlassCard>
      </div>
    </div>
  );
}
