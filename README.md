# 🚨 🎥 **WATCH THE DEMO VIDEO** 🚨

## 👉 https://drive.google.com/file/d/1S0dyvAy0S6a2OOf8r5mFLgyA4MrnQk-5/view

<p align="center">
  <img src="logo.png" alt="IdentitySphere AI" width="120" />
</p>

<h1 align="center">IdentitySphere AI</h1>

<p align="center">
  <strong>Graph-based cross-platform identity intelligence for hybrid enterprises</strong>
</p>

<p align="center">
  <a href="#features">Features</a> •
  <a href="#tech-stack">Tech Stack</a> •
  <a href="#getting-started">Getting Started</a> •
  <a href="#demo-credentials">Demo Credentials</a> •
  <a href="#architecture">Architecture</a> •
  <a href="#api-reference">API Reference</a> •
  <a href="#project-structure">Project Structure</a> •
  <a href="#testing">Testing</a> •
  <a href="#deployment">Deployment</a> •
  <a href="#documentation">Documentation</a> •
  <a href="#license">License</a>
</p>

---

## Overview

IdentitySphere AI consolidates identity signals from **Active Directory, Azure AD, AWS IAM, Okta, Salesforce, ServiceNow, and GitHub** into a unified identity graph.

It computes effective privilege through nested group traversal, detects cross-platform abuse patterns using rule-based and ML-driven detectors, performs behavioral analysis, and surfaces explainable remediation through an interactive SOC dashboard.

Built as the **Option A** implementation for the *Identity Sprawl & Privileged Access Abuse* hackathon challenge.

### Supported Identity Platforms

* Active Directory (AD)
* Azure AD
* AWS IAM
* Okta
* Salesforce
* ServiceNow
* GitHub

---

## Features

* **Cross-Platform Identity Resolution** — Merges 385+ identity fragments into 370 unified profiles using email, display name, and username matching across 7 platforms.

* **Effective Privilege Computation** — NetworkX-powered graph traversal resolves nested group memberships up to depth 10, weighting admin access (10x), write access (3x), and sensitive resources (2.5x).

* **8 Rule-Based Detectors** — Detects orphaned accounts, offboarding gaps, cross-platform administrators, privilege escalation, token abuse, stale accounts, MFA gaps, and SoD violations.

* **ML Anomaly Detection** — Isolation Forest models identify access-pattern anomalies and behavioral anomalies using login frequency, hour-of-day, platform spread, privilege-to-usage ratio, and dormancy.

* **Explainable Risk Scoring** — Uses a 5-factor composite risk score with contextual false-positive suppression for on-call administrators, recent role changes, and MFA-compliant users.

* **DBSCAN Incident Clustering** — Groups related risk alerts into actionable identity-centric incidents and reduces alert noise by approximately 88%.

* **Attack Path Visualization** — Interactive ReactFlow graphs show potential lateral movement paths and blast-radius analysis.

* **Role-Based Dashboards** — Dedicated views for Admin/SOC, Auditor, Executive, Employee, and Contractor roles.

* **Security Copilot** — Template-based remediation narratives with optional LLM integration through an OpenAI-compatible API.

* **Compliance Mapping** — Maps relevant findings to NIST SP 800-53, MITRE ATT&CK, GDPR, and CIS Controls.

---

## Tech Stack

| Layer          | Technologies                                                                     |
| -------------- | -------------------------------------------------------------------------------- |
| **Backend**    | Python 3.11, FastAPI, NetworkX, scikit-learn, Pandas, NumPy                      |
| **Frontend**   | React 19, Vite 8, Tailwind CSS 4, Recharts, ReactFlow, Framer Motion, Three.js   |
| **ML/AI**      | Isolation Forest, DBSCAN clustering, weighted identity resolution                |
| **Data**       | Faker-generated synthetic enterprise identity data, YAML-configurable parameters |
| **Deployment** | Vercel (frontend), Uvicorn (API server)                                          |

---

## Getting Started

### Prerequisites

* Python 3.11+
* Node.js 18+
* npm or yarn

### Installation

```bash
# Clone the repository
git clone https://github.com/PradeepTech-hub/IdentitySphere-AI.git
cd IdentitySphere-AI

# Install Python dependencies
pip install -r requirements.txt

# Generate synthetic data and run the detection pipeline
python main.py

# Build frontend static data from CSV exports
python build_frontend_data.py

# Start the API server
python -m uvicorn api_server:app --reload --port 8000

# In a new terminal — start the React dashboard
cd frontend
npm install
npm run dev
```

Open:

```text
http://localhost:5173
```

to access the landing page.

### Quick Start — Windows

```powershell
.\start.ps1
```

---

