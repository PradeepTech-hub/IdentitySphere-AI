"""Tests for the DatasetExporter."""

import csv
import json
import os
import tempfile

import pytest

from identitysphere.core.export import DatasetExporter


class TestDatasetExporter:
    def _export(self, generated_data, tmp_path):
        exporter = DatasetExporter(str(tmp_path))
        exporter.export_all(
            identities=generated_data["identities"],
            groups=generated_data["groups"],
            roles=generated_data["roles"],
            permissions=generated_data["permissions"],
            group_memberships=generated_data["group_memberships"],
            role_assignments=generated_data["role_assignments"],
            audit_events=generated_data["audit_events"],
            offboarding_records=generated_data["offboarding_records"],
            anomaly_labels=generated_data["anomaly_labels"],
        )
        return exporter

    # --- All files created ---

    def test_all_8_files_created(self, generated_data, tmp_path):
        self._export(generated_data, tmp_path)
        expected = [
            "identities.csv", "person_map.csv", "groups.json",
            "memberships.csv", "entitlements.csv", "audit_events.csv",
            "offboarding.csv", "ground_truth.csv",
        ]
        for fname in expected:
            fpath = os.path.join(str(tmp_path), fname)
            assert os.path.exists(fpath), f"Missing: {fname}"
            assert os.path.getsize(fpath) > 0, f"Empty: {fname}"

    def test_validation_passes(self, generated_data, tmp_path):
        exporter = self._export(generated_data, tmp_path)
        result = exporter.validate()
        assert result["valid"], f"Validation failed: {result['files']}"
        for fname, info in result["files"].items():
            assert info["valid"], f"{fname} invalid: {info}"

    # --- identities.csv ---

    def test_identities_row_count(self, generated_data, tmp_path):
        self._export(generated_data, tmp_path)
        expected_rows = sum(len(i.accounts) for i in generated_data["identities"])
        with open(os.path.join(str(tmp_path), "identities.csv"), encoding="utf-8") as f:
            reader = csv.DictReader(f)
            rows = list(reader)
        assert len(rows) == expected_rows

    def test_identities_columns(self, generated_data, tmp_path):
        self._export(generated_data, tmp_path)
        with open(os.path.join(str(tmp_path), "identities.csv"), encoding="utf-8") as f:
            reader = csv.DictReader(f)
            row = next(reader)
        required = [
            "acct_id", "person_id", "platform", "username", "display_name",
            "type", "department", "status", "last_login", "dormancy_days",
            "mfa_enabled",
        ]
        for col in required:
            assert col in row, f"Missing column: {col}"

    def test_identities_dormancy_populated(self, generated_data, tmp_path):
        self._export(generated_data, tmp_path)
        with open(os.path.join(str(tmp_path), "identities.csv"), encoding="utf-8") as f:
            reader = csv.DictReader(f)
            rows_with_dormancy = [r for r in reader if r["dormancy_days"]]
        assert len(rows_with_dormancy) > 0

    # --- person_map.csv ---

    def test_person_map_row_count(self, generated_data, tmp_path):
        self._export(generated_data, tmp_path)
        expected = sum(len(i.accounts) for i in generated_data["identities"])
        with open(os.path.join(str(tmp_path), "person_map.csv"), encoding="utf-8") as f:
            rows = list(csv.DictReader(f))
        assert len(rows) == expected

    def test_person_map_columns(self, generated_data, tmp_path):
        self._export(generated_data, tmp_path)
        with open(os.path.join(str(tmp_path), "person_map.csv"), encoding="utf-8") as f:
            row = next(csv.DictReader(f))
        for col in ["person_id", "platform", "acct_id", "username", "email"]:
            assert col in row

    def test_person_map_unique_acct_ids(self, generated_data, tmp_path):
        self._export(generated_data, tmp_path)
        with open(os.path.join(str(tmp_path), "person_map.csv"), encoding="utf-8") as f:
            rows = list(csv.DictReader(f))
        acct_ids = [r["acct_id"] for r in rows]
        assert len(acct_ids) == len(set(acct_ids)), "Duplicate account IDs in person_map"

    # --- groups.json ---

    def test_groups_count(self, generated_data, tmp_path):
        self._export(generated_data, tmp_path)
        with open(os.path.join(str(tmp_path), "groups.json"), encoding="utf-8") as f:
            data = json.load(f)
        assert len(data) == len(generated_data["groups"])

    def test_groups_have_members(self, generated_data, tmp_path):
        self._export(generated_data, tmp_path)
        with open(os.path.join(str(tmp_path), "groups.json"), encoding="utf-8") as f:
            data = json.load(f)
        groups_with_members = [g for g in data if g["member_count"] > 0]
        assert len(groups_with_members) > 0

    def test_groups_have_ancestors(self, generated_data, tmp_path):
        self._export(generated_data, tmp_path)
        with open(os.path.join(str(tmp_path), "groups.json"), encoding="utf-8") as f:
            data = json.load(f)
        groups_with_parents = [g for g in data if g["parent_group_ids"]]
        for g in groups_with_parents:
            assert len(g["ancestors"]) >= len(g["parent_group_ids"])

    def test_groups_fields(self, generated_data, tmp_path):
        self._export(generated_data, tmp_path)
        with open(os.path.join(str(tmp_path), "groups.json"), encoding="utf-8") as f:
            data = json.load(f)
        for field in ["group_id", "platform", "name", "description",
                      "is_privileged", "parent_group_ids", "members"]:
            assert field in data[0], f"Missing field: {field}"

    # --- memberships.csv ---

    def test_memberships_row_count(self, generated_data, tmp_path):
        self._export(generated_data, tmp_path)
        expected = (
            len(generated_data["group_memberships"])
            + len(generated_data["role_assignments"])
        )
        with open(os.path.join(str(tmp_path), "memberships.csv"), encoding="utf-8") as f:
            rows = list(csv.DictReader(f))
        assert len(rows) == expected

    def test_memberships_have_person_id(self, generated_data, tmp_path):
        self._export(generated_data, tmp_path)
        with open(os.path.join(str(tmp_path), "memberships.csv"), encoding="utf-8") as f:
            rows = list(csv.DictReader(f))
        empty_person = [r for r in rows if not r["person_id"]]
        assert len(empty_person) == 0, f"{len(empty_person)} rows missing person_id"

    def test_memberships_target_types(self, generated_data, tmp_path):
        self._export(generated_data, tmp_path)
        with open(os.path.join(str(tmp_path), "memberships.csv"), encoding="utf-8") as f:
            rows = list(csv.DictReader(f))
        types = {r["target_type"] for r in rows}
        assert "group" in types
        assert "role" in types

    # --- entitlements.csv ---

    def test_entitlements_populated(self, generated_data, tmp_path):
        self._export(generated_data, tmp_path)
        with open(os.path.join(str(tmp_path), "entitlements.csv"), encoding="utf-8") as f:
            rows = list(csv.DictReader(f))
        assert len(rows) > 0

    def test_entitlements_columns(self, generated_data, tmp_path):
        self._export(generated_data, tmp_path)
        with open(os.path.join(str(tmp_path), "entitlements.csv"), encoding="utf-8") as f:
            row = next(csv.DictReader(f))
        for col in ["entitlement_id", "person_id", "acct_id", "platform",
                     "role_id", "role_name", "is_admin_role",
                     "permission_id", "resource", "privilege_level"]:
            assert col in row, f"Missing column: {col}"

    def test_entitlements_unique_ids(self, generated_data, tmp_path):
        self._export(generated_data, tmp_path)
        with open(os.path.join(str(tmp_path), "entitlements.csv"), encoding="utf-8") as f:
            rows = list(csv.DictReader(f))
        ids = [r["entitlement_id"] for r in rows]
        assert len(ids) == len(set(ids))

    def test_entitlements_have_person_id(self, generated_data, tmp_path):
        self._export(generated_data, tmp_path)
        with open(os.path.join(str(tmp_path), "entitlements.csv"), encoding="utf-8") as f:
            rows = list(csv.DictReader(f))
        empty = [r for r in rows if not r["person_id"]]
        assert len(empty) == 0

    # --- audit_events.csv ---

    def test_audit_events_count(self, generated_data, tmp_path):
        self._export(generated_data, tmp_path)
        with open(os.path.join(str(tmp_path), "audit_events.csv"), encoding="utf-8") as f:
            rows = list(csv.DictReader(f))
        assert len(rows) == len(generated_data["audit_events"])

    def test_audit_events_columns(self, generated_data, tmp_path):
        self._export(generated_data, tmp_path)
        with open(os.path.join(str(tmp_path), "audit_events.csv"), encoding="utf-8") as f:
            row = next(csv.DictReader(f))
        for col in ["event_id", "timestamp", "platform", "event_type",
                     "acct_id", "person_id", "source_ip", "success",
                     "is_anomalous"]:
            assert col in row

    # --- offboarding.csv ---

    def test_offboarding_denormalized(self, generated_data, tmp_path):
        self._export(generated_data, tmp_path)
        expected = sum(
            len(r.platform_records) for r in generated_data["offboarding_records"]
        )
        with open(os.path.join(str(tmp_path), "offboarding.csv"), encoding="utf-8") as f:
            rows = list(csv.DictReader(f))
        assert len(rows) == expected

    def test_offboarding_columns(self, generated_data, tmp_path):
        self._export(generated_data, tmp_path)
        with open(os.path.join(str(tmp_path), "offboarding.csv"), encoding="utf-8") as f:
            row = next(csv.DictReader(f))
        for col in ["offboarding_id", "person_id", "employee_name",
                     "hr_termination_date", "status", "platform",
                     "acct_id", "disabled", "disabled_at"]:
            assert col in row

    # --- ground_truth.csv ---

    def test_ground_truth_count(self, generated_data, tmp_path):
        self._export(generated_data, tmp_path)
        with open(os.path.join(str(tmp_path), "ground_truth.csv"), encoding="utf-8") as f:
            rows = list(csv.DictReader(f))
        assert len(rows) == len(generated_data["anomaly_labels"])

    def test_ground_truth_columns(self, generated_data, tmp_path):
        self._export(generated_data, tmp_path)
        with open(os.path.join(str(tmp_path), "ground_truth.csv"), encoding="utf-8") as f:
            row = next(csv.DictReader(f))
        for col in ["person_id", "anomaly_category", "is_anomalous",
                     "is_false_positive_trap", "expected_risk_types"]:
            assert col in row

    def test_ground_truth_anomaly_flags(self, generated_data, tmp_path):
        self._export(generated_data, tmp_path)
        with open(os.path.join(str(tmp_path), "ground_truth.csv"), encoding="utf-8") as f:
            rows = list(csv.DictReader(f))
        anomalous = [r for r in rows if r["is_anomalous"] == "True"]
        fp_traps = [r for r in rows if r["is_false_positive_trap"] == "True"]
        normals = [r for r in rows if r["anomaly_category"] == "normal"]
        assert len(anomalous) > 0
        assert len(fp_traps) > 0
        assert len(normals) > 0
        for r in anomalous:
            assert r["anomaly_category"] not in ("normal", "false_positive_traps")
        for r in fp_traps:
            assert r["is_anomalous"] == "False"

    def test_ground_truth_expected_risk_types(self, generated_data, tmp_path):
        self._export(generated_data, tmp_path)
        with open(os.path.join(str(tmp_path), "ground_truth.csv"), encoding="utf-8") as f:
            rows = list(csv.DictReader(f))
        orphaned = [r for r in rows if r["anomaly_category"] == "orphaned_stale"]
        assert len(orphaned) > 0
        for r in orphaned:
            assert "orphaned_account" in r["expected_risk_types"]
