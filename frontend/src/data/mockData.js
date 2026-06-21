export const USERS = {
  'admin@identitysphere.ai': { role: 'admin', name: 'Pradeep M', title: 'CISO' },
  'auditor@identitysphere.ai': { role: 'auditor', name: 'Kavya R', title: 'Compliance Auditor' },
  'executive@identitysphere.ai': { role: 'executive', name: 'Deepak Hegde', title: 'VP Finance' },
  'employee@identitysphere.ai': { role: 'employee', name: 'Rahul Sharma', title: 'Sr Software Engineer' },
  'contractor@identitysphere.ai': { role: 'contractor', name: 'Suresh Rajan', title: 'External Contractor' },
};

export const STATS = {
  totalIdentities: 25,
  criticalRisks: 5,
  complianceScore: 78,
  activeIncidents: 6,
  platforms: 4,
  crossPlatformAdmins: 6,
  staleAccounts: 1,
  offboardingGaps: 1,
  alertReduction: 86.7,
};

export const RISK_EVENTS = [];
export const BLAST_RADII = [];
export const INCIDENTS = [];

export const COMPLIANCE_MAP = [
  { capability: 'Orphaned Account Detection', nist: 'AC-2', mitre: 'T1078', gdpr: 'Art. 5', cis: '5', count: 1 },
  { capability: 'Effective Privilege Calculator', nist: 'AC-6', mitre: 'T1098', gdpr: 'Art. 5', cis: '6', count: 6 },
  { capability: 'Cross-Platform Resolver', nist: 'IA-4, AC-6', mitre: 'T1078', gdpr: 'Art. 32', cis: '5, 6', count: 6 },
  { capability: 'Token Abuse Detection', nist: 'AC-2, IA-4', mitre: 'T1550', gdpr: 'Art. 32', cis: '6', count: 1 },
  { capability: 'Privilege Escalation Detection', nist: 'AC-2, AC-6', mitre: 'T1098', gdpr: 'Art. 32', cis: '5, 6', count: 1 },
  { capability: 'Offboarding Gap Detection', nist: 'AC-2', mitre: 'T1078', gdpr: 'Art. 32', cis: '5', count: 1 },
  { capability: 'Stale Account Detection', nist: 'AC-2', mitre: 'T1078', gdpr: 'Art. 5', cis: '5', count: 1 },
  { capability: 'MFA Gap Detection', nist: 'IA-4', mitre: 'T1078', gdpr: 'Art. 32', cis: '6', count: 4 },
  { capability: 'SoD Violation Detection', nist: 'AC-6', mitre: 'T1098', gdpr: 'Art. 5', cis: '6', count: 1 },
];

export const RISK_DISTRIBUTION = {
  orphaned_account: 1, mfa_disabled: 4, cross_platform_admin: 6,
  stale_account: 1, sod_violation: 1, privilege_escalation: 1,
  offboarding_gap: 1, token_abuse: 1,
};

export const SEVERITY_DIST = { critical: 5, high: 7, medium: 6, low: 4 };

