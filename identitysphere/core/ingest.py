"""Data Ingestion Engine — normalizes and loads multi-platform identity data.

Responsibilities:
  1. Accept raw identity snapshots from AD, AWS IAM, Okta, GitHub, Salesforce
  2. Normalize each source into the unified Identity/PlatformAccount model
  3. Build the identity graph (nodes + edges for accounts, groups, roles, permissions)
  4. Index audit events by identity and time window
  5. Load offboarding records for gap detection

The engine is source-agnostic: it operates on the Pydantic models produced by
either real connectors or the synthetic data generator.
"""

from __future__ import annotations

import logging
from collections import defaultdict
from datetime import datetime, timedelta
from typing import Any

from identitysphere.models.identity import Identity, Platform, PlatformAccount
from identitysphere.models.access import (
    Group,
    GroupMembership,
    Permission,
    Role,
    RoleAssignment,
)
from identitysphere.models.events import AuditEvent
from identitysphere.models.offboarding import OffboardingRecord
from identitysphere.utils.graph import IdentityGraph

logger = logging.getLogger("identitysphere.ingest")


class IngestionEngine:
    """Loads and normalizes identity data from multiple platforms into a unified store."""

    def __init__(self) -> None:
        self.identities: dict[str, Identity] = {}
        self.accounts_by_platform: dict[Platform, list[PlatformAccount]] = defaultdict(list)
        self.groups: dict[str, Group] = {}
        self.roles: dict[str, Role] = {}
        self.permissions: dict[str, Permission] = {}
        self.group_memberships: list[GroupMembership] = []
        self.role_assignments: list[RoleAssignment] = []
        self.audit_events: list[AuditEvent] = []
        self.audit_events_by_identity: dict[str, list[AuditEvent]] = defaultdict(list)
        self.offboarding_records: list[OffboardingRecord] = []
        self.offboarding_by_identity: dict[str, OffboardingRecord] = {}
        self.graph = IdentityGraph()
        self._ingested = False

    def ingest(self, data: dict[str, Any]) -> None:
        """Ingest a complete dataset (as produced by the synthetic generator)."""
        logger.info("Starting data ingestion...")

        self._load_identities(data.get("identities", []))
        self._load_access_structures(
            data.get("groups", []),
            data.get("roles", []),
            data.get("permissions", []),
        )
        self._load_memberships(
            data.get("group_memberships", []),
            data.get("role_assignments", []),
        )
        self._load_audit_events(data.get("audit_events", []))
        self._load_offboarding(data.get("offboarding_records", []))
        self._build_graph()

        self._ingested = True
        logger.info(
            "Ingestion complete: %d identities, %d groups, %d roles, "
            "%d permissions, %d audit events, %d offboarding records",
            len(self.identities),
            len(self.groups),
            len(self.roles),
            len(self.permissions),
            len(self.audit_events),
            len(self.offboarding_records),
        )

    def _load_identities(self, identities: list[Identity]) -> None:
        for identity in identities:
            self.identities[identity.identity_id] = identity
            for account in identity.accounts:
                self.accounts_by_platform[account.platform].append(account)
        logger.info("Loaded %d identities across %d platforms",
                     len(self.identities), len(self.accounts_by_platform))

    def _load_access_structures(
        self,
        groups: list[Group],
        roles: list[Role],
        permissions: list[Permission],
    ) -> None:
        for group in groups:
            self.groups[group.group_id] = group
        for role in roles:
            self.roles[role.role_id] = role
        for perm in permissions:
            self.permissions[perm.permission_id] = perm
        logger.info("Loaded %d groups, %d roles, %d permissions",
                     len(self.groups), len(self.roles), len(self.permissions))

    def _load_memberships(
        self,
        memberships: list[GroupMembership],
        assignments: list[RoleAssignment],
    ) -> None:
        self.group_memberships = memberships
        self.role_assignments = assignments
        logger.info("Loaded %d group memberships, %d role assignments",
                     len(self.group_memberships), len(self.role_assignments))

    def _load_audit_events(self, events: list[AuditEvent]) -> None:
        self.audit_events = sorted(events, key=lambda e: e.timestamp)
        for event in self.audit_events:
            if event.identity_id:
                self.audit_events_by_identity[event.identity_id].append(event)
        logger.info("Loaded %d audit events", len(self.audit_events))

    def _load_offboarding(self, records: list[OffboardingRecord]) -> None:
        self.offboarding_records = records
        for record in records:
            self.offboarding_by_identity[record.identity_id] = record
        logger.info("Loaded %d offboarding records", len(self.offboarding_records))

    def _build_graph(self) -> None:
        """Construct the full identity graph from ingested data."""
        for identity in self.identities.values():
            self.graph.add_identity(identity)

        for group in self.groups.values():
            self.graph.add_group(group)

        for role in self.roles.values():
            self.graph.add_role(role)

        for perm in self.permissions.values():
            self.graph.add_permission(perm)

        for role in self.roles.values():
            for pid in role.permission_ids:
                if pid in self.permissions:
                    self.graph.link_role_permission(role, self.permissions[pid])

        for group in self.groups.values():
            for pid in group.permission_ids:
                if pid in self.permissions:
                    self.graph.link_group_permission(group, self.permissions[pid])

        for membership in self.group_memberships:
            self.graph.add_group_membership(membership)

        for assignment in self.role_assignments:
            self.graph.add_role_assignment(assignment)

        logger.info("Identity graph built: %s", self.graph.stats)

    def get_events_in_window(
        self, identity_id: str, hours: int = 24
    ) -> list[AuditEvent]:
        """Return audit events for an identity within the last N hours."""
        cutoff = datetime.utcnow() - timedelta(hours=hours)
        return [
            e
            for e in self.audit_events_by_identity.get(identity_id, [])
            if e.timestamp >= cutoff
        ]

    def get_platform_summary(self) -> dict[str, dict[str, int]]:
        """Return a summary of accounts per platform and their statuses."""
        summary: dict[str, dict[str, int]] = {}
        for platform, accounts in self.accounts_by_platform.items():
            status_counts: dict[str, int] = {}
            for acct in accounts:
                status_counts[acct.status.value] = status_counts.get(acct.status.value, 0) + 1
            summary[platform.value] = {
                "total": len(accounts),
                **status_counts,
            }
        return summary

    @property
    def is_ready(self) -> bool:
        return self._ingested
