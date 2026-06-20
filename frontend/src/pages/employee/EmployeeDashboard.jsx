import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Key, Clock, CheckCircle, XCircle, Send, FileText } from 'lucide-react';
import GlassCard from '../../components/shared/GlassCard';
import PlatformIcon from '../../components/shared/PlatformIcon';
import PageHeader from '../../components/shared/PageHeader';
import RoleWelcomeBar from '../../components/shared/RoleWelcomeBar';
import SectionHeader from '../../components/shared/SectionHeader';
import StatCard from '../../components/shared/StatCard';
import { useAuth } from '../../context/AuthContext';
import { getAccessRequests, saveAccessRequests } from '../../services/storageService';

const PLATFORMS = ['active_directory', 'aws_iam', 'okta', 'salesforce', 'github'];
const PLATFORM_LABELS = { active_directory: 'Active Directory', aws_iam: 'AWS IAM', okta: 'Okta', salesforce: 'Salesforce', github: 'GitHub' };
const ROLES = {
  active_directory: ['Read-Only User', 'Helpdesk Operator', 'Server Admin', 'Domain Admin'],
  aws_iam: ['ViewOnlyAccess', 'ReadOnlyAccess', 'PowerUserAccess', 'AdministratorAccess'],
  okta: ['SSO User', 'Group Admin', 'App Admin', 'Org Admin'],
  salesforce: ['Read Only', 'Standard User', 'Report Viewer', 'System Administrator'],
  github: ['Viewer', 'Contributor', 'Maintainer', 'Admin'],
};
const DURATIONS = [
  { label: '1 Day', days: 1 },
  { label: '7 Days', days: 7 },
  { label: '14 Days', days: 14 },
  { label: '30 Days', days: 30 },
];

const STATUS_STYLES = {
  pending: { label: 'Pending', color: 'text-yellow-400', bg: 'bg-yellow-500/10', icon: Clock },
  approved: { label: 'Approved', color: 'text-green-400', bg: 'bg-green-500/10', icon: CheckCircle },
  rejected: { label: 'Rejected', color: 'text-red-400', bg: 'bg-red-500/10', icon: XCircle },
  expired: { label: 'Expired', color: 'text-slate-400', bg: 'bg-slate-500/10', icon: Clock },
};

