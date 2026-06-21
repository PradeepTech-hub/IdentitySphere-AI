"""Access governance API — requests, certifications, review history."""
from __future__ import annotations

import csv
import json
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field

from identitysphere.auth import service as auth
from identitysphere.core.governance_store import (
    append_review_history as gov_append_review_history,
    create_access_request as gov_create_access_request,
    get_identity_overrides,
    get_review_statuses,
    list_access_requests as gov_list_access_requests,
    list_review_history as gov_list_review_history,
    set_identity_override,
    set_review_statuses as gov_set_review_statuses,
    snapshot as gov_snapshot,
    update_access_request as gov_update_access_request,
)
from identitysphere.core.lifecycle_events import build_lifecycle_events

router = APIRouter(prefix="/api", tags=["governance"])

ROOT = Path(__file__).resolve().parent.parent.parent
DATA_DIR = ROOT / "identitysphere" / "data" / "generated"
FRONTEND_DATA = ROOT / "frontend" / "public" / "data" / "platform_data.json"

DEMO_EMPLOYEE_PROFILES: dict[str, dict[str, Any]] = {
    "employee@identitysphere.ai": {
        "person_id": "DEMO-EMP-001",
        "display_name": "Rahul Sharma",
        "email": "employee@identitysphere.ai",
        "department": "Engineering",
        "platforms": ["okta", "active_directory", "salesforce", "github"],
        "risk_score": 28,
        "severity": "Low",
        "mfa_complete": True,
        "is_admin": False,
        "status": "Active",
        "max_dormancy_days": 12,
    },
}


def _demo_employee_identity(user: dict[str, Any]) -> dict[str, Any] | None:
    email = (user.get("email") or "").strip().lower()
    if email in DEMO_EMPLOYEE_PROFILES:
        return {**DEMO_EMPLOYEE_PROFILES[email]}
    if user.get("role") != "employee":
        return None
    candidates = [
        i for i in _platform_identities()
        if not i.get("is_admin") and (i.get("platforms") or [])
    ]
    if not candidates:
        return None
    pick = candidates[hash(email) % len(candidates)]
    return {
        **pick,
        "email": user.get("email"),
        "display_name": user.get("name") or pick.get("display_name"),
    }


def _read_csv(name: str) -> list[dict[str, str]]:
    path = DATA_DIR / name
    if not path.exists():
        return []
    with open(path, encoding="utf-8") as f:
        return list(csv.DictReader(f))


def _platform_identities() -> list[dict[str, Any]]:
    if not FRONTEND_DATA.exists():
        return []
    with open(FRONTEND_DATA, encoding="utf-8") as f:
        return json.load(f).get("identities", [])


def _risk_events() -> list[dict[str, Any]]:
    path = DATA_DIR / "risk_events.json"
    if not path.exists():
        return []
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def _token_from_request(request: Request) -> str:
    auth_header = request.headers.get("Authorization", "")
    token = auth_header.removeprefix("Bearer ").strip()
    if not token:
        token = request.headers.get("X-Auth-Token", "").strip()
    return token


def get_current_user(request: Request) -> dict[str, Any]:
    user = auth.verify_auth_token(_token_from_request(request))
    if not user:
        raise HTTPException(401, {"error": "Invalid or expired session. Please sign in again."})
    return user


def get_optional_user(request: Request) -> dict[str, Any] | None:
    return auth.verify_auth_token(_token_from_request(request))


class AccessRequestCreate(BaseModel):
    platform: str
    role: str
    durationDays: int = Field(default=7, ge=1, le=90)
    justification: str = ""
    employeeName: str | None = None


class AccessRequestUpdate(BaseModel):
    status: str
    reviewedBy: str | None = None


class ReviewStatusUpdate(BaseModel):
    statuses: dict[str, str] = Field(default_factory=dict)


class ReviewHistoryEntry(BaseModel):
    id: str
    reviewId: str
    identity: str
    platform: str
    role: str
    action: str
    reviewer: str
    timestamp: str
    riskBefore: float | None = None
    riskAfter: float | None = None


class IdentityPatch(BaseModel):
    risk_score: float | None = None
    severity: str | None = None


@router.get("/governance/snapshot")
def governance_snapshot():
    return gov_snapshot()


@router.get("/access-requests")
def access_requests(
    status: str | None = None,
    employee_email: str | None = Query(default=None, alias="employeeEmail"),
    user: dict | None = Depends(get_optional_user),
):
    email_filter = employee_email
    if user and user.get("role") == "employee":
        email_filter = user.get("email")
    rows = gov_list_access_requests(status=status, employee_email=email_filter)
    return rows


