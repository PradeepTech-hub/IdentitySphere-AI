import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { Activity, CheckCircle, XCircle, Clock, Key } from 'lucide-react';
import GlassCard from '../../components/shared/GlassCard';
import PlatformIcon from '../../components/shared/PlatformIcon';
import { useAuth } from '../../context/AuthContext';
import { getAccessRequests, getLifecycleEvents } from '../../services/storageService';


const PLATFORM_LABELS = { active_directory: 'Active Directory', aws_iam: 'AWS IAM', okta: 'Okta', salesforce: 'Salesforce' };
export default function EmployeeActivity() {
  const { user } = useAuth();

  const activities = useMemo(() => {
    const reqs = getAccessRequests().filter(r => r.employeeEmail === user?.email).map(r => ({
      id: r.id, type: 'request', action: r.status === 'pending' ? 'Requested' : r.status === 'approved' ? 'Granted' : r.status === 'rejected' ? 'Denied' : 'Expired',
      detail: `${r.role} on ${PLATFORM_LABELS[r.platform] || r.platform}`, platform: r.platform, time: r.reviewedAt || r.createdAt,
      color: r.status === 'approved' ? 'text-green-400' : r.status === 'rejected' ? 'text-red-400' : 'text-yellow-400',
    }));
    const lifecycle = getLifecycleEvents().filter(e => e.identity === user?.name).map(e => ({
      id: e.id, type: 'lifecycle', action: e.type === 'joiner' ? 'Onboarded' : e.type === 'mover' ? 'Transferred' : 'Offboarded',
      detail: `${e.department}${e.newDepartment ? ` → ${e.newDepartment}` : ''}`, platform: e.platforms?.[0], time: e.date,
      color: e.type === 'joiner' ? 'text-emerald-400' : e.type === 'mover' ? 'text-blue-400' : 'text-red-400',
    }));
    return [...reqs, ...lifecycle].sort((a, b) => new Date(b.time || 0) - new Date(a.time || 0));
  }, [user]);

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <div><h1 className="text-2xl font-bold text-white flex items-center gap-3"><Activity className="w-7 h-7 text-red-400" /> Activity History</h1><p className="text-slate-400 text-sm mt-1">Your access changes and request history</p></div>
      <GlassCard hover={false}>
        {activities.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-12"><Activity size={40} className="text-slate-600" /><p className="text-sm text-slate-500">No activity recorded</p></div>
        ) : (
          <div className="space-y-2">
            {activities.map((a, i) => (
              <motion.div key={a.id} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.02 }}
                className="flex items-center gap-4 px-4 py-3 rounded-lg" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${a.action === 'Granted' || a.action === 'Onboarded' ? 'bg-green-500/10' : a.action === 'Denied' || a.action === 'Offboarded' ? 'bg-red-500/10' : 'bg-yellow-500/10'}`}>
                  {a.action === 'Granted' || a.action === 'Onboarded' ? <CheckCircle size={14} className="text-green-400" /> : a.action === 'Denied' || a.action === 'Offboarded' ? <XCircle size={14} className="text-red-400" /> : <Clock size={14} className="text-yellow-400" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2"><span className={`text-xs font-semibold ${a.color}`}>{a.action}</span>{a.platform && <PlatformIcon platform={a.platform} size="sm" />}</div>
                  <p className="text-[10px] text-slate-500 mt-0.5">{a.detail}</p>
                </div>
                {a.time && <span className="text-[10px] text-slate-500 shrink-0">{new Date(a.time).toLocaleDateString()}</span>}
              </motion.div>
            ))}
          </div>
        )}
      </GlassCard>
    </motion.div>
  );
}
