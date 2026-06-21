import { getPlatformCache } from './dataService';

const KEYS = {
  IDENTITIES: 'is_identities',
  RISK_EVENTS: 'is_risk_events',
  BLAST_RADII: 'is_blast_radii',
  INCIDENTS: 'is_incidents',
  LIFECYCLE: 'is_lifecycle',
  ACCESS_REVIEWS: 'is_access_reviews',
  ACCESS_REQUESTS: 'is_access_requests',
  REVIEW_HISTORY: 'is_review_history',
  SEEDED: 'is_seeded_v3',
};

function read(key) {
  try { const d = localStorage.getItem(key); return d ? JSON.parse(d) : null; } catch { return null; }
}
function write(key, data) {
  localStorage.setItem(key, JSON.stringify(data));
}

// ─── Seed Data (Indianized) ─────────────────────────────────────────────────

const SEED_IDENTITIES = [
  { person_id: 'ID-0001', display_name: 'Raghu Krishnan', email: 'raghu.krishnan@identitysphere.ai', department: 'Engineering', title: 'Lead Engineer', type: 'Human', status: 'Active', platforms: ['active_directory', 'aws_iam', 'okta', 'salesforce'], risk_score: 72.5, severity: 'critical', is_admin: true, mfa_complete: false, max_dormancy_days: 5, platform_count: 4, group_count: 6, role_count: 4, entitlement_count: 18 },
  { person_id: 'ID-0002', display_name: 'Rahul Sharma', email: 'rahul.sharma@identitysphere.ai', department: 'Engineering', title: 'Sr Software Engineer', type: 'Human', status: 'Active', platforms: ['active_directory', 'okta', 'salesforce'], risk_score: 38.2, severity: 'medium', is_admin: false, mfa_complete: true, max_dormancy_days: 3, platform_count: 3, group_count: 4, role_count: 3, entitlement_count: 9 },
  { person_id: 'ID-0003', display_name: 'Arjun Reddy', email: 'arjun.reddy@identitysphere.ai', department: 'Engineering', title: 'DevOps Engineer', type: 'Human', status: 'Active', platforms: ['active_directory', 'aws_iam', 'okta', 'salesforce'], risk_score: 61.8, severity: 'high', is_admin: true, mfa_complete: true, max_dormancy_days: 2, platform_count: 4, group_count: 5, role_count: 4, entitlement_count: 22 },
  { person_id: 'ID-0004', display_name: 'Ananya Rao', email: 'ananya.rao@identitysphere.ai', department: 'Finance', title: 'Finance Manager', type: 'Human', status: 'Active', platforms: ['active_directory', 'okta', 'salesforce'], risk_score: 55.3, severity: 'high', is_admin: true, mfa_complete: false, max_dormancy_days: 12, platform_count: 3, group_count: 4, role_count: 3, entitlement_count: 14 },
  { person_id: 'ID-0005', display_name: 'Priya Nair', email: 'priya.nair@identitysphere.ai', department: 'Finance', title: 'Accounts Lead', type: 'Human', status: 'Active', platforms: ['active_directory', 'okta', 'salesforce'], risk_score: 29.1, severity: 'low', is_admin: false, mfa_complete: true, max_dormancy_days: 8, platform_count: 3, group_count: 3, role_count: 2, entitlement_count: 7 },
  { person_id: 'ID-0006', display_name: 'Rohit Singh', email: 'rohit.singh@identitysphere.ai', department: 'Sales', title: 'Sales Director', type: 'Human', status: 'Active', platforms: ['active_directory', 'okta', 'salesforce'], risk_score: 52.7, severity: 'high', is_admin: true, mfa_complete: true, max_dormancy_days: 4, platform_count: 3, group_count: 4, role_count: 3, entitlement_count: 16 },
  { person_id: 'ID-0007', display_name: 'Vikram Patel', email: 'vikram.patel@identitysphere.ai', department: 'Sales', title: 'Account Executive', type: 'Human', status: 'Dormant', platforms: ['active_directory', 'okta', 'salesforce'], risk_score: 49.5, severity: 'high', is_admin: false, mfa_complete: false, max_dormancy_days: 210, platform_count: 3, group_count: 3, role_count: 2, entitlement_count: 8 },
  { person_id: 'ID-0008', display_name: 'Abhishek Gupta', email: 'abhishek.gupta@identitysphere.ai', department: 'Security', title: 'Security Architect', type: 'Human', status: 'Active', platforms: ['active_directory', 'aws_iam', 'okta'], risk_score: 64.9, severity: 'critical', is_admin: true, mfa_complete: true, max_dormancy_days: 1, platform_count: 3, group_count: 5, role_count: 4, entitlement_count: 20 },
  { person_id: 'ID-0009', display_name: 'Sneha Kulkarni', email: 'sneha.kulkarni@identitysphere.ai', department: 'Finance', title: 'Financial Analyst', type: 'Human', status: 'Offboarded', platforms: ['active_directory', 'okta', 'salesforce'], risk_score: 51.4, severity: 'high', is_admin: false, mfa_complete: false, max_dormancy_days: 95, platform_count: 3, group_count: 3, role_count: 2, entitlement_count: 6 },
  { person_id: 'ID-0010', display_name: 'Sandeep Kumar', email: 'sandeep.kumar@identitysphere.ai', department: 'DevOps', title: 'SRE Lead', type: 'Human', status: 'Active', platforms: ['active_directory', 'aws_iam', 'okta', 'salesforce'], risk_score: 58.4, severity: 'high', is_admin: true, mfa_complete: true, max_dormancy_days: 3, platform_count: 4, group_count: 5, role_count: 4, entitlement_count: 19 },
  { person_id: 'ID-0011', display_name: 'Pooja Sharma', email: 'pooja.sharma@identitysphere.ai', department: 'HR', title: 'HR Business Partner', type: 'Human', status: 'Active', platforms: ['active_directory', 'okta'], risk_score: 22.5, severity: 'low', is_admin: false, mfa_complete: true, max_dormancy_days: 6, platform_count: 2, group_count: 3, role_count: 2, entitlement_count: 5 },
  { person_id: 'ID-0012', display_name: 'Karthik Nair', email: 'karthik.nair@identitysphere.ai', department: 'Engineering', title: 'Backend Developer', type: 'Human', status: 'Active', platforms: ['active_directory', 'okta', 'salesforce'], risk_score: 35.1, severity: 'medium', is_admin: false, mfa_complete: true, max_dormancy_days: 4, platform_count: 3, group_count: 3, role_count: 3, entitlement_count: 8 },
  { person_id: 'ID-0013', display_name: 'Aditya Menon', email: 'aditya.menon@identitysphere.ai', department: 'Security', title: 'SOC Analyst', type: 'Human', status: 'Active', platforms: ['active_directory', 'aws_iam', 'okta'], risk_score: 41.0, severity: 'medium', is_admin: false, mfa_complete: true, max_dormancy_days: 2, platform_count: 3, group_count: 4, role_count: 3, entitlement_count: 11 },
  { person_id: 'ID-0014', display_name: 'Kavya R', email: 'kavya.r@identitysphere.ai', department: 'HR', title: 'HR Manager', type: 'Human', status: 'Active', platforms: ['active_directory', 'okta', 'salesforce'], risk_score: 26.3, severity: 'low', is_admin: false, mfa_complete: true, max_dormancy_days: 7, platform_count: 3, group_count: 3, role_count: 2, entitlement_count: 6 },
  { person_id: 'ID-0015', display_name: 'Naveen Gowda', email: 'naveen.gowda@identitysphere.ai', department: 'DevOps', title: 'Cloud Engineer', type: 'Human', status: 'Active', platforms: ['active_directory', 'aws_iam', 'okta'], risk_score: 47.2, severity: 'medium', is_admin: false, mfa_complete: true, max_dormancy_days: 5, platform_count: 3, group_count: 4, role_count: 3, entitlement_count: 12 },
  { person_id: 'ID-0016', display_name: 'Suraj Patil', email: 'suraj.patil@identitysphere.ai', department: 'Security', title: 'Penetration Tester', type: 'Human', status: 'Active', platforms: ['active_directory', 'aws_iam', 'okta', 'salesforce'], risk_score: 53.8, severity: 'high', is_admin: false, mfa_complete: true, max_dormancy_days: 3, platform_count: 4, group_count: 4, role_count: 3, entitlement_count: 13 },
  { person_id: 'ID-0017', display_name: 'Rakesh Jain', email: 'rakesh.jain@identitysphere.ai', department: 'Sales', title: 'Regional Manager', type: 'Human', status: 'Active', platforms: ['active_directory', 'okta', 'salesforce'], risk_score: 33.6, severity: 'medium', is_admin: false, mfa_complete: true, max_dormancy_days: 10, platform_count: 3, group_count: 3, role_count: 2, entitlement_count: 7 },
  { person_id: 'ID-0018', display_name: 'Neha Agarwal', email: 'neha.agarwal@identitysphere.ai', department: 'HR', title: 'Talent Acquisition Lead', type: 'Human', status: 'Active', platforms: ['active_directory', 'okta'], risk_score: 19.8, severity: 'low', is_admin: false, mfa_complete: true, max_dormancy_days: 4, platform_count: 2, group_count: 2, role_count: 2, entitlement_count: 4 },
  { person_id: 'ID-0019', display_name: 'Harish Shetty', email: 'harish.shetty@identitysphere.ai', department: 'DevOps', title: 'Infrastructure Engineer', type: 'Human', status: 'Active', platforms: ['active_directory', 'aws_iam', 'okta'], risk_score: 44.7, severity: 'medium', is_admin: false, mfa_complete: false, max_dormancy_days: 6, platform_count: 3, group_count: 3, role_count: 3, entitlement_count: 10 },
  { person_id: 'ID-0020', display_name: 'Akash Verma', email: 'akash.verma@identitysphere.ai', department: 'Engineering', title: 'Full Stack Developer', type: 'Human', status: 'Active', platforms: ['active_directory', 'okta', 'salesforce'], risk_score: 31.2, severity: 'medium', is_admin: false, mfa_complete: true, max_dormancy_days: 3, platform_count: 3, group_count: 3, role_count: 3, entitlement_count: 8 },
  { person_id: 'ID-0021', display_name: 'svc-cicd-pipeline', email: 'svc-cicd@identitysphere.ai', department: 'Engineering', title: 'CI/CD Service Account', type: 'Service', status: 'Active', platforms: ['aws_iam', 'salesforce'], risk_score: 56.2, severity: 'high', is_admin: false, mfa_complete: false, max_dormancy_days: 0, platform_count: 2, group_count: 1, role_count: 2, entitlement_count: 8 },
  { person_id: 'ID-0022', display_name: 'svc-monitoring', email: 'svc-monitoring@identitysphere.ai', department: 'DevOps', title: 'Monitoring Service Account', type: 'Service', status: 'Active', platforms: ['aws_iam', 'okta'], risk_score: 42.1, severity: 'medium', is_admin: false, mfa_complete: false, max_dormancy_days: 0, platform_count: 2, group_count: 1, role_count: 2, entitlement_count: 6 },
  { person_id: 'ID-0023', display_name: 'Meera Iyer', email: 'meera.iyer@identitysphere.ai', department: 'Engineering', title: 'QA Lead', type: 'Human', status: 'Orphaned', platforms: ['active_directory', 'salesforce'], risk_score: 48.2, severity: 'high', is_admin: false, mfa_complete: false, max_dormancy_days: 180, platform_count: 2, group_count: 2, role_count: 2, entitlement_count: 5 },
  { person_id: 'ID-0024', display_name: 'Deepak Hegde', email: 'deepak.hegde@identitysphere.ai', department: 'Finance', title: 'VP Finance', type: 'Human', status: 'Active', platforms: ['active_directory', 'okta', 'salesforce', 'aws_iam'], risk_score: 68.3, severity: 'critical', is_admin: true, mfa_complete: false, max_dormancy_days: 15, platform_count: 4, group_count: 5, role_count: 4, entitlement_count: 21 },
  { person_id: 'ID-0025', display_name: 'Pradeep M', email: 'pradeep.m@identitysphere.ai', department: 'Security', title: 'CISO', type: 'Human', status: 'Active', platforms: ['active_directory', 'aws_iam', 'okta', 'salesforce'], risk_score: 75.1, severity: 'critical', is_admin: true, mfa_complete: true, max_dormancy_days: 1, platform_count: 4, group_count: 6, role_count: 5, entitlement_count: 25 },
];

