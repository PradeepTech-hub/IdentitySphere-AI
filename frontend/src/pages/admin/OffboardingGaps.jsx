import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { UserX, AlertTriangle, Clock, Shield, ExternalLink } from 'lucide-react';
import GlassCard from '../../components/shared/GlassCard';
import SeverityBadge from '../../components/shared/SeverityBadge';
import PlatformIcon from '../../components/shared/PlatformIcon';
import AnimatedCounter from '../../components/shared/AnimatedCounter';
import { usePlatformData } from '../../context/PlatformDataContext';
import { getRiskEvents } from '../../services/storageService';

const PLATFORM_LABELS = {
  active_directory: 'Active Directory',
  azure_ad: 'Azure AD',
  aws_iam: 'AWS IAM',
  okta: 'Okta',
  salesforce: 'Salesforce',
  servicenow: 'ServiceNow',
  github: 'GitHub',
};

export default function OffboardingGaps() {
  const navigate = useNavigate();
  const { data } = usePlatformData();
  const [filter, setFilter] = useState('all');

  const gaps = useMemo(() => data?.offboarding_gaps || [], [data]);
  const riskEvents = useMemo(() => getRiskEvents(), [data]);

  const orphanedOnly = useMemo(
    () => riskEvents.filter((r) => r.type === 'orphaned_account'),
    [riskEvents],
  );

  const filtered = useMemo(() => {
    if (filter === 'critical') return gaps.filter((g) => g.severity === 'critical');
    if (filter === 'high') return gaps.filter((g) => g.severity === 'high');
    return gaps;
  }, [gaps, filter]);

  const totalActivePlatforms = gaps.reduce((n, g) => n + (g.gap_count || 0), 0);
  const avgDays = gaps.length
    ? Math.round(gaps.reduce((n, g) => n + (g.days_since_termination || 0), 0) / gaps.length)
    : 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Offboarding Gap Detector</h1>
        <p className="text-sm text-slate-500 mt-1">
          Cross-platform status mismatches — accounts disabled in HR/AD but still active elsewhere
        </p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Gap Cases', value: gaps.length, icon: UserX, color: 'text-red-400' },
          { label: 'Active Platforms', value: totalActivePlatforms, icon: AlertTriangle, color: 'text-orange-400' },
          { label: 'Avg Days Since Term', value: avgDays, icon: Clock, color: 'text-amber-400' },
          { label: 'Orphaned Accounts', value: orphanedOnly.length, icon: Shield, color: 'text-red-400' },
        ].map((s, i) => (
          <GlassCard key={s.label} delay={i * 0.05}>
            <div className="flex items-center gap-3">
              <s.icon size={20} className={s.color} />
              <div>
                <p className="text-[10px] text-slate-500 uppercase tracking-wider">{s.label}</p>
                <p className="text-xl font-bold text-white"><AnimatedCounter value={s.value} /></p>
              </div>
            </div>
          </GlassCard>
        ))}
      </div>

      <div className="flex gap-2 flex-wrap">
        {['all', 'critical', 'high'].map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              filter === f
                ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                : 'bg-white/5 text-slate-400 border border-white/10 hover:text-white'
            }`}
          >
            {f === 'all' ? 'All gaps' : f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      <div className="space-y-3">
        {filtered.length === 0 && (
          <GlassCard>
            <p className="text-sm text-slate-500">No offboarding gaps detected in current pipeline data.</p>
          </GlassCard>
        )}
        {filtered.map((gap, i) => (
          <motion.div
            key={gap.person_id}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.04 }}
          >
            <GlassCard className="border-red-500/15">
              <div className="flex flex-col lg:flex-row lg:items-start gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      type="button"
                      onClick={() => navigate(`/admin/identities/${gap.person_id}`)}
                      className="text-sm font-semibold text-white hover:text-red-400 transition-colors"
                    >
                      {gap.display_name}
                    </button>
                    <span className="text-[10px] text-slate-500 font-mono">{gap.person_id}</span>
                    <SeverityBadge severity={gap.severity} />
                  </div>
                  <p className="text-xs text-slate-400 mt-1">{gap.title}</p>
                  <div className="flex items-center gap-4 mt-2 text-[11px] text-slate-500">
                    <span>Terminated: {gap.termination_date?.slice(0, 10) || 'N/A'}</span>
                    <span>{gap.days_since_termination ?? 0} days ago</span>
                    <span>Status: {gap.offboarding_status}</span>
                  </div>

                  <div className="mt-3 grid sm:grid-cols-2 gap-3">
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-red-400 mb-1">Still active</p>
                      <div className="flex flex-wrap gap-1">
                        {(gap.active_platforms || []).map((p) => (
                          <span key={p} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-red-500/10 text-red-300 text-[10px]">
                            <PlatformIcon platform={p} size="sm" />
                            {PLATFORM_LABELS[p] || p}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-green-400 mb-1">Disabled</p>
                      <div className="flex flex-wrap gap-1">
                        {(gap.disabled_platforms || []).length === 0 && (
                          <span className="text-[10px] text-slate-600">None</span>
                        )}
                        {(gap.disabled_platforms || []).map((p) => (
                          <span key={p} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-green-500/10 text-green-300 text-[10px]">
                            <PlatformIcon platform={p} size="sm" />
                            {PLATFORM_LABELS[p] || p}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="lg:w-72 shrink-0">
                  <p className="text-[10px] uppercase tracking-wider text-slate-500 mb-2">Remediation</p>
                  <ul className="text-[11px] text-slate-400 space-y-1 list-disc list-inside">
                    {(gap.remediation_steps || []).slice(0, 4).map((step) => (
                      <li key={step}>{step}</li>
                    ))}
                  </ul>
                  <button
                    type="button"
                    onClick={() => navigate(`/admin/identities/${gap.person_id}`)}
                    className="mt-3 inline-flex items-center gap-1 text-[11px] text-red-400 hover:text-red-300"
                  >
                    View identity <ExternalLink size={12} />
                  </button>
                </div>
              </div>
            </GlassCard>
          </motion.div>
        ))}
      </div>

      {orphanedOnly.length > 0 && (
        <GlassCard hover={false}>
          <h3 className="text-sm font-semibold text-white mb-3">Related orphaned account findings</h3>
          <div className="space-y-2">
            {orphanedOnly.slice(0, 8).map((r) => (
              <div
                key={r.id}
                className="flex items-center justify-between py-2 border-b border-white/[0.03] last:border-0 cursor-pointer hover:bg-white/[0.02] px-2 rounded"
                onClick={() => navigate(`/admin/identities/${r.identityId}`)}
                onKeyDown={(e) => e.key === 'Enter' && navigate(`/admin/identities/${r.identityId}`)}
                role="button"
                tabIndex={0}
              >
                <span className="text-xs text-slate-300">{r.identity}</span>
                <SeverityBadge severity={r.severity} />
              </div>
            ))}
          </div>
        </GlassCard>
      )}
    </div>
  );
}
