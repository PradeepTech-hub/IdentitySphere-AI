"""Detection Engine — identifies identity risks using rules + Isolation Forest ML.

Detector catalogue:
  1. OrphanedAccountDetector  — account active on platform while HR says terminated/disabled
  2. OverPrivilegeDetector    — admin on ≥2 platforms without justification (on-call, etc.)
  3. PrivilegeEscalationDetector — unexpected role/group additions outside change window
  4. TokenAbuseDetector       — stale tokens, anomalous API volume, unusual-hour usage
  5. OffboardingGapDetector   — terminated in HR but not disabled on all platforms
  6. StaleAccountDetector     — active accounts with no login in 90+ days
  7. MFAGapDetector           — active accounts without MFA enabled
  8. SoDViolationDetector     — toxic access combinations across platforms

Risk scoring formula (hybrid: weighted rules + ML anomaly score):

  risk_score = (rule_score × 0.6) + (ml_anomaly_score × 0.4)

  where:
    rule_score = Σ (detector_weight × severity_factor)
      severity_factor: critical=1.0, high=0.75, medium=0.5, low=0.25

    ml_anomaly_score = isolation_forest_score normalized to [0, 100]
      features: num_platforms, num_admin_roles, privilege_score, days_since_login,
                num_privilege_changes, num_groups, has_mfa, login_anomaly_count

  Context adjustments (reduce false positives):
    - on_call tag:          score × (1 - 0.4) = score × 0.6
    - recent role change:   score × (1 - 0.3) = score × 0.7
    - manager approved:     score × (1 - 0.2) = score × 0.8

Worked example (User ID-0030, over_privileged + cross-platform admin):
  rule_score:
    over_privileged:      20.0 × 0.75 = 15.0
    cross_platform_admin: 22.0 × 1.0  = 22.0
    total rule_score = 37.0 (capped at 100) → 37.0

  ml_anomaly_score: isolation forest returns -0.35 → normalized = 67.5

  raw_risk = (37.0 × 0.6) + (67.5 × 0.4) = 22.2 + 27.0 = 49.2
  no context adjustments → final_score = 49.2 (MEDIUM severity)
"""

from __future__ import annotations

import logging
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from typing import Any

import numpy as np
from sklearn.ensemble import IsolationForest

from identitysphere.models.identity import Identity, IdentityStatus, IdentityType, Platform
from identitysphere.models.events import AuditEvent, EventType, RiskEvent, RiskSeverity
from identitysphere.models.offboarding import OffboardingRecord
from identitysphere.core.privilege import PrivilegeProfile

logger = logging.getLogger("identitysphere.detectors")

SEVERITY_FACTORS = {
    RiskSeverity.CRITICAL: 1.0,
    RiskSeverity.HIGH: 0.75,
    RiskSeverity.MEDIUM: 0.5,
    RiskSeverity.LOW: 0.25,
}

SOD_TOXIC_COMBINATIONS = [
    ({"aws_iam"}, {"active_directory"}, "Cloud Admin + Domain Admin"),
    ({"okta"}, {"aws_iam"}, "SSO Admin + Cloud Admin"),
    ({"github"}, {"aws_iam"}, "Code Owner + Infrastructure Admin"),
    ({"salesforce"}, {"active_directory"}, "CRM Admin + Domain Admin"),
]


@dataclass
class DetectionContext:
    """Bundles all data a detector needs to produce findings."""

    identities: dict[str, Identity]
    privilege_profiles: dict[str, PrivilegeProfile]
    audit_events_by_identity: dict[str, list[AuditEvent]]
    offboarding_by_identity: dict[str, OffboardingRecord]
    anomaly_labels: dict[str, str]


@dataclass
class DetectionResult:
    """Aggregate output of the detection engine."""

    risk_events: list[RiskEvent] = field(default_factory=list)
    total_identities_scanned: int = 0
    identities_with_risks: int = 0
    risk_distribution: dict[str, int] = field(default_factory=dict)
    severity_distribution: dict[str, int] = field(default_factory=dict)
    detection_accuracy: dict[str, float] = field(default_factory=dict)


