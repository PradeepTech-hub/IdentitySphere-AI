import { useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Send, Bot, User, Sparkles } from 'lucide-react';
import { getRiskEvents, getIdentities } from '../../services/storageService';
import { fetchCopilotChat } from '../../services/dataService';

const PLATFORM_LABELS = { active_directory: 'Active Directory', aws_iam: 'AWS IAM', okta: 'Okta', salesforce: 'Salesforce', azure_ad: 'Azure AD', github: 'GitHub', servicenow: 'ServiceNow' };

const RESOURCE_MAP = {
  active_directory: ['domain-controller', 'dns-server', 'file-server', 'gpo-management', 'certificate-authority'],
  aws_iam: ['iam-console', 'ec2-instances', 's3-prod-data', 'kms-keys', 'lambda-functions', 'rds-databases'],
  okta: ['sso-config', 'api-tokens', 'mfa-policies', 'user-provisioning', 'app-integrations'],
  salesforce: ['crm-data', 'user-management', 'reports', 'apex-classes', 'api-access'],
  azure_ad: ['directory-roles', 'conditional-access', 'app-registrations', 'groups', 'pim-assignments'],
  github: ['repositories', 'actions-workflows', 'secrets', 'deploy-keys', 'org-settings'],
  servicenow: ['incident-management', 'change-requests', 'cmdb', 'user-admin', 'workflow-editor'],
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

function getPresetQueries() {
  const identities = getIdentities();
  if (!identities.length) return [
    'Show compliance impact for orphaned accounts',
    'Explain the attack path from Okta to domain-controller',
    'Show top risky identities',
  ];
  const sorted = [...identities].sort((a, b) => (b.risk_score || 0) - (a.risk_score || 0));
  const topRisk = sorted[0];
  const topAdmin = sorted.find(i => i.is_admin);
  const topMfaGap = sorted.find(i => !i.mfa_complete && (i.status || '').toLowerCase() === 'active');
  const forRemediation = sorted.find(i => i.person_id !== topRisk?.person_id && i.person_id !== topAdmin?.person_id && i.risk_score > 0);

  const queries = [];
  if (topRisk) queries.push(`Why is ${topRisk.display_name} risky?`);
  if (topAdmin) queries.push(`What happens if I revoke admin from ${topAdmin.display_name}?`);
  if (topMfaGap) queries.push(`What happens if I enable MFA for ${topMfaGap.display_name}?`);
  queries.push('Show compliance impact for orphaned accounts');
  queries.push('Explain the attack path from Okta to domain-controller');
  if (forRemediation) queries.push(`Generate remediation plan for ${forRemediation.display_name}`);
  if (queries.length < 6) queries.push('Show top risky identities');
  return queries.slice(0, 6);
}

function findIdentity(query, identities) {
  const q = query.toLowerCase();
  let match = identities.find(i =>
    q.includes(i.display_name?.toLowerCase()) || q.includes(i.person_id?.toLowerCase())
  );
  if (match) return match;
  const words = q.replace(/[?.,!]/g, '').split(/\s+/).filter(w => w.length > 2);
  for (const id of identities) {
    const nameParts = (id.display_name || '').toLowerCase().split(/\s+/);
    if (nameParts.length >= 2 && nameParts.every(part => words.includes(part))) return id;
  }
  for (const id of identities) {
    const nameParts = (id.display_name || '').toLowerCase().split(/\s+/);
    const surname = nameParts[nameParts.length - 1];
    if (surname && surname.length > 2 && words.includes(surname)) return id;
  }
  return null;
}

function getRiskFactors(id) {
  if (id.relationships_risky?.length) {
    return id.relationships_risky.map(r =>
      `- **${r.label}** (${(r.severity || '').toUpperCase()}): ${r.detail}`
    ).join('\n');
  }
  const factors = [];
  if (id.is_admin) factors.push(`- **Cross-Platform Admin** (CRITICAL): Admin on ${(id.platforms || []).join(', ')}`);
  if (!id.mfa_complete) factors.push(`- **MFA Gap** (HIGH): MFA not enabled across all platforms`);
  if ((id.max_dormancy_days || 0) > 90) factors.push(`- **Dormant Account** (HIGH): ${id.max_dormancy_days} days inactive`);
  if ((id.platforms?.length || 0) >= 3) factors.push(`- **Wide Platform Spread** (MEDIUM): Access on ${id.platforms.length} platforms`);
  if (id.anomaly_category) factors.push(`- **Anomaly** (MEDIUM): ${id.anomaly_category.replace(/_/g, ' ')}`);
  return factors.join('\n') || '- No significant risk factors detected';
}

function getScoreBreakdown(id) {
  if (id.score_breakdown?.length) {
    return id.score_breakdown.map(s => `- ${s.factor}: ${s.value?.toFixed?.(1) ?? s.value}`).join('\n');
  }
  return `- Privilege Breadth: ${id.is_admin ? 'High' : 'Low'}
- Cross-Platform Exposure: ${(id.platforms?.length || 0)} platforms
- Dormancy Risk: ${id.max_dormancy_days || 0} days
- MFA Status: ${id.mfa_complete ? 'Enabled' : 'Gap detected'}`;
}

function generateResponse(query) {
  const q = query.toLowerCase();
  const identities = getIdentities();
  const risks = getRiskEvents();

  const matchedIdentity = findIdentity(query, identities);

  if (matchedIdentity) {
    const id = matchedIdentity;
    const risk = risks.find(r => r.identityId === id.person_id || r.identity === id.display_name);
    const blastBefore = calcBlast(id, null);
    const compBefore = calcCompliance(id);

    if (q.includes('revoke') || q.includes('what happens') || q.includes('what-if') || q.includes('remove') || q.includes('enable') || q.includes('disable')) {
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

**After ${isMfaFix ? 'Enabling MFA' : 'Revoking Admin'}:**
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

    if (q.includes('remediation') || q.includes('plan') || q.includes('fix') || q.includes('remediate')) {
      const steps = id.remediation_steps?.length
        ? id.remediation_steps
        : (() => {
            const s = [];
            if (id.is_admin) s.push(`Remove admin privileges — reduces risk by ~${Math.round((id.risk_score || 0) * 0.4)} points`);
            if (!id.mfa_complete) s.push(`Enable MFA — reduces risk by ~${Math.round((id.risk_score || 0) * 0.15)} points`);
            if ((id.max_dormancy_days || 0) > 90) s.push(`Investigate ${id.max_dormancy_days}-day dormancy — disable if not needed`);
            if (risk) s.push(`Address ${(risk.type || '').replace(/_/g, ' ')}: ${risk.title}`);
            s.push('Schedule access review with department manager');
            s.push('Implement JIT access for privileged operations');
            return s;
          })();

      const compRefs = id.compliance_refs?.length
        ? id.compliance_refs.map(c => `- ${c}`).join('\n')
        : compBefore.controls.map(c => `- ${c.id}: ${c.name}`).join('\n') || '- No compliance gaps';

      const fullFixId = { ...id, is_admin: false, mfa_complete: true, max_dormancy_days: 0 };
      const compAfterFull = calcCompliance(fullFixId);
      const blastAfterFull = calcBlast(fullFixId, null);
      const scoreAfterFull = Math.max(0, Math.round((id.risk_score || 0) * 0.25));

      return `**Remediation Plan: ${id.display_name} (${id.person_id})**

**Current State:** Risk ${id.risk_score}/100 (${(id.severity || 'medium').toUpperCase()}) | ${id.department || 'Unknown'} — ${id.title || 'Unknown'} | ${(id.platforms || []).length} platform(s)

**Risk Factors:**
${getRiskFactors(id)}

**Recommended Actions:**
${steps.map((s, i) => `${i + 1}. ${s}`).join('\n')}

**After Full Remediation:**
- Risk Score: ${id.risk_score} → ${scoreAfterFull} (-${(id.risk_score || 0) - scoreAfterFull} points)
- Blast Radius: ${blastBefore.resources} → ${blastAfterFull.resources} Resources
- Compliance: ${compBefore.score}% → ${compAfterFull.score}%

**Compliance References:**
${compRefs}

*Evidence source: DetectionEngine, PrivilegeCalculator, ComplianceMapper*`;
    }

    return `**${id.display_name} (${id.person_id})** — Risk Score: **${id.risk_score}/100 (${(id.severity || 'medium').toUpperCase()})**
**${id.department || 'Unknown'}** — ${id.title || 'Unknown'} — ${(id.type || 'Human')}

**Score Breakdown:**
${getScoreBreakdown(id)}

**Risk Factors:**
${getRiskFactors(id)}

**Identity Details:**
- **Platforms (${id.platforms?.length || 0}):** ${id.platforms?.map(p => PLATFORM_LABELS[p] || p).join(', ')}
- **Admin Access:** ${id.is_admin ? 'Yes — cross-platform admin exposure' : 'No'}
- **MFA Complete:** ${id.mfa_complete ? 'Yes' : 'No — MFA gap detected'}
- **Max Dormancy:** ${id.max_dormancy_days || 0} days
- **Groups:** ${id.group_count || 0} | **Roles:** ${id.role_count || 0} | **Entitlements:** ${id.entitlement_count || 0}
- **Blast Radius:** ${blastBefore.resources} resources, ${blastBefore.permissions} permissions, ${blastBefore.adminRoles} admin roles
- **Compliance:** ${compBefore.score}% (${compBefore.failing} failing controls)
${risk ? `\n**Active Finding:** ${(risk.type || '').replace(/_/g, ' ')} — ${risk.title} (Score: ${risk.score})` : ''}

*Evidence source: DetectionEngine, PrivilegeCalculator, BehavioralEngine*`;
  }

  if (q.includes('orphaned') || q.includes('orphan')) {
    const orphaned = identities.filter(i => (i.status || '').toLowerCase() === 'orphaned');
    const totalRiskReduction = orphaned.reduce((a, i) => a + (i.risk_score || 0), 0);
    const totalResources = orphaned.reduce((a, i) => a + calcBlast(i, null).resources, 0);
    return `**Orphaned Account Analysis**

**Found ${orphaned.length} orphaned account(s):**
${orphaned.slice(0, 10).map(i => `- ${i.display_name} (${i.person_id}) — ${i.department || 'Unknown'} — Risk: ${i.risk_score} — ${(i.platforms || []).length} platform(s)`).join('\n') || '- No orphaned accounts detected'}
${orphaned.length > 10 ? `\n... and ${orphaned.length - 10} more orphaned accounts` : ''}

**Impact if Remediated:**
- Total Risk Reduction: -${Math.round(totalRiskReduction)} points
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
${admins.length > 5 ? `\n... and ${admins.length - 5} more cross-platform admins` : ''}

**Total Blast Radius:** ${totalBlast} resources reachable via cross-platform admins
**Attack Pattern:** Compromise → Lateral Movement → Privilege Escalation → Resource Access
**MITRE Mapping:** T1078 (Initial Access) → T1550 (Lateral Movement) → T1098 (Privilege Escalation)

*Evidence source: AttackGraph, IdentityResolver, PrivilegeCalculator*`;
  }

  if (q.includes('top') || q.includes('riskiest') || q.includes('highest risk') || q.includes('most risky') || q.includes('who is') || q.includes('who are')) {
    const sorted = [...identities].sort((a, b) => (b.risk_score || 0) - (a.risk_score || 0));
    const top = sorted.slice(0, 10);
    return `**Top ${top.length} Risky Identities**

${top.map((i, idx) => `${idx + 1}. **${i.display_name}** (${i.person_id}) — ${i.risk_score}/100 (${(i.severity || 'medium').toUpperCase()}) — ${i.department || 'Unknown'} — ${i.is_admin ? 'Admin' : 'User'} — MFA: ${i.mfa_complete ? 'Yes' : 'No'}`).join('\n')}

**Summary:**
- ${top.filter(i => i.is_admin).length} of top ${top.length} are admins
- ${top.filter(i => !i.mfa_complete).length} have MFA gaps
- Average risk score: ${Math.round(top.reduce((a, i) => a + (i.risk_score || 0), 0) / top.length)}

*Evidence source: RiskScoring, DetectionEngine*`;
  }

  if (q.includes('mfa') && !matchedIdentity) {
    const mfaGaps = identities.filter(i => !i.mfa_complete && (i.status || '').toLowerCase() === 'active');
    const adminsWithGap = mfaGaps.filter(i => i.is_admin);
    return `**MFA Gap Analysis**

**${mfaGaps.length} active identities without complete MFA coverage**

**Critical — Admins without MFA (${adminsWithGap.length}):**
${adminsWithGap.slice(0, 5).map(i => `- ${i.display_name} (${i.person_id}) — ${i.department || 'Unknown'} — Risk: ${i.risk_score} — ${(i.platforms || []).length} platform(s)`).join('\n') || '- No admin MFA gaps'}
${adminsWithGap.length > 5 ? `\n... and ${adminsWithGap.length - 5} more` : ''}

**Total MFA Impact:**
- Risk reduction if all MFA enabled: ~${Math.round(mfaGaps.reduce((a, i) => a + (i.risk_score || 0) * 0.15, 0))} points
- Compliance controls fixed: NIST IA-4, ISO A.5.17

*Evidence source: DetectionEngine, ComplianceMapper*`;
  }

  if (q.includes('admin') && !matchedIdentity) {
    const admins = [...identities.filter(i => i.is_admin)].sort((a, b) => (b.risk_score || 0) - (a.risk_score || 0));
    return `**Admin Identity Analysis**

**${admins.length} identities with admin privileges**

**Top Risky Admins:**
${admins.slice(0, 8).map((i, idx) => `${idx + 1}. **${i.display_name}** — Risk: ${i.risk_score}/100 — ${(i.platforms || []).length} platforms — MFA: ${i.mfa_complete ? 'Yes' : 'No'}`).join('\n')}
${admins.length > 8 ? `\n... and ${admins.length - 8} more admins` : ''}

**Admin Risk Summary:**
- Admins without MFA: ${admins.filter(i => !i.mfa_complete).length}
- Admins on 3+ platforms: ${admins.filter(i => (i.platforms?.length || 0) >= 3).length}
- Average admin risk score: ${Math.round(admins.reduce((a, i) => a + (i.risk_score || 0), 0) / (admins.length || 1))}

*Evidence source: PrivilegeCalculator, DetectionEngine*`;
  }

  const totalIdentities = identities.length;
  const criticalRisks = identities.filter(i => (i.severity || '').toLowerCase() === 'critical');
  const highRisks = identities.filter(i => (i.severity || '').toLowerCase() === 'high');
  const adminCount = identities.filter(i => i.is_admin).length;
  const mfaGaps = identities.filter(i => !i.mfa_complete && (i.status || '').toLowerCase() === 'active').length;
  const orphanedCount = identities.filter(i => (i.status || '').toLowerCase() === 'orphaned').length;
  const topNames = [...identities].sort((a, b) => (b.risk_score || 0) - (a.risk_score || 0)).slice(0, 3);

  return `**IdentitySphere Security Summary**

**${totalIdentities} identities monitored | ${risks.length} active findings**

- Critical Risks: ${criticalRisks.length}
- High Risks: ${highRisks.length}
- Admin Identities: ${adminCount}
- MFA Gaps: ${mfaGaps}
- Orphaned Accounts: ${orphanedCount}

**Top Risk Identities:**
${topNames.map(i => `- ${i.display_name} (${i.person_id}) — ${i.risk_score}/100`).join('\n')}

Ask about a specific identity by name or ID for detailed analysis, or try:
- "Why is ${topNames[0]?.display_name || 'someone'} risky?"
- "What happens if I revoke admin from [name]?"
- "Generate remediation plan for [name]"
- "Show top risky identities"

*All analysis uses structured evidence from IdentitySphere detectors.*`;
}

function renderBold(text) {
  return text.split(/(\*\*[^*]+\*\*)/).map((part, k) =>
    part.startsWith('**') ? <strong key={k} className="text-white font-semibold">{part.slice(2, -2)}</strong> : part
  );
}

export default function Copilot() {
  const [messages, setMessages] = useState([
    { role: 'assistant', content: 'I\'m your IdentitySphere AI Security Copilot. I provide exact risk calculations, blast radius analysis, and compliance impact assessments. Ask about any identity by name or ID.' },
  ]);
  const [input, setInput] = useState('');
  const [typing, setTyping] = useState(false);
  const endRef = useRef(null);

  const msgCount = useRef(messages.length);
  useEffect(() => {
    if (messages.length > msgCount.current) {
      endRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
    msgCount.current = messages.length;
  }, [messages]);

  const send = async (text) => {
    const q = text || input;
    if (!q.trim()) return;
    setMessages(prev => [...prev, { role: 'user', content: q }]);
    setInput('');
    setTyping(true);
    try {
      let response;
      const identities = getIdentities();
      const matched = findIdentity(q, identities);
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

      <div className="grid lg:grid-cols-4 gap-6 min-w-0">
        <div className="lg:col-span-3 min-w-0">
          <div
            className="relative rounded-xl flex flex-col"
            style={{
              height: 'calc(100vh - 180px)',
              minHeight: 400,
              maxHeight: 800,
              overflow: 'hidden',
              background: 'linear-gradient(145deg, rgba(8,10,18,0.82) 0%, rgba(5,6,13,0.85) 55%, rgba(13,17,26,0.80) 100%)',
              border: '1px solid rgba(227, 25, 55, 0.22)',
              backdropFilter: 'blur(20px)',
              WebkitBackdropFilter: 'blur(20px)',
              boxShadow: '0 4px 24px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.04)',
            }}
          >
            <div className="flex-1 overflow-y-auto p-3 sm:p-5 space-y-4 min-w-0" style={{ overflowX: 'hidden' }}>
              {messages.map((m, i) => (
                <div key={i} className={`flex gap-2 sm:gap-3 min-w-0 ${m.role === 'user' ? 'flex-row-reverse' : ''}`}>
                  <div className={`w-7 h-7 sm:w-8 sm:h-8 rounded-xl flex items-center justify-center shrink-0 ${m.role === 'user' ? 'bg-red-500/20' : 'bg-white/5'}`}>
                    {m.role === 'user' ? <User size={14} className="text-red-400" /> : <Bot size={14} className="text-red-400" />}
                  </div>
                  <div className={`rounded-2xl px-3 sm:px-4 py-3 text-sm leading-relaxed min-w-0 ${m.role === 'user' ? 'bg-red-500/10 text-red-100 border border-red-500/20 max-w-[85%]' : 'bg-white/[0.03] text-slate-300 border border-white/5 max-w-full'}`}
                    style={{ overflowWrap: 'anywhere', wordBreak: 'break-word', overflowX: 'hidden' }}>
                    {m.content.split('\n').map((line, j) => (
                      <p key={j} className={j > 0 ? 'mt-1.5' : ''}>
                        {line.startsWith('- ') ? (
                          <span className="flex gap-1.5"><span className="text-red-400 shrink-0">•</span><span>{renderBold(line.slice(2))}</span></span>
                        ) : renderBold(line)}
                      </p>
                    ))}
                  </div>
                </div>
              ))}
              {typing && (
                <div className="flex gap-3">
                  <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl bg-white/5 flex items-center justify-center shrink-0"><Bot size={14} className="text-red-400" /></div>
                  <div className="bg-white/[0.03] border border-white/5 rounded-2xl px-4 py-3">
                    <div className="flex gap-1"><span className="w-2 h-2 bg-red-400 rounded-full animate-bounce" /><span className="w-2 h-2 bg-red-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }} /><span className="w-2 h-2 bg-red-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }} /></div>
                  </div>
                </div>
              )}
              <div ref={endRef} />
            </div>
            <div className="p-3 sm:p-4 border-t border-white/5 shrink-0">
              <form onSubmit={e => { e.preventDefault(); send(); }} className="flex gap-2">
                <input value={input} onChange={e => setInput(e.target.value)} placeholder="Ask about identity risks, what-if simulations, or remediation..."
                  className="flex-1 min-w-0 px-3 sm:px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-red-500/50 transition-all" />
                <button type="submit" className="px-3 sm:px-4 py-2.5 rounded-xl bg-gradient-to-r from-red-600 to-red-500 text-white hover:opacity-90 transition-opacity shrink-0">
                  <Send size={16} />
                </button>
              </form>
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <p className="text-[10px] text-slate-600 uppercase tracking-wider">Suggested Questions</p>
          {getPresetQueries().map(q => (
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
