import { NavLink } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuth } from '../../context/AuthContext';
import {
  LayoutDashboard, Users, Shield, AlertTriangle, Route, Target,
  MessageSquare, Bell, FileText, BarChart3, Settings, LogOut, Zap, Eye, Download,
  UserPlus, ShieldCheck, ClipboardCheck, Server,
} from 'lucide-react';

const ADMIN_LINKS = [
  { to: '/admin', icon: LayoutDashboard, label: 'Overview' },
  { to: '/admin/identities', icon: Users, label: 'Identity Inventory' },
  { to: '/admin/lifecycle', icon: UserPlus, label: 'Lifecycle (JML)' },
  { to: '/admin/access-review', icon: ClipboardCheck, label: 'Access Review' },
  { to: '/admin/privileges', icon: Shield, label: 'Privileges' },
  { to: '/admin/risks', icon: AlertTriangle, label: 'Risk Findings' },
  { to: '/admin/attack-paths', icon: Route, label: 'Attack Paths' },
  { to: '/admin/blast-radius', icon: Target, label: 'Blast Radius' },
  { to: '/admin/compliance', icon: ShieldCheck, label: 'Compliance' },
  { to: '/admin/copilot', icon: MessageSquare, label: 'AI Copilot' },
  { to: '/admin/incidents', icon: Bell, label: 'Incidents' },
  { to: '/admin/scenarios', icon: Zap, label: 'Scenario Sim', highlight: true },
];

const AUDITOR_LINKS = [
  { to: '/auditor', icon: ShieldCheck, label: 'Compliance' },
  { to: '/auditor/evidence', icon: Eye, label: 'Evidence' },
  { to: '/auditor/exports', icon: Download, label: 'Exports' },
];

const EXEC_LINKS = [
  { to: '/executive', icon: BarChart3, label: 'Dashboard', end: true },
];

const CONTRACTOR_LINKS = [
  { to: '/contractor', icon: LayoutDashboard, label: 'Dashboard', end: true },
  { to: '/contractor', hash: 'resources', icon: Server, label: 'My Resources' },
  { to: '/contractor', hash: 'alerts', icon: Bell, label: 'Alerts' },
  { to: '/contractor', hash: 'compliance', icon: ShieldCheck, label: 'Compliance Notices' },
  { to: '/contractor', hash: 'documentation', icon: FileText, label: 'Support' },
];

const EMPLOYEE_LINKS = [
  { to: '/employee', icon: LayoutDashboard, label: 'My Requests' },
];

const ROLE_PORTAL = {
  admin: 'SOC Console',
  auditor: 'Auditor Portal',
  executive: 'Executive View',
  employee: 'Employee Portal',
  contractor: 'Contractor Portal',
};

