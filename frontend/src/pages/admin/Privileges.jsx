import { useMemo } from 'react';
const PLATFORM_LABELS = { active_directory: 'Active Directory', aws_iam: 'AWS IAM', okta: 'Okta', salesforce: 'Salesforce' };const PLATFORM_COLORS = { active_directory: '#00a4ef', aws_iam: '#ff9900', okta: '#007dc1', salesforce: '#00a1e0' };
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { Shield, Key, AlertTriangle, Users, Eye } from 'lucide-react';
import GlassCard from '../../components/shared/GlassCard';
import AnimatedCounter from '../../components/shared/AnimatedCounter';
import SeverityBadge from '../../components/shared/SeverityBadge';
import PlatformIcon from '../../components/shared/PlatformIcon';
import { getIdentities } from '../../services/storageService';


export default function Privileges() {
  const navigate = useNavigate();
  const identities = useMemo(() => getIdentities().filter(i => i.status !== 'Disabled' && i.status !== 'Offboarded'), []);

  const adminUsers = identities.filter(i => i.is_admin);
  const crossPlatformAdmins = adminUsers.filter(i => (i.platforms?.length || 0) >= 2);
  const overPrivileged = identities.filter(i => (i.risk_score || 0) > 50 && i.is_admin);
  const sensitiveAccess = identities.filter(i => i.is_admin || (i.entitlement_count || 0) > 10);

  const platformStats = useMemo(() => {
    const stats = {};
    identities.forEach(i => {
      (i.platforms || []).forEach(p => {
        if (!stats[p]) stats[p] = { platform: PLATFORM_LABELS[p] || p, key: p, admins: 0, total: 0, color: PLATFORM_COLORS[p] || '#64748b' };
        stats[p].total++;
        if (i.is_admin) stats[p].admins++;
      });
    });
    return Object.values(stats);
  }, [identities]);

  const totalAccounts = identities.reduce((a, i) => a + (i.platforms?.length || 0), 0);
  const totalGroups = identities.reduce((a, i) => a + (i.group_count || 0), 0);
  const totalRoles = identities.reduce((a, i) => a + (i.role_count || 0), 0);
  const totalEntitlements = identities.reduce((a, i) => a + (i.entitlement_count || 0), 0);

  const PRIV_HIERARCHY = [
    { level: 'Identities', indent: 0, color: '#22c55e', desc: `${identities.length} human + service accounts`, count: identities.length },
    { level: 'Platform Accounts', indent: 1, color: '#3b82f6', desc: `Across ${platformStats.length} platforms`, count: totalAccounts },
    { level: 'Group Memberships', indent: 2, color: '#6366f1', desc: 'Security and distribution groups', count: totalGroups },
    { level: 'Role Assignments', indent: 2, color: '#8b5cf6', desc: 'Platform-specific roles', count: totalRoles },
    { level: 'Entitlements', indent: 3, color: '#a855f7', desc: 'Permissions and access rights', count: totalEntitlements },
    { level: 'Admin Roles', indent: 4, color: '#ef4444', desc: `${adminUsers.length} users with admin privileges`, count: adminUsers.length },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-3">
          <Shield className="w-7 h-7 text-sg-red" /> Effective Privilege Explorer
        </h1>
        <p className="text-sm text-slate-500 mt-1">Visualize privilege inheritance: Identity → Platform → Group → Role → Permission</p>
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <GlassCard delay={0.05}><p className="text-[11px] text-slate-500 uppercase">Over-Privileged</p><p className="text-3xl font-black text-orange-400 mt-1"><AnimatedCounter value={overPrivileged.length} /></p></GlassCard>
        <GlassCard delay={0.1}><p className="text-[11px] text-slate-500 uppercase">Cross-Platform Admins</p><p className="text-3xl font-black text-red-400 mt-1"><AnimatedCounter value={crossPlatformAdmins.length} /></p></GlassCard>
        <GlassCard delay={0.15}><p className="text-[11px] text-slate-500 uppercase">Sensitive Access</p><p className="text-3xl font-black text-purple-400 mt-1"><AnimatedCounter value={sensitiveAccess.length} /></p></GlassCard>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <GlassCard delay={0.2} hover={false}>
          <h3 className="text-sm font-semibold text-slate-300 mb-5">Privilege Hierarchy</h3>
          <div className="space-y-2">
            {PRIV_HIERARCHY.map((h, i) => (
              <motion.div key={h.level} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.3 + i * 0.08 }}
                className="flex items-center gap-3 py-2 px-3 rounded-xl hover:bg-white/[0.03] transition-colors" style={{ marginLeft: h.indent * 28 }}>
                <div className="w-3 h-3 rounded-sm shrink-0" style={{ background: h.color }} />
                <div className="flex-1">
                  <p className="text-sm font-medium text-white">{h.level}</p>
                  <p className="text-[11px] text-slate-500">{h.desc}</p>
                </div>
                <span className="text-sm font-mono font-bold" style={{ color: h.color }}>{h.count.toLocaleString()}</span>
              </motion.div>
            ))}
          </div>
        </GlassCard>

        <GlassCard delay={0.25} hover={false}>
          <h3 className="text-sm font-semibold text-slate-300 mb-4">Admin Distribution by Platform</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={platformStats} layout="vertical">
              <XAxis type="number" tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="platform" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} width={120} />
              <Tooltip contentStyle={{ background: '#0a0f1f', border: '1px solid rgba(227,25,55,0.3)', borderRadius: 12, fontSize: 12, color: '#f1f5f9' }} wrapperStyle={{ zIndex: 1000 }} />
              <Bar dataKey="admins" radius={[0, 6, 6, 0]} barSize={20}>
                {platformStats.map((d, i) => <Cell key={i} fill={d.color} fillOpacity={0.7} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </GlassCard>
      </div>

      {/* Privileged Users Table */}
      <GlassCard hover={false} delay={0.3}>
        <h3 className="text-sm font-semibold text-slate-300 mb-4 flex items-center gap-2">
          <Key size={14} className="text-red-400" /> Privileged Identities
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-[11px] text-slate-500 uppercase border-b border-white/5">
              <th className="text-left pb-3 font-medium">Identity</th>
              <th className="text-left pb-3 font-medium">Department</th>
              <th className="text-left pb-3 font-medium">Platforms</th>
              <th className="text-left pb-3 font-medium">Roles</th>
              <th className="text-left pb-3 font-medium">Entitlements</th>
              <th className="text-left pb-3 font-medium">Severity</th>
              <th className="text-right pb-3 font-medium">Score</th>
              <th className="text-left pb-3 font-medium">Action</th>
            </tr></thead>
            <tbody>
              {adminUsers.sort((a, b) => (b.risk_score || 0) - (a.risk_score || 0)).map((u, i) => (
                <motion.tr key={u.person_id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.35 + i * 0.03 }}
                  className="border-b border-white/3 hover:bg-white/[0.02] transition-colors">
                  <td className="py-2.5 text-white font-medium">{u.display_name}</td>
                  <td className="py-2.5 text-slate-400 text-xs">{u.department}</td>
                  <td className="py-2.5"><div className="flex gap-0.5">{(u.platforms || []).map(p => <PlatformIcon key={p} platform={p} size="sm" />)}</div></td>
                  <td className="py-2.5 text-slate-400 font-mono text-xs">{u.role_count || 0}</td>
                  <td className="py-2.5 text-slate-400 font-mono text-xs">{u.entitlement_count || 0}</td>
                  <td className="py-2.5">{u.severity && <SeverityBadge severity={u.severity.toLowerCase()} />}</td>
                  <td className="py-2.5 text-right font-mono font-bold text-red-400">{u.risk_score || 0}</td>
                  <td className="py-2.5">
                    <button onClick={() => navigate(`/admin/identities/${u.person_id}`)}
                      className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-red-500/10 text-red-400 text-[10px] font-semibold border border-red-500/20 hover:bg-red-500/20 transition-all">
                      <Eye size={10} /> View
                    </button>
                  </td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>
      </GlassCard>
    </div>
  );
}
