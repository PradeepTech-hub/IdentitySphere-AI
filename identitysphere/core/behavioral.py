"""Behavioral Analytics Engine - identity anomaly detection via engineered features.

Produces per-identity behavioral profiles using 5 engineered features:

  1. login_frequency      - logins per day over the audit window (higher = more active)
  2. platform_spread      - fraction of available platforms the identity touches (0..1)
  3. privilege_to_usage   - privilege score / activity level; high privilege + low activity = risk
  4. dormancy             - days since most recent login, normalized to 0..100
  5. hour_of_day_entropy  - Shannon entropy of login hours; low entropy = predictable schedule,
                            high entropy = scattered hours (potential credential sharing or automation)

An Isolation Forest is trained on these 5 features. The forest's decision_function
returns a raw score per identity; negative = more anomalous. We invert and normalize
to [0, 100] where 100 = most anomalous.

Each identity's BehavioralProfile exposes the raw feature values and their individual
contribution to the anomaly score (via single-feature perturbation), making the
model output fully explainable for downstream scoring.py consumption.
"""

from __future__ import annotations

import logging
import math
from collections import Counter
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from typing import Any

import numpy as np
from sklearn.ensemble import IsolationForest

from identitysphere.models.identity import Identity, IdentityStatus, Platform
from identitysphere.models.events import AuditEvent, EventType

logger = logging.getLogger("identitysphere.behavioral")

LOGIN_EVENT_TYPES = frozenset({
    EventType.LOGIN_SUCCESS,
    EventType.LOGIN_FAILURE,
})

ACTIVITY_EVENT_TYPES = frozenset({
    EventType.LOGIN_SUCCESS,
    EventType.RESOURCE_ACCESS,
    EventType.API_CALL,
    EventType.TOKEN_USED,
})

ALL_PLATFORMS = list(Platform)


@dataclass
class BehavioralProfile:
    """Per-identity behavioral feature vector with anomaly score."""

    identity_id: str
    display_name: str

    login_frequency: float = 0.0
    platform_spread: float = 0.0
    privilege_to_usage: float = 0.0
    dormancy: float = 0.0
    hour_entropy: float = 0.0

    anomaly_score: float = 0.0
    is_anomalous: bool = False

    feature_contributions: dict[str, float] = field(default_factory=dict)
    raw_features: dict[str, float] = field(default_factory=dict)


@dataclass
class BehavioralResult:
    """Aggregate output of the behavioral engine."""

    total_profiled: int = 0
    anomalous_count: int = 0
    avg_anomaly_score: float = 0.0
    feature_stats: dict[str, dict[str, float]] = field(default_factory=dict)


