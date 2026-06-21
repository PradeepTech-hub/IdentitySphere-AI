"""Derive lifecycle (JML) events from pipeline offboarding and identity data."""

from __future__ import annotations

from typing import Any

from identitysphere.core.offboarding_gaps import compute_offboarding_gaps


def build_lifecycle_events(
    offboarding_rows: list[dict[str, str]],
    risk_events: list[dict[str, Any]] | None = None,
    identities: list[dict[str, Any]] | None = None,
) -> list[dict[str, Any]]:
    """Build leaver/offboarding lifecycle events from pipeline offboarding gaps."""
    gaps = compute_offboarding_gaps(offboarding_rows, risk_events)
    events: list[dict[str, Any]] = []

    for gap in gaps:
        active = gap.get("active_platforms") or []
        disabled = gap.get("disabled_platforms") or []
        all_platforms = list(dict.fromkeys(active + disabled))
        events.append({
            "id": f"JML-LEA-{gap['person_id']}",
            "type": "leaver",
            "identity": gap["display_name"],
            "person_id": gap["person_id"],
            "department": _dept_for(gap["person_id"], identities),
            "date": (gap.get("termination_date") or "")[:10],
            "status": "pending_review" if active else "completed",
            "platforms": all_platforms,
            "actions": [
                *(f"Disable {p.replace('_', ' ').title()}" for p in active),
                *(f"Disabled {p.replace('_', ' ').title()}" for p in disabled),
            ],
            "approver": None if active else "offboarding-automation",
            "gap_count": gap.get("gap_count", 0),
            "days_since_termination": gap.get("days_since_termination"),
            "severity": gap.get("severity", "high"),
            "source": "pipeline",
        })

    if identities:
        for ident in identities:
            status = (ident.get("status") or "").lower()
            if status == "active" and (ident.get("platform_count") or 0) >= 1:
                created = ident.get("created_at") or ident.get("person_id", "")
                events.append({
                    "id": f"JML-JOI-{ident['person_id']}",
                    "type": "joiner",
                    "identity": ident.get("display_name", ident["person_id"]),
                    "person_id": ident["person_id"],
                    "department": ident.get("department", ""),
                    "date": str(created)[:10] if len(str(created)) >= 10 else "",
                    "status": "completed",
                    "platforms": ident.get("platforms") or [],
                    "actions": [f"Provisioned on {p.replace('_', ' ').title()}" for p in (ident.get("platforms") or [])[:4]],
                    "approver": "hr-provisioning",
                    "source": "pipeline",
                })

    events.sort(key=lambda e: e.get("date") or "", reverse=True)
    return events[:120]


def _dept_for(person_id: str, identities: list[dict[str, Any]] | None) -> str:
    if not identities:
        return ""
    for ident in identities:
        if ident.get("person_id") == person_id:
            return ident.get("department", "")
    return ""
