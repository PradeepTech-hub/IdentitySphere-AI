"""Identity domain models — human users, service accounts, and cross-platform accounts."""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field


class Platform(str, Enum):
    AD = "active_directory"
    AWS = "aws_iam"
    OKTA = "okta"
    GITHUB = "github"
    SALESFORCE = "salesforce"


class IdentityType(str, Enum):
    HUMAN = "human"
    SERVICE = "service"
    EXTERNAL = "external"


class IdentityStatus(str, Enum):
    ACTIVE = "active"
    DISABLED = "disabled"
    SUSPENDED = "suspended"
    TERMINATED = "terminated"


class PlatformAccount(BaseModel):
    """A single account on a specific platform linked to a unified identity."""

    platform: Platform
    account_id: str
    username: str
    email: Optional[str] = None
    status: IdentityStatus = IdentityStatus.ACTIVE
    roles: list[str] = Field(default_factory=list)
    groups: list[str] = Field(default_factory=list)
    last_login: Optional[datetime] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    mfa_enabled: bool = False
    is_admin: bool = False


class Identity(BaseModel):
    """Unified identity that spans multiple platform accounts."""

    identity_id: str
    display_name: str
    email: str
    identity_type: IdentityType = IdentityType.HUMAN
    department: Optional[str] = None
    title: Optional[str] = None
    manager_id: Optional[str] = None
    hr_status: IdentityStatus = IdentityStatus.ACTIVE
    hr_termination_date: Optional[datetime] = None
    accounts: list[PlatformAccount] = Field(default_factory=list)
    tags: dict[str, str] = Field(default_factory=dict)

    @property
    def active_platforms(self) -> list[Platform]:
        return [a.platform for a in self.accounts if a.status == IdentityStatus.ACTIVE]

    @property
    def is_cross_platform_admin(self) -> bool:
        admin_platforms = [a.platform for a in self.accounts if a.is_admin and a.status == IdentityStatus.ACTIVE]
        return len(admin_platforms) >= 2

    @property
    def has_offboarding_gap(self) -> bool:
        if self.hr_status != IdentityStatus.TERMINATED:
            return False
        return any(a.status == IdentityStatus.ACTIVE for a in self.accounts)

    @property
    def stale_accounts(self) -> list[PlatformAccount]:
        from datetime import timedelta

        cutoff = datetime.utcnow() - timedelta(days=90)
        return [
            a
            for a in self.accounts
            if a.status == IdentityStatus.ACTIVE and a.last_login and a.last_login < cutoff
        ]