@router.post("/access-requests")
def create_access_request(body: AccessRequestCreate, user: dict = Depends(get_current_user)):
    if user.get("role") not in ("employee", "admin"):
        raise HTTPException(403, {"error": "Only employees can submit access requests."})
    return gov_create_access_request({
        "employeeEmail": user["email"],
        "employeeName": body.employeeName or user.get("name") or user["email"].split("@")[0],
        "platform": body.platform,
        "role": body.role,
        "durationDays": body.durationDays,
        "justification": body.justification,
    })


@router.patch("/access-requests/{req_id}")
def patch_access_request(req_id: str, body: AccessRequestUpdate, user: dict = Depends(get_current_user)):
    if user.get("role") not in ("admin", "auditor"):
        raise HTTPException(403, {"error": "Admin access required."})
    try:
        updates: dict[str, Any] = {"status": body.status}
        updates["reviewedBy"] = body.reviewedBy or user.get("name") or user.get("email")
        updates["reviewedAt"] = datetime.now(timezone.utc).isoformat()
        if body.status == "approved":
            existing = next((r for r in gov_list_access_requests() if r["id"] == req_id), None)
            if existing:
                expires = datetime.now(timezone.utc) + timedelta(days=int(existing.get("durationDays", 7)))
                updates["expiresAt"] = expires.isoformat()
        elif body.status == "rejected":
            updates["expiresAt"] = None
        return gov_update_access_request(req_id, updates)
    except KeyError as exc:
        raise HTTPException(404, {"error": f"Request {req_id} not found"}) from exc


@router.get("/review-history")
def review_history(limit: int = Query(default=50, ge=1, le=200)):
    return gov_list_review_history(limit=limit)


@router.post("/review-history")
def post_review_history(entries: list[ReviewHistoryEntry], user: dict = Depends(get_current_user)):
    if user.get("role") not in ("admin", "auditor"):
        raise HTTPException(403, {"error": "Admin access required."})
    payload = [e.model_dump() for e in entries]
    for entry in payload:
        if not entry.get("reviewer"):
            entry["reviewer"] = user.get("name") or user.get("email")
    return gov_append_review_history(payload)


@router.get("/review-statuses")
def review_statuses():
    return get_review_statuses()


@router.put("/review-statuses")
def put_review_statuses(body: ReviewStatusUpdate, user: dict = Depends(get_current_user)):
    if user.get("role") not in ("admin", "auditor"):
        raise HTTPException(403, {"error": "Admin access required."})
    return gov_set_review_statuses(body.statuses)


@router.patch("/identities/{person_id}")
def patch_identity(person_id: str, body: IdentityPatch, user: dict = Depends(get_current_user)):
    if user.get("role") not in ("admin", "auditor"):
        raise HTTPException(403, {"error": "Admin access required."})
    updates = body.model_dump(exclude_none=True)
    if not updates:
        raise HTTPException(400, {"error": "No updates provided."})
    return {"person_id": person_id, **set_identity_override(person_id, updates)}


@router.get("/employee/profile")
def employee_profile(user: dict = Depends(get_current_user)):
    identities = _platform_identities()
    email = (user.get("email") or "").lower()
    name = (user.get("name") or "").lower()
    overrides = get_identity_overrides()

    match = None
    for ident in identities:
        if (ident.get("email") or "").lower() == email:
            match = ident
            break
        if name and (ident.get("display_name") or "").lower() == name:
            match = ident
            break

    if not match and user.get("role") == "employee":
        match = _demo_employee_identity(user)

    if not match:
        return {"identity": None, "user": user}

    pid = match.get("person_id")
    if pid and pid in overrides:
        match = {**match, **overrides[pid]}
    return {"identity": match, "user": user}


@router.get("/employee/activity")
def employee_activity(user: dict = Depends(get_current_user)):
    profile = employee_profile(user)
    identity = profile.get("identity") or {}
    name = identity.get("display_name") or user.get("name") or ""

    lifecycle = build_lifecycle_events(
        _read_csv("offboarding.csv"),
        _risk_events(),
        _platform_identities(),
    )
    lifecycle_rows = [e for e in lifecycle if (e.get("identity") or "").lower() == name.lower()]

    requests = gov_list_access_requests(employee_email=user.get("email"))
    return {"lifecycle": lifecycle_rows, "requests": requests}