const SEED_RISK_EVENTS = [
  { id: 'RISK-001', identity: 'Raghu Krishnan', identityId: 'ID-0001', department: 'Engineering', type: 'cross_platform_admin', severity: 'critical', score: 72.5, platforms: ['active_directory', 'aws_iam', 'okta', 'salesforce'], title: 'Cross-platform admin on 4 platforms', factors: { privilege_breadth: 22.5, cross_platform_exposure: 16.0, dormancy: 0.5, detector_severity: 18.75, behavioral_anomaly: 14.75 } },
  { id: 'RISK-002', identity: 'Ananya Rao', identityId: 'ID-0004', department: 'Finance', type: 'mfa_disabled', severity: 'high', score: 55.3, platforms: ['active_directory', 'okta', 'salesforce'], title: 'MFA not enabled on Salesforce', factors: { privilege_breadth: 18.0, cross_platform_exposure: 12.0, dormancy: 1.3, detector_severity: 18.75, behavioral_anomaly: 5.25 } },
  { id: 'RISK-003', identity: 'Arjun Reddy', identityId: 'ID-0003', department: 'Engineering', type: 'privilege_escalation', severity: 'high', score: 61.8, platforms: ['active_directory', 'aws_iam', 'okta', 'salesforce'], title: 'Privilege escalation on AWS IAM', factors: { privilege_breadth: 21.0, cross_platform_exposure: 16.0, dormancy: 0.2, detector_severity: 18.75, behavioral_anomaly: 5.85 } },
  { id: 'RISK-004', identity: 'Rohit Singh', identityId: 'ID-0006', department: 'Sales', type: 'sod_violation', severity: 'high', score: 52.7, platforms: ['active_directory', 'okta', 'salesforce'], title: 'SoD violation: CRM Admin + Domain User', factors: { privilege_breadth: 14.2, cross_platform_exposure: 12.0, dormancy: 0.4, detector_severity: 18.75, behavioral_anomaly: 7.35 } },
  { id: 'RISK-005', identity: 'Sneha Kulkarni', identityId: 'ID-0009', department: 'Finance', type: 'offboarding_gap', severity: 'high', score: 51.4, platforms: ['active_directory', 'okta', 'salesforce'], title: 'Offboarding gap - 3 platforms not disabled', factors: { privilege_breadth: 8.5, cross_platform_exposure: 8.0, dormancy: 9.5, detector_severity: 25.0, behavioral_anomaly: 0.4 } },
  { id: 'RISK-006', identity: 'Abhishek Gupta', identityId: 'ID-0008', department: 'Security', type: 'cross_platform_admin', severity: 'critical', score: 64.9, platforms: ['active_directory', 'aws_iam', 'okta'], title: 'Cross-platform admin: AD + AWS + Okta', factors: { privilege_breadth: 20.8, cross_platform_exposure: 12.0, dormancy: 0.1, detector_severity: 25.0, behavioral_anomaly: 7.0 } },
  { id: 'RISK-007', identity: 'Vikram Patel', identityId: 'ID-0007', department: 'Sales', type: 'stale_account', severity: 'high', score: 49.5, platforms: ['active_directory', 'okta', 'salesforce'], title: 'Stale account - 210 days inactive', factors: { privilege_breadth: 4.5, cross_platform_exposure: 4.0, dormancy: 14.0, detector_severity: 25.0, behavioral_anomaly: 2.0 } },
  { id: 'RISK-008', identity: 'Sandeep Kumar', identityId: 'ID-0010', department: 'DevOps', type: 'token_abuse', severity: 'high', score: 58.4, platforms: ['active_directory', 'aws_iam', 'okta', 'salesforce'], title: 'Stale token - 540 days old on Salesforce', factors: { privilege_breadth: 15.3, cross_platform_exposure: 12.0, dormancy: 0.3, detector_severity: 25.0, behavioral_anomaly: 5.8 } },
  { id: 'RISK-009', identity: 'Meera Iyer', identityId: 'ID-0023', department: 'Engineering', type: 'orphaned_account', severity: 'high', score: 48.2, platforms: ['active_directory', 'salesforce'], title: 'Orphaned: terminated but active on 2 platforms', factors: { privilege_breadth: 5.5, cross_platform_exposure: 8.0, dormancy: 3.2, detector_severity: 25.0, behavioral_anomaly: 6.5 } },
  { id: 'RISK-010', identity: 'Deepak Hegde', identityId: 'ID-0024', department: 'Finance', type: 'cross_platform_admin', severity: 'critical', score: 68.3, platforms: ['active_directory', 'okta', 'salesforce', 'aws_iam'], title: 'Cross-platform admin on 4 platforms with MFA gap', factors: { privilege_breadth: 23.0, cross_platform_exposure: 16.0, dormancy: 1.5, detector_severity: 18.75, behavioral_anomaly: 9.05 } },
  { id: 'RISK-011', identity: 'Pradeep M', identityId: 'ID-0025', department: 'Security', type: 'cross_platform_admin', severity: 'critical', score: 75.1, platforms: ['active_directory', 'aws_iam', 'okta', 'salesforce'], title: 'CISO: cross-platform admin on all 4 platforms', factors: { privilege_breadth: 25.0, cross_platform_exposure: 16.0, dormancy: 0.1, detector_severity: 25.0, behavioral_anomaly: 9.0 } },
  { id: 'RISK-012', identity: 'Harish Shetty', identityId: 'ID-0019', department: 'DevOps', type: 'mfa_disabled', severity: 'medium', score: 44.7, platforms: ['active_directory', 'aws_iam', 'okta'], title: 'MFA not enabled on AWS IAM', factors: { privilege_breadth: 10.5, cross_platform_exposure: 8.0, dormancy: 0.6, detector_severity: 18.75, behavioral_anomaly: 6.85 } },
];

