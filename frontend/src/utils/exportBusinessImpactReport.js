import { jsPDF } from 'jspdf';

function addPageIfNeeded(doc, y, margin = 20, threshold = 270) {
  if (y > threshold) {
    doc.addPage();
    return margin + 10;
  }
  return y;
}

function writeSection(doc, title, y, margin = 20) {
  y = addPageIfNeeded(doc, y, margin);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(30, 30, 30);
  doc.text(title, margin, y);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  return y + 8;
}

function writeLine(doc, text, y, margin = 20) {
  y = addPageIfNeeded(doc, y, margin);
  const lines = doc.splitTextToSize(text, doc.internal.pageSize.getWidth() - margin * 2);
  doc.text(lines, margin, y);
  return y + lines.length * 5 + 2;
}

export function buildBusinessImpactReport({
  user,
  overallRisk,
  criticalRisks,
  affectedUsers,
  sustainabilityScore,
  businessUnitImpact,
  topRiskCategories,
  complianceOverview,
  recentAlerts,
}) {
  return {
    title: 'Business Impact Report',
    generatedAt: new Date().toISOString(),
    generatedBy: user?.name || 'Executive User',
    role: user?.title || 'Executive',
    overallIdentityRisk: overallRisk,
    criticalRisks,
    affectedUsers,
    businessImpact: 'High',
    sustainabilityIndex: sustainabilityScore,
    businessUnitImpact,
    topRiskCategories,
    complianceOverview,
    recentAlerts,
  };
}

export function downloadReportJson(report) {
  const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `business-impact-report-${report.generatedAt.slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export function downloadReportPdf(report) {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const margin = 48;
  const pageWidth = doc.internal.pageSize.getWidth();
  let y = margin;

  doc.setFillColor(227, 25, 55);
  doc.rect(0, 0, pageWidth, 56, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text('IdentitySphere AI', margin, 34);
  doc.setFontSize(11);
  doc.text('Business Impact Report', pageWidth - margin, 34, { align: 'right' });

  y = 76;
  doc.setTextColor(80, 80, 80);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(`Generated: ${new Date(report.generatedAt).toLocaleString()}`, margin, y);
  y += 14;
  doc.text(`Prepared for: ${report.generatedBy} (${report.role})`, margin, y);
  y += 22;

  y = writeSection(doc, 'Executive Summary', y, margin);
  y = writeLine(doc, `Overall Identity Risk: ${report.overallIdentityRisk}/100`, y, margin);
  y = writeLine(doc, `Critical Risks: ${report.criticalRisks}`, y, margin);
  y = writeLine(doc, `Affected Users: ${report.affectedUsers.toLocaleString()}`, y, margin);
  y = writeLine(doc, `Business Impact Level: ${report.businessImpact}`, y, margin);
  y = writeLine(doc, `Sustainability Index: ${report.sustainabilityIndex}/100`, y, margin);
  y += 8;

  y = writeSection(doc, 'Business Impact by Unit', y, margin);
  report.businessUnitImpact.forEach((u) => {
    y = writeLine(doc, `${u.name}: ${u.value}% of organizational impact`, y, margin);
  });
  y += 8;

  y = writeSection(doc, 'Top Risk Categories', y, margin);
  report.topRiskCategories.forEach((c) => {
    y = writeLine(doc, `${c.label}: ${c.value}%`, y, margin);
  });
  y += 8;

  y = writeSection(doc, 'Compliance Overview', y, margin);
  report.complianceOverview.forEach((c) => {
    const label = c.framework || c.label;
    y = writeLine(doc, `${label}: ${c.score}%`, y, margin);
  });
  y += 8;

  y = writeSection(doc, 'Recent Alerts (Summary)', y, margin);
  report.recentAlerts.forEach((a) => {
    y = writeLine(doc, `${a.type} | ${a.severity} | Impact: ${a.impact} | ${a.status} | ${a.detected}`, y, margin);
  });
  y += 12;

  doc.setFontSize(8);
  doc.setTextColor(140, 140, 140);
  y = addPageIfNeeded(doc, y, margin);
  doc.text('Visibility-only executive report. No technical controls included.', margin, y);
  doc.text('IdentitySphere AI · Enterprise Identity Intelligence', margin, y + 12);

  doc.save(`business-impact-report-${report.generatedAt.slice(0, 10)}.pdf`);
}
