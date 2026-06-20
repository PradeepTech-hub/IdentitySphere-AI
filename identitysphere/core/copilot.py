"""AI Security Copilot - evidence-based identity risk explanation and remediation.

The copilot EXPLAINS findings produced by other engines. It never generates
risk scores, never overrides detector outputs, and never makes autonomous
security decisions. Every narrative it produces traces back to concrete
evidence from:
  - DetectionEngine risk events (evidence lists, compliance refs)
  - PrivilegeCalculator profiles (score breakdowns, permission paths)
  - BehavioralEngine profiles (feature values, anomaly contributions)
  - ScoringEngine composite scores (factor weights, suppression audit trail)
  - AttackGraph paths (escalation chains, platform crossings)
  - BlastRadiusEngine assessments (reachable resources, what-if results)

Public API:
  summarize_identity()         - full identity risk summary
  generate_risk_narrative()    - explain why an identity is risky
  generate_remediation_plan()  - platform-specific remediation steps
  explain_attack_path()        - narrate an attack path in plain language
  explain_blast_radius()       - explain blast radius and what-if results
  summarize_compliance_impact()- map findings to compliance frameworks

Prompt strategy:
  System prompt defines the copilot's role and constraints.
  User prompt is assembled from structured evidence blocks delimited by
  ---DATA--- / ---END--- markers. Each block is labeled with its source
  engine so the LLM (or offline fallback) can attribute its reasoning.
"""

from __future__ import annotations

import logging
from typing import Any

from identitysphere.core.llm import LLMClient
from identitysphere.models.identity import Identity
from identitysphere.models.events import RiskEvent
from identitysphere.core.privilege import PrivilegeProfile
from identitysphere.core.behavioral import BehavioralProfile
from identitysphere.core.scoring import CompositeScore
from identitysphere.core.graph import AttackPath, EscalationChain
from identitysphere.core.blast_radius import BlastRadius, WhatIfResult

logger = logging.getLogger("identitysphere.copilot")

SYSTEM_PROMPT = """\
You are IdentitySphere AI Security Copilot, an expert identity security analyst.

ROLE:
- You EXPLAIN identity risk findings using evidence provided to you.
- You generate remediation recommendations specific to each platform.
- You summarize compliance impact against NIST 800-53, MITRE ATT&CK, GDPR, and CIS Controls.

CONSTRAINTS:
- You NEVER generate or modify risk scores. Scores are computed by the risk engine.
- You ONLY use evidence provided in the DATA sections below. Do not hallucinate facts.
- Every claim you make must trace to a specific evidence item.
- Use clear, concise language suitable for a security analyst audience.
- Structure your response with headers and bullet points.
- When recommending remediation, specify the target platform (AD, AWS, Okta, etc.).
"""

COMPLIANCE_MAP = {
    "orphaned_account": {"nist": "AC-2", "mitre": "T1078 (Valid Accounts)", "gdpr": "Art. 5 (Data Minimisation)", "cis": "Control 5"},
    "over_privileged": {"nist": "AC-6", "mitre": "T1098 (Account Manipulation)", "gdpr": "Art. 5", "cis": "Control 6"},
    "cross_platform_admin": {"nist": "AC-6, IA-4", "mitre": "T1078", "gdpr": "Art. 32 (Security of Processing)", "cis": "Controls 5, 6"},
    "privilege_escalation": {"nist": "AC-2, AC-6", "mitre": "T1098", "gdpr": "Art. 32", "cis": "Controls 5, 6"},
    "token_abuse": {"nist": "AC-2, IA-4", "mitre": "T1550 (Use Alternate Auth Material)", "gdpr": "Art. 32", "cis": "Control 6"},
    "offboarding_gap": {"nist": "AC-2", "mitre": "T1078", "gdpr": "Art. 32", "cis": "Control 5"},
    "stale_account": {"nist": "AC-2", "mitre": "T1078", "gdpr": "Art. 5", "cis": "Control 5"},
    "mfa_disabled": {"nist": "IA-4", "mitre": "T1078", "gdpr": "Art. 32", "cis": "Control 6"},
    "sod_violation": {"nist": "AC-6", "mitre": "T1098", "gdpr": "Art. 5", "cis": "Control 6"},
}

