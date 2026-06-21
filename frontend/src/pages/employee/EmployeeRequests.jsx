import { useState, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Key, Clock, CheckCircle, XCircle, Send, FileText } from 'lucide-react';
import GlassCard from '../../components/shared/GlassCard';
import PlatformIcon from '../../components/shared/PlatformIcon';
import AnimatedCounter from '../../components/shared/AnimatedCounter';
import { useAuth } from '../../context/AuthContext';
import { usePlatformData } from '../../context/PlatformDataContext';
import { createAccessRequest, fetchAccessRequests } from '../../services/governanceService';

const PLATFORM_LABELS = { active_directory: 'Active Directory', aws_iam: 'AWS IAM', okta: 'Okta', salesforce: 'Salesforce' };
const PLATFORMS = ['active_directory', 'aws_iam', 'okta', 'salesforce'];
const ROLES = {
  active_directory: ['Read-Only User', 'Helpdesk Operator', 'Server Admin', 'Domain Admin'],
  aws_iam: ['ViewOnlyAccess', 'ReadOnlyAccess', 'PowerUserAccess', 'AdministratorAccess'],
  okta: ['SSO User', 'Group Admin', 'App Admin', 'Org Admin'],
  salesforce: ['Read Only', 'Standard User', 'Report Viewer', 'System Administrator'],
};
const DURATIONS = [{ label: '1 Day', days: 1 }, { label: '7 Days', days: 7 }, { label: '14 Days', days: 14 }, { label: '30 Days', days: 30 }];
const STATUS_STYLES = { pending: { label: 'Pending', color: 'text-yellow-400', bg: 'bg-yellow-500/10', icon: Clock }, approved: { label: 'Approved', color: 'text-green-400', bg: 'bg-green-500/10', icon: CheckCircle }, rejected: { label: 'Rejected', color: 'text-red-400', bg: 'bg-red-500/10', icon: XCircle }, expired: { label: 'Expired', color: 'text-slate-400', bg: 'bg-slate-500/10', icon: Clock } };