const SEED_BLAST_RADII = [
  { identity: 'Pradeep M', id: 'ID-0025', severity: 'critical', resources: 18, permissions: 25, adminRoles: 3, platforms: ['active_directory', 'aws_iam', 'okta', 'salesforce'], byPlatform: { active_directory: 5, aws_iam: 5, okta: 4, salesforce: 4 } },
  { identity: 'Deepak Hegde', id: 'ID-0024', severity: 'critical', resources: 15, permissions: 21, adminRoles: 2, platforms: ['active_directory', 'okta', 'salesforce', 'aws_iam'], byPlatform: { active_directory: 4, okta: 4, salesforce: 3, aws_iam: 4 } },
  { identity: 'Abhishek Gupta', id: 'ID-0008', severity: 'high', resources: 12, permissions: 20, adminRoles: 2, platforms: ['active_directory', 'aws_iam', 'okta'], byPlatform: { active_directory: 4, aws_iam: 4, okta: 4 } },
  { identity: 'Rohit Singh', id: 'ID-0006', severity: 'high', resources: 9, permissions: 16, adminRoles: 1, platforms: ['active_directory', 'okta', 'salesforce'], byPlatform: { active_directory: 3, okta: 3, salesforce: 3 } },
];

const SEED_INCIDENTS = [
  { id: 'INC-001', title: 'Cross-platform admin: Raghu Krishnan', severity: 'critical', status: 'open', identity: 'Raghu Krishnan', created: '2026-06-19T14:30:00', type: 'cross_platform_admin' },
  { id: 'INC-002', title: 'Orphaned account: Meera Iyer', severity: 'high', status: 'open', identity: 'Meera Iyer', created: '2026-06-19T13:15:00', type: 'orphaned_account' },
  { id: 'INC-003', title: 'SoD violation: Rohit Singh', severity: 'high', status: 'review', identity: 'Rohit Singh', created: '2026-06-19T11:00:00', type: 'sod_violation' },
  { id: 'INC-004', title: 'Token abuse: Sandeep Kumar', severity: 'high', status: 'review', identity: 'Sandeep Kumar', created: '2026-06-18T16:45:00', type: 'token_abuse' },
  { id: 'INC-005', title: 'Offboarding gap: Sneha Kulkarni', severity: 'high', status: 'approved', identity: 'Sneha Kulkarni', created: '2026-06-18T09:30:00', type: 'offboarding_gap' },
  { id: 'INC-006', title: 'Privilege escalation: Arjun Reddy', severity: 'high', status: 'resolved', identity: 'Arjun Reddy', created: '2026-06-17T14:00:00', type: 'privilege_escalation' },
];

