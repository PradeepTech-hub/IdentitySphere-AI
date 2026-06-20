"""IdentitySphere Pipeline — orchestrates the full Phase 1 detection flow.

Pipeline stages:
  1. GENERATE  — produce synthetic multi-platform identity dataset
  2. INGEST    — normalize and load data into unified store + graph
  3. RESOLVE   — cross-platform identity deduplication
  4. PRIVILEGE  — compute effective privilege via graph traversal
  5. DETECT    — run all detectors (rules + ML) and produce scored risk events
  6. REPORT    — output summary + top risky identities with remediation

Each stage's output feeds the next. The pipeline can be run end-to-end or
stage-by-stage for testing.
"""

from __future__ import annotations

import json
import logging
import os
import time
from datetime import datetime
from pathlib import Path
from typing import Any

import yaml

from identitysphere.generators.synthetic import SyntheticDataGenerator
from identitysphere.core.ingest import IngestionEngine
from identitysphere.core.resolver import IdentityResolver
from identitysphere.core.privilege import PrivilegeCalculator
from identitysphere.core.detectors import DetectionContext, DetectionEngine
from identitysphere.core.behavioral import BehavioralEngine
from identitysphere.core.scoring import ScoringEngine
from identitysphere.core.graph import AttackGraph
from identitysphere.core.blast_radius import BlastRadiusEngine
from identitysphere.core.export import DatasetExporter
from identitysphere.core.duplicate_injector import inject_cross_platform_duplicates
from identitysphere.core.incidents import IncidentClusterEngine
from identitysphere.core.export_api_artifacts import ApiArtifactExporter
from identitysphere.models.events import RiskEvent
from identitysphere.utils.logging_config import setup_logging

logger = logging.getLogger("identitysphere.pipeline")


