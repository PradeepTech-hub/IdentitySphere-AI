"""Effective Privilege Calculator — computes true access scope via graph traversal.

How effective privilege is computed:

  1. Start from identity node in the graph
  2. Traverse: identity → accounts → (groups | roles) → permissions
  3. For groups, recurse through parent_of edges to resolve nested inheritance
     (up to max_inheritance_depth to prevent cycles)
  4. Collect all reachable permissions with their inheritance paths
  5. Compute a numeric privilege score using weighted formula:

     privilege_score = Σ (perm_weight × resource_multiplier)

     where:
       perm_weight = { read: 1.0, write: 3.0, admin: 10.0, super_admin: 15.0 }
       resource_multiplier = 2.5 if is_sensitive else 1.0

  6. Cross-platform admin multiplier: if admin on ≥2 platforms, score × 3.0

Worked example (from simulated dataset):
  User ID-0030 (over_privileged category):
    - AD: Domain Admin → grants perm-act-00-04 (admin, domain-controller, sensitive)
      weight = 10.0 × 2.5 = 25.0
    - AWS: AdministratorAccess → grants perm-aws-01-03 (admin, ec2:*, sensitive)
      weight = 10.0 × 2.5 = 25.0
    - AWS: S3ReadOnly (via group) → grants perm-aws-00-00 (read, s3://prod-data)
      weight = 1.0 × 1.0 = 1.0
    - base_score = 25.0 + 25.0 + 1.0 = 51.0
    - cross_platform_admin (AD + AWS) → 51.0 × 3.0 = 153.0
    - normalized to 0–100 scale: min(100, 153.0 / 2.0) = 76.5
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Any

from identitysphere.models.identity import Identity, Platform
from identitysphere.models.access import PrivilegeLevel
from identitysphere.utils.graph import IdentityGraph

logger = logging.getLogger("identitysphere.privilege")


@dataclass
class PermissionDetail:
    """A single effective permission with its inheritance path."""

    permission_id: str
    platform: str
    resource: str
    action: str
    privilege_level: str
    is_sensitive: bool
    weight: float
    inheritance_path: list[str]
    inheritance_depth: int


@dataclass
class PrivilegeProfile:
    """Complete privilege profile for a single identity."""

    identity_id: str
    display_name: str
    total_permissions: int = 0
    unique_permissions: int = 0
    direct_permissions: int = 0
    inherited_permissions: int = 0
    admin_platforms: list[str] = field(default_factory=list)
    is_cross_platform_admin: bool = False
    privilege_score: float = 0.0
    normalized_score: float = 0.0
    permissions: list[PermissionDetail] = field(default_factory=list)
    sensitive_permissions: list[PermissionDetail] = field(default_factory=list)
    platform_scores: dict[str, float] = field(default_factory=dict)
    score_breakdown: dict[str, float] = field(default_factory=dict)


class PrivilegeCalculator:
    """Computes effective privilege for every identity by traversing the identity graph."""

    def __init__(self, config: dict[str, Any] | None = None) -> None:
        cfg = config or {}
        priv_cfg = cfg.get("privilege_calculator", cfg)
        self.max_depth: int = priv_cfg.get("max_inheritance_depth", 10)
        self.admin_weight: float = priv_cfg.get("admin_weight", 10.0)
        self.write_weight: float = priv_cfg.get("write_weight", 3.0)
        self.read_weight: float = priv_cfg.get("read_weight", 1.0)
        self.sensitive_multiplier: float = priv_cfg.get("sensitive_resource_multiplier", 2.5)
        self.cross_platform_multiplier: float = priv_cfg.get(
            "cross_platform_admin_multiplier", 3.0
        )

        self.profiles: dict[str, PrivilegeProfile] = {}

    def calculate_all(
        self, identities: dict[str, Identity], graph: IdentityGraph
    ) -> dict[str, PrivilegeProfile]:
        """Calculate effective privilege for every identity."""
        logger.info("Calculating effective privileges for %d identities...", len(identities))

        for iid, identity in identities.items():
            profile = self._calculate_single(identity, graph)
            self.profiles[iid] = profile

        self._compute_relative_scores()

        over_priv = sum(1 for p in self.profiles.values() if p.normalized_score > 70)
        cross_admin = sum(1 for p in self.profiles.values() if p.is_cross_platform_admin)
        logger.info(
            "Privilege calculation complete: %d profiles, %d over-privileged (>70), "
            "%d cross-platform admins",
            len(self.profiles),
            over_priv,
            cross_admin,
        )
        return self.profiles

    def _calculate_single(
        self, identity: Identity, graph: IdentityGraph
    ) -> PrivilegeProfile:
        """Calculate effective privilege for a single identity."""
        raw_perms = graph.get_effective_permissions(identity.identity_id, self.max_depth)
        admin_platforms = graph.get_admin_platforms(identity.identity_id)

        seen_perm_ids: set[str] = set()
        permissions: list[PermissionDetail] = []
        direct_count = 0
        inherited_count = 0

        for raw in raw_perms:
            perm_node = raw["permission_node"]
            if perm_node in seen_perm_ids:
                continue
            seen_perm_ids.add(perm_node)

            detail = PermissionDetail(
                permission_id=perm_node,
                platform=raw["platform"],
                resource=raw["resource"],
                action=raw["action"],
                privilege_level=raw["privilege_level"],
                is_sensitive=raw["is_sensitive"],
                weight=raw["weight"],
                inheritance_path=raw["inheritance_path"],
                inheritance_depth=raw["inheritance_depth"],
            )
            permissions.append(detail)

            if detail.inheritance_depth <= 3:
                direct_count += 1
            else:
                inherited_count += 1

        sensitive_perms = [p for p in permissions if p.is_sensitive]
        is_cross_admin = len(admin_platforms) >= 2

        base_score = 0.0
        platform_scores: dict[str, float] = {}

        for perm in permissions:
            perm_weight = self._get_privilege_weight(perm.privilege_level)
            resource_mult = self.sensitive_multiplier if perm.is_sensitive else 1.0
            contrib = perm_weight * resource_mult
            base_score += contrib
            platform_scores[perm.platform] = platform_scores.get(perm.platform, 0.0) + contrib

        breakdown: dict[str, float] = {
            "base_permission_score": base_score,
            "cross_platform_multiplier": self.cross_platform_multiplier if is_cross_admin else 1.0,
        }

        if is_cross_admin:
            base_score *= self.cross_platform_multiplier
            breakdown["post_multiplier_score"] = base_score

        profile = PrivilegeProfile(
            identity_id=identity.identity_id,
            display_name=identity.display_name,
            total_permissions=len(raw_perms),
            unique_permissions=len(permissions),
            direct_permissions=direct_count,
            inherited_permissions=inherited_count,
            admin_platforms=admin_platforms,
            is_cross_platform_admin=is_cross_admin,
            privilege_score=base_score,
            permissions=permissions,
            sensitive_permissions=sensitive_perms,
            platform_scores=platform_scores,
            score_breakdown=breakdown,
        )
        return profile

    def _get_privilege_weight(self, level: str) -> float:
        weights = {
            "read": self.read_weight,
            "write": self.write_weight,
            "admin": self.admin_weight,
            "super_admin": self.admin_weight * 1.5,
        }
        return weights.get(level, 1.0)

    def _compute_relative_scores(self) -> None:
        """Normalize privilege scores to 0–100 scale relative to the population."""
        if not self.profiles:
            return

        max_score = max(
            (p.privilege_score for p in self.profiles.values()),
            default=1.0,
        )
        if max_score == 0:
            max_score = 1.0

        for profile in self.profiles.values():
            profile.normalized_score = min(100.0, (profile.privilege_score / max_score) * 100.0)
            profile.score_breakdown["max_population_score"] = max_score
            profile.score_breakdown["normalized_score"] = profile.normalized_score

    def get_over_privileged(self, threshold: float = 70.0) -> list[PrivilegeProfile]:
        """Return identities whose normalized privilege score exceeds the threshold."""
        return sorted(
            [p for p in self.profiles.values() if p.normalized_score > threshold],
            key=lambda p: p.normalized_score,
            reverse=True,
        )

    def get_cross_platform_admins(self) -> list[PrivilegeProfile]:
        """Return identities that are admin on 2+ platforms."""
        return [p for p in self.profiles.values() if p.is_cross_platform_admin]

    def get_privilege_summary(self) -> dict[str, Any]:
        """Return aggregate privilege statistics."""
        if not self.profiles:
            return {}

        scores = [p.normalized_score for p in self.profiles.values()]
        return {
            "total_profiles": len(self.profiles),
            "avg_privilege_score": sum(scores) / len(scores),
            "median_privilege_score": sorted(scores)[len(scores) // 2],
            "over_privileged_count": sum(1 for s in scores if s > 70),
            "cross_platform_admin_count": sum(
                1 for p in self.profiles.values() if p.is_cross_platform_admin
            ),
            "identities_with_sensitive_access": sum(
                1 for p in self.profiles.values() if p.sensitive_permissions
            ),
        }
