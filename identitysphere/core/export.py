"""Dataset Export Layer - materializes in-memory Pydantic models to challenge-compliant flat files.

Exports 8 files to identitysphere/data/generated/:

  identities.csv   - 1 row per platform account, identity fields denormalized
  person_map.csv   - canonical cross-platform identity mapping
  groups.json      - group hierarchy with members and inheritance
  memberships.csv  - account-to-group + account-to-role relationships
  entitlements.csv - role-permission-resource join chain
  audit_events.csv - all audit log entries
  offboarding.csv  - 1 row per (offboarding, platform) with disable status
  ground_truth.csv - anomaly labels with derived boolean columns

Denormalization strategy:
  - Nested lists (Identity.accounts, OffboardingRecord.platform_records)
    are exploded into 1 row per child element with parent fields repeated.
  - Join chains (RoleAssignment -> Role -> Permission) are traversed at
    export time and materialized as flat rows.
  - Reverse index (account_id -> identity_id) is built once from the
    identity list and reused across memberships and entitlements exports.
"""

from __future__ import annotations

import csv
import json
import logging
import os
from datetime import datetime
from io import StringIO
from typing import Any

from identitysphere.models.identity import Identity, IdentityStatus, Platform
from identitysphere.models.access import (
    Group,
    GroupMembership,
    Permission,
    Role,
    RoleAssignment,
)
from identitysphere.models.events import AuditEvent
from identitysphere.models.offboarding import OffboardingRecord

logger = logging.getLogger("identitysphere.export")

CATEGORY_TO_RISK_TYPES = {
    "orphaned_stale": "orphaned_account,stale_account",
    "over_privileged": "over_privileged,cross_platform_admin",
    "privilege_escalation": "privilege_escalation",
    "token_abuse": "token_abuse",
    "false_positive_traps": "",
    "normal": "",
}


