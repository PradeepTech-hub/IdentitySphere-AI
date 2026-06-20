"""Identity Attack Graph - privilege path analysis and cross-platform escalation detection.

Builds on the existing IdentityGraph (utils/graph.py) data layer by adding:
  - Resource nodes extracted from permissions (for attack-path termination)
  - Cross-platform bridging edges (identity links accounts across platforms)
  - Path-finding algorithms for attack simulation

Node types (extends base graph):
  identity, account, group, role, permission, resource

Edge types (extends base graph):
  has_account, member_of, has_role, grants, parent_of,
  accesses (permission -> resource), bridges (account <-> account via identity)

Architecture:
  IdentityGraph (utils)      -- raw nodes + edges, built during ingestion
       |
  AttackGraph (core)         -- wraps IdentityGraph, adds resource nodes +
       |                        bridge edges, exposes path-finding APIs
  BlastRadiusEngine (core)   -- uses AttackGraph for reachability + what-if
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Any

import networkx as nx

from identitysphere.utils.graph import IdentityGraph

logger = logging.getLogger("identitysphere.attack_graph")


@dataclass
class AttackPath:
    """A single path from an identity to a target resource or privilege."""

    source: str
    target: str
    path_nodes: list[str]
    path_length: int
    platforms_crossed: list[str]
    is_cross_platform: bool
    edge_types: list[str]
    privilege_level: str
    description: str


@dataclass
class EscalationChain:
    """A cross-platform privilege escalation path."""

    identity_id: str
    display_name: str
    source_platform: str
    target_platform: str
    path: AttackPath
    escalation_type: str
    risk_level: str


class AttackGraph:
    """Attack path analysis engine operating on the identity graph.

    Enriches the base IdentityGraph with resource nodes and cross-platform
    bridge edges, then provides path-finding methods for attack simulation.
    """

    def __init__(self, identity_graph: IdentityGraph) -> None:
        self._base = identity_graph
        self.graph: nx.DiGraph = identity_graph.graph.copy()
        self._resource_index: dict[str, set[str]] = {}
        self._admin_targets: set[str] = set()
        self._enrich()

    def _enrich(self) -> None:
        """Add resource nodes, access edges, and cross-platform bridges."""
        self._add_resource_nodes()
        self._add_cross_platform_bridges()
        logger.info(
            "Attack graph enriched: %d nodes, %d edges (%d resources, %d bridges)",
            self.graph.number_of_nodes(),
            self.graph.number_of_edges(),
            len(self._resource_index),
            sum(
                1 for _, _, d in self.graph.edges(data=True)
                if d.get("edge_type") == "bridges"
            ),
        )

    def _add_resource_nodes(self) -> None:
        """Extract unique resources from permission nodes and link them."""
        for node, data in list(self.graph.nodes(data=True)):
            if data.get("node_type") != "permission":
                continue
            platform = data.get("platform", "unknown")
            resource_name = data.get("resource", "unknown")
            priv_level = data.get("privilege_level", "read")
            resource_key = f"resource:{platform}:{resource_name}"

            if resource_key not in self.graph:
                self.graph.add_node(
                    resource_key,
                    node_type="resource",
                    platform=platform,
                    resource_name=resource_name,
                    is_admin_target=priv_level in ("admin", "super_admin"),
                )

            self.graph.add_edge(
                node, resource_key,
                edge_type="accesses",
                privilege_level=priv_level,
                action=data.get("action", "unknown"),
            )

            if resource_key not in self._resource_index:
                self._resource_index[resource_key] = set()
            self._resource_index[resource_key].add(node)

            if priv_level in ("admin", "super_admin"):
                self._admin_targets.add(resource_key)

    def _add_cross_platform_bridges(self) -> None:
        """Add bridge edges between accounts of the same identity on different platforms."""
        identity_nodes = [
            n for n, d in self.graph.nodes(data=True)
            if d.get("node_type") == "identity"
        ]
        for ident_node in identity_nodes:
            accounts = [
                succ for succ in self.graph.successors(ident_node)
                if self.graph.nodes[succ].get("node_type") == "account"
            ]
            for i in range(len(accounts)):
                for j in range(i + 1, len(accounts)):
                    p_i = self.graph.nodes[accounts[i]].get("platform")
                    p_j = self.graph.nodes[accounts[j]].get("platform")
                    if p_i != p_j:
                        self.graph.add_edge(
                            accounts[i], accounts[j],
                            edge_type="bridges",
                            relationship="same_identity_cross_platform",
                        )
                        self.graph.add_edge(
                            accounts[j], accounts[i],
                            edge_type="bridges",
                            relationship="same_identity_cross_platform",
                        )

    # --- Path Finding ---

    def shortest_privilege_path(
        self, identity_id: str, target_node: str
    ) -> AttackPath | None:
        """Find the shortest path from an identity to any target node."""
        source = f"identity:{identity_id}"
        if source not in self.graph or target_node not in self.graph:
            return None
        try:
            path = nx.shortest_path(self.graph, source, target_node)
        except nx.NetworkXNoPath:
            return None
        return self._build_attack_path(source, target_node, path)

    def all_paths_to_admin(
        self, identity_id: str, max_depth: int = 10
    ) -> list[AttackPath]:
        """Find all paths from an identity to any admin-level resource."""
        source = f"identity:{identity_id}"
        if source not in self.graph:
            return []

        results: list[AttackPath] = []
        for admin_target in self._admin_targets:
            try:
                paths = nx.all_simple_paths(
                    self.graph, source, admin_target, cutoff=max_depth
                )
                for p in paths:
                    results.append(self._build_attack_path(source, admin_target, list(p)))
            except nx.NetworkXNoPath:
                continue
        return results

    def cross_platform_escalation_paths(
        self, identity_id: str, max_depth: int = 8
    ) -> list[EscalationChain]:
        """Find paths that cross platform boundaries to reach admin resources."""
        all_admin_paths = self.all_paths_to_admin(identity_id, max_depth)
        chains: list[EscalationChain] = []
        identity_key = f"identity:{identity_id}"
        display_name = self.graph.nodes.get(identity_key, {}).get("display_name", identity_id)

        for path in all_admin_paths:
            if not path.is_cross_platform:
                continue
            platforms = path.platforms_crossed
            chains.append(EscalationChain(
                identity_id=identity_id,
                display_name=display_name,
                source_platform=platforms[0] if platforms else "unknown",
                target_platform=platforms[-1] if platforms else "unknown",
                path=path,
                escalation_type="cross_platform_admin_escalation",
                risk_level="critical" if len(platforms) >= 3 else "high",
            ))
        return chains

    def resource_reachability(
        self, identity_id: str, max_depth: int = 10
    ) -> dict[str, Any]:
        """Analyze all resources reachable from an identity."""
        source = f"identity:{identity_id}"
        if source not in self.graph:
            return {
                "identity_id": identity_id,
                "reachable_resources": [],
                "reachable_resource_count": 0,
                "reachable_permission_count": 0,
                "reachable_admin_role_count": 0,
                "platforms_reached": [],
                "admin_resources": [],
            }

        reachable = nx.single_source_shortest_path_length(
            self.graph, source, cutoff=max_depth
        )

        resources: list[dict[str, Any]] = []
        permissions: list[str] = []
        admin_roles: list[str] = []
        platforms: set[str] = set()

        for node, dist in reachable.items():
            data = self.graph.nodes.get(node, {})
            ntype = data.get("node_type")
            if ntype == "resource":
                resources.append({
                    "node": node,
                    "platform": data.get("platform"),
                    "resource_name": data.get("resource_name"),
                    "is_admin_target": data.get("is_admin_target", False),
                    "distance": dist,
                })
                platforms.add(data.get("platform", "unknown"))
            elif ntype == "permission":
                permissions.append(node)
            elif ntype == "role" and data.get("is_admin_role"):
                admin_roles.append(node)

        return {
            "identity_id": identity_id,
            "reachable_resources": resources,
            "reachable_resource_count": len(resources),
            "reachable_permission_count": len(permissions),
            "reachable_admin_role_count": len(admin_roles),
            "platforms_reached": sorted(platforms),
            "admin_resources": [r for r in resources if r["is_admin_target"]],
        }

    def find_paths_between(
        self, source_node: str, target_node: str, max_depth: int = 10
    ) -> list[AttackPath]:
        """Find all simple paths between any two nodes."""
        if source_node not in self.graph or target_node not in self.graph:
            return []
        results: list[AttackPath] = []
        try:
            for p in nx.all_simple_paths(self.graph, source_node, target_node, cutoff=max_depth):
                results.append(self._build_attack_path(source_node, target_node, list(p)))
        except nx.NetworkXNoPath:
            pass
        return results

    # --- Helpers ---

    def _build_attack_path(
        self, source: str, target: str, path_nodes: list[str]
    ) -> AttackPath:
        platforms: list[str] = []
        edge_types: list[str] = []
        seen_platforms: set[str] = set()

        for node in path_nodes:
            data = self.graph.nodes.get(node, {})
            plat = data.get("platform")
            if plat and plat not in seen_platforms:
                platforms.append(plat)
                seen_platforms.add(plat)

        for i in range(len(path_nodes) - 1):
            edata = self.graph.edges.get((path_nodes[i], path_nodes[i + 1]), {})
            edge_types.append(edata.get("edge_type", "unknown"))

        target_data = self.graph.nodes.get(target, {})
        priv_level = target_data.get("privilege_level", target_data.get("action", "unknown"))

        desc_parts = []
        for node in path_nodes:
            nd = self.graph.nodes.get(node, {})
            ntype = nd.get("node_type", "?")
            label = nd.get("display_name") or nd.get("name") or nd.get("resource_name") or nd.get("username") or node.split(":")[-1]
            desc_parts.append(f"[{ntype}]{label}")

        return AttackPath(
            source=source,
            target=target,
            path_nodes=path_nodes,
            path_length=len(path_nodes) - 1,
            platforms_crossed=platforms,
            is_cross_platform=len(platforms) >= 2,
            edge_types=edge_types,
            privilege_level=priv_level,
            description=" -> ".join(desc_parts),
        )

    def get_admin_targets(self) -> set[str]:
        return set(self._admin_targets)

    def get_all_resources(self) -> list[dict[str, Any]]:
        return [
            {
                "node": n,
                "platform": d.get("platform"),
                "resource_name": d.get("resource_name"),
                "is_admin_target": d.get("is_admin_target", False),
            }
            for n, d in self.graph.nodes(data=True)
            if d.get("node_type") == "resource"
        ]

    @property
    def stats(self) -> dict[str, Any]:
        base = {}
        for _, data in self.graph.nodes(data=True):
            t = data.get("node_type", "unknown")
            base[t] = base.get(t, 0) + 1
        edge_types: dict[str, int] = {}
        for _, _, data in self.graph.edges(data=True):
            t = data.get("edge_type", "unknown")
            edge_types[t] = edge_types.get(t, 0) + 1
        return {
            "total_nodes": self.graph.number_of_nodes(),
            "total_edges": self.graph.number_of_edges(),
            "node_types": base,
            "edge_types": edge_types,
            "admin_targets": len(self._admin_targets),
            "total_resources": len(self._resource_index),
        }
