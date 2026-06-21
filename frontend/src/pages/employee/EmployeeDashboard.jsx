import { useState, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Key, Clock, CheckCircle, XCircle, Send, Shield, FileText, AlertTriangle,
  Server, Sparkles, Lock, Unlock, Activity, Eye, TrendingDown, Smartphone,
} from 'lucide-react';
import GlassCard from '../../components/shared/GlassCard';
import PlatformIcon from '../../components/shared/PlatformIcon';
import SeverityBadge from '../../components/shared/SeverityBadge';
import AnimatedCounter from '../../components/shared/AnimatedCounter';
import { useAuth } from '../../context/AuthContext';
import { getIdentities, getAccessRequests, saveAccessRequests } from '../../services/storageService';

const PLATFORMS = ['active_directory', 'aws_iam', 'okta', 'salesforce'];
const ROLES = {
  active_directory: ['Read-Only User', 'Helpdesk Operator', 'Server Admin'],
  aws_iam: ['ViewOnlyAccess', 'ReadOnlyAccess', 'PowerUserAccess'],
  okta: ['SSO User', 'Group Admin', 'App Admin'],
  salesforce: ['Read Only', 'Standard User', 'Report Viewer'],
};
const PLATFORM_LABELS = { active_directory: 'Active Directory', aws_iam: 'AWS IAM', okta: 'Okta', salesforce: 'Salesforce' };const ROLE_MAP = { active_directory: 'Domain User', aws_iam: 'ReadOnlyAccess', okta: 'SSO User', salesforce: 'Standard User' };
const DURATIONS = [{ label: '1 Day', days: 1 }, { label: '7 Days', days: 7 }, { label: '14 Days', days: 14 }, { label: '30 Days', days: 30 }];
const STATUS_STYLES = {
  pending: { label: 'Pending', color: 'text-yellow-400', bg: 'bg-yellow-500/10', icon: Clock },
  approved: { label: 'Approved', color: 'text-green-400', bg: 'bg-green-500/10', icon: CheckCircle },
  rejected: { label: 'Rejected', color: 'text-red-400', bg: 'bg-red-500/10', icon: XCircle },
  expired: { label: 'Expired', color: 'text-slate-400', bg: 'bg-slate-500/10', icon: Clock },
};


