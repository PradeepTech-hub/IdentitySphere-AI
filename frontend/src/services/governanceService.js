import { API_BASE } from './dataService';

let _gov = {
  access_requests: [],
  review_history: [],
  review_statuses: {},
  identity_overrides: {},
};

export function getGovernanceCache() {
  return _gov;
}

export function setGovernanceCache(data) {
  _gov = {
    access_requests: data?.access_requests || [],
    review_history: data?.review_history || [],
    review_statuses: data?.review_statuses || {},
    identity_overrides: data?.identity_overrides || {},
  };
}

export function getAuthToken() {
  try {
    const saved = sessionStorage.getItem('is_auth');
    if (!saved) return null;
    return JSON.parse(saved).auth_token || null;
  } catch {
    return null;
  }
}

export async function authFetch(url, options = {}) {
  const token = getAuthToken();
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
    headers['X-Auth-Token'] = token;
  }
  const res = await fetch(url, { ...options, headers, credentials: 'include' });
  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const body = await res.json();
      detail = body?.error || body?.detail?.error || body?.detail || detail;
    } catch {
      /* ignore */
    }
    throw new Error(typeof detail === 'string' ? detail : JSON.stringify(detail));
  }
  if (res.status === 204) return null;
  return res.json();
}

export async function loadGovernanceSnapshot() {
  try {
    const data = await authFetch(`${API_BASE}/governance/snapshot`);
    setGovernanceCache(data);
    return data;
  } catch {
    return _gov;
  }
}

export async function fetchAccessRequests(params = {}) {
  const qs = new URLSearchParams();
  if (params.status) qs.set('status', params.status);
  if (params.employeeEmail) qs.set('employeeEmail', params.employeeEmail);
  const suffix = qs.toString() ? `?${qs}` : '';
  const rows = await authFetch(`${API_BASE}/access-requests${suffix}`);
  _gov.access_requests = rows;
  return rows;
}

export async function createAccessRequest(payload) {
  const row = await authFetch(`${API_BASE}/access-requests`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  _gov.access_requests = [row, ..._gov.access_requests.filter((r) => r.id !== row.id)];
  return row;
}

export async function updateAccessRequest(reqId, updates) {
  const row = await authFetch(`${API_BASE}/access-requests/${reqId}`, {
    method: 'PATCH',
    body: JSON.stringify(updates),
  });
  _gov.access_requests = _gov.access_requests.map((r) => (r.id === reqId ? row : r));
  return row;
}

export async function appendReviewHistory(entries) {
  const rows = await authFetch(`${API_BASE}/review-history`, {
    method: 'POST',
    body: JSON.stringify(entries),
  });
  _gov.review_history = rows;
  return rows;
}

export async function saveReviewStatuses(statuses) {
  const merged = await authFetch(`${API_BASE}/review-statuses`, {
    method: 'PUT',
    body: JSON.stringify({ statuses }),
  });
  _gov.review_statuses = merged;
  return merged;
}

export async function patchIdentityRisk(personId, updates) {
  return authFetch(`${API_BASE}/identities/${personId}`, {
    method: 'PATCH',
    body: JSON.stringify(updates),
  });
}

export async function fetchAuthMe() {
  return authFetch(`${API_BASE}/auth/me`);
}

export async function fetchEmployeeProfile() {
  return authFetch(`${API_BASE}/employee/profile`);
}

export async function fetchEmployeeActivity() {
  return authFetch(`${API_BASE}/employee/activity`);
}

export async function expireApprovedRequests() {
  const now = new Date();
  const updates = [];
  for (const req of _gov.access_requests) {
    if (req.status === 'approved' && req.expiresAt && new Date(req.expiresAt) < now) {
      updates.push(updateAccessRequest(req.id, { status: 'expired' }));
    }
  }
  if (updates.length) await Promise.all(updates);
  return _gov.access_requests;
}
