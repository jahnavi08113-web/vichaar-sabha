import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import crypto from 'node:crypto';
import { ConnectionManager } from '../server/connections.mjs';
import { handleApi } from '../server/routes.mjs';
import { validateHost } from '../server.mjs';

function createTestServer() {
  const manager = new ConnectionManager({ fake: true });
  const sessionToken = crypto.randomUUID();

  const server = http.createServer((req, res) => {
    const port = server.address().port;
    if (!validateHost(req, port)) {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: { code: 'forbidden', message: 'Forbidden' } }));
      return;
    }
    if (req.url.startsWith('/api/')) {
      handleApi(req, res, { manager, sessionToken, fakeMode: true });
      return;
    }
    res.writeHead(404);
    res.end();
  });

  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      resolve({ server, port, sessionToken, manager });
    });
  });
}

test('Route tests: auth, host validation, CRUD, test, and no key leakage', async () => {
  const { server, port, sessionToken } = await createTestServer();
  const baseUrl = `http://127.0.0.1:${port}`;
  const allResponseTexts = [];

  async function api(path, { method = 'GET', headers = {}, body } = {}) {
    const res = await fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        Host: `127.0.0.1:${port}`,
        'X-VS-Token': sessionToken,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...headers,
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    allResponseTexts.push(text);
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {}
    return { status: res.status, json, text };
  }

  try {
    // 1. Health check
    const hRes = await api('/api/health');
    assert.equal(hRes.status, 200);
    assert.equal(hRes.json.ok, true);
    assert.equal(hRes.json.fake, true);

    // 2. Token required (403 without token)
    const noToken = await fetch(`${baseUrl}/api/connections`, {
      headers: { Host: `127.0.0.1:${port}` },
    });
    assert.equal(noToken.status, 403);

    // 3. Bad Host rejected (use raw http.request because Fetch spec forbids overriding Host header)
    const badHostStatus = await new Promise((resolve) => {
      const req = http.request({
        hostname: '127.0.0.1',
        port,
        path: '/api/health',
        method: 'GET',
        headers: {
          Host: 'attacker.com',
          'X-VS-Token': sessionToken,
        },
      }, (res) => resolve(res.statusCode));
      req.end();
    });
    assert.equal(badHostStatus, 403);

    // 4. Add connection
    const SECRET_KEY = 'sk-ant-very-secret-key-12345';
    const cRes1 = await api('/api/connections', {
      method: 'POST',
      body: { provider: 'anthropic', key: SECRET_KEY, label: 'Team' },
    });
    assert.equal(cRes1.status, 200);
    assert.equal(cRes1.json.reused, false);
    assert.equal(cRes1.json.connection.provider, 'anthropic');
    assert.equal(cRes1.json.connection.keyHint, '••••2345');
    assert.equal(cRes1.json.connection.status, 'verified');
    assert.ok(cRes1.json.connection.models.length > 0);
    const connId = cRes1.json.connection.id;

    // 5. Duplicate key reuse
    const cRes2 = await api('/api/connections', {
      method: 'POST',
      body: { provider: 'anthropic', key: `  ${SECRET_KEY}  ` }, // trimmed duplicate
    });
    assert.equal(cRes2.status, 200);
    assert.equal(cRes2.json.reused, true);
    assert.equal(cRes2.json.connection.id, connId);

    // 6. Assign role
    const rRes = await api('/api/roles/paksh', {
      method: 'PUT',
      body: { connectionId: connId, model: 'claude-3-5-sonnet-20241022' },
    });
    assert.equal(rRes.status, 200);
    assert.equal(rRes.json.connectionId, connId);
    assert.equal(rRes.json.model, 'claude-3-5-sonnet-20241022');

    // 7. Test role
    const tRes = await api('/api/roles/paksh/test', {
      method: 'POST',
    });
    assert.equal(tRes.status, 200);
    assert.ok(tRes.json.text.includes('Paksh'));
    assert.equal(tRes.json.usage.inputTokens, 38);
    assert.equal(tRes.json.usage.outputTokens, 21);
    assert.ok(typeof tRes.json.latencyMs === 'number');

    // 8. Re-verify connection
    const vRes = await api(`/api/connections/${connId}/verify`, {
      method: 'POST',
    });
    assert.equal(vRes.status, 200);
    assert.equal(vRes.json.status, 'verified');

    // 9. Delete connection (should unassign Paksh)
    const dRes = await api(`/api/connections/${connId}`, {
      method: 'DELETE',
    });
    assert.equal(dRes.status, 200);
    assert.deepEqual(dRes.json.unassignedRoles, ['paksh']);

    const rolesAfter = await api('/api/roles');
    assert.equal(rolesAfter.json.paksh.connectionId, null);

    // 10. CRITICAL SECURITY ASSERTION:
    // No response body ever contains the submitted secret key!
    for (const text of allResponseTexts) {
      assert.ok(
        !text.includes(SECRET_KEY),
        `SECURITY VIOLATION: response leaked secret key! Response: ${text}`
      );
    }
  } finally {
    server.close();
  }
});