export default function EmployeeDashboard() {
  const { user } = useAuth();

  const myIdentity = useMemo(() => {
    const all = getIdentities();
    return all.find(i => i.email === user?.email || i.display_name === user?.name) || null;
  }, [user]);

  const myRequests = useMemo(() => {
    return getAccessRequests().filter(r => r.employeeEmail === user?.email);
  }, [user]);

  const myPlatforms = myIdentity?.platforms || [];
  const pendingCount = myRequests.filter(r => r.status === 'pending').length;
  const approvedCount = myRequests.filter(r => r.status === 'approved').length;
  const expiringSoon = myRequests.filter(r => r.status === 'approved' && r.expiresAt && (new Date(r.expiresAt) - Date.now()) < 7 * 86400000 && new Date(r.expiresAt) > Date.now());

  const hygieneScore = useMemo(() => {
    let score = 100;
    if (!myIdentity?.mfa_complete) score -= 25;
    if ((myIdentity?.max_dormancy_days || 0) > 90) score -= 20;
    if (myIdentity?.is_admin) score -= 10;
    if (myPlatforms.length > 3) score -= 5;
    if (pendingCount > 0) score -= 5;
    return Math.max(0, score);
  }, [myIdentity, myPlatforms, pendingCount]);

  const aiRecommendations = useMemo(() => {
    const recs = [];
    if (!myIdentity?.mfa_complete) recs.push({ text: 'Enable MFA on all accounts to improve security posture', priority: 'high' });
    if ((myIdentity?.max_dormancy_days || 0) > 90) recs.push({ text: `Review dormant access (${myIdentity.max_dormancy_days} days inactive)`, priority: 'medium' });
    if (myPlatforms.length === 0) recs.push({ text: 'No applications assigned — request access to get started', priority: 'low' });
    if (expiringSoon.length > 0) recs.push({ text: `${expiringSoon.length} access grant(s) expiring within 7 days — renew if needed`, priority: 'medium' });
    if (recs.length === 0) recs.push({ text: 'Your access hygiene is excellent — no actions needed', priority: 'low' });
    return recs;
  }, [myIdentity, myPlatforms, expiringSoon]);

  const recentActivity = useMemo(() => {
    return myRequests.slice(0, 5).map(r => ({
      id: r.id, action: r.status === 'pending' ? 'Requested' : r.status === 'approved' ? 'Granted' : r.status === 'rejected' ? 'Denied' : 'Expired',
      detail: `${r.role} on ${PLATFORM_LABELS[r.platform] || r.platform}`, time: r.createdAt || r.reviewedAt,
    }));
  }, [myRequests]);

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Welcome, {user?.name || 'Employee'}</h1>
        <p className="text-slate-400 text-sm mt-1">Self-service portal — manage your applications, roles, and access requests</p>
      </div>

      {/* Top Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {[
          { label: 'Applications', value: myPlatforms.length, color: 'text-blue-400', icon: Server },
          { label: 'Pending', value: pendingCount, color: 'text-yellow-400', icon: Clock },
          { label: 'Approved', value: approvedCount, color: 'text-green-400', icon: CheckCircle },
          { label: 'Expiring Soon', value: expiringSoon.length, color: 'text-orange-400', icon: AlertTriangle },
          { label: 'Hygiene Score', value: hygieneScore, color: hygieneScore >= 80 ? 'text-emerald-400' : hygieneScore >= 50 ? 'text-yellow-400' : 'text-red-400', icon: Shield, suffix: '%' },
        ].map((s, i) => (
          <GlassCard key={s.label} delay={i * 0.05}>
            <div className="flex items-center gap-3 p-1"><s.icon className={`w-5 h-5 ${s.color} opacity-60`} /><div><AnimatedCounter value={s.value} suffix={s.suffix || ''} className={`text-2xl font-bold ${s.color}`} /><p className="text-[10px] text-slate-500 uppercase tracking-wider">{s.label}</p></div></div>
          </GlassCard>
        ))}
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Security Status */}
        <GlassCard hover={false} delay={0.1}>
          <h3 className="text-sm font-semibold text-slate-300 mb-4 flex items-center gap-2"><Shield size={14} className="text-red-400" /> Security Status</h3>
          <div className="space-y-3">
            {[
              { label: 'MFA', ok: myIdentity?.mfa_complete, good: 'Enabled on all accounts', bad: 'Not enabled — enable immediately', icon: Lock },
              { label: 'Account Status', ok: myIdentity?.status === 'Active', good: `Active`, bad: myIdentity?.status || 'Unknown', icon: CheckCircle },
              { label: 'Dormancy', ok: (myIdentity?.max_dormancy_days || 0) < 30, good: 'Active usage', bad: `${myIdentity?.max_dormancy_days || 0} days dormant`, icon: Clock },
              { label: 'Risk Level', ok: (myIdentity?.risk_score || 0) < 40, good: `Low (${myIdentity?.risk_score || 0})`, bad: `${myIdentity?.severity || 'medium'} (${myIdentity?.risk_score || 0})`, icon: AlertTriangle },
            ].map(item => (
              <div key={item.label} className="flex items-center justify-between py-2 px-3 rounded-lg" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
                <div className="flex items-center gap-2"><item.icon size={14} className={item.ok ? 'text-emerald-400' : 'text-red-400'} /><span className="text-sm text-slate-300">{item.label}</span></div>
                <span className={`text-xs font-semibold ${item.ok ? 'text-emerald-400' : 'text-red-400'}`}>{item.ok ? item.good : item.bad}</span>
              </div>
            ))}
          </div>
        </GlassCard>

        {/* AI Recommendations */}
        <GlassCard hover={false} delay={0.15}>
          <h3 className="text-sm font-semibold text-slate-300 mb-4 flex items-center gap-2"><Sparkles size={14} className="text-amber-400" /> AI Recommendations</h3>
          <div className="space-y-2">
            {aiRecommendations.map((rec, i) => (
              <motion.div key={i} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.2 + i * 0.05 }}
                className="flex items-start gap-3 px-3 py-2.5 rounded-lg" style={{ background: rec.priority === 'high' ? 'rgba(239,68,68,0.05)' : rec.priority === 'medium' ? 'rgba(234,179,8,0.05)' : 'rgba(34,197,94,0.05)', border: `1px solid ${rec.priority === 'high' ? 'rgba(239,68,68,0.12)' : rec.priority === 'medium' ? 'rgba(234,179,8,0.12)' : 'rgba(34,197,94,0.12)'}` }}>
                <Sparkles size={12} className={rec.priority === 'high' ? 'text-red-400' : rec.priority === 'medium' ? 'text-yellow-400' : 'text-green-400'} />
                <span className="text-xs text-slate-300">{rec.text}</span>
              </motion.div>
            ))}
          </div>
        </GlassCard>
      </div>

      {/* My Applications */}
      <GlassCard hover={false} delay={0.2}>
        <h3 className="text-sm font-semibold text-slate-300 mb-4 flex items-center gap-2"><Server size={14} className="text-blue-400" /> My Applications</h3>
        {myPlatforms.length > 0 ? (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {myPlatforms.map((p, i) => (
              <motion.div key={p} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 + i * 0.04 }}
                className="rounded-lg p-3 flex items-center gap-3" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
                <PlatformIcon platform={p} size="lg" />
                <div>
                  <p className="text-sm text-white font-medium">{PLATFORM_LABELS[p] || p}</p>
                  <p className="text-[10px] text-slate-500">{ROLE_MAP[p] || 'User'}</p>
                </div>
              </motion.div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-slate-500 italic">No applications assigned</p>
        )}
      </GlassCard>

      {/* Expiring Access */}
      {expiringSoon.length > 0 && (
        <GlassCard hover={false} className="border-orange-500/20">
          <h3 className="text-sm font-semibold text-orange-400 mb-3 flex items-center gap-2"><AlertTriangle size={14} /> Expiring Access ({expiringSoon.length})</h3>
          <div className="space-y-2">
            {expiringSoon.map(req => (
              <div key={req.id} className="flex items-center justify-between px-3 py-2 rounded-lg" style={{ background: 'rgba(249,115,22,0.05)', border: '1px solid rgba(249,115,22,0.12)' }}>
                <div className="flex items-center gap-2"><PlatformIcon platform={req.platform} size="sm" /><span className="text-xs text-white">{req.role}</span></div>
                <span className="text-[10px] text-orange-400">Expires: {new Date(req.expiresAt).toLocaleDateString()}</span>
              </div>
            ))}
          </div>
        </GlassCard>
      )}

      {/* Recent Activity */}
      {recentActivity.length > 0 && (
        <GlassCard hover={false} delay={0.25}>
          <h3 className="text-sm font-semibold text-slate-300 mb-3 flex items-center gap-2"><Activity size={14} className="text-red-400" /> Recent Activity</h3>
          <div className="space-y-2">
            {recentActivity.map(a => (
              <div key={a.id} className="flex items-center justify-between px-3 py-2 rounded-lg" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
                <div className="flex items-center gap-2">
                  <span className={`text-[10px] px-2 py-0.5 rounded font-semibold ${a.action === 'Granted' ? 'bg-green-500/10 text-green-400' : a.action === 'Denied' ? 'bg-red-500/10 text-red-400' : 'bg-yellow-500/10 text-yellow-400'}`}>{a.action}</span>
                  <span className="text-xs text-slate-300">{a.detail}</span>
                </div>
                {a.time && <span className="text-[10px] text-slate-500">{new Date(a.time).toLocaleDateString()}</span>}
              </div>
            ))}
          </div>
        </GlassCard>
      )}
    </motion.div>
  );
}