## Demo Credentials

Login at:

```text
http://localhost:5173/login.html
```

| Role       | Email                          | Password          |
| ---------- | ------------------------------ | ----------------- |
| Admin      | `admin@identitysphere.ai`      | `Admin123!Secure` |
| Auditor    | `auditor@identitysphere.ai`    | `Admin123!Secure` |
| Executive  | `executive@identitysphere.ai`  | `Admin123!Secure` |
| Employee   | `employee@identitysphere.ai`   | `Admin123!Secure` |
| Contractor | `contractor@identitysphere.ai` | `Admin123!Secure` |

Each role has a dedicated dashboard view tailored to its responsibilities.

---

# Architecture

## Platform Layer

IdentitySphere AI models identity information across seven enterprise platforms:

```text
Active Directory
       │
Azure AD
       │
AWS IAM
       │
Okta
       │
Salesforce
       │
ServiceNow
       │
GitHub
       │
       ▼
Cross-Platform Identity Resolution
```

The platform layer represents identity fragments such as:

* Users
* Groups
* Roles
* Applications
* Permissions
* Policies
* Repository/team access
* Authentication and activity signals

---

## Pipeline Stages

| #  | Stage                     | Description                                                                                        |
| -- | ------------------------- | -------------------------------------------------------------------------------------------------- |
| 1  | **Data Generation**       | Generates synthetic enterprise identities across 7 represented platforms with labeled ground truth |
| 2  | **Ingestion**             | Normalizes exported identity data and builds the initial identity/account graph                    |
| 3  | **Duplicate Injection**   | Creates cross-platform identity fragments to simulate identity sprawl                              |
| 4  | **Identity Resolution**   | Merges identity fragments using weighted email, display-name, and username matching                |
| 5  | **Privilege Computation** | Traverses nested groups and inherited roles to calculate effective privilege                       |
| 6  | **Detection**             | Runs rule-based detectors and Isolation Forest anomaly detection                                   |
| 7  | **Behavioral Profiling**  | Analyzes login frequency, platform spread, usage patterns, and dormancy                            |
| 8  | **Risk Scoring**          | Calculates an explainable 5-factor composite risk score with contextual suppression                |
| 9  | **Attack Graphs**         | Identifies potential lateral movement paths and calculates blast radius                            |
| 10 | **Incident Clustering**   | Uses DBSCAN to group related alerts into identity-centric incidents                                |

---

## Identity Resolution

IdentitySphere AI resolves fragmented identity records using multiple attributes:

```text
Email
  +
Display Name
  +
Username
  ↓
Weighted Matching
  ↓
Unified Identity
```

The system merges identity fragments into a normalized identity view.

### Example

```text
AD Account
     +
AWS IAM User
     +
Okta User
     +
Salesforce User
     +
ServiceNow User
     +
GitHub User
     ↓
ONE UNIFIED IDENTITY
```

This allows security teams to understand the complete identity instead of investigating each platform separately.

---

## Effective Privilege Computation

IdentitySphere AI uses **NetworkX graph traversal** to calculate effective privilege.

The graph represents:

```text
Identity
   ↓
Account
   ↓
Group / Role
   ↓
Inherited Group / Role
   ↓
Permission
   ↓
Resource
```

Nested group memberships are traversed up to depth 10.

Privilege weighting:

| Access Type        | Weight |
| ------------------ | -----: |
| Admin              |    10x |
| Write              |     3x |
| Sensitive Resource |   2.5x |

This helps identify privileges that are not immediately visible from direct assignments.

---

## Risk Detection

IdentitySphere AI contains eight rule-based detectors:

1. **Orphaned Account**
2. **Offboarding Gap**
3. **Cross-Platform Admin**
4. **Privilege Escalation**
5. **Token Abuse**
6. **Stale Account**
7. **MFA Disabled**
8. **SoD Violation**

These detectors identify common identity and privileged-access risks across the enterprise identity estate.

---

## Behavioral Anomaly Detection

IdentitySphere AI uses **Isolation Forest** to detect unusual identity behavior.

Features include:

* Login frequency
* Hour-of-day distribution
* Platform spread
* Privilege-to-usage ratio
* Dormancy

The behavioral model complements the rule-based detectors by identifying unusual patterns that may not match a predefined rule.

---

## Explainable Risk Scoring

The composite risk score is calculated using five factors:

```text
Composite Risk =
(
    Privilege Breadth × 0.25
  + Cross-Platform Exposure × 0.20
  + Dormancy × 0.15
  + Detector Severity × 0.25
  + Behavioral Anomaly × 0.15
)
× Suppression
```

### Suppression Factors

Contextual suppression is applied for:

