"""Tests for the DetectionEngine."""

import pytest

from identitysphere.core.ingest import IngestionEngine
from identitysphere.core.resolver import IdentityResolver
from identitysphere.core.privilege import PrivilegeCalculator
from identitysphere.core.detectors import DetectionContext, DetectionEngine
from identitysphere.models.events import RiskSeverity


class TestDetectionEngine:
    def _get_context(self, generated_data, config):
        engine = IngestionEngine()
        engine.ingest(generated_data)
        resolver = IdentityResolver(config)
        resolved = resolver.resolve(engine.identities)
        calc = PrivilegeCalculator(config)
        profiles = calc.calculate_all(resolved, engine.graph)
        return DetectionContext(
            identities=resolved,
            privilege_profiles=profiles,
            audit_events_by_identity=engine.audit_events_by_identity,
            offboarding_by_identity=engine.offboarding_by_identity,
            anomaly_labels=generated_data.get("anomaly_labels", {}),
        )

    def test_detection_runs(self, generated_data, config):
        ctx = self._get_context(generated_data, config)
        detector = DetectionEngine(config)
        result = detector.detect_all(ctx)
        assert result.total_identities_scanned > 0
        assert len(result.risk_events) > 0

    def test_detects_orphaned_accounts(self, generated_data, config):
        ctx = self._get_context(generated_data, config)
        detector = DetectionEngine(config)
        result = detector.detect_all(ctx)
        orphaned = [e for e in result.risk_events if e.risk_type == "orphaned_account"]
        assert len(orphaned) > 0

    def test_detects_privilege_escalation(self, generated_data, config):
        ctx = self._get_context(generated_data, config)
        detector = DetectionEngine(config)
        result = detector.detect_all(ctx)
        escalations = [e for e in result.risk_events if e.risk_type == "privilege_escalation"]
        assert len(escalations) > 0

    def test_detects_offboarding_gaps(self, generated_data, config):
        ctx = self._get_context(generated_data, config)
        detector = DetectionEngine(config)
        result = detector.detect_all(ctx)
        gaps = [e for e in result.risk_events if e.risk_type == "offboarding_gap"]
        assert len(gaps) > 0

    def test_risk_events_have_evidence(self, generated_data, config):
        ctx = self._get_context(generated_data, config)
        detector = DetectionEngine(config)
        result = detector.detect_all(ctx)
        for event in result.risk_events[:20]:
            assert len(event.evidence) > 0, f"No evidence for {event.risk_id}"

    def test_risk_events_have_remediation(self, generated_data, config):
        ctx = self._get_context(generated_data, config)
        detector = DetectionEngine(config)
        result = detector.detect_all(ctx)
        for event in result.risk_events[:20]:
            assert len(event.remediation_steps) > 0, f"No remediation for {event.risk_id}"

    def test_risk_events_have_compliance_refs(self, generated_data, config):
        ctx = self._get_context(generated_data, config)
        detector = DetectionEngine(config)
        result = detector.detect_all(ctx)
        with_compliance = [e for e in result.risk_events if e.compliance_refs]
        assert len(with_compliance) > len(result.risk_events) * 0.5

    def test_severity_distribution(self, generated_data, config):
        ctx = self._get_context(generated_data, config)
        detector = DetectionEngine(config)
        result = detector.detect_all(ctx)
        assert len(result.severity_distribution) > 0

    def test_context_adjustments_reduce_fp(self, generated_data, config):
        ctx = self._get_context(generated_data, config)
        detector = DetectionEngine(config)
        result = detector.detect_all(ctx)
        acc = result.detection_accuracy
        if acc and acc.get("total_actual_anomalous", 0) > 0:
            assert acc["precision"] > 0, "Precision should be > 0"
            assert acc["recall"] > 0, "Recall should be > 0"

    def test_top_risks(self, generated_data, config):
        ctx = self._get_context(generated_data, config)
        detector = DetectionEngine(config)
        detector.detect_all(ctx)
        top = detector.get_top_risks(5)
        assert len(top) <= 5
        if len(top) >= 2:
            assert top[0].score >= top[1].score
