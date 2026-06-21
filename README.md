# IdentitySphere AI

**Graph-based cross-platform identity intelligence** for hybrid enterprises — Option A implementation for the *Identity Sprawl & Privileged Access Abuse* challenge.

Consolidates identity signals from Active Directory, Azure AD, AWS IAM, Okta, Salesforce, and ServiceNow into a unified graph, computes effective privilege, detects cross-platform abuse patterns, and surfaces explainable remediation.

## Quick start

**Requirements:** Python 3.11, Node.js 18+

```powershell
cd IdentitySphere-main

# 1. Install Python dependencies
pip install -r requirements.txt

# 2. Generate synthetic data + run detection pipeline (~20s)
python main.py

# 3. Build frontend static data from CSV exports
python build_frontend_data.py

# 4. Start API (port 8000)
python -m uvicorn api_server:app --reload --port 8000

# 5. Start React dashboard (port 5173)
cd frontend
npm install
npm run dev
```

**Login:** http://localhost:5173/login.html  
**Admin SOC console:** http://localhost:5173/admin

### Demo credentials

| Role | Email | Password |
|------|-------|----------|
| Admin | admin@identitysphere.ai | Admin123!Secure |
| Auditor | auditor@identitysphere.ai | Admin123!Secure |
| Executive | executive@identitysphere.ai | Admin123!Secure |
| Employee | employee@identitysphere.ai | Admin123!Secure |

## What it does

1. **Simulates** 370 hybrid identities across 6+ platforms with labeled ground truth
2. **Resolves** the same person across platforms (email/name/username matching)
3. **Computes** effective privilege via nested group traversal (NetworkX)
4. **Detects** orphaned accounts, offboarding gaps, token abuse, privilege escalation, cross-platform admin
5. **Scores** each identity with explainable 5-factor composite risk + FP suppression
6. **Clusters** related alerts into incidents (DBSCAN)
7. **Visualizes** risk list, privilege heatmap, attack paths, blast radius, offboarding gaps

## Success metrics (latest pipeline run)

| Metric | Target | Result |
|--------|--------|--------|
| Identity coverage | ≥95% | 100% |
| Alert consolidation | ≥40% | ~88% |
| Top risky identities | 5–10 with remediation | 10 in `risk_report.html` |

## Key outputs

| File | Description |
|------|-------------|
| `identitysphere/data/generated/pipeline_report.json` | Full pipeline summary |
| `identitysphere/data/generated/risk_report.html` | Printable sample risk report |
| `identitysphere/data/generated/risk_events.json` | All scored risk events |
| `identitysphere/data/generated/incidents.json` | DBSCAN incident clusters |
| `identitysphere/data/generated/*.csv` | Challenge dataset exports |

## API endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /api/identities` | All resolved identities |
| `GET /api/risk-events` | Scored risk findings |
| `GET /api/incidents` | Clustered incidents |
| `GET /api/offboarding-gaps` | Cross-platform offboarding gaps |
| `GET /api/risk-report/html` | Sample risk report (HTML) |
| `GET /api/graph/{person_id}` | Identity subgraph for visualization |
| `POST /api/pipeline/run` | Re-run full pipeline |

## Documentation

- [ARCHITECTURE.md](ARCHITECTURE.md) — pipeline stages, ML approach, metrics
- [docs/DATA_DICTIONARY.md](docs/DATA_DICTIONARY.md) — dataset schema for all 8 export files

## Project structure

```
identitysphere/
  config/settings.yaml    # Platforms, anomaly rates, scoring weights
  core/                   # Pipeline, detectors, scoring, graph, incidents
  generators/             # Synthetic data generation
  data/generated/         # Pipeline outputs (CSV, JSON, HTML)
frontend/src/             # React dashboard (Vite + Tailwind)
api_server.py             # FastAPI backend
main.py                   # Pipeline entry point
```

## Re-run pipeline

```powershell
python main.py
python build_frontend_data.py
# Restart uvicorn or POST /api/pipeline/run
```

## License

Educational / challenge submission prototype.
