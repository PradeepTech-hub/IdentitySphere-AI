"""Inject cross-platform duplicate identity fragments to exercise the resolver.

Synthetic data is pre-unified by person_id. This module splits a subset of
identities into separate records with variant emails/usernames so the
IdentityResolver must merge them before privilege calculation.
"""

from __future__ import annotations

import copy
import logging
import re
import uuid
from typing import Any

from identitysphere.models.identity import Identity, PlatformAccount

logger = logging.getLogger("identitysphere.duplicate_injector")


def _email_variant(email: str, variant: int) -> str:
    local, _, domain = email.partition("@")
    if variant == 0:
        return email
    if "." in local:
        parts = local.split(".")
        return f"{parts[0][0]}{parts[-1]}@{domain}"
    return f"{local}{variant}@{domain}"


def inject_cross_platform_duplicates(
    identities: dict[str, Identity],
    count: int = 15,
    config: dict[str, Any] | None = None,
) -> dict[str, Identity]:
    """Split *count* multi-platform identities into duplicate fragments."""
    cfg = (config or {}).get("duplicate_injector", {})
    count = int(cfg.get("fragment_count", count))

    candidates = [
        iid
        for iid, ident in identities.items()
        if len(ident.accounts) >= 2 and ident.identity_type.value == "human"
    ]
    candidates.sort()
    selected = candidates[:count]

    result = copy.deepcopy(identities)
    fragments_created = 0

    for iid in selected:
        primary = result[iid]
        if len(primary.accounts) < 2:
            continue

        split_acct = primary.accounts.pop()
        frag_id = f"{iid}-FRAG"
        local = primary.email.split("@")[0]
        username_variant = re.sub(r"[^a-z0-9]", "", local.lower())[:12] or "user"
        # Keep the same email so the resolver's email index can merge fragments.
        variant_email = primary.email

        frag_acct = PlatformAccount(
            platform=split_acct.platform,
            account_id=split_acct.account_id,
            username=username_variant if split_acct.username != username_variant else f"{username_variant}2",
            email=variant_email,
            status=split_acct.status,
            roles=list(split_acct.roles),
            groups=list(split_acct.groups),
            last_login=split_acct.last_login,
            created_at=split_acct.created_at,
            mfa_enabled=split_acct.mfa_enabled,
            is_admin=split_acct.is_admin,
        )

        result[frag_id] = Identity(
            identity_id=frag_id,
            display_name=primary.display_name,
            email=variant_email,
            identity_type=primary.identity_type,
            department=primary.department,
            title=primary.title,
            manager_id=primary.manager_id,
            hr_status=primary.hr_status,
            hr_termination_date=primary.hr_termination_date,
            accounts=[frag_acct],
            tags=dict(primary.tags),
        )
        primary.email = _email_variant(primary.email, 0)
        fragments_created += 1

    logger.info(
        "Duplicate injection: %d fragments from %d identities (%d -> %d records)",
        fragments_created,
        len(selected),
        len(identities),
        len(result),
    )
    return result
