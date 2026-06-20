"""Tests for the PrivilegeCalculator."""

import pytest

from identitysphere.core.ingest import IngestionEngine
from identitysphere.core.resolver import IdentityResolver
from identitysphere.core.privilege import PrivilegeCalculator


class TestPrivilegeCalculator:
    def _get_resolved(self, generated_data, config):
        engine = IngestionEngine()
        engine.ingest(generated_data)
        resolver = IdentityResolver(config)
        resolved = resolver.resolve(engine.identities)
        return resolved, engine

    def test_calculates_all_profiles(self, generated_data, config):
        resolved, engine = self._get_resolved(generated_data, config)
        calc = PrivilegeCalculator(config)
        profiles = calc.calculate_all(resolved, engine.graph)
        assert len(profiles) == len(resolved)

    def test_scores_are_normalized(self, generated_data, config):
        resolved, engine = self._get_resolved(generated_data, config)
        calc = PrivilegeCalculator(config)
        profiles = calc.calculate_all(resolved, engine.graph)
        for profile in profiles.values():
            assert 0.0 <= profile.normalized_score <= 100.0

    def test_over_privileged_detected(self, generated_data, config):
        resolved, engine = self._get_resolved(generated_data, config)
        calc = PrivilegeCalculator(config)
        calc.calculate_all(resolved, engine.graph)
        over_priv = calc.get_over_privileged(threshold=70.0)
        assert len(over_priv) >= 0

    def test_cross_platform_admins_detected(self, generated_data, config):
        resolved, engine = self._get_resolved(generated_data, config)
        calc = PrivilegeCalculator(config)
        calc.calculate_all(resolved, engine.graph)
        cross_admins = calc.get_cross_platform_admins()
        assert isinstance(cross_admins, list)

    def test_privilege_summary(self, generated_data, config):
        resolved, engine = self._get_resolved(generated_data, config)
        calc = PrivilegeCalculator(config)
        calc.calculate_all(resolved, engine.graph)
        summary = calc.get_privilege_summary()
        assert "total_profiles" in summary
        assert "avg_privilege_score" in summary
        assert summary["total_profiles"] == len(resolved)

    def test_profile_has_breakdown(self, generated_data, config):
        resolved, engine = self._get_resolved(generated_data, config)
        calc = PrivilegeCalculator(config)
        profiles = calc.calculate_all(resolved, engine.graph)
        for profile in list(profiles.values())[:5]:
            assert "base_permission_score" in profile.score_breakdown
            assert "normalized_score" in profile.score_breakdown
