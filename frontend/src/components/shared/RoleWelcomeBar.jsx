import GlassCard from './GlassCard';

const ROLE_CONFIG = {
  admin: { portal: 'Security Operations Center', status: 'Threat Monitoring Active', accent: 'text-red-400', card: 'border-red-500/20 bg-red-500/[0.04]', pulse: 'bg-red-500' },
  auditor: { portal: 'Governance & Audit', status: 'Read-Only Compliance View', accent: 'text-cyan-400', card: 'border-cyan-500/20 bg-cyan-500/[0.04]', pulse: 'bg-cyan-500' },
  executive: { portal: 'Executive Access Portal', status: 'Enterprise Risk Overview', accent: 'text-amber-400', card: 'border-amber-500/20 bg-amber-500/[0.04]', pulse: 'bg-amber-500' },
  employee: { portal: 'Employee Self-Service', status: 'Access Request Portal', accent: 'text-blue-400', card: 'border-blue-500/20 bg-blue-500/[0.04]', pulse: 'bg-blue-500' },
  contractor: { portal: 'Contractor Access Portal', status: 'Temporary · Limited Scope', accent: 'text-orange-400', card: 'border-orange-500/20 bg-orange-500/[0.04]', pulse: 'bg-orange-500' },
};

export default function RoleWelcomeBar({ user }) {
  const cfg = ROLE_CONFIG[user?.role] || ROLE_CONFIG.admin;

  return (
    <GlassCard className={cfg.card} glow delay={0.02}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <span className="relative flex h-2.5 w-2.5 shrink-0">
          <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${cfg.pulse} opacity-75`} />
          <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${cfg.pulse}`} />
        </span>
        <span className={`text-xs font-bold uppercase tracking-[0.18em] font-orbitron ${cfg.accent}`}>
          {cfg.portal}
        </span>
        <span className="text-white/20 hidden sm:inline">|</span>
        <span className="text-[11px] text-slate-400">
          {user?.name} · <span className="lowercase">{user?.email}</span>
        </span>
        <span className="text-white/20 hidden md:inline">|</span>
        <span className="text-[10px] text-slate-500 uppercase tracking-wider">{cfg.status}</span>
      </div>
    </GlassCard>
  );
}