PLATFORM_REMEDIATION = {
    "active_directory": {
        "disable": "Disable-ADAccount -Identity {username}",
        "remove_group": "Remove-ADGroupMember -Identity '{group}' -Members '{username}'",
        "revoke_role": "Remove role via Active Directory Users and Computers or PowerShell",
        "enable_mfa": "Enforce MFA via Azure AD Conditional Access policy or AD FS MFA adapter",
        "rotate_token": "Reset-AdServiceAccountPassword or rotate GMSA/MSA credentials",
    },
    "aws_iam": {
        "disable": "aws iam update-login-profile --user-name {username} --no-password-reset-required && aws iam delete-login-profile --user-name {username}",
        "remove_group": "aws iam remove-user-from-group --user-name {username} --group-name {group}",
        "revoke_role": "aws iam detach-user-policy --user-name {username} --policy-arn {policy_arn}",
        "enable_mfa": "aws iam enable-mfa-device --user-name {username} --serial-number {mfa_arn} --authentication-code1 {code1} --authentication-code2 {code2}",
        "rotate_token": "aws iam delete-access-key --user-name {username} --access-key-id {key_id} && aws iam create-access-key --user-name {username}",
    },
    "okta": {
        "disable": "Suspend user via Okta Admin Console > Directory > People > {username} > Suspend",
        "remove_group": "Remove from group via Okta Admin > Directory > Groups > {group} > Remove member",
        "revoke_role": "Revoke admin role via Okta Admin > Security > Administrators > Remove role",
        "enable_mfa": "Enforce MFA via Okta Admin > Security > Multifactor > Policy > Enroll",
        "rotate_token": "Revoke API token via Okta Admin > Security > API > Tokens > Revoke",
    },
    "github": {
        "disable": "Remove from organization via GitHub Settings > People > Remove member",
        "remove_group": "Remove from team via GitHub Settings > Teams > {group} > Members > Remove",
        "revoke_role": "Downgrade role via GitHub Settings > People > Change role to Member",
        "enable_mfa": "Require 2FA via GitHub Org Settings > Authentication > Require 2FA",
        "rotate_token": "Revoke PAT via GitHub Settings > Developer Settings > Personal Access Tokens > Delete",
    },
    "salesforce": {
        "disable": "Deactivate user via Salesforce Setup > Users > Edit > Active = False",
        "remove_group": "Remove from public group via Setup > Public Groups > {group} > Remove member",
        "revoke_role": "Change profile/permission set via Setup > Users > Edit > Profile",
        "enable_mfa": "Enforce MFA via Setup > Identity Verification > Require MFA",
        "rotate_token": "Reset security token via Setup > Users > Reset Security Token",
    },
}


