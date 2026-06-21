"""Synthetic data generator for IdentitySphere AI.

Generation method: rule-based seeding with controlled anomaly injection.
Each identity is assigned an anomaly category at creation time based on the
configured anomaly_rates, ensuring exact proportions. Within each category,
platform accounts, group memberships, audit events, and offboarding records
are generated to produce the specific detectable signals that downstream
detectors (Sections 5–6) consume.

Anomaly → Signal mapping:
  orphaned_stale    → account active on platform X while disabled/terminated in HR
  over_privileged   → admin roles on ≥2 platforms without on-call/justification tag
  priv_escalation   → unexpected ROLE_ASSIGNED/GROUP_ADDED events outside change window
  token_abuse       → TOKEN_USED events from stale tokens or anomalous IPs
  false_positive    → legitimate high-privilege users with on-call or recent role-change context
  normal            → baseline activity with no injected anomaly
"""

from __future__ import annotations

import random
import uuid
from datetime import datetime, timedelta
from typing import Any

from faker import Faker

from identitysphere.models.identity import (
    Identity,
    IdentityStatus,
    IdentityType,
    Platform,
    PlatformAccount,
)
from identitysphere.models.access import (
    Group,
    GroupMembership,
    Permission,
    PermissionGrant,
    PrivilegeLevel,
    Role,
    RoleAssignment,
)
from identitysphere.models.events import AuditEvent, EventType
from identitysphere.models.offboarding import (
    OffboardingRecord,
    OffboardingStatus,
    PlatformDisableRecord,
)

fake = Faker('en_IN')
Faker.seed(42)
random.seed(42)

INDIAN_FIRST_NAMES = [
    'Aarav', 'Aditya', 'Akash', 'Amit', 'Ananya', 'Anjali', 'Arjun', 'Ashwin',
    'Deepak', 'Devika', 'Gaurav', 'Harish', 'Ishaan', 'Jaya', 'Karthik', 'Kavya',
    'Lakshmi', 'Manish', 'Meera', 'Mohan', 'Naveen', 'Neha', 'Nikhil', 'Nisha',
    'Pooja', 'Pradeep', 'Priya', 'Rahul', 'Rajesh', 'Rakesh', 'Ravi', 'Rohit',
    'Sandeep', 'Shreya', 'Sneha', 'Suraj', 'Swathi', 'Tanvi', 'Varun', 'Vikram',
    'Vinay', 'Vivek', 'Yogesh', 'Sanjay', 'Divya', 'Ganesh', 'Harini', 'Janaki',
    'Keerthi', 'Manoj', 'Nandini', 'Pallavi', 'Ramesh', 'Sarita', 'Shanti', 'Suresh',
    'Tejas', 'Usha', 'Venkat', 'Vasudha',
]
INDIAN_LAST_NAMES = [
    'Agarwal', 'Bhat', 'Chakraborty', 'Desai', 'Gowda', 'Gupta', 'Hegde', 'Iyer',
    'Jain', 'Joshi', 'Kulkarni', 'Kumar', 'Mehta', 'Menon', 'Mishra', 'Nair',
    'Pandey', 'Patel', 'Patil', 'Rao', 'Reddy', 'Sharma', 'Shetty', 'Singh',
    'Srinivasan', 'Verma', 'Yadav', 'Pillai', 'Murthy', 'Naik', 'Kamath', 'Bose',
]

ALL_PLATFORMS = list(Platform)

DEPARTMENTS = [
    "Engineering",
    "DevOps",
    "Security",
    "Product",
    "Sales",
    "HR",
    "Finance",
    "Legal",
    "Marketing",
    "IT Operations",
]

TITLES = {
    "Engineering": ["Software Engineer", "Senior Engineer", "Staff Engineer", "Engineering Manager"],
    "DevOps": ["DevOps Engineer", "SRE", "Platform Engineer", "Infrastructure Lead"],
    "Security": ["Security Analyst", "Security Engineer", "CISO", "SOC Analyst"],
    "Product": ["Product Manager", "Senior PM", "VP Product"],
    "Sales": ["Account Executive", "Sales Engineer", "VP Sales"],
    "HR": ["HR Specialist", "HR Manager", "Recruiter"],
    "Finance": ["Financial Analyst", "Controller", "CFO"],
    "Legal": ["Legal Counsel", "Compliance Manager"],
    "Marketing": ["Marketing Manager", "Growth Engineer"],
    "IT Operations": ["IT Admin", "Help Desk", "IT Manager"],
}

