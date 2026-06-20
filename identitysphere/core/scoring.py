"""Explainable Composite Risk Scoring Engine.

Produces a single composite risk score per identity from 5 weighted factors,
applies false-positive suppression, and computes alert consolidation metrics.

COMPOSITE RISK FORMULA
======================

  composite_score = sum(factor_weight_i * factor_value_i) * suppression_multiplier

  Factor weights (sum to 1.0):
    privilege_breadth        0.25  - effective privilege normalized score (0..100)
    cross_platform_exposure  0.20  - admin_platform_count / total_platforms * 100
    dormancy                 0.15  - behavioral dormancy feature (0..100)
    detector_severity        0.25  - highest detector finding severity mapped to 0..100
    behavioral_anomaly       0.15  - isolation forest anomaly score (0..100)

  Suppression multiplier = product of all applicable suppressors:
    active_admin       0.85  - admin who logged in within last 7 days
    mfa_all_platforms  0.80  - MFA enabled on every active account
    on_call            0.60  - identity tagged as on-call
    recent_role_change 0.70  - role changed within last 14 days

  Final score is clamped to [0, 100].

WORKED EXAMPLE (User ID-0082, privilege_escalation + cross-platform admin):
  Factor values:
    privilege_breadth       = 100.0  (highest in population)
    cross_platform_exposure = 60.0   (3/5 platforms admin)
    dormancy                = 2.7    (logged in recently)
    detector_severity       = 100.0  (CRITICAL findings)
    behavioral_anomaly      = 78.3   (high anomaly score)

  Weighted sum = 0.25*100 + 0.20*60 + 0.15*2.7 + 0.25*100 + 0.15*78.3
               = 25.0 + 12.0 + 0.405 + 25.0 + 11.745 = 74.15

  Suppressors: none applicable (no on_call, no MFA, not recent role change)
  suppression_multiplier = 1.0

  composite_score = 74.15 * 1.0 = 74.15 -> CRITICAL

ALERT CONSOLIDATION
===================
  Raw signals = total individual risk events from detectors
  Consolidated incidents = unique identities with composite score > threshold
  Reduction % = (1 - consolidated / raw) * 100
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from typing import Any

from identitysphere.models.identity import Identity, IdentityStatus, Platform
from identitysphere.models.events import RiskEvent, RiskSeverity
from identitysphere.core.privilege import PrivilegeProfile
from identitysphere.core.behavioral import BehavioralProfile

logger = logging.getLogger("identitysphere.scoring")

SEVERITY_TO_SCORE = {
    RiskSeverity.CRITICAL: 100.0,
    RiskSeverity.HIGH: 75.0,
    RiskSeverity.MEDIUM: 50.0,
    RiskSeverity.LOW: 25.0,
}

ALL_PLATFORMS = list(Platform)


@dataclass
class ScoreFactor:
    """A single contributing factor to the composite score."""

    name: str
    raw_value: float
    weight: float
    weighted_value: float
    description: str


@dataclass
class SuppressionRecord:
    """A single false-positive suppression applied to a score."""

    rule: str
    multiplier: float
    reason: str


@dataclass
class CompositeScore:
    """Fully explainable composite risk score for a single identity."""

    identity_id: str
    display_name: str
    department: str

    raw_score: float = 0.0
    suppressed_score: float = 0.0
    final_score: float = 0.0
    severity: str = "low"

    factors: list[ScoreFactor] = field(default_factory=list)
    suppressions: list[SuppressionRecord] = field(default_factory=list)
    suppression_multiplier: float = 1.0

    detector_findings_count: int = 0
    behavioral_anomaly_score: float = 0.0
    is_false_positive_suppressed: bool = False


@dataclass
class ConsolidationMetrics:
    """Alert consolidation report."""

    raw_signals_count: int = 0
    consolidated_incidents_count: int = 0
    reduction_percentage: float = 0.0
    identities_suppressed: int = 0
    suppression_rate: float = 0.0


@dataclass
class ScoringResult:
    """Aggregate output of the scoring engine."""

    scores: dict[str, CompositeScore] = field(default_factory=dict)
    consolidation: ConsolidationMetrics = field(default_factory=ConsolidationMetrics)
    severity_distribution: dict[str, int] = field(default_factory=dict)
    avg_composite_score: float = 0.0
    suppression_stats: dict[str, int] = field(default_factory=dict)


class ScoringEngine:
    """Produces explainable composite risk scores with false-positive suppression."""

    def __init__(self, config: dict[str, Any] | None = None) -> None:
        cfg = config or {}
        scoring_cfg = cfg.get("scoring", {})

        weights = scoring_cfg.get("factor_weights", {})
        self.w_privilege: float = weights.get("privilege_breadth", 0.25)
        self.w_cross_plat: float = weights.get("cross_platform_exposure", 0.20)
        self.w_dormancy: float = weights.get("dormancy", 0.15)
        self.w_detector: float = weights.get("detector_severity", 0.25)
        self.w_behavioral: float = weights.get("behavioral_anomaly", 0.15)

        supp = scoring_cfg.get("suppression", {})
        self.supp_active_admin: float = supp.get("active_admin", 0.85)
        self.supp_mfa_all: float = supp.get("mfa_all_platforms", 0.80)
        self.supp_on_call: float = supp.get("on_call", 0.60)
        self.supp_role_change: float = supp.get("recent_role_change", 0.70)
        self.active_admin_days: int = supp.get("active_admin_days", 7)
        self.role_change_days: int = supp.get("role_change_days", 14)

        self.incident_threshold: float = scoring_cfg.get("incident_threshold", 30.0)

        self.result = ScoringResult()

    def score_all(
        self,
        identities: dict[str, Identity],
        privilege_profiles: dict[str, PrivilegeProfile],
        behavioral_profiles: dict[str, BehavioralProfile],
        risk_events: list[RiskEvent],
    ) -> ScoringResult:
        """Compute composite scores for all identities."""
        logger.info("Starting composite risk scoring for %d identities...", len(identities))

        events_by_identity: dict[str, list[RiskEvent]] = {}
        for event in risk_events:
            if event.identity_id not in events_by_identity:
                events_by_identity[event.identity_id] = []
            events_by_identity[event.identity_id].append(event)

        self.result = ScoringResult()

        for iid, identity in identities.items():
            priv_profile = privilege_profiles.get(iid)
            beh_profile = behavioral_profiles.get(iid)
            findings = events_by_identity.get(iid, [])

            composite = self._score_single(identity, priv_profile, beh_profile, findings)
            self.result.scores[iid] = composite

        self._compute_consolidation(risk_events)
        self._compute_aggregate_stats()

        logger.info(
            "Scoring complete: %d scored, avg=%.1f, consolidation: %d raw -> %d incidents (%.1f%% reduction)",
            len(self.result.scores),
            self.result.avg_composite_score,
            self.result.consolidation.raw_signals_count,
            self.result.consolidation.consolidated_incidents_count,
            self.result.consolidation.reduction_percentage,
        )
        return self.result

    def _score_single(
        self,
        identity: Identity,
        priv_profile: PrivilegeProfile | None,
        beh_profile: BehavioralProfile | None,
        findings: list[RiskEvent],
    ) -> CompositeScore:
        """Compute the composite score for a single identity."""
        # Factor 1: Privilege breadth
        priv_score = priv_profile.normalized_score if priv_profile else 0.0

        # Factor 2: Cross-platform admin exposure
        if priv_profile and priv_profile.admin_platforms:
            cross_plat_score = len(priv_profile.admin_platforms) / len(ALL_PLATFORMS) * 100.0
        else:
            cross_plat_score = 0.0

        # Factor 3: Dormancy
        dormancy_score = beh_profile.dormancy if beh_profile else 0.0

        # Factor 4: Detector severity (highest finding)
        detector_score = 0.0
        if findings:
            max_severity = max(findings, key=lambda f: SEVERITY_TO_SCORE.get(f.severity, 0))
            detector_score = SEVERITY_TO_SCORE.get(max_severity.severity, 0.0)

        # Factor 5: Behavioral anomaly
        behavioral_score = beh_profile.anomaly_score if beh_profile else 50.0

        factors = [
            ScoreFactor(
                name="privilege_breadth",
                raw_value=round(priv_score, 2),
                weight=self.w_privilege,
                weighted_value=round(priv_score * self.w_privilege, 2),
                description=f"Effective privilege score: {priv_score:.1f}/100",
            ),
            ScoreFactor(
                name="cross_platform_exposure",
                raw_value=round(cross_plat_score, 2),
                weight=self.w_cross_plat,
                weighted_value=round(cross_plat_score * self.w_cross_plat, 2),
                description=(
                    f"Admin on {len(priv_profile.admin_platforms) if priv_profile else 0}/"
                    f"{len(ALL_PLATFORMS)} platforms"
                ),
            ),
            ScoreFactor(
                name="dormancy",
                raw_value=round(dormancy_score, 2),
                weight=self.w_dormancy,
                weighted_value=round(dormancy_score * self.w_dormancy, 2),
                description=f"Dormancy score: {dormancy_score:.1f}/100",
            ),
            ScoreFactor(
                name="detector_severity",
                raw_value=round(detector_score, 2),
                weight=self.w_detector,
                weighted_value=round(detector_score * self.w_detector, 2),
                description=f"Max detector severity score: {detector_score:.0f}/100 from {len(findings)} finding(s)",
            ),
            ScoreFactor(
                name="behavioral_anomaly",
                raw_value=round(behavioral_score, 2),
                weight=self.w_behavioral,
                weighted_value=round(behavioral_score * self.w_behavioral, 2),
                description=f"Behavioral anomaly score: {behavioral_score:.1f}/100",
            ),
        ]

        raw_score = sum(f.weighted_value for f in factors)

        suppressions, suppression_multiplier = self._compute_suppressions(identity)

        suppressed_score = raw_score * suppression_multiplier
        final_score = max(0.0, min(100.0, suppressed_score))

        if final_score >= 70:
            severity = "critical"
        elif final_score >= 45:
            severity = "high"
        elif final_score >= 25:
            severity = "medium"
        else:
            severity = "low"

        return CompositeScore(
            identity_id=identity.identity_id,
            display_name=identity.display_name,
            department=identity.department or "Unknown",
            raw_score=round(raw_score, 2),
            suppressed_score=round(suppressed_score, 2),
            final_score=round(final_score, 2),
            severity=severity,
            factors=factors,
            suppressions=suppressions,
            suppression_multiplier=round(suppression_multiplier, 3),
            detector_findings_count=len(findings),
            behavioral_anomaly_score=round(behavioral_score, 2),
            is_false_positive_suppressed=suppression_multiplier < 1.0,
        )

    def _compute_suppressions(
        self, identity: Identity
    ) -> tuple[list[SuppressionRecord], float]:
        """Evaluate all false-positive suppression rules and return applicable ones."""
        suppressions: list[SuppressionRecord] = []
        multiplier = 1.0
        now = datetime.utcnow()

        # Rule 1: Active admin - admin who logged in recently
        admin_accounts = [a for a in identity.accounts if a.is_admin and a.status == IdentityStatus.ACTIVE]
        if admin_accounts:
            recent_cutoff = now - timedelta(days=self.active_admin_days)
            recent_admin_logins = [
                a for a in admin_accounts
                if a.last_login and a.last_login >= recent_cutoff
            ]
            if recent_admin_logins:
                suppressions.append(SuppressionRecord(
                    rule="active_admin",
                    multiplier=self.supp_active_admin,
                    reason=f"Admin with login in last {self.active_admin_days} days "
                           f"({len(recent_admin_logins)} account(s))",
                ))
                multiplier *= self.supp_active_admin

        # Rule 2: MFA enabled on all active accounts
        active_accounts = [a for a in identity.accounts if a.status == IdentityStatus.ACTIVE]
        if active_accounts and all(a.mfa_enabled for a in active_accounts):
            suppressions.append(SuppressionRecord(
                rule="mfa_all_platforms",
                multiplier=self.supp_mfa_all,
                reason=f"MFA enabled on all {len(active_accounts)} active account(s)",
            ))
            multiplier *= self.supp_mfa_all

        # Rule 3: On-call tag
        if identity.tags.get("on_call") == "true":
            suppressions.append(SuppressionRecord(
                rule="on_call",
                multiplier=self.supp_on_call,
                reason="Identity tagged as on-call",
            ))
            multiplier *= self.supp_on_call

        # Rule 4: Recent role change
        role_change_str = identity.tags.get("role_change_date")
        if role_change_str:
            try:
                role_change_date = datetime.fromisoformat(role_change_str)
                if (now - role_change_date).days <= self.role_change_days:
                    suppressions.append(SuppressionRecord(
                        rule="recent_role_change",
                        multiplier=self.supp_role_change,
                        reason=f"Role changed {(now - role_change_date).days} days ago "
                               f"(within {self.role_change_days}-day window)",
                    ))
                    multiplier *= self.supp_role_change
            except (ValueError, TypeError):
                pass

        return suppressions, multiplier

    def _compute_consolidation(self, raw_risk_events: list[RiskEvent]) -> None:
        """Compute alert consolidation metrics."""
        raw_count = len(raw_risk_events)

        incident_identities = {
            iid for iid, score in self.result.scores.items()
            if score.final_score >= self.incident_threshold
        }
        consolidated_count = len(incident_identities)

        suppressed_count = sum(
            1 for s in self.result.scores.values() if s.is_false_positive_suppressed
        )

        reduction = 0.0
        if raw_count > 0:
            reduction = (1 - consolidated_count / raw_count) * 100.0

        self.result.consolidation = ConsolidationMetrics(
            raw_signals_count=raw_count,
            consolidated_incidents_count=consolidated_count,
            reduction_percentage=round(max(reduction, 0.0), 1),
            identities_suppressed=suppressed_count,
            suppression_rate=round(
                suppressed_count / max(len(self.result.scores), 1) * 100.0, 1
            ),
        )

    def _compute_aggregate_stats(self) -> None:
        """Compute aggregate scoring statistics."""
        if not self.result.scores:
            return

        scores = [s.final_score for s in self.result.scores.values()]
        self.result.avg_composite_score = round(sum(scores) / len(scores), 2)

        for score in self.result.scores.values():
            sev = score.severity
            self.result.severity_distribution[sev] = (
                self.result.severity_distribution.get(sev, 0) + 1
            )
            for supp in score.suppressions:
                self.result.suppression_stats[supp.rule] = (
                    self.result.suppression_stats.get(supp.rule, 0) + 1
                )

    def get_top_scores(self, n: int = 10) -> list[CompositeScore]:
        """Return the N highest-scoring identities."""
        return sorted(
            self.result.scores.values(), key=lambda s: s.final_score, reverse=True
        )[:n]

    def get_summary(self) -> dict[str, Any]:
        return {
            "total_scored": len(self.result.scores),
            "avg_composite_score": self.result.avg_composite_score,
            "severity_distribution": self.result.severity_distribution,
            "consolidation": {
                "raw_signals_count": self.result.consolidation.raw_signals_count,
                "consolidated_incidents_count": self.result.consolidation.consolidated_incidents_count,
                "reduction_percentage": self.result.consolidation.reduction_percentage,
                "identities_suppressed": self.result.consolidation.identities_suppressed,
                "suppression_rate": self.result.consolidation.suppression_rate,
            },
            "suppression_stats": self.result.suppression_stats,
        }

    def format_score_explanation(self, score: CompositeScore) -> str:
        """Produce a human-readable explanation of a composite score."""
        lines = [
            f"=== Risk Score: {score.display_name} ({score.identity_id}) ===",
            f"Department: {score.department}",
            f"Final Score: {score.final_score}/100 ({score.severity.upper()})",
            f"Raw Score:   {score.raw_score} -> Suppressed: {score.suppressed_score}",
            "",
            "Factor Breakdown:",
        ]
        for f in score.factors:
            lines.append(
                f"  {f.name:<28} {f.raw_value:>6.1f} x {f.weight:.2f} = {f.weighted_value:>6.2f}  ({f.description})"
            )
        lines.append(f"  {'Sum':<28} {'':>6} {'':>6}   {score.raw_score:>6.2f}")

        if score.suppressions:
            lines.append("")
            lines.append(f"Suppression (multiplier = {score.suppression_multiplier:.3f}):")
            for s in score.suppressions:
                lines.append(f"  x{s.multiplier:.2f}  {s.rule:<25} {s.reason}")
        else:
            lines.append("")
            lines.append("Suppression: none applied (multiplier = 1.000)")

        lines.append("")
        lines.append(f"Detector findings: {score.detector_findings_count}")
        lines.append(f"Behavioral anomaly: {score.behavioral_anomaly_score}/100")
        return "\n".join(lines)
