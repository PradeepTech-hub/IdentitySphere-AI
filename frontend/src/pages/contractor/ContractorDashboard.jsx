import { useState, useCallback, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  Clock, Cloud, Server, AlertTriangle, Bell, FileText, ExternalLink,
  Lock, Scale, UserCheck, Eye, Mail, Calendar, Building2,
} from 'lucide-react';
import GlassCard from '../../components/shared/GlassCard';
import PageHeader from '../../components/shared/PageHeader';
import RoleWelcomeBar from '../../components/shared/RoleWelcomeBar';
import SectionHeader from '../../components/shared/SectionHeader';
import StatCard from '../../components/shared/StatCard';
import { useAuth } from '../../context/AuthContext';

const EXPIRY_DATE = 'May 23, 2025';
const DAYS_REMAINING = 64;
const ACCOUNT_CREATED = 'Feb 18, 2025';

const ASSIGNED_RESOURCES = [
  { name: 'Salesforce Sandbox', type: 'CRM', access: 'Read / Write', lastAccessed: 'Jun 20, 2025' },
  { name: 'Active Directory (ReadOnly)', type: 'Identity', access: 'Read Only', lastAccessed: 'Jun 19, 2025' },
  { name: 'AWS Dev Environment', type: 'Cloud', access: 'Read / Write', lastAccessed: 'Jun 18, 2025' },
];

const SECURITY_ALERTS = [
  { title: 'Unusual Login Detected', severity: 'High', detail: 'Login from new IP address · Reviewed automatically', time: '2 hours ago' },
  { title: 'Password Expires in 5 Days', severity: 'Medium', detail: 'Rotate password before expiry to avoid lockout', time: 'Today' },
  { title: 'Session Limit Approaching', severity: 'Low', detail: '7.5 hrs used of 8 hr daily limit', time: 'Yesterday' },
];

const COMPLIANCE_NOTICES = [
  { title: 'Acceptable Use Policy', ref: 'AUP-2025-v3' },
  { title: 'GDPR Data Processing Notice', ref: 'GDPR Art. 5' },
  { title: 'Contractor Security Guidelines', ref: 'NIST AC-2' },
  { title: 'Temporary Account Terms', ref: 'ISO 27001 A.9' },
];

const SEV_STYLE = {
  High: 'bg-red-500/15 text-red-400 border-red-500/25',
  Medium: 'bg-orange-500/15 text-orange-400 border-orange-500/25',
  Low: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/25',
};

function scrollTo(id) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

