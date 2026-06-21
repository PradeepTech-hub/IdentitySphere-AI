import { useState, useEffect } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Bell, X, Clock, Key, CheckCircle, XCircle } from 'lucide-react';
import Sidebar from './Sidebar';
import PlatformIcon from '../shared/PlatformIcon';
import { useAuth } from '../../context/AuthContext';
import { getAccessRequests } from '../../services/storageService';


const PLATFORM_LABELS = { active_directory: 'Active Directory', aws_iam: 'AWS IAM', okta: 'Okta', salesforce: 'Salesforce' };
export default function DashboardLayout() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [dismissedIds, setDismissedIds] = useState(() => {
    try { return JSON.parse(localStorage.getItem('is_dismissed_notifs') || '[]'); } catch { return []; }
  });

  const allRequests = getAccessRequests();
  const pendingRequests = allRequests.filter(r => r.status === 'pending');
  const recentApproved = allRequests.filter(r => r.status === 'approved' && r.reviewedAt && (Date.now() - new Date(r.reviewedAt).getTime()) < 86400000);
  const recentRejected = allRequests.filter(r => r.status === 'rejected' && r.reviewedAt && (Date.now() - new Date(r.reviewedAt).getTime()) < 86400000);

  const notifications = [
    ...pendingRequests.map(r => ({ id: r.id, type: 'pending', title: `Access request: ${r.employeeName}`, detail: `${r.role} on ${PLATFORM_LABELS[r.platform] || r.platform}`, time: r.createdAt, icon: Clock, color: 'text-yellow-400', bg: 'bg-yellow-500/10' })),
    ...recentApproved.map(r => ({ id: r.id + '-approved', type: 'approved', title: `Approved: ${r.employeeName}`, detail: `${r.role} on ${PLATFORM_LABELS[r.platform] || r.platform}`, time: r.reviewedAt, icon: CheckCircle, color: 'text-green-400', bg: 'bg-green-500/10' })),
    ...recentRejected.map(r => ({ id: r.id + '-rejected', type: 'rejected', title: `Rejected: ${r.employeeName}`, detail: `${r.role} on ${PLATFORM_LABELS[r.platform] || r.platform}`, time: r.reviewedAt, icon: XCircle, color: 'text-red-400', bg: 'bg-red-500/10' })),
  ].sort((a, b) => new Date(b.time) - new Date(a.time));

  const unreadCount = notifications.filter(n => !dismissedIds.includes(n.id)).length;

  const dismissAll = () => {
    const ids = notifications.map(n => n.id);
    setDismissedIds(ids);
    localStorage.setItem('is_dismissed_notifs', JSON.stringify(ids));
  };

  const isAdmin = user?.role === 'admin';

  return (
    <div className="min-h-screen bg-navy-950 bg-grid relative">
      <div
        className="fixed top-0 left-0 right-0 h-100 pointer-events-none z-0"
        style={{
          background: 'radial-gradient(ellipse 80% 50% at 50% -10%, rgba(227, 25, 55, 0.08) 0%, rgba(227, 25, 55, 0.03) 40%, transparent 70%)',
        }}
      />

      <Sidebar />

      {/* Top Navbar */}
      <div className="fixed top-0 left-64 right-0 z-40 h-12 flex items-center justify-end px-6 gap-3"
        style={{ background: 'rgba(5,6,13,0.8)', backdropFilter: 'blur(12px)', borderBottom: '1px solid rgba(227,25,55,0.1)' }}>

        {/* Notification Bell */}
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
                  className="absolute right-0 top-full mt-2 w-96 max-h-[480px] overflow-y-auto rounded-xl z-50"
                  style={{ background: 'rgba(8,10,18,0.98)', border: '1px solid rgba(227,25,55,0.2)', backdropFilter: 'blur(20px)', boxShadow: '0 20px 60px rgba(0,0,0,0.6)' }}>

                  <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
                    <span className="text-sm font-semibold text-white">Notifications</span>
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
                              if (isAdmin && n.type === 'pending') navigate('/admin/access-review');
                            }}>
                            <div className="flex items-start gap-3">
                              <div className={`w-8 h-8 rounded-lg ${n.bg} flex items-center justify-center shrink-0 mt-0.5`}>
                                <Icon size={14} className={n.color} />
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <p className={`text-sm font-medium truncate ${isUnread ? 'text-white' : 'text-slate-400'}`}>{n.title}</p>
                                  {isUnread && <span className="w-2 h-2 rounded-full bg-red-500 shrink-0" />}
                                </div>
                                <p className="text-[11px] text-slate-500 mt-0.5">{n.detail}</p>
                                <p className="text-[10px] text-slate-600 mt-1">{new Date(n.time).toLocaleString()}</p>
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
      </div>

      <main className="ml-64 pt-12 min-h-screen relative z-10">
        <AnimatePresence mode="wait">
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.3 }}
            className="p-6"
          >
            <Outlet />
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  );
}