const SEED_LIFECYCLE = [
  { id: 'JML-001', type: 'joiner', identity: 'Karthik Nair', department: 'Engineering', date: '2026-06-19', status: 'completed', platforms: ['active_directory', 'okta', 'salesforce'], actions: ['AD account created', 'Okta SSO configured', 'Salesforce access granted'], approver: 'Pradeep M' },
  { id: 'JML-002', type: 'mover', identity: 'Rakesh Jain', department: 'Sales', newDepartment: 'Marketing', date: '2026-06-18', status: 'completed', platforms: ['active_directory', 'okta', 'salesforce'], actions: ['AD group updated Sales→Marketing', 'Okta apps reassigned', 'SF role changed'], approver: 'Pradeep M' },
  { id: 'JML-003', type: 'leaver', identity: 'Sneha Kulkarni', department: 'Finance', date: '2026-06-17', status: 'completed', platforms: ['active_directory', 'okta', 'salesforce'], actions: ['AD account disabled', 'Okta sessions revoked', 'SF account deactivated'], approver: 'Pradeep M' },
  { id: 'JML-004', type: 'leaver', identity: 'Meera Iyer', department: 'Engineering', date: '2026-06-16', status: 'pending_review', platforms: ['active_directory', 'salesforce'], actions: ['Pending: AD disable', 'Pending: Salesforce remove'], approver: null },
  { id: 'JML-005', type: 'joiner', identity: 'Suraj Patil', department: 'Security', date: '2026-06-20', status: 'in_progress', platforms: ['active_directory', 'aws_iam', 'okta', 'salesforce'], actions: ['AD account created', 'AWS IAM provisioning...', 'Okta SSO pending', 'Salesforce pending'], approver: 'Pradeep M' },
];

