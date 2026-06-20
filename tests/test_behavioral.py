"""Tests for the BehavioralEngine."""

import pytest

from identitysphere.core.ingest import IngestionEngine
from identitysphere.core.resolver import IdentityResolver
from identitysphere.core.privilege import PrivilegeCalculator
from identitysphere.core.behavioral import BehavioralEngine


class TestBehavioralEngine:
    def _get_inputs(self, generated_data, config):
        engine = IngestionEngine()
        engine.ingest(generated_data)
        resolver = IdentityResolver(config)
        resolved = resolver.resolve(engine.identities)
        calc = PrivilegeCalculator(config)
        profiles = calc.calculate_all(resolved, engine.graph)
        priv_scores = {iid: p.normalized_score for iid, p in profiles.items()}
        return resolved, engine.audit_events_by_identity, priv_scores

    def test_analyze_produces_profiles(self, generated_data, config):
        resolved, events, priv_scores = self._get_inputs(generated_data, config)
        beh = BehavioralEngine(config)
        profiles = beh.analyze(resolved, events, priv_scores)
        assert len(profiles) == len(resolved)

    def test_anomaly_scores_in_range(self, generated_data, config):
        resolved, events, priv_scores = self._get_inputs(generated_data, config)
        beh = BehavioralEngine(config)
        profiles = beh.analyze(resolved, events, priv_scores)
        for p in profiles.values():
            assert 0.0 <= p.anomaly_score <= 100.0

    def test_feature_values_populated(self, generated_data, config):
        resolved, events, priv_scores = self._get_inputs(generated_data, config)
        beh = BehavioralEngine(config)
        profiles = beh.analyze(resolved, events, priv_scores)
        for p in list(profiles.values())[:10]:
            assert len(p.raw_features) == 5
            assert "login_frequency" in p.raw_features
            assert "platform_spread" in p.raw_features
            assert "privilege_to_usage" in p.raw_features
            assert "dormancy" in p.raw_features
            assert "hour_entropy" in p.raw_features

    def test_feature_contributions_sum_to_100(self, generated_data, config):
        resolved, events, priv_scores = self._get_inputs(generated_data, config)
        beh = BehavioralEngine(config)
        profiles = beh.analyze(resolved, events, priv_scores)
        for p in list(profiles.values())[:10]:
            if p.feature_contributions:
                total = sum(p.feature_contributions.values())
                assert abs(total - 100.0) < 1.0, f"Contributions sum to {total}, expected ~100"

    def test_anomalous_flagging(self, generated_data, config):
        resolved, events, priv_scores = self._get_inputs(generated_data, config)
        beh = BehavioralEngine(config)
        profiles = beh.analyze(resolved, events, priv_scores)
        anomalous = [p for p in profiles.values() if p.is_anomalous]
        assert len(anomalous) > 0

    def test_get_top_anomalies(self, generated_data, config):
        resolved, events, priv_scores = self._get_inputs(generated_data, config)
        beh = BehavioralEngine(config)
        beh.analyze(resolved, events, priv_scores)
        top = beh.get_top_anomalies(5)
        assert len(top) <= 5
        if len(top) >= 2:
            assert top[0].anomaly_score >= top[1].anomaly_score

    def test_summary_stats(self, generated_data, config):
        resolved, events, priv_scores = self._get_inputs(generated_data, config)
        beh = BehavioralEngine(config)
        beh.analyze(resolved, events, priv_scores)
        summary = beh.get_summary()
        assert summary["total_profiled"] == len(resolved)
        assert "feature_stats" in summary
        assert len(summary["feature_stats"]) == 5

    def test_platform_spread_range(self, generated_data, config):
        resolved, events, priv_scores = self._get_inputs(generated_data, config)
        beh = BehavioralEngine(config)
        profiles = beh.analyze(resolved, events, priv_scores)
        for p in profiles.values():
            assert 0.0 <= p.platform_spread <= 1.0

    def test_dormancy_range(self, generated_data, config):
        resolved, events, priv_scores = self._get_inputs(generated_data, config)
        beh = BehavioralEngine(config)
        profiles = beh.analyze(resolved, events, priv_scores)
        for p in profiles.values():
            assert 0.0 <= p.dormancy <= 100.0
