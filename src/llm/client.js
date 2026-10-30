function getSessionToken() {
  if (typeof document === 'undefined') return null;
  const meta = document.querySelector('meta[name="vs-token"]');
  return meta ? meta.getAttribute('content') : null;
}

export function isLocalServerSupported() {
  if (typeof window === 'undefined') return false;
  if (window.location.protocol === 'file:') return false;
  return Boolean(getSessionToken());
}

async function request(path, { method = 'GET', body, signal } = {}) {
  const token = getSessionToken();
  if (!token) {
    const err = new Error('Live models need the local server. Run npm run dev, then reopen this page.');
    err.code = 'server_offline';
    throw err;
  }

  let res;
  try {
    res = await fetch(path, {
      method,
      headers: {
        'X-VS-Token': token,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal,
    });
  } catch (err) {
    if (err?.name === 'AbortError') {
      const abortErr = new Error('Hearing cancelled');
      abortErr.name = 'AbortError';
      throw abortErr;
    }
    const netErr = new Error('Local server is unreachable.');
    netErr.code = 'server_offline';
    throw netErr;
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data?.error?.message || 'Request failed.');
    err.code = data?.error?.code || 'unknown';
    err.status = res.status;
    throw err;
  }
  return data;
}

export async function checkHealth() {
  if (!isLocalServerSupported()) {
    return { ok: false, offline: true };
  }
  try {
    const data = await request('/api/health');
    return { ok: true, fake: data.fake };
  } catch {
    return { ok: false, offline: true };
  }
}

export async function fetchConnections() {
  return request('/api/connections');
}

export async function createConnection({ provider, key, label }) {
  return request('/api/connections', {
    method: 'POST',
    body: { provider, key, label },
  });
}

export async function reverifyConnection(id) {
  return request(`/api/connections/${encodeURIComponent(id)}/verify`, {
    method: 'POST',
  });
}

export async function deleteConnection(id) {
  return request(`/api/connections/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}

export async function fetchRoles() {
  return request('/api/roles');
}

export async function updateRole(role, { connectionId, model }) {
  return request(`/api/roles/${encodeURIComponent(role)}`, {
    method: 'PUT',
    body: { connectionId, model },
  });
}

export async function testRole(role) {
  return request(`/api/roles/${encodeURIComponent(role)}/test`, {
    method: 'POST',
  });
}

export async function createHearing(caseData) {
  return request('/api/hearings', {
    method: 'POST',
    body: { case: caseData },
  });
}

export async function runPakshOpening(hearingId, { researchMode = 'case', signal } = {}) {
  return request(`/api/hearings/${encodeURIComponent(hearingId)}/paksh/opening`, {
    method: 'POST',
    body: { researchMode },
    signal,
  });
}

export async function fetchHearingLogs(hearingId) {
  return request(`/api/hearings/${encodeURIComponent(hearingId)}/log`);
}

export async function deleteHearing(hearingId) {
  return request(`/api/hearings/${encodeURIComponent(hearingId)}`, {
    method: 'DELETE',
  });
}
