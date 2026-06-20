import { createContext, useContext, useState, useCallback } from 'react';
import {
  addIdentity, getIdentities, updateIdentity,
  getRiskEvents, saveRiskEvents,
  getIncidents, saveIncidents,
  getLifecycleEvents, saveLifecycleEvents,
} from '../services/storageService';

const ScenarioContext = createContext(null);

const SCENARIO_CONFIGS = {
  dormant_admin: {
    riskType: 'stale_account', severity: 'critical', score: 72.5,
    name: 'Manoj Tiwari (SIM)', dept: 'IT Operations',
    platforms: ['aws_iam'], title: 'AWS AdministratorAccess - 180 days dormant',
    dormancyDays: 180, isAdmin: true, status: 'Dormant',
  },
  offboarding_failure: {
    riskType: 'offboarding_gap', severity: 'critical', score: 68.3,
    name: 'Divya Krishnan (SIM)', dept: 'Engineering',
    platforms: ['aws_iam', 'okta'], title: 'Terminated but active on AWS + Okta',
    gapDays: 45, isAdmin: false, status: 'Orphaned',
  },
  privilege_escalation: {
    riskType: 'privilege_escalation', severity: 'critical', score: 75.1,
    name: 'Ravi Deshmukh (SIM)', dept: 'DevOps',
    platforms: ['okta'], title: 'Unauthorized Org Admin role assignment',
    isAdmin: true, status: 'Active',
  },
  token_abuse: {
    riskType: 'token_abuse', severity: 'high', score: 63.8,
    name: 'svc-deploy-bot (SIM)', dept: 'IT Operations',
    platforms: ['github'], title: 'PAT token 540 days old, anomalous API usage',
    tokenAgeDays: 540, isAdmin: false, status: 'Active', type: 'Service',
  },
  cross_platform_admin: {
    riskType: 'cross_platform_admin', severity: 'critical', score: 81.2,
    name: 'Nitin Saxena (SIM)', dept: 'Security',
    platforms: ['active_directory', 'aws_iam', 'okta'], title: 'Admin on AD + AWS + Okta without justification',
    isAdmin: true, status: 'Active',
  },
};

export function ScenarioProvider({ children }) {
  const [scenarios, setScenarios] = useState([]);
  const [processing, setProcessing] = useState(false);

  const runScenario = useCallback((scenarioType) => {
    setProcessing(true);
    const cfg = SCENARIO_CONFIGS[scenarioType];
    const ts = Date.now();
    const simId = `SIM-${ts}`;
    const personId = `ID-SIM-${ts}`;

    const identity = {
      person_id: personId,
      display_name: cfg.name,
      email: cfg.name.toLowerCase().replace(/\s+/g, '.') + '@identitysphere.ai',
      department: cfg.dept,
      title: cfg.title,
      type: cfg.type || 'Human',
      status: cfg.status,
      platforms: cfg.platforms,
      risk_score: cfg.score,
      severity: cfg.severity,
      is_admin: cfg.isAdmin || false,
      mfa_complete: false,
      max_dormancy_days: cfg.dormancyDays || 0,
      platform_count: cfg.platforms.length,
      group_count: 1,
      role_count: cfg.platforms.length,
      entitlement_count: cfg.platforms.length * 2,
    };

    addIdentity(identity);

    const template = {
      id: simId,
      personId,
      type: cfg.riskType,
      severity: cfg.severity,
      identity: cfg.name,
      department: cfg.dept,
      platforms: cfg.platforms,
      title: cfg.title,
      score: cfg.score,
      dormancyDays: cfg.dormancyDays,
      gapDays: cfg.gapDays,
      tokenAgeDays: cfg.tokenAgeDays,
      createdAt: new Date().toISOString(),
      status: 'detected',
    };

    setTimeout(() => {
      template.status = 'analyzing';
      setScenarios(prev => [...prev, { ...template }]);

      setTimeout(() => {
        template.status = 'incident_created';
        template.incidentId = `INC-SIM-${ts}`;
        template.blastRadius = {
          resources: Math.floor(Math.random() * 12) + 3,
          platforms: cfg.platforms.length,
          adminRoles: cfg.isAdmin ? Math.floor(Math.random() * 2) + 1 : 0,
        };
        template.copilotExplanation = getCopilotExplanation(scenarioType, template);
        template.remediation = getRemediation(scenarioType, template);

        const riskEvent = {
          id: `RISK-SIM-${ts}`,
          identity: cfg.name,
          identityId: personId,
          department: cfg.dept,
          type: cfg.riskType,
          severity: cfg.severity,
          score: cfg.score,
          platforms: cfg.platforms,
          title: cfg.title,
          factors: {
            privilege_breadth: cfg.isAdmin ? 20.0 : 8.0,
            cross_platform_exposure: cfg.platforms.length * 4.0,
            dormancy: cfg.dormancyDays ? Math.min(cfg.dormancyDays / 10, 15) : 0.5,
            detector_severity: cfg.severity === 'critical' ? 25.0 : 18.75,
            behavioral_anomaly: 8.0,
          },
        };
        const risks = getRiskEvents();
        risks.unshift(riskEvent);
        saveRiskEvents(risks);

        const incident = {
          id: template.incidentId,
          title: `${cfg.riskType.replace(/_/g, ' ')}: ${cfg.name}`,
          severity: cfg.severity,
          status: 'open',
          identity: cfg.name,
          created: new Date().toISOString(),
          type: cfg.riskType,
        };
        const incidents = getIncidents();
        incidents.unshift(incident);
        saveIncidents(incidents);

        setScenarios(prev => prev.map(s => s.id === template.id ? { ...template } : s));
        setProcessing(false);
      }, 1500);
    }, 1000);
  }, []);

  const resolveScenario = useCallback((id) => {
    setScenarios(prev => {
      const scenario = prev.find(s => s.id === id);
      if (scenario?.personId) {
        updateIdentity(scenario.personId, { status: 'Disabled', risk_score: 0, severity: 'low' });

        const lifecycle = getLifecycleEvents();
        lifecycle.unshift({
          id: `JML-REM-${Date.now()}`,
          type: 'leaver',
          identity: scenario.identity,
          department: scenario.department,
          date: new Date().toISOString().split('T')[0],
          status: 'completed',
          platforms: scenario.platforms,
          actions: scenario.platforms.map(p => `Account disabled on ${p.replace('_', ' ')}`).concat(['Remediation approved', 'All sessions revoked']),
          approver: 'Pradeep M',
        });
        saveLifecycleEvents(lifecycle);
      }
      return prev.map(s => s.id === id ? { ...s, status: 'resolved' } : s);
    });
  }, []);

  const clearScenarios = useCallback(() => setScenarios([]), []);

  return (
    <ScenarioContext.Provider value={{ scenarios, processing, runScenario, resolveScenario, clearScenarios }}>
      {children}
    </ScenarioContext.Provider>
  );
}

