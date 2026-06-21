"""Export NetworkX attack graph subgraphs for frontend visualization."""

from __future__ import annotations

from typing import Any

import networkx as nx

from identitysphere.core.graph import AttackGraph

NODE_COLORS = {
    "identity": "#ef4444",
    "account": "#f97316",
    "group": "#eab308",
    "role": "#22c55e",
    "permission": "#3b82f6",
    "resource": "#a855f7",
}

PLATFORM_COLORS = {
    "active_directory": "#00a4ef",
    "azure_ad": "#0078d4",
    "aws_iam": "#ff9900",
    "okta": "#007dc1",
    "salesforce": "#00a1e0",
    "servicenow": "#81b5a1",
    "github": "#6e40c9",
}


def export_full_graph(attack_graph: AttackGraph) -> dict[str, Any]:
    """Serialize the full attack graph for API caching."""
    nodes = []
    for node_id, data in attack_graph.graph.nodes(data=True):
        nodes.append({"id": node_id, **data})
    edges = []
    for src, tgt, data in attack_graph.graph.edges(data=True):
        edges.append({"source": src, "target": tgt, **data})
    return {"nodes": nodes, "edges": edges, "stats": attack_graph.stats}


def export_identity_subgraph(
    attack_graph: AttackGraph,
    person_id: str,
    max_depth: int = 6,
) -> dict[str, Any]:
    """Build a ReactFlow-ready subgraph centered on an identity."""
    source = f"identity:{person_id}"
    if source not in attack_graph.graph:
        return {"nodes": [], "edges": [], "paths": []}

    reachable = nx.single_source_shortest_path_length(
        attack_graph.graph, source, cutoff=max_depth
    )
    sub_nodes = set(reachable.keys())

    for node in list(sub_nodes):
        for pred in attack_graph.graph.predecessors(node):
            if pred in reachable:
                sub_nodes.add(pred)
        for succ in attack_graph.graph.successors(node):
            if succ in reachable:
                sub_nodes.add(succ)

    rf_nodes = []
    rf_edges = []
    positions = _layout_nodes(sub_nodes, source, attack_graph.graph)

    for node_id in sub_nodes:
        data = attack_graph.graph.nodes[node_id]
        ntype = data.get("node_type", "unknown")
        platform = data.get("platform", "")
        label = data.get("display_name") or data.get("name") or data.get("username") or node_id.split(":")[-1]
        color = PLATFORM_COLORS.get(platform, NODE_COLORS.get(ntype, "#64748b"))

        rf_nodes.append({
            "id": node_id,
            "position": positions.get(node_id, {"x": 0, "y": 0}),
            "data": {
                "label": f"{label}\n({ntype})",
                "node_type": ntype,
                "platform": platform,
            },
            "style": {
                "background": "#1e293b",
                "color": color,
                "border": f"2px solid {color}",
                "borderRadius": 12,
                "padding": 12,
                "fontSize": 11,
                "width": 160,
                "textAlign": "center",
            },
        })

    seen_edges = set()
    for src in sub_nodes:
        for tgt in attack_graph.graph.successors(src):
            if tgt not in sub_nodes:
                continue
            key = (src, tgt)
            if key in seen_edges:
                continue
            seen_edges.add(key)
            edge_data = attack_graph.graph.edges[src, tgt]
            rf_edges.append({
                "id": f"{src}->{tgt}",
                "source": src,
                "target": tgt,
                "label": edge_data.get("edge_type", ""),
                "animated": edge_data.get("edge_type") == "bridges",
                "style": {"stroke": "#94a3b8"},
            })

    paths = []
    for chain in attack_graph.cross_platform_escalation_paths(person_id, max_depth):
        paths.append({
            "source_platform": chain.source_platform,
            "target_platform": chain.target_platform,
            "escalation_type": chain.escalation_type,
            "risk_level": chain.risk_level,
            "description": chain.path.description,
            "platforms_crossed": chain.path.platforms_crossed,
            "path_length": chain.path.path_length,
        })

    return {
        "person_id": person_id,
        "nodes": rf_nodes,
        "edges": rf_edges,
        "paths": paths,
    }


def _layout_nodes(sub_nodes: set[str], source: str, graph: nx.DiGraph) -> dict[str, dict[str, float]]:
    """Simple layered layout for visualization."""
    layers: dict[int, list[str]] = {}
    if source in sub_nodes:
        lengths = nx.single_source_shortest_path_length(graph, source, cutoff=8)
        for node, depth in lengths.items():
            layers.setdefault(depth, []).append(node)

    positions: dict[str, dict[str, float]] = {}
    for depth, nodes in layers.items():
        for i, node in enumerate(sorted(nodes)):
            positions[node] = {"x": 80 + depth * 220, "y": 80 + i * 100}
    return positions


def export_privilege_heatmap(
    identities: dict,
    scoring_result,
) -> dict[str, Any]:
    """Platform × department risk matrix for dashboard heatmap."""
    departments: set[str] = set()
    platforms: set[str] = set()
    for ident in identities.values():
        if ident.department:
            departments.add(ident.department)
        for acct in ident.accounts:
            platforms.add(acct.platform.value)

    dept_list = sorted(departments)
    plat_list = sorted(platforms)
    matrix: list[list[float]] = [[0.0 for _ in dept_list] for _ in plat_list]
    counts: list[list[int]] = [[0 for _ in dept_list] for _ in plat_list]

    for ident in identities.values():
        if not ident.department:
            continue
        try:
            di = dept_list.index(ident.department)
        except ValueError:
            continue
        score = scoring_result.scores.get(ident.identity_id)
        risk = score.final_score if score else 0.0
        for acct in ident.accounts:
            try:
                pi = plat_list.index(acct.platform.value)
            except ValueError:
                continue
            matrix[pi][di] += risk
            counts[pi][di] += 1

    for pi in range(len(plat_list)):
        for di in range(len(dept_list)):
            if counts[pi][di] > 0:
                matrix[pi][di] = round(matrix[pi][di] / counts[pi][di], 1)

    return {
        "platforms": plat_list,
        "departments": dept_list,
        "matrix": matrix,
        "counts": counts,
    }
