# IdentitySphere AI — Architecture (Option A)

Graph-based cross-platform identity intelligence: synthetic hybrid data, NetworkX privilege graph, Isolation Forest anomaly detection, explainable composite scoring, DBSCAN incident clustering, FastAPI + React dashboard.

## Pipeline stages

1. Generate synthetic data (AD, Azure AD, AWS, Okta, Salesforce, ServiceNow)
2. Ingest + base graph
3. Inject duplicate fragments (resolver exercise)
4. Cross-platform identity resolution
5. Effective privilege (nested groups)
6. Rule + ML detection
7. Behavioral profiling
8. Composite risk scoring + alert consolidation
9. Attack graph + blast radius
10. DBSCAN incident clustering + API artifact export

Run: `C:\Users\spand\AppData\Local\Programs\Python\Python311\python.exe main.py`

## Key API endpoints

- `GET /api/identities` — 370 identities
- `GET /api/risk-events`, `/api/incidents`
- `GET /api/graph/{id}`, `/api/attack-paths/{id}`, `/api/blast-radius/{id}`
- `GET /api/privilege-heatmap`, `/api/scores/{id}`
- `POST /api/copilot/chat`

## Frontend

`PlatformDataProvider` loads pipeline data; admin dashboards use live API (not 25-item demo seed).
