"""Aggregate cross-platform offboarding gaps from offboarding records and risk events."""

from __future__ import annotations

from collections import defaultdict
from datetime import datetime
from typing import Any


def _parse_dt(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


def _days_since(value: str | None) -> int | None:
    dt = _parse_dt(value)
    if not dt:
        return None
    return max(0, (datetime.utcnow() - dt.replace(tzinfo=None)).days)


def compute_offboarding_gaps(
    offboarding_rows: list[dict[str, str]],
    risk_events: list[dict[str, Any]] | None = None,
) -> list[dict[str, Any]]:
    """Build per-person offboarding gap records from flat offboarding.csv rows."""
    by_person: dict[str, dict[str, Any]] = {}

    for row in offboarding_rows:
        person_id = row.get("person_id", "")
        if not person_id:
            continue

        disabled = str(row.get("disabled", "")).lower() in ("true", "1", "yes")
        platform = row.get("platform", "")

        if person_id not in by_person:
            by_person[person_id] = {
                "person_id": person_id,
                "display_name": row.get("employee_name", person_id),
                "termination_date": row.get("hr_termination_date", ""),
                "offboarding_status": row.get("status", "partial"),
                "active_platforms": [],
                "disabled_platforms": [],
                "platform_details": [],
                "days_since_termination": _days_since(row.get("hr_termination_date")),
            }

        entry = by_person[person_id]
        detail = {
            "platform": platform,
            "acct_id": row.get("acct_id", ""),
            "disabled": disabled,
            "disabled_at": row.get("disabled_at", ""),
            "disabled_by": row.get("disabled_by", ""),
        }
        entry["platform_details"].append(detail)
        if disabled:
            if platform not in entry["disabled_platforms"]:
                entry["disabled_platforms"].append(platform)
        else:
            if platform not in entry["active_platforms"]:
                entry["active_platforms"].append(platform)

    gaps: list[dict[str, Any]] = []
    for entry in by_person.values():
        if not entry["active_platforms"]:
            continue

        gap_count = len(entry["active_platforms"])
        days = entry["days_since_termination"] or 0
        if days <= 7:
            severity = "high"
        elif days <= 30:
            severity = "critical"
        else:
            severity = "critical"

        remediation = [
            f"Immediately disable account on {p.replace('_', ' ').title()}"
            for p in entry["active_platforms"]
        ] + ["Audit access logs since termination date", "Update offboarding automation runbook"]

        gaps.append({
            **entry,
            "gap_count": gap_count,
            "severity": severity,
            "type": "offboarding_gap",
            "title": (
                f"Offboarding gap: {entry['display_name']} — "
                f"{gap_count} platform(s) still active ({days}d since termination)"
            ),
            "remediation_steps": remediation,
            "compliance_refs": ["NIST AC-2", "MITRE T1078", "GDPR Art. 32", "CIS 5"],
        })

    risk_events = risk_events or []
    orphan_by_person = {
        e.get("identityId"): e
        for e in risk_events
        if e.get("type") in ("orphaned_account", "offboarding_gap")
    }
    for gap in gaps:
        extra = orphan_by_person.get(gap["person_id"])
        if extra:
            gap["risk_score"] = extra.get("score")
            gap["risk_event_id"] = extra.get("id")
            if extra.get("remediation_steps"):
                gap["remediation_steps"] = list(
                    dict.fromkeys(extra["remediation_steps"] + gap["remediation_steps"])
                )[:10]

    gaps.sort(key=lambda g: (g.get("days_since_termination") or 0, g["gap_count"]), reverse=True)
    return gaps
