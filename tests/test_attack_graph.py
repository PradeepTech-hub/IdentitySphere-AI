"""Tests for the AttackGraph."""

import pytest

from identitysphere.core.ingest import IngestionEngine
from identitysphere.core.graph import AttackGraph


class TestAttackGraph:
    def _get_attack_graph(self, generated_data):
        engine = IngestionEngine()
        engine.ingest(generated_data)
        return AttackGraph(engine.graph), engine

    def test_enrichment_adds_resource_nodes(self, generated_data):
        ag, _ = self._get_attack_graph(generated_data)
        stats = ag.stats
        assert stats["node_types"].get("resource", 0) > 0

    def test_enrichment_adds_bridge_edges(self, generated_data):
        ag, _ = self._get_attack_graph(generated_data)
        stats = ag.stats
        assert stats["edge_types"].get("bridges", 0) > 0

    def test_enrichment_adds_accesses_edges(self, generated_data):
        ag, _ = self._get_attack_graph(generated_data)
        stats = ag.stats
        assert stats["edge_types"].get("accesses", 0) > 0

    def test_admin_targets_found(self, generated_data):
        ag, _ = self._get_attack_graph(generated_data)
        assert len(ag.get_admin_targets()) > 0

    def test_all_resources_listed(self, generated_data):
        ag, _ = self._get_attack_graph(generated_data)
        resources = ag.get_all_resources()
        assert len(resources) > 0
        for r in resources:
            assert "platform" in r
            assert "resource_name" in r

    def test_shortest_path_exists(self, generated_data):
        ag, engine = self._get_attack_graph(generated_data)
        admin_targets = list(ag.get_admin_targets())
        if not admin_targets:
            pytest.skip("No admin targets in graph")
        admin_identities = [
            iid for iid, ident in engine.identities.items()
            if any(a.is_admin for a in ident.accounts)
        ]
        candidates = admin_identities or list(engine.identities.keys())[:50]
        found = False
        for iid in candidates:
            for target in admin_targets:
                path = ag.shortest_privilege_path(iid, target)
                if path:
                    assert path.path_length > 0
                    assert len(path.path_nodes) >= 2
                    found = True
                    break
            if found:
                break
        assert found, "No shortest path found for any admin identity to any admin target"

    def test_shortest_path_nonexistent_returns_none(self, generated_data):
        ag, _ = self._get_attack_graph(generated_data)
        result = ag.shortest_privilege_path("NONEXISTENT", "resource:fake:fake")
        assert result is None

    def test_all_paths_to_admin(self, generated_data):
        ag, engine = self._get_attack_graph(generated_data)
        admin_identities = [
            iid for iid, ident in engine.identities.items()
            if any(a.is_admin for a in ident.accounts)
        ]
        if not admin_identities:
            pytest.skip("No admin identities")
        paths = ag.all_paths_to_admin(admin_identities[0], max_depth=6)
        assert len(paths) > 0
        for path in paths[:5]:
            assert path.path_length > 0
            assert path.privilege_level is not None

    def test_cross_platform_escalation(self, generated_data):
        ag, engine = self._get_attack_graph(generated_data)
        multi_plat = [
            iid for iid, ident in engine.identities.items()
            if len(ident.accounts) >= 2 and any(a.is_admin for a in ident.accounts)
        ]
        if not multi_plat:
            pytest.skip("No multi-platform admin identities")
        chains = ag.cross_platform_escalation_paths(multi_plat[0], max_depth=5)
        for chain in chains:
            assert chain.path.is_cross_platform
            assert chain.risk_level in ("high", "critical")

    def test_resource_reachability(self, generated_data):
        ag, engine = self._get_attack_graph(generated_data)
        iid = list(engine.identities.keys())[0]
        reach = ag.resource_reachability(iid)
        assert "reachable_resources" in reach
        assert "reachable_resource_count" in reach
        assert "reachable_permission_count" in reach
        assert "platforms_reached" in reach

    def test_resource_reachability_nonexistent(self, generated_data):
        ag, _ = self._get_attack_graph(generated_data)
        reach = ag.resource_reachability("NONEXISTENT")
        assert reach["reachable_resource_count"] == 0

    def test_find_paths_between(self, generated_data):
        ag, engine = self._get_attack_graph(generated_data)
        iid = list(engine.identities.keys())[0]
        resources = ag.get_all_resources()
        if not resources:
            pytest.skip("No resources in graph")
        source = f"identity:{iid}"
        target = resources[0]["node"]
        paths = ag.find_paths_between(source, target, max_depth=6)
        # May or may not find paths depending on graph connectivity
        assert isinstance(paths, list)

    def test_attack_path_description(self, generated_data):
        ag, engine = self._get_attack_graph(generated_data)
        admin_ids = [
            iid for iid, ident in engine.identities.items()
            if any(a.is_admin for a in ident.accounts)
        ]
        if not admin_ids:
            pytest.skip("No admin identities")
        paths = ag.all_paths_to_admin(admin_ids[0], max_depth=6)
        if not paths:
            pytest.skip("No admin paths found")
        assert " -> " in paths[0].description

    def test_stats_complete(self, generated_data):
        ag, _ = self._get_attack_graph(generated_data)
        stats = ag.stats
        assert "total_nodes" in stats
        assert "total_edges" in stats
        assert "node_types" in stats
        assert "edge_types" in stats
        assert "admin_targets" in stats
        assert "total_resources" in stats
