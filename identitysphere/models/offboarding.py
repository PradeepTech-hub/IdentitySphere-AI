"""Offboarding lifecycle models."""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field

from identitysphere.models.identity import Platform


class OffboardingStatus(str, Enum):
    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    FAILED = "failed"
    PARTIAL = "partial"


class PlatformDisableRecord(BaseModel):
    """Tracks whether a specific platform account was disabled during offboarding."""

    platform: Platform
    account_id: str
    disabled: bool = False
    disabled_at: Optional[datetime] = None
    disabled_by: Optional[str] = None
    error: Optional[str] = None


class OffboardingRecord(BaseModel):
    """Tracks the offboarding lifecycle for a terminated identity."""

    offboarding_id: str
    identity_id: str
    employee_name: str
    hr_termination_date: datetime
    offboarding_initiated_at: Optional[datetime] = None
    status: OffboardingStatus = OffboardingStatus.PENDING
    platform_records: list[PlatformDisableRecord] = Field(default_factory=list)
    completed_at: Optional[datetime] = None

    @property
    def gap_platforms(self) -> list[Platform]:
        return [r.platform for r in self.platform_records if not r.disabled]

    @property
    def days_since_termination(self) -> int:
        return (datetime.utcnow() - self.hr_termination_date).days

    @property
    def has_gap(self) -> bool:
        return len(self.gap_platforms) > 0