ADMIN_ROLES_BY_PLATFORM = {
    Platform.AD: ["Domain Admin", "Enterprise Admin", "Schema Admin"],
    Platform.AZURE: ["Global Administrator", "Privileged Role Administrator", "User Administrator"],
    Platform.AWS: ["AdministratorAccess", "IAMFullAccess", "PowerUserAccess"],
    Platform.OKTA: ["Super Admin", "Org Admin", "App Admin"],
    Platform.GITHUB: ["Owner", "Admin"],
    Platform.SALESFORCE: ["System Administrator", "Modify All Data"],
    Platform.SERVICENOW: ["admin", "security_admin", "itil_admin"],
}

NORMAL_ROLES_BY_PLATFORM = {
    Platform.AD: ["Domain User", "Remote Desktop Users", "DNS Admins"],
    Platform.AZURE: ["User", "Guest", "Application Developer"],
    Platform.AWS: ["ReadOnlyAccess", "S3ReadOnly", "CloudWatchReadOnly", "EC2Viewer"],
    Platform.OKTA: ["Everyone", "App User", "Help Desk Admin"],
    Platform.GITHUB: ["Member", "Collaborator", "Triage"],
    Platform.SALESFORCE: ["Standard User", "Read Only", "Marketing User", "Chatter User"],
    Platform.SERVICENOW: ["itil", "sn_incident_read", "sn_change_read"],
}

GROUPS_BY_PLATFORM = {
    Platform.AD: [
        "IT-Staff",
        "Developers",
        "All-Employees",
        "VPN-Users",
        "Server-Admins",
        "Backup-Operators",
        "Help-Desk",
        "Finance-Users",
        "HR-Users",
        "Management",
    ],
    Platform.AWS: [
        "developers",
        "ops-team",
        "data-engineers",
        "security-team",
        "read-only-users",
        "billing-admins",
        "lambda-developers",
        "s3-admins",
        "network-admins",
        "cloud-architects",
    ],
    Platform.OKTA: [
        "All Users",
        "Engineering",
        "Sales Team",
        "Contractors",
        "VPN Access",
        "MFA Exempt",
        "App Owners",
        "Privileged Users",
        "Help Desk",
        "Executive Team",
    ],
    Platform.AZURE: [
        "All-Users",
        "Cloud-Admins",
        "App-Developers",
        "Security-Readers",
        "Conditional-Access",
        "Guest-Users",
        "Privileged-Identity",
    ],
    Platform.GITHUB: [
        "backend-team",
        "frontend-team",
        "devops",
        "security-reviewers",
        "docs-team",
        "open-source",
        "interns",
        "leads",
    ],
    Platform.SALESFORCE: [
        "Sales Reps",
        "Sales Managers",
        "Marketing Team",
        "Support Agents",
        "Partners",
        "Report Viewers",
        "Data Stewards",
    ],
    Platform.SERVICENOW: [
        "IT-Support",
        "Change-Managers",
        "Incident-Responders",
        "CMDB-Owners",
        "Service-Desk",
        "Security-Ops",
    ],
}

RESOURCES = {
    Platform.AD: ["domain-controller", "file-server", "exchange", "dns", "gpo"],
    Platform.AZURE: ["subscriptions", "keyvault", "aad-users", "conditional-access", "app-registrations"],
    Platform.AWS: ["s3://prod-data", "ec2:*", "iam:*", "rds:prod", "lambda:*", "kms:*"],
    Platform.OKTA: ["sso-apps", "mfa-config", "user-management", "api-tokens", "policies"],
    Platform.GITHUB: ["repos:private", "repos:public", "actions", "packages", "settings"],
    Platform.SALESFORCE: ["accounts", "contacts", "opportunities", "reports", "setup"],
    Platform.SERVICENOW: ["incidents", "changes", "cmdb", "workflows", "service-catalog"],
}


