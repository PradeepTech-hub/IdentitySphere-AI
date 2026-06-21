"""Persistent JSON store for access requests, review history, and certification statuses."""
from __future__ import annotations

import json
import threading
import time
from pathlib import Path
from typing import Any

DATA_FILE = Path(__file__).resolve().parent.parent / "data" / "generated" / "governance.json"
_lock = threading.Lock()

_DEFAULT: dict[str, Any] = {
    "access_requests": [],
    "review_history": [],
    "review_statuses": {},
    "identity_overrides": {},
}


def _load() -> dict[str, Any]:
    if not DATA_FILE.exists():
        return json.loads(json.dumps(_DEFAULT))
    try:
        with open(DATA_FILE, encoding="utf-8") as f:
            data = json.load(f)
    except (json.JSONDecodeError, OSError):
        data = {}
    merged = json.loads(json.dumps(_DEFAULT))
    merged.update({k: data.get(k, v) for k, v in _DEFAULT.items()})
    return merged


def _save(data: dict[str, Any]) -> None:
    DATA_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(DATA_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)


def snapshot() -> dict[str, Any]:
    with _lock:
        return _load()


def list_access_requests(
    *,
    status: str | None = None,
    employee_email: str | None = None,
) -> list[dict[str, Any]]:
    with _lock:
        data = _load()
        rows = list(data.get("access_requests", []))
    if status:
        rows = [r for r in rows if r.get("status") == status]
    if employee_email:
        email = employee_email.strip().lower()
        rows = [r for r in rows if (r.get("employeeEmail") or "").lower() == email]
    rows = sorted(rows, key=lambda r: r.get("createdAt", ""), reverse=True)
    return _maybe_expire_requests(rows)


def create_access_request(payload: dict[str, Any]) -> dict[str, Any]:
    with _lock:
        data = _load()
        req = {
            "id": payload.get("id") or f"REQ-{int(time.time() * 1000)}",
            "employeeEmail": payload["employeeEmail"],
            "employeeName": payload.get("employeeName", ""),
            "platform": payload["platform"],
            "role": payload["role"],
            "durationDays": int(payload.get("durationDays", 7)),
            "justification": payload.get("justification", ""),
            "status": "pending",
            "createdAt": payload.get("createdAt") or _iso_now(),
            "expiresAt": None,
            "reviewedBy": None,
            "reviewedAt": None,
        }
        data["access_requests"].insert(0, req)
        _save(data)
        return req


def update_access_request(req_id: str, updates: dict[str, Any]) -> dict[str, Any]:
    with _lock:
        data = _load()
        for i, row in enumerate(data["access_requests"]):
            if row.get("id") == req_id:
                merged = {**row, **updates}
                data["access_requests"][i] = merged
                _save(data)
                return merged
    raise KeyError(req_id)


def list_review_history(limit: int = 100) -> list[dict[str, Any]]:
    with _lock:
        rows = list(_load().get("review_history", []))
    return rows[:limit]


def append_review_history(entries: list[dict[str, Any]]) -> list[dict[str, Any]]:
    with _lock:
        data = _load()
        for entry in entries:
            data["review_history"].insert(0, entry)
        data["review_history"] = data["review_history"][:500]
        _save(data)
        return data["review_history"]


def get_review_statuses() -> dict[str, str]:
    with _lock:
        return dict(_load().get("review_statuses", {}))


def set_review_status(key: str, status: str) -> dict[str, str]:
    with _lock:
        data = _load()
        data["review_statuses"][key] = status
        _save(data)
        return dict(data["review_statuses"])


def set_review_statuses(updates: dict[str, str]) -> dict[str, str]:
    with _lock:
        data = _load()
        data["review_statuses"].update(updates)
        _save(data)
        return dict(data["review_statuses"])


def set_identity_override(person_id: str, updates: dict[str, Any]) -> dict[str, Any]:
    with _lock:
        data = _load()
        current = data["identity_overrides"].get(person_id, {})
        current.update(updates)
        data["identity_overrides"][person_id] = current
        _save(data)
        return current


def get_identity_overrides() -> dict[str, dict[str, Any]]:
    with _lock:
        return dict(_load().get("identity_overrides", {}))


def _iso_now() -> str:
    from datetime import datetime, timezone

    return datetime.now(timezone.utc).isoformat()


def _maybe_expire_requests(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    from datetime import datetime, timezone

    now = datetime.now(timezone.utc)
    changed = False
    for row in rows:
        if row.get("status") != "approved" or not row.get("expiresAt"):
            continue
        try:
            expires = datetime.fromisoformat(row["expiresAt"].replace("Z", "+00:00"))
        except ValueError:
            continue
        if expires.tzinfo is None:
            expires = expires.replace(tzinfo=timezone.utc)
        if expires < now:
            row["status"] = "expired"
            changed = True
    if changed:
        with _lock:
            data = _load()
            by_id = {r.get("id"): r for r in rows}
            data["access_requests"] = [
                by_id.get(r.get("id"), r) for r in data.get("access_requests", [])
            ]
            _save(data)
    return rows