export default function Sidebar() {
  const { user, logout } = useAuth();
  const links = user?.role === 'admin' ? ADMIN_LINKS
    : user?.role === 'auditor' ? AUDITOR_LINKS
    : user?.role === 'employee' ? EMPLOYEE_LINKS
    : user?.role === 'contractor' ? CONTRACTOR_LINKS
    : EXEC_LINKS;

  return (
    <motion.aside
      initial={{ x: -280 }} animate={{ x: 0 }} transition={{ duration: 0.4 }}
      className="fixed left-0 top-0 bottom-0 w-64 z-50 flex flex-col overflow-hidden"
      style={{
        background: 'rgba(5, 6, 13, 0.95)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        borderRight: '1px solid rgba(227, 25, 55, 0.18)',
      }}
    >
      {/* Scan line animation overlay */}
      <div
        className="absolute inset-0 pointer-events-none z-0"
        style={{
          backgroundImage:
            'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(227, 25, 55, 0.03) 2px, rgba(227, 25, 55, 0.03) 4px)',
          backgroundSize: '100% 4px',
        }}
      />
      <div
        className="absolute inset-0 pointer-events-none z-0"
        style={{
          background: 'linear-gradient(180deg, rgba(227, 25, 55, 0.05) 0%, transparent 50%, rgba(227, 25, 55, 0.02) 100%)',
          animation: 'sidebarScanline 8s ease-in-out infinite',
        }}
      />

      {/* Scan line keyframes */}
      <style>{`
        @keyframes sidebarScanline {
          0%, 100% { opacity: 0.3; transform: translateY(-100%); }
          50% { opacity: 0.7; transform: translateY(100%); }
        }
      `}</style>

      {/* Logo — IdentitySphere AI */}
      <div className="relative z-10 p-5" style={{ borderBottom: '1px solid rgba(227, 25, 55, 0.18)' }}>
        <a href="/" className="flex items-center gap-3 no-underline group">
          <div className="shrink-0 w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #8B1026, #C1122F, #E31937)', boxShadow: '0 0 20px rgba(227,25,55,0.3)' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5"><path d="M12 2L3 7v5c0 5.5 3.8 10.7 9 12 5.2-1.3 9-6.5 9-12V7l-9-5z" /></svg>
          </div>
          <div className="min-w-0">
            <h1 className="text-xs font-black font-orbitron tracking-wide text-white flex items-center gap-1 flex-wrap">
              Identity<span className="sphere-icon-sm inline-block" />Sphere AI
            </h1>
            <p className="text-[9px] text-slate-500 uppercase tracking-[0.15em] mt-0.5 font-orbitron">
              {ROLE_PORTAL[user?.role] || 'Enterprise Security'}
            </p>
          </div>
        </a>
      </div>

      {/* Navigation */}
      <nav className="relative z-10 flex-1 p-3 space-y-0.5 overflow-y-auto">
        {links.map(({ to, icon: Icon, label, highlight, hash, end }) => {
          const scrollToHash = (e) => {
            if (!hash) return;
            e.preventDefault();
            if (window.location.pathname !== to) {
              window.location.href = `${to}#${hash}`;
              return;
            }
            document.getElementById(hash)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            window.history.replaceState(null, '', `${to}#${hash}`);
          };

          return (
            <NavLink key={`${to}-${hash || label}`} to={hash ? `${to}#${hash}` : to} end={end ?? to.split('/').length <= 2}
              onClick={hash ? scrollToHash : undefined}
              className={({ isActive }) => `flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-orbitron uppercase tracking-wider transition-all duration-200 ${
                isActive && !hash
                  ? 'bg-red-500/10 text-red-400 border border-red-500/20'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
              } ${highlight && !to ? 'border border-red-500/20' : ''}`}
              style={({ isActive }) => isActive && !hash ? { boxShadow: '0 0 12px rgba(227, 25, 55, 0.08)' } : {}}
            >
              <Icon size={16} />
              <span>{label}</span>
              {label === 'Alerts' && user?.role === 'contractor' && (
                <span className="ml-auto text-[9px] bg-red-500/20 text-red-400 px-1.5 py-0.5 rounded-full font-bold">2</span>
              )}
              {highlight && (
                <span className="ml-auto text-[9px] bg-red-500/20 text-red-400 px-1.5 py-0.5 rounded-full font-bold">LIVE</span>
              )}
            </NavLink>
          );
        })}
      </nav>

      {user?.role === 'contractor' && (
        <div className="relative z-10 mx-3 mb-2 p-3 rounded-xl border border-orange-500/20 bg-orange-500/[0.06]">
          <p className="text-[9px] font-orbitron font-bold uppercase tracking-wider text-orange-300 mb-1">Limited Access Mode</p>
          <p className="text-[10px] text-slate-500 leading-relaxed">
            You can only access assigned systems. No privilege changes are allowed.
          </p>
        </div>
      )}

      {user?.role === 'executive' && (
        <div className="relative z-10 mx-3 mb-2 p-3 rounded-xl border border-purple-500/20 bg-purple-500/[0.06]">
          <p className="text-[9px] font-orbitron font-bold uppercase tracking-wider text-purple-300 mb-1">Visibility Only Mode</p>
          <p className="text-[10px] text-slate-500 leading-relaxed">
            You can view dashboards and reports only. No technical controls are available.
          </p>
        </div>
      )}

      {/* User section */}
      <div className="relative z-10 p-3" style={{ borderTop: '1px solid rgba(227, 25, 55, 0.18)' }}>
        <div className="flex items-center gap-3 px-3 py-2">
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white"
            style={{
              background: 'linear-gradient(135deg, #E31937, #8B1026)',
            }}
          >
            {user?.name?.[0]}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-slate-300 truncate">{user?.name}</p>
            <p className="text-[10px] text-slate-500 truncate lowercase">{user?.email}</p>
            <p className="text-[10px] text-slate-600 capitalize">{user?.role}</p>
          </div>
          <button onClick={logout} className="p-1.5 rounded-lg hover:bg-white/5 text-slate-500 hover:text-red-400 transition-colors">
            <LogOut size={14} />
          </button>
        </div>
      </div>
    </motion.aside>
  );
}
