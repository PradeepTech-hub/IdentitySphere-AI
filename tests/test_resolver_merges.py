"""Tests for cross-platform duplicate injection and resolver merges."""

from identitysphere.core.duplicate_injector import inject_cross_platform_duplicates
from identitysphere.core.resolver import IdentityResolver
from identitysphere.models.identity import (
    Identity,
    IdentityStatus,
    IdentityType,
    Platform,
    PlatformAccount,
)


def _make_identity(iid: str, name: str, email: str, platforms: list[Platform]) -> Identity:
    accounts = [
        PlatformAccount(
            platform=p,
            account_id=f"{p.value}-{iid}",
            username=email.split("@")[0].replace(".", ""),
            email=email,
            status=IdentityStatus.ACTIVE,
        )
        for p in platforms
    ]
    return Identity(
        identity_id=iid,
        display_name=name,
        email=email,
        identity_type=IdentityType.HUMAN,
        department="Engineering",
        accounts=accounts,
    )


def test_duplicate_injection_creates_fragments():
    identities = {
        "ID-001": _make_identity(
            "ID-001", "Jane Doe", "jane.doe@corp.com",
            [Platform.AD, Platform.AWS, Platform.OKTA],
        ),
    }
    expanded = inject_cross_platform_duplicates(identities, count=1)
    assert len(expanded) == 2
    assert any(k.endswith("-FRAG") for k in expanded)


def test_resolver_merges_duplicate_fragments():
    primary = _make_identity(
        "ID-001", "Jane Doe", "jane.doe@corp.com",
        [Platform.AD, Platform.AWS],
    )
    fragment = _make_identity(
        "ID-001-FRAG", "Jane Doe", "jane.doe@corp.com",
        [Platform.OKTA],
    )
    fragment.accounts[0].username = "jdoe"

    resolver = IdentityResolver({"identity_resolver": {"min_confidence_threshold": 0.55}})
    resolved = resolver.resolve({"ID-001": primary, "ID-001-FRAG": fragment})

    assert resolver.resolution_result.merges_performed >= 1
    assert len(resolved) == 1
    merged = resolved["ID-001"]
    assert len(merged.accounts) == 3
