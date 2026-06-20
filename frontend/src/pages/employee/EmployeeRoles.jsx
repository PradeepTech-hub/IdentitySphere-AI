import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { Shield, Key, Layers } from 'lucide-react';
import GlassCard from '../../components/shared/GlassCard';
import PlatformIcon from '../../components/shared/PlatformIcon';
import { useAuth } from '../../context/AuthContext';
import { getIdentities } from '../../services/storageService';

const PLATFORM_LABELS = { active_directory: 'Active Directory', aws_iam: 'AWS IAM', okta: 'Okta', salesforce: 'Salesforce', github: 'GitHub' };
const ROLE_MAP = { active_directory: { admin: 'Domain Admin', user: 'Domain User' }, aws_iam: { admin: 'AdministratorAccess', user: 'ReadOnlyAccess' }, okta: { admin: 'Org Admin', user: 'SSO User' }, github: { admin: 'Owner', user: 'Contributor' }, salesforce: { admin: 'System Administrator', user: 'Standard User' } };
const GROUP_MAP = { active_directory: 'VPN-Users', aws_iam: 'Cloud-Users', okta: 'SSO-Users', github: 'Dev-Team', salesforce: 'CRM-Users' };

export default function EmployeeRoles() {
  const { user } = useAuth();
  const myIdentity = useMemo(() => getIdentities().find(i => i.email === user?.email || i.display_name === user?.name), [user]);
  const myPlatforms = myIdentity?.platforms || [];

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-3"><Shield className="w-7 h-7 text-purple-400" /> My Roles & Groups</h1>
        <p className="text-slate-400 text-sm mt-1">Your assigned roles and group memberships across platforms</p>
      </div>
      <div className="grid grid-cols-3 gap-4">
        <GlassCard hover={false} delay={0.05}>
          <div className="text-center"><Key size={20} className="text-red-400 mx-auto mb-2" /><p className="text-2xl font-bold text-red-400">{myIdentity?.role_count || myPlatforms.length}</p><p className="text-[10px] text-slate-500 uppercase">Roles</p></div>
        </GlassCard>
        <GlassCard hover={false} delay={0.1}>
          <div className="text-center"><Layers size={20} className="text-blue-400 mx-auto mb-2" /><p className="text-2xl font-bold text-blue-400">{myIdentity?.group_count || myPlatforms.length}</p><p className="text-[10px] text-slate-500 uppercase">Groups</p></div>
        </GlassCard>
        <GlassCard hover={false} delay={0.15}>
          <div className="text-center"><Shield size={20} className="text-purple-400 mx-auto mb-2" /><p className="text-2xl font-bold text-purple-400">{myIdentity?.entitlement_count || 0}</p><p className="text-[10px] text-slate-500 uppercase">Entitlements</p></div>
        </GlassCard>
      </div>
      {myPlatforms.length > 0 ? (
        <div className="space-y-3">
          {myPlatforms.map((p, i) => {
            const role = myIdentity?.is_admin ? (ROLE_MAP[p]?.admin || 'Admin') : (ROLE_MAP[p]?.user || 'User');
            return (
              <GlassCard key={p} hover={false} delay={0.05 + i * 0.04}>
                <div className="flex items-center gap-4">
                  <PlatformIcon platform={p} size="lg" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-white">{PLATFORM_LABELS[p]}</p>
                    <div className="flex items-center gap-3 mt-1">
                      <span className="text-[10px] px-2 py-0.5 rounded bg-purple-500/10 text-purple-400 border border-purple-500/15">Role: {role}</span>
                      <span className="text-[10px] px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/15">Group: {GROUP_MAP[p] || 'Users'}</span>
                    </div>
                  </div>
                </div>
              </GlassCard>
            );
          })}
        </div>
      ) : (
        <GlassCard hover={false}><div className="flex flex-col items-center gap-3 py-12"><Shield size={40} className="text-slate-600" /><p className="text-sm text-slate-500">No roles assigned</p></div></GlassCard>
      )}
    </motion.div>
  );
}
