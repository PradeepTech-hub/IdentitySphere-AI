import { useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Send, Bot, User, Sparkles } from 'lucide-react';
import GlassCard from '../../components/shared/GlassCard';
import { getRiskEvents, getIdentities, getLifecycleEvents } from '../../services/storageService';
import { fetchCopilotChat } from '../../services/dataService';

const PLATFORM_LABELS = { active_directory: 'Active Directory', aws_iam: 'AWS IAM', okta: 'Okta', salesforce: 'Salesforce' };

const RESOURCE_MAP = {
  active_directory: ['domain-controller', 'dns-server', 'file-server', 'gpo-management', 'certificate-authority'],
  aws_iam: ['iam-console', 'ec2-instances', 's3-prod-data', 'kms-keys', 'lambda-functions', 'rds-databases'],
  okta: ['sso-config', 'api-tokens', 'mfa-policies', 'user-provisioning', 'app-integrations'],
  salesforce: ['crm-data', 'user-management', 'reports', 'apex-classes', 'api-access'],
};

function calcBlast(id, exclude) {
  const plats = (id.platforms || []).filter(p => p !== exclude);
  let res = 0, perms = 0, admin = 0;
  plats.forEach(p => {
    const r = RESOURCE_MAP[p] || ['resource'];
    const reachable = id.is_admin ? r.length : Math.min(r.length, 2);
    res += reachable;
    perms += id.is_admin ? reachable * 3 : reachable;
    if (id.is_admin && ['active_directory', 'aws_iam', 'okta', 'salesforce'].includes(p)) admin++;
  });
  return { resources: res, permissions: perms, adminRoles: admin, platforms: plats.length };
}

function calcCompliance(id) {
  const controls = [];
  if (id.is_admin) { controls.push({ id: 'NIST AC-6', name: 'Least Privilege', status: 'FAIL' }); controls.push({ id: 'CIS Control 6', name: 'Access Control', status: 'FAIL' }); controls.push({ id: 'ISO A.8.2', name: 'Privileged Access', status: 'FAIL' }); }
  if (!id.mfa_complete) { controls.push({ id: 'NIST IA-4', name: 'Identifier Mgmt', status: 'FAIL' }); controls.push({ id: 'ISO A.5.17', name: 'Authentication', status: 'FAIL' }); }
  if (id.status === 'Orphaned') { controls.push({ id: 'NIST AC-2', name: 'Account Mgmt', status: 'FAIL' }); controls.push({ id: 'GDPR Art.32', name: 'Security of Processing', status: 'FAIL' }); }
  if ((id.max_dormancy_days || 0) > 90) { controls.push({ id: 'NIST AC-2', name: 'Account Mgmt', status: 'FAIL' }); controls.push({ id: 'CIS Control 5', name: 'Account Mgmt', status: 'FAIL' }); }
  const total = 11;
  const failing = controls.length;
  const score = Math.round(((total - failing) / total) * 100);
  return { score, controls, failing };
}

const PRESET_QUERIES = [
  'Why is Raghu Krishnan risky?',
  'What happens if I revoke admin from Raghu Krishnan?',
  'What happens if I enable MFA for Ananya Rao?',
  'Show compliance impact for orphaned accounts',
  'Explain the attack path from Okta to domain-controller',
  'Generate remediation plan for Deepak Hegde',
];

