"""Tests for the SecurityCopilot."""

import pytest

from identitysphere.core.ingest import IngestionEngine
from identitysphere.core.resolver import IdentityResolver
from identitysphere.core.privilege import PrivilegeCalculator
from identitysphere.core.detectors import DetectionContext, DetectionEngine
from identitysphere.core.behavioral import BehavioralEngine
from identitysphere.core.scoring import ScoringEngine
from identitysphere.core.graph import AttackGraph
from identitysphere.core.blast_radius import BlastRadiusEngine
from identitysphere.core.copilot import SecurityCopilot


class TestSecurityCopilot:
    """Tests run in offline mode - no API keys required."""

    def _get_context(self, generated_data, config):
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

        scorer = ScoringEngine(config)
        scoring_result = scorer.score_all(resolved, profiles, beh_profiles, det_result.risk_events)

        ag = AttackGraph(engine.graph)
        blast_engine = BlastRadiusEngine(ag)

        events_by_id = {}
        for ev in det_result.risk_events:
            if ev.identity_id not in events_by_id:
                events_by_id[ev.identity_id] = []
            events_by_id[ev.identity_id].append(ev)

        top_iid = scorer.get_top_scores(1)[0].identity_id
        identity = resolved[top_iid]

        return {
            "identity": identity,
            "composite_score": scoring_result.scores[top_iid],
            "risk_events": events_by_id.get(top_iid, []),
            "privilege_profile": profiles.get(top_iid),
            "behavioral_profile": beh_profiles.get(top_iid),
            "blast_radius": blast_engine.compute(top_iid),
            "all_risk_events": det_result.risk_events,
            "attack_graph": ag,
            "resolved": resolved,
            "profiles": profiles,
        }

    # --- summarize_identity ---

    def test_summarize_identity(self, generated_data, config):
        ctx = self._get_context(generated_data, config)
        copilot = SecurityCopilot(config)
        result = copilot.summarize_identity(
            identity=ctx["identity"],
            composite_score=ctx["composite_score"],
            risk_events=ctx["risk_events"],
            privilege_profile=ctx["privilege_profile"],
            behavioral_profile=ctx["behavioral_profile"],
            blast_radius=ctx["blast_radius"],
        )
        assert isinstance(result, str)
        assert len(result) > 100
        assert ctx["identity"].display_name in result or ctx["identity"].identity_id in result

    def test_summarize_identity_minimal(self, generated_data, config):
        ctx = self._get_context(generated_data, config)
        copilot = SecurityCopilot(config)
        result = copilot.summarize_identity(identity=ctx["identity"])
        assert isinstance(result, str)
        assert len(result) > 50

    # --- generate_risk_narrative ---

    def test_generate_risk_narrative(self, generated_data, config):
        ctx = self._get_context(generated_data, config)
        copilot = SecurityCopilot(config)
        result = copilot.generate_risk_narrative(
            identity=ctx["identity"],
            composite_score=ctx["composite_score"],
            risk_events=ctx["risk_events"],
            privilege_profile=ctx["privilege_profile"],
            behavioral_profile=ctx["behavioral_profile"],
        )
        assert isinstance(result, str)
        assert len(result) > 100

    def test_risk_narrative_contains_evidence(self, generated_data, config):
        ctx = self._get_context(generated_data, config)
        copilot = SecurityCopilot(config)
        result = copilot.generate_risk_narrative(
            identity=ctx["identity"],
            composite_score=ctx["composite_score"],
            risk_events=ctx["risk_events"],
        )
        assert "IDENTITY" in result or ctx["identity"].identity_id in result

    # --- generate_remediation_plan ---

    def test_generate_remediation_plan(self, generated_data, config):
        ctx = self._get_context(generated_data, config)
        copilot = SecurityCopilot(config)
        result = copilot.generate_remediation_plan(
            identity=ctx["identity"],
            risk_events=ctx["risk_events"],
            privilege_profile=ctx["privilege_profile"],
        )
        assert isinstance(result, str)
        assert len(result) > 50

    def test_remediation_mentions_platform(self, generated_data, config):
        ctx = self._get_context(generated_data, config)
        copilot = SecurityCopilot(config)
        result = copilot.generate_remediation_plan(
            identity=ctx["identity"],
            risk_events=ctx["risk_events"],
        )
        platforms = {a.platform.value for a in ctx["identity"].accounts}
        found = any(p in result for p in platforms)
        assert found or "Platform" in result

    # --- explain_attack_path ---

    def test_explain_attack_path(self, generated_data, config):
        ctx = self._get_context(generated_data, config)
        ag = ctx["attack_graph"]
        admin_ids = [
            iid for iid, ident in ctx["resolved"].items()
            if any(a.is_admin for a in ident.accounts)
        ]
        if not admin_ids:
            pytest.skip("No admin identities")

        paths = ag.all_paths_to_admin(admin_ids[0], max_depth=5)
        if not paths:
            pytest.skip("No admin paths found")

        copilot = SecurityCopilot(config)
        result = copilot.explain_attack_path(path=paths[0])
        assert isinstance(result, str)
        assert len(result) > 50
        assert "->" in result or "path" in result.lower()

    def test_explain_attack_path_none(self, config):
        copilot = SecurityCopilot(config)
        result = copilot.explain_attack_path()
        assert "No attack path" in result

    # --- explain_blast_radius ---

    def test_explain_blast_radius(self, generated_data, config):
        ctx = self._get_context(generated_data, config)
        copilot = SecurityCopilot(config)
        result = copilot.explain_blast_radius(ctx["blast_radius"])
        assert isinstance(result, str)
        assert len(result) > 50
        assert "resource" in result.lower() or "blast" in result.lower()

    def test_explain_blast_radius_with_whatif(self, generated_data, config):
        ctx = self._get_context(generated_data, config)
        ag = ctx["attack_graph"]
        blast_engine = BlastRadiusEngine(ag)
        identity = ctx["identity"]
        whatif = blast_engine.simulate_compromise(identity.identity_id)

        copilot = SecurityCopilot(config)
        result = copilot.explain_blast_radius(ctx["blast_radius"], whatif=whatif)
        assert isinstance(result, str)
        assert "compromise" in result.lower() or "simulation" in result.lower() or "What-If" in result

    # --- summarize_compliance_impact ---

    def test_summarize_compliance_impact(self, generated_data, config):
        ctx = self._get_context(generated_data, config)
        copilot = SecurityCopilot(config)
        result = copilot.summarize_compliance_impact(ctx["all_risk_events"])
        assert isinstance(result, str)
        assert "NIST" in result or "nist" in result
        assert "MITRE" in result or "mitre" in result or "T1078" in result

    def test_compliance_impact_contains_all_frameworks(self, generated_data, config):
        ctx = self._get_context(generated_data, config)
        copilot = SecurityCopilot(config)
        result = copilot.summarize_compliance_impact(ctx["all_risk_events"])
        for framework in ["NIST", "CIS"]:
            assert framework in result.upper(), f"Missing {framework} in compliance summary"

    # --- LLM call tracking ---

    def test_copilot_tracks_llm_calls(self, generated_data, config):
        ctx = self._get_context(generated_data, config)
        copilot = SecurityCopilot(config)
        assert copilot.llm.call_count == 0
        copilot.summarize_identity(identity=ctx["identity"])
        assert copilot.llm.call_count == 1
        copilot.generate_risk_narrative(identity=ctx["identity"])
        assert copilot.llm.call_count == 2