export default function EmployeeRequests() {
  const { user } = useAuth();
  const { refresh } = usePlatformData();
  const [requests, setRequests] = useState([]);
  const [form, setForm] = useState({ platform: 'active_directory', role: '', duration: 7, justification: '' });
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!user?.email) return;
    fetchAccessRequests({ employeeEmail: user.email }).then(setRequests).catch(() => setRequests([]));
  }, [user, refresh]);

  const stats = { total: requests.length, pending: requests.filter(r => r.status === 'pending').length, approved: requests.filter(r => r.status === 'approved').length, rejected: requests.filter(r => r.status === 'rejected').length };

  const handleSubmit = useCallback(async () => {
    if (!form.justification.trim() || !form.role || !user?.email) return;
    setSubmitting(true);
    try {
      const row = await createAccessRequest({
        platform: form.platform,
        role: form.role,
        durationDays: form.duration,
        justification: form.justification,
        employeeName: user.name,
      });
      setRequests((prev) => [row, ...prev]);
      setForm({ platform: 'active_directory', role: '', duration: 7, justification: '' });
      setShowForm(false);
      await refresh();
    } catch (err) {
      alert(err.message || 'Could not submit request');
    } finally {
      setSubmitting(false);
    }
  }, [form, user, refresh]);

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold text-white flex items-center gap-3"><FileText className="w-7 h-7 text-sg-red" /> Access Requests</h1><p className="text-slate-400 text-sm mt-1">Request temporary access to platforms and roles</p></div>
        <motion.button whileTap={{ scale: 0.95 }} onClick={() => setShowForm(!showForm)} className="px-4 py-2 rounded-xl bg-gradient-to-r from-red-600 to-red-500 text-white font-semibold text-sm hover:opacity-90 transition-opacity flex items-center gap-2"><Send size={14} /> New Request</motion.button>
      </div>

      <div className="grid grid-cols-4 gap-3">
        {[{ label: 'Total', value: stats.total, color: 'text-white', icon: FileText }, { label: 'Pending', value: stats.pending, color: 'text-yellow-400', icon: Clock }, { label: 'Approved', value: stats.approved, color: 'text-green-400', icon: CheckCircle }, { label: 'Rejected', value: stats.rejected, color: 'text-red-400', icon: XCircle }].map((s, i) => (
          <GlassCard key={s.label} delay={i * 0.05}><div className="flex items-center gap-3 p-1"><s.icon className={`w-5 h-5 ${s.color} opacity-60`} /><div><AnimatedCounter value={s.value} className={`text-2xl font-bold ${s.color}`} /><p className="text-[10px] text-slate-500 uppercase tracking-wider">{s.label}</p></div></div></GlassCard>
        ))}
      </div>

      <AnimatePresence>
        {showForm && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
            <GlassCard hover={false} className="border-red-500/20">
              <h3 className="text-sm font-semibold text-red-400 mb-4 flex items-center gap-2"><Key size={16} /> Request Access</h3>
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div><label className="text-[11px] text-slate-500 uppercase block mb-1">Platform</label><select value={form.platform} onChange={e => setForm(f => ({ ...f, platform: e.target.value, role: '' }))} className="w-full px-3 py-2.5 bg-white/5 border border-white/10 rounded-lg text-sm text-white outline-none focus:border-red-500/50">{PLATFORMS.map(p => <option key={p} value={p} className="bg-navy-900">{PLATFORM_LABELS[p]}</option>)}</select></div>
                <div><label className="text-[11px] text-slate-500 uppercase block mb-1">Role</label><select value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))} className="w-full px-3 py-2.5 bg-white/5 border border-white/10 rounded-lg text-sm text-white outline-none focus:border-red-500/50"><option value="" className="bg-navy-900">Select...</option>{(ROLES[form.platform] || []).map(r => <option key={r} value={r} className="bg-navy-900">{r}</option>)}</select></div>
                <div><label className="text-[11px] text-slate-500 uppercase block mb-1">Duration</label><select value={form.duration} onChange={e => setForm(f => ({ ...f, duration: Number(e.target.value) }))} className="w-full px-3 py-2.5 bg-white/5 border border-white/10 rounded-lg text-sm text-white outline-none focus:border-red-500/50">{DURATIONS.map(d => <option key={d.days} value={d.days} className="bg-navy-900">{d.label}</option>)}</select></div>
                <div><label className="text-[11px] text-slate-500 uppercase block mb-1">Justification</label><input value={form.justification} onChange={e => setForm(f => ({ ...f, justification: e.target.value }))} placeholder="Business reason..." className="w-full px-3 py-2.5 bg-white/5 border border-white/10 rounded-lg text-sm text-white placeholder-slate-500 outline-none focus:border-red-500/50" /></div>
              </div>
              <button onClick={handleSubmit} disabled={submitting || !form.role || !form.justification.trim()} className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-red-600 to-red-500 text-white font-semibold text-sm disabled:opacity-40 hover:opacity-90 transition-opacity">{submitting ? 'Submitting...' : 'Submit Request'}</button>
            </GlassCard>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="space-y-2">
        {requests.length === 0 ? (
          <GlassCard hover={false}><p className="text-sm text-slate-500 text-center py-8">No requests yet — create one above</p></GlassCard>
        ) : requests.map((req, i) => {
          const st = STATUS_STYLES[req.status] || STATUS_STYLES.pending;
          const StIcon = st.icon;
          return (
            <GlassCard key={req.id} delay={i * 0.03} hover={false}>
              <div className="flex items-center gap-4">
                <PlatformIcon platform={req.platform} size="md" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2"><span className="text-sm font-semibold text-white">{req.role}</span><span className={`text-[10px] px-2 py-0.5 rounded-full ${st.bg} ${st.color} flex items-center gap-1`}><StIcon size={10} />{st.label}</span></div>
                  <p className="text-[11px] text-slate-500 mt-0.5">{PLATFORM_LABELS[req.platform]} · {req.durationDays}d · {new Date(req.createdAt).toLocaleDateString()}</p>
                  <p className="text-xs text-slate-400 mt-1 truncate">{req.justification}</p>
                </div>
              </div>
            </GlassCard>
          );
        })}
      </div>
    </motion.div>
  );
}