class DatasetExporter:
    """Exports the synthetic dataset to challenge-compliant flat files."""

    def __init__(self, output_dir: str = "identitysphere/data/generated") -> None:
        self.output_dir = output_dir
        self._account_to_identity: dict[str, str] = {}
        self._files_written: list[str] = []

    def export_all(
        self,
        identities: list[Identity],
        groups: list[Group],
        roles: list[Role],
        permissions: list[Permission],
        group_memberships: list[GroupMembership],
        role_assignments: list[RoleAssignment],
        audit_events: list[AuditEvent],
        offboarding_records: list[OffboardingRecord],
        anomaly_labels: dict[str, str],
    ) -> dict[str, str]:
        """Export all 8 dataset files. Returns mapping of filename to full path."""
        os.makedirs(self.output_dir, exist_ok=True)
        self._build_account_index(identities)

        results: dict[str, str] = {}

        results["identities.csv"] = self._export_identities(identities)
        results["person_map.csv"] = self._export_person_map(identities)
        results["groups.json"] = self._export_groups(groups, group_memberships)
        results["memberships.csv"] = self._export_memberships(
            group_memberships, role_assignments
        )
        results["entitlements.csv"] = self._export_entitlements(
            role_assignments, roles, permissions
        )
        results["audit_events.csv"] = self._export_audit_events(audit_events)
        results["offboarding.csv"] = self._export_offboarding(offboarding_records)
        results["ground_truth.csv"] = self._export_ground_truth(anomaly_labels)

        self._files_written = list(results.values())
        logger.info("Exported %d dataset files to %s", len(results), self.output_dir)
        return results

    def _build_account_index(self, identities: list[Identity]) -> None:
        """Build reverse index: account_id -> identity_id."""
        for identity in identities:
            for acct in identity.accounts:
                self._account_to_identity[acct.account_id] = identity.identity_id

    # --- identities.csv ---

    def _export_identities(self, identities: list[Identity]) -> str:
        path = os.path.join(self.output_dir, "identities.csv")
        now = datetime.utcnow()
        fieldnames = [
            "acct_id", "person_id", "platform", "username", "display_name",
            "email", "type", "department", "title", "manager_id",
            "hr_status", "status", "last_login", "dormancy_days",
            "mfa_enabled", "is_admin", "created_at",
        ]

        with open(path, "w", newline="", encoding="utf-8") as f:
            writer = csv.DictWriter(f, fieldnames=fieldnames)
            writer.writeheader()
            for identity in identities:
                for acct in identity.accounts:
                    dormancy = ""
                    if acct.last_login:
                        dormancy = (now - acct.last_login).days
                    writer.writerow({
                        "acct_id": acct.account_id,
                        "person_id": identity.identity_id,
                        "platform": acct.platform.value,
                        "username": acct.username,
                        "display_name": identity.display_name,
                        "email": acct.email or identity.email,
                        "type": identity.identity_type.value,
                        "department": identity.department or "",
                        "title": identity.title or "",
                        "manager_id": identity.manager_id or "",
                        "hr_status": identity.hr_status.value,
                        "status": acct.status.value,
                        "last_login": (
                            acct.last_login.isoformat() if acct.last_login else ""
                        ),
                        "dormancy_days": dormancy,
                        "mfa_enabled": acct.mfa_enabled,
                        "is_admin": acct.is_admin,
                        "created_at": acct.created_at.isoformat(),
                    })

        row_count = sum(len(i.accounts) for i in identities)
        logger.info("  identities.csv: %d rows", row_count)
        return path

    # --- person_map.csv ---

    def _export_person_map(self, identities: list[Identity]) -> str:
        path = os.path.join(self.output_dir, "person_map.csv")
        fieldnames = [
            "person_id", "platform", "acct_id", "username", "email",
            "identity_type", "display_name",
        ]

        with open(path, "w", newline="", encoding="utf-8") as f:
            writer = csv.DictWriter(f, fieldnames=fieldnames)
            writer.writeheader()
            for identity in identities:
                for acct in identity.accounts:
                    writer.writerow({
                        "person_id": identity.identity_id,
                        "platform": acct.platform.value,
                        "acct_id": acct.account_id,
                        "username": acct.username,
                        "email": acct.email or identity.email,
                        "identity_type": identity.identity_type.value,
                        "display_name": identity.display_name,
                    })

        row_count = sum(len(i.accounts) for i in identities)
        logger.info("  person_map.csv: %d rows", row_count)
        return path

    # --- groups.json ---

    def _export_groups(
        self, groups: list[Group], memberships: list[GroupMembership]
    ) -> str:
        path = os.path.join(self.output_dir, "groups.json")

        members_by_group: dict[str, list[str]] = {}
        for m in memberships:
            if m.group_id not in members_by_group:
                members_by_group[m.group_id] = []
            members_by_group[m.group_id].append(m.account_id)

        group_index = {g.group_id: g for g in groups}

        def _resolve_ancestors(gid: str, visited: set[str] | None = None) -> list[str]:
            if visited is None:
                visited = set()
            if gid in visited:
                return []
            visited.add(gid)
            g = group_index.get(gid)
            if not g or not g.parent_group_ids:
                return []
            ancestors = list(g.parent_group_ids)
            for pid in g.parent_group_ids:
                ancestors.extend(_resolve_ancestors(pid, visited))
            return ancestors

        output = []
        for group in groups:
            output.append({
                "group_id": group.group_id,
                "platform": group.platform.value,
                "name": group.name,
                "description": group.description or f"{group.name} group on {group.platform.value}",
                "is_privileged": group.is_privileged,
                "parent_group_ids": group.parent_group_ids,
                "ancestors": _resolve_ancestors(group.group_id),
                "permission_ids": group.permission_ids,
                "members": members_by_group.get(group.group_id, []),
                "member_count": len(members_by_group.get(group.group_id, [])),
            })

        with open(path, "w", encoding="utf-8") as f:
            json.dump(output, f, indent=2)

        logger.info("  groups.json: %d groups", len(output))
        return path

    # --- memberships.csv ---

    def _export_memberships(
        self,
        group_memberships: list[GroupMembership],
        role_assignments: list[RoleAssignment],
    ) -> str:
        path = os.path.join(self.output_dir, "memberships.csv")
        fieldnames = [
            "person_id", "acct_id", "target_id", "target_type",
            "platform", "granted_at", "granted_by", "is_direct",
        ]

        with open(path, "w", newline="", encoding="utf-8") as f:
            writer = csv.DictWriter(f, fieldnames=fieldnames)
            writer.writeheader()

            for m in group_memberships:
                writer.writerow({
                    "person_id": self._account_to_identity.get(m.account_id, ""),
                    "acct_id": m.account_id,
                    "target_id": m.group_id,
                    "target_type": "group",
                    "platform": m.platform.value,
                    "granted_at": m.granted_at.isoformat(),
                    "granted_by": m.granted_by or "system",
                    "is_direct": m.is_direct,
                })

            for ra in role_assignments:
                writer.writerow({
                    "person_id": self._account_to_identity.get(ra.account_id, ""),
                    "acct_id": ra.account_id,
                    "target_id": ra.role_id,
                    "target_type": "role",
                    "platform": ra.platform.value,
                    "granted_at": ra.granted_at.isoformat(),
                    "granted_by": ra.granted_by or "system",
                    "is_direct": True,
                })

        total = len(group_memberships) + len(role_assignments)
        logger.info("  memberships.csv: %d rows (%d group, %d role)",
                     total, len(group_memberships), len(role_assignments))
        return path

    # --- entitlements.csv ---

    def _export_entitlements(
        self,
        role_assignments: list[RoleAssignment],
        roles: list[Role],
        permissions: list[Permission],
    ) -> str:
        path = os.path.join(self.output_dir, "entitlements.csv")
        role_index = {r.role_id: r for r in roles}
        perm_index = {p.permission_id: p for p in permissions}
        fieldnames = [
            "entitlement_id", "person_id", "acct_id", "platform",
            "role_id", "role_name", "is_admin_role",
            "permission_id", "resource", "action", "privilege_level",
            "is_sensitive", "granted_at",
        ]

        ent_counter = 0
        with open(path, "w", newline="", encoding="utf-8") as f:
            writer = csv.DictWriter(f, fieldnames=fieldnames)
            writer.writeheader()

            for ra in role_assignments:
                role = role_index.get(ra.role_id)
                if not role:
                    continue
                perm_ids = role.permission_ids if role.permission_ids else ["_none_"]
                for pid in perm_ids:
                    perm = perm_index.get(pid)
                    ent_counter += 1
                    writer.writerow({
                        "entitlement_id": f"ENT-{ent_counter:06d}",
                        "person_id": self._account_to_identity.get(ra.account_id, ""),
                        "acct_id": ra.account_id,
                        "platform": ra.platform.value,
                        "role_id": ra.role_id,
                        "role_name": role.name,
                        "is_admin_role": role.is_admin_role,
                        "permission_id": pid if perm else "",
                        "resource": perm.resource if perm else "",
                        "action": perm.action if perm else "",
                        "privilege_level": perm.privilege_level.value if perm else "",
                        "is_sensitive": perm.is_sensitive if perm else False,
                        "granted_at": ra.granted_at.isoformat(),
                    })

        logger.info("  entitlements.csv: %d rows", ent_counter)
        return path

    # --- audit_events.csv ---

    def _export_audit_events(self, audit_events: list[AuditEvent]) -> str:
        path = os.path.join(self.output_dir, "audit_events.csv")
        fieldnames = [
            "event_id", "timestamp", "platform", "event_type",
            "acct_id", "person_id", "source_ip", "user_agent",
            "resource", "success", "is_anomalous", "details",
        ]

        with open(path, "w", newline="", encoding="utf-8") as f:
            writer = csv.DictWriter(f, fieldnames=fieldnames)
            writer.writeheader()
            for ev in audit_events:
                writer.writerow({
                    "event_id": ev.event_id,
                    "timestamp": ev.timestamp.isoformat(),
                    "platform": ev.platform.value,
                    "event_type": ev.event_type.value,
                    "acct_id": ev.account_id,
                    "person_id": ev.identity_id or "",
                    "source_ip": ev.source_ip or "",
                    "user_agent": ev.user_agent or "",
                    "resource": ev.resource or "",
                    "success": ev.success,
                    "is_anomalous": ev.is_anomalous,
                    "details": json.dumps(ev.details) if ev.details else "",
                })

        logger.info("  audit_events.csv: %d rows", len(audit_events))
        return path

    # --- offboarding.csv ---

    def _export_offboarding(self, records: list[OffboardingRecord]) -> str:
        path = os.path.join(self.output_dir, "offboarding.csv")
        fieldnames = [
            "offboarding_id", "person_id", "employee_name",
            "hr_termination_date", "offboarding_initiated_at",
            "status", "completed_at",
            "platform", "acct_id", "disabled", "disabled_at", "disabled_by",
        ]

        row_count = 0
        with open(path, "w", newline="", encoding="utf-8") as f:
            writer = csv.DictWriter(f, fieldnames=fieldnames)
            writer.writeheader()
            for rec in records:
                for pr in rec.platform_records:
                    row_count += 1
                    writer.writerow({
                        "offboarding_id": rec.offboarding_id,
                        "person_id": rec.identity_id,
                        "employee_name": rec.employee_name,
                        "hr_termination_date": rec.hr_termination_date.isoformat(),
                        "offboarding_initiated_at": (
                            rec.offboarding_initiated_at.isoformat()
                            if rec.offboarding_initiated_at else ""
                        ),
                        "status": rec.status.value,
                        "completed_at": (
                            rec.completed_at.isoformat() if rec.completed_at else ""
                        ),
                        "platform": pr.platform.value,
                        "acct_id": pr.account_id,
                        "disabled": pr.disabled,
                        "disabled_at": (
                            pr.disabled_at.isoformat() if pr.disabled_at else ""
                        ),
                        "disabled_by": pr.disabled_by or "",
                    })

        logger.info("  offboarding.csv: %d rows (%d records x platforms)",
                     row_count, len(records))
        return path

    # --- ground_truth.csv ---

    def _export_ground_truth(self, anomaly_labels: dict[str, str]) -> str:
        path = os.path.join(self.output_dir, "ground_truth.csv")
        fieldnames = [
            "person_id", "anomaly_category", "is_anomalous",
            "is_false_positive_trap", "expected_risk_types",
        ]

        with open(path, "w", newline="", encoding="utf-8") as f:
            writer = csv.DictWriter(f, fieldnames=fieldnames)
            writer.writeheader()
            for iid, category in sorted(anomaly_labels.items()):
                is_anomalous = category not in ("normal", "false_positive_traps")
                is_fp_trap = category == "false_positive_traps"
                expected = CATEGORY_TO_RISK_TYPES.get(category, "")
                writer.writerow({
                    "person_id": iid,
                    "anomaly_category": category,
                    "is_anomalous": is_anomalous,
                    "is_false_positive_trap": is_fp_trap,
                    "expected_risk_types": expected,
                })

        logger.info("  ground_truth.csv: %d rows", len(anomaly_labels))
        return path

    # --- Validation ---

    def validate(self) -> dict[str, Any]:
        """Validate all exported files exist and have content."""
        results: dict[str, Any] = {"valid": True, "files": {}}
        expected_files = [
            "identities.csv", "person_map.csv", "groups.json",
            "memberships.csv", "entitlements.csv", "audit_events.csv",
            "offboarding.csv", "ground_truth.csv",
        ]
        for fname in expected_files:
            fpath = os.path.join(self.output_dir, fname)
            exists = os.path.exists(fpath)
            size = os.path.getsize(fpath) if exists else 0
            row_count = 0
            if exists and size > 0:
                if fname.endswith(".csv"):
                    with open(fpath, "r", encoding="utf-8") as f:
                        row_count = sum(1 for _ in f) - 1
                elif fname.endswith(".json"):
                    with open(fpath, "r", encoding="utf-8") as f:
                        data = json.load(f)
                        row_count = len(data) if isinstance(data, list) else 1
            file_ok = exists and size > 0 and row_count > 0
            results["files"][fname] = {
                "exists": exists,
                "size_bytes": size,
                "row_count": row_count,
                "valid": file_ok,
            }
            if not file_ok:
                results["valid"] = False
        return results

    @property
    def files_written(self) -> list[str]:
        return list(self._files_written)
