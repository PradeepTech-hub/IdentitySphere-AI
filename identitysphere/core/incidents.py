"""Incident clustering — groups related risk signals across identities using DBSCAN."""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any

import numpy as np
from sklearn.cluster import DBSCAN
from sklearn.preprocessing import StandardScaler

from identitysphere.models.events import RiskEvent, RiskSeverity
from identitysphere.models.identity import Identity
from identitysphere.core.scoring import CompositeScore, ScoringResult

logger = logging.getLogger("identitysphere.incidents")

SEVERITY_NUM = {
    RiskSeverity.CRITICAL: 1.0,
    RiskSeverity.HIGH: 0.75,
    RiskSeverity.MEDIUM: 0.5,
    RiskSeverity.LOW: 0.25,
}

RISK_TYPE_INDEX = {
    "offboarding_gap": 0,
    "orphaned_account": 1,
    "cross_platform_admin": 2,
    "privilege_escalation": 3,
    "token_abuse": 4,
    "over_privileged": 5,
    "stale_account": 6,
    "mfa_disabled": 7,
    "sod_violation": 8,
    "ml_anomaly": 9,
}


@dataclass
class IncidentCluster:
    cluster_id: str
    title: str
    severity: str
    status: str
    identity_ids: list[str]
    identity_names: list[str]
    risk_types: list[str]
    platforms: list[str]
    avg_score: float
    max_score: float
    signal_count: int
    narrative: str
    remediation_steps: list[str] = field(default_factory=list)
    created: str = field(default_factory=lambda: datetime.utcnow().isoformat())


class IncidentClusterEngine:
    """Cluster risk events and scored identities into actionable incidents."""

    def __init__(self, config: dict[str, Any] | None = None) -> None:
        cfg = (config or {}).get("incidents", {})
        self.eps: float = cfg.get("dbscan_eps", 0.45)
        self.min_samples: int = cfg.get("dbscan_min_samples", 2)

    def cluster(
        self,
        risk_events: list[RiskEvent],
        scoring_result: ScoringResult,
        identities: dict[str, Identity],
    ) -> list[IncidentCluster]:
        if not risk_events:
            return []

        features: list[list[float]] = []
        meta: list[dict[str, Any]] = []

        for event in risk_events:
            ident = identities.get(event.identity_id)
            dept_hash = hash(ident.department or "") % 100 / 100.0 if ident else 0.0
            platform_count = len(event.affected_platforms) / 5.0
            type_idx = RISK_TYPE_INDEX.get(event.risk_type, 5) / 10.0
            sev = SEVERITY_NUM.get(event.severity, 0.5)
            score = event.score / 100.0
            features.append([sev, score, platform_count, type_idx, dept_hash])
            meta.append({
                "identity_id": event.identity_id,
                "display_name": ident.display_name if ident else event.identity_id,
                "risk_type": event.risk_type,
                "severity": event.severity.value,
                "score": event.score,
                "platforms": [p.value for p in event.affected_platforms],
                "remediation": list(event.remediation_steps),
            })

        X = StandardScaler().fit_transform(np.array(features))
        labels = DBSCAN(eps=self.eps, min_samples=self.min_samples).fit_predict(X)

        clusters: dict[int, list[dict]] = {}
        for label, item in zip(labels, meta):
            if label == -1:
                clusters.setdefault(-1000 - len(clusters), []).append(item)
            else:
                clusters.setdefault(int(label), []).append(item)

        high_scores = [
            s for s in scoring_result.scores.values() if s.final_score >= 30
        ]
        for score in high_scores:
            if not any(score.identity_id == m["identity_id"] for c in clusters.values() for m in c):
                clusters.setdefault(-2000 - len(clusters), []).append({
                    "identity_id": score.identity_id,
                    "display_name": score.display_name,
                    "risk_type": "composite",
                    "severity": score.severity,
                    "score": score.final_score,
                    "platforms": [],
                    "remediation": [],
                })

        incidents: list[IncidentCluster] = []
        for idx, (label, members) in enumerate(sorted(clusters.items(), key=lambda x: -max(m["score"] for m in x[1]))):
            identity_ids = list(dict.fromkeys(m["identity_id"] for m in members))
            identity_names = list(dict.fromkeys(m["display_name"] for m in members))
            risk_types = list(dict.fromkeys(m["risk_type"] for m in members))
            platforms = list(dict.fromkeys(p for m in members for p in m["platforms"]))
            scores = [m["score"] for m in members]
            max_score = max(scores)
            avg_score = sum(scores) / len(scores)

            if max_score >= 70:
                severity = "critical"
            elif max_score >= 45:
                severity = "high"
            elif max_score >= 25:
                severity = "medium"
            else:
                severity = "low"

            primary_type = risk_types[0] if risk_types else "composite"
            title = self._title(primary_type, identity_names, len(members))
            remediation = []
            for m in members:
                remediation.extend(m.get("remediation", []))
            remediation = list(dict.fromkeys(remediation))[:8]

            incidents.append(IncidentCluster(
                cluster_id=f"INC-{idx + 1:03d}",
                title=title,
                severity=severity,
                status="open" if severity in ("critical", "high") else "review",
                identity_ids=identity_ids,
                identity_names=identity_names,
                risk_types=risk_types,
                platforms=platforms,
                avg_score=round(avg_score, 2),
                max_score=round(max_score, 2),
                signal_count=len(members),
                narrative=(
                    f"Cluster of {len(members)} related signal(s) across "
                    f"{len(identity_ids)} identity/identities. "
                    f"Primary pattern: {primary_type.replace('_', ' ')}."
                ),
                remediation_steps=remediation or ["Review clustered signals and approve remediation"],
            ))

        logger.info("Incident clustering: %d events -> %d incident clusters", len(risk_events), len(incidents))
        return incidents

    def _title(self, risk_type: str, names: list[str], signal_count: int) -> str:
        label = risk_type.replace("_", " ").title()
        if len(names) == 1:
            return f"{label}: {names[0]}"
        if len(names) <= 3:
            return f"{label} cluster ({', '.join(names[:3])})"
        return f"{label} cluster ({len(names)} identities, {signal_count} signals)"

    def to_dict_list(self, incidents: list[IncidentCluster]) -> list[dict[str, Any]]:
        return [
            {
                "id": inc.cluster_id,
                "title": inc.title,
                "severity": inc.severity,
                "status": inc.status,
                "identity": inc.identity_names[0] if len(inc.identity_names) == 1 else ", ".join(inc.identity_names[:3]),
                "identities": inc.identity_names,
                "identity_ids": inc.identity_ids,
                "created": inc.created,
                "type": inc.risk_types[0] if inc.risk_types else "composite",
                "risk_types": inc.risk_types,
                "platforms": inc.platforms,
                "avg_score": inc.avg_score,
                "max_score": inc.max_score,
                "signal_count": inc.signal_count,
                "narrative": inc.narrative,
                "remediation_steps": inc.remediation_steps,
            }
            for inc in incidents
        ]
