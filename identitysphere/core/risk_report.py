"""Generate submission-ready HTML risk reports from pipeline output."""

from __future__ import annotations

import html
import json
from datetime import datetime
from pathlib import Path
from typing import Any


PLATFORM_LABELS = {
    "active_directory": "Active Directory",
    "azure_ad": "Azure AD",
    "aws_iam": "AWS IAM",
    "okta": "Okta",
    "salesforce": "Salesforce",
    "servicenow": "ServiceNow",
    "github": "GitHub",
}


def _esc(value: Any) -> str:
    return html.escape(str(value) if value is not None else "")


def _platform_label(platform: str) -> str:
    return PLATFORM_LABELS.get(platform, platform.replace("_", " ").title())


def build_risk_report_html(report: dict[str, Any]) -> str:
    """Render a printable HTML audit report for top risky identities."""
    meta = report.get("metadata", {})
    success = report.get("success_metrics", {})
    detection = report.get("detection_summary", {})
    top = report.get("top_risky_identities", [])[:10]
    generated = meta.get("run_timestamp", datetime.utcnow().isoformat())

    detection_acc = detection.get("detection_accuracy") or {}
    precision_pct = round(detection_acc.get("precision", 0) * 100, 1)

    rows_html = []
    for idx, risk in enumerate(top, 1):
        factors = risk.get("factors") or {}
        factor_rows = "".join(
            f"<tr><td>{_esc(k.replace('_', ' ').title())}</td>"
            f"<td class='num'>{_esc(v)}</td></tr>"
            for k, v in factors.items()
        )
        platforms = ", ".join(_platform_label(p) for p in (risk.get("affected_platforms") or []))
        remediation = risk.get("remediation_steps") or []
        rem_html = "".join(f"<li>{_esc(step)}</li>" for step in remediation)
        compliance = ", ".join(risk.get("compliance_refs") or [])

        rows_html.append(f"""
        <section class="identity-card">
          <header>
            <span class="rank">#{idx}</span>
            <div>
              <h2>{_esc(risk.get('display_name', 'Unknown'))}</h2>
              <p class="meta">{_esc(risk.get('identity_id', ''))} · {_esc(risk.get('department', ''))}</p>
            </div>
            <div class="badges">
              <span class="badge severity-{_esc(risk.get('severity', 'medium'))}">{_esc(risk.get('severity', '').upper())}</span>
              <span class="badge score">{_esc(risk.get('score', 0))}/100</span>
            </div>
          </header>
          <p class="title">{_esc(risk.get('title', ''))}</p>
          <div class="grid-2">
            <div>
              <h3>Score factors</h3>
              <table class="factors"><tbody>{factor_rows or '<tr><td colspan="2">No factor breakdown</td></tr>'}</tbody></table>
            </div>
            <div>
              <h3>Exposure</h3>
              <p><strong>Platforms:</strong> {_esc(platforms or 'N/A')}</p>
              <p><strong>Evidence items:</strong> {_esc(risk.get('evidence_count', 0))}</p>
              <p><strong>Compliance:</strong> {_esc(compliance or 'N/A')}</p>
            </div>
          </div>
          <h3>Platform-specific remediation</h3>
          <ol class="remediation">{rem_html or '<li>Review identity access and revoke excessive privileges.</li>'}</ol>
        </section>
        """)

    body = "\n".join(rows_html)
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>IdentitySphere AI — Identity Risk Report</title>
  <style>
    :root {{ --red: #c1122f; --bg: #0f1117; --card: #1a1d27; --text: #e2e8f0; --muted: #94a3b8; }}
    * {{ box-sizing: border-box; }}
    body {{ font-family: 'Segoe UI', system-ui, sans-serif; margin: 0; background: var(--bg); color: var(--text); line-height: 1.5; }}
    .wrap {{ max-width: 960px; margin: 0 auto; padding: 2rem 1.5rem 4rem; }}
    h1 {{ margin: 0 0 0.25rem; font-size: 1.75rem; }}
    .subtitle {{ color: var(--muted); margin: 0 0 2rem; }}
    .summary {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 1rem; margin-bottom: 2rem; }}
    .metric {{ background: var(--card); border: 1px solid #2d3348; border-radius: 10px; padding: 1rem; }}
    .metric .label {{ font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em; color: var(--muted); }}
    .metric .value {{ font-size: 1.35rem; font-weight: 700; color: #f87171; margin-top: 0.25rem; }}
    .identity-card {{ background: var(--card); border: 1px solid #2d3348; border-radius: 12px; padding: 1.25rem 1.5rem; margin-bottom: 1.25rem; page-break-inside: avoid; }}
    .identity-card header {{ display: flex; gap: 1rem; align-items: flex-start; margin-bottom: 0.75rem; }}
    .rank {{ font-size: 1.5rem; font-weight: 800; color: var(--red); min-width: 2rem; }}
    .identity-card h2 {{ margin: 0; font-size: 1.15rem; }}
    .meta {{ margin: 0.15rem 0 0; color: var(--muted); font-size: 0.85rem; }}
    .badges {{ margin-left: auto; display: flex; gap: 0.5rem; flex-wrap: wrap; }}
    .badge {{ padding: 0.2rem 0.55rem; border-radius: 999px; font-size: 0.7rem; font-weight: 700; text-transform: uppercase; }}
    .severity-critical, .severity-high {{ background: #7f1d1d; color: #fecaca; }}
    .severity-medium {{ background: #78350f; color: #fde68a; }}
    .severity-low {{ background: #14532d; color: #bbf7d0; }}
    .score {{ background: #1e3a5f; color: #93c5fd; }}
    .title {{ color: var(--muted); font-size: 0.9rem; margin: 0 0 1rem; }}
    .grid-2 {{ display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }}
    @media (max-width: 640px) {{ .grid-2 {{ grid-template-columns: 1fr; }} }}
    h3 {{ font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.06em; color: var(--muted); margin: 0 0 0.5rem; }}
    table.factors {{ width: 100%; border-collapse: collapse; font-size: 0.85rem; }}
    table.factors td {{ padding: 0.35rem 0; border-bottom: 1px solid #2d3348; }}
    table.factors .num {{ text-align: right; font-family: monospace; }}
    .remediation {{ margin: 0; padding-left: 1.25rem; font-size: 0.9rem; }}
    .remediation li {{ margin-bottom: 0.35rem; }}
    .footer {{ margin-top: 2rem; padding-top: 1rem; border-top: 1px solid #2d3348; color: var(--muted); font-size: 0.8rem; }}
    @media print {{
      body {{ background: white; color: #111; }}
      .identity-card, .metric {{ border-color: #ccc; background: #fafafa; }}
    }}
  </style>
</head>
<body>
  <div class="wrap">
    <h1>IdentitySphere AI — Sample Risk Report</h1>
    <p class="subtitle">Cross-platform identity &amp; privilege risk assessment · Generated {_esc(generated)}</p>

    <div class="summary">
      <div class="metric"><div class="label">Identity coverage</div><div class="value">{_esc(success.get('identity_coverage', 'N/A'))}</div></div>
      <div class="metric"><div class="label">Alert consolidation</div><div class="value">{_esc(success.get('alert_consolidation_ratio', 'N/A'))}</div></div>
      <div class="metric"><div class="label">Risk events</div><div class="value">{_esc(detection.get('total_risk_events', 0))}</div></div>
      <div class="metric"><div class="label">Detection precision</div><div class="value">{_esc(precision_pct)}%</div></div>
    </div>

    {body}

    <div class="footer">
      IdentitySphere AI · Option A Graph-Based Cross-Platform Identity Intelligence ·
      Frameworks: NIST AC-2/AC-6, MITRE T1078/T1098/T1550, GDPR Art. 5/32, CIS 5/6
    </div>
  </div>
</body>
</html>"""


def write_risk_report_html(report: dict[str, Any], output_path: str | Path) -> Path:
    """Write HTML risk report to disk."""
    path = Path(output_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    html_content = build_risk_report_html(report)
    path.write_text(html_content, encoding="utf-8")
    return path


def write_risk_report_json(report: dict[str, Any], output_path: str | Path) -> Path:
    """Write a compact JSON risk report artifact."""
    path = Path(output_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "generated_at": report.get("metadata", {}).get("run_timestamp"),
        "success_metrics": report.get("success_metrics", {}),
        "top_risky_identities": report.get("top_risky_identities", [])[:10],
    }
    path.write_text(json.dumps(payload, indent=2, default=str), encoding="utf-8")
    return path