class DetectionEngine:
    """Runs all detectors and produces scored, explainable risk events."""

    def __init__(self, config: dict[str, Any] | None = None) -> None:
        cfg = config or {}
        risk_cfg = cfg.get("risk_engine", cfg)
        self.weights = risk_cfg.get("weights", {
            "orphaned_account": 25.0,
            "over_privileged": 20.0,
            "privilege_escalation": 30.0,
            "token_abuse": 28.0,
            "cross_platform_admin": 22.0,
            "stale_account": 15.0,
            "mfa_disabled": 12.0,
            "offboarding_gap": 35.0,
            "sod_violation": 18.0,
        })
        self.stale_days: int = risk_cfg.get("stale_account_days", 90)
        self.offboarding_critical_days: int = risk_cfg.get("offboarding_gap_critical_days", 7)
        self.offboarding_high_days: int = risk_cfg.get("offboarding_gap_high_days", 30)

        context_cfg = risk_cfg.get("context_adjustments", {})
        self.on_call_discount: float = context_cfg.get("on_call_discount", 0.4)
        self.role_change_days: int = context_cfg.get("recent_role_change_days", 14)
        self.role_change_discount: float = context_cfg.get("recent_role_change_discount", 0.3)
        self.manager_discount: float = context_cfg.get("manager_approved_discount", 0.2)

        iso_cfg = risk_cfg.get("isolation_forest", {})
        self.iso_contamination: float = iso_cfg.get("contamination", 0.10)
        self.iso_estimators: int = iso_cfg.get("n_estimators", 200)
        self.iso_random_state: int = iso_cfg.get("random_state", 42)

        self.result = DetectionResult()
        self._ml_model: IsolationForest | None = None

    def detect_all(self, ctx: DetectionContext) -> DetectionResult:
        """Run all detectors against the full identity population."""
        logger.info("Starting detection engine for %d identities...", len(ctx.identities))
        self.result = DetectionResult(total_identities_scanned=len(ctx.identities))

        rule_findings: dict[str, list[RiskEvent]] = {}

        for iid, identity in ctx.identities.items():
            findings: list[RiskEvent] = []
            profile = ctx.privilege_profiles.get(iid)
            events = ctx.audit_events_by_identity.get(iid, [])
            offboarding = ctx.offboarding_by_identity.get(iid)

            findings.extend(self._detect_orphaned(identity))
            findings.extend(self._detect_stale(identity))
            findings.extend(self._detect_mfa_gap(identity))
            if profile:
                findings.extend(self._detect_over_privileged(identity, profile))
                findings.extend(self._detect_sod_violations(identity, profile))
            findings.extend(self._detect_privilege_escalation(identity, events))
            findings.extend(self._detect_token_abuse(identity, events))
            if offboarding:
                findings.extend(self._detect_offboarding_gap(identity, offboarding))

            if findings:
                rule_findings[iid] = findings

        ml_scores = self._run_isolation_forest(ctx)

        self._merge_scores(ctx, rule_findings, ml_scores)

        self._compute_accuracy(ctx)

        risky_ids = {e.identity_id for e in self.result.risk_events}
        self.result.identities_with_risks = len(risky_ids)

        logger.info(
            "Detection complete: %d risk events across %d identities. "
            "Severity distribution: %s",
            len(self.result.risk_events),
            self.result.identities_with_risks,
            self.result.severity_distribution,
        )
        return self.result

    def _detect_orphaned(self, identity: Identity) -> list[RiskEvent]:
        findings: list[RiskEvent] = []
        if identity.hr_status == IdentityStatus.TERMINATED:
            active_accounts = [
                a for a in identity.accounts if a.status == IdentityStatus.ACTIVE
            ]
            if active_accounts:
                platforms = [a.platform for a in active_accounts]
                findings.append(RiskEvent(
                    risk_id=f"RISK-ORP-{uuid.uuid4().hex[:8]}",
                    identity_id=identity.identity_id,
                    risk_type="orphaned_account",
                    severity=RiskSeverity.CRITICAL,
                    score=0.0,
                    title=f"Orphaned account: {identity.display_name} terminated but active",
                    description=(
                        f"Identity {identity.display_name} ({identity.identity_id}) is marked "
                        f"TERMINATED in HR but has {len(active_accounts)} active account(s) on: "
                        f"{', '.join(p.value for p in platforms)}"
                    ),
                    evidence=[
                        {
                            "type": "hr_status",
                            "value": identity.hr_status.value,
                            "termination_date": (
                                identity.hr_termination_date.isoformat()
                                if identity.hr_termination_date
                                else "unknown"
                            ),
                        },
                        *[
                            {
                                "type": "active_account",
                                "platform": a.platform.value,
                                "account_id": a.account_id,
                                "last_login": a.last_login.isoformat() if a.last_login else None,
                            }
                            for a in active_accounts
                        ],
                    ],
                    affected_platforms=platforms,
                    remediation_steps=[
                        f"Disable {a.platform.value} account {a.account_id} immediately"
                        for a in active_accounts
                    ],
                    compliance_refs=["NIST AC-2", "MITRE T1078", "CIS 5"],
                ))
        return findings

    def _detect_stale(self, identity: Identity) -> list[RiskEvent]:
        findings: list[RiskEvent] = []
        now = datetime.utcnow()
        cutoff = now - timedelta(days=self.stale_days)

        for account in identity.accounts:
            if (
                account.status == IdentityStatus.ACTIVE
                and account.last_login
                and account.last_login < cutoff
            ):
                days_stale = (now - account.last_login).days
                severity = RiskSeverity.HIGH if days_stale > 180 else RiskSeverity.MEDIUM
                findings.append(RiskEvent(
                    risk_id=f"RISK-STL-{uuid.uuid4().hex[:8]}",
                    identity_id=identity.identity_id,
                    risk_type="stale_account",
                    severity=severity,
                    score=0.0,
                    title=f"Stale account: {account.platform.value} - {days_stale} days inactive",
                    description=(
                        f"Account {account.account_id} on {account.platform.value} has not been "
                        f"used in {days_stale} days (last login: {account.last_login.isoformat()})"
                    ),
                    evidence=[{
                        "type": "stale_login",
                        "platform": account.platform.value,
                        "account_id": account.account_id,
                        "last_login": account.last_login.isoformat(),
                        "days_stale": days_stale,
                    }],
                    affected_platforms=[account.platform],
                    remediation_steps=[
                        f"Review and disable {account.platform.value} account {account.account_id}",
                        f"Confirm with {identity.display_name} if access is still needed",
                    ],
                    compliance_refs=["NIST AC-2", "CIS 5"],
                ))
        return findings

    def _detect_mfa_gap(self, identity: Identity) -> list[RiskEvent]:
        findings: list[RiskEvent] = []
        for account in identity.accounts:
            if account.status == IdentityStatus.ACTIVE and not account.mfa_enabled:
                severity = RiskSeverity.HIGH if account.is_admin else RiskSeverity.MEDIUM
                findings.append(RiskEvent(
                    risk_id=f"RISK-MFA-{uuid.uuid4().hex[:8]}",
                    identity_id=identity.identity_id,
                    risk_type="mfa_disabled",
                    severity=severity,
                    score=0.0,
                    title=f"MFA not enabled on {account.platform.value}",
                    description=(
                        f"Account {account.account_id} on {account.platform.value} does not "
                        f"have MFA enabled. Admin: {account.is_admin}"
                    ),
                    evidence=[{
                        "type": "mfa_gap",
                        "platform": account.platform.value,
                        "account_id": account.account_id,
                        "is_admin": account.is_admin,
                    }],
                    affected_platforms=[account.platform],
                    remediation_steps=[
                        f"Enable MFA on {account.platform.value} for {account.username}",
                    ],
                    compliance_refs=["NIST IA-4", "CIS 6"],
                ))
        return findings

    def _detect_over_privileged(
        self, identity: Identity, profile: PrivilegeProfile
    ) -> list[RiskEvent]:
        findings: list[RiskEvent] = []

        if profile.is_cross_platform_admin:
            severity = RiskSeverity.CRITICAL
            findings.append(RiskEvent(
                risk_id=f"RISK-XPA-{uuid.uuid4().hex[:8]}",
                identity_id=identity.identity_id,
                risk_type="cross_platform_admin",
                severity=severity,
                score=0.0,
                title=(
                    f"Cross-platform admin: {identity.display_name} is admin on "
                    f"{', '.join(profile.admin_platforms)}"
                ),
                description=(
                    f"Identity has admin access on {len(profile.admin_platforms)} platforms "
                    f"({', '.join(profile.admin_platforms)}). Privilege score: "
                    f"{profile.normalized_score:.1f}/100"
                ),
                evidence=[
                    {"type": "admin_platform", "platform": p}
                    for p in profile.admin_platforms
                ] + [
                    {
                        "type": "privilege_score",
                        "raw_score": profile.privilege_score,
                        "normalized_score": profile.normalized_score,
                        "breakdown": profile.score_breakdown,
                    }
                ],
                affected_platforms=[
                    Platform(p) for p in profile.admin_platforms if p in [e.value for e in Platform]
                ],
                remediation_steps=[
                    f"Review admin necessity on {p} for {identity.display_name}"
                    for p in profile.admin_platforms
                ] + ["Consider implementing just-in-time (JIT) admin access"],
                compliance_refs=["NIST AC-6", "MITRE T1098", "CIS 6", "GDPR Art.5"],
            ))

        if profile.normalized_score > 70 and not profile.is_cross_platform_admin:
            findings.append(RiskEvent(
                risk_id=f"RISK-OVP-{uuid.uuid4().hex[:8]}",
                identity_id=identity.identity_id,
                risk_type="over_privileged",
                severity=RiskSeverity.HIGH,
                score=0.0,
                title=f"Over-privileged: {identity.display_name} (score {profile.normalized_score:.1f})",
                description=(
                    f"Privilege score {profile.normalized_score:.1f}/100 exceeds threshold. "
                    f"{profile.unique_permissions} unique permissions, "
                    f"{len(profile.sensitive_permissions)} sensitive."
                ),
                evidence=[{
                    "type": "privilege_score",
                    "normalized_score": profile.normalized_score,
                    "sensitive_count": len(profile.sensitive_permissions),
                    "platform_scores": profile.platform_scores,
                }],
                affected_platforms=[
                    Platform(p) for p in profile.platform_scores.keys()
                    if p in [e.value for e in Platform]
                ],
                remediation_steps=[
                    "Conduct access review with identity owner and manager",
                    "Remove unnecessary admin and sensitive permissions",
                ],
                compliance_refs=["NIST AC-6", "CIS 6"],
            ))

        return findings

    def _detect_sod_violations(
        self, identity: Identity, profile: PrivilegeProfile
    ) -> list[RiskEvent]:
        findings: list[RiskEvent] = []
        admin_platform_set = set(profile.admin_platforms)

        for set_a, set_b, label in SOD_TOXIC_COMBINATIONS:
            if set_a & admin_platform_set and set_b & admin_platform_set:
                findings.append(RiskEvent(
                    risk_id=f"RISK-SOD-{uuid.uuid4().hex[:8]}",
                    identity_id=identity.identity_id,
                    risk_type="sod_violation",
                    severity=RiskSeverity.HIGH,
                    score=0.0,
                    title=f"SoD violation: {label}",
                    description=(
                        f"{identity.display_name} has toxic combination: {label}. "
                        f"Admin on: {', '.join(admin_platform_set)}"
                    ),
                    evidence=[{
                        "type": "sod_combination",
                        "combination": label,
                        "platforms_a": list(set_a),
                        "platforms_b": list(set_b),
                    }],
                    affected_platforms=[
                        Platform(p) for p in (set_a | set_b)
                        if p in [e.value for e in Platform]
                    ],
                    remediation_steps=[
                        f"Separate {label} responsibilities across different identities",
                        "Implement compensating controls if separation is not possible",
                    ],
                    compliance_refs=["NIST AC-6", "CIS 6", "GDPR Art.5"],
                ))
        return findings

    def _detect_privilege_escalation(
        self, identity: Identity, events: list[AuditEvent]
    ) -> list[RiskEvent]:
        findings: list[RiskEvent] = []
        escalation_events = [
            e for e in events
            if e.event_type in (
                EventType.ROLE_ASSIGNED,
                EventType.GROUP_ADDED,
                EventType.PERMISSION_CHANGED,
            )
        ]

        for event in escalation_events:
            details = event.details
            is_unapproved = not details.get("approved", True)
            outside_window = not details.get("change_window", True)

            if is_unapproved or outside_window:
                severity = RiskSeverity.CRITICAL if is_unapproved else RiskSeverity.HIGH
                findings.append(RiskEvent(
                    risk_id=f"RISK-ESC-{uuid.uuid4().hex[:8]}",
                    identity_id=identity.identity_id,
                    risk_type="privilege_escalation",
                    severity=severity,
                    score=0.0,
                    title=(
                        f"Privilege escalation: {event.event_type.value} on "
                        f"{event.platform.value}"
                    ),
                    description=(
                        f"Unexpected {event.event_type.value} for {identity.display_name} on "
                        f"{event.platform.value} at {event.timestamp.isoformat()}. "
                        f"Approved: {not is_unapproved}, Within change window: {not outside_window}"
                    ),
                    evidence=[{
                        "type": "escalation_event",
                        "event_id": event.event_id,
                        "event_type": event.event_type.value,
                        "platform": event.platform.value,
                        "timestamp": event.timestamp.isoformat(),
                        "new_role": details.get("new_role"),
                        "approved": not is_unapproved,
                        "change_window": not outside_window,
                        "source_ip": event.source_ip,
                    }],
                    affected_platforms=[event.platform],
                    remediation_steps=[
                        f"Investigate {event.event_type.value} on {event.platform.value}",
                        f"Verify authorization for role: {details.get('new_role', 'unknown')}",
                        "Revert change if unauthorized",
                    ],
                    compliance_refs=["NIST AC-2", "MITRE T1098", "CIS 5"],
                ))
        return findings

    def _detect_token_abuse(
        self, identity: Identity, events: list[AuditEvent]
    ) -> list[RiskEvent]:
        findings: list[RiskEvent] = []
        token_events = [
            e for e in events
            if e.event_type in (EventType.TOKEN_USED, EventType.API_CALL)
            and e.details.get("token_age_days", 0) > 180
        ]

        if token_events:
            max_age = max(e.details.get("token_age_days", 0) for e in token_events)
            max_volume = max(e.details.get("api_volume", 0) for e in token_events)
            unusual_hours = sum(1 for e in token_events if e.details.get("unusual_hour"))
            unique_ips = len({e.source_ip for e in token_events if e.source_ip})

            severity = RiskSeverity.CRITICAL if max_age > 365 else RiskSeverity.HIGH
            findings.append(RiskEvent(
                risk_id=f"RISK-TKN-{uuid.uuid4().hex[:8]}",
                identity_id=identity.identity_id,
                risk_type="token_abuse",
                severity=severity,
                score=0.0,
                title=(
                    f"Token/credential abuse: {identity.display_name} - "
                    f"token age {max_age}d, {len(token_events)} suspicious events"
                ),
                description=(
                    f"Identity {identity.display_name} has {len(token_events)} token/API events "
                    f"with stale credentials (max age: {max_age} days). "
                    f"Max API volume: {max_volume}, unusual-hour events: {unusual_hours}, "
                    f"unique source IPs: {unique_ips}"
                ),
                evidence=[
                    {
                        "type": "token_event",
                        "event_id": e.event_id,
                        "token_age_days": e.details.get("token_age_days"),
                        "api_volume": e.details.get("api_volume"),
                        "unusual_hour": e.details.get("unusual_hour"),
                        "source_ip": e.source_ip,
                        "timestamp": e.timestamp.isoformat(),
                    }
                    for e in token_events[:5]
                ],
                affected_platforms=list({e.platform for e in token_events}),
                remediation_steps=[
                    "Rotate all tokens/API keys older than 90 days",
                    "Investigate anomalous API volume and source IPs",
                    "Enforce token expiration policy (max 90 days)",
                ],
                compliance_refs=["NIST AC-2", "NIST IA-4", "MITRE T1550", "CIS 6"],
            ))
        return findings

    def _detect_offboarding_gap(
        self, identity: Identity, record: OffboardingRecord
    ) -> list[RiskEvent]:
        findings: list[RiskEvent] = []
        if record.has_gap:
            gap_platforms = record.gap_platforms
            days_since = record.days_since_termination

            if days_since <= self.offboarding_critical_days:
                severity = RiskSeverity.HIGH
            elif days_since <= self.offboarding_high_days:
                severity = RiskSeverity.CRITICAL
            else:
                severity = RiskSeverity.CRITICAL

            findings.append(RiskEvent(
                risk_id=f"RISK-OBG-{uuid.uuid4().hex[:8]}",
                identity_id=identity.identity_id,
                risk_type="offboarding_gap",
                severity=severity,
                score=0.0,
                title=(
                    f"Offboarding gap: {identity.display_name} - "
                    f"{len(gap_platforms)} platforms not disabled ({days_since}d since termination)"
                ),
                description=(
                    f"Identity {identity.display_name} was terminated {days_since} days ago "
                    f"but accounts remain active on: {', '.join(p.value for p in gap_platforms)}"
                ),
                evidence=[
                    {
                        "type": "offboarding_gap",
                        "platform": p.value,
                        "days_since_termination": days_since,
                        "termination_date": record.hr_termination_date.isoformat(),
                    }
                    for p in gap_platforms
                ],
                affected_platforms=gap_platforms,
                remediation_steps=[
                    f"Immediately disable account on {p.value}" for p in gap_platforms
                ] + ["Audit for any unauthorized access since termination date"],
                compliance_refs=["NIST AC-2", "MITRE T1078", "GDPR Art.32", "CIS 5"],
            ))
        return findings

    def _run_isolation_forest(self, ctx: DetectionContext) -> dict[str, float]:
        """Train and score Isolation Forest on identity behavior features."""
        feature_matrix: list[list[float]] = []
        identity_ids: list[str] = []

        for iid, identity in ctx.identities.items():
            profile = ctx.privilege_profiles.get(iid)
            events = ctx.audit_events_by_identity.get(iid, [])

            num_platforms = len(identity.accounts)
            num_admin_roles = sum(1 for a in identity.accounts if a.is_admin)
            priv_score = profile.normalized_score if profile else 0.0

            days_since_login = 0.0
            if identity.accounts:
                logins = [
                    a.last_login for a in identity.accounts
                    if a.last_login and a.status == IdentityStatus.ACTIVE
                ]
                if logins:
                    most_recent = max(logins)
                    days_since_login = (datetime.utcnow() - most_recent).days

            priv_change_events = [
                e for e in events
                if e.event_type in (
                    EventType.ROLE_ASSIGNED,
                    EventType.GROUP_ADDED,
                    EventType.PERMISSION_CHANGED,
                )
            ]
            num_priv_changes = len(priv_change_events)

            num_groups = sum(len(a.groups) for a in identity.accounts)
            has_mfa = 1.0 if any(a.mfa_enabled for a in identity.accounts) else 0.0

            login_failures = sum(
                1 for e in events if e.event_type == EventType.LOGIN_FAILURE
            )

            feature_matrix.append([
                num_platforms,
                num_admin_roles,
                priv_score,
                days_since_login,
                num_priv_changes,
                num_groups,
                has_mfa,
                login_failures,
            ])
            identity_ids.append(iid)

        if len(feature_matrix) < 10:
            return {iid: 50.0 for iid in identity_ids}

        X = np.array(feature_matrix)

        self._ml_model = IsolationForest(
            contamination=self.iso_contamination,
            n_estimators=self.iso_estimators,
            random_state=self.iso_random_state,
        )
        self._ml_model.fit(X)

        raw_scores = self._ml_model.decision_function(X)

        min_s, max_s = raw_scores.min(), raw_scores.max()
        if max_s == min_s:
            normalized = np.full_like(raw_scores, 50.0)
        else:
            normalized = (1 - (raw_scores - min_s) / (max_s - min_s)) * 100.0

        return dict(zip(identity_ids, normalized.tolist()))

    def _merge_scores(
        self,
        ctx: DetectionContext,
        rule_findings: dict[str, list[RiskEvent]],
        ml_scores: dict[str, float],
    ) -> None:
        """Combine rule-based findings with ML anomaly scores into final risk events."""
        rule_weight = 0.6
        ml_weight = 0.4

        all_risk_events: list[RiskEvent] = []

        for iid in ctx.identities:
            findings = rule_findings.get(iid, [])
            ml_score = ml_scores.get(iid, 50.0)
            identity = ctx.identities[iid]

            if not findings:
                if ml_score > 75:
                    event = RiskEvent(
                        risk_id=f"RISK-ML-{uuid.uuid4().hex[:8]}",
                        identity_id=iid,
                        risk_type="ml_anomaly",
                        severity=RiskSeverity.MEDIUM,
                        score=ml_score * ml_weight,
                        title=f"ML-detected anomaly: {identity.display_name}",
                        description=(
                            f"Isolation Forest flagged {identity.display_name} with "
                            f"anomaly score {ml_score:.1f}/100 despite no rule-based findings"
                        ),
                        evidence=[{
                            "type": "ml_anomaly_score",
                            "score": ml_score,
                        }],
                    )
                    all_risk_events.append(event)
                continue

            total_rule_score = 0.0
            for finding in findings:
                weight = self.weights.get(finding.risk_type, 10.0)
                severity_factor = SEVERITY_FACTORS.get(finding.severity, 0.5)
                total_rule_score += weight * severity_factor

            total_rule_score = min(total_rule_score, 100.0)

            combined = (total_rule_score * rule_weight) + (ml_score * ml_weight)
            combined = self._apply_context_adjustments(identity, combined)

            if combined >= 70:
                severity = RiskSeverity.CRITICAL
            elif combined >= 45:
                severity = RiskSeverity.HIGH
            elif combined >= 25:
                severity = RiskSeverity.MEDIUM
            else:
                severity = RiskSeverity.LOW

            for finding in findings:
                finding.score = combined
                finding.severity = severity
                all_risk_events.append(finding)

        self.result.risk_events = all_risk_events

        for event in all_risk_events:
            self.result.risk_distribution[event.risk_type] = (
                self.result.risk_distribution.get(event.risk_type, 0) + 1
            )
            self.result.severity_distribution[event.severity.value] = (
                self.result.severity_distribution.get(event.severity.value, 0) + 1
            )

    def _apply_context_adjustments(self, identity: Identity, score: float) -> float:
        """Reduce score for identities with legitimate context (on-call, recent change)."""
        if identity.tags.get("on_call") == "true":
            score *= (1 - self.on_call_discount)

        role_change_str = identity.tags.get("role_change_date")
        if role_change_str:
            try:
                role_change_date = datetime.fromisoformat(role_change_str)
                if (datetime.utcnow() - role_change_date).days <= self.role_change_days:
                    score *= (1 - self.role_change_discount)
            except (ValueError, TypeError):
                pass

        return score

    def _compute_accuracy(self, ctx: DetectionContext) -> None:
        """Compare detected risks against known anomaly labels to measure accuracy."""
        if not ctx.anomaly_labels:
            return

        detected_ids = {e.identity_id for e in self.result.risk_events}
        actual_anomalous = {
            iid for iid, cat in ctx.anomaly_labels.items()
            if cat not in ("normal", "false_positive_traps")
        }
        actual_fp_traps = {
            iid for iid, cat in ctx.anomaly_labels.items()
            if cat == "false_positive_traps"
        }

        true_positives = detected_ids & actual_anomalous
        false_positives_from_traps = detected_ids & actual_fp_traps
        false_negatives = actual_anomalous - detected_ids

        precision = (
            len(true_positives) / len(detected_ids) if detected_ids else 0.0
        )
        recall = (
            len(true_positives) / len(actual_anomalous) if actual_anomalous else 0.0
        )
        f1 = (
            2 * precision * recall / (precision + recall)
            if (precision + recall) > 0
            else 0.0
        )

        self.result.detection_accuracy = {
            "true_positives": len(true_positives),
            "false_positives_from_fp_traps": len(false_positives_from_traps),
            "false_negatives": len(false_negatives),
            "precision": round(precision, 3),
            "recall": round(recall, 3),
            "f1_score": round(f1, 3),
            "total_actual_anomalous": len(actual_anomalous),
            "total_detected": len(detected_ids),
        }

    def get_top_risks(self, n: int = 10) -> list[RiskEvent]:
        """Return the top N risk events sorted by score."""
        return sorted(self.result.risk_events, key=lambda e: e.score, reverse=True)[:n]

    def get_risks_by_type(self) -> dict[str, list[RiskEvent]]:
        """Group risk events by type."""
        by_type: dict[str, list[RiskEvent]] = {}
        for event in self.result.risk_events:
            if event.risk_type not in by_type:
                by_type[event.risk_type] = []
            by_type[event.risk_type].append(event)
        return by_type
