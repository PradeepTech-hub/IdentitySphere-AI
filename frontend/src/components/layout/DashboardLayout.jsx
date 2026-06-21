import { useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Bell, X, Clock, CheckCircle, XCircle, Menu } from 'lucide-react';
import Sidebar, { useSidebar } from './Sidebar';
import SphereBackground from '../shared/SphereBackground';
import { useAuth } from '../../context/AuthContext';
import { usePlatformData } from '../../context/PlatformDataContext';
import { getAccessRequests } from '../../services/storageService';

const PLATFORM_LABELS = { active_directory: 'Active Directory', aws_iam: 'AWS IAM', okta: 'Okta', salesforce: 'Salesforce', github: 'GitHub' };

const ROLE_TOP_BAR = {
  admin: 'Live Threat Monitoring',
  auditor: 'Governance & Compliance Monitoring',
  executive: 'Executive Risk Intelligence',
  employee: 'Self-Service Access Portal',
  contractor: 'Contractor Limited Access',
};

export default function DashboardLayout() {
  const { user } = useAuth();
  const { loading: dataLoading } = usePlatformData();
  const location = useLocation();
  const [showNotifications, setShowNotifications] = useState(false);
  const [dismissedIds, setDismissedIds] = useState(() => {
    try { return JSON.parse(localStorage.getItem('is_dismissed_notifs') || '[]'); } catch { return []; }
  });

  const allRequests = getAccessRequests();
  const isAdmin = user?.role === 'admin';
  const isEmployee = user?.role === 'employee';
  const isExecutive = user?.role === 'executive';
  const isContractor = user?.role === 'contractor';

  const employeeNotifications = isEmployee
    ? allRequests
      .filter(r => r.employeeEmail === user?.email && r.reviewedAt)
      .filter(r => (Date.now() - new Date(r.reviewedAt).getTime()) < 86400000 * 7)
      .map(r => ({
        id: r.id + '-' + r.status,
        type: r.status,
        title: `${r.status === 'approved' ? 'Approved' : r.status === 'rejected' ? 'Rejected' : 'Updated'}: ${r.role}`,
        detail: `${PLATFORM_LABELS[r.platform] || r.platform} · ${r.durationDays} day(s)`,
        time: r.reviewedAt,
        icon: r.status === 'approved' ? CheckCircle : r.status === 'rejected' ? XCircle : Clock,
        color: r.status === 'approved' ? 'text-green-400' : r.status === 'rejected' ? 'text-red-400' : 'text-yellow-400',
        bg: r.status === 'approved' ? 'bg-green-500/10' : r.status === 'rejected' ? 'bg-red-500/10' : 'bg-yellow-500/10',
      }))
    : [];

  const executiveNotifications = isExecutive ? [
    { id: 'exec-1', type: 'alert', title: 'Privilege Escalation Detected', detail: 'High severity · Business impact: High', time: new Date().toISOString(), icon: Bell, color: 'text-red-400', bg: 'bg-red-500/10' },
    { id: 'exec-2', type: 'alert', title: 'Dormant Admin Accounts', detail: 'High severity · 3 accounts flagged', time: new Date(Date.now() - 86400000).toISOString(), icon: Bell, color: 'text-orange-400', bg: 'bg-orange-500/10' },
  ] : [];

  const contractorNotifications = isContractor ? [
    { id: 'ctr-1', type: 'alert', title: 'Unusual Login Detected', detail: 'High severity · New IP address', time: new Date().toISOString(), icon: Bell, color: 'text-red-400', bg: 'bg-red-500/10' },
    { id: 'ctr-2', type: 'alert', title: 'Password Expires in 5 Days', detail: 'Medium severity · Rotate soon', time: new Date(Date.now() - 3600000).toISOString(), icon: Bell, color: 'text-orange-400', bg: 'bg-orange-500/10' },
  ] : [];

  const adminNotifications = isAdmin ? [
    ...allRequests.filter(r => r.status === 'pending').map(r => ({
      id: r.id, type: 'pending', title: `Access request: ${r.employeeName}`,
      detail: `${r.role} on ${PLATFORM_LABELS[r.platform] || r.platform}`, time: r.createdAt,
      icon: Clock, color: 'text-yellow-400', bg: 'bg-yellow-500/10',
    })),
    ...allRequests.filter(r => r.status === 'approved' && r.reviewedAt && (Date.now() - new Date(r.reviewedAt).getTime()) < 86400000).map(r => ({
      id: r.id + '-approved', type: 'approved', title: `Approved: ${r.employeeName}`,
      detail: `${r.role} on ${PLATFORM_LABELS[r.platform] || r.platform}`, time: r.reviewedAt,
      icon: CheckCircle, color: 'text-green-400', bg: 'bg-green-500/10',
    })),
    ...allRequests.filter(r => r.status === 'rejected' && r.reviewedAt && (Date.now() - new Date(r.reviewedAt).getTime()) < 86400000).map(r => ({
      id: r.id + '-rejected', type: 'rejected', title: `Rejected: ${r.employeeName}`,
      detail: `${r.role} on ${PLATFORM_LABELS[r.platform] || r.platform}`, time: r.reviewedAt,
      icon: XCircle, color: 'text-red-400', bg: 'bg-red-500/10',
    })),
  ] : [];

  const notifications = (isEmployee ? employeeNotifications
    : isExecutive ? executiveNotifications
    : isContractor ? contractorNotifications
    : adminNotifications)
    .sort((a, b) => new Date(b.time) - new Date(a.time));

  const unreadCount = notifications.filter(n => !dismissedIds.includes(n.id)).length;

  const dismissAll = () => {
    const ids = notifications.map(n => n.id);
    setDismissedIds(ids);
    localStorage.setItem('is_dismissed_notifs', JSON.stringify(ids));
  };

  const topBarLabel = ROLE_TOP_BAR[user?.role] || ROLE_TOP_BAR.admin;
  const hasNotificationBell = isAdmin || isEmployee || isExecutive || isContractor;

  const { toggle: toggleSidebar } = useSidebar();

  return (
    <div className={`min-h-screen relative${user?.role === 'auditor' ? ' auditor-theme' : ''}`}>
      <SphereBackground />

      <Sidebar />

      {/* Top bar: left-0 on mobile, left-64 on desktop */}
      <div className="fixed top-0 left-0 lg:left-64 right-0 z-40 h-14 flex items-center justify-between px-3 sm:px-6 gap-3"
        style={{ background: 'rgba(5,6,13,0.92)', backdropFilter: 'blur(20px)', borderBottom: '1px solid rgba(227,25,55,0.18)' }}>
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          {/* Hamburger — visible below 1024px */}
          <button onClick={toggleSidebar} className="lg:hidden p-2 -ml-1 rounded-lg hover:bg-white/5 text-slate-400 hover:text-white transition-colors shrink-0">
            <Menu size={20} />
          </button>
          <span className="text-[9px] sm:text-[10px] font-orbitron font-bold uppercase tracking-[0.15em] sm:tracking-[0.2em] text-red-400/90 truncate">{topBarLabel}</span>
          <span className="w-2 h-2 rounded-full bg-green-500 animate-blink shrink-0" />
          {user?.name && (
            <span className="text-[10px] text-slate-500 hidden md:inline ml-1 lowercase truncate">
              · {user.email}
            </span>
          )}
        </div>

        {hasNotificationBell && (
        <div className="relative">
          <button onClick={() => setShowNotifications(!showNotifications)}
            className="relative p-2 rounded-lg hover:bg-white/5 text-slate-400 hover:text-white transition-colors">
            <Bell size={18} />
            {unreadCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 w-5 h-5 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center animate-pulse shadow-lg shadow-red-500/40">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>

          <AnimatePresence>
            {showNotifications && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowNotifications(false)} />
                <motion.div initial={{ opacity: 0, y: -8, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -8, scale: 0.95 }}
                  className="absolute right-0 top-full mt-2 w-[calc(100vw-2rem)] sm:w-96 max-h-[480px] overflow-y-auto rounded-xl z-50"
                  style={{ background: 'rgba(8,10,18,0.98)', border: '1px solid rgba(227,25,55,0.2)', backdropFilter: 'blur(20px)', boxShadow: '0 20px 60px rgba(0,0,0,0.6)' }}>
                  <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
                    <span className="text-sm font-semibold text-white font-orbitron tracking-wide">Notifications</span>
                    <div className="flex items-center gap-2">
                      {unreadCount > 0 && (
                        <button onClick={dismissAll} className="text-[10px] text-slate-500 hover:text-red-400 transition-colors">Mark all read</button>
                      )}
                      <button onClick={() => setShowNotifications(false)} className="p-1 rounded hover:bg-white/5 text-slate-500 hover:text-white transition-colors">
                        <X size={14} />
                      </button>
                    </div>
                  </div>
                  {notifications.length === 0 ? (
                    <div className="flex flex-col items-center gap-2 py-8">
                      <Bell size={24} className="text-slate-700" />
                      <p className="text-xs text-slate-500">No notifications</p>
                    </div>
                  ) : (
                    <div className="divide-y divide-white/3">
                      {notifications.map(n => {
                        const Icon = n.icon;
                        const isUnread = !dismissedIds.includes(n.id);
                        return (
                          <div key={n.id}
                            className={`px-4 py-3 hover:bg-white/3 transition-colors cursor-pointer ${isUnread ? 'bg-white/[0.02]' : ''}`}
                            onClick={() => {
                              setShowNotifications(false);
                              if (isAdmin && n.type === 'pending') window.location.href = '/admin/access-review';
                              if (isEmployee) window.location.href = '/employee';
                              if (isExecutive) window.location.href = '/executive#alerts';
                              if (isContractor) window.location.href = '/contractor#alerts';
                            }}>
                            <div className="flex items-start gap-3">
                              <div className={`w-8 h-8 rounded-lg ${n.bg} flex items-center justify-center shrink-0 mt-0.5`}>
                                <Icon size={14} className={n.color} />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className={`text-sm font-medium truncate ${isUnread ? 'text-white' : 'text-slate-400'}`}>{n.title}</p>
                                <p className="text-[11px] text-slate-500 mt-0.5">{n.detail}</p>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </motion.div>
              </>
            )}
          </AnimatePresence>
        </div>
        )}
      </div>

      <main className="ml-0 lg:ml-64 pt-14 min-h-screen relative z-10">
        <div className="p-3 sm:p-4 lg:p-6 xl:p-8 dashboard-theme max-w-[1600px]">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
