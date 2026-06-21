"""Tests for DBSCAN incident clustering."""

from identitysphere.core.incidents import IncidentClusterEngine
from identitysphere.core.scoring import CompositeScore, ScoringResult
from identitysphere.models.events import RiskEvent, RiskSeverity
from identitysphere.models.identity import Identity, IdentityType, Platform, PlatformAccount


def test_incident_clustering_groups_events():
    engine = IncidentClusterEngine({"incidents": {"dbscan_eps": 0.8, "dbscan_min_samples": 2}})
    identities = {
        "A": Identity(
            identity_id="A",
            display_name="Alice",
            email="a@corp.com",
            identity_type=IdentityType.HUMAN,
            department="Finance",
            accounts=[PlatformAccount(platform=Platform.AD, account_id="a1", username="alice")],
        ),
        "B": Identity(
            identity_id="B",
            display_name="Bob",
            email="b@corp.com",
            identity_type=IdentityType.HUMAN,
            department="Finance",
            accounts=[PlatformAccount(platform=Platform.AWS, account_id="b1", username="bob")],
        ),
    }
    events = [
        RiskEvent(
            risk_id="R1",
            identity_id="A",
            risk_type="offboarding_gap",
            severity=RiskSeverity.HIGH,
            score=55,
            title="Gap A",
            description="",
        ),
        RiskEvent(
            risk_id="R2",
            identity_id="B",
            risk_type="offboarding_gap",
            severity=RiskSeverity.HIGH,
            score=52,
            title="Gap B",
            description="",
        ),
    ]
    scoring = ScoringResult(
        scores={
            "A": CompositeScore("A", "Alice", "Finance", final_score=55, severity="high"),
            "B": CompositeScore("B", "Bob", "Finance", final_score=52, severity="high"),
        }
    )
    clusters = engine.cluster(events, scoring, identities)
    assert len(clusters) >= 1
    total_signals = sum(c.signal_count for c in clusters)
    assert total_signals >= 2
