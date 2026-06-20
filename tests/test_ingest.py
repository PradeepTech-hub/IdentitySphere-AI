"""Tests for the IngestionEngine."""

import pytest

from identitysphere.core.ingest import IngestionEngine
from identitysphere.models.identity import Platform


class TestIngestionEngine:
    def test_ingest_loads_identities(self, generated_data):
        engine = IngestionEngine()
        engine.ingest(generated_data)
        assert engine.is_ready
        assert len(engine.identities) > 200

    def test_ingest_builds_graph(self, generated_data):
        engine = IngestionEngine()
        engine.ingest(generated_data)
        stats = engine.graph.stats
        assert stats["total_nodes"] > 0
        assert stats["total_edges"] > 0
        assert stats.get("identity", 0) > 0
        assert stats.get("account", 0) > 0

    def test_ingest_indexes_audit_events(self, generated_data):
        engine = IngestionEngine()
        engine.ingest(generated_data)
        assert len(engine.audit_events) > 0
        identities_with_events = len(engine.audit_events_by_identity)
        assert identities_with_events > 0

    def test_ingest_loads_offboarding(self, generated_data):
        engine = IngestionEngine()
        engine.ingest(generated_data)
        assert len(engine.offboarding_records) > 0
        assert len(engine.offboarding_by_identity) > 0

    def test_platform_summary(self, generated_data):
        engine = IngestionEngine()
        engine.ingest(generated_data)
        summary = engine.get_platform_summary()
        assert len(summary) > 0
        for platform, counts in summary.items():
            assert counts["total"] > 0

    def test_ingest_groups_roles_permissions(self, generated_data):
        engine = IngestionEngine()
        engine.ingest(generated_data)
        assert len(engine.groups) > 0
        assert len(engine.roles) > 0
        assert len(engine.permissions) > 0

    def test_graph_has_all_node_types(self, generated_data):
        engine = IngestionEngine()
        engine.ingest(generated_data)
        stats = engine.graph.stats
        for node_type in ["identity", "account", "group", "role", "permission"]:
            assert stats.get(node_type, 0) > 0, f"Missing node type: {node_type}"
