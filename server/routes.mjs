import { getAdapter } from './providers/index.mjs';
import { TIMEOUTS } from './providers/config.mjs';
import { getSkill } from './engine/skill.mjs';
import {
  createHearing,
  getHearing,
  deleteHearing,
  runHearingPakshOpening,
} from './engine/orchestrator.mjs';
import { getHearingLogs } from './engine/request-log.mjs';

let skillLoadError = null;
try {
  getSkill();
} catch (err) {
  skillLoadError = err;
  console.error('Failed to load Paksh skill at startup:', err.message);
}

const ROLE_SYSTEM_PROMPTS = {
  paksh: 'You are Paksh, the advocate in Vichaar Sabha. Find the strongest honest case for an idea.',
  vipaksh: 'You are Vipaksh, the challenger in Vichaar Sabha. Test the idea where it is most likely to break.',
  judge: 'You are the Judge in Vichaar Sabha. Weigh both sides and find the next step.',
};

function sendJson(res, status, data) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
  });
  res.end(JSON.stringify(data));
}

function parseJsonBody(req, limit = 65536) {
  return new Promise((resolve, reject) => {
    let bytes = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      bytes += chunk.length;
      if (bytes > limit) {
        const err = new Error('Payload too large');
        err.statusCode = 413;
        reject(err);
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (chunks.length === 0) {
        resolve({});
        return;
      }
      try {
        const body = JSON.parse(Buffer.concat(chunks).toString('utf-8'));
        resolve(body);
      } catch (e) {
        const err = new Error('Invalid JSON');
        err.statusCode = 400;
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

export async function handleApi(req, res, { manager, sessionToken, fakeMode }) {
  const url = new URL(req.url, 'http://127.0.0.1');
  const pathname = url.pathname;
  const method = req.method;

  // Verify Session Token on every /api/* route
  const tokenHeader = req.headers['x-vs-token'];
  if (!tokenHeader || tokenHeader !== sessionToken) {
    return sendJson(res, 403, {
      error: { code: 'forbidden', message: 'Missing or invalid X-VS-Token header.' },
    });
  }

  try {
    // GET /api/health
    if (pathname === '/api/health' && method === 'GET') {
      return sendJson(res, 200, { ok: true, fake: Boolean(fakeMode) });
    }

    // GET /api/connections
    if (pathname === '/api/connections' && method === 'GET') {
      const connections = manager.getConnections();
      return sendJson(res, 200, connections);
    }

    // POST /api/connections
    if (pathname === '/api/connections' && method === 'POST') {
      const body = await parseJsonBody(req);
      const { provider, key, label } = body;
      if (!provider || !key) {
        return sendJson(res, 400, {
          error: { code: 'bad_request', message: 'Provider and key are required.' },
        });
      }
      const result = await manager.addConnection({ provider, key, label });
      if (!result.ok) {
        const status = result.error?.code === 'invalid_key' ? 401 : 400;
        return sendJson(res, status, { error: result.error });
      }
      return sendJson(res, 200, {
        reused: Boolean(result.reused),
        connection: result.connection,
      });
    }

    // POST /api/connections/:id/verify
    const verifyMatch = pathname.match(/^\/api\/connections\/([^/]+)\/verify$/);
    if (verifyMatch && method === 'POST') {
      const id = verifyMatch[1];
      const result = await manager.verifyConnection(id);
      if (!result.ok) {
        return sendJson(res, 404, { error: result.error });
      }
      return sendJson(res, 200, result.connection);
    }

    // DELETE /api/connections/:id
    const deleteMatch = pathname.match(/^\/api\/connections\/([^/]+)$/);
    if (deleteMatch && method === 'DELETE') {
      const id = deleteMatch[1];
      const result = manager.deleteConnection(id);
      if (!result.ok) {
        const status = result.error?.code === 'forbidden' ? 403 : 404;
        return sendJson(res, status, { error: result.error });
      }
      return sendJson(res, 200, result);
    }

    // GET /api/roles
    if (pathname === '/api/roles' && method === 'GET') {
      return sendJson(res, 200, manager.getRoles());
    }

    // PUT /api/roles/:role
    const roleMatch = pathname.match(/^\/api\/roles\/(paksh|vipaksh|judge)$/);
    if (roleMatch && method === 'PUT') {
      const role = roleMatch[1];
      const body = await parseJsonBody(req);
      const result = manager.assignRole(role, body);
      if (!result.ok) {
        return sendJson(res, 400, { error: result.error });
      }
      return sendJson(res, 200, result.role);
    }

    // Hearing routes check skillLoadError first
    if (pathname.startsWith('/api/hearings')) {
      if (skillLoadError) {
        return sendJson(res, 503, {
          error: { code: 'skill_unavailable', message: `Paksh skill failed to load: ${skillLoadError.message}` },
        });
      }
    }

    // POST /api/hearings
    if (pathname === '/api/hearings' && method === 'POST') {
      const body = await parseJsonBody(req);
      if (!body.case || typeof body.case !== 'object') {
        return sendJson(res, 400, {
          error: { code: 'invalid_case', message: 'Case object is required in body.' },
        });
      }
      try {
        const result = createHearing(body.case);
        return sendJson(res, 200, { hearingId: result.id });
      } catch (err) {
        return sendJson(res, err.status || 400, {
          error: {
            code: err.code || 'invalid_case',
            message: err.message,
            errors: err.errors || [err.message],
          },
        });
      }
    }

    // POST /api/hearings/:id/paksh/opening
    const pakshOpeningMatch = pathname.match(/^\/api\/hearings\/([^/]+)\/paksh\/opening$/);
    if (pakshOpeningMatch && method === 'POST') {
      const hearingId = pakshOpeningMatch[1];
      const hearing = getHearing(hearingId);
      if (!hearing) {
        return sendJson(res, 404, {
          error: { code: 'not_found', message: `Hearing ${hearingId} not found.` },
        });
      }

      const body = await parseJsonBody(req);
      const researchMode = body.researchMode || 'case';

      try {
        const result = await runHearingPakshOpening(hearingId, {
          researchMode,
          connectionManager: manager,
        });

        return sendJson(res, 200, {
          status: result.status,
          opening: result.opening,
          ledger: result.ledger,
          errors: result.errors || [],
          warnings: result.warnings || [],
          usage: result.usage,
          model: result.model,
          provider: result.provider,
          allowedInputs: result.allowedInputs,
          promptSha256: result.promptSha256,
        });
      } catch (err) {
        const status = err.status || 500;
        return sendJson(res, status, {
          error: {
            code: err.code || 'internal_error',
            message: err.message,
          },
        });
      }
    }

    // GET /api/hearings/:id/log
    const logMatch = pathname.match(/^\/api\/hearings\/([^/]+)\/log$/);
    if (logMatch && method === 'GET') {
      const hearingId = logMatch[1];
      const hearing = getHearing(hearingId);
      if (!hearing) {
        return sendJson(res, 404, {
          error: { code: 'not_found', message: `Hearing ${hearingId} not found.` },
        });
      }
      const logs = getHearingLogs(hearingId);
      return sendJson(res, 200, logs);
    }

    // DELETE /api/hearings/:id
    const hearingDeleteMatch = pathname.match(/^\/api\/hearings\/([^/]+)$/);
    if (hearingDeleteMatch && method === 'DELETE') {
      const hearingId = hearingDeleteMatch[1];
      const deleted = deleteHearing(hearingId);
      if (!deleted) {
        return sendJson(res, 404, {
          error: { code: 'not_found', message: `Hearing ${hearingId} not found.` },
        });
      }
      return sendJson(res, 200, { ok: true });
    }

    // POST /api/roles/:role/test
    const testMatch = pathname.match(/^\/api\/roles\/(paksh|vipaksh|judge)\/test$/);
    if (testMatch && method === 'POST') {
      const role = testMatch[1];
      const roles = manager.getRoles();
      const assignment = roles[role];

      if (!assignment || !assignment.connectionId || !assignment.model) {
        return sendJson(res, 400, {
          error: { code: 'not_ready', message: `Role ${role} has no connection or model assigned.` },
        });
      }

      const conn = manager.getConnection(assignment.connectionId);
      if (!conn || conn.status !== 'verified') {
        return sendJson(res, 400, {
          error: { code: 'not_verified', message: 'Connection is not verified.' },
        });
      }

      const adapter = getAdapter(conn.provider, { fake: fakeMode });
      const system = ROLE_SYSTEM_PROMPTS[role];
      const messages = [{ role: 'user', content: 'In one sentence, introduce yourself to the court.' }];

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), TIMEOUTS.generateMs);
      const t0 = Date.now();

      try {
        const resGen = await adapter.generate({
          key: conn.key,
          model: assignment.model,
          system,
          messages,
          maxOutputTokens: 60,
          signal: controller.signal,
        });
        const latencyMs = Date.now() - t0;
        return sendJson(res, 200, {
          text: resGen.text,
          usage: resGen.usage,
          model: resGen.model,
          finishReason: resGen.finishReason,
          latencyMs,
        });
      } catch (err) {
        if (err.status === 401 || err.code === 'invalid_key') {
          manager.markConnectionFailed(conn.id, {
            code: 'invalid_key',
            message: "This key wasn't accepted. Check that you copied all of it.",
          });
        }
        return sendJson(res, err.status || 500, {
          error: {
            code: err.code || 'unknown',
            message: err.message || 'Test call failed.',
          },
        });
      } finally {
        clearTimeout(timeout);
      }
    }

    // 404 for any other /api route
    return sendJson(res, 404, { error: { code: 'not_found', message: 'API route not found.' } });
  } catch (err) {
    if (err.statusCode === 413) {
      return sendJson(res, 413, { error: { code: 'payload_too_large', message: 'Payload exceeds 64 KB limit.' } });
    }
    return sendJson(res, err.statusCode || 500, { error: { code: 'internal', message: err.message } });
  }
}
