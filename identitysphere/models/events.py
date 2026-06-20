"""Audit and risk event models."""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any, Optional

from pydantic import BaseModel, Field

from identitysphere.models.identity import Platform


class EventType(str, Enum):
    LOGIN_SUCCESS = "login_success"
    LOGIN_FAILURE = "login_failure"
    ROLE_ASSIGNED = "role_assigned"
    ROLE_REMOVED = "role_removed"
    GROUP_ADDED = "group_added"
    GROUP_REMOVED = "group_removed"
    PERMISSION_CHANGED = "permission_changed"
    RESOURCE_ACCESS = "resource_access"
    TOKEN_CREATED = "token_created"
    TOKEN_USED = "token_used"
    PASSWORD_CHANGED = "password_changed"
    MFA_DISABLED = "mfa_disabled"
    ACCOUNT_CREATED = "account_created"
    ACCOUNT_DISABLED = "account_disabled"
    API_CALL = "api_call"


class AuditEvent(BaseModel):
    """A single audit log entry from any platform."""

    event_id: str
    timestamp: datetime
    platform: Platform
    event_type: EventType
    account_id: str
    identity_id: Optional[str] = None
    source_ip: Optional[str] = None
    user_agent: Optional[str] = None
    resource: Optional[str] = None
    details: dict[str, Any] = Field(default_factory=dict)
    success: bool = True
    is_anomalous: bool = False


class RiskSeverity(str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class RiskEvent(BaseModel):
    """A detected risk finding linked to an identity."""

    risk_id: str
    identity_id: str
    risk_type: str
    severity: RiskSeverity
    score: float = Field(ge=0.0, le=100.0)
    title: str
    description: str
    evidence: list[dict[str, Any]] = Field(default_factory=list)
    affected_platforms: list[Platform] = Field(default_factory=list)
    remediation_steps: list[str] = Field(default_factory=list)
    detected_at: datetime = Field(default_factory=datetime.utcnow)
    resolved: bool = False
    compliance_refs: list[str] = Field(default_factory=list)
