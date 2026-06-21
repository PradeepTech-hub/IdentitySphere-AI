const API_BASE = import.meta.env.VITE_API_BASE || 'http://127.0.0.1:8000/api';

let _cache = null;
let _initPromise = null;

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export function setPlatformCache(data) {
  _cache = data;
}

export function getPlatformCache() {
  return _cache;
}

export function clearPlatformCache() {
  _cache = null;
  _initPromise = null;
}

function cap(s) {
  if (!s || typeof s !== 'string') return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function normalizeIdentity(i) {
  if (!i) return i;
  return {
    ...i,
    status: cap(i.status),
    type: cap(i.type),
  };
}

export async function loadPlatformData() {
  if (_cache) return _cache;

  let report = {};
  let identities = [];
  let stats = {};
  let riskEvents = [];
  let incidents = [];
  let blastRadii = [];
  let compliance = [];
  let heatmap = null;
  let offboardingGaps = [];
  let lifecycleEvents = [];

  try {
    [report, identities, stats, riskEvents, incidents, compliance, heatmap, offboardingGaps, lifecycleEvents] = await Promise.all([
      fetchJson(`${API_BASE}/report`),
      fetchJson(`${API_BASE}/identities`),
      fetchJson(`${API_BASE}/stats`),
      fetchJson(`${API_BASE}/risk-events`).catch(() => []),
      fetchJson(`${API_BASE}/incidents`).catch(() => []),
      fetchJson(`${API_BASE}/compliance`).catch(() => []),
      fetchJson(`${API_BASE}/privilege-heatmap`).catch(() => null),
      fetchJson(`${API_BASE}/offboarding-gaps`).catch(() => []),
      fetchJson(`${API_BASE}/lifecycle-events`).catch(() => []),
    ]);

    try {
      const br = await fetchJson(`${API_BASE}/blast-radius`);
      blastRadii = br.top_blast_radii || [];
    } catch {
      blastRadii = [];
    }
  } catch {
    try {
      const data = await fetchJson('/data/platform_data.json');
      _cache = {
        ...data,
        identities: (data.identities || []).map(normalizeIdentity),
        risk_events: [],
        incidents: data.incident_clusters || [],
      };
      return _cache;
    } catch {
      _cache = { identities: [], stats: {}, status_counts: {}, type_counts: {} };
      return _cache;
    }
  }

  _cache = {
    ...report,
    identities: identities.map(normalizeIdentity),
    stats,
    risk_events: riskEvents,
    incidents,
    compliance_mapping: compliance,
    privilege_heatmap: heatmap,
    offboarding_gaps: offboardingGaps,
    lifecycle_events: lifecycleEvents,
    blast_radii: blastRadii,
    top_risky_identities: report.top_risky_identities || [],
    status_counts: {},
    type_counts: {},
  };

  _cache.identities.forEach((i) => {
    const st = (i.status || 'active').toLowerCase();
    _cache.status_counts[st] = (_cache.status_counts[st] || 0) + 1;
    const ty = (i.type || 'human').toLowerCase();
    _cache.type_counts[ty] = (_cache.type_counts[ty] || 0) + 1;
  });

  return _cache;
}

export function initPlatformData() {
  if (!_initPromise) {
    _initPromise = loadPlatformData();
  }
  return _initPromise;
}

export async function getIdentitiesAsync() {
  const data = await initPlatformData();
  return data.identities || [];
}

export async function getIdentityById(personId) {
  try {
    const detail = await fetchJson(`${API_BASE}/identities/${personId}`);
    return normalizeIdentity(detail);
  } catch {
    const data = await loadPlatformData();
    return (data.identities || []).find((i) => i.person_id === personId) || null;
  }
}

export async function getStats() {
  const data = await initPlatformData();
  return data.stats || {};
}

export async function getTopRisks() {
  const data = await initPlatformData();
  return data.top_risky_identities || [];
}

export async function getRiskEventsAsync() {
  const data = await initPlatformData();
  return data.risk_events || [];
}

export async function getIncidentsAsync() {
  const data = await initPlatformData();
  return data.incidents || [];
}

export async function getComplianceMapping() {
  const data = await initPlatformData();
  return data.compliance_mapping || [];
}

export async function getBlastRadiusSummary() {
  const data = await initPlatformData();
  return data.blast_radius_summary || {};
}

export async function getBlastRadiiAsync() {
  const data = await initPlatformData();
  return data.blast_radii || [];
}

export async function getPrivilegeHeatmap() {
  try {
    return await fetchJson(`${API_BASE}/privilege-heatmap`);
  } catch {
    const data = await loadPlatformData();
    return data.privilege_heatmap;
  }
}

export async function fetchGraph(personId) {
  return fetchJson(`${API_BASE}/graph/${personId}`);
}

export async function fetchAttackPaths(personId) {
  return fetchJson(`${API_BASE}/attack-paths/${personId}`);
}

export async function fetchBlastRadius(personId) {
  return fetchJson(`${API_BASE}/blast-radius/${personId}`);
}

export async function fetchCopilotChat(query, personId = null) {
  const res = await fetch(`${API_BASE}/copilot/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, person_id: personId }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function fetchScore(personId) {
  return fetchJson(`${API_BASE}/scores/${personId}`);
}

export async function fetchLifecycleEvents() {
  return fetchJson(`${API_BASE}/lifecycle-events`).catch(() => []);
}

export async function runPipeline() {
  const res = await fetch(`${API_BASE}/pipeline/run`, { method: 'POST' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  clearPlatformCache();
  return res.json();
}

export { API_BASE };