class BehavioralEngine:
    """Computes behavioral features and runs Isolation Forest anomaly detection."""

    def __init__(self, config: dict[str, Any] | None = None) -> None:
        cfg = config or {}
        beh_cfg = cfg.get("behavioral", {})
        self.audit_window_days: int = beh_cfg.get("audit_window_days", 30)
        self.dormancy_max_days: int = beh_cfg.get("dormancy_max_days", 365)
        self.anomaly_threshold: float = beh_cfg.get("anomaly_threshold", 65.0)

        iso_cfg = beh_cfg.get("isolation_forest", cfg.get("risk_engine", {}).get("isolation_forest", {}))
        self.iso_contamination: float = iso_cfg.get("contamination", 0.10)
        self.iso_estimators: int = iso_cfg.get("n_estimators", 200)
        self.iso_random_state: int = iso_cfg.get("random_state", 42)

        self.profiles: dict[str, BehavioralProfile] = {}
        self.result = BehavioralResult()
        self._model: IsolationForest | None = None

    FEATURE_NAMES = [
        "login_frequency",
        "platform_spread",
        "privilege_to_usage",
        "dormancy",
        "hour_entropy",
    ]

    def analyze(
        self,
        identities: dict[str, Identity],
        audit_events_by_identity: dict[str, list[AuditEvent]],
        privilege_scores: dict[str, float],
    ) -> dict[str, BehavioralProfile]:
        """Build behavioral profiles for all identities and score anomalies."""
        logger.info("Starting behavioral analysis for %d identities...", len(identities))

        feature_matrix: list[list[float]] = []
        identity_ids: list[str] = []

        now = datetime.utcnow()
        window_start = now - timedelta(days=self.audit_window_days)

        for iid, identity in identities.items():
            events = audit_events_by_identity.get(iid, [])
            priv_score = privilege_scores.get(iid, 0.0)

            features = self._extract_features(identity, events, priv_score, now, window_start)

            profile = BehavioralProfile(
                identity_id=iid,
                display_name=identity.display_name,
                login_frequency=features[0],
                platform_spread=features[1],
                privilege_to_usage=features[2],
                dormancy=features[3],
                hour_entropy=features[4],
                raw_features=dict(zip(self.FEATURE_NAMES, features)),
            )
            self.profiles[iid] = profile
            feature_matrix.append(features)
            identity_ids.append(iid)

        if len(feature_matrix) >= 10:
            self._score_anomalies(feature_matrix, identity_ids)
        else:
            for iid in identity_ids:
                self.profiles[iid].anomaly_score = 50.0

        self._compute_result_stats()

        logger.info(
            "Behavioral analysis complete: %d profiled, %d anomalous (score > %.0f), "
            "avg score %.1f",
            self.result.total_profiled,
            self.result.anomalous_count,
            self.anomaly_threshold,
            self.result.avg_anomaly_score,
        )
        return self.profiles

    def _extract_features(
        self,
        identity: Identity,
        events: list[AuditEvent],
        priv_score: float,
        now: datetime,
        window_start: datetime,
    ) -> list[float]:
        """Extract the 5 behavioral features for a single identity."""
        window_events = [e for e in events if e.timestamp >= window_start]

        # 1. Login frequency: logins per day in the audit window
        login_events = [e for e in window_events if e.event_type in LOGIN_EVENT_TYPES]
        login_frequency = len(login_events) / max(self.audit_window_days, 1)

        # 2. Platform spread: fraction of total platforms with active accounts
        active_platforms = {
            a.platform for a in identity.accounts if a.status == IdentityStatus.ACTIVE
        }
        platform_spread = len(active_platforms) / len(ALL_PLATFORMS)

        # 3. Privilege-to-usage ratio: high privilege + low activity = suspicious
        activity_events = [e for e in window_events if e.event_type in ACTIVITY_EVENT_TYPES]
        activity_level = min(len(activity_events) / max(self.audit_window_days, 1), 10.0)
        if activity_level > 0:
            privilege_to_usage = min(priv_score / (activity_level * 10.0), 10.0)
        else:
            privilege_to_usage = min(priv_score / 10.0, 10.0) if priv_score > 0 else 0.0

        # 4. Dormancy: days since most recent login, normalized to 0..100
        most_recent_login = None
        for acct in identity.accounts:
            if acct.last_login and acct.status == IdentityStatus.ACTIVE:
                if most_recent_login is None or acct.last_login > most_recent_login:
                    most_recent_login = acct.last_login

        if most_recent_login:
            days_dormant = (now - most_recent_login).days
            dormancy = min(days_dormant / self.dormancy_max_days * 100.0, 100.0)
        else:
            dormancy = 100.0

        # 5. Hour-of-day entropy: Shannon entropy of login timestamps' hour distribution
        hour_entropy = self._compute_hour_entropy(login_events)

        return [login_frequency, platform_spread, privilege_to_usage, dormancy, hour_entropy]

    def _compute_hour_entropy(self, login_events: list[AuditEvent]) -> float:
        """Shannon entropy of event hour distribution, normalized to [0, 1]."""
        if len(login_events) < 2:
            return 0.0

        hours = [e.timestamp.hour for e in login_events]
        counts = Counter(hours)
        total = len(hours)
        max_entropy = math.log2(24)

        entropy = 0.0
        for count in counts.values():
            p = count / total
            if p > 0:
                entropy -= p * math.log2(p)

        return entropy / max_entropy if max_entropy > 0 else 0.0

    def _score_anomalies(
        self, feature_matrix: list[list[float]], identity_ids: list[str]
    ) -> None:
        """Train Isolation Forest and compute anomaly scores with feature contributions."""
        X = np.array(feature_matrix)

        self._model = IsolationForest(
            contamination=self.iso_contamination,
            n_estimators=self.iso_estimators,
            random_state=self.iso_random_state,
        )
        self._model.fit(X)

        raw_scores = self._model.decision_function(X)
        min_s, max_s = float(raw_scores.min()), float(raw_scores.max())
        if max_s == min_s:
            normalized = np.full_like(raw_scores, 50.0)
        else:
            normalized = (1.0 - (raw_scores - min_s) / (max_s - min_s)) * 100.0

        for idx, iid in enumerate(identity_ids):
            score = float(normalized[idx])
            self.profiles[iid].anomaly_score = score
            self.profiles[iid].is_anomalous = score >= self.anomaly_threshold

            contributions = self._compute_feature_contributions(X, idx, raw_scores[idx])
            self.profiles[iid].feature_contributions = contributions

    def _compute_feature_contributions(
        self, X: np.ndarray, idx: int, baseline_score: float
    ) -> dict[str, float]:
        """Estimate each feature's contribution via leave-one-out perturbation.

        For each feature, replace it with the population median and re-score.
        The difference from the baseline score indicates that feature's contribution
        to the anomaly score.
        """
        contributions: dict[str, float] = {}
        medians = np.median(X, axis=0)
        total_abs = 0.0
        raw_contribs: dict[str, float] = {}

        for f_idx, fname in enumerate(self.FEATURE_NAMES):
            perturbed = X[idx].copy()
            perturbed[f_idx] = medians[f_idx]
            perturbed_score = self._model.decision_function(perturbed.reshape(1, -1))[0]
            diff = baseline_score - perturbed_score
            raw_contribs[fname] = diff
            total_abs += abs(diff)

        if total_abs > 0:
            for fname, diff in raw_contribs.items():
                contributions[fname] = round(abs(diff) / total_abs * 100.0, 1)
        else:
            even = round(100.0 / len(self.FEATURE_NAMES), 1)
            for fname in self.FEATURE_NAMES:
                contributions[fname] = even

        return contributions

    def _compute_result_stats(self) -> None:
        """Aggregate statistics across all behavioral profiles."""
        if not self.profiles:
            return

        scores = [p.anomaly_score for p in self.profiles.values()]
        self.result.total_profiled = len(self.profiles)
        self.result.anomalous_count = sum(1 for s in scores if s >= self.anomaly_threshold)
        self.result.avg_anomaly_score = sum(scores) / len(scores)

        for fname in self.FEATURE_NAMES:
            values = [p.raw_features.get(fname, 0.0) for p in self.profiles.values()]
            self.result.feature_stats[fname] = {
                "min": round(min(values), 3),
                "max": round(max(values), 3),
                "mean": round(sum(values) / len(values), 3),
                "median": round(sorted(values)[len(values) // 2], 3),
            }

    def get_top_anomalies(self, n: int = 10) -> list[BehavioralProfile]:
        """Return the top N most anomalous identities."""
        return sorted(
            self.profiles.values(), key=lambda p: p.anomaly_score, reverse=True
        )[:n]

    def get_summary(self) -> dict[str, Any]:
        return {
            "total_profiled": self.result.total_profiled,
            "anomalous_count": self.result.anomalous_count,
            "avg_anomaly_score": round(self.result.avg_anomaly_score, 2),
            "anomaly_threshold": self.anomaly_threshold,
            "feature_stats": self.result.feature_stats,
        }