function generateResponse(query) {
  const q = query.toLowerCase();
  const identities = getIdentities();
  const risks = getRiskEvents();

  const matchedIdentity = identities.find(i =>
    q.includes(i.display_name?.toLowerCase()) || q.includes(i.person_id?.toLowerCase())
  );

  if (matchedIdentity) {
    const id = matchedIdentity;
    const risk = risks.find(r => r.identityId === id.person_id);
    const blastBefore = calcBlast(id, null);
    const compBefore = calcCompliance(id);

    if (q.includes('revoke') || q.includes('what happens') || q.includes('what-if') || q.includes('remove')) {
      const isRevokeAdmin = q.includes('admin') || q.includes('revoke');
      const isMfaFix = q.includes('mfa') || q.includes('enable mfa');

      let afterId = { ...id };
      let actionDesc = '';

      if (isMfaFix) {
        afterId = { ...id, mfa_complete: true };
        actionDesc = `Enable MFA for ${id.display_name}`;
      } else {
        afterId = { ...id, is_admin: false };
        actionDesc = `Revoke Admin from ${id.display_name}`;
      }

      const blastAfter = calcBlast(afterId, null);
      const compAfter = calcCompliance(afterId);
      const scoreBefore = id.risk_score || 0;
      const scoreReduction = isMfaFix ? Math.round(scoreBefore * 0.15) : Math.round(scoreBefore * 0.4);
      const scoreAfter = Math.max(0, scoreBefore - scoreReduction);
      const sevAfter = scoreAfter >= 70 ? 'CRITICAL' : scoreAfter >= 45 ? 'HIGH' : scoreAfter >= 25 ? 'MEDIUM' : 'LOW';

      const controlChanges = compBefore.controls
        .filter(c => !compAfter.controls.find(ac => ac.id === c.id))
        .map(c => `- ${c.id} (${c.name}): FAIL → PASS`);

      return `**What-If Simulation: ${actionDesc}**

**Current State:**
- Risk Score: ${scoreBefore}/100 (${(id.severity || 'medium').toUpperCase()})
- Blast Radius: ${blastBefore.resources} Resources, ${blastBefore.permissions} Permissions, ${blastBefore.adminRoles} Admin Roles
- Compliance Score: ${compBefore.score}% (${compBefore.failing} failing controls)
- Platforms: ${id.platforms?.map(p => PLATFORM_LABELS[p] || p).join(', ')}

**After Fix:**
- Risk Score: ${scoreAfter}/100 (${sevAfter})
- Blast Radius: ${blastAfter.resources} Resources, ${blastAfter.permissions} Permissions, ${blastAfter.adminRoles} Admin Roles
- Compliance Score: ${compAfter.score}% (${compAfter.failing} failing controls)

**Improvement:**
- Risk Reduction: -${scoreReduction} points (${scoreBefore} → ${scoreAfter})
- Resources Reduced: -${blastBefore.resources - blastAfter.resources} (${blastBefore.resources} → ${blastAfter.resources})
- Permissions Reduced: -${blastBefore.permissions - blastAfter.permissions} (${blastBefore.permissions} → ${blastAfter.permissions})
- Admin Roles Reduced: -${blastBefore.adminRoles - blastAfter.adminRoles} (${blastBefore.adminRoles} → ${blastAfter.adminRoles})
- Compliance Improvement: +${compAfter.score - compBefore.score}% (${compBefore.score}% → ${compAfter.score}%)

**Framework Control Changes:**
${controlChanges.length > 0 ? controlChanges.join('\n') : '- No control status changes'}

*Evidence source: BlastRadiusEngine, ComplianceMapper, PrivilegeCalculator*`;
    }

    if (q.includes('remediation') || q.includes('plan')) {
      const steps = [];
      if (id.is_admin) steps.push(`Remove admin privileges — reduces risk by ${Math.round((id.risk_score || 0) * 0.4)} points`);
      if (!id.mfa_complete) steps.push(`Enable MFA — reduces risk by ${Math.round((id.risk_score || 0) * 0.15)} points`);
      if ((id.max_dormancy_days || 0) > 90) steps.push(`Investigate ${id.max_dormancy_days}-day dormancy — disable if not needed`);
      if (risk) steps.push(`Address ${risk.type.replace(/_/g, ' ')}: ${risk.title}`);
      steps.push('Schedule access review with department manager');
      steps.push('Implement JIT access for privileged operations');

      const fullFixId = { ...id, is_admin: false, mfa_complete: true, max_dormancy_days: 0 };
      const compAfterFull = calcCompliance(fullFixId);
      const blastAfterFull = calcBlast(fullFixId, null);
      const scoreAfterFull = Math.max(0, Math.round((id.risk_score || 0) * 0.25));

      return `**Remediation Plan: ${id.display_name} (${id.person_id})**

**Current State:** Risk ${id.risk_score}/100 | ${blastBefore.resources} Resources | Compliance ${compBefore.score}%

**Recommended Actions:**
${steps.map((s, i) => `${i + 1}. ${s}`).join('\n')}

**After Full Remediation:**
- Risk Score: ${id.risk_score} → ${scoreAfterFull} (-${(id.risk_score || 0) - scoreAfterFull} points)
- Blast Radius: ${blastBefore.resources} → ${blastAfterFull.resources} Resources
- Compliance: ${compBefore.score}% → ${compAfterFull.score}% (+${compAfterFull.score - compBefore.score}%)

**Compliance Controls Fixed:**
${compBefore.controls.filter(c => !compAfterFull.controls.find(ac => ac.id === c.id)).map(c => `- ${c.id}: FAIL → PASS`).join('\n') || '- No changes'}

*Evidence source: DetectionEngine, PrivilegeCalculator, ComplianceMapper*`;
    }

    return `**${id.display_name} (${id.person_id})** - Risk Score: **${id.risk_score}/100 (${(id.severity || 'medium').toUpperCase()})**

**Key Risk Factors:**
- **Platforms (${id.platforms?.length || 0}):** ${id.platforms?.map(p => PLATFORM_LABELS[p] || p).join(', ')}
- **Admin Access:** ${id.is_admin ? 'Yes — cross-platform admin exposure' : 'No'}
- **MFA Complete:** ${id.mfa_complete ? 'Yes' : 'No — MFA gap detected'}
- **Max Dormancy:** ${id.max_dormancy_days || 0} days
- **Blast Radius:** ${blastBefore.resources} resources, ${blastBefore.permissions} permissions, ${blastBefore.adminRoles} admin roles
- **Compliance:** ${compBefore.score}% (${compBefore.failing} failing controls)
${risk ? `
**Active Finding:** ${risk.type.replace(/_/g, ' ')} — ${risk.title} (Score: ${risk.score})` : ''}

**Failing Controls:**
${compBefore.controls.map(c => `- ${c.id}: ${c.name} — ${c.status}`).join('\n') || '- All controls passing'}

*Evidence source: DetectionEngine, PrivilegeCalculator, BehavioralEngine*`;
  }

  if (q.includes('orphaned')) {
    const orphaned = identities.filter(i => i.status === 'Orphaned');
    const totalRiskReduction = orphaned.reduce((a, i) => a + (i.risk_score || 0), 0);
    const totalResources = orphaned.reduce((a, i) => a + calcBlast(i, null).resources, 0);
    return `**Orphaned Account Analysis**

**Found ${orphaned.length} orphaned account(s):**
${orphaned.map(i => `- ${i.display_name} (${i.person_id}) — ${i.department} — Risk: ${i.risk_score} — ${(i.platforms || []).length} platform(s)`).join('\n') || '- No orphaned accounts detected'}

**Impact if Remediated:**
- Total Risk Reduction: -${totalRiskReduction} points
- Resources Secured: ${totalResources}
- Compliance Controls Fixed: NIST AC-2 (FAIL → PASS), GDPR Art.32 (FAIL → PASS)

**Compliance Impact:**
- NIST AC-2: Account Management — accounts must be disabled upon termination
- CIS Control 5: Account Management — orphaned accounts violate policy
- ISO A.5.16: Identity Management — terminated identities must be deprovisioned
- GDPR Art. 5: Data minimization violated by retaining unnecessary access

*Evidence source: DetectionEngine, OffboardingGapDetector*`;
  }

  if (q.includes('attack path') || q.includes('lateral')) {
    const admins = identities.filter(i => i.is_admin && (i.platforms?.length || 0) >= 3);
    const totalBlast = admins.reduce((a, i) => a + calcBlast(i, null).resources, 0);
    return `**Attack Path Analysis**

**${admins.length} identities with cross-platform admin enable lateral movement:**
${admins.slice(0, 5).map(i => {
  const b = calcBlast(i, null);
  return `- ${i.display_name}: ${i.platforms?.map(p => PLATFORM_LABELS[p] || p).join(' → ')} (Score: ${i.risk_score}, ${b.resources} resources)`;
}).join('\n')}

**Total Blast Radius:** ${totalBlast} resources reachable via cross-platform admins
**Attack Pattern:** Compromise → Lateral Movement → Privilege Escalation → Resource Access
**MITRE Mapping:** T1078 (Initial Access) → T1550 (Lateral Movement) → T1098 (Privilege Escalation)

*Evidence source: AttackGraph, IdentityResolver, PrivilegeCalculator*`;
  }

  const totalIdentities = identities.length;
  const criticalCount = risks.filter(r => r.severity === 'critical').length;
  const highCount = risks.filter(r => r.severity === 'high').length;
  const adminCount = identities.filter(i => i.is_admin).length;
  const mfaGaps = identities.filter(i => !i.mfa_complete && i.status === 'Active').length;
  const orphanedCount = identities.filter(i => i.status === 'Orphaned').length;
  const comp = calcCompliance({ is_admin: false, mfa_complete: true, status: 'Active', max_dormancy_days: 0 });

  return `**IdentitySphere Security Summary**

**${totalIdentities} identities monitored | ${risks.length} active findings**

- Critical Risks: ${criticalCount}
- High Risks: ${highCount}
- Admin Identities: ${adminCount}
- MFA Gaps: ${mfaGaps}
- Orphaned Accounts: ${orphanedCount}

Ask about a specific identity by name or ID for detailed analysis, or try:
- "What happens if I revoke admin from [name]?"
- "What happens if I enable MFA for [name]?"
- "Generate remediation plan for [name]"

*All analysis uses structured evidence from IdentitySphere detectors.*`;
}