export const useScenario = () => useContext(ScenarioContext);

function getCopilotExplanation(type, s) {
  const explanations = {
    dormant_admin: `${s.identity} holds AdministratorAccess on AWS IAM but has not logged in for ${s.dormancyDays} days. This dormant admin account represents a significant attack surface - if credentials are compromised, an attacker gains full AWS control with no active monitoring. The behavioral engine flagged this as anomalous (dormancy score: 100/100). Blast radius: ${s.blastRadius?.resources || 8} resources across ${s.blastRadius?.platforms || 1} platform(s).`,
    offboarding_failure: `${s.identity} was terminated ${s.gapDays} days ago but accounts remain active on ${s.platforms.join(', ')}. This violates NIST AC-2 (Account Management) and represents a MITRE T1078 (Valid Accounts) risk. Any post-termination access should be investigated for data exfiltration.`,
    privilege_escalation: `${s.identity} received an Org Admin role on Okta outside the approved change window, without manager approval. This matches MITRE T1098 (Account Manipulation) and suggests either a compromised admin account or insider threat.`,
    token_abuse: `${s.identity} has a GitHub Personal Access Token that is ${s.tokenAgeDays} days old with anomalous API volume (8,500 calls/24h). This matches MITRE T1550 (Use Alternate Authentication Material). Token should be rotated immediately.`,
    cross_platform_admin: `${s.identity} holds admin privileges on ${s.platforms.length} platforms (${s.platforms.join(', ')}) without on-call justification. This creates a toxic combination where compromise of one platform cascades across the enterprise. Violates NIST AC-6 (Least Privilege).`,
  };
  return explanations[type] || 'Risk detected. See details for evidence.';
}

function getRemediation(type, s) {
  const steps = {
    dormant_admin: ['Disable AWS IAM login profile immediately', 'Delete access keys', 'Remove from AdministratorAccess policy', 'Enable CloudTrail alert for this identity'],
    offboarding_failure: [`Disable account on ${s.platforms.join(', ')}`, 'Revoke all active sessions and tokens', 'Audit access logs since termination date', 'Update offboarding automation to prevent recurrence'],
    privilege_escalation: ['Revoke Org Admin role on Okta immediately', 'Investigate who granted the role (check audit logs)', 'Review all changes made with elevated privileges', 'Lock account pending investigation'],
    token_abuse: ['Revoke the stale GitHub PAT immediately', 'Create new token with 90-day expiry', 'Review API logs for unauthorized operations', 'Enforce token rotation policy'],
    cross_platform_admin: ['Implement JIT (Just-In-Time) admin access', 'Remove standing admin on at least 2 platforms', 'Enable break-glass procedure for emergencies', 'Add compensating controls (session recording)'],
  };
  return steps[type] || ['Investigate and remediate per organizational policy'];
}