class SecurityCopilot:
    """AI-powered security copilot that explains identity risk findings."""

    def __init__(self, config: dict[str, Any] | None = None) -> None:
        self.llm = LLMClient(config)

    def summarize_identity(
        self,
        identity: Identity,
        composite_score: CompositeScore | None = None,
        risk_events: list[RiskEvent] | None = None,
        privilege_profile: PrivilegeProfile | None = None,
        behavioral_profile: BehavioralProfile | None = None,
        blast_radius: BlastRadius | None = None,
    ) -> str:
        """Produce a comprehensive risk summary for an identity."""
        user_prompt = self._build_identity_prompt(
            "Produce a comprehensive security risk summary for this identity. "
            "Cover: overall risk posture, key findings, privilege exposure, "
            "behavioral anomalies, blast radius, and recommended actions.",
            identity, composite_score, risk_events,
            privilege_profile, behavioral_profile, blast_radius,
        )
        return self.llm.ask(SYSTEM_PROMPT, user_prompt)

    def generate_risk_narrative(
        self,
        identity: Identity,
        composite_score: CompositeScore | None = None,
        risk_events: list[RiskEvent] | None = None,
        privilege_profile: PrivilegeProfile | None = None,
        behavioral_profile: BehavioralProfile | None = None,
    ) -> str:
        """Explain WHY an identity is risky, citing specific evidence."""
        user_prompt = self._build_identity_prompt(
            "Explain why this identity is considered risky. "
            "Cite specific detector findings, privilege levels, and behavioral "
            "anomalies. Do NOT generate or modify the risk score.",
            identity, composite_score, risk_events,
            privilege_profile, behavioral_profile,
        )
        return self.llm.ask(SYSTEM_PROMPT, user_prompt)

    def generate_remediation_plan(
        self,
        identity: Identity,
        risk_events: list[RiskEvent] | None = None,
        privilege_profile: PrivilegeProfile | None = None,
    ) -> str:
        """Generate platform-specific remediation steps for each finding."""
        events = risk_events or []
        platforms = {a.platform.value for a in identity.accounts}
        remediation_blocks = []

        for platform in sorted(platforms):
            plat_events = [e for e in events if any(
                p.value == platform for p in e.affected_platforms
            )]
            if not plat_events:
                continue

            cmds = PLATFORM_REMEDIATION.get(platform, {})
            block_lines = [f"Platform: {platform}"]
            for ev in plat_events:
                block_lines.append(f"  Finding: {ev.title}")
                block_lines.append(f"  Type: {ev.risk_type} | Severity: {ev.severity.value}")
                if ev.risk_type == "orphaned_account":
                    block_lines.append(f"  Action: {cmds.get('disable', 'Disable account')}")
                elif ev.risk_type == "mfa_disabled":
                    block_lines.append(f"  Action: {cmds.get('enable_mfa', 'Enable MFA')}")
                elif ev.risk_type in ("over_privileged", "cross_platform_admin"):
                    block_lines.append(f"  Action: {cmds.get('revoke_role', 'Revoke excessive role')}")
                elif ev.risk_type == "token_abuse":
                    block_lines.append(f"  Action: {cmds.get('rotate_token', 'Rotate credentials')}")
                elif ev.risk_type == "sod_violation":
                    block_lines.append(f"  Action: {cmds.get('remove_group', 'Remove from conflicting group')}")
                else:
                    block_lines.append(f"  Action: Review and remediate per organizational policy")
                block_lines.append("")
            remediation_blocks.append("\n".join(block_lines))

        priv_section = ""
        if privilege_profile and privilege_profile.admin_platforms:
            priv_section = (
                f"Admin platforms: {', '.join(privilege_profile.admin_platforms)}\n"
                f"Privilege score: {privilege_profile.normalized_score:.1f}/100\n"
                f"Sensitive permissions: {len(privilege_profile.sensitive_permissions)}"
            )

        user_prompt = (
            f"TASK: Generate a prioritized remediation plan for {identity.display_name} "
            f"({identity.identity_id}).\n"
            f"---DATA---\n"
            f"Identity: {identity.display_name}\n"
            f"Department: {identity.department}\n"
            f"Platforms: {', '.join(sorted(platforms))}\n"
            f"Risk events: {len(events)}\n\n"
            f"{priv_section}\n\n"
            f"Platform-specific remediations:\n"
            f"{''.join(remediation_blocks)}\n"
            f"---END---"
        )
        return self.llm.ask(SYSTEM_PROMPT, user_prompt)

    def explain_attack_path(
        self,
        path: AttackPath | None = None,
        chain: EscalationChain | None = None,
    ) -> str:
        """Narrate an attack path or escalation chain in plain language."""
        if chain:
            path = chain.path

        if not path:
            return "No attack path provided."

        user_prompt = (
            f"TASK: Explain this identity attack path in plain language, "
            f"describing each hop and the risk it represents.\n"
            f"---DATA---\n"
            f"Source: {path.source}\n"
            f"Target: {path.target}\n"
            f"Path length: {path.path_length} hops\n"
            f"Platforms crossed: {', '.join(path.platforms_crossed)}\n"
            f"Cross-platform: {path.is_cross_platform}\n"
            f"Edge types: {' -> '.join(path.edge_types)}\n"
            f"Privilege level at target: {path.privilege_level}\n"
            f"Full path: {path.description}\n"
        )

        if chain:
            user_prompt += (
                f"\nEscalation context:\n"
                f"  Type: {chain.escalation_type}\n"
                f"  From: {chain.source_platform}\n"
                f"  To: {chain.target_platform}\n"
                f"  Risk level: {chain.risk_level}\n"
            )

        user_prompt += "---END---"
        return self.llm.ask(SYSTEM_PROMPT, user_prompt)

    def explain_blast_radius(
        self,
        blast_radius: BlastRadius,
        whatif: WhatIfResult | None = None,
    ) -> str:
        """Explain the blast radius of an identity, optionally with what-if comparison."""
        lines = [
            f"TASK: Explain the blast radius for {blast_radius.display_name} "
            f"and its security implications.",
            "---DATA---",
            f"Identity: {blast_radius.display_name} ({blast_radius.identity_id})",
            f"Severity: {blast_radius.severity.upper()}",
            f"Reachable resources: {blast_radius.reachable_resource_count}",
            f"Reachable permissions: {blast_radius.reachable_permission_count}",
            f"Admin roles reachable: {blast_radius.reachable_admin_role_count}",
            f"Impacted platforms: {', '.join(blast_radius.impacted_platforms)}",
            "",
            "Resources by platform:",
        ]
        for platform, count in sorted(blast_radius.resource_by_platform.items()):
            lines.append(f"  {platform}: {count}")

        if blast_radius.admin_resources:
            lines.append("")
            lines.append("Admin-level resources (highest risk):")
            for r in blast_radius.admin_resources[:5]:
                lines.append(f"  [{r.get('platform')}] {r.get('resource_name')} (distance: {r.get('distance')})")

        if whatif:
            lines.extend([
                "",
                f"What-If simulation: {whatif.description}",
                f"  Original resources: {whatif.original.reachable_resource_count}",
                f"  After change: {whatif.simulated.reachable_resource_count}",
                f"  Risk reduction: {whatif.risk_reduction_pct}%",
                f"  Severity change: {whatif.severity_change}",
                f"  Resources removed: {len(whatif.resources_removed)}",
            ])
            for r in whatif.resources_removed[:5]:
                lines.append(f"    No longer reachable: [{r.get('platform')}] {r.get('resource_name')}")

        lines.append("---END---")
        return self.llm.ask(SYSTEM_PROMPT, "\n".join(lines))

    def summarize_compliance_impact(
        self,
        risk_events: list[RiskEvent],
    ) -> str:
        """Summarize how findings map to compliance frameworks."""
        type_counts: dict[str, int] = {}
        for ev in risk_events:
            type_counts[ev.risk_type] = type_counts.get(ev.risk_type, 0) + 1

        lines = [
            "TASK: Summarize the compliance impact of these identity risk findings "
            "against NIST 800-53, MITRE ATT&CK, GDPR, and CIS Controls.",
            "---DATA---",
            f"Total findings: {len(risk_events)}",
            "",
            f"{'Risk Type':<28} {'Count':<8} {'NIST':<12} {'MITRE':<32} {'GDPR':<16} {'CIS':<12}",
            f"{'-'*28} {'-'*8} {'-'*12} {'-'*32} {'-'*16} {'-'*12}",
        ]
        for rtype, count in sorted(type_counts.items(), key=lambda x: -x[1]):
            refs = COMPLIANCE_MAP.get(rtype, {})
            lines.append(
                f"{rtype:<28} {count:<8} "
                f"{refs.get('nist', 'N/A'):<12} "
                f"{refs.get('mitre', 'N/A'):<32} "
                f"{refs.get('gdpr', 'N/A'):<16} "
                f"{refs.get('cis', 'N/A'):<12}"
            )

        lines.append("")
        unique_controls: dict[str, set[str]] = {"nist": set(), "mitre": set(), "gdpr": set(), "cis": set()}
        for rtype in type_counts:
            refs = COMPLIANCE_MAP.get(rtype, {})
            for fw in unique_controls:
                if refs.get(fw):
                    unique_controls[fw].add(refs[fw])

        lines.append("Unique controls impacted:")
        for fw, controls in unique_controls.items():
            lines.append(f"  {fw.upper()}: {', '.join(sorted(controls))}")

        lines.append("---END---")
        return self.llm.ask(SYSTEM_PROMPT, "\n".join(lines))

    # --- Internal prompt assembly ---

    def _build_identity_prompt(
        self,
        task: str,
        identity: Identity,
        composite_score: CompositeScore | None = None,
        risk_events: list[RiskEvent] | None = None,
        privilege_profile: PrivilegeProfile | None = None,
        behavioral_profile: BehavioralProfile | None = None,
        blast_radius: BlastRadius | None = None,
    ) -> str:
        """Assemble a structured user prompt from multiple evidence sources."""
        lines = [f"TASK: {task}", "---DATA---"]

        lines.extend([
            "[IDENTITY]",
            f"ID: {identity.identity_id}",
            f"Name: {identity.display_name}",
            f"Email: {identity.email}",
            f"Type: {identity.identity_type.value}",
            f"Department: {identity.department}",
            f"Title: {identity.title}",
            f"HR Status: {identity.hr_status.value}",
            f"Accounts: {len(identity.accounts)}",
        ])
        for acct in identity.accounts:
            lines.append(
                f"  [{acct.platform.value}] {acct.username} | "
                f"status={acct.status.value} | admin={acct.is_admin} | "
                f"mfa={acct.mfa_enabled} | last_login={acct.last_login}"
            )
        lines.append("")

        if composite_score:
            lines.extend([
                "[COMPOSITE SCORE]",
                f"Final Score: {composite_score.final_score}/100 ({composite_score.severity.upper()})",
                f"Raw Score: {composite_score.raw_score}",
                f"Suppression Multiplier: {composite_score.suppression_multiplier}",
                "Factor Breakdown:",
            ])
            for f in composite_score.factors:
                lines.append(f"  {f.name}: {f.raw_value} x {f.weight} = {f.weighted_value} ({f.description})")
            if composite_score.suppressions:
                lines.append("Suppressions applied:")
                for s in composite_score.suppressions:
                    lines.append(f"  {s.rule}: x{s.multiplier} ({s.reason})")
            lines.append("")

        if risk_events:
            lines.append(f"[DETECTOR FINDINGS] ({len(risk_events)} total)")
            for ev in risk_events[:10]:
                lines.append(f"  [{ev.severity.value.upper()}] {ev.risk_type}: {ev.title}")
                if ev.compliance_refs:
                    lines.append(f"    Compliance: {', '.join(ev.compliance_refs)}")
                for e in ev.evidence[:2]:
                    lines.append(f"    Evidence: {e}")
            lines.append("")

        if privilege_profile:
            lines.extend([
                "[PRIVILEGE PROFILE]",
                f"Score: {privilege_profile.normalized_score:.1f}/100",
                f"Unique permissions: {privilege_profile.unique_permissions}",
                f"Sensitive permissions: {len(privilege_profile.sensitive_permissions)}",
                f"Admin platforms: {', '.join(privilege_profile.admin_platforms) or 'none'}",
                f"Cross-platform admin: {privilege_profile.is_cross_platform_admin}",
            ])
            lines.append("")

        if behavioral_profile:
            lines.extend([
                "[BEHAVIORAL PROFILE]",
                f"Anomaly score: {behavioral_profile.anomaly_score:.1f}/100",
                f"Is anomalous: {behavioral_profile.is_anomalous}",
                "Features:",
            ])
            for fname, val in behavioral_profile.raw_features.items():
                contrib = behavioral_profile.feature_contributions.get(fname, 0)
                lines.append(f"  {fname}: {val:.3f} (contribution: {contrib:.1f}%)")
            lines.append("")

        if blast_radius:
            lines.extend([
                "[BLAST RADIUS]",
                f"Severity: {blast_radius.severity.upper()}",
                f"Reachable resources: {blast_radius.reachable_resource_count}",
                f"Admin roles: {blast_radius.reachable_admin_role_count}",
                f"Platforms: {', '.join(blast_radius.impacted_platforms)}",
            ])
            lines.append("")

        lines.append("---END---")
        return "\n".join(lines)