* Active administrator / privileged role
* MFA enabled across platforms
* On-call / break-glass accounts
* Recent role changes

The goal is to reduce false positives while preserving meaningful security findings.

---

## Attack Path & Blast Radius

IdentitySphere AI builds interactive attack graphs to show potential lateral movement.

Example:

```text
Compromised Identity
        ↓
Nested Group
        ↓
Privileged Role
        ↓
Accessible Resource
        ↓
Sensitive Resource
```

The blast-radius analysis helps answer:

> **"If this identity is compromised, what could an attacker potentially reach?"**

Attack paths are visualized through the ReactFlow-based dashboard.

---

## Incident Clustering

Individual alerts can represent the same underlying security issue.

IdentitySphere AI uses **DBSCAN clustering** to group related risk events into identity-centric incidents.

```text
Alert 1 ─┐
Alert 2 ─┤
Alert 3 ─┼──► One Related Incident
Alert 4 ─┤
Alert 5 ─┘
```

This reduces alert noise and provides SOC analysts with a more actionable incident view.

---

## Remediation Guidance

The Security Copilot component generates explainable remediation narratives.

Typical recommendations can include:

* Disable or review the affected account
* Remove unnecessary privileged roles
* Review inherited group membership
* Revoke excessive access
* Investigate cross-platform activity
* Rotate or review tokens
* Enforce MFA
* Review offboarding status

The current implementation provides **remediation guidance** rather than automatically executing changes against live enterprise platforms.

---

## Dashboard

The React dashboard provides role-specific views for:

### Admin / SOC

* Identity Inventory
* Lifecycle / JML
* Access Review
* Privileges
* Risk Findings
* Offboarding Gaps
* Attack Paths
* Blast Radius
* Compliance
* AI Copilot
* Incidents
* Scenario Simulation

### Auditor

Provides audit-focused visibility into:

* Identity risk
* Access
* Compliance
* Evidence
* Risk reports

### Executive

Provides high-level visibility into:

* Overall identity risk
* Critical findings
* Risk trends
* Business impact

### Employee

Provides self-service visibility into:

* Own identity
* Access
* Risk
* Security information

### Contractor

Provides restricted identity and access visibility appropriate for contractor accounts.

---

## Scoring Formula

```text
composite =
(
    privilege_breadth × 0.25
  + cross_platform × 0.20
  + dormancy × 0.15
  + detector_severity × 0.25
  + behavioral_anomaly × 0.15
)
× suppression
```

Suppression factors:

```text
Active admin          → -15%
MFA on all platforms  → -20%
On-call               → -40%
Recent role change    → -30%
```

---

# Performance Metrics

| Metric                 | Result    | Target            |
| ---------------------- | --------- | ----------------- |
| Identity Coverage      | **100%**  | >= 95%            |
| Alert Consolidation    | **~88%**  | >= 40%            |
| Detection Precision    | **69.2%** | Audit-trustworthy |
| Detection Recall       | **84.4%** | —                 |
| F1 Score               | **0.76**  | —                 |
| FP Traps Flagged as TP | **0**     | 0                 |

These results are based on the synthetic evaluation dataset and labeled ground-truth scenarios used by the prototype.

---

# API Reference

Base URL:

```text
http://localhost:8000
```

| Method | Endpoint                  | Description                           |
| ------ | ------------------------- | ------------------------------------- |
| `GET`  | `/api/identities`         | All 370 resolved identities           |
| `GET`  | `/api/risk-events`        | Scored risk findings                  |
| `GET`  | `/api/incidents`          | DBSCAN incident clusters              |
| `GET`  | `/api/offboarding-gaps`   | Cross-platform deprovisioning gaps    |
| `GET`  | `/api/graph/{person_id}`  | Identity subgraph in ReactFlow format |
| `GET`  | `/api/scores/{person_id}` | Explainable risk-factor breakdown     |
| `GET`  | `/api/risk-report/html`   | Printable audit risk report           |
| `POST` | `/api/pipeline/run`       | Re-run the full detection pipeline    |

---

# Project Structure