class SyntheticDataGenerator:
    """Generates a complete synthetic identity dataset with seeded anomalies."""

    def __init__(self, config: dict[str, Any]) -> None:
        self.cfg = config.get("data_generation", config)
        self.num_identities = self.cfg.get("num_identities", 300)
        self.num_service_accounts = self.cfg.get("num_service_accounts", 50)
        self.num_external = self.cfg.get("num_external_identities", 20)
        self.num_audit_events = self.cfg.get("num_audit_events", 800)
        self.num_offboarding = self.cfg.get("num_offboarding_records", 70)
        self.anomaly_rates = self.cfg.get("anomaly_rates", {})

        self.identities: list[Identity] = []
        self.groups: dict[str, Group] = {}
        self.roles: dict[str, Role] = {}
        self.permissions: dict[str, Permission] = {}
        self.group_memberships: list[GroupMembership] = []
        self.role_assignments: list[RoleAssignment] = []
        self.audit_events: list[AuditEvent] = []
        self.offboarding_records: list[OffboardingRecord] = []
        self.anomaly_labels: dict[str, str] = {}

    def generate_all(self) -> dict[str, Any]:
        """Run the full generation pipeline and return all data."""
        self._generate_groups_and_roles()
        self._generate_permissions()
        self._generate_identities()
        self._generate_service_accounts()
        self._generate_external_identities()
        self._generate_audit_events()
        self._generate_offboarding_records()

        return {
            "identities": self.identities,
            "groups": list(self.groups.values()),
            "roles": list(self.roles.values()),
            "permissions": list(self.permissions.values()),
            "group_memberships": self.group_memberships,
            "role_assignments": self.role_assignments,
            "audit_events": self.audit_events,
            "offboarding_records": self.offboarding_records,
            "anomaly_labels": self.anomaly_labels,
        }

    def _generate_groups_and_roles(self) -> None:
        for platform in ALL_PLATFORMS:
            group_names = GROUPS_BY_PLATFORM.get(platform, [])
            for i, name in enumerate(group_names):
                gid = f"grp-{platform.value[:3]}-{i:03d}"
                parent_ids = []
                if i > 2 and random.random() < 0.3:
                    parent_ids = [f"grp-{platform.value[:3]}-{random.randint(0, i - 1):03d}"]
                self.groups[gid] = Group(
                    group_id=gid,
                    platform=platform,
                    name=name,
                    parent_group_ids=parent_ids,
                    is_privileged=(i < 2),
                )

            admin_roles = ADMIN_ROLES_BY_PLATFORM.get(platform, [])
            normal_roles = NORMAL_ROLES_BY_PLATFORM.get(platform, [])
            for j, rname in enumerate(admin_roles + normal_roles):
                rid = f"role-{platform.value[:3]}-{j:03d}"
                self.roles[rid] = Role(
                    role_id=rid,
                    platform=platform,
                    name=rname,
                    is_admin_role=(j < len(admin_roles)),
                )

    def _generate_permissions(self) -> None:
        actions = ["read", "write", "create", "delete", "admin", "execute"]
        for platform in ALL_PLATFORMS:
            resources = RESOURCES.get(platform, ["default"])
            for i, resource in enumerate(resources):
                for j, action in enumerate(actions[:random.randint(2, len(actions))]):
                    pid = f"perm-{platform.value[:3]}-{i:02d}-{j:02d}"
                    level = PrivilegeLevel.READ
                    if action in ("write", "create"):
                        level = PrivilegeLevel.WRITE
                    elif action in ("delete", "admin"):
                        level = PrivilegeLevel.ADMIN
                    elif action == "execute":
                        level = PrivilegeLevel.WRITE

                    self.permissions[pid] = Permission(
                        permission_id=pid,
                        platform=platform,
                        resource=resource,
                        action=action,
                        privilege_level=level,
                        is_sensitive=(level in (PrivilegeLevel.ADMIN, PrivilegeLevel.SUPER_ADMIN)),
                    )

            platform_roles = [r for r in self.roles.values() if r.platform == platform]
            platform_perms = [p for p in self.permissions.values() if p.platform == platform]
            for role in platform_roles:
                n_perms = random.randint(1, min(5, len(platform_perms)))
                role.permission_ids = [p.permission_id for p in random.sample(platform_perms, n_perms)]

            platform_groups = [g for g in self.groups.values() if g.platform == platform]
            for group in platform_groups:
                if group.is_privileged and platform_perms:
                    n_perms = random.randint(2, min(4, len(platform_perms)))
                    group.permission_ids = [
                        p.permission_id for p in random.sample(platform_perms, n_perms)
                    ]

    def _assign_anomaly_category(self, index: int, total: int) -> str:
        thresholds = []
        cumulative = 0.0
        for cat in [
            "orphaned_stale",
            "over_privileged",
            "privilege_escalation",
            "token_abuse",
            "false_positive_traps",
        ]:
            rate = self.anomaly_rates.get(cat, 0.0)
            cumulative += rate
            thresholds.append((cumulative, cat))

        position = index / total
        for threshold, cat in thresholds:
            if position < threshold:
                return cat
        return "normal"

    def _generate_identities(self) -> None:
        now = datetime.utcnow()

        for i in range(self.num_identities):
            category = self._assign_anomaly_category(i, self.num_identities)
            first = random.choice(INDIAN_FIRST_NAMES)
            last = random.choice(INDIAN_LAST_NAMES)
            display_name = f"{first} {last}"
            email = f"{first.lower()}.{last.lower()}@enterprise.co.in"
            dept = random.choice(DEPARTMENTS)
            title = random.choice(TITLES.get(dept, ["Employee"]))
            iid = f"ID-{i:04d}"

            hr_status = IdentityStatus.ACTIVE
            hr_term_date = None
            if category == "orphaned_stale":
                if random.random() < 0.6:
                    hr_status = IdentityStatus.TERMINATED
                    hr_term_date = now - timedelta(days=random.randint(7, 180))

            identity = Identity(
                identity_id=iid,
                display_name=display_name,
                email=email,
                identity_type=IdentityType.HUMAN,
                department=dept,
                title=title,
                manager_id=f"ID-{random.randint(0, max(0, i - 1)):04d}" if i > 0 else None,
                hr_status=hr_status,
                hr_termination_date=hr_term_date,
            )

            num_platforms = random.randint(2, 4) if category != "normal" else random.randint(1, 3)
            platforms = random.sample(ALL_PLATFORMS, min(num_platforms, len(ALL_PLATFORMS)))

            for platform in platforms:
                username = f"{first.lower()}.{last.lower()}"
                if platform == Platform.AWS:
                    username = f"{first[0].lower()}{last.lower()}"
                elif platform == Platform.GITHUB:
                    username = f"{first.lower()}{last[0].lower()}{random.randint(10, 99)}"

                acct_status = IdentityStatus.ACTIVE
                last_login = now - timedelta(hours=random.randint(1, 720))
                is_admin = False
                acct_roles: list[str] = []
                acct_groups: list[str] = []

                if category == "orphaned_stale":
                    if hr_status == IdentityStatus.TERMINATED:
                        if random.random() < 0.7:
                            acct_status = IdentityStatus.ACTIVE
                            last_login = now - timedelta(days=random.randint(1, 30))
                        else:
                            acct_status = IdentityStatus.DISABLED
                    else:
                        last_login = now - timedelta(days=random.randint(120, 365))

                elif category == "over_privileged":
                    is_admin = True
                    admin_roles = ADMIN_ROLES_BY_PLATFORM.get(platform, [])
                    if admin_roles:
                        acct_roles = [random.choice(admin_roles)]

                elif category == "false_positive_traps":
                    if random.random() < 0.5:
                        is_admin = True
                        admin_roles = ADMIN_ROLES_BY_PLATFORM.get(platform, [])
                        if admin_roles:
                            acct_roles = [random.choice(admin_roles)]
                    identity.tags["on_call"] = "true"
                    identity.tags["role_change_date"] = (
                        now - timedelta(days=random.randint(1, 10))
                    ).isoformat()

                else:
                    normal_roles = NORMAL_ROLES_BY_PLATFORM.get(platform, [])
                    if normal_roles:
                        acct_roles = [random.choice(normal_roles)]

                platform_groups = [
                    g.group_id
                    for g in self.groups.values()
                    if g.platform == platform
                ]
                if platform_groups:
                    acct_groups = random.sample(
                        platform_groups,
                        min(random.randint(1, 3), len(platform_groups)),
                    )

                acct_id = f"acct-{platform.value[:3]}-{iid}-{uuid.uuid4().hex[:6]}"

                account = PlatformAccount(
                    platform=platform,
                    account_id=acct_id,
                    username=username,
                    email=email,
                    status=acct_status,
                    roles=acct_roles,
                    groups=acct_groups,
                    last_login=last_login,
                    created_at=now - timedelta(days=random.randint(30, 730)),
                    mfa_enabled=random.random() > 0.15,
                    is_admin=is_admin,
                )
                identity.accounts.append(account)

                for gid in acct_groups:
                    self.group_memberships.append(
                        GroupMembership(
                            account_id=acct_id,
                            group_id=gid,
                            platform=platform,
                            granted_at=now - timedelta(days=random.randint(1, 365)),
                        )
                    )

                platform_roles = [
                    r for r in self.roles.values()
                    if r.platform == platform and r.name in acct_roles
                ]
                for role in platform_roles:
                    self.role_assignments.append(
                        RoleAssignment(
                            account_id=acct_id,
                            role_id=role.role_id,
                            platform=platform,
                            granted_at=now - timedelta(days=random.randint(1, 365)),
                        )
                    )

            self.identities.append(identity)
            self.anomaly_labels[iid] = category

    def _generate_service_accounts(self) -> None:
        now = datetime.utcnow()
        for i in range(self.num_service_accounts):
            iid = f"SVC-{i:04d}"
            platform = random.choice(ALL_PLATFORMS)
            svc_name = f"svc-{random.choice(['cicd','monitor','etl','backup','deploy','sync','batch','alert','scan','report'])}-{random.choice(['prod','staging','dev','infra','data','ops'])}"
            category = "token_abuse" if random.random() < 0.15 else "normal"

            identity = Identity(
                identity_id=iid,
                display_name=svc_name,
                email=f"{svc_name}@service.internal",
                identity_type=IdentityType.SERVICE,
                department="IT Operations",
                hr_status=IdentityStatus.ACTIVE,
            )

            last_login = now - timedelta(days=random.randint(1, 400))
            if category == "token_abuse":
                identity.tags["token_age_days"] = str(random.randint(180, 730))
                identity.tags["api_calls_24h"] = str(random.randint(5000, 50000))

            acct_id = f"acct-{platform.value[:3]}-{iid}-{uuid.uuid4().hex[:6]}"
            account = PlatformAccount(
                platform=platform,
                account_id=acct_id,
                username=svc_name,
                email=f"{svc_name}@service.internal",
                status=IdentityStatus.ACTIVE,
                roles=random.sample(
                    NORMAL_ROLES_BY_PLATFORM.get(platform, ["viewer"]),
                    min(2, len(NORMAL_ROLES_BY_PLATFORM.get(platform, ["viewer"]))),
                ),
                last_login=last_login,
                mfa_enabled=False,
                is_admin=(category == "token_abuse" and random.random() < 0.3),
            )
            identity.accounts.append(account)
            self.identities.append(identity)
            self.anomaly_labels[iid] = category

    def _generate_external_identities(self) -> None:
        now = datetime.utcnow()
        for i in range(self.num_external):
            iid = f"EXT-{i:04d}"
            identity = Identity(
                identity_id=iid,
                display_name=f"{random.choice(INDIAN_FIRST_NAMES)} {random.choice(INDIAN_LAST_NAMES)}",
                email=f"ext-{random.choice(INDIAN_FIRST_NAMES).lower()}.{random.choice(INDIAN_LAST_NAMES).lower()}@vendor.co.in",
                identity_type=IdentityType.EXTERNAL,
                department="External",
                hr_status=IdentityStatus.ACTIVE,
            )
            platform = random.choice([Platform.OKTA, Platform.GITHUB, Platform.SALESFORCE])
            acct_id = f"acct-{platform.value[:3]}-{iid}-{uuid.uuid4().hex[:6]}"
            account = PlatformAccount(
                platform=platform,
                account_id=acct_id,
                username=f"{identity.display_name.split()[0].lower()}.{identity.display_name.split()[-1].lower()[:4]}",
                email=identity.email,
                status=IdentityStatus.ACTIVE,
                last_login=now - timedelta(days=random.randint(1, 180)),
                mfa_enabled=random.random() > 0.3,
            )
            identity.accounts.append(account)
            self.identities.append(identity)
            self.anomaly_labels[iid] = "normal"

    def _generate_audit_events(self) -> None:
        now = datetime.utcnow()
        events_generated = 0

        escalation_ids = [
            iid for iid, cat in self.anomaly_labels.items() if cat == "privilege_escalation"
        ]
        token_ids = [
            iid for iid, cat in self.anomaly_labels.items() if cat == "token_abuse"
        ]

        for identity in self.identities:
            if not identity.accounts:
                continue

            category = self.anomaly_labels.get(identity.identity_id, "normal")
            n_events = random.randint(1, 5) if category == "normal" else random.randint(3, 8)

            for _ in range(n_events):
                if events_generated >= self.num_audit_events:
                    break

                account = random.choice(identity.accounts)
                ts = now - timedelta(
                    hours=random.randint(1, 720),
                    minutes=random.randint(0, 59),
                )

                if category == "privilege_escalation":
                    event_type = random.choice(
                        [EventType.ROLE_ASSIGNED, EventType.GROUP_ADDED, EventType.PERMISSION_CHANGED]
                    )
                    details = {
                        "change_type": "escalation",
                        "new_role": random.choice(
                            ADMIN_ROLES_BY_PLATFORM.get(account.platform, ["admin"])
                        ),
                        "approved": False,
                        "change_window": False,
                    }
                elif category == "token_abuse":
                    event_type = random.choice([EventType.TOKEN_USED, EventType.API_CALL])
                    details = {
                        "token_age_days": random.randint(180, 730),
                        "source_ip": fake.ipv4(),
                        "unusual_hour": random.random() < 0.6,
                        "api_volume": random.randint(500, 10000),
                    }
                elif category == "orphaned_stale":
                    event_type = random.choice(
                        [EventType.LOGIN_SUCCESS, EventType.RESOURCE_ACCESS]
                    )
                    details = {"post_termination": identity.hr_status == IdentityStatus.TERMINATED}
                else:
                    event_type = random.choice(
                        [
                            EventType.LOGIN_SUCCESS,
                            EventType.RESOURCE_ACCESS,
                            EventType.LOGIN_SUCCESS,
                        ]
                    )
                    details = {}

                event = AuditEvent(
                    event_id=f"evt-{uuid.uuid4().hex[:8]}",
                    timestamp=ts,
                    platform=account.platform,
                    event_type=event_type,
                    account_id=account.account_id,
                    identity_id=identity.identity_id,
                    source_ip=fake.ipv4(),
                    resource=random.choice(
                        RESOURCES.get(account.platform, ["unknown"])
                    ),
                    details=details,
                    success=random.random() > 0.05,
                    is_anomalous=(category in ("privilege_escalation", "token_abuse")),
                )
                self.audit_events.append(event)
                events_generated += 1

            if events_generated >= self.num_audit_events:
                break

    def _generate_offboarding_records(self) -> None:
        now = datetime.utcnow()
        terminated = [
            ident
            for ident in self.identities
            if ident.hr_status == IdentityStatus.TERMINATED
        ]
        orphaned_active = [
            ident
            for ident in self.identities
            if self.anomaly_labels.get(ident.identity_id) == "orphaned_stale"
            and ident.hr_status != IdentityStatus.TERMINATED
        ]

        candidates = terminated + orphaned_active[: max(0, self.num_offboarding - len(terminated))]
        if len(candidates) < self.num_offboarding:
            extra = [
                ident
                for ident in self.identities
                if ident.identity_id not in {c.identity_id for c in candidates}
                and ident.identity_type == IdentityType.HUMAN
            ]
            random.shuffle(extra)
            for e in extra[: self.num_offboarding - len(candidates)]:
                e.hr_status = IdentityStatus.TERMINATED
                e.hr_termination_date = now - timedelta(days=random.randint(7, 90))
                candidates.append(e)

        for ident in candidates[: self.num_offboarding]:
            term_date = ident.hr_termination_date or (now - timedelta(days=random.randint(7, 90)))
            platform_records = []
            has_gap = self.anomaly_labels.get(ident.identity_id) == "orphaned_stale"

            for account in ident.accounts:
                if has_gap and random.random() < 0.6:
                    platform_records.append(
                        PlatformDisableRecord(
                            platform=account.platform,
                            account_id=account.account_id,
                            disabled=False,
                        )
                    )
                else:
                    platform_records.append(
                        PlatformDisableRecord(
                            platform=account.platform,
                            account_id=account.account_id,
                            disabled=True,
                            disabled_at=term_date + timedelta(days=random.randint(0, 3)),
                            disabled_by="offboarding-automation",
                        )
                    )

            status = OffboardingStatus.COMPLETED
            if any(not r.disabled for r in platform_records):
                status = OffboardingStatus.PARTIAL

            self.offboarding_records.append(
                OffboardingRecord(
                    offboarding_id=f"OB-{uuid.uuid4().hex[:8]}",
                    identity_id=ident.identity_id,
                    employee_name=ident.display_name,
                    hr_termination_date=term_date,
                    offboarding_initiated_at=term_date + timedelta(hours=random.randint(1, 48)),
                    status=status,
                    platform_records=platform_records,
                    completed_at=(
                        term_date + timedelta(days=random.randint(1, 5))
                        if status == OffboardingStatus.COMPLETED
                        else None
                    ),
                )
            )

    def get_anomaly_distribution(self) -> dict[str, int]:
        dist: dict[str, int] = {}
        for cat in self.anomaly_labels.values():
            dist[cat] = dist.get(cat, 0) + 1
        return dist
