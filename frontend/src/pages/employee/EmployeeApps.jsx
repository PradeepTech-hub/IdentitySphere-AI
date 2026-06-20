import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { Server, Shield, Lock, Unlock, Clock, CheckCircle } from 'lucide-react';
import GlassCard from '../../components/shared/GlassCard';
import PlatformIcon from '../../components/shared/PlatformIcon';
import { useAuth } from '../../context/AuthContext';
import { getIdentities } from '../../services/storageService';

const PLATFORM_LABELS = { active_directory: 'Active Directory', aws_iam: 'AWS IAM', okta: 'Okta', salesforce: 'Salesforce', github: 'GitHub' };
const ROLE_MAP = { active_directory: 'Domain User', aws_iam: 'ReadOnlyAccess', okta: 'SSO User', github: 'Contributor', salesforce: 'Standard User' };
const PLATFORM_DESC = { active_directory: 'Corporate directory, file shares, and Windows resources', aws_iam: 'Cloud infrastructure, compute, and storage services', okta: 'Single sign-on and application portal', github: 'Source code repositories and CI/CD pipelines', salesforce: 'Customer relationship management and reports' };

export default function EmployeeApps() {
  const { user } = useAuth();
  const myIdentity = useMemo(() => getIdentities().find(i => i.email === user?.email || i.display_name === user?.name), [user]);
  const myPlatforms = myIdentity?.platforms || [];

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-3"><Server className="w-7 h-7 text-blue-400" /> My Applications</h1>
        <p className="text-slate-400 text-sm mt-1">{myPlatforms.length} application(s) assigned to your identity</p>
      </div>
      {myPlatforms.length > 0 ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {myPlatforms.map((p, i) => (
            <GlassCard key={p} hover={false} delay={i * 0.05}>
              <div className="flex items-start gap-4">
                <PlatformIcon platform={p} size="lg" />
                <div className="flex-1">
                  <h3 className="text-sm font-bold text-white">{PLATFORM_LABELS[p] || p}</h3>
                  <p className="text-[10px] text-slate-500 mt-0.5">{PLATFORM_DESC[p] || 'Enterprise platform'}</p>
                  <div className="flex items-center gap-3 mt-3 text-xs text-slate-400">
                    <span className="flex items-center gap-1"><Shield size={10} /> {ROLE_MAP[p] || 'User'}</span>
                    <span className="flex items-center gap-1">{myIdentity?.mfa_complete ? <Lock size={10} className="text-emerald-400" /> : <Unlock size={10} className="text-red-400" />} MFA</span>
                    <span className="flex items-center gap-1"><CheckCircle size={10} className="text-emerald-400" /> Active</span>
                  </div>
                </div>
              </div>
            </GlassCard>
          ))}
        </div>
      ) : (
        <GlassCard hover={false}><div className="flex flex-col items-center gap-3 py-12"><Server size={40} className="text-slate-600" /><p className="text-sm text-slate-500">No applications assigned — submit an access request to get started</p></div></GlassCard>
      )}
    </motion.div>
  );
}
