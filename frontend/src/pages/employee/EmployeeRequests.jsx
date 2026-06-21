import { useState, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Key, Clock, CheckCircle, XCircle, Send, FileText } from 'lucide-react';
import GlassCard from '../../components/shared/GlassCard';
import PlatformIcon from '../../components/shared/PlatformIcon';
import AnimatedCounter from '../../components/shared/AnimatedCounter';
import { useAuth } from '../../context/AuthContext';
import { getAccessRequests, saveAccessRequests } from '../../services/storageService';

const PLATFORM_LABELS = { active_directory: 'Active Directory', aws_iam: 'AWS IAM', okta: 'Okta', salesforce: 'Salesforce' };
const PLATFORMS = ['active_directory', 'aws_iam', 'okta', 'salesforce'];
const DURATIONS = [{ label: '1 Day', days: 1 }, { label: '7 Days', days: 7 }, { label: '14 Days', days: 14 }, { label: '30 Days', days: 30 }];
const STATUS_STYLES = { pending: { label: 'Pending', color: 'text-yellow-400', bg: 'bg-yellow-500/10', icon: Clock }, approved: { label: 'Approved', color: 'text-green-400', bg: 'bg-green-500/10', icon: CheckCircle }, rejected: { label: 'Rejected', color: 'text-red-400', bg: 'bg-red-500/10', icon: XCircle }, expired: { label: 'Expired', color: 'text-slate-400', bg: 'bg-slate-500/10', icon: Clock } };

export default function EmployeeRequests() {
  const { user } = useAuth();
  const [requests, setRequests] = useState(() => getAccessRequests().filter(r => r.employeeEmail === user?.email));
  const [form, setForm] = useState({ platform: 'active_directory', role: '', duration: 7, justification: '' });
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const stats = { total: requests.length, pending: requests.filter(r => r.status === 'pending').length, approved: requests.filter(r => r.status === 'approved').length, rejected: requests.filter(r => r.status === 'rejected').length };

  const handleSubmit = useCallback(() => {
    if (!form.justification.trim() || !form.role) return;
    setSubmitting(true);
    setTimeout(() => {
      const newReq = { id: `REQ-${Date.now()}`, employeeEmail: user.email, employeeName: user.name, platform: form.platform, role: form.role, durationDays: form.duration, justification: form.justification, status: 'pending', createdAt: new Date().toISOString(), expiresAt: null, reviewedBy: null, reviewedAt: null };
      const all = getAccessRequests(); all.push(newReq); saveAccessRequests(all);
      setRequests(prev => [newReq, ...prev]);
      setForm({ platform: 'active_directory', role: '', duration: 7, justification: '' });
      setShowForm(false); setSubmitting(false);
    }, 800);
  }, [form, user]);

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

      <GlassCard hover={false} className="border-red-500/10">
        <h3 className="text-sm font-semibold text-slate-300 mb-4 flex items-center gap-2"><FileText size={14} className="text-red-400" /> Request History</h3>
        {requests.length === 0 ? (<div className="flex flex-col items-center gap-3 py-12"><Key size={40} className="text-slate-700" /><p className="text-sm text-slate-500">No access requests yet</p></div>) : (
          <div className="space-y-2">
            {requests.map((req, i) => { const s = STATUS_STYLES[req.status] || STATUS_STYLES.pending; const SI = s.icon; return (
              <motion.div key={req.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.02 }}
                className="rounded-lg px-4 py-3" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(227,25,55,0.08)' }}>
                <div className="flex items-center gap-4">
                  <PlatformIcon platform={req.platform} size="sm" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2"><span className="text-sm text-white font-medium">{req.role}</span><span className={`flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full ${s.bg} ${s.color}`}><SI size={10} /> {s.label}</span></div>
                    <p className="text-[10px] text-slate-500 mt-0.5">{req.durationDays}d | {req.justification} | {new Date(req.createdAt).toLocaleDateString()}</p>
                  </div>
                  {req.expiresAt && <span className="text-[10px] text-slate-500">Expires: {new Date(req.expiresAt).toLocaleDateString()}</span>}
                </div>
              </motion.div>
            ); })}
          </div>
        )}
      </GlassCard>
    </motion.div>
  );
}
