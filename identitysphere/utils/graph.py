"""NetworkX-based identity graph for privilege traversal and relationship mapping."""

from __future__ import annotations

from typing import Any, Optional

import networkx as nx

from identitysphere.models.identity import Identity, Platform
from identitysphere.models.access import (
    Group,
    Role,
    Permission,
    GroupMembership,
    RoleAssignment,
    PrivilegeLevel,
)


PRIVILEGE_WEIGHTS = {
    PrivilegeLevel.READ: 1.0,
    PrivilegeLevel.WRITE: 3.0,
    PrivilegeLevel.ADMIN: 10.0,
    PrivilegeLevel.SUPER_ADMIN: 15.0,
}


class IdentityGraph:
    """Directed graph representing identity → group → role → permission relationships.

    Node types: identity, account, group, role, permission
    Edge types: has_account, member_of, has_role, grants, parent_of
    """

    def __init__(self) -> None:
        self.graph = nx.DiGraph()

    def add_identity(self, identity: Identity) -> None:
        self.graph.add_node(
            f"identity:{identity.identity_id}",
            node_type="identity",
            display_name=identity.display_name,
            email=identity.email,
            identity_type=identity.identity_type.value,
            hr_status=identity.hr_status.value,
        )
        for account in identity.accounts:
            acct_key = f"account:{account.platform.value}:{account.account_id}"
            self.graph.add_node(
                acct_key,
                node_type="account",
                platform=account.platform.value,
                username=account.username,
                status=account.status.value,
                is_admin=account.is_admin,
            )
            self.graph.add_edge(
                f"identity:{identity.identity_id}",
                acct_key,
                edge_type="has_account",
                platform=account.platform.value,
            )

    def add_group(self, group: Group) -> None:
        group_key = f"group:{group.platform.value}:{group.group_id}"
        self.graph.add_node(
            group_key,
            node_type="group",
            platform=group.platform.value,
            name=group.name,
            is_privileged=group.is_privileged,
        )
        for parent_id in group.parent_group_ids:
            parent_key = f"group:{group.platform.value}:{parent_id}"
            self.graph.add_edge(parent_key, group_key, edge_type="parent_of")

    def add_role(self, role: Role) -> None:
        role_key = f"role:{role.platform.value}:{role.role_id}"
        self.graph.add_node(
            role_key,
            node_type="role",
            platform=role.platform.value,
            name=role.name,
            is_admin_role=role.is_admin_role,
        )

    def add_permission(self, perm: Permission) -> None:
        perm_key = f"permission:{perm.platform.value}:{perm.permission_id}"
        self.graph.add_node(
            perm_key,
            node_type="permission",
            platform=perm.platform.value,
            resource=perm.resource,
            action=perm.action,
            privilege_level=perm.privilege_level.value,
            is_sensitive=perm.is_sensitive,
            weight=PRIVILEGE_WEIGHTS[perm.privilege_level],
        )

    def link_role_permission(self, role: Role, perm: Permission) -> None:
        role_key = f"role:{role.platform.value}:{role.role_id}"
        perm_key = f"permission:{perm.platform.value}:{perm.permission_id}"
        self.graph.add_edge(role_key, perm_key, edge_type="grants")

    def link_group_permission(self, group: Group, perm: Permission) -> None:
        group_key = f"group:{group.platform.value}:{group.group_id}"
        perm_key = f"permission:{perm.platform.value}:{perm.permission_id}"
        self.graph.add_edge(group_key, perm_key, edge_type="grants")

    def add_group_membership(self, membership: GroupMembership) -> None:
        acct_key = f"account:{membership.platform.value}:{membership.account_id}"
        group_key = f"group:{membership.platform.value}:{membership.group_id}"
        self.graph.add_edge(
            acct_key,
            group_key,
            edge_type="member_of",
            is_direct=membership.is_direct,
        )

    def add_role_assignment(self, assignment: RoleAssignment) -> None:
        acct_key = f"account:{assignment.platform.value}:{assignment.account_id}"
        role_key = f"role:{assignment.platform.value}:{assignment.role_id}"
        self.graph.add_edge(acct_key, role_key, edge_type="has_role")

    def get_effective_permissions(
        self, identity_id: str, max_depth: int = 10
    ) -> list[dict[str, Any]]:
        """Traverse graph from identity through accounts → groups/roles → permissions.
        Handles nested group inheritance up to max_depth."""
        identity_key = f"identity:{identity_id}"
        if identity_key not in self.graph:
            return []

        permissions: list[dict[str, Any]] = []
        visited: set[str] = set()

        def _collect_permissions(node: str, path: list[str], depth: int) -> None:
            if depth > max_depth or node in visited:
                return
            visited.add(node)
            current_path = path + [node]

            node_data = self.graph.nodes.get(node, {})

            if node_data.get("node_type") == "permission":
                permissions.append(
                    {
                        "permission_node": node,
                        "platform": node_data.get("platform"),
                        "resource": node_data.get("resource"),
                        "action": node_data.get("action"),
                        "privilege_level": node_data.get("privilege_level"),
                        "is_sensitive": node_data.get("is_sensitive", False),
                        "weight": node_data.get("weight", 1.0),
                        "inheritance_path": current_path,
                        "inheritance_depth": depth,
                    }
                )
                return

            for successor in self.graph.successors(node):
                edge_data = self.graph.edges[node, successor]
                edge_type = edge_data.get("edge_type", "")
                if edge_type in (
                    "has_account",
                    "member_of",
                    "has_role",
                    "grants",
                    "parent_of",
                ):
                    _collect_permissions(successor, current_path, depth + 1)

        _collect_permissions(identity_key, [], 0)
        return permissions

    def get_admin_platforms(self, identity_id: str) -> list[str]:
        """Return platforms where this identity has admin-level access."""
        perms = self.get_effective_permissions(identity_id)
        admin_platforms: set[str] = set()
        for p in perms:
            if p["privilege_level"] in ("admin", "super_admin"):
                admin_platforms.add(p["platform"])
        return sorted(admin_platforms)

    def get_identity_neighbors(
        self, identity_id: str, depth: int = 2
    ) -> nx.DiGraph:
        """Return the subgraph within `depth` hops of an identity."""
        identity_key = f"identity:{identity_id}"
        if identity_key not in self.graph:
            return nx.DiGraph()
        nodes = nx.single_source_shortest_path_length(self.graph, identity_key, cutoff=depth)
        return self.graph.subgraph(nodes.keys()).copy()

    @property
    def stats(self) -> dict[str, int]:
        type_counts: dict[str, int] = {}
        for _, data in self.graph.nodes(data=True):
            t = data.get("node_type", "unknown")
            type_counts[t] = type_counts.get(t, 0) + 1
        return {
            "total_nodes": self.graph.number_of_nodes(),
            "total_edges": self.graph.number_of_edges(),
            **type_counts,
        }
