import { useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Send, Bot, User, Sparkles } from 'lucide-react';
import GlassCard from '../../components/shared/GlassCard';
import PageHeader from '../../components/shared/PageHeader';
import { getRiskEvents, getBlastRadii, getIdentities } from '../../services/storageService';

const PRESET_QUERIES = [
  'Why is Raghu Krishnan risky?',
  'What happens if I revoke AWS Admin from ID-0001?',
  'Show compliance impact for orphaned accounts',
  'Explain the attack path from Okta to domain-controller',
  'Generate remediation plan for Deepak Hegde',
];

function generateResponse(query) {
  const q = query.toLowerCase();
  const identities = getIdentities();
  const risks = getRiskEvents();
  const blasts = getBlastRadii();

  const matchedIdentity = identities.find(i =>
    q.includes(i.display_name.toLowerCase()) || q.includes(i.person_id.toLowerCase())
  );

  if (matchedIdentity) {
    const risk = risks.find(r => r.identityId === matchedIdentity.person_id);
    const blast = blasts.find(b => b.id === matchedIdentity.person_id);

    if (q.includes('revoke') || q.includes('what happens') || q.includes('what-if')) {
      return `**What-If Simulation: Revoke Admin from ${matchedIdentity.display_name}**

**Current State:**
- Platforms: ${matchedIdentity.platforms?.join(', ') || 'N/A'}
- Reachable resources: ${blast?.resources || 'Unknown'}
- Risk Score: ${matchedIdentity.risk_score}/100 (${matchedIdentity.severity?.toUpperCase()})
- Admin: ${matchedIdentity.is_admin ? 'Yes' : 'No'}

**After Revocation:**
- Estimated resource reduction: ~30%
- Risk score reduction: ~15-25 points
- Severity may drop to ${matchedIdentity.severity === 'critical' ? 'HIGH' : 'MEDIUM'}

**Recommendation:** Revoking admin access reduces blast radius. Consider implementing JIT access for remaining privileged roles. ${matchedIdentity.mfa_complete ? '' : 'Also enforce MFA on all accounts.'}

*Evidence source: BlastRadiusEngine, AttackGraph, PrivilegeCalculator*`;
    }

    if (q.includes('remediation') || q.includes('plan')) {
      const steps = [];
      if (matchedIdentity.is_admin) steps.push('Review admin privilege necessity across all platforms');
      if (!matchedIdentity.mfa_complete) steps.push('Enable MFA on all active accounts immediately');
      if (matchedIdentity.max_dormancy_days > 90) steps.push(`Investigate dormant access (${matchedIdentity.max_dormancy_days} days)`);
      if (risk) steps.push(`Address ${risk.type.replace(/_/g, ' ')} finding: ${risk.title}`);
      steps.push('Schedule access review with department manager');
      steps.push('Implement JIT access for privileged operations');
      return `**Remediation Plan: ${matchedIdentity.display_name} (${matchedIdentity.person_id})**

**Risk Score:** ${matchedIdentity.risk_score}/100 (${matchedIdentity.severity?.toUpperCase()})
**Department:** ${matchedIdentity.department}

**Recommended Actions:**
${steps.map((s, i) => `${i + 1}. ${s}`).join('\n')}

**Compliance Impact:** Addresses NIST AC-2, AC-6, CIS Controls 5 & 6

*Evidence source: DetectionEngine, PrivilegeCalculator, ComplianceMapper*`;
    }

    return `**${matchedIdentity.display_name} (${matchedIdentity.person_id})** - Risk Score: **${matchedIdentity.risk_score}/100 (${matchedIdentity.severity?.toUpperCase()})**

**Key Risk Factors:**
- **Platforms (${matchedIdentity.platform_count}):** ${matchedIdentity.platforms?.join(', ')}
- **Admin Access:** ${matchedIdentity.is_admin ? 'Yes - cross-platform admin exposure' : 'No'}
- **MFA Complete:** ${matchedIdentity.mfa_complete ? 'Yes' : 'No - MFA gap detected'}
- **Max Dormancy:** ${matchedIdentity.max_dormancy_days} days
${risk ? `
**Active Finding:**
- Type: ${risk.type.replace(/_/g, ' ')}
- Title: ${risk.title}
- Score: ${risk.score}` : ''}
${blast ? `
**Blast Radius:**
- Resources: ${blast.resources}
- Permissions: ${blast.permissions}
- Admin Roles: ${blast.adminRoles}` : ''}

**Compliance Impact:** ${matchedIdentity.is_admin ? 'Violates NIST AC-6 (Least Privilege), MITRE T1098' : 'Monitor for NIST AC-2 compliance'}

*Evidence source: DetectionEngine, PrivilegeCalculator, BehavioralEngine*`;
  }

  if (q.includes('orphaned')) {
    const orphaned = identities.filter(i => i.status === 'Orphaned');
    return `**Orphaned Account Analysis**

**Found ${orphaned.length} orphaned account(s):**
${orphaned.map(i => `- ${i.display_name} (${i.person_id}) - ${i.department} - Risk: ${i.risk_score}`).join('\n') || '- No orphaned accounts detected'}

**Compliance Impact:**
- NIST AC-2: Account Management - accounts must be disabled upon termination
- MITRE T1078: Valid Accounts - orphaned credentials enable unauthorized access
- GDPR Art. 5: Data minimization violated by retaining unnecessary access

**Recommendation:** Immediately disable all orphaned accounts and audit access logs since termination date.

*Evidence source: DetectionEngine, OffboardingGapDetector*`;
  }

  if (q.includes('attack path') || q.includes('lateral')) {
    const admins = identities.filter(i => i.is_admin && i.platforms?.length >= 3);
    return `**Attack Path Analysis**

**${admins.length} identities with cross-platform admin exposure enable lateral movement:**
${admins.slice(0, 5).map(i => `- ${i.display_name}: ${i.platforms?.join(' → ')} (Score: ${i.risk_score})`).join('\n')}

**Attack Pattern:** Compromise on one platform → lateral movement via correlated identity → privilege escalation on target platform → resource access

**MITRE Mapping:** T1078 (Initial Access) → T1550 (Lateral Movement) → T1098 (Privilege Escalation)

*Evidence source: AttackGraph, IdentityResolver, PrivilegeCalculator*`;
  }

  return `I've analyzed the evidence from the IdentitySphere detection engines. Based on the ${identities.length} identities monitored and ${risks.length} active risk findings, here's what I found:

**Summary:**
- Critical risks: ${risks.filter(r => r.severity === 'critical').length}
- High risks: ${risks.filter(r => r.severity === 'high').length}
- Identities with admin access: ${identities.filter(i => i.is_admin).length}
- MFA gaps: ${identities.filter(i => !i.mfa_complete).length}

For detailed analysis, ask about a specific identity by name or ID.

*Note: All analysis uses structured evidence from IdentitySphere detectors.*`;
}

