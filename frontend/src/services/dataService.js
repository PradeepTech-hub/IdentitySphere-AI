const API_BASE = 'http://localhost:8000/api';
let _cache = null;

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function loadPlatformData() {
  if (_cache) return _cache;
  try {
    const data = await fetchJson(`${API_BASE}/report`);
    if (data && data.metadata) {
      const platform = await fetchJson(`${API_BASE}/identities`);
      const stats = await fetchJson(`${API_BASE}/stats`);
      _cache = { identities: platform, stats, ...data };
      return _cache;
    }
  } catch {
    // API not available, fall back to static JSON
  }
  try {
    const data = await fetchJson('/data/platform_data.json');
    _cache = data;
    return _cache;
  } catch {
    _cache = { identities: [], stats: {}, status_counts: {}, type_counts: {} };
    return _cache;
  }
}

export async function getIdentities() {
  const data = await loadPlatformData();
  return data.identities || [];
}

export async function getIdentityById(personId) {
  try {
    return await fetchJson(`${API_BASE}/identities/${personId}`);
  } catch {
    const data = await loadPlatformData();
    return (data.identities || []).find(i => i.person_id === personId) || null;
  }
}

export async function getStats() {
  const data = await loadPlatformData();
  return data.stats || {};
}

export async function getTopRisks() {
  const data = await loadPlatformData();
  return data.top_risky_identities || [];
}

export async function getComplianceMapping() {
  const data = await loadPlatformData();
  return data.compliance_mapping || [];
}

export async function getBlastRadiusSummary() {
  const data = await loadPlatformData();
  return data.blast_radius_summary || {};
}

export async function getStatusCounts() {
  const data = await loadPlatformData();
  return data.status_counts || {};
}

export async function getTypeCounts() {
  const data = await loadPlatformData();
  return data.type_counts || {};
}
