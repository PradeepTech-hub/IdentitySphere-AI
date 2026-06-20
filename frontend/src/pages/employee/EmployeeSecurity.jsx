import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { Shield, Lock, Unlock, CheckCircle, XCircle, AlertTriangle, Clock, Sparkles, Smartphone } from 'lucide-react';
import GlassCard from '../../components/shared/GlassCard';
import PlatformIcon from '../../components/shared/PlatformIcon';
import AnimatedCounter from '../../components/shared/AnimatedCounter';
import { useAuth } from '../../context/AuthContext';
import { getIdentities } from '../../services/storageService';


export default function EmployeeSecurity() {
  const { user } = useAuth();
  const myIdentity = useMemo(() => getIdentities().find(i => i.email === user?.email || i.display_name === user?.name), [user]);
  const platforms = myIdentity?.platforms || [];

  const hygieneScore = useMemo(() => {
    let s = 100;
    if (!myIdentity?.mfa_complete) s -= 25;
    if ((myIdentity?.max_dormancy_days || 0) > 90) s -= 20;
    if (myIdentity?.is_admin) s -= 10;
    if (platforms.length > 3) s -= 5;
    return Math.max(0, s);
  }, [myIdentity, platforms]);

  const checks = [
    { label: 'Multi-Factor Authentication', ok: myIdentity?.mfa_complete, good: 'Enabled on all accounts', bad: 'Not enabled — contact IT', icon: Lock },
    { label: 'Account Status', ok: myIdentity?.status === 'Active', good: 'Active', bad: myIdentity?.status || 'Unknown', icon: CheckCircle },
    { label: 'Password Compliance', ok: true, good: 'Meets policy requirements', bad: 'Needs update', icon: Shield },
    { label: 'Device Compliance', ok: true, good: 'Enrolled device detected', bad: 'No compliant device', icon: Smartphone },
    { label: 'Session Security', ok: true, good: 'No suspicious sessions', bad: 'Suspicious activity detected', icon: AlertTriangle },
    { label: 'Dormancy Check', ok: (myIdentity?.max_dormancy_days || 0) < 30, good: 'Active usage across platforms', bad: `${myIdentity?.max_dormancy_days || 0} days dormant`, icon: Clock },
  ];

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <div><h1 className="text-2xl font-bold text-white flex items-center gap-3"><Shield className="w-7 h-7 text-emerald-400" /> Security Center</h1><p className="text-slate-400 text-sm mt-1">Your security posture and compliance status</p></div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <GlassCard hover={false} delay={0.05} glow="red">
          <div className="text-center py-4">
            <div className="relative inline-block">
              <svg width="120" height="120" viewBox="0 0 120 120">
                <circle cx="60" cy="60" r="50" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="8" />
                <circle cx="60" cy="60" r="50" fill="none" stroke={hygieneScore >= 80 ? '#22c55e' : hygieneScore >= 50 ? '#eab308' : '#ef4444'} strokeWidth="8" strokeLinecap="round"
                  strokeDasharray={`${(hygieneScore / 100) * 314.2} 314.2`} transform="rotate(-90 60 60)"
                  style={{ filter: `drop-shadow(0 0 8px ${hygieneScore >= 80 ? 'rgba(34,197,94,0.4)' : 'rgba(239,68,68,0.4)'})` }} />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-3xl font-black" style={{ color: hygieneScore >= 80 ? '#22c55e' : hygieneScore >= 50 ? '#eab308' : '#ef4444' }}>{hygieneScore}</span>
                <span className="text-[9px] text-slate-500 uppercase">Hygiene</span>
              </div>
            </div>
            <p className="text-xs text-slate-400 mt-3">{hygieneScore >= 80 ? 'Excellent security posture' : hygieneScore >= 50 ? 'Needs improvement' : 'Action required'}</p>
          </div>
        </GlassCard>

        <div className="lg:col-span-2 space-y-2">
          {checks.map((c, i) => (
            <motion.div key={c.label} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.1 + i * 0.04 }}
              className="flex items-center justify-between px-4 py-2.5 rounded-lg" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
              <div className="flex items-center gap-3">
                <c.icon size={16} className={c.ok ? 'text-emerald-400' : 'text-red-400'} />
                <span className="text-sm text-slate-300">{c.label}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-xs font-semibold ${c.ok ? 'text-emerald-400' : 'text-red-400'}`}>{c.ok ? c.good : c.bad}</span>
                {c.ok ? <CheckCircle size={14} className="text-emerald-400" /> : <XCircle size={14} className="text-red-400" />}
              </div>
            </motion.div>
          ))}
        </div>
      </div>

      <GlassCard hover={false} delay={0.3}>
        <h3 className="text-sm font-semibold text-slate-300 mb-3 flex items-center gap-2"><Sparkles size={14} className="text-amber-400" /> Security Recommendations</h3>
        <div className="space-y-2">
          {!myIdentity?.mfa_complete && (
            <div className="flex items-start gap-3 px-3 py-2.5 rounded-lg" style={{ background: 'rgba(239,68,68,0.05)', border: '1px solid rgba(239,68,68,0.12)' }}>
              <AlertTriangle size={14} className="text-red-400 mt-0.5" /><span className="text-xs text-slate-300">Enable MFA immediately — your accounts are vulnerable to credential attacks</span>
            </div>
          )}
          {(myIdentity?.max_dormancy_days || 0) > 30 && (
            <div className="flex items-start gap-3 px-3 py-2.5 rounded-lg" style={{ background: 'rgba(234,179,8,0.05)', border: '1px solid rgba(234,179,8,0.12)' }}>
              <Clock size={14} className="text-yellow-400 mt-0.5" /><span className="text-xs text-slate-300">Some accounts show inactivity — log in to maintain access compliance</span>
            </div>
          )}
          <div className="flex items-start gap-3 px-3 py-2.5 rounded-lg" style={{ background: 'rgba(34,197,94,0.05)', border: '1px solid rgba(34,197,94,0.12)' }}>
            <CheckCircle size={14} className="text-green-400 mt-0.5" /><span className="text-xs text-slate-300">Review your assigned applications periodically and remove any you no longer need</span>
          </div>
        </div>
      </GlassCard>
    </motion.div>
  );
}
