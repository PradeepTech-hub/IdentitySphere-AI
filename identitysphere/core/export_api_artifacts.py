"""Export JSON artifacts consumed by the FastAPI server and React frontend."""

from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any

from identitysphere.core.graph import AttackGraph
from identitysphere.core.graph_export import export_full_graph, export_privilege_heatmap
from identitysphere.core.incidents import IncidentCluster
from identitysphere.core.scoring import CompositeScore, ScoringResult
from identitysphere.models.events import RiskEvent
from identitysphere.models.identity import Identity

logger = logging.getLogger("identitysphere.export_api")


def _score_to_dict(score: CompositeScore) -> dict[str, Any]:
    return {
        "identity_id": score.identity_id,
        "display_name": score.display_name,
        "department": score.department,
        "final_score": score.final_score,
        "raw_score": score.raw_score,
        "severity": score.severity,
        "suppression_multiplier": score.suppression_multiplier,
        "factors": [
            {
                "name": f.name,
                "raw_value": f.raw_value,
                "weight": f.weight,
                "weighted_value": f.weighted_value,
                "description": f.description,
            }
            for f in score.factors
        ],
        "suppressions": [
            {"rule": s.rule, "multiplier": s.multiplier, "reason": s.reason}
            for s in score.suppressions
        ],
        "detector_findings_count": score.detector_findings_count,
        "behavioral_anomaly_score": score.behavioral_anomaly_score,
    }


def _risk_event_to_dict(event: RiskEvent, identities: dict[str, Identity]) -> dict[str, Any]:
    ident = identities.get(event.identity_id)
    return {
        "id": event.risk_id,
        "identityId": event.identity_id,
        "identity": ident.display_name if ident else event.identity_id,
        "department": ident.department if ident else "",
        "type": event.risk_type,
        "severity": event.severity.value,
        "score": round(event.score, 2),
        "platforms": [p.value for p in event.affected_platforms],
        "title": event.title,
        "description": event.description,
        "factors": {},
        "remediation_steps": event.remediation_steps,
        "compliance_refs": event.compliance_refs,
        "evidence": event.evidence,
    }


class ApiArtifactExporter:
    def __init__(self, output_dir: str | Path) -> None:
        self.output_dir = Path(output_dir)
        self.output_dir.mkdir(parents=True, exist_ok=True)

    def export_all(
        self,
        risk_events: list[RiskEvent],
        scoring_result: ScoringResult,
        incidents: list[IncidentCluster],
        identities: dict[str, Identity],
        attack_graph: AttackGraph,
        blast_radii: dict | None = None,
    ) -> dict[str, str]:
        paths: dict[str, str] = {}

        scores_path = self.output_dir / "identity_scores.json"
        scores_data = {
            iid: _score_to_dict(s) for iid, s in scoring_result.scores.items()
        }
        scores_path.write_text(json.dumps(scores_data, indent=2), encoding="utf-8")
        paths["identity_scores"] = str(scores_path)

        risks_path = self.output_dir / "risk_events.json"
        risks_data = [_risk_event_to_dict(e, identities) for e in risk_events]
        risks_path.write_text(json.dumps(risks_data, indent=2), encoding="utf-8")
        paths["risk_events"] = str(risks_path)

        inc_path = self.output_dir / "incidents.json"
        from identitysphere.core.incidents import IncidentClusterEngine
        inc_data = IncidentClusterEngine().to_dict_list(incidents)
        inc_path.write_text(json.dumps(inc_data, indent=2), encoding="utf-8")
        paths["incidents"] = str(inc_path)

        graph_path = self.output_dir / "attack_graph.json"
        graph_path.write_text(
            json.dumps(export_full_graph(attack_graph), indent=2, default=str),
            encoding="utf-8",
        )
        paths["attack_graph"] = str(graph_path)

        heatmap_path = self.output_dir / "privilege_heatmap.json"
        heatmap_path.write_text(
            json.dumps(
                export_privilege_heatmap(identities, scoring_result),
                indent=2,
            ),
            encoding="utf-8",
        )
        paths["privilege_heatmap"] = str(heatmap_path)

        if blast_radii:
            br_path = self.output_dir / "blast_radii.json"
            br_data = {
                iid: {
                    "identity_id": br.identity_id,
                    "display_name": br.display_name,
                    "severity": br.severity,
                    "resources": br.reachable_resource_count,
                    "permissions": br.reachable_permission_count,
                    "adminRoles": br.reachable_admin_role_count,
                    "platforms": br.impacted_platforms,
                    "byPlatform": br.resource_by_platform,
                    "sensitiveAssets": br.admin_resources[:10],
                    "id": br.identity_id,
                    "identity": br.display_name,
                }
                for iid, br in blast_radii.items()
            }
            br_path.write_text(json.dumps(br_data, indent=2), encoding="utf-8")
            paths["blast_radii"] = str(br_path)

        logger.info("Exported %d API artifact files to %s", len(paths), self.output_dir)
        return paths