export const IDENTITY_GRAPH_NODES = [
  { id: '1', type: 'identity', data: { label: 'Raghu Krishnan', platform: 'identity' }, position: { x: 400, y: 20 } },
  { id: '2', type: 'account', data: { label: 'raghu.krishnan', platform: 'okta' }, position: { x: 100, y: 150 } },
  { id: '3', type: 'account', data: { label: 'raghu.krishnan', platform: 'active_directory' }, position: { x: 300, y: 150 } },
  { id: '4', type: 'account', data: { label: 'raghu-k', platform: 'salesforce' }, position: { x: 500, y: 150 } },
  { id: '5', type: 'account', data: { label: 'raghu.krishnan', platform: 'aws_iam' }, position: { x: 700, y: 150 } },
  { id: '6', type: 'group', data: { label: 'Privileged Users', platform: 'okta' }, position: { x: 50, y: 300 } },
  { id: '7', type: 'group', data: { label: 'Server-Admins', platform: 'active_directory' }, position: { x: 250, y: 300 } },
  { id: '8', type: 'role', data: { label: 'Org Admin', platform: 'okta' }, position: { x: 150, y: 300 } },
  { id: '9', type: 'role', data: { label: 'Domain Admin', platform: 'active_directory' }, position: { x: 400, y: 300 } },
  { id: '10', type: 'role', data: { label: 'Admin', platform: 'salesforce' }, position: { x: 550, y: 300 } },
  { id: '11', type: 'role', data: { label: 'AdministratorAccess', platform: 'aws_iam' }, position: { x: 720, y: 300 } },
  { id: '12', type: 'permission', data: { label: 'admin:api-tokens', platform: 'okta' }, position: { x: 50, y: 450 } },
  { id: '13', type: 'permission', data: { label: 'admin:domain-controller', platform: 'active_directory' }, position: { x: 300, y: 450 } },
  { id: '14', type: 'permission', data: { label: 'admin:repos:private', platform: 'salesforce' }, position: { x: 530, y: 450 } },
  { id: '15', type: 'permission', data: { label: 'iam:*', platform: 'aws_iam' }, position: { x: 720, y: 450 } },
  { id: '16', type: 'resource', data: { label: 'api-tokens', platform: 'okta' }, position: { x: 50, y: 580 } },
  { id: '17', type: 'resource', data: { label: 'domain-controller', platform: 'active_directory' }, position: { x: 300, y: 580 } },
  { id: '18', type: 'resource', data: { label: 'repos:private', platform: 'salesforce' }, position: { x: 530, y: 580 } },
  { id: '19', type: 'resource', data: { label: 'iam-console', platform: 'aws_iam' }, position: { x: 720, y: 580 } },
];

export const IDENTITY_GRAPH_EDGES = [
  { id: 'e1-2', source: '1', target: '2', label: 'has_account', animated: true },
  { id: 'e1-3', source: '1', target: '3', label: 'has_account', animated: true },
  { id: 'e1-4', source: '1', target: '4', label: 'has_account', animated: true },
  { id: 'e1-5', source: '1', target: '5', label: 'has_account', animated: true },
  { id: 'e2-6', source: '2', target: '6', label: 'member_of' },
  { id: 'e3-7', source: '3', target: '7', label: 'member_of' },
  { id: 'e2-8', source: '2', target: '8', label: 'has_role' },
  { id: 'e3-9', source: '3', target: '9', label: 'has_role' },
  { id: 'e4-10', source: '4', target: '10', label: 'has_role' },
  { id: 'e5-11', source: '5', target: '11', label: 'has_role' },
  { id: 'e8-12', source: '8', target: '12', label: 'grants' },
  { id: 'e9-13', source: '9', target: '13', label: 'grants' },
  { id: 'e10-14', source: '10', target: '14', label: 'grants' },
  { id: 'e11-15', source: '11', target: '15', label: 'grants' },
  { id: 'e12-16', source: '12', target: '16', label: 'accesses' },
  { id: 'e13-17', source: '13', target: '17', label: 'accesses' },
  { id: 'e14-18', source: '14', target: '18', label: 'accesses' },
  { id: 'e15-19', source: '15', target: '19', label: 'accesses' },
];

export const ATTACK_PATH_NODES = [];
export const ATTACK_PATH_EDGES = [];

export const TREND_DATA = Array.from({ length: 30 }, (_, i) => ({
  day: `Jun ${i + 1}`,
  critical: Math.max(0, 4 + Math.floor(Math.sin(i / 3) * 3) + Math.floor(Math.random() * 2)),
  high: Math.max(0, 6 + Math.floor(Math.cos(i / 4) * 4) + Math.floor(Math.random() * 2)),
  medium: Math.max(0, 5 + Math.floor(Math.sin(i / 5) * 3) + Math.floor(Math.random() * 2)),
  resolved: Math.max(0, 2 + Math.floor(i / 4) + Math.floor(Math.random() * 2)),
}));
