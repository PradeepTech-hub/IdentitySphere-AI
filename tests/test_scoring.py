"""Tests for the ScoringEngine."""

import pytest

from identitysphere.core.ingest import IngestionEngine
from identitysphere.core.resolver import IdentityResolver
from identitysphere.core.privilege import PrivilegeCalculator
from identitysphere.core.detectors import DetectionContext, DetectionEngine
from identitysphere.core.behavioral import BehavioralEngine
from identitysphere.core.scoring import ScoringEngine


class TestScoringEngine:
    def _get_inputs(self, generated_data, config):
        engine = IngestionEngine()
        engine.ingest(generated_data)
        resolver = IdentityResolver(config)
        resolved = resolver.resolve(engine.identities)
        calc = PrivilegeCalculator(config)
        profiles = calc.calculate_all(resolved, engine.graph)

        ctx = DetectionContext(
            identities=resolved,
            privilege_profiles=profiles,
            audit_events_by_identity=engine.audit_events_by_identity,
            offboarding_by_identity=engine.offboarding_by_identity,
            anomaly_labels=generated_data.get("anomaly_labels", {}),
        )
        det = DetectionEngine(config)
        det_result = det.detect_all(ctx)

        priv_scores = {iid: p.normalized_score for iid, p in profiles.items()}
        beh = BehavioralEngine(config)
        beh_profiles = beh.analyze(resolved, engine.audit_events_by_identity, priv_scores)

        return resolved, profiles, beh_profiles, det_result.risk_events

    def test_scores_all_identities(self, generated_data, config):
        resolved, profiles, beh_profiles, risk_events = self._get_inputs(generated_data, config)
        scorer = ScoringEngine(config)
        result = scorer.score_all(resolved, profiles, beh_profiles, risk_events)
        assert len(result.scores) == len(resolved)

    def test_scores_in_range(self, generated_data, config):
        resolved, profiles, beh_profiles, risk_events = self._get_inputs(generated_data, config)
        scorer = ScoringEngine(config)
        result = scorer.score_all(resolved, profiles, beh_profiles, risk_events)
        for score in result.scores.values():
            assert 0.0 <= score.final_score <= 100.0

    def test_factors_present(self, generated_data, config):
        resolved, profiles, beh_profiles, risk_events = self._get_inputs(generated_data, config)
        scorer = ScoringEngine(config)
        result = scorer.score_all(resolved, profiles, beh_profiles, risk_events)
        for score in list(result.scores.values())[:10]:
            assert len(score.factors) == 5
            factor_names = {f.name for f in score.factors}
            assert "privilege_breadth" in factor_names
            assert "cross_platform_exposure" in factor_names
            assert "dormancy" in factor_names
            assert "detector_severity" in factor_names
            assert "behavioral_anomaly" in factor_names

    def test_factor_weights_sum_to_one(self, config):
        scorer = ScoringEngine(config)
        total = scorer.w_privilege + scorer.w_cross_plat + scorer.w_dormancy + scorer.w_detector + scorer.w_behavioral
        assert abs(total - 1.0) < 0.001

    def test_raw_score_equals_factor_sum(self, generated_data, config):
        resolved, profiles, beh_profiles, risk_events = self._get_inputs(generated_data, config)
        scorer = ScoringEngine(config)
        result = scorer.score_all(resolved, profiles, beh_profiles, risk_events)
        for score in list(result.scores.values())[:20]:
            factor_sum = sum(f.weighted_value for f in score.factors)
            assert abs(score.raw_score - factor_sum) < 0.1, (
                f"raw_score={score.raw_score} != factor_sum={factor_sum}"
            )

    def test_suppression_reduces_score(self, generated_data, config):
        resolved, profiles, beh_profiles, risk_events = self._get_inputs(generated_data, config)
        scorer = ScoringEngine(config)
        result = scorer.score_all(resolved, profiles, beh_profiles, risk_events)
        suppressed = [s for s in result.scores.values() if s.is_false_positive_suppressed]
        assert len(suppressed) > 0, "No identities were suppressed"
        for s in suppressed:
            assert s.suppressed_score <= s.raw_score
            assert s.suppression_multiplier < 1.0
            assert len(s.suppressions) > 0

    def test_severity_assignment(self, generated_data, config):
        resolved, profiles, beh_profiles, risk_events = self._get_inputs(generated_data, config)
        scorer = ScoringEngine(config)
        result = scorer.score_all(resolved, profiles, beh_profiles, risk_events)
        for score in result.scores.values():
            if score.final_score >= 70:
                assert score.severity == "critical"
            elif score.final_score >= 45:
                assert score.severity == "high"
            elif score.final_score >= 25:
                assert score.severity == "medium"
            else:
                assert score.severity == "low"

    def test_consolidation_metrics(self, generated_data, config):
        resolved, profiles, beh_profiles, risk_events = self._get_inputs(generated_data, config)
        scorer = ScoringEngine(config)
        result = scorer.score_all(resolved, profiles, beh_profiles, risk_events)
        c = result.consolidation
        assert c.raw_signals_count > 0
        assert c.consolidated_incidents_count >= 0
        assert 0.0 <= c.reduction_percentage <= 100.0
        assert c.consolidated_incidents_count <= c.raw_signals_count

    def test_consolidation_reduction_positive(self, generated_data, config):
        resolved, profiles, beh_profiles, risk_events = self._get_inputs(generated_data, config)
        scorer = ScoringEngine(config)
        result = scorer.score_all(resolved, profiles, beh_profiles, risk_events)
        assert result.consolidation.reduction_percentage > 0, (
            "Expected positive alert reduction from consolidation"
        )

    def test_top_scores_ordered(self, generated_data, config):
        resolved, profiles, beh_profiles, risk_events = self._get_inputs(generated_data, config)
        scorer = ScoringEngine(config)
        scorer.score_all(resolved, profiles, beh_profiles, risk_events)
        top = scorer.get_top_scores(5)
        assert len(top) <= 5
        if len(top) >= 2:
            assert top[0].final_score >= top[1].final_score

    def test_score_explanation_format(self, generated_data, config):
        resolved, profiles, beh_profiles, risk_events = self._get_inputs(generated_data, config)
        scorer = ScoringEngine(config)
        scorer.score_all(resolved, profiles, beh_profiles, risk_events)
        top = scorer.get_top_scores(1)
        assert len(top) == 1
        explanation = scorer.format_score_explanation(top[0])
        assert "Risk Score:" in explanation
        assert "Factor Breakdown:" in explanation
        assert "Suppression" in explanation

    def test_suppression_stats_populated(self, generated_data, config):
        resolved, profiles, beh_profiles, risk_events = self._get_inputs(generated_data, config)
        scorer = ScoringEngine(config)
        result = scorer.score_all(resolved, profiles, beh_profiles, risk_events)
        summary = scorer.get_summary()
        assert "suppression_stats" in summary
        assert len(result.suppression_stats) > 0