export default function Copilot() {
  const [messages, setMessages] = useState([
    { role: 'assistant', content: 'I\'m your IdentitySphere AI Security Copilot. I provide exact risk calculations, blast radius analysis, and compliance impact assessments. Ask about any identity by name or ID.' },
  ]);
  const [input, setInput] = useState('');
  const [typing, setTyping] = useState(false);
  const endRef = useRef(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const send = async (text) => {
    const q = text || input;
    if (!q.trim()) return;
    setMessages(prev => [...prev, { role: 'user', content: q }]);
    setInput('');
    setTyping(true);
    try {
      let response;
      const identities = getIdentities();
      const matched = identities.find(i =>
        q.toLowerCase().includes(i.display_name?.toLowerCase()) ||
        q.toLowerCase().includes(i.person_id?.toLowerCase())
      );
      try {
        const data = await fetchCopilotChat(q, matched?.person_id || null);
        if (data.response && data.response.length > 100 && !data.response.includes('Ask about a specific person by name')) {
          response = data.response;
        }
      } catch { /* API unavailable */ }
      if (!response) {
        response = generateResponse(q);
      }
      setMessages(prev => [...prev, { role: 'assistant', content: response }]);
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: generateResponse(q) }]);
    } finally {
      setTyping(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <Sparkles size={24} className="text-red-400" /> IdentitySphere AI Security Copilot
        </h1>
        <p className="text-sm text-slate-500 mt-1">Evidence-based identity risk analysis with exact calculations</p>
      </div>

      <div className="grid lg:grid-cols-4 gap-6">
        <div className="lg:col-span-3">
          <GlassCard hover={false} className="p-0 flex flex-col" style={{ height: 560 }}>
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {messages.map((m, i) => (
                <motion.div key={i} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                  className={`flex gap-3 ${m.role === 'user' ? 'flex-row-reverse' : ''}`}>
                  <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${m.role === 'user' ? 'bg-red-500/20' : 'bg-white/5'}`}>
                    {m.role === 'user' ? <User size={14} className="text-red-400" /> : <Bot size={14} className="text-red-400" />}
                  </div>
                  <div className={`max-w-[80%] min-w-0 rounded-2xl px-4 py-3 text-sm leading-relaxed ${m.role === 'user' ? 'bg-red-500/10 text-red-100 border border-red-500/20' : 'bg-white/[0.03] text-slate-300 border border-white/5'}`}
                    style={{ overflowWrap: 'break-word', wordBreak: 'break-word' }}>
                    {m.content.split('\n').map((line, j) => (
                      <p key={j} className={j > 0 ? 'mt-1.5' : ''}>
                        {line.split(/(\*\*[^*]+\*\*)/).map((part, k) =>
                          part.startsWith('**') ? <strong key={k} className="text-white font-semibold">{part.slice(2, -2)}</strong> : part
                        )}
                      </p>
                    ))}
                  </div>
                </motion.div>
              ))}
              {typing && (
                <div className="flex gap-3">
                  <div className="w-8 h-8 rounded-xl bg-white/5 flex items-center justify-center"><Bot size={14} className="text-red-400" /></div>
                  <div className="bg-white/[0.03] border border-white/5 rounded-2xl px-4 py-3">
                    <div className="flex gap-1"><span className="w-2 h-2 bg-red-400 rounded-full animate-bounce" /><span className="w-2 h-2 bg-red-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }} /><span className="w-2 h-2 bg-red-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }} /></div>
                  </div>
                </div>
              )}
              <div ref={endRef} />
            </div>
            <div className="p-4 border-t border-white/5">
              <form onSubmit={e => { e.preventDefault(); send(); }} className="flex gap-2">
                <input value={input} onChange={e => setInput(e.target.value)} placeholder="Ask about identity risks, what-if simulations, or remediation..."
                  className="flex-1 px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-red-500/50 transition-all" />
                <button type="submit" className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-red-600 to-red-500 text-white hover:opacity-90 transition-opacity">
                  <Send size={16} />
                </button>
              </form>
            </div>
          </GlassCard>
        </div>

        <div className="space-y-3">
          <p className="text-[10px] text-slate-600 uppercase tracking-wider">Suggested Questions</p>
          {PRESET_QUERIES.map(q => (
            <motion.button key={q} whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
              onClick={() => send(q)}
              className="w-full text-left p-3 rounded-xl glass border border-white/5 text-xs text-slate-400 hover:text-red-400 hover:border-red-500/20 transition-all"
            >{q}</motion.button>
          ))}
        </div>
      </div>
    </div>
  );
}
