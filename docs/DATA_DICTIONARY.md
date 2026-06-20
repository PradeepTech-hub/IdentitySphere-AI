# IdentitySphere AI — Data Dictionary

Synthetic hybrid-identity dataset exported to `identitysphere/data/generated/`. All files are produced by `identitysphere/core/export.py` after pipeline generation.

## Overview

| File | Format | Rows (typical) | Purpose |
|------|--------|----------------|---------|
| `identities.csv` | CSV | ~836 | One row per platform account |
| `person_map.csv` | CSV | ~836 | Cross-platform identity mapping |
| `groups.json` | JSON | ~58 | Group hierarchy with nested inheritance |
| `memberships.csv` | CSV | varies | Account → group/role assignments |
| `entitlements.csv` | CSV | varies | Role → permission → resource chain |
| `audit_events.csv` | CSV | 800 | Login, privilege change, API access events |
| `offboarding.csv` | CSV | ~190 | Per-platform disable status after HR termination |
| `ground_truth.csv` | CSV | 370 | Labeled anomaly category per identity |

---

## identities.csv

One row per **platform account** (not per person). A person with 4 platform accounts appears 4 times.

| Column | Type | Description |
|--------|------|-------------|
| `acct_id` | string | Unique account identifier on the platform |
| `person_id` | string | Canonical identity ID (e.g. `ID-0031`) |
| `platform` | enum | `active_directory`, `azure_ad`, `aws_iam`, `okta`, `salesforce`, `servicenow`, `github` |
| `username` | string | Platform-specific login name |
| `display_name` | string | Human-readable name |
| `email` | string | Corporate email (resolver key) |
| `type` | enum | `Human`, `Service`, `External` |
| `department` | string | HR department |
| `title` | string | Job title |
| `manager_id` | string | Manager person_id |
| `hr_status` | enum | `Active`, `Terminated`, `OnLeave` |
| `status` | enum | Account status: `Active`, `Disabled`, `Dormant`, `Orphaned` |
| `last_login` | ISO datetime | Last successful login on this platform |
| `dormancy_days` | int | Days since last login |
| `mfa_enabled` | bool | MFA enrolled on this platform |
| `is_admin` | bool | Admin-equivalent privilege on this platform |
| `created_at` | ISO datetime | Account creation timestamp |

---

## person_map.csv

Resolver output: maps the same person across platforms.

| Column | Type | Description |
|--------|------|-------------|
| `person_id` | string | Canonical identity ID |
| `platform` | enum | Platform name |
| `acct_id` | string | Account on that platform |
| `username` | string | Platform username |
| `email` | string | Email used for correlation |
| `identity_type` | enum | Human / Service / External |
| `display_name` | string | Display name |

---

## groups.json

Array of group objects with nested inheritance.

| Field | Type | Description |
|-------|------|-------------|
| `group_id` | string | Unique group ID |
| `platform` | enum | Owning platform |
| `name` | string | Group display name |
| `is_privileged` | bool | Group grants elevated access |
| `parent_group_ids` | string[] | Direct parent groups |
| `ancestors` | string[] | Full ancestor chain (for privilege traversal) |
| `permission_ids` | string[] | Permissions granted by this group |
| `members` | string[] | Member account IDs |
| `member_count` | int | Number of members |

---

## memberships.csv

| Column | Type | Description |
|--------|------|-------------|
| `person_id` | string | Canonical identity |
| `acct_id` | string | Account receiving the assignment |
| `target_id` | string | Group ID or role ID |
| `target_type` | enum | `group` or `role` |
| `platform` | enum | Platform |
| `granted_at` | ISO datetime | When assignment was made |
| `granted_by` | string | Granting principal |
| `is_direct` | bool | Direct vs inherited membership |

---

## entitlements.csv

Flattened role → permission → resource chain for effective privilege calculation.

| Column | Type | Description |
|--------|------|-------------|
| `person_id` | string | Canonical identity |
| `acct_id` | string | Account |
| `role_id` | string | Assigned role |
| `role_name` | string | Role display name |
| `permission_id` | string | Permission granted |
| `permission_name` | string | Permission label |
| `resource_id` | string | Protected resource |
| `resource_name` | string | Resource label |
| `platform` | enum | Platform |
| `action` | string | `read`, `write`, `admin`, etc. |
| `is_sensitive` | bool | Sensitive data resource flag |

---

## audit_events.csv

| Column | Type | Description |
|--------|------|-------------|
| `event_id` | string | Unique event ID |
| `person_id` | string | Associated identity |
| `acct_id` | string | Account that performed action |
| `platform` | enum | Source platform |
| `event_type` | enum | `login`, `privilege_change`, `api_access`, `token_use`, etc. |
| `timestamp` | ISO datetime | Event time |
| `source_ip` | string | Source IP address |
| `user_agent` | string | Client user agent |
| `resource_accessed` | string | Target resource (if applicable) |
| `success` | bool | Whether action succeeded |
| `details` | JSON string | Extra fields (token_age_days, api_volume, unusual_hour) |

---

## offboarding.csv

One row per **(offboarding record, platform)**. Used to detect cross-platform offboarding gaps.

| Column | Type | Description |
|--------|------|-------------|
| `offboarding_id` | string | Offboarding case ID |
| `person_id` | string | Terminated employee |
| `employee_name` | string | Display name |
| `hr_termination_date` | ISO datetime | HR termination date |
| `offboarding_initiated_at` | ISO datetime | When offboarding workflow started |
| `status` | enum | `partial`, `completed` |
| `completed_at` | ISO datetime | When all platforms disabled (if complete) |
| `platform` | enum | Platform being deprovisioned |
| `acct_id` | string | Account on platform |
| `disabled` | bool | **False = gap** — account still active after termination |
| `disabled_at` | ISO datetime | When account was disabled |
| `disabled_by` | string | Automation or admin who disabled |

---

## ground_truth.csv

Labeled anomaly categories for evaluation (precision/recall).

| Column | Type | Description |
|--------|------|-------------|
| `person_id` | string | Identity ID |
| `anomaly_category` | enum | `orphaned_stale`, `over_privileged`, `privilege_escalation`, `token_abuse`, `false_positive_traps`, `normal` |
| `is_anomalous` | bool | True if any risk category except normal/FP trap |
| `is_fp_trap` | bool | Legitimate high-privilege user (on-call, role transition) |
| `expected_risk_types` | string | Comma-separated expected detector outputs |

---

## Generated pipeline artifacts (JSON)

| File | Description |
|------|-------------|
| `pipeline_report.json` | Full run summary, metrics, top 10 risky identities |
| `risk_report.html` | Printable audit report (top 10 + remediation) |
| `risk_events.json` | All detector + ML risk events |
| `identity_scores.json` | Per-identity composite scores with factor breakdown |
| `incidents.json` | DBSCAN-clustered incidents |
| `attack_graph.json` | NetworkX graph export |
| `privilege_heatmap.json` | Platform × department risk matrix |
| `blast_radii.json` | Blast radius per top-risk identity |

---

## Anomaly mix (configured)

From `identitysphere/config/settings.yaml`:

| Category | Target rate |
|----------|-------------|
| Orphaned / stale | 12% |
| Over-privileged | 10% |
| Privilege escalation | 6.5% |
| Token abuse | 4% |
| False-positive traps | 17% |
| Normal | 50.5% |
