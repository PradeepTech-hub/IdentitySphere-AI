"""Cross-Platform Identity Resolver — maps the same human across AD, AWS IAM, Okta, GitHub, Salesforce.

Resolution strategy (multi-signal weighted matching):
  1. Email exact match  (weight 1.0) — strongest signal, same email across platforms
  2. Name fuzzy match   (weight 0.7) — handles "John Smith" vs "jsmith" vs "john.smith"
  3. Username pattern   (weight 0.5) — detects common patterns: first.last, flast, firstl

The resolver produces a confidence score per candidate pair and merges accounts
above the min_confidence_threshold into unified Identity objects.

This runs AFTER ingestion and BEFORE privilege calculation, so downstream
modules always operate on resolved (deduplicated) identities.
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass, field
from difflib import SequenceMatcher
from typing import Any

from identitysphere.models.identity import (
    Identity,
    IdentityType,
    Platform,
    PlatformAccount,
    IdentityStatus,
)

logger = logging.getLogger("identitysphere.resolver")


@dataclass
class ResolutionCandidate:
    """A potential match between two platform accounts."""

    account_a: PlatformAccount
    account_b: PlatformAccount
    identity_a_id: str
    identity_b_id: str
    email_score: float = 0.0
    name_score: float = 0.0
    username_score: float = 0.0
    confidence: float = 0.0
    signals: list[str] = field(default_factory=list)


@dataclass
class ResolutionResult:
    """Summary of the identity resolution pass."""

    total_identities_before: int = 0
    total_identities_after: int = 0
    merges_performed: int = 0
    unresolved_accounts: int = 0
    avg_confidence: float = 0.0
    candidates_evaluated: int = 0


class IdentityResolver:
    """Resolves and deduplicates identities across platforms using multi-signal matching."""

    def __init__(self, config: dict[str, Any] | None = None) -> None:
        cfg = config or {}
        resolver_cfg = cfg.get("identity_resolver", cfg)
        self.email_weight: float = resolver_cfg.get("email_match_weight", 1.0)
        self.name_weight: float = resolver_cfg.get("name_match_weight", 0.7)
        self.username_weight: float = resolver_cfg.get("username_pattern_weight", 0.5)
        self.min_confidence: float = resolver_cfg.get("min_confidence_threshold", 0.6)

        self.resolution_result = ResolutionResult()

    def resolve(self, identities: dict[str, Identity]) -> dict[str, Identity]:
        """Run cross-platform identity resolution.

        Compares accounts across different platforms within each identity and across
        identities. Returns a deduplicated identity map where matched accounts are
        merged under a single identity.
        """
        logger.info("Starting identity resolution for %d identities...", len(identities))
        self.resolution_result.total_identities_before = len(identities)

        email_index = self._build_email_index(identities)
        name_index = self._build_name_index(identities)

        merge_groups = self._find_merge_groups(identities, email_index, name_index)

        resolved = self._execute_merges(identities, merge_groups)

        self.resolution_result.total_identities_after = len(resolved)
        self.resolution_result.merges_performed = (
            self.resolution_result.total_identities_before
            - self.resolution_result.total_identities_after
        )

        self._validate_resolution(resolved)

        logger.info(
            "Resolution complete: %d -> %d identities (%d merges, avg confidence %.2f)",
            self.resolution_result.total_identities_before,
            self.resolution_result.total_identities_after,
            self.resolution_result.merges_performed,
            self.resolution_result.avg_confidence,
        )
        return resolved

    def _build_email_index(
        self, identities: dict[str, Identity]
    ) -> dict[str, list[str]]:
        """Index: normalized email → list of identity_ids."""
        index: dict[str, list[str]] = {}
        for iid, identity in identities.items():
            email_key = identity.email.lower().strip()
            if email_key not in index:
                index[email_key] = []
            index[email_key].append(iid)

            for account in identity.accounts:
                if account.email:
                    acct_email = account.email.lower().strip()
                    if acct_email not in index:
                        index[acct_email] = []
                    if iid not in index[acct_email]:
                        index[acct_email].append(iid)
        return index

    def _build_name_index(
        self, identities: dict[str, Identity]
    ) -> dict[str, list[str]]:
        """Index: normalized name → list of identity_ids."""
        index: dict[str, list[str]] = {}
        for iid, identity in identities.items():
            name_key = self._normalize_name(identity.display_name)
            if name_key not in index:
                index[name_key] = []
            index[name_key].append(iid)
        return index

    def _find_merge_groups(
        self,
        identities: dict[str, Identity],
        email_index: dict[str, list[str]],
        name_index: dict[str, list[str]],
    ) -> list[set[str]]:
        """Find groups of identity IDs that should be merged."""
        pair_scores: dict[tuple[str, str], ResolutionCandidate] = {}

        for email, iids in email_index.items():
            if len(iids) > 1:
                for i in range(len(iids)):
                    for j in range(i + 1, len(iids)):
                        pair = (min(iids[i], iids[j]), max(iids[i], iids[j]))
                        if pair not in pair_scores:
                            candidate = self._score_pair(
                                identities[pair[0]], identities[pair[1]]
                            )
                            pair_scores[pair] = candidate
                            self.resolution_result.candidates_evaluated += 1

        for name, iids in name_index.items():
            if len(iids) > 1 and len(iids) <= 5:
                for i in range(len(iids)):
                    for j in range(i + 1, len(iids)):
                        pair = (min(iids[i], iids[j]), max(iids[i], iids[j]))
                        if pair not in pair_scores:
                            candidate = self._score_pair(
                                identities[pair[0]], identities[pair[1]]
                            )
                            pair_scores[pair] = candidate
                            self.resolution_result.candidates_evaluated += 1

        confident_pairs: list[tuple[str, str]] = []
        total_conf = 0.0
        count = 0
        for pair, candidate in pair_scores.items():
            if candidate.confidence >= self.min_confidence:
                confident_pairs.append(pair)
                total_conf += candidate.confidence
                count += 1

        if count > 0:
            self.resolution_result.avg_confidence = total_conf / count

        return self._union_find(confident_pairs)

    def _score_pair(self, id_a: Identity, id_b: Identity) -> ResolutionCandidate:
        """Score the likelihood that two identities are the same person."""
        candidate = ResolutionCandidate(
            account_a=id_a.accounts[0] if id_a.accounts else PlatformAccount(
                platform=Platform.AD, account_id="unknown", username="unknown"
            ),
            account_b=id_b.accounts[0] if id_b.accounts else PlatformAccount(
                platform=Platform.AD, account_id="unknown", username="unknown"
            ),
            identity_a_id=id_a.identity_id,
            identity_b_id=id_b.identity_id,
        )

        if id_a.email.lower() == id_b.email.lower():
            candidate.email_score = 1.0
            candidate.signals.append("exact_email_match")

        name_sim = self._name_similarity(id_a.display_name, id_b.display_name)
        candidate.name_score = name_sim
        if name_sim > 0.8:
            candidate.signals.append(f"name_match({name_sim:.2f})")

        username_sim = self._username_similarity(id_a, id_b)
        candidate.username_score = username_sim
        if username_sim > 0.6:
            candidate.signals.append(f"username_pattern({username_sim:.2f})")

        max_weight = self.email_weight + self.name_weight + self.username_weight
        candidate.confidence = (
            candidate.email_score * self.email_weight
            + candidate.name_score * self.name_weight
            + candidate.username_score * self.username_weight
        ) / max_weight

        return candidate

    def _name_similarity(self, name_a: str, name_b: str) -> float:
        na = self._normalize_name(name_a)
        nb = self._normalize_name(name_b)
        if na == nb:
            return 1.0
        return SequenceMatcher(None, na, nb).ratio()

    def _normalize_name(self, name: str) -> str:
        name = name.lower().strip()
        name = re.sub(r"[^a-z\s]", "", name)
        parts = sorted(name.split())
        return " ".join(parts)

    def _username_similarity(self, id_a: Identity, id_b: Identity) -> float:
        """Compare usernames across platforms for common derivation patterns."""
        if not id_a.accounts or not id_b.accounts:
            return 0.0

        best_score = 0.0
        name_parts_a = self._extract_name_parts(id_a.display_name)
        name_parts_b = self._extract_name_parts(id_b.display_name)

        for acct_a in id_a.accounts:
            for acct_b in id_b.accounts:
                if acct_a.platform == acct_b.platform:
                    continue
                uname_a = acct_a.username.lower()
                uname_b = acct_b.username.lower()

                if uname_a == uname_b:
                    best_score = max(best_score, 1.0)
                    continue

                score_a = self._username_matches_name(uname_a, name_parts_a)
                score_b = self._username_matches_name(uname_b, name_parts_b)

                if name_parts_a == name_parts_b and score_a > 0.5 and score_b > 0.5:
                    best_score = max(best_score, (score_a + score_b) / 2)

                seq_score = SequenceMatcher(None, uname_a, uname_b).ratio()
                if seq_score > 0.7:
                    best_score = max(best_score, seq_score * 0.8)

        return best_score

    def _extract_name_parts(self, display_name: str) -> tuple[str, str]:
        parts = display_name.lower().split()
        if len(parts) >= 2:
            return (parts[0], parts[-1])
        return (parts[0] if parts else "", "")

    def _username_matches_name(
        self, username: str, name_parts: tuple[str, str]
    ) -> float:
        first, last = name_parts
        if not first or not last:
            return 0.0

        patterns = [
            f"{first}.{last}",
            f"{first}{last}",
            f"{first[0]}{last}",
            f"{first}{last[0]}",
            f"{last}.{first}",
            f"{first}_{last}",
        ]

        clean_username = re.sub(r"\d+$", "", username)

        for pattern in patterns:
            if clean_username == pattern:
                return 1.0
            sim = SequenceMatcher(None, clean_username, pattern).ratio()
            if sim > 0.8:
                return sim

        return 0.0

    def _union_find(self, pairs: list[tuple[str, str]]) -> list[set[str]]:
        parent: dict[str, str] = {}

        def find(x: str) -> str:
            while parent.get(x, x) != x:
                parent[x] = parent.get(parent[x], parent[x])
                x = parent[x]
            return x

        def union(a: str, b: str) -> None:
            ra, rb = find(a), find(b)
            if ra != rb:
                parent[ra] = rb

        for a, b in pairs:
            union(a, b)

        groups: dict[str, set[str]] = {}
        all_ids = set()
        for a, b in pairs:
            all_ids.add(a)
            all_ids.add(b)

        for x in all_ids:
            root = find(x)
            if root not in groups:
                groups[root] = set()
            groups[root].add(x)

        return [g for g in groups.values() if len(g) > 1]

    def _execute_merges(
        self,
        identities: dict[str, Identity],
        merge_groups: list[set[str]],
    ) -> dict[str, Identity]:
        """Merge identity groups: keep the first ID, absorb accounts from the rest."""
        merged_away: set[str] = set()
        result = dict(identities)

        for group in merge_groups:
            sorted_ids = sorted(group)
            primary_id = sorted_ids[0]
            primary = result[primary_id]

            existing_platforms = {a.platform for a in primary.accounts}

            for secondary_id in sorted_ids[1:]:
                if secondary_id not in result:
                    continue
                secondary = result[secondary_id]
                for account in secondary.accounts:
                    if account.platform not in existing_platforms:
                        primary.accounts.append(account)
                        existing_platforms.add(account.platform)

                if not primary.department and secondary.department:
                    primary.department = secondary.department
                if not primary.title and secondary.title:
                    primary.title = secondary.title

                merged_away.add(secondary_id)
                del result[secondary_id]

            result[primary_id] = primary

        return result

    def _validate_resolution(self, resolved: dict[str, Identity]) -> None:
        """Post-resolution validation: check for accounts that appear on zero identities."""
        all_account_ids: set[str] = set()
        for identity in resolved.values():
            for acct in identity.accounts:
                all_account_ids.add(acct.account_id)
        logger.info("Validated: %d accounts mapped to %d resolved identities",
                     len(all_account_ids), len(resolved))