```text
IdentitySphere-AI/
├── main.py
├── api_server.py
├── build_frontend_data.py
├── requirements.txt
├── vercel.json
│
├── identitysphere/
│   ├── config/
│   │   └── settings.yaml
│   │
│   ├── core/
│   │   ├── pipeline.py
│   │   ├── resolver.py
│   │   ├── privilege.py
│   │   ├── detectors.py
│   │   ├── behavioral.py
│   │   ├── scoring.py
│   │   ├── graph.py
│   │   ├── blast_radius.py
│   │   ├── incidents.py
│   │   ├── copilot.py
│   │   └── risk_report.py
│   │
│   ├── generators/
│   │   └── synthetic.py
│   │
│   └── data/
│       └── generated/
│
├── frontend/
│   ├── src/
│   │   ├── App.jsx
│   │   ├── pages/
│   │   │   ├── landing/
│   │   │   ├── auth/
│   │   │   ├── admin/
│   │   │   ├── auditor/
│   │   │   ├── executive/
│   │   │   ├── employee/
│   │   │   └── contractor/
│   │   │
│   │   ├── components/
│   │   │   ├── charts/
│   │   │   ├── layout/
│   │   │   ├── shared/
│   │   │   └── three/
│   │   │
│   │   └── context/
│   │
│   └── package.json
│
├── tests/
├── docs/
│   ├── DATA_DICTIONARY.md
│   └── ML_METHODOLOGY.md
│
└── ARCHITECTURE.md
```

---

# Testing

Run the complete test suite:

```bash
pytest tests/ -v
```

Run an individual test file:

```bash
pytest tests/test_pipeline.py -v
```

The test suite covers:

* Pipeline orchestration
* Identity resolution
* Privilege calculation
* Risk detectors
* Behavioral profiling
* Risk scoring
* Attack graphs
* Blast radius
* Incident clustering
* Security Copilot
* Data export

---

# Deployment

## Frontend

The frontend is configured for deployment on Vercel through `vercel.json`.

It builds the React application from:

```text
frontend/
```

and supports SPA routing.

## Backend

Production server:

```bash
python -m uvicorn api_server:app --host 0.0.0.0 --port 8000
```

---

# Re-run Pipeline

To regenerate synthetic data and refresh the generated outputs:

```bash
python main.py
python build_frontend_data.py
```

Then restart the API server or call:

```text
POST /api/pipeline/run
```

Configurable parameters are available in:

```text
identitysphere/config/settings.yaml
```

including:

* Identity count
* Platform configuration
* Anomaly rates
* Scoring weights
* Detector thresholds

---

# Documentation

* **ARCHITECTURE.md** — Pipeline stages, architecture, ML approach and evaluation metrics
* **docs/DATA_DICTIONARY.md** — Schema for generated CSV/JSON exports
* **docs/ML_METHODOLOGY.md** — Detailed ML methodology

---

# Compliance Framework Alignment

| Framework          | Controls / Techniques |
| ------------------ | --------------------- |
| **NIST SP 800-53** | AC-2, AC-6, IA-4      |
| **MITRE ATT&CK**   | T1078, T1098, T1550   |
| **GDPR**           | Article 5, Article 32 |
| **CIS Controls**   | Controls 5, 6         |

---

# Problem Statement Alignment

IdentitySphere AI was developed for the **Identity Sprawl & Privileged Access Abuse in Hybrid Enterprises** challenge.

The solution addresses the major challenge requirements:

| Challenge Requirement         | IdentitySphere AI                                |
| ----------------------------- | ------------------------------------------------ |
| Unified identity view         | Cross-platform identity resolution               |
| Identity matching             | Weighted email/name/username matching            |
| Hidden effective privilege    | NetworkX graph + nested group traversal          |
| Orphaned accounts             | Rule-based detector                              |
| Dormant / stale accounts      | Rule-based detector                              |
| Privilege abuse               | Over-privileged + privilege escalation detection |
| Cross-platform administrators | Cross-platform admin detector                    |
| Token misuse                  | Token abuse detector                             |
| Behavioral ambiguity          | Isolation Forest behavioral profiling            |
| Alert noise                   | DBSCAN incident clustering                       |
| Explainable risk              | 5-factor composite risk scoring                  |
| Attack-path visibility        | Attack graph + blast-radius analysis             |
| Cross-platform lifecycle gaps | Offboarding-gap analysis                         |
| Remediation                   | Security Copilot remediation guidance            |

---

# Limitations

IdentitySphere AI is a **hackathon prototype** using synthetic enterprise identity data.

The current implementation demonstrates the identity-intelligence and risk-analysis workflow without requiring access to live enterprise accounts.

The prototype does not directly execute administrative actions such as:

```text
Disable AD account
Revoke AWS role
Suspend Okta account
Remove Salesforce permission
Remove GitHub repository access
```

Instead, it produces **evidence-backed remediation guidance** for security teams.

Future production deployment could connect the same analytics engine to live enterprise identity providers through their APIs and implement controlled remediation workflows.

---

# License

Educational / hackathon challenge submission prototype.

---

<p align="center">
  Built with purpose by <strong>Pradeep M</strong>
</p>

<p align="center">
  <sub>IdentitySphere AI — Graph-based cross-platform identity intelligence for hybrid enterprises</sub>
</p>
