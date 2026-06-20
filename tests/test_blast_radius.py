"""Tests for the BlastRadiusEngine."""

import pytest

from identitysphere.core.ingest import IngestionEngine
from identitysphere.core.graph import AttackGraph
from identitysphere.core.blast_radius import BlastRadiusEngine


class TestBlastRadiusEngine:
    def _get_engine(self, generated_data):
        ingest = IngestionEngine()
        ingest.ingest(generated_data)
        ag = AttackGraph(ingest.graph)
        return BlastRadiusEngine(ag), ingest, ag

    def _admin_identity(self, ingest):
        for iid, ident in ingest.identities.items():
            if any(a.is_admin for a in ident.accounts) and len(ident.accounts) >= 2:
                return iid
        for iid, ident in ingest.identities.items():
            if any(a.is_admin for a in ident.accounts):
                return iid
        return list(ingest.identities.keys())[0]

    # --- Blast Radius ---

    def test_compute_returns_blast_radius(self, generated_data):
        engine, ingest, _ = self._get_engine(generated_data)
        iid = self._admin_identity(ingest)
        br = engine.compute(iid)
        assert br.identity_id == iid
        assert br.severity in ("low", "medium", "high", "critical")

    def test_blast_radius_has_resources(self, generated_data):
        engine, ingest, _ = self._get_engine(generated_data)
        iid = self._admin_identity(ingest)
        br = engine.compute(iid)
        assert br.reachable_resource_count >= 0
        assert br.reachable_permission_count >= 0

    def test_severity_assignment(self, generated_data):
        engine, ingest, _ = self._get_engine(generated_data)
        iid = self._admin_identity(ingest)
        br = engine.compute(iid)
        if br.reachable_resource_count >= 15:
            assert br.severity in ("critical", "high")
        elif br.reachable_resource_count < 3:
            assert br.severity == "low"

    def test_compute_all(self, generated_data):
        engine, ingest, _ = self._get_engine(generated_data)
        ids = list(ingest.identities.keys())[:5]
        results = engine.compute_all(ids)
        assert len(results) == 5

    def test_score_breakdown_present(self, generated_data):
        engine, ingest, _ = self._get_engine(generated_data)
        iid = self._admin_identity(ingest)
        br = engine.compute(iid)
        assert "total_resources" in br.score_breakdown
        assert "admin_resources" in br.score_breakdown
        assert "admin_platforms" in br.score_breakdown

    def test_resource_by_platform(self, generated_data):
        engine, ingest, _ = self._get_engine(generated_data)
        iid = self._admin_identity(ingest)
        br = engine.compute(iid)
        total_from_platforms = sum(br.resource_by_platform.values())
        assert total_from_platforms == br.reachable_resource_count

    # --- What-If: Compromise ---

    def test_simulate_compromise(self, generated_data):
        engine, ingest, _ = self._get_engine(generated_data)
        iid = self._admin_identity(ingest)
        result = engine.simulate_compromise(iid)
        assert result.simulation_type == "identity_compromised"
        assert result.original.reachable_resource_count == 0
        assert result.simulated.reachable_resource_count >= 0
        assert result.explanation != ""

    # --- What-If: Group Removal ---

    def test_simulate_group_removal(self, generated_data):
        engine, ingest, _ = self._get_engine(generated_data)
        iid = self._admin_identity(ingest)
        identity = ingest.identities[iid]
        group_node = None
        for acct in identity.accounts:
            if acct.groups:
                group_node = f"group:{acct.platform.value}:{acct.groups[0]}"
                break
        if not group_node:
            pytest.skip("No group memberships to simulate removal")
        result = engine.simulate_group_removal(iid, group_node)
        assert result.simulation_type == "group_removal"
        assert result.original.reachable_resource_count >= result.simulated.reachable_resource_count
        assert 0.0 <= result.risk_reduction_pct <= 100.0
        assert result.severity_change != ""

    def test_group_removal_reduces_or_maintains(self, generated_data):
        engine, ingest, _ = self._get_engine(generated_data)
        iid = self._admin_identity(ingest)
        identity = ingest.identities[iid]
        for acct in identity.accounts:
            if acct.groups:
                group_node = f"group:{acct.platform.value}:{acct.groups[0]}"
                result = engine.simulate_group_removal(iid, group_node)
                assert result.simulated.reachable_resource_count <= result.original.reachable_resource_count
                return
        pytest.skip("No groups to test")

    # --- What-If: Role Revocation ---

    def test_simulate_role_revocation(self, generated_data):
        engine, ingest, ag = self._get_engine(generated_data)
        iid = self._admin_identity(ingest)
        identity = ingest.identities[iid]
        role_node = None
        for acct in identity.accounts:
            if acct.roles:
                from identitysphere.models.access import Role
                for role in ingest.roles.values():
                    if role.platform == acct.platform and role.name in acct.roles:
                        role_node = f"role:{role.platform.value}:{role.role_id}"
                        break
            if role_node:
                break
        if not role_node:
            pytest.skip("No role assignments to simulate revocation")
        result = engine.simulate_role_revocation(iid, role_node)
        assert result.simulation_type == "role_revocation"
        assert result.original.reachable_resource_count >= result.simulated.reachable_resource_count
        assert 0.0 <= result.risk_reduction_pct <= 100.0

    # --- What-If: Resources Removed ---

    def test_whatif_resources_removed_tracked(self, generated_data):
        engine, ingest, _ = self._get_engine(generated_data)
        iid = self._admin_identity(ingest)
        identity = ingest.identities[iid]
        for acct in identity.accounts:
            if acct.groups:
                group_node = f"group:{acct.platform.value}:{acct.groups[0]}"
                result = engine.simulate_group_removal(iid, group_node)
                assert isinstance(result.resources_removed, list)
                for r in result.resources_removed:
                    assert "node" in r
                    assert "platform" in r
                return
        pytest.skip("No groups to test")

    # --- Formatting ---

    def test_format_blast_radius(self, generated_data):
        engine, ingest, _ = self._get_engine(generated_data)
        iid = self._admin_identity(ingest)
        br = engine.compute(iid)
        text = engine.format_blast_radius(br)
        assert "Blast Radius:" in text
        assert "Severity:" in text
        assert "Reachable Resources:" in text

    def test_format_whatif(self, generated_data):
        engine, ingest, _ = self._get_engine(generated_data)
        iid = self._admin_identity(ingest)
        result = engine.simulate_compromise(iid)
        text = engine.format_whatif(result)
        assert "What-If:" in text
        assert "Risk Reduction:" in text
        assert "Severity Change:" in text

    # --- Edge cases ---

    def test_nonexistent_identity(self, generated_data):
        engine, _, _ = self._get_engine(generated_data)
        br = engine.compute("NONEXISTENT")
        assert br.reachable_resource_count == 0
        assert br.severity == "low"