export default function EmployeeDashboard() {
  const { user } = useAuth();
  const [requests, setRequests] = useState([]);
  const [form, setForm] = useState({ platform: 'active_directory', role: '', duration: 7, justification: '' });
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const all = getAccessRequests();
    setRequests(all.filter(r => r.employeeEmail === user?.email));
  }, [user]);

  useEffect(() => {
    const all = getAccessRequests();
    let changed = false;
    const now = new Date();
    const updated = all.map(r => {
      if (r.status === 'approved' && r.expiresAt && new Date(r.expiresAt) < now) {
        changed = true;
        return { ...r, status: 'expired' };
      }
      return r;
    });
    if (changed) {
      saveAccessRequests(updated);
      setRequests(updated.filter(r => r.employeeEmail === user?.email));
    }
  }, [user]);

  const handleSubmit = useCallback(() => {
    if (!form.justification.trim() || !form.role) return;
    setSubmitting(true);
    setTimeout(() => {
      const newReq = {
        id: `REQ-${Date.now()}`,
        employeeEmail: user.email,
        employeeName: user.name,
        platform: form.platform,
        role: form.role,
        durationDays: form.duration,
        justification: form.justification,
        status: 'pending',
        createdAt: new Date().toISOString(),
        expiresAt: null,
        reviewedBy: null,
        reviewedAt: null,
      };
      const all = getAccessRequests();
      all.push(newReq);
      saveAccessRequests(all);
      setRequests(prev => [newReq, ...prev]);
      setForm({ platform: 'active_directory', role: '', duration: 7, justification: '' });
      setShowForm(false);
      setSubmitting(false);
    }, 800);
  }, [form, user]);

  const stats = {
    total: requests.length,
    pending: requests.filter(r => r.status === 'pending').length,
    approved: requests.filter(r => r.status === 'approved').length,
    rejected: requests.filter(r => r.status === 'rejected').length,
  };

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-5">
      <PageHeader
        badge="Employee Portal · IdentitySphere AI"
        title="My Access Requests"
        subtitle="Request temporary access to platforms and roles — reviewed by security admin"
      />

      <RoleWelcomeBar user={user} />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
        <StatCard label="Total" value={stats.total} icon={FileText} color="text-white" bg="from-white/5 to-white/[0.02]" delay={0.05} />
        <StatCard label="Pending" value={stats.pending} icon={Clock} color="text-yellow-400" bg="from-yellow-500/10 to-amber-500/5" delay={0.1} />
        <StatCard label="Approved" value={stats.approved} icon={CheckCircle} color="text-green-400" bg="from-green-500/10 to-emerald-500/5" delay={0.15} />
        <StatCard label="Rejected" value={stats.rejected} icon={XCircle} color="text-red-400" bg="from-red-500/10 to-rose-500/5" delay={0.2} />
      </div>

      <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} onClick={() => setShowForm(!showForm)}
        className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-red-600 to-red-500 text-white font-semibold text-sm font-orbitron uppercase tracking-wider hover:opacity-90 transition-opacity flex items-center gap-2 shadow-lg shadow-red-500/20">
        <Send size={16} /> New Access Request
      </motion.button>

      <AnimatePresence>
        {showForm && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
            <GlassCard hover={false} className="border-red-500/25">
              <SectionHeader title="Request Access" icon={Key} titleClassName="text-red-400" />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
                <div>
                  <label className="form-label block mb-1.5">Platform</label>
                  <select value={form.platform} onChange={e => setForm(f => ({ ...f, platform: e.target.value, role: '' }))}
                    className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white outline-none focus:border-red-500/50">
                    {PLATFORMS.map(p => <option key={p} value={p} className="bg-navy-900">{PLATFORM_LABELS[p]}</option>)}
                  </select>
                </div>
                <div>
                  <label className="form-label block mb-1.5">Requested Role</label>
                  <select value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))}
                    className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white outline-none focus:border-red-500/50">
                    <option value="" className="bg-navy-900">Select role...</option>
                    {(ROLES[form.platform] || []).map(r => <option key={r} value={r} className="bg-navy-900">{r}</option>)}
                  </select>
                </div>
                <div>
                  <label className="form-label block mb-1.5">Duration</label>
                  <select value={form.duration} onChange={e => setForm(f => ({ ...f, duration: Number(e.target.value) }))}
                    className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white outline-none focus:border-red-500/50">
                    {DURATIONS.map(d => <option key={d.days} value={d.days} className="bg-navy-900">{d.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="form-label block mb-1.5">Business Justification</label>
                  <input value={form.justification} onChange={e => setForm(f => ({ ...f, justification: e.target.value }))}
                    placeholder="Reason for access..."
                    className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white placeholder-slate-500 outline-none focus:border-red-500/50" />
                </div>
              </div>
              <button onClick={handleSubmit} disabled={submitting || !form.role || !form.justification.trim()}
                className="px-5 py-2 rounded-xl bg-gradient-to-r from-red-600 to-red-500 text-white font-orbitron text-xs uppercase tracking-wider disabled:opacity-40 hover:opacity-90 transition-opacity">
                {submitting ? 'Submitting...' : 'Submit Request'}
              </button>
            </GlassCard>
          </motion.div>
        )}
      </AnimatePresence>

      <GlassCard hover={false} className="border-red-500/10">
        <SectionHeader title="My Requests" icon={FileText} />
        {requests.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-10">
            <Key size={36} className="text-slate-700" />
            <p className="text-sm text-slate-500 font-orbitron tracking-wide">No access requests yet</p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {requests.map((req, i) => {
              const statusCfg = STATUS_STYLES[req.status] || STATUS_STYLES.pending;
              const StatusIcon = statusCfg.icon;
              return (
                <motion.div key={req.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}
                  className="rounded-xl p-3 flex items-center gap-3"
                  style={{ background: 'linear-gradient(145deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.02) 100%)', border: '1px solid rgba(227,25,55,0.15)' }}>
                  <PlatformIcon platform={req.platform} size="lg" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="text-sm font-semibold text-white font-orbitron tracking-wide">{req.role}</span>
                      <span className="text-[10px] text-slate-500 font-orbitron">on {PLATFORM_LABELS[req.platform]}</span>
                      <span className={`flex items-center gap-1 text-[9px] px-2 py-0.5 rounded-full font-orbitron uppercase tracking-wider ${statusCfg.bg} ${statusCfg.color}`}>
                        <StatusIcon size={10} /> {statusCfg.label}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-[10px] text-slate-500 font-orbitron flex-wrap">
                      <span>{req.durationDays} day(s)</span>
                      <span className="text-white/10">·</span>
                      <span>{new Date(req.createdAt).toLocaleDateString()}</span>
                      {req.expiresAt && <><span className="text-white/10">·</span><span>Expires {new Date(req.expiresAt).toLocaleDateString()}</span></>}
                    </div>
                    <p className="text-xs text-slate-400 mt-1 line-clamp-2">{req.justification}</p>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </GlassCard>
    </motion.div>
  );
}
