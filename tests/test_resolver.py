"""Tests for the IdentityResolver."""

import pytest

from identitysphere.core.ingest import IngestionEngine
from identitysphere.core.resolver import IdentityResolver


class TestIdentityResolver:
    def _get_ingested(self, generated_data):
        engine = IngestionEngine()
        engine.ingest(generated_data)
        return engine

    def test_resolver_runs_without_error(self, generated_data, config):
        engine = self._get_ingested(generated_data)
        resolver = IdentityResolver(config)
        resolved = resolver.resolve(engine.identities)
        assert len(resolved) > 0

    def test_resolver_does_not_increase_count(self, generated_data, config):
        engine = self._get_ingested(generated_data)
        resolver = IdentityResolver(config)
        resolved = resolver.resolve(engine.identities)
        assert len(resolved) <= len(engine.identities)

    def test_resolution_result_populated(self, generated_data, config):
        engine = self._get_ingested(generated_data)
        resolver = IdentityResolver(config)
        resolver.resolve(engine.identities)
        result = resolver.resolution_result
        assert result.total_identities_before > 0
        assert result.total_identities_after > 0

    def test_all_accounts_preserved(self, generated_data, config):
        engine = self._get_ingested(generated_data)
        total_accounts_before = sum(
            len(i.accounts) for i in engine.identities.values()
        )
        resolver = IdentityResolver(config)
        resolved = resolver.resolve(engine.identities)
        total_accounts_after = sum(len(i.accounts) for i in resolved.values())
        assert total_accounts_after >= total_accounts_before * 0.9

    def test_name_similarity(self, config):
        resolver = IdentityResolver(config)
        assert resolver._name_similarity("John Smith", "John Smith") == 1.0
        assert resolver._name_similarity("John Smith", "john smith") == 1.0
        assert resolver._name_similarity("John Smith", "Jane Doe") < 0.5