const SEED_ACCESS_REVIEWS = [
  {
    id: 'CAM-001', name: 'Q2 2026 Privileged Access Review', status: 'active',
    created: '2026-06-01', deadline: '2026-06-30', reviewer: 'Pradeep M', totalItems: 24, completedItems: 16,
    items: [
      { id: 'REV-001', identity: 'Raghu Krishnan', personId: 'ID-0001', department: 'Engineering', platform: 'active_directory', role: 'Domain Admin', riskScore: 72.5, severity: 'critical', status: 'pending' },
      { id: 'REV-002', identity: 'Raghu Krishnan', personId: 'ID-0001', department: 'Engineering', platform: 'aws_iam', role: 'AdministratorAccess', riskScore: 72.5, severity: 'critical', status: 'pending' },
      { id: 'REV-003', identity: 'Deepak Hegde', personId: 'ID-0024', department: 'Finance', platform: 'aws_iam', role: 'AdministratorAccess', riskScore: 68.3, severity: 'critical', status: 'pending' },
      { id: 'REV-004', identity: 'Abhishek Gupta', personId: 'ID-0008', department: 'Security', platform: 'active_directory', role: 'Domain Admin', riskScore: 64.9, severity: 'critical', status: 'pending' },
      { id: 'REV-005', identity: 'Arjun Reddy', personId: 'ID-0003', department: 'Engineering', platform: 'aws_iam', role: 'PowerUserAccess', riskScore: 61.8, severity: 'high', status: 'pending' },
      { id: 'REV-006', identity: 'Sandeep Kumar', personId: 'ID-0010', department: 'DevOps', platform: 'salesforce', role: 'Owner', riskScore: 58.4, severity: 'high', status: 'pending' },
      { id: 'REV-007', identity: 'Ananya Rao', personId: 'ID-0004', department: 'Finance', platform: 'salesforce', role: 'System Administrator', riskScore: 55.3, severity: 'high', status: 'pending' },
      { id: 'REV-008', identity: 'Rohit Singh', personId: 'ID-0006', department: 'Sales', platform: 'salesforce', role: 'System Administrator', riskScore: 52.7, severity: 'high', status: 'pending' },
    ],
  },
  { id: 'CAM-002', name: 'Service Account Certification', status: 'completed', created: '2026-05-01', deadline: '2026-05-31', reviewer: 'Pradeep M', totalItems: 12, completedItems: 12, items: [] },
];