export default function ContractorDashboard() {
  const { user } = useAuth();
  const [extensionSent, setExtensionSent] = useState(false);

  useEffect(() => {
    const hash = window.location.hash.slice(1);
    if (hash) setTimeout(() => scrollTo(hash), 300);
  }, []);

  const requestExtension = useCallback(() => {
    setExtensionSent(true);
    setTimeout(() => setExtensionSent(false), 4000);
  }, []);

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-5">
      <PageHeader
        badge="Contractor Portal · IdentitySphere AI"
        title="Contractor Access Portal"
        subtitle="Temporary limited access — assigned systems only. No privilege changes permitted."
      />

      <RoleWelcomeBar user={user} />

      <GlassCard hover={false} className="!p-4 border-amber-500/30 bg-amber-500/[0.08]">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-start gap-3 min-w-0">
            <AlertTriangle size={20} className="text-amber-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-orbitron font-bold text-amber-300 uppercase tracking-wider">Expiration Notice</p>
              <p className="text-sm text-white mt-1">
                Your account will expire on <strong className="text-amber-400">{EXPIRY_DATE}</strong>
              </p>
              <p className="text-[11px] text-slate-400 mt-0.5">
                <span className="text-amber-400 font-semibold">{DAYS_REMAINING}</span> days remaining · 90-day temporary account policy
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={requestExtension}
            className="shrink-0 inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold text-white bg-gradient-to-r from-orange-600 to-orange-700 border border-orange-500/30 hover:from-orange-500 hover:to-orange-600 transition-all"
          >
            <Mail size={14} />
            Request Extension
          </button>
        </div>
        {extensionSent && (
          <p className="text-[11px] text-green-400 mt-3 ml-8">Extension request submitted. Your supervisor will review within 2 business days.</p>
        )}
      </GlassCard>

      <div className="grid lg:grid-cols-3 gap-4">
        <GlassCard hover={false} delay={0.1} className="lg:col-span-2" id="resources">
          <SectionHeader title="Assigned Systems / Resources" icon={Server} iconClassName="text-orange-400" titleClassName="text-orange-300" />
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[10px] text-slate-500 uppercase border-b border-white/5 font-orbitron tracking-wider">
                  <th className="text-left pb-2.5 font-medium">Resource Name</th>
                  <th className="text-left pb-2.5 font-medium">Type</th>
                  <th className="text-left pb-2.5 font-medium">Access Level</th>
                  <th className="text-left pb-2.5 font-medium">Last Accessed</th>
                </tr>
              </thead>
              <tbody>
                {ASSIGNED_RESOURCES.map((r, i) => (
                  <motion.tr key={r.name} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.12 + i * 0.04 }}
                    className="border-b border-white/[0.03] hover:bg-white/[0.02]">
                    <td className="py-2.5 text-white text-xs font-medium">{r.name}</td>
                    <td className="py-2.5 text-slate-400 text-xs">{r.type}</td>
                    <td className="py-2.5">
                      <span className="text-[10px] px-2 py-0.5 rounded-full border bg-green-500/10 text-green-400 border-green-500/20">{r.access}</span>
                    </td>
                    <td className="py-2.5 text-slate-500 text-[11px] font-mono">{r.lastAccessed}</td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
          <button
            type="button"
            onClick={() => scrollTo('resources')}
            className="mt-3 text-[10px] text-orange-400 hover:text-orange-300 transition-colors"
          >
            View Assigned Resources →
          </button>
        </GlassCard>

        <div className="space-y-4">
          <GlassCard hover={false} delay={0.12}>
            <SectionHeader title="Quick Actions" icon={Eye} iconClassName="text-orange-400" titleClassName="text-orange-300" />
            <div className="space-y-2">
              <button type="button" onClick={() => scrollTo('resources')}
                className="w-full px-4 py-3 rounded-xl text-xs font-semibold text-white bg-white/5 border border-white/10 hover:bg-white/10 transition-all text-left">
                View Assigned Resources
              </button>
              <button type="button" onClick={requestExtension}
                className="w-full px-4 py-3 rounded-xl text-xs font-semibold text-white bg-gradient-to-r from-orange-600/80 to-orange-700/80 border border-orange-500/30 hover:from-orange-500 hover:to-orange-600 transition-all text-left">
                Request Extension
              </button>
            </div>
          </GlassCard>

          <GlassCard hover={false} delay={0.14}>
            <SectionHeader title="Account Summary" icon={UserCheck} iconClassName="text-orange-400" titleClassName="text-orange-300" />
            <dl className="space-y-2 text-[11px]">
              <div className="flex justify-between gap-2">
                <dt className="text-slate-500">Role</dt>
                <dd className="text-white">Contractor</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-slate-500">Department</dt>
                <dd className="text-white">IT Projects</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-slate-500">Account Created</dt>
                <dd className="text-slate-300 font-mono text-[10px]">{ACCOUNT_CREATED}</dd>
              </div>
              <div className="flex justify-between gap-2 pt-2 border-t border-white/5">
                <dt className="text-slate-500">Days Remaining</dt>
                <dd className="text-amber-400 font-semibold">{DAYS_REMAINING} Days</dd>
              </div>
            </dl>
          </GlassCard>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <GlassCard hover={false} delay={0.16} className="lg:col-span-2" id="alerts">
          <SectionHeader title="Security Alerts" icon={Bell} iconClassName="text-orange-400" titleClassName="text-orange-300" subtitle="Notifications relevant to your contractor activity" />
          <div className="space-y-2">
            {SECURITY_ALERTS.map((a, i) => (
              <motion.div key={a.title} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.18 + i * 0.04 }}
                className="flex items-start gap-3 p-3 rounded-xl"
                style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(249,115,22,0.12)' }}>
                <AlertTriangle size={14} className="text-orange-400 shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-0.5">
                    <span className="text-sm font-semibold text-white">{a.title}</span>
                    <span className={`text-[9px] px-2 py-0.5 rounded-full border ${SEV_STYLE[a.severity]}`}>{a.severity}</span>
                  </div>
                  <p className="text-[11px] text-slate-500">{a.detail}</p>
                  <p className="text-[10px] text-slate-600 mt-1">{a.time}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </GlassCard>

        <GlassCard hover={false} delay={0.18} id="compliance">
          <SectionHeader title="Compliance Notices" icon={FileText} iconClassName="text-orange-400" titleClassName="text-orange-300" subtitle="Read-only · No privilege changes" />
          <ul className="space-y-2">
            {COMPLIANCE_NOTICES.map((n) => (
              <li key={n.title}
                className="flex items-center justify-between gap-2 p-2.5 rounded-lg bg-white/[0.03] border border-white/5">
                <div className="min-w-0">
                  <p className="text-[11px] text-white truncate">{n.title}</p>
                  <p className="text-[9px] text-slate-500 font-mono">{n.ref}</p>
                </div>
                <ExternalLink size={12} className="text-slate-500 shrink-0" />
              </li>
            ))}
          </ul>
        </GlassCard>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
        <StatCard label="Assigned Resources" value={ASSIGNED_RESOURCES.length} icon={Cloud} color="text-orange-400" bg="from-orange-500/10 to-amber-500/5" delay={0.2} />
        <StatCard label="Active Alerts" value={SECURITY_ALERTS.length} icon={Bell} color="text-red-400" bg="from-red-500/10 to-rose-500/5" delay={0.22} />
        <StatCard label="Session Limit" value={8} suffix=" hrs" icon={Clock} color="text-blue-400" bg="from-blue-500/10 to-cyan-500/5" delay={0.24} />
        <StatCard label="Days Left" value={DAYS_REMAINING} icon={Calendar} color="text-amber-400" bg="from-amber-500/10 to-yellow-500/5" delay={0.26} />
      </div>

      <GlassCard hover={false} delay={0.28} className="!p-3 border-orange-500/20 bg-orange-500/[0.04]">
        <div className="flex items-start gap-3">
          <Lock size={16} className="text-orange-400 shrink-0 mt-0.5" />
          <div>
            <h4 className="text-xs font-orbitron font-bold text-orange-300 uppercase tracking-wider mb-1">Limited Access Mode</h4>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              You can only access assigned systems. No privilege changes beyond assigned resources are permitted. All actions are logged and monitored.
            </p>
          </div>
        </div>
      </GlassCard>

      <div id="documentation">
        <SectionHeader title="Documentation" icon={FileText} iconClassName="text-orange-400" titleClassName="text-orange-300" subtitle="Security, compliance, and role alignment for contractor access" />
        <div className="grid md:grid-cols-3 gap-4 mt-3">
          <GlassCard hover={false} delay={0.3}>
            <div className="flex items-center gap-2 mb-3">
              <Lock size={14} className="text-orange-400" />
              <h3 className="text-sm font-bold text-white">Security</h3>
            </div>
            <ul className="text-[11px] text-slate-400 space-y-2 leading-relaxed">
              <li>MFA enforced for all contractor sessions</li>
              <li>Strict 90-day account expiration</li>
              <li>15-minute session timeout on inactivity</li>
              <li>All actions logged (timestamp, IP, device)</li>
              <li>8-hour daily session limit enforced</li>
            </ul>
          </GlassCard>
          <GlassCard hover={false} delay={0.32}>
            <div className="flex items-center gap-2 mb-3">
              <Scale size={14} className="text-cyan-400" />
              <h3 className="text-sm font-bold text-white">Compliance</h3>
            </div>
            <ul className="text-[11px] text-slate-400 space-y-2 leading-relaxed">
              <li>NIST SP 800-53 AC-2 — Account Management</li>
              <li>GDPR Article 5 — Data Minimization</li>
              <li>ISO/IEC 27001 — Access control requirements</li>
            </ul>
          </GlassCard>
          <GlassCard hover={false} delay={0.34}>
            <div className="flex items-center gap-2 mb-3">
              <Building2 size={14} className="text-orange-400" />
              <h3 className="text-sm font-bold text-white">Role Alignment</h3>
            </div>
            <ul className="text-[11px] text-slate-400 space-y-2 leading-relaxed">
              <li>Contractors restricted to temporary, limited access</li>
              <li>Access scoped to business need and assigned resources</li>
              <li>Extensions may be requested — privilege changes are not permitted</li>
              <li>Supports separation of duties for external workforce</li>
            </ul>
          </GlassCard>
        </div>
      </div>
    </motion.div>
  );
}
