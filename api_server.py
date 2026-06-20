"""
FastAPI server — serves pipeline data, graph exports, incidents, copilot, and static UI.
Run: uvicorn api_server:app --reload --port 8000
(Python 3.11 recommended)
"""
import csv
import json
import logging
from pathlib import Path
from typing import Any

import networkx as nx
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, HTMLResponse
from pydantic import BaseModel

logger = logging.getLogger("identitysphere.api")

app = FastAPI(title="IdentitySphere AI API", version="0.4.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

ROOT = Path(__file__).parent
FRONTEND_DIR = ROOT / "frontend"
DATA_DIR = ROOT / "identitysphere" / "data" / "generated"
FRONTEND_DATA = FRONTEND_DIR / "public" / "data" / "platform_data.json"

_STATIC_ROOT_FILES = {
    "login.html", "index.html", "logo.png", "background.jpg", "favicon.ico",
}

_cache: dict[str, Any] = {}
_attack_graph: nx.DiGraph | None = None


def _file_response(path: Path):
    if not path.is_file():
        raise HTTPException(404, "Not found")
    return FileResponse(path)


def _read_csv(name):
    path = DATA_DIR / name
    if not path.exists():
        return []
    with open(path, encoding="utf-8") as f:
        return list(csv.DictReader(f))


def _read_json(path: Path):
    if not path.exists():
        return None
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def _load_attack_graph() -> nx.DiGraph | None:
    global _attack_graph
    if _attack_graph is not None:
        return _attack_graph
    data = _read_json(DATA_DIR / "attack_graph.json")
    if not data:
        return None
    g = nx.DiGraph()
    for node in data.get("nodes", []):
        node_id = node.pop("id")
        g.add_node(node_id, **node)
    for edge in data.get("edges", []):
        src = edge.pop("source")
        tgt = edge.pop("target")
        g.add_edge(src, tgt, **edge)
    _attack_graph = g
    return g


def _load():
    if _cache.get("_loaded"):
        return
    _cache["report"] = _read_json(DATA_DIR / "pipeline_report.json") or {}
    _cache["platform"] = _read_json(FRONTEND_DATA) or {}
    _cache["groups"] = _read_json(DATA_DIR / "groups.json") or []
    _cache["identities_csv"] = _read_csv("identities.csv")
    _cache["offboarding"] = _read_csv("offboarding.csv")
    _cache["memberships"] = _read_csv("memberships.csv")
    _cache["entitlements"] = _read_csv("entitlements.csv")
    _cache["audit_events"] = _read_csv("audit_events.csv")
    _cache["risk_events"] = _read_json(DATA_DIR / "risk_events.json") or []
    _cache["incidents"] = _read_json(DATA_DIR / "incidents.json") or []
    _cache["identity_scores"] = _read_json(DATA_DIR / "identity_scores.json") or {}
    _cache["blast_radii"] = _read_json(DATA_DIR / "blast_radii.json") or {}
    _cache["privilege_heatmap"] = _read_json(DATA_DIR / "privilege_heatmap.json") or {}
    if not _cache["incidents"] and _cache["report"].get("incident_clusters"):
        _cache["incidents"] = _cache["report"]["incident_clusters"]
    _cache["_loaded"] = True


@app.on_event("startup")
def startup():
    _load()


class CopilotRequest(BaseModel):
    query: str
    person_id: str | None = None


@app.get("/api/health")
def health():
    _load()
    return {
        "status": "ok",
        "identities": len(_cache.get("platform", {}).get("identities", [])),
        "incidents": len(_cache.get("incidents", [])),
        "risk_events": len(_cache.get("risk_events", [])),
    }


@app.get("/api/report")
def report():
    return _cache.get("report", {})


@app.get("/api/stats")
def stats():
    p = _cache.get("platform", {})
    return p.get("stats", {})


@app.get("/api/identities")
def identities():
    p = _cache.get("platform", {})
    return p.get("identities", [])


@app.get("/api/identities/{person_id}")
def identity_detail(person_id: str):
    p = _cache.get("platform", {})
    for ident in p.get("identities", []):
        if ident["person_id"] == person_id:
            ent = [e for e in _cache.get("entitlements", []) if e.get("person_id") == person_id]
            mem = [m for m in _cache.get("memberships", []) if m.get("person_id") == person_id]
            evt = [e for e in _cache.get("audit_events", []) if e.get("person_id") == person_id]
            off = [o for o in _cache.get("offboarding", []) if o.get("person_id") == person_id]
            score = _cache.get("identity_scores", {}).get(person_id)
            return {
                **ident,
                "entitlements": ent,
                "memberships": mem,
                "audit_events": evt,
                "offboarding": off,
                "composite_score": score,
            }
    raise HTTPException(404, f"Identity {person_id} not found")


@app.get("/api/risks")
def risks():
    events = _cache.get("risk_events", [])
    if events:
        return sorted(events, key=lambda r: r.get("score", 0), reverse=True)
    r = _cache.get("report", {})
    return r.get("top_risky_identities", [])


@app.get("/api/risk-events")
def risk_events():
    return _cache.get("risk_events", [])


@app.get("/api/incidents")
def incidents():
    return _cache.get("incidents", [])


@app.get("/api/compliance")
def compliance():
    r = _cache.get("report", {})
    mapping = r.get("compliance_mapping", [])
    if mapping:
        return mapping
    return _cache.get("platform", {}).get("compliance_mapping", [])


@app.get("/api/blast-radius")
def blast_radius():
    r = _cache.get("report", {})
    summary = r.get("blast_radius_summary", {})
    if summary:
        return summary
    radii = _cache.get("blast_radii", {})
    return {"assessed_count": len(radii), "top_blast_radii": list(radii.values())}


@app.get("/api/blast-radius/{person_id}")
def blast_radius_for_identity(person_id: str):
    radii = _cache.get("blast_radii", {})
    if person_id in radii:
        return radii[person_id]
    summary = _cache.get("report", {}).get("blast_radius_summary", {})
    for item in summary.get("top_blast_radii", []):
        if item.get("identity_id") == person_id:
            return item
    raise HTTPException(404, f"No blast radius for {person_id}")


@app.get("/api/scores/{person_id}")
def score_detail(person_id: str):
    scores = _cache.get("identity_scores", {})
    if person_id not in scores:
        raise HTTPException(404, f"No score for {person_id}")
    return scores[person_id]


@app.get("/api/privilege-heatmap")
def privilege_heatmap():
    heatmap = _cache.get("privilege_heatmap", {})
    if heatmap:
        return heatmap
    raise HTTPException(404, "Heatmap not generated — run pipeline first")


@app.get("/api/graph/{person_id}")
def graph_for_identity(person_id: str):
    from identitysphere.core.graph import AttackGraph
    from identitysphere.core.graph_export import export_identity_subgraph
    from identitysphere.utils.graph import IdentityGraph

    g = _load_attack_graph()
    if g is None:
        raise HTTPException(503, "Attack graph not available — run pipeline to export artifacts")

    base = IdentityGraph()
    base.graph = g
    attack = AttackGraph(base)
    return export_identity_subgraph(attack, person_id)


@app.get("/api/attack-paths/{person_id}")
def attack_paths(person_id: str):
    graph_data = graph_for_identity(person_id)
    return {
        "person_id": person_id,
        "paths": graph_data.get("paths", []),
        "path_count": len(graph_data.get("paths", [])),
    }


@app.post("/api/copilot/chat")
def copilot_chat(body: CopilotRequest):
    from identitysphere.core.copilot import SecurityCopilot

    _load()
    p = _cache.get("platform", {})
    identities = {i["person_id"]: i for i in p.get("identities", [])}
    person_id = body.person_id
    if not person_id:
        q = body.query.lower()
        for ident in p.get("identities", []):
            if ident.get("display_name", "").lower() in q or ident["person_id"].lower() in q:
                person_id = ident["person_id"]
                break

    copilot = SecurityCopilot(config={"copilot": {"mode": "offline"}})
    if person_id and person_id in identities:
        ident_data = identities[person_id]
        score = _cache.get("identity_scores", {}).get(person_id, {})
        risks = [r for r in _cache.get("risk_events", []) if r.get("identityId") == person_id]
        narrative = copilot.generate_risk_narrative_offline(
            display_name=ident_data.get("display_name", person_id),
            risk_score=score.get("final_score", ident_data.get("risk_score", 0)),
            severity=score.get("severity", ident_data.get("severity", "low")),
            factors=score.get("factors", []),
            risks=risks,
            remediation=ident_data.get("remediation_steps", []),
        )
        return {"response": narrative, "person_id": person_id, "mode": "offline"}

    return {
        "response": copilot.generate_general_response(body.query, len(identities)),
        "mode": "offline",
    }


@app.get("/api/risk-report")
def risk_report_json():
    report = _cache.get("report", {})
    top = report.get("top_risky_identities", [])[:10]
    return {
        "generated_at": report.get("metadata", {}).get("run_timestamp"),
        "success_metrics": report.get("success_metrics", {}),
        "top_risky_identities": top,
    }


@app.get("/api/risk-report/html")
def risk_report_html():
    from identitysphere.core.risk_report import build_risk_report_html

    report = _cache.get("report", {})
    if not report.get("top_risky_identities"):
        raise HTTPException(404, "Risk report not available — run pipeline first")
    return HTMLResponse(build_risk_report_html(report))


@app.get("/api/risk-report/download")
def risk_report_download():
    path = DATA_DIR / "risk_report.html"
    if not path.exists():
        from identitysphere.core.risk_report import write_risk_report_html
        report = _cache.get("report", {})
        if not report:
            raise HTTPException(404, "Risk report not available — run pipeline first")
        write_risk_report_html(report, path)
    return FileResponse(path, media_type="text/html", filename="identitysphere_risk_report.html")


@app.get("/api/offboarding-gaps")
def offboarding_gaps():
    from identitysphere.core.offboarding_gaps import compute_offboarding_gaps

    rows = _cache.get("offboarding", [])
    events = _cache.get("risk_events", [])
    return compute_offboarding_gaps(rows, events)


@app.post("/api/pipeline/run")
def run_pipeline():
    try:
        from identitysphere.core.pipeline import IdentitySpherePipeline
        import subprocess
        import sys

        pipeline = IdentitySpherePipeline()
        report = pipeline.run()
        subprocess.run([sys.executable, str(ROOT / "build_frontend_data.py")], check=True)
        _cache.clear()
        global _attack_graph
        _attack_graph = None
        _load()
        return {"status": "ok", "report_summary": report.get("data_summary", {})}
    except Exception as exc:
        logger.exception("Pipeline run failed")
        raise HTTPException(500, str(exc)) from exc


@app.get("/")
def root_page():
    return _file_response(ROOT / "index.html")


@app.get("/login.html")
def login_page():
    return _file_response(ROOT / "login.html")


@app.get("/{asset_name}")
def root_assets(asset_name: str):
    if asset_name in _STATIC_ROOT_FILES:
        return _file_response(ROOT / asset_name)
    dist_file = FRONTEND_DIR / "dist" / asset_name
    if dist_file.is_file():
        return FileResponse(dist_file)
    raise HTTPException(404, "Not found")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("api_server:app", host="0.0.0.0", port=8000, reload=True)
