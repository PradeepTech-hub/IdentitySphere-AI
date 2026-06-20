"""Blast Radius Engine - impact analysis and what-if simulation.

For a selected identity, computes the full "blast radius" - everything an
attacker could reach if that identity were compromised:

  - Reachable resources (by platform)
  - Reachable permissions (read/write/admin)
  - Reachable admin roles
  - Impacted systems (platforms)
  - Severity (LOW / MEDIUM / HIGH / CRITICAL)

What-If Simulator supports three scenarios:

  1. Identity Compromised  - full blast radius from a given identity
  2. Group Removal         - remove a group membership, recompute blast radius
  3. Role Revocation       - remove a role assignment, recompute blast radius

Each simulation returns:
  - original blast radius
  - new blast radius (after the change)
  - risk reduction %
  - resources no longer reachable
  - explainable summary

Severity assignment:
  CRITICAL  >=15 resources reachable, or any admin resource on >=2 platforms
  HIGH      >=8 resources, or admin resource on 1 platform
  MEDIUM    >=3 resources
  LOW       <3 resources
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Any

import networkx as nx

from identitysphere.core.graph import AttackGraph

logger = logging.getLogger("identitysphere.blast_radius")


@dataclass
class BlastRadius:
    """Complete blast radius assessment for a single identity."""

    identity_id: str
    display_name: str
    severity: str

    reachable_resource_count: int = 0
    reachable_permission_count: int = 0
    reachable_admin_role_count: int = 0
    impacted_platforms: list[str] = field(default_factory=list)

    resources: list[dict[str, Any]] = field(default_factory=list)
    admin_resources: list[dict[str, Any]] = field(default_factory=list)
    resource_by_platform: dict[str, int] = field(default_factory=dict)

    score_breakdown: dict[str, Any] = field(default_factory=dict)


@dataclass
class WhatIfResult:
    """Comparison of blast radius before and after a simulated change."""

    simulation_type: str
    description: str
    identity_id: str
    display_name: str

    original: BlastRadius
    simulated: BlastRadius

    risk_reduction_pct: float = 0.0
    resources_removed: list[dict[str, Any]] = field(default_factory=list)
    permissions_removed_count: int = 0
    severity_change: str = ""
    explanation: str = ""


class BlastRadiusEngine:
    """Computes blast radius and runs what-if simulations on the attack graph."""

    def __init__(self, attack_graph: AttackGraph, max_depth: int = 10) -> None:
        self.ag = attack_graph
        self.max_depth = max_depth

    # --- Core Blast Radius ---

    def compute(self, identity_id: str) -> BlastRadius:
        """Compute the full blast radius for an identity."""
        reachability = self.ag.resource_reachability(identity_id, self.max_depth)
        identity_key = f"identity:{identity_id}"
        display_name = self.ag.graph.nodes.get(identity_key, {}).get("display_name", identity_id)

        resources = reachability["reachable_resources"]
        admin_resources = reachability["admin_resources"]
        platforms = reachability["platforms_reached"]

        resource_by_platform: dict[str, int] = {}
        for r in resources:
            p = r.get("platform", "unknown")
            resource_by_platform[p] = resource_by_platform.get(p, 0) + 1

        admin_platform_count = len({r["platform"] for r in admin_resources})
        severity = self._compute_severity(
            len(resources), len(admin_resources), admin_platform_count
        )

        return BlastRadius(
            identity_id=identity_id,
            display_name=display_name,
            severity=severity,
            reachable_resource_count=len(resources),
            reachable_permission_count=reachability["reachable_permission_count"],
            reachable_admin_role_count=reachability["reachable_admin_role_count"],
            impacted_platforms=platforms,
            resources=resources,
            admin_resources=admin_resources,
            resource_by_platform=resource_by_platform,
            score_breakdown={
                "total_resources": len(resources),
                "admin_resources": len(admin_resources),
                "admin_platforms": admin_platform_count,
                "platforms_reached": len(platforms),
                "permissions": reachability["reachable_permission_count"],
                "admin_roles": reachability["reachable_admin_role_count"],
            },
        )

    def compute_all(
        self, identity_ids: list[str]
    ) -> dict[str, BlastRadius]:
        """Compute blast radius for a list of identities."""
        results: dict[str, BlastRadius] = {}
        for iid in identity_ids:
            results[iid] = self.compute(iid)
        logger.info("Computed blast radius for %d identities", len(results))
        return results

    # --- What-If Simulations ---

    def simulate_compromise(self, identity_id: str) -> WhatIfResult:
        """Simulate an identity compromise - shows the full blast radius as the 'after'."""
        radius = self.compute(identity_id)
        empty = BlastRadius(
            identity_id=identity_id,
            display_name=radius.display_name,
            severity="low",
        )
        return WhatIfResult(
            simulation_type="identity_compromised",
            description=f"Full compromise of {radius.display_name}",
            identity_id=identity_id,
            display_name=radius.display_name,
            original=empty,
            simulated=radius,
            risk_reduction_pct=0.0,
            resources_removed=[],
            permissions_removed_count=0,
            severity_change=f"none -> {radius.severity}",
            explanation=(
                f"If {radius.display_name} is compromised, attacker reaches "
                f"{radius.reachable_resource_count} resources across "
                f"{len(radius.impacted_platforms)} platform(s) "
                f"({', '.join(radius.impacted_platforms)}). "
                f"Severity: {radius.severity.upper()}. "
                f"Admin resources: {len(radius.admin_resources)}."
            ),
        )

    def simulate_group_removal(
        self, identity_id: str, group_node: str
    ) -> WhatIfResult:
        """Simulate removing an identity from a group and measure blast radius change."""
        original = self.compute(identity_id)
        modified_graph = self._remove_edges_to_node(identity_id, group_node, "member_of")
        simulated = self._compute_on_modified(identity_id, modified_graph, original.display_name)

        return self._build_whatif_result(
            simulation_type="group_removal",
            description=f"Remove {original.display_name} from group {group_node}",
            identity_id=identity_id,
            original=original,
            simulated=simulated,
        )

    def simulate_role_revocation(
        self, identity_id: str, role_node: str
    ) -> WhatIfResult:
        """Simulate revoking a role from an identity and measure blast radius change."""
        original = self.compute(identity_id)
        modified_graph = self._remove_edges_to_node(identity_id, role_node, "has_role")
        simulated = self._compute_on_modified(identity_id, modified_graph, original.display_name)

        return self._build_whatif_result(
            simulation_type="role_revocation",
            description=f"Revoke role {role_node} from {original.display_name}",
            identity_id=identity_id,
            original=original,
            simulated=simulated,
        )

    # --- Internals ---

    def _remove_edges_to_node(
        self, identity_id: str, target_node: str, edge_type: str
    ) -> nx.DiGraph:
        """Return a copy of the graph with edges of the given type to target_node removed
        (only from accounts belonging to this identity)."""
        g = self.ag.graph.copy()
        identity_key = f"identity:{identity_id}"

        account_nodes = [
            succ for succ in g.successors(identity_key)
            if g.nodes.get(succ, {}).get("node_type") == "account"
        ]

        edges_to_remove = []
        for acct in account_nodes:
            if g.has_edge(acct, target_node):
                edata = g.edges[acct, target_node]
                if edata.get("edge_type") == edge_type:
                    edges_to_remove.append((acct, target_node))

        g.remove_edges_from(edges_to_remove)
        return g

    def _compute_on_modified(
        self, identity_id: str, modified_graph: nx.DiGraph, display_name: str
    ) -> BlastRadius:
        """Compute blast radius on a modified graph."""
        source = f"identity:{identity_id}"
        if source not in modified_graph:
            return BlastRadius(identity_id=identity_id, display_name=display_name, severity="low")

        reachable = nx.single_source_shortest_path_length(
            modified_graph, source, cutoff=self.max_depth
        )

        resources: list[dict[str, Any]] = []
        admin_resources: list[dict[str, Any]] = []
        permissions: list[str] = []
        admin_roles: list[str] = []
        platforms: set[str] = set()

        for node, dist in reachable.items():
            data = modified_graph.nodes.get(node, {})
            ntype = data.get("node_type")
            if ntype == "resource":
                r = {
                    "node": node,
                    "platform": data.get("platform"),
                    "resource_name": data.get("resource_name"),
                    "is_admin_target": data.get("is_admin_target", False),
                    "distance": dist,
                }
                resources.append(r)
                platforms.add(data.get("platform", "unknown"))
                if r["is_admin_target"]:
                    admin_resources.append(r)
            elif ntype == "permission":
                permissions.append(node)
            elif ntype == "role" and data.get("is_admin_role"):
                admin_roles.append(node)

        resource_by_platform: dict[str, int] = {}
        for r in resources:
            p = r.get("platform", "unknown")
            resource_by_platform[p] = resource_by_platform.get(p, 0) + 1

        admin_platform_count = len({r["platform"] for r in admin_resources})
        severity = self._compute_severity(
            len(resources), len(admin_resources), admin_platform_count
        )

        return BlastRadius(
            identity_id=identity_id,
            display_name=display_name,
            severity=severity,
            reachable_resource_count=len(resources),
            reachable_permission_count=len(permissions),
            reachable_admin_role_count=len(admin_roles),
            impacted_platforms=sorted(platforms),
            resources=resources,
            admin_resources=admin_resources,
            resource_by_platform=resource_by_platform,
            score_breakdown={
                "total_resources": len(resources),
                "admin_resources": len(admin_resources),
                "admin_platforms": admin_platform_count,
                "platforms_reached": len(platforms),
                "permissions": len(permissions),
                "admin_roles": len(admin_roles),
            },
        )

    def _build_whatif_result(
        self,
        simulation_type: str,
        description: str,
        identity_id: str,
        original: BlastRadius,
        simulated: BlastRadius,
    ) -> WhatIfResult:
        original_resources = {r["node"] for r in original.resources}
        simulated_resources = {r["node"] for r in simulated.resources}
        removed_nodes = original_resources - simulated_resources
        resources_removed = [r for r in original.resources if r["node"] in removed_nodes]

        orig_count = max(original.reachable_resource_count, 1)
        reduction = (1 - simulated.reachable_resource_count / orig_count) * 100.0
        reduction = max(0.0, min(100.0, reduction))

        perm_diff = original.reachable_permission_count - simulated.reachable_permission_count

        severity_change = f"{original.severity} -> {simulated.severity}"

        explanation_parts = [f"Simulation: {description}."]
        if resources_removed:
            explanation_parts.append(
                f"Removes access to {len(resources_removed)} resource(s): "
                f"{', '.join(r.get('resource_name', r['node']) for r in resources_removed[:5])}"
            )
        explanation_parts.append(
            f"Resources: {original.reachable_resource_count} -> {simulated.reachable_resource_count} "
            f"({reduction:.1f}% reduction). "
            f"Severity: {severity_change}."
        )

        return WhatIfResult(
            simulation_type=simulation_type,
            description=description,
            identity_id=identity_id,
            display_name=original.display_name,
            original=original,
            simulated=simulated,
            risk_reduction_pct=round(reduction, 1),
            resources_removed=resources_removed,
            permissions_removed_count=max(perm_diff, 0),
            severity_change=severity_change,
            explanation=" ".join(explanation_parts),
        )

    def _compute_severity(
        self, resource_count: int, admin_count: int, admin_platforms: int
    ) -> str:
        if resource_count >= 15 or admin_platforms >= 2:
            return "critical"
        if resource_count >= 8 or admin_count >= 1:
            return "high"
        if resource_count >= 3:
            return "medium"
        return "low"

    # --- Reporting ---

    def format_blast_radius(self, br: BlastRadius) -> str:
        """Human-readable blast radius report."""
        lines = [
            f"=== Blast Radius: {br.display_name} ({br.identity_id}) ===",
            f"Severity: {br.severity.upper()}",
            f"Reachable Resources:  {br.reachable_resource_count}",
            f"Reachable Permissions: {br.reachable_permission_count}",
            f"Reachable Admin Roles: {br.reachable_admin_role_count}",
            f"Impacted Platforms:   {', '.join(br.impacted_platforms)}",
            "",
            "Resources by Platform:",
        ]
        for platform, count in sorted(br.resource_by_platform.items()):
            lines.append(f"  {platform:<25} {count} resource(s)")
        if br.admin_resources:
            lines.append("")
            lines.append("Admin Resources (highest risk):")
            for r in br.admin_resources[:10]:
                lines.append(f"  [{r['platform']}] {r['resource_name']} (distance: {r['distance']})")
        return "\n".join(lines)

    def format_whatif(self, result: WhatIfResult) -> str:
        """Human-readable what-if simulation report."""
        lines = [
            f"=== What-If: {result.description} ===",
            f"Type: {result.simulation_type}",
            "",
            f"Original Blast Radius:",
            f"  Resources: {result.original.reachable_resource_count}",
            f"  Permissions: {result.original.reachable_permission_count}",
            f"  Admin Roles: {result.original.reachable_admin_role_count}",
            f"  Severity: {result.original.severity.upper()}",
            "",
            f"Simulated Blast Radius:",
            f"  Resources: {result.simulated.reachable_resource_count}",
            f"  Permissions: {result.simulated.reachable_permission_count}",
            f"  Admin Roles: {result.simulated.reachable_admin_role_count}",
            f"  Severity: {result.simulated.severity.upper()}",
            "",
            f"Risk Reduction: {result.risk_reduction_pct}%",
            f"Severity Change: {result.severity_change}",
            f"Resources Removed: {len(result.resources_removed)}",
            f"Permissions Removed: {result.permissions_removed_count}",
        ]
        if result.resources_removed:
            lines.append("")
            lines.append("Resources No Longer Reachable:")
            for r in result.resources_removed[:10]:
                lines.append(f"  [{r.get('platform')}] {r.get('resource_name')}")
        lines.append("")
        lines.append(f"Explanation: {result.explanation}")
        return "\n".join(lines)
