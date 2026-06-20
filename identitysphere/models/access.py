"""Access control models — groups, roles, permissions, and their relationships."""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field

from identitysphere.models.identity import Platform


class PrivilegeLevel(str, Enum):
    READ = "read"
    WRITE = "write"
    ADMIN = "admin"
    SUPER_ADMIN = "super_admin"


class Permission(BaseModel):
    """An atomic permission on a platform resource."""

    permission_id: str
    platform: Platform
    resource: str
    action: str
    privilege_level: PrivilegeLevel = PrivilegeLevel.READ
    is_sensitive: bool = False


class Group(BaseModel):
    """A group on a specific platform that can contain users or other groups."""

    group_id: str
    platform: Platform
    name: str
    description: Optional[str] = None
    parent_group_ids: list[str] = Field(default_factory=list)
    permission_ids: list[str] = Field(default_factory=list)
    is_privileged: bool = False


class Role(BaseModel):
    """A role on a specific platform that bundles permissions."""

    role_id: str
    platform: Platform
    name: str
    description: Optional[str] = None
    permission_ids: list[str] = Field(default_factory=list)
    is_admin_role: bool = False
    is_builtin: bool = True


class GroupMembership(BaseModel):
    """Links an identity (or group) to a group."""

    account_id: str
    group_id: str
    platform: Platform
    granted_at: datetime = Field(default_factory=datetime.utcnow)
    granted_by: Optional[str] = None
    is_direct: bool = True


class RoleAssignment(BaseModel):
    """Links an identity to a role on a platform."""

    account_id: str
    role_id: str
    platform: Platform
    granted_at: datetime = Field(default_factory=datetime.utcnow)
    granted_by: Optional[str] = None
    scope: Optional[str] = None


class PermissionGrant(BaseModel):
    """Direct permission grant to an identity (outside of role/group)."""

    account_id: str
    permission_id: str
    platform: Platform
    granted_at: datetime = Field(default_factory=datetime.utcnow)
    expires_at: Optional[datetime] = None
