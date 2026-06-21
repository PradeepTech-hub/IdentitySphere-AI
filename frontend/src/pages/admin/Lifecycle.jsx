import { useState, useCallback, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  UserPlus, UserMinus, ArrowRightLeft, Shield, CheckCircle, XCircle,
  Clock, AlertTriangle, Search, ChevronRight, Users, Activity, FileText,
  Eye, Hash, Server,
} from 'lucide-react';
import GlassCard from '../../components/shared/GlassCard';
import PlatformIcon from '../../components/shared/PlatformIcon';
import AnimatedCounter from '../../components/shared/AnimatedCounter';
import { useNavigate } from 'react-router-dom';
import SeverityBadge from '../../components/shared/SeverityBadge';
import {
  getLifecycleEvents, saveLifecycleEvents,
  addIdentity, getIdentities, updateIdentity,
} from '../../services/storageService';
import { usePlatformData } from '../../context/PlatformDataContext';


const LIFECYCLE_STATES = {
  joiner: { label: 'Joiner', icon: UserPlus, color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/30' },
  mover: { label: 'Mover', icon: ArrowRightLeft, color: 'text-blue-400', bg: 'bg-blue-500/10', border: 'border-blue-500/30' },
  leaver: { label: 'Leaver', icon: UserMinus, color: 'text-red-400', bg: 'bg-red-500/10', border: 'border-red-500/30' },
};

const BASELINE_ACCESS = {
  Engineering: { platforms: ['active_directory', 'aws_iam', 'okta', 'salesforce'], roles: ['Developer', 'Read-Only', 'SSO User', 'Contributor'], groups: ['Engineering-Team', 'VPN-Users', 'Okta-Engineering'] },
  Finance: { platforms: ['active_directory', 'okta', 'salesforce'], roles: ['Finance-User', 'SSO User', 'Report-Viewer'], groups: ['Finance-Team', 'VPN-Users', 'Okta-Finance'] },
  Sales: { platforms: ['active_directory', 'okta', 'salesforce'], roles: ['Sales-User', 'SSO User', 'CRM-User'], groups: ['Sales-Team', 'VPN-Users', 'Okta-Sales'] },
  Marketing: { platforms: ['active_directory', 'okta', 'salesforce'], roles: ['Marketing-User', 'SSO User', 'Campaign-Viewer'], groups: ['Marketing-Team', 'VPN-Users', 'Okta-Marketing'] },
  Security: { platforms: ['active_directory', 'aws_iam', 'okta'], roles: ['Security-Analyst', 'SSO User', 'Security-Viewer'], groups: ['Security-Team', 'VPN-Users', 'Okta-Security'] },
  'IT Operations': { platforms: ['active_directory', 'aws_iam', 'okta'], roles: ['IT-Support', 'SSO User', 'Infra-Viewer'], groups: ['IT-Ops-Team', 'VPN-Users', 'Okta-IT'] },
  Legal: { platforms: ['active_directory', 'okta'], roles: ['Legal-User', 'SSO User'], groups: ['Legal-Team', 'VPN-Users', 'Okta-Legal'] },
  Product: { platforms: ['active_directory', 'okta', 'salesforce'], roles: ['Product-User', 'SSO User', 'Viewer'], groups: ['Product-Team', 'VPN-Users', 'Okta-Product'] },
  HR: { platforms: ['active_directory', 'okta'], roles: ['HR-User', 'SSO User'], groups: ['HR-Team', 'VPN-Users', 'Okta-HR'] },
  DevOps: { platforms: ['active_directory', 'aws_iam', 'okta', 'salesforce'], roles: ['DevOps-Engineer', 'PowerUser', 'SSO User', 'Maintainer'], groups: ['DevOps-Team', 'VPN-Users', 'Okta-DevOps'] },
};

const DEPARTMENTS = Object.keys(BASELINE_ACCESS);

const PLATFORM_LABELS = { active_directory: 'Active Directory', aws_iam: 'AWS IAM', okta: 'Okta', salesforce: 'Salesforce' };
const STATUS_STYLES = {
  completed: { label: 'Completed', color: 'text-green-400', bg: 'bg-green-500/10', icon: CheckCircle },
  in_progress: { label: 'In Progress', color: 'text-blue-400', bg: 'bg-blue-500/10', icon: Clock },
  pending_review: { label: 'Pending Review', color: 'text-yellow-400', bg: 'bg-yellow-500/10', icon: Eye },
  failed: { label: 'Failed', color: 'text-red-400', bg: 'bg-red-500/10', icon: XCircle },
};

function IdentitySuggestInput({ value, onChange, onSelect, placeholder, borderColor = 'border-white/10', focusBorder = 'focus:border-red-500/50' }) {
  const [showSuggestions, setShowSuggestions] = useState(false);
  const identities = useMemo(() => getIdentities().filter(i => i.status !== 'Offboarded' && i.status !== 'Disabled' && i.type === 'Human'), []);

  const filtered = useMemo(() => {
    if (!value.trim()) return identities.slice(0, 8);
    const q = value.toLowerCase();
    return identities.filter(i =>
      i.display_name?.toLowerCase().includes(q) ||
      i.person_id?.toLowerCase().includes(q) ||
      i.email?.toLowerCase().includes(q)
    ).slice(0, 8);
  }, [value, identities]);

  return (
    <div className="relative">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
      <input
        value={value}
        onChange={e => { onChange(e.target.value); setShowSuggestions(true); }}
        onFocus={() => setShowSuggestions(true)}
        placeholder={placeholder}
        className={`w-full pl-9 pr-3 py-2.5 bg-white/5 border ${borderColor} rounded-lg text-sm text-white placeholder-slate-500 outline-none ${focusBorder}`}
      />
      <AnimatePresence>
        {showSuggestions && filtered.length > 0 && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setShowSuggestions(false)} />
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              className="absolute z-50 top-full mt-1 left-0 right-0 max-h-52 overflow-y-auto rounded-xl"
              style={{ background: 'rgba(8,10,18,0.98)', border: '1px solid rgba(227,25,55,0.2)', backdropFilter: 'blur(20px)' }}
            >
              {filtered.map(id => (
                <button
                  key={id.person_id}
                  onClick={() => { onSelect(id); setShowSuggestions(false); }}
                  className="w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-white/5 transition-colors border-b border-white/3 last:border-0"
                >
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center text-[10px] font-bold shrink-0"
                    style={{ background: 'rgba(227,25,55,0.12)', color: '#E31937', border: '1px solid rgba(227,25,55,0.25)' }}>
                    {(id.display_name || '?')[0]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white font-medium truncate">{id.display_name}</p>
                    <p className="text-[10px] text-slate-500">{id.department} | {id.person_id}</p>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    {(id.platforms || []).slice(0, 3).map(p => <PlatformIcon key={p} platform={p} size="sm" />)}
                  </div>
                </button>
              ))}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function Lifecycle() {
  const navigate = useNavigate();
  const { data: platformData } = usePlatformData();
  const [events, setEvents] = useState(() => getLifecycleEvents());
  const [activeTab, setActiveTab] = useState('all');

  useEffect(() => {
    const pipelineEvents = platformData?.lifecycle_events || [];
    const localOnly = getLifecycleEvents().filter((e) => e.source !== 'pipeline');
    const merged = [...pipelineEvents, ...localOnly];
    const seen = new Set();
    const unique = merged.filter((e) => {
      const key = e.id || `${e.type}-${e.identity}-${e.date}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    setEvents(unique.sort((a, b) => (b.date || '').localeCompare(a.date || '')));
  }, [platformData]);
  const [showJoinerForm, setShowJoinerForm] = useState(false);
  const [showMoverForm, setShowMoverForm] = useState(false);
  const [showLeaverForm, setShowLeaverForm] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [expandedEvent, setExpandedEvent] = useState(null);

  const [joinerForm, setJoinerForm] = useState({ name: '', department: 'Engineering', title: '' });
  const [moverForm, setMoverForm] = useState({ identity: '', personId: '', fromDept: 'Engineering', toDept: 'Sales' });
  const [leaverForm, setLeaverForm] = useState({ identity: '', personId: '', department: 'Engineering', reason: 'Resignation' });

  const offboardingGaps = useMemo(() => {
    const ids = getIdentities();
    return ids.filter(i => (i.status === 'Orphaned' || i.status === 'Offboarded') && (i.platforms?.length || 0) > 0);
  }, [events]);

  const filteredEvents = activeTab === 'all'
    ? events
    : activeTab === 'pending'
      ? events.filter(e => e.status === 'pending_review')
      : events.filter(e => e.type === activeTab);

  const stats = {
    total: events.length,
    joiners: events.filter(e => e.type === 'joiner').length,
    movers: events.filter(e => e.type === 'mover').length,
    leavers: events.filter(e => e.type === 'leaver').length,
    pending: events.filter(e => e.status === 'pending_review').length,
  };

  const handleJoiner = useCallback(() => {
    if (!joinerForm.name.trim()) return;
    setProcessing(true);
    const dept = joinerForm.department;
    const baseline = BASELINE_ACCESS[dept] || BASELINE_ACCESS.Engineering;

    setTimeout(() => {
      const newEvent = {
        id: `JML-${Date.now()}`,
        type: 'joiner',
        identity: joinerForm.name,
        department: dept,
        date: new Date().toISOString().split('T')[0],
        status: 'in_progress',
        platforms: baseline.platforms,
        actions: baseline.platforms.map((p, i) => `${baseline.roles[i] || 'User'} provisioned on ${p.replace('_', ' ')}`),
        approver: 'Pradeep M',
      };

      setTimeout(() => {
        newEvent.status = 'completed';
        newEvent.platformStatus = baseline.platforms.map(p => ({ platform: p, status: 'provisioned' }));
        newEvent.riskImpact = { before: 0, after: 15, delta: 15, note: 'New identity provisioned with baseline access' };
        newEvent.blastImpact = { resourcesBefore: 0, resourcesAfter: baseline.platforms.length * 2, note: `${baseline.platforms.length * 2} resources now reachable` };
        newEvent.privilegesAdded = baseline.roles.map((r, ri) => `${r} on ${PLATFORM_LABELS[baseline.platforms[ri]] || baseline.platforms[ri]}`);
        newEvent.complianceImpact = 'NIST AC-2: Account provisioned with role-based access. Baseline MFA enforced.';
        setEvents(prev => {
          const updated = [newEvent, ...prev.filter(e => e.id !== newEvent.id)];
          saveLifecycleEvents(updated);
          return updated;
        });
        addIdentity({
          person_id: `ID-JML-${Date.now()}`,
          display_name: joinerForm.name,
          email: joinerForm.name.toLowerCase().replace(/\s+/g, '.') + '@identitysphere.ai',
          department: dept,
          title: joinerForm.title || 'New Joiner',
          type: 'Human',
          status: 'Active',
          platforms: baseline.platforms,
          risk_score: 15,
          severity: 'low',
          is_admin: false,
          mfa_complete: true,
          max_dormancy_days: 0,
          platform_count: baseline.platforms.length,
          group_count: baseline.groups.length,
          role_count: baseline.roles.length,
          entitlement_count: baseline.roles.length,
        });
        setProcessing(false);
        setShowJoinerForm(false);
        setJoinerForm({ name: '', department: 'Engineering', title: '' });
      }, 1200);

      setEvents(prev => {
        const updated = [newEvent, ...prev];
        saveLifecycleEvents(updated);
        return updated;
      });
    }, 600);
  }, [joinerForm]);

  const handleMover = useCallback(() => {
    if (!moverForm.identity.trim()) return;
    setProcessing(true);
    const toBaseline = BASELINE_ACCESS[moverForm.toDept] || BASELINE_ACCESS.Engineering;

    setTimeout(() => {
      const newEvent = {
        id: `JML-${Date.now()}`,
        type: 'mover',
        identity: moverForm.identity,
        department: moverForm.fromDept,
        newDepartment: moverForm.toDept,
        date: new Date().toISOString().split('T')[0],
        status: 'completed',
        platforms: toBaseline.platforms,
        actions: [
          `AD group updated ${moverForm.fromDept}→${moverForm.toDept}`,
          `Roles reassigned for ${moverForm.toDept}`,
          `Old department access revoked`,
          `New baseline access provisioned`,
        ],
        approver: 'Pradeep M',
      };
      const fromBaseline = BASELINE_ACCESS[moverForm.fromDept] || BASELINE_ACCESS.Engineering;
      const existingId = moverForm.personId ? getIdentities().find(i => i.person_id === moverForm.personId) : null;
      const beforeScore = existingId?.risk_score || 0;
      newEvent.platformStatus = toBaseline.platforms.map(p => ({ platform: p, status: fromBaseline.platforms.includes(p) ? 'retained' : 'provisioned' }));
      fromBaseline.platforms.filter(p => !toBaseline.platforms.includes(p)).forEach(p => newEvent.platformStatus.push({ platform: p, status: 'revoked' }));
      newEvent.privilegesAdded = toBaseline.roles.map((r, ri) => `${r} on ${PLATFORM_LABELS[toBaseline.platforms[ri]] || toBaseline.platforms[ri]}`);
      newEvent.privilegesRemoved = fromBaseline.roles.map((r, ri) => `${r} on ${PLATFORM_LABELS[fromBaseline.platforms[ri]] || fromBaseline.platforms[ri]}`);
      newEvent.riskImpact = { before: beforeScore, after: beforeScore, delta: 0, note: 'Department transfer — access realigned' };
      newEvent.blastImpact = { resourcesBefore: fromBaseline.platforms.length * 2, resourcesAfter: toBaseline.platforms.length * 2, note: 'Blast radius adjusted to new department baseline' };
      newEvent.complianceImpact = `NIST AC-2: Role reassigned from ${moverForm.fromDept} to ${moverForm.toDept}. Previous department access revoked.`;
      if (moverForm.personId) {
        updateIdentity(moverForm.personId, { department: moverForm.toDept, platforms: toBaseline.platforms, platform_count: toBaseline.platforms.length });
      }
      setEvents(prev => { const updated = [newEvent, ...prev]; saveLifecycleEvents(updated); return updated; });
      setProcessing(false);
      setShowMoverForm(false);
      setMoverForm({ identity: '', personId: '', fromDept: 'Engineering', toDept: 'Sales' });
    }, 1500);
  }, [moverForm]);

  const handleLeaver = useCallback(() => {
    if (!leaverForm.identity.trim()) return;
    setProcessing(true);
    const baseline = BASELINE_ACCESS[leaverForm.department] || BASELINE_ACCESS.Engineering;

    setTimeout(() => {
      const newEvent = {
        id: `JML-${Date.now()}`,
        type: 'leaver',
        identity: leaverForm.identity,
        department: leaverForm.department,
        date: new Date().toISOString().split('T')[0],
        status: 'completed',
        platforms: baseline.platforms,
        actions: baseline.platforms.map(p => `Account disabled on ${p.replace('_', ' ')}`).concat(['All sessions revoked', 'Tokens rotated', 'Manager notified']),
        approver: 'Pradeep M',
      };
      const existingId = leaverForm.personId ? getIdentities().find(i => i.person_id === leaverForm.personId) : null;
      const beforeScore = existingId?.risk_score || 0;
      const beforeResources = (existingId?.platforms?.length || baseline.platforms.length) * (existingId?.is_admin ? 5 : 2);
      newEvent.platformStatus = baseline.platforms.map(p => ({ platform: p, status: 'disabled' }));
      newEvent.privilegesRemoved = baseline.platforms.map(p => `All access on ${PLATFORM_LABELS[p] || p}`);
      newEvent.riskImpact = { before: beforeScore, after: 0, delta: -beforeScore, note: `Risk eliminated — all access revoked (${leaverForm.reason})` };
      newEvent.blastImpact = { resourcesBefore: beforeResources, resourcesAfter: 0, note: `Blast radius reduced to 0. ${beforeResources} resources no longer reachable.` };
      newEvent.complianceImpact = `NIST AC-2: Identity offboarded (${leaverForm.reason}). All platform accounts disabled. Tokens rotated. GDPR Art.32 data access removed.`;
      if (leaverForm.personId) {
        const newStatus = leaverForm.reason === 'Termination' ? 'Disabled' : 'Offboarded';
        updateIdentity(leaverForm.personId, { status: newStatus, risk_score: 0, severity: 'low' });
      }
      setEvents(prev => { const updated = [newEvent, ...prev]; saveLifecycleEvents(updated); return updated; });
      setProcessing(false);
      setShowLeaverForm(false);
      setLeaverForm({ identity: '', personId: '', department: 'Engineering', reason: 'Resignation' });
    }, 1800);
  }, [leaverForm]);

  const approveEvent = useCallback((eventId) => {
    setEvents(prev => {
      const updated = prev.map(e => e.id === eventId ? { ...e, status: 'completed', approver: 'Pradeep M' } : e);
      saveLifecycleEvents(updated);
      return updated;
    });
  }, []);

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-3">
          <Users className="w-7 h-7 text-sg-red" />
          Identity Lifecycle Management
        </h1>
        <p className="text-slate-400 text-sm mt-1">Joiner-Mover-Leaver workflow with automated provisioning and deprovisioning</p>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {[
          { key: 'all', label: 'Total Events', value: stats.total, color: 'text-white', activeColor: 'border-red-500/40 bg-red-500/[0.06]', icon: Activity },
          { key: 'joiner', label: 'Joiners', value: stats.joiners, color: 'text-emerald-400', activeColor: 'border-emerald-500/40 bg-emerald-500/[0.06]', icon: UserPlus },
          { key: 'mover', label: 'Movers', value: stats.movers, color: 'text-blue-400', activeColor: 'border-blue-500/40 bg-blue-500/[0.06]', icon: ArrowRightLeft },
          { key: 'leaver', label: 'Leavers', value: stats.leavers, color: 'text-red-400', activeColor: 'border-red-500/40 bg-red-500/[0.06]', icon: UserMinus },
          { key: 'pending', label: 'Pending', value: stats.pending, color: 'text-yellow-400', activeColor: 'border-yellow-500/40 bg-yellow-500/[0.06]', icon: Clock },
        ].map((s, i) => (
          <motion.div key={s.key} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: i * 0.05 }}
            whileHover={{ scale: 1.03, y: -2 }} whileTap={{ scale: 0.97 }}
            onClick={() => setActiveTab(s.key)}
            className={`cursor-pointer rounded-2xl p-6 transition-all duration-300 ${activeTab === s.key ? s.activeColor : ''}`}
            style={{
              background: activeTab === s.key ? undefined : 'rgba(255,255,255,0.04)',
              border: activeTab === s.key ? undefined : '1px solid rgba(227,25,55,0.18)',
              backdropFilter: 'blur(12px)',
              ...(activeTab === s.key ? { boxShadow: '0 0 16px rgba(227,25,55,0.12)' } : {}),
            }}>
            <div className="flex items-center gap-3 p-2">
              <s.icon className={`w-5 h-5 ${s.color} ${activeTab === s.key ? 'opacity-100' : 'opacity-60'}`} />
              <div>
                <AnimatedCounter value={s.value} className={`text-2xl font-bold ${s.color}`} />
                <p className={`text-[10px] uppercase tracking-wider ${activeTab === s.key ? 'text-slate-300' : 'text-slate-500'}`}>{s.label}</p>
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Action Buttons */}
      <div className="grid grid-cols-3 gap-4">
        <motion.button whileHover={{ scale: 1.02, y: -3 }} whileTap={{ scale: 0.98 }}
          onClick={() => { setShowJoinerForm(!showJoinerForm); setShowMoverForm(false); setShowLeaverForm(false); }}
          className="p-5 rounded-2xl bg-gradient-to-br from-emerald-600 to-emerald-500 text-white text-left relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent" />
          <div className="relative"><UserPlus size={28} className="mb-3 opacity-80" /><p className="text-sm font-bold">Joiner</p><p className="text-[10px] opacity-70 mt-1">Create identity & assign baseline access</p></div>
        </motion.button>
        <motion.button whileHover={{ scale: 1.02, y: -3 }} whileTap={{ scale: 0.98 }}
          onClick={() => { setShowMoverForm(!showMoverForm); setShowJoinerForm(false); setShowLeaverForm(false); }}
          className="p-5 rounded-2xl bg-gradient-to-br from-blue-600 to-blue-500 text-white text-left relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent" />
          <div className="relative"><ArrowRightLeft size={28} className="mb-3 opacity-80" /><p className="text-sm font-bold">Mover</p><p className="text-[10px] opacity-70 mt-1">Department/role change updates access</p></div>
        </motion.button>
        <motion.button whileHover={{ scale: 1.02, y: -3 }} whileTap={{ scale: 0.98 }}
          onClick={() => { setShowLeaverForm(!showLeaverForm); setShowJoinerForm(false); setShowMoverForm(false); }}
          className="p-5 rounded-2xl bg-gradient-to-br from-red-600 to-red-500 text-white text-left relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent" />
          <div className="relative"><UserMinus size={28} className="mb-3 opacity-80" /><p className="text-sm font-bold">Leaver</p><p className="text-[10px] opacity-70 mt-1">Disable & revoke access across platforms</p></div>
        </motion.button>
      </div>

      {/* Joiner Form */}
      <AnimatePresence>
        {showJoinerForm && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
            <GlassCard hover={false} className="border-emerald-500/20">
              <h3 className="text-sm font-semibold text-emerald-400 mb-4 flex items-center gap-2"><UserPlus size={16} /> New Joiner Provisioning</h3>
              <div className="grid grid-cols-3 gap-4 mb-4">
                <div>
                  <label className="text-[11px] text-slate-500 uppercase tracking-wider block mb-1">Full Name</label>
                  <input value={joinerForm.name} onChange={e => setJoinerForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g., Kushal Mehta"
                    className="w-full px-3 py-2.5 bg-white/5 border border-white/10 rounded-lg text-sm text-white placeholder-slate-500 outline-none focus:border-emerald-500/50" />
                </div>
                <div>
                  <label className="text-[11px] text-slate-500 uppercase tracking-wider block mb-1">Department</label>
                  <select value={joinerForm.department} onChange={e => setJoinerForm(f => ({ ...f, department: e.target.value }))}
                    className="w-full px-3 py-2.5 bg-white/5 border border-white/10 rounded-lg text-sm text-white outline-none focus:border-emerald-500/50">
                    {DEPARTMENTS.map(d => <option key={d} value={d} className="bg-navy-900">{d}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[11px] text-slate-500 uppercase tracking-wider block mb-1">Job Title</label>
                  <input value={joinerForm.title} onChange={e => setJoinerForm(f => ({ ...f, title: e.target.value }))} placeholder="e.g., Software Engineer"
                    className="w-full px-3 py-2.5 bg-white/5 border border-white/10 rounded-lg text-sm text-white placeholder-slate-500 outline-none focus:border-emerald-500/50" />
                </div>
              </div>
              <div className="mb-4 p-3 rounded-lg" style={{ background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.15)' }}>
                <p className="text-xs text-emerald-400 font-semibold mb-2">Baseline Access for {joinerForm.department}:</p>
                <div className="flex flex-wrap gap-2">
                  {(BASELINE_ACCESS[joinerForm.department]?.platforms || []).map(p => (
                    <div key={p} className="flex items-center gap-1.5">
                      <PlatformIcon platform={p} size="sm" />
                      <span className="text-xs text-slate-400">{(BASELINE_ACCESS[joinerForm.department]?.roles || [])[BASELINE_ACCESS[joinerForm.department]?.platforms.indexOf(p)] || 'User'}</span>
                    </div>
                  ))}
                </div>
              </div>
              <button onClick={handleJoiner} disabled={processing || !joinerForm.name.trim()}
                className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-emerald-500 text-white font-semibold text-sm disabled:opacity-40 hover:opacity-90 transition-opacity">
                {processing ? 'Provisioning...' : 'Create & Provision'}
              </button>
            </GlassCard>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Mover Form — with identity autocomplete */}
      <AnimatePresence>
        {showMoverForm && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
            <GlassCard hover={false} className="border-blue-500/20">
              <h3 className="text-sm font-semibold text-blue-400 mb-4 flex items-center gap-2"><ArrowRightLeft size={16} /> Department Transfer</h3>
              <div className="grid grid-cols-3 gap-4 mb-4">
                <div>
                  <label className="text-[11px] text-slate-500 uppercase tracking-wider block mb-1">Search Identity</label>
                  <IdentitySuggestInput
                    value={moverForm.identity}
                    onChange={v => setMoverForm(f => ({ ...f, identity: v }))}
                    onSelect={id => setMoverForm(f => ({ ...f, identity: id.display_name, personId: id.person_id, fromDept: id.department || f.fromDept }))}
                    placeholder="Type to search..."
                    borderColor="border-white/10"
                    focusBorder="focus:border-blue-500/50"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-slate-500 uppercase tracking-wider block mb-1">From Department</label>
                  <select value={moverForm.fromDept} onChange={e => setMoverForm(f => ({ ...f, fromDept: e.target.value }))}
                    className="w-full px-3 py-2.5 bg-white/5 border border-white/10 rounded-lg text-sm text-white outline-none focus:border-blue-500/50">
                    {DEPARTMENTS.map(d => <option key={d} value={d} className="bg-navy-900">{d}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[11px] text-slate-500 uppercase tracking-wider block mb-1">To Department</label>
                  <select value={moverForm.toDept} onChange={e => setMoverForm(f => ({ ...f, toDept: e.target.value }))}
                    className="w-full px-3 py-2.5 bg-white/5 border border-white/10 rounded-lg text-sm text-white outline-none focus:border-blue-500/50">
                    {DEPARTMENTS.filter(d => d !== moverForm.fromDept).map(d => <option key={d} value={d} className="bg-navy-900">{d}</option>)}
                  </select>
                </div>
              </div>
              <div className="mb-4 p-3 rounded-lg" style={{ background: 'rgba(59,130,246,0.06)', border: '1px solid rgba(59,130,246,0.15)' }}>
                <p className="text-xs text-blue-400 font-semibold mb-2">Access Changes:</p>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-[10px] text-red-400 uppercase mb-1">Revoke ({moverForm.fromDept})</p>
                    <div className="flex flex-wrap gap-1">{(BASELINE_ACCESS[moverForm.fromDept]?.groups || []).map(g => <span key={g} className="text-[10px] px-2 py-0.5 rounded bg-red-500/10 text-red-400 border border-red-500/20">{g}</span>)}</div>
                  </div>
                  <div>
                    <p className="text-[10px] text-emerald-400 uppercase mb-1">Grant ({moverForm.toDept})</p>
                    <div className="flex flex-wrap gap-1">{(BASELINE_ACCESS[moverForm.toDept]?.groups || []).map(g => <span key={g} className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">{g}</span>)}</div>
                  </div>
                </div>
              </div>
              <button onClick={handleMover} disabled={processing || !moverForm.identity.trim()}
                className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-blue-500 text-white font-semibold text-sm disabled:opacity-40 hover:opacity-90 transition-opacity">
                {processing ? 'Transferring...' : 'Execute Transfer'}
              </button>
            </GlassCard>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Leaver Form — with identity autocomplete */}
      <AnimatePresence>
        {showLeaverForm && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
            <GlassCard hover={false} className="border-red-500/20">
              <h3 className="text-sm font-semibold text-red-400 mb-4 flex items-center gap-2"><UserMinus size={16} /> Offboarding / Leaver</h3>
              <div className="grid grid-cols-3 gap-4 mb-4">
                <div>
                  <label className="text-[11px] text-slate-500 uppercase tracking-wider block mb-1">Search Identity</label>
                  <IdentitySuggestInput
                    value={leaverForm.identity}
                    onChange={v => setLeaverForm(f => ({ ...f, identity: v }))}
                    onSelect={id => setLeaverForm(f => ({ ...f, identity: id.display_name, personId: id.person_id, department: id.department || f.department }))}
                    placeholder="Type to search..."
                    borderColor="border-white/10"
                    focusBorder="focus:border-red-500/50"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-slate-500 uppercase tracking-wider block mb-1">Department</label>
                  <select value={leaverForm.department} onChange={e => setLeaverForm(f => ({ ...f, department: e.target.value }))}
                    className="w-full px-3 py-2.5 bg-white/5 border border-white/10 rounded-lg text-sm text-white outline-none focus:border-red-500/50">
                    {DEPARTMENTS.map(d => <option key={d} value={d} className="bg-navy-900">{d}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[11px] text-slate-500 uppercase tracking-wider block mb-1">Reason</label>
                  <select value={leaverForm.reason} onChange={e => setLeaverForm(f => ({ ...f, reason: e.target.value }))}
                    className="w-full px-3 py-2.5 bg-white/5 border border-white/10 rounded-lg text-sm text-white outline-none focus:border-red-500/50">
                    {['Resignation', 'Termination', 'Contract End', 'Retirement'].map(r => <option key={r} value={r} className="bg-navy-900">{r}</option>)}
                  </select>
                </div>
              </div>
              <div className="mb-4 p-3 rounded-lg" style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.15)' }}>
                <p className="text-xs text-red-400 font-semibold mb-2">Deprovisioning Actions:</p>
                <div className="space-y-1">
                  {(BASELINE_ACCESS[leaverForm.department]?.platforms || []).map(p => (
                    <div key={p} className="flex items-center gap-2 text-xs text-slate-400"><XCircle size={12} className="text-red-400" /><span>Disable account on {p.replace('_', ' ')}</span></div>
                  ))}
                  <div className="flex items-center gap-2 text-xs text-slate-400"><XCircle size={12} className="text-red-400" /><span>Revoke all active sessions</span></div>
                  <div className="flex items-center gap-2 text-xs text-slate-400"><XCircle size={12} className="text-red-400" /><span>Rotate all tokens and API keys</span></div>
                </div>
              </div>
              <button onClick={handleLeaver} disabled={processing || !leaverForm.identity.trim()}
                className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-red-600 to-red-500 text-white font-semibold text-sm disabled:opacity-40 hover:opacity-90 transition-opacity">
                {processing ? 'Deprovisioning...' : 'Execute Offboarding'}
              </button>
            </GlassCard>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Filter Tabs */}
      <div className="flex gap-2 flex-wrap">
        {[
          { key: 'all', label: `All (${stats.total})` },
          { key: 'joiner', label: `Joiners (${stats.joiners})` },
          { key: 'mover', label: `Movers (${stats.movers})` },
          { key: 'leaver', label: `Leavers (${stats.leavers})` },
          { key: 'pending', label: `Pending (${stats.pending})` },
        ].map(tab => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2 rounded-lg text-xs font-medium transition-all ${activeTab === tab.key ? 'bg-red-500/20 text-red-400 border border-red-500/30' : 'text-slate-400 hover:text-slate-300 hover:bg-white/5 border border-transparent'}`}>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Offboarding Gap Alert */}
      {offboardingGaps.length > 0 && (
        <GlassCard hover={false} className="border-red-500/30 bg-red-500/[0.03]">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle size={16} className="text-red-400" />
            <h3 className="text-sm font-semibold text-red-400">Offboarding Gaps Detected ({offboardingGaps.length})</h3>
          </div>
          <div className="space-y-2">
            {offboardingGaps.slice(0, 5).map(id => (
              <div key={id.person_id} className="flex items-center justify-between px-3 py-2 rounded-lg" style={{ background: 'rgba(239,68,68,0.05)', border: '1px solid rgba(239,68,68,0.1)' }}>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-white font-medium">{id.display_name}</span>
                  <span className="text-[10px] text-slate-500">{id.status}</span>
                  <div className="flex gap-0.5">{(id.platforms || []).map(p => (
                    <div key={p} className="flex items-center gap-1"><PlatformIcon platform={p} size="sm" /><span className="text-[9px] text-red-400">Active</span></div>
                  ))}</div>
                </div>
                <button onClick={() => navigate(`/admin/identities/${id.person_id}`)} className="text-[10px] text-red-400 hover:text-red-300 font-semibold">Investigate →</button>
              </div>
            ))}
          </div>
        </GlassCard>
      )}

      {/* Audit Trail */}
      <GlassCard hover={false} className="border-red-500/10">
        <h3 className="text-sm font-semibold text-slate-300 mb-4 flex items-center gap-2">
          <FileText size={14} className="text-red-400" /> Lifecycle Audit Trail
        </h3>
        <div className="space-y-3">
          {filteredEvents.length === 0 && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center gap-3 py-12">
              <FileText size={40} className="text-slate-700" />
              <p className="text-sm text-slate-500">No lifecycle events match this filter</p>
            </motion.div>
          )}
          <AnimatePresence mode="popLayout">
            {filteredEvents.map((event, i) => {
              const typeConfig = LIFECYCLE_STATES[event.type];
              const statusConfig = STATUS_STYLES[event.status] || STATUS_STYLES.completed;
              const TypeIcon = typeConfig.icon;
              const StatusIcon = statusConfig.icon;
              const isExp = expandedEvent === event.id;
              return (
                <motion.div key={event.id} layout initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }} transition={{ delay: i * 0.03 }}
                  className="rounded-xl p-4 cursor-pointer hover:bg-white/[0.01] transition-colors" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(227,25,55,0.1)' }}
                  onClick={() => setExpandedEvent(isExp ? null : event.id)}>
                  <div className="flex items-start gap-4">
                    <div className={`w-10 h-10 rounded-xl ${typeConfig.bg} flex items-center justify-center shrink-0`}>
                      <TypeIcon size={18} className={typeConfig.color} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-semibold text-white">{event.identity}</span>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${typeConfig.bg} ${typeConfig.color} border ${typeConfig.border}`}>{typeConfig.label.toUpperCase()}</span>
                        <span className={`flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full ${statusConfig.bg} ${statusConfig.color}`}><StatusIcon size={10} /> {statusConfig.label}</span>
                        {event.riskImpact && event.riskImpact.delta !== 0 && (
                          <span className={`text-[10px] px-2 py-0.5 rounded font-mono font-bold ${event.riskImpact.delta < 0 ? 'text-emerald-400 bg-emerald-500/10' : 'text-red-400 bg-red-500/10'}`}>
                            Risk: {event.riskImpact.before} → {event.riskImpact.after}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 text-[11px] text-slate-500 mb-2">
                        <span>{event.department}{event.newDepartment ? ` → ${event.newDepartment}` : ''}</span>
                        <span className="text-white/10">|</span><span>{event.date}</span>
                        {event.approver && <><span className="text-white/10">|</span><span>Approved by: {event.approver}</span></>}
                      </div>

                      {/* Platform-by-platform status */}
                      {event.platformStatus ? (
                        <div className="flex flex-wrap gap-1.5 mb-2">
                          {event.platformStatus.map(ps => (
                            <div key={ps.platform} className={`flex items-center gap-1.5 px-2 py-1 rounded text-[10px] font-medium ${
                              ps.status === 'provisioned' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/15' :
                              ps.status === 'disabled' || ps.status === 'revoked' ? 'bg-red-500/10 text-red-400 border border-red-500/15' :
                              'bg-blue-500/10 text-blue-400 border border-blue-500/15'}`}>
                              <PlatformIcon platform={ps.platform} size="sm" />
                              {ps.status}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="flex gap-1 mb-2">{event.platforms.map(p => <PlatformIcon key={p} platform={p} size="sm" />)}</div>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {event.status === 'pending_review' && (
                        <motion.button whileTap={{ scale: 0.95 }} onClick={(e) => { e.stopPropagation(); approveEvent(event.id); }}
                          className="px-3 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 text-[10px] font-semibold border border-emerald-500/20 hover:bg-emerald-500/20 transition-all">
                          Approve
                        </motion.button>
                      )}
                      <Eye size={14} className={`transition-colors ${isExp ? 'text-red-400' : 'text-slate-600'}`} />
                    </div>
                  </div>

                  {/* Expandable detail */}
                  <AnimatePresence>
                    {isExp && (
                      <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                        className="mt-4 pt-4 border-t border-white/5" onClick={e => e.stopPropagation()}>
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 mb-3">
                          {event.riskImpact && (
                            <div className="rounded-lg p-3" style={{ background: event.type === 'leaver' ? 'rgba(16,185,129,0.05)' : 'rgba(234,179,8,0.05)', border: `1px solid ${event.type === 'leaver' ? 'rgba(16,185,129,0.12)' : 'rgba(234,179,8,0.12)'}` }}>
                              <p className="text-[10px] text-slate-500 uppercase mb-1">Risk Impact</p>
                              <p className={`text-lg font-bold ${event.riskImpact.delta <= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{event.riskImpact.before} → {event.riskImpact.after}</p>
                              <p className="text-[10px] text-slate-500 mt-1">{event.riskImpact.note}</p>
                            </div>
                          )}
                          {event.blastImpact && (
                            <div className="rounded-lg p-3" style={{ background: 'rgba(239,68,68,0.04)', border: '1px solid rgba(239,68,68,0.1)' }}>
                              <p className="text-[10px] text-slate-500 uppercase mb-1">Blast Radius</p>
                              <p className="text-lg font-bold text-red-400">{event.blastImpact.resourcesBefore} → {event.blastImpact.resourcesAfter}</p>
                              <p className="text-[10px] text-slate-500 mt-1">{event.blastImpact.note}</p>
                            </div>
                          )}
                          <div className="rounded-lg p-3" style={{ background: 'rgba(59,130,246,0.04)', border: '1px solid rgba(59,130,246,0.1)' }}>
                            <p className="text-[10px] text-slate-500 uppercase mb-1">Compliance</p>
                            <p className="text-xs text-blue-400 leading-relaxed">{event.complianceImpact || 'NIST AC-2: Standard lifecycle action'}</p>
                          </div>
                        </div>

                        {(event.privilegesAdded?.length > 0 || event.privilegesRemoved?.length > 0) && (
                          <div className="grid grid-cols-2 gap-3">
                            {event.privilegesAdded?.length > 0 && (
                              <div>
                                <p className="text-[10px] text-emerald-500 uppercase tracking-wider mb-1.5">Privileges Added</p>
                                <div className="space-y-1">{event.privilegesAdded.map((p, pi) => (
                                  <div key={pi} className="flex items-center gap-1.5 text-[10px] text-emerald-400"><CheckCircle size={10} />{p}</div>
                                ))}</div>
                              </div>
                            )}
                            {event.privilegesRemoved?.length > 0 && (
                              <div>
                                <p className="text-[10px] text-red-500 uppercase tracking-wider mb-1.5">Privileges Removed</p>
                                <div className="space-y-1">{event.privilegesRemoved.map((p, pi) => (
                                  <div key={pi} className="flex items-center gap-1.5 text-[10px] text-red-400"><XCircle size={10} />{p}</div>
                                ))}</div>
                              </div>
                            )}
                          </div>
                        )}

                        <div className="flex flex-wrap gap-1 mt-3">
                          {event.actions.map((action, j) => (
                            <span key={j} className="text-[10px] px-2 py-0.5 rounded bg-white/5 text-slate-400 border border-white/5">{action}</span>
                          ))}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      </GlassCard>
    </motion.div>
  );
}