// ─── Public API ──────────────────────────────────────────────────────────────

export function seedIfNeeded() {
  if (read(KEYS.SEEDED)) return;
  write(KEYS.IDENTITIES, SEED_IDENTITIES);
  write(KEYS.RISK_EVENTS, SEED_RISK_EVENTS);
  write(KEYS.BLAST_RADII, SEED_BLAST_RADII);
  write(KEYS.INCIDENTS, SEED_INCIDENTS);
  write(KEYS.LIFECYCLE, SEED_LIFECYCLE);
  write(KEYS.ACCESS_REVIEWS, SEED_ACCESS_REVIEWS);
  write(KEYS.ACCESS_REQUESTS, []);
  write(KEYS.REVIEW_HISTORY, []);
  write(KEYS.SEEDED, true);
}

// Identities — prefer live pipeline data when PlatformDataProvider has loaded
export function getIdentities() {
  const live = getPlatformCache()?.identities;
  if (live?.length) return live;
  return read(KEYS.IDENTITIES) || SEED_IDENTITIES;
}
export function saveIdentities(data) { write(KEYS.IDENTITIES, data); }
export function addIdentity(identity) {
  const list = getIdentities();
  list.push(identity);
  saveIdentities(list);
  return list;
}
export function updateIdentity(personId, updates) {
  const list = getIdentities().map(i => i.person_id === personId ? { ...i, ...updates } : i);
  saveIdentities(list);
  return list;
}