export default function Copilot() {
  const [messages, setMessages] = useState([
    { role: 'assistant', content: 'I\'m your IdentitySphere AI Security Copilot. I can explain risk findings, attack paths, blast radius impact, and generate remediation plans. Ask about any identity by name or ID.' },
  ]);
  const [input, setInput] = useState('');
  const [typing, setTyping] = useState(false);
  const endRef = useRef(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const send = (text) => {
    const q = text || input;
    if (!q.trim()) return;
    setMessages(prev => [...prev, { role: 'user', content: q }]);
    setInput('');
    setTyping(true);
    setTimeout(() => {
      const response = generateResponse(q);
      setMessages(prev => [...prev, { role: 'assistant', content: response }]);
      setTyping(false);
    }, 800 + Math.random() * 700);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        badge="AI Copilot"
        title="IdentitySphere AI Security Copilot"
        subtitle="Evidence-based identity risk explanation and remediation"
      />

      <div className="grid lg:grid-cols-4 gap-6">
        <div className="lg:col-span-3">
          <GlassCard hover={false} className="p-0 flex flex-col" style={{ height: 560 }}>
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {messages.map((m, i) => (
                <motion.div key={i} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                  className={`flex gap-3 ${m.role === 'user' ? 'flex-row-reverse' : ''}`}
                >
                  <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${m.role === 'user' ? 'bg-red-500/20' : 'bg-white/5'}`}>
                    {m.role === 'user' ? <User size={14} className="text-red-400" /> : <Bot size={14} className="text-red-400" />}
                  </div>
                  <div className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${m.role === 'user' ? 'bg-red-500/10 text-red-100 border border-red-500/20' : 'bg-white/[0.03] text-slate-300 border border-white/5'}`}>
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
                <input value={input} onChange={e => setInput(e.target.value)} placeholder="Ask about identity risks, attack paths, or remediation..."
                  className="flex-1 px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-red-500/50 transition-all"
                />
                <button type="submit" className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-red-600 to-red-500 text-white hover:opacity-90 transition-opacity">
                  <Send size={16} />
                </button>
              </form>
            </div>
          </GlassCard>
        </div>

        <div className="space-y-3">
          <p className="text-[10px] text-slate-600 uppercase tracking-[0.15em] font-orbitron">Suggested Questions</p>
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
