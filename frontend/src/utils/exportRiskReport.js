import { jsPDF } from 'jspdf';
import { API_BASE } from '../services/dataService';

export async function fetchRiskReportJson() {
  const res = await fetch(`${API_BASE}/risk-report`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export function openRiskReportHtml() {
  window.open(`${API_BASE}/risk-report/html`, '_blank', 'noopener,noreferrer');
}

export function downloadRiskReportHtml() {
  const link = document.createElement('a');
  link.href = `${API_BASE}/risk-report/download`;
  link.download = 'identitysphere_risk_report.html';
  link.click();
}

export function downloadRiskReportPdf(report) {
  const top = report?.top_risky_identities || [];
  const metrics = report?.success_metrics || {};
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const margin = 40;
  let y = margin;

  const addLine = (text, size = 10, bold = false) => {
    if (y > 760) {
      doc.addPage();
      y = margin;
    }
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    doc.setFontSize(size);
    const lines = doc.splitTextToSize(text, 515);
    doc.text(lines, margin, y);
    y += lines.length * (size + 2) + 4;
  };

  addLine('IdentitySphere AI — Sample Risk Report', 16, true);
  addLine(`Generated: ${report?.generated_at || new Date().toISOString()}`, 9);
  addLine(
    `Coverage: ${metrics.identity_coverage || 'N/A'} | Consolidation: ${metrics.alert_consolidation_ratio || 'N/A'}`,
    9,
  );
  y += 8;

  top.forEach((risk, idx) => {
    addLine(`${idx + 1}. ${risk.display_name} (${risk.identity_id}) — ${risk.severity?.toUpperCase()} ${risk.score}/100`, 11, true);
    addLine(risk.title || '', 9);
    const platforms = (risk.affected_platforms || []).join(', ');
    if (platforms) addLine(`Platforms: ${platforms}`, 9);
    (risk.remediation_steps || []).slice(0, 5).forEach((step, i) => {
      addLine(`  ${i + 1}. ${step}`, 9);
    });
    y += 6;
  });

  doc.save('identitysphere_risk_report.pdf');
}

export async function downloadRiskReportJson() {
  const report = await fetchRiskReportJson();
  const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'identitysphere_risk_report.json';
  link.click();
  URL.revokeObjectURL(url);
}