// Risk Events
export function getRiskEvents() {
  const live = getPlatformCache()?.risk_events;
  if (live?.length) return live;
  return read(KEYS.RISK_EVENTS) || SEED_RISK_EVENTS;
}
export function saveRiskEvents(data) { write(KEYS.RISK_EVENTS, data); }

// Blast Radii
export function getBlastRadii() {
  const live = getPlatformCache()?.blast_radii;
  if (live?.length) return live;
  return read(KEYS.BLAST_RADII) || SEED_BLAST_RADII;
}
export function saveBlastRadii(data) { write(KEYS.BLAST_RADII, data); }

// Incidents — merge pipeline clusters with local workflow overrides
export function getIncidents() {
  const live = getPlatformCache()?.incidents;
  if (live?.length) {
    const overrides = read(KEYS.INCIDENTS) || [];
    const overrideMap = Object.fromEntries(overrides.map((i) => [i.id, i.status]));
    return live.map((inc) =>
      overrideMap[inc.id] ? { ...inc, status: overrideMap[inc.id] } : inc
    );
  }
  return read(KEYS.INCIDENTS) || SEED_INCIDENTS;
}
export function saveIncidents(data) { write(KEYS.INCIDENTS, data); }

// Lifecycle
export function getLifecycleEvents() { return read(KEYS.LIFECYCLE) || []; }
export function saveLifecycleEvents(data) { write(KEYS.LIFECYCLE, data); }

// Access Reviews
export function getAccessReviews() { return read(KEYS.ACCESS_REVIEWS) || []; }
export function saveAccessReviews(data) { write(KEYS.ACCESS_REVIEWS, data); }

// Access Requests (Employee)
export function getAccessRequests() { return read(KEYS.ACCESS_REQUESTS) || []; }
export function saveAccessRequests(data) { write(KEYS.ACCESS_REQUESTS, data); }

// Review History
export function getReviewHistory() { return read(KEYS.REVIEW_HISTORY) || []; }
export function saveReviewHistory(data) { write(KEYS.REVIEW_HISTORY, data); }

// Reset
export function resetAll() {
  Object.values(KEYS).forEach(k => localStorage.removeItem(k));
  seedIfNeeded();
}
