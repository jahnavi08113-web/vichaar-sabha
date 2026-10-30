import crypto from 'node:crypto';
import { getSkill } from './skill.mjs';
import { validateSchema } from './schema.mjs';
import { buildContext } from './context.mjs';
import { runOpening } from './roles/paksh.mjs';
import { getAdapter } from '../providers/index.mjs';

const hearings = new Map();

export function createHearing(caseData) {
  const skill = getSkill();
  const caseSchema = skill.schemas['case-input'];

  const val = validateSchema(caseSchema, caseData);
  if (!val.valid) {
    const err = new Error(`Invalid case input: ${val.errors.join('; ')}`);
    err.code = 'invalid_case';
    err.status = 400;
    err.errors = val.errors;
    throw err;
  }

  if (caseData.brief && caseData.brief.length > 1200) {
    const err = new Error('Case brief exceeds 1200 characters');
    err.code = 'invalid_case';
    err.status = 400;
    throw err;
  }

  if (Array.isArray(caseData.exhibits) && caseData.exhibits.length > 10) {
    const err = new Error('Exhibits exceed maximum limit of 10');
    err.code = 'invalid_case';
    err.status = 400;
    throw err;
  }

  const id = crypto.randomUUID();
  const budget = parseInt(process.env.VS_HEARING_TOKEN_BUDGET || '8000', 10);

  const hearing = {
    id,
    case: JSON.parse(JSON.stringify(caseData)),
    createdAt: Date.now(),
    tokensUsed: 0,
    budget,
    pakshOpening: null,
    pakshLedger: null,
    vipakshOpening: null,
    vipakshLedger: null,
    mergedLedger: null,
    activeController: null,
    inFlightPaksh: null,
  };

  hearings.set(id, hearing);
  return { id, hearingId: id };
}

export function getHearing(id) {
  return hearings.get(id) || null;
}

export function deleteHearing(id) {
  const hearing = hearings.get(id);
  if (!hearing) return false;

  if (hearing.activeController) {
    try {
      hearing.activeController.abort();
    } catch {
      // Ignore abort errors
    }
  }

  hearings.delete(id);
  return true;
}

export function clearHearings() {
  for (const hearing of hearings.values()) {
    if (hearing.activeController) {
      try {
        hearing.activeController.abort();
      } catch {
        // Ignore
      }
    }
  }
  hearings.clear();
}

export function blindForJudge(openings, seed = Math.random) {
  const randVal = typeof seed === 'function' ? seed() : Number(seed);
  const isAFirst = randVal < 0.5;

  let paksh = null;
  let vipaksh = null;

  if (Array.isArray(openings)) {
    paksh = openings.find(o => o.role === 'paksh') || openings[0];
    vipaksh = openings.find(o => o.role === 'vipaksh') || openings[1];
  } else if (openings && typeof openings === 'object') {
    paksh = openings.paksh;
    vipaksh = openings.vipaksh;
  }

  function sanitizeStatement(stmt) {
    if (!stmt || typeof stmt !== 'string') return '';
    return stmt.replace(/\b(paksh|vipaksh|judge)\b/gi, '').replace(/\s+/g, ' ').trim();
  }

  function cloneSide(op, label) {
    if (!op) return null;
    const cloned = JSON.parse(JSON.stringify(op));
    if (cloned.statement) {
      cloned.statement = sanitizeStatement(cloned.statement);
    }
    cloned.side = label;
    delete cloned.role;
    return cloned;
  }

  const sideA = cloneSide(isAFirst ? paksh : vipaksh, 'Side A');
  const sideB = cloneSide(isAFirst ? vipaksh : paksh, 'Side B');

  return {
    order: ['Side A', 'Side B'],
    sideA,
    sideB,
    sides: [sideA, sideB],
  };
}

export async function runHearingPakshOpening(
  hearingId,
  { researchMode = 'case', connectionManager, sources = {}, signal } = {}
) {
  const hearing = getHearing(hearingId);
  if (!hearing) {
    const err = new Error(`Hearing ${hearingId} not found`);
    err.code = 'not_found';
    err.status = 404;
    throw err;
  }

  if (hearing.inFlightPaksh) {
    return hearing.inFlightPaksh;
  }

  if (!connectionManager) {
    throw new Error('connectionManager is required');
  }

  const roles = connectionManager.getRoles();
  const pakshRole = roles?.paksh;

  if (!pakshRole || !pakshRole.connectionId || !pakshRole.model) {
    const err = new Error("Paksh has no verified connection and model.");
    err.code = 'role_not_ready';
    err.status = 409;
    throw err;
  }

  const conn = connectionManager.getConnection(pakshRole.connectionId);
  if (!conn || conn.status !== 'verified') {
    const err = new Error("Paksh connection is not verified.");
    err.code = 'role_not_ready';
    err.status = 409;
    throw err;
  }

  const adapter = getAdapter(conn.provider, { fake: connectionManager.fake });
  const ctx = buildContext('paksh', 'opening', hearing);

  const controller = new AbortController();
  hearing.activeController = controller;

  if (signal) {
    signal.addEventListener('abort', () => controller.abort());
  }

  const checkBudget = (estimatedTokens) => {
    if (hearing.tokensUsed + estimatedTokens > hearing.budget) {
      const err = new Error(
        `Hearing token budget exceeded (${hearing.tokensUsed} used + ${estimatedTokens} estimated > ${hearing.budget})`
      );
      err.code = 'budget_exceeded';
      err.status = 429;
      throw err;
    }
  };

  const recordUsage = (tokens) => {
    hearing.tokensUsed += tokens;
  };

  const promise = (async () => {
    try {
      const result = await runOpening(ctx, {
        adapter,
        key: conn.key,
        model: pakshRole.model,
        researchMode,
        signal: controller.signal,
        sources,
        checkBudget,
        recordUsage,
      });

      if (result.status === 'ok') {
        hearing.pakshOpening = result.opening;
        hearing.pakshLedger = result.ledger;
      }

      return result;
    } catch (err) {
      if (err.status === 401 || err.code === 'invalid_key') {
        connectionManager.markConnectionFailed(conn.id, {
          code: 'unauthorized',
          message: err.message,
        });
      }
      throw err;
    } finally {
      hearing.inFlightPaksh = null;
      hearing.activeController = null;
    }
  })();

  hearing.inFlightPaksh = promise;
  return promise;
}