class IdentitySpherePipeline:
    """End-to-end orchestrator for Phase 1: ingest -> resolve -> privilege -> detect."""

    def __init__(self, config_path: str | None = None) -> None:
        self.config = self._load_config(config_path)
        self.log_level = self.config.get("output", {}).get("log_level", "INFO")
        setup_logging(self.log_level)

        self.generator = SyntheticDataGenerator(self.config)
        self.ingest_engine = IngestionEngine()
        self.resolver = IdentityResolver(self.config)
        self.privilege_calc = PrivilegeCalculator(self.config)
        self.detection_engine = DetectionEngine(self.config)
        self.behavioral_engine = BehavioralEngine(self.config)
        self.scoring_engine = ScoringEngine(self.config)

        self.raw_data: dict[str, Any] = {}
        self.run_metrics: dict[str, Any] = {}

    def _load_config(self, config_path: str | None) -> dict[str, Any]:
        if config_path and os.path.exists(config_path):
            with open(config_path, "r") as f:
                return yaml.safe_load(f)

        default_paths = [
            "identitysphere/config/settings.yaml",
            "config/settings.yaml",
        ]
        for path in default_paths:
            if os.path.exists(path):
                with open(path, "r") as f:
                    return yaml.safe_load(f)

        logger.warning("No config file found, using defaults")
        return {}

    def run(self) -> dict[str, Any]:
        """Execute the full pipeline and return a structured report."""
        pipeline_start = time.time()
        logger.info("=" * 70)
        logger.info("IdentitySphere AI - Phase 1+2+3 Pipeline")
        logger.info("=" * 70)

        # Stage 1: Generate
        stage_start = time.time()
        logger.info("[1/9] Generating synthetic identity data...")
        self.raw_data = self.generator.generate_all()
        anomaly_dist = self.generator.get_anomaly_distribution()
        self.run_metrics["generate_time"] = time.time() - stage_start
        logger.info("  Generated %d identities. Anomaly distribution: %s",
                     len(self.raw_data["identities"]), anomaly_dist)

        # Export datasets
        export_dir = self.config.get("output", {}).get("data_dir", "identitysphere/data/generated")
        exporter = DatasetExporter(export_dir)
        export_result = exporter.export_all(
            identities=self.raw_data["identities"],
            groups=self.raw_data["groups"],
            roles=self.raw_data["roles"],
            permissions=self.raw_data["permissions"],
            group_memberships=self.raw_data["group_memberships"],
            role_assignments=self.raw_data["role_assignments"],
            audit_events=self.raw_data["audit_events"],
            offboarding_records=self.raw_data["offboarding_records"],
            anomaly_labels=self.raw_data["anomaly_labels"],
        )
        validation = exporter.validate()
        logger.info("  Exported %d dataset files (all valid: %s)",
                     len(export_result), validation["valid"])

        # Stage 2: Ingest
        stage_start = time.time()
        logger.info("[2/9] Ingesting and normalizing data...")
        self.ingest_engine.ingest(self.raw_data)
        self.run_metrics["ingest_time"] = time.time() - stage_start
        logger.info("  Graph stats: %s", self.ingest_engine.graph.stats)

        # Stage 3: Resolve
        stage_start = time.time()
        logger.info("[3/9] Resolving cross-platform identities...")
        identities_for_resolve = inject_cross_platform_duplicates(
            self.ingest_engine.identities, config=self.config
        )
        resolved = self.resolver.resolve(identities_for_resolve)
        self.run_metrics["resolve_time"] = time.time() - stage_start
        logger.info("  Resolution result: %d -> %d identities",
                     self.resolver.resolution_result.total_identities_before,
                     self.resolver.resolution_result.total_identities_after)

        # Stage 4: Privilege Calculation
        stage_start = time.time()
        logger.info("[4/9] Calculating effective privileges...")
        profiles = self.privilege_calc.calculate_all(resolved, self.ingest_engine.graph)
        self.run_metrics["privilege_time"] = time.time() - stage_start
        priv_summary = self.privilege_calc.get_privilege_summary()
        logger.info("  Privilege summary: %s", priv_summary)

        # Stage 5: Detection
        stage_start = time.time()
        logger.info("[5/9] Running detection engine...")
        ctx = DetectionContext(
            identities=resolved,
            privilege_profiles=profiles,
            audit_events_by_identity=self.ingest_engine.audit_events_by_identity,
            offboarding_by_identity=self.ingest_engine.offboarding_by_identity,
            anomaly_labels=self.raw_data.get("anomaly_labels", {}),
        )
        detection_result = self.detection_engine.detect_all(ctx)
        self.run_metrics["detect_time"] = time.time() - stage_start

        # Stage 6: Behavioral Analysis (Phase 2)
        stage_start = time.time()
        logger.info("[6/9] Running behavioral analysis...")
        priv_scores = {iid: p.normalized_score for iid, p in profiles.items()}
        behavioral_profiles = self.behavioral_engine.analyze(
            resolved,
            self.ingest_engine.audit_events_by_identity,
            priv_scores,
        )
        self.run_metrics["behavioral_time"] = time.time() - stage_start
        beh_summary = self.behavioral_engine.get_summary()
        logger.info("  Behavioral: %d profiled, %d anomalous, avg score %.1f",
                     beh_summary["total_profiled"],
                     beh_summary["anomalous_count"],
                     beh_summary["avg_anomaly_score"])

        # Stage 7: Composite Risk Scoring (Phase 2)
        stage_start = time.time()
        logger.info("[7/9] Computing composite risk scores...")
        scoring_result = self.scoring_engine.score_all(
            resolved, profiles, behavioral_profiles, detection_result.risk_events,
        )
        self.run_metrics["scoring_time"] = time.time() - stage_start
        scoring_summary = self.scoring_engine.get_summary()
        logger.info("  Scoring: avg=%.1f, consolidation: %d raw -> %d incidents (%.1f%% reduction)",
                     scoring_summary["avg_composite_score"],
                     scoring_summary["consolidation"]["raw_signals_count"],
                     scoring_summary["consolidation"]["consolidated_incidents_count"],
                     scoring_summary["consolidation"]["reduction_percentage"])

        # Stage 8: Attack Graph Construction (Phase 3)
        stage_start = time.time()
        logger.info("[8/9] Building identity attack graph...")
        attack_graph = AttackGraph(self.ingest_engine.graph)
        self.run_metrics["attack_graph_time"] = time.time() - stage_start
        ag_stats = attack_graph.stats
        logger.info("  Attack graph: %d nodes, %d edges, %d resources, %d admin targets",
                     ag_stats["total_nodes"], ag_stats["total_edges"],
                     ag_stats["total_resources"], ag_stats["admin_targets"])

        # Stage 9: Blast Radius Analysis (Phase 3)
        stage_start = time.time()
        logger.info("[9/9] Computing blast radius for top-risk identities...")
        blast_engine = BlastRadiusEngine(attack_graph)
        top_score_ids = [s.identity_id for s in self.scoring_engine.get_top_scores(10)]
        blast_radii = blast_engine.compute_all(top_score_ids)

        whatif_sample = None
        if top_score_ids:
            sample_id = top_score_ids[0]
            sample_identity = resolved.get(sample_id)
            if sample_identity and sample_identity.accounts:
                sample_acct = sample_identity.accounts[0]
                group_nodes = [
                    f"group:{sample_acct.platform.value}:{gid}"
                    for gid in sample_acct.groups[:1]
                ]
                if group_nodes:
                    whatif_sample = blast_engine.simulate_group_removal(
                        sample_id, group_nodes[0]
                    )

        self.run_metrics["blast_radius_time"] = time.time() - stage_start
        sev_counts = {}
        for br in blast_radii.values():
            sev_counts[br.severity] = sev_counts.get(br.severity, 0) + 1
        logger.info("  Blast radius: %d assessed, severity dist: %s", len(blast_radii), sev_counts)

        # Stage 10: Incident clustering (DBSCAN)
        stage_start = time.time()
        logger.info("[10/10] Clustering incidents with DBSCAN...")
        incident_engine = IncidentClusterEngine(self.config)
        incident_clusters = incident_engine.cluster(
            detection_result.risk_events, scoring_result, resolved
        )
        self.run_metrics["incident_cluster_time"] = time.time() - stage_start

        api_exporter = ApiArtifactExporter(export_dir)
        api_exporter.export_all(
            detection_result.risk_events,
            scoring_result,
            incident_clusters,
            resolved,
            attack_graph,
            blast_radii,
        )

        self.run_metrics["total_time"] = time.time() - pipeline_start

        report = self._build_report(
            resolved, profiles, detection_result, anomaly_dist,
            behavioral_profiles, scoring_result,
            attack_graph, blast_radii, whatif_sample,
            incident_clusters,
        )

        self._print_report(report)
        self._save_report(report)

        from identitysphere.core.risk_report import write_risk_report_html, write_risk_report_json
        output_dir = self.config.get("output", {}).get("data_dir", "identitysphere/data/generated")
        write_risk_report_html(report, os.path.join(output_dir, "risk_report.html"))
        write_risk_report_json(report, os.path.join(output_dir, "risk_report.json"))
        logger.info("Risk report exported to %s/risk_report.html", output_dir)

        return report

    def _build_report(
        self,
        resolved: dict,
        profiles: dict,
        detection_result: Any,
        anomaly_dist: dict,
        behavioral_profiles: dict | None = None,
        scoring_result: Any | None = None,
        attack_graph: Any | None = None,
        blast_radii: dict | None = None,
        whatif_sample: Any | None = None,
        incident_clusters: list | None = None,
    ) -> dict[str, Any]:
        top_risks = self._get_top_unique_risks(detection_result.risk_events, 10)
        risks_by_type = self.detection_engine.get_risks_by_type()

        coverage = len(profiles) / max(len(resolved), 1)
        total_rule_alerts = sum(len(v) for v in risks_by_type.values())
        unique_risk_identities = len({e.identity_id for e in detection_result.risk_events})

        scoring_summary = self.scoring_engine.get_summary() if scoring_result else {}
        consolidation = scoring_summary.get("consolidation", {})

        report = {
            "metadata": {
                "product": "IdentitySphere AI",
                "version": "0.3.0",
                "phase": "1+2+3",
                "run_timestamp": datetime.utcnow().isoformat(),
                "pipeline_duration_seconds": round(self.run_metrics.get("total_time", 0), 2),
            },
            "data_summary": {
                "total_identities": len(resolved),
                "platforms_covered": len(self.ingest_engine.accounts_by_platform),
                "platform_breakdown": self.ingest_engine.get_platform_summary(),
                "total_groups": len(self.ingest_engine.groups),
                "total_roles": len(self.ingest_engine.roles),
                "total_permissions": len(self.ingest_engine.permissions),
                "total_audit_events": len(self.ingest_engine.audit_events),
                "total_offboarding_records": len(self.ingest_engine.offboarding_records),
                "graph_stats": self.ingest_engine.graph.stats,
                "anomaly_distribution": anomaly_dist,
            },
            "resolution_summary": {
                "identities_before": self.resolver.resolution_result.total_identities_before,
                "identities_after": self.resolver.resolution_result.total_identities_after,
                "merges_performed": self.resolver.resolution_result.merges_performed,
                "candidates_evaluated": self.resolver.resolution_result.candidates_evaluated,
                "avg_confidence": round(self.resolver.resolution_result.avg_confidence, 3),
            },
            "privilege_summary": self.privilege_calc.get_privilege_summary(),
            "detection_summary": {
                "total_risk_events": len(detection_result.risk_events),
                "identities_with_risks": detection_result.identities_with_risks,
                "risk_distribution": detection_result.risk_distribution,
                "severity_distribution": detection_result.severity_distribution,
                "detection_accuracy": detection_result.detection_accuracy,
            },
            "behavioral_summary": self.behavioral_engine.get_summary() if behavioral_profiles else {},
            "scoring_summary": scoring_summary,
            "alert_consolidation": {
                "raw_signals_count": consolidation.get("raw_signals_count", total_rule_alerts),
                "consolidated_incidents_count": consolidation.get("consolidated_incidents_count", unique_risk_identities),
                "reduction_percentage": consolidation.get("reduction_percentage", 0.0),
                "identities_suppressed": consolidation.get("identities_suppressed", 0),
                "suppression_rate": consolidation.get("suppression_rate", 0.0),
            },
            "attack_graph_stats": attack_graph.stats if attack_graph else {},
            "blast_radius_summary": self._build_blast_radius_summary(blast_radii, whatif_sample),
            "success_metrics": {
                "identity_coverage": f"{coverage * 100:.1f}%",
                "identity_coverage_met": coverage >= 0.95,
                "risk_scenarios_detected": len(risks_by_type),
                "alert_consolidation_ratio": (
                    f"{consolidation.get('reduction_percentage', 0.0):.1f}%"
                    if consolidation
                    else (
                        f"{(1 - unique_risk_identities / max(total_rule_alerts, 1)) * 100:.1f}%"
                        if total_rule_alerts > 0
                        else "N/A"
                    )
                ),
                "risk_explainability": "All scores expose factor contributions and suppression audit trail",
            },
            "top_risky_identities": (
                self._format_top_composite_scores(scoring_result, resolved)
                if scoring_result
                else [self._format_risk_event(e, resolved) for e in top_risks]
            ),
            "compliance_mapping": self._build_compliance_mapping(risks_by_type),
            "incident_clusters": IncidentClusterEngine().to_dict_list(incident_clusters or []),
            "timing": self.run_metrics,
        }
        return report

    def _get_top_unique_risks(
        self, risk_events: list[RiskEvent], n: int
    ) -> list[RiskEvent]:
        """Return the highest-scoring risk event per identity, up to n distinct identities."""
        seen: set[str] = set()
        result: list[RiskEvent] = []
        for event in sorted(risk_events, key=lambda e: e.score, reverse=True):
            if event.identity_id not in seen:
                seen.add(event.identity_id)
                result.append(event)
                if len(result) >= n:
                    break
        return result

    def _format_top_composite_scores(
        self, scoring_result: Any, identities: dict
    ) -> list[dict[str, Any]]:
        """Format top 10 composite scores for the report."""
        top_scores = self.scoring_engine.get_top_scores(10)
        formatted = []
        for score in top_scores:
            identity = identities.get(score.identity_id)
            formatted.append({
                "identity_id": score.identity_id,
                "display_name": score.display_name,
                "department": score.department,
                "risk_type": "composite",
                "severity": score.severity,
                "score": score.final_score,
                "raw_score": score.raw_score,
                "suppression_multiplier": score.suppression_multiplier,
                "title": f"Composite risk: {score.display_name} ({score.severity.upper()} - {score.final_score}/100)",
                "factors": {f.name: f.weighted_value for f in score.factors},
                "suppressions_applied": [s.rule for s in score.suppressions],
                "affected_platforms": (
                    [a.platform.value for a in identity.accounts] if identity else []
                ),
                "remediation_steps": self._derive_remediation(score),
                "compliance_refs": ["NIST AC-2", "NIST AC-6", "CIS 5", "CIS 6"],
                "evidence_count": score.detector_findings_count,
            })
        return formatted

    def _derive_remediation(self, score: Any) -> list[str]:
        """Derive remediation steps from composite score factors."""
        steps = []
        for f in score.factors:
            if f.name == "privilege_breadth" and f.raw_value > 70:
                steps.append("Conduct privilege access review and remove unnecessary permissions")
            elif f.name == "cross_platform_exposure" and f.raw_value > 40:
                steps.append("Review cross-platform admin necessity; implement JIT access")
            elif f.name == "dormancy" and f.raw_value > 50:
                steps.append("Investigate dormant account; disable if no longer needed")
            elif f.name == "detector_severity" and f.raw_value >= 75:
                steps.append("Address critical/high detector findings immediately")
            elif f.name == "behavioral_anomaly" and f.raw_value > 65:
                steps.append("Investigate anomalous behavioral pattern; verify account ownership")
        if not steps:
            steps.append("Monitor identity for continued risk indicators")
        return steps

    def _format_risk_event(
        self, event: RiskEvent, identities: dict
    ) -> dict[str, Any]:
        identity = identities.get(event.identity_id)
        return {
            "identity_id": event.identity_id,
            "display_name": identity.display_name if identity else "Unknown",
            "department": identity.department if identity else "Unknown",
            "risk_type": event.risk_type,
            "severity": event.severity.value,
            "score": round(event.score, 2),
            "title": event.title,
            "description": event.description,
            "affected_platforms": [p.value for p in event.affected_platforms],
            "remediation_steps": event.remediation_steps,
            "compliance_refs": event.compliance_refs,
            "evidence_count": len(event.evidence),
        }

    def _build_blast_radius_summary(
        self, blast_radii: dict | None, whatif_sample: Any | None
    ) -> dict[str, Any]:
        if not blast_radii:
            return {}
        radii_list = []
        for br in blast_radii.values():
            radii_list.append({
                "identity_id": br.identity_id,
                "display_name": br.display_name,
                "severity": br.severity,
                "reachable_resources": br.reachable_resource_count,
                "reachable_permissions": br.reachable_permission_count,
                "reachable_admin_roles": br.reachable_admin_role_count,
                "impacted_platforms": br.impacted_platforms,
                "resource_by_platform": br.resource_by_platform,
                "admin_resource_count": len(br.admin_resources),
            })
        sev_dist: dict[str, int] = {}
        for br in blast_radii.values():
            sev_dist[br.severity] = sev_dist.get(br.severity, 0) + 1

        summary: dict[str, Any] = {
            "assessed_count": len(blast_radii),
            "severity_distribution": sev_dist,
            "top_blast_radii": sorted(
                radii_list, key=lambda r: r["reachable_resources"], reverse=True
            ),
        }
        if whatif_sample:
            summary["whatif_example"] = {
                "simulation_type": whatif_sample.simulation_type,
                "description": whatif_sample.description,
                "identity_id": whatif_sample.identity_id,
                "original_resources": whatif_sample.original.reachable_resource_count,
                "simulated_resources": whatif_sample.simulated.reachable_resource_count,
                "risk_reduction_pct": whatif_sample.risk_reduction_pct,
                "resources_removed_count": len(whatif_sample.resources_removed),
                "severity_change": whatif_sample.severity_change,
                "explanation": whatif_sample.explanation,
            }
        return summary

    def _build_compliance_mapping(
        self, risks_by_type: dict[str, list]
    ) -> list[dict[str, Any]]:
        mapping_table = [
            {
                "capability": "Orphaned Account Detection",
                "risk_type": "orphaned_account",
                "nist_800_53": "AC-2",
                "mitre_attack": "T1078",
                "gdpr": "Art. 5",
                "cis": "5",
                "findings_count": len(risks_by_type.get("orphaned_account", [])),
            },
            {
                "capability": "Effective Privilege Calculator",
                "risk_type": "over_privileged",
                "nist_800_53": "AC-6",
                "mitre_attack": "T1098",
                "gdpr": "Art. 5",
                "cis": "6",
                "findings_count": len(risks_by_type.get("over_privileged", [])),
            },
            {
                "capability": "Cross-Platform Identity Resolver",
                "risk_type": "cross_platform_admin",
                "nist_800_53": "IA-4, AC-6",
                "mitre_attack": "T1078",
                "gdpr": "Art. 32",
                "cis": "5, 6",
                "findings_count": len(risks_by_type.get("cross_platform_admin", [])),
            },
            {
                "capability": "Token/Credential Abuse Detection",
                "risk_type": "token_abuse",
                "nist_800_53": "AC-2, IA-4",
                "mitre_attack": "T1550",
                "gdpr": "Art. 32",
                "cis": "6",
                "findings_count": len(risks_by_type.get("token_abuse", [])),
            },
            {
                "capability": "Privilege Escalation Detection",
                "risk_type": "privilege_escalation",
                "nist_800_53": "AC-2, AC-6",
                "mitre_attack": "T1098",
                "gdpr": "Art. 32",
                "cis": "5, 6",
                "findings_count": len(risks_by_type.get("privilege_escalation", [])),
            },
            {
                "capability": "Offboarding Gap Detection",
                "risk_type": "offboarding_gap",
                "nist_800_53": "AC-2",
                "mitre_attack": "T1078",
                "gdpr": "Art. 32",
                "cis": "5",
                "findings_count": len(risks_by_type.get("offboarding_gap", [])),
            },
            {
                "capability": "Stale Account Detection",
                "risk_type": "stale_account",
                "nist_800_53": "AC-2",
                "mitre_attack": "T1078",
                "gdpr": "Art. 5",
                "cis": "5",
                "findings_count": len(risks_by_type.get("stale_account", [])),
            },
            {
                "capability": "MFA Gap Detection",
                "risk_type": "mfa_disabled",
                "nist_800_53": "IA-4",
                "mitre_attack": "T1078",
                "gdpr": "Art. 32",
                "cis": "6",
                "findings_count": len(risks_by_type.get("mfa_disabled", [])),
            },
            {
                "capability": "SoD Violation Detection",
                "risk_type": "sod_violation",
                "nist_800_53": "AC-6",
                "mitre_attack": "T1098",
                "gdpr": "Art. 5",
                "cis": "6",
                "findings_count": len(risks_by_type.get("sod_violation", [])),
            },
        ]
        return mapping_table

    def _print_report(self, report: dict) -> None:
        print("\n" + "=" * 70)
        print("  IDENTITYSPHERE AI - PHASE 1 PIPELINE REPORT")
        print("=" * 70)

        meta = report["metadata"]
        print(f"\n  Run: {meta['run_timestamp']}")
        print(f"  Duration: {meta['pipeline_duration_seconds']}s")

        ds = report["data_summary"]
        print(f"\n--- DATA SUMMARY ---")
        print(f"  Identities: {ds['total_identities']}")
        print(f"  Platforms:  {ds['platforms_covered']}")
        print(f"  Groups:     {ds['total_groups']}")
        print(f"  Roles:      {ds['total_roles']}")
        print(f"  Permissions:{ds['total_permissions']}")
        print(f"  Audit Events: {ds['total_audit_events']}")
        print(f"  Offboarding:  {ds['total_offboarding_records']}")
        print(f"  Graph: {ds['graph_stats']}")
        print(f"  Anomaly Dist: {ds['anomaly_distribution']}")

        rs = report["resolution_summary"]
        print(f"\n--- IDENTITY RESOLUTION ---")
        print(f"  Before: {rs['identities_before']}  After: {rs['identities_after']}")
        print(f"  Merges: {rs['merges_performed']}  Avg Confidence: {rs['avg_confidence']}")

        ps = report["privilege_summary"]
        print(f"\n--- PRIVILEGE ANALYSIS ---")
        print(f"  Avg Score: {ps.get('avg_privilege_score', 0):.1f}")
        print(f"  Over-privileged: {ps.get('over_privileged_count', 0)}")
        print(f"  Cross-platform Admins: {ps.get('cross_platform_admin_count', 0)}")
        print(f"  Sensitive Access: {ps.get('identities_with_sensitive_access', 0)}")

        det = report["detection_summary"]
        print(f"\n--- DETECTION RESULTS ---")
        print(f"  Total Risk Events: {det['total_risk_events']}")
        print(f"  Identities at Risk: {det['identities_with_risks']}")
        print(f"  Risk Types: {det['risk_distribution']}")
        print(f"  Severity:   {det['severity_distribution']}")

        acc = det.get("detection_accuracy", {})
        if acc:
            print(f"\n--- DETECTION ACCURACY ---")
            print(f"  True Positives:  {acc.get('true_positives', 'N/A')}")
            print(f"  FP from traps:   {acc.get('false_positives_from_fp_traps', 'N/A')}")
            print(f"  False Negatives: {acc.get('false_negatives', 'N/A')}")
            print(f"  Precision: {acc.get('precision', 'N/A')}")
            print(f"  Recall:    {acc.get('recall', 'N/A')}")
            print(f"  F1 Score:  {acc.get('f1_score', 'N/A')}")

        beh = report.get("behavioral_summary", {})
        if beh:
            print(f"\n--- BEHAVIORAL ANALYSIS (Phase 2) ---")
            print(f"  Profiled:   {beh.get('total_profiled', 0)}")
            print(f"  Anomalous:  {beh.get('anomalous_count', 0)} (threshold: {beh.get('anomaly_threshold', 65)})")
            print(f"  Avg Score:  {beh.get('avg_anomaly_score', 0)}")
            fstats = beh.get("feature_stats", {})
            if fstats:
                print(f"  Features:")
                for fname, stats in fstats.items():
                    print(f"    {fname:<25} min={stats['min']:<8} max={stats['max']:<8} mean={stats['mean']:<8}")

        sc = report.get("scoring_summary", {})
        if sc:
            print(f"\n--- COMPOSITE RISK SCORING (Phase 2) ---")
            print(f"  Avg Composite Score: {sc.get('avg_composite_score', 0)}")
            print(f"  Severity Dist:      {sc.get('severity_distribution', {})}")
            print(f"  Suppression Stats:  {sc.get('suppression_stats', {})}")

        ac = report.get("alert_consolidation", {})
        if ac and ac.get("raw_signals_count", 0) > 0:
            print(f"\n--- ALERT CONSOLIDATION (Phase 2) ---")
            print(f"  Raw Signals:           {ac['raw_signals_count']}")
            print(f"  Consolidated Incidents: {ac['consolidated_incidents_count']}")
            print(f"  Reduction:             {ac['reduction_percentage']}%")
            print(f"  Identities Suppressed: {ac['identities_suppressed']} ({ac['suppression_rate']}%)")

        ag = report.get("attack_graph_stats", {})
        if ag:
            print(f"\n--- ATTACK GRAPH (Phase 3) ---")
            print(f"  Nodes: {ag.get('total_nodes', 0)}  Edges: {ag.get('total_edges', 0)}")
            print(f"  Node types: {ag.get('node_types', {})}")
            print(f"  Edge types: {ag.get('edge_types', {})}")
            print(f"  Resources: {ag.get('total_resources', 0)}  Admin targets: {ag.get('admin_targets', 0)}")

        brs = report.get("blast_radius_summary", {})
        if brs:
            print(f"\n--- BLAST RADIUS ANALYSIS (Phase 3) ---")
            print(f"  Assessed: {brs.get('assessed_count', 0)}")
            print(f"  Severity Dist: {brs.get('severity_distribution', {})}")
            top_br = brs.get("top_blast_radii", [])
            if top_br:
                print(f"  Top Blast Radii:")
                for i, br in enumerate(top_br[:5], 1):
                    print(
                        f"    [{i}] {br['display_name']} ({br['identity_id']}) "
                        f"- {br['severity'].upper()} - "
                        f"{br['reachable_resources']} resources, "
                        f"{br['admin_resource_count']} admin, "
                        f"platforms: {', '.join(br['impacted_platforms'])}"
                    )
            wif = brs.get("whatif_example")
            if wif:
                print(f"\n  What-If Example:")
                print(f"    Simulation: {wif['description']}")
                print(f"    Resources: {wif['original_resources']} -> {wif['simulated_resources']}")
                print(f"    Reduction: {wif['risk_reduction_pct']}%")
                print(f"    Severity:  {wif['severity_change']}")
                print(f"    Removed:   {wif['resources_removed_count']} resource(s)")

        sm = report["success_metrics"]
        print(f"\n--- SUCCESS METRICS (Section 11) ---")
        print(f"  Identity Coverage:  {sm['identity_coverage']} (target >=95%): "
              f"{'PASS' if sm['identity_coverage_met'] else 'FAIL'}")
        print(f"  Risk Scenarios:     {sm['risk_scenarios_detected']} types detected")
        print(f"  Alert Consolidation: {sm['alert_consolidation_ratio']}")
        print(f"  Explainability:     {sm['risk_explainability']}")

        print(f"\n--- TOP 10 RISKY IDENTITIES (Composite Scores) ---")
        for i, risk in enumerate(report["top_risky_identities"], 1):
            print(f"\n  [{i}] {risk['display_name']} ({risk['identity_id']})")
            print(f"      Dept: {risk['department']} | Type: {risk['risk_type']}")
            print(f"      Severity: {risk['severity'].upper()} | Score: {risk['score']}")
            platforms = risk.get('affected_platforms', [])
            if platforms:
                print(f"      Platforms: {', '.join(platforms)}")
            print(f"      Title: {risk['title']}")
            factors = risk.get("factors")
            if factors:
                print(f"      Factors: {factors}")
            supps = risk.get("suppressions_applied")
            if supps:
                print(f"      Suppressions: {', '.join(supps)} (x{risk.get('suppression_multiplier', 1.0):.3f})")
            for step in risk.get("remediation_steps", [])[:2]:
                print(f"        -> {step}")
            if risk.get("compliance_refs"):
                print(f"      Compliance: {', '.join(risk['compliance_refs'])}")

        print(f"\n--- COMPLIANCE MAPPING (Section 12) ---")
        print(f"  {'Capability':<35} {'NIST':<12} {'MITRE':<8} {'GDPR':<8} {'CIS':<6} {'#':<4}")
        print(f"  {'-'*35} {'-'*12} {'-'*8} {'-'*8} {'-'*6} {'-'*4}")
        for row in report["compliance_mapping"]:
            print(
                f"  {row['capability']:<35} {row['nist_800_53']:<12} "
                f"{row['mitre_attack']:<8} {row['gdpr']:<8} {row['cis']:<6} "
                f"{row['findings_count']:<4}"
            )

        print(f"\n{'=' * 70}")
        print("  Pipeline complete.")
        print(f"{'=' * 70}\n")

    def _save_report(self, report: dict) -> None:
        output_dir = self.config.get("output", {}).get("data_dir", "identitysphere/data/generated")
        os.makedirs(output_dir, exist_ok=True)
        output_path = os.path.join(output_dir, "pipeline_report.json")

        serializable = json.loads(json.dumps(report, default=str))
        with open(output_path, "w") as f:
            json.dump(serializable, f, indent=2, default=str)
        logger.info("Report saved to %s", output_path)


def main() -> None:
    """Entry point for direct execution of the Phase 1 pipeline."""
    import sys

    config_path = sys.argv[1] if len(sys.argv) > 1 else None
    pipeline = IdentitySpherePipeline(config_path=config_path)
    report = pipeline.run()

    sys.exit(0 if report.get("success_metrics", {}).get("identity_coverage_met") else 1)


if __name__ == "__main__":
    main()
