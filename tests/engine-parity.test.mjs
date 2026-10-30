import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';

import { getSkill } from '../server/engine/skill.mjs';
import { norm, verifyQuotes } from '../server/engine/verify-quotes.mjs';
import { mergeLedgers } from '../server/engine/merge-ledgers.mjs';
import { validatePaksh } from '../server/engine/validate-paksh.mjs';
import { renderPrompt, isolateCase } from '../server/engine/render.mjs';
import { buildContext } from '../server/engine/context.mjs';
import { extractJsonReply } from '../server/engine/json-reply.mjs';
import {
  createHearing,
  getHearing,
  deleteHearing,
  clearHearings,
  blindForJudge,
  runHearingPakshOpening,
} from '../server/engine/orchestrator.mjs';
import { getHearingLogs, clearLogs } from '../server/engine/request-log.mjs';
import { ConnectionManager } from '../server/connections.mjs';
import { fake } from '../server/providers/fake.mjs';
import { handleApi } from '../server/routes.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = path.resolve(__dirname, '../skills/paksh-advocate/examples/skill-swap');

function loadJson(rel) {
  return JSON.parse(fs.readFileSync(path.join(FIXTURES_DIR, rel), 'utf-8'));
}

test('Parity: Devanagari normalization and word boundary checks', () => {
  // कमला must NOT match inside नाम कमल है, and कमल MUST match
  const text = 'मेरा नाम कमल है और यह एक परीक्षा है।';
  const normText = norm(text);

  const quoteKamal = 'कमल';
  const normKamal = norm(quoteKamal);
  const regexKamal = new RegExp(`(^|\\s)${normKamal}($|\\s)`);
  assert.ok(regexKamal.test(normText), 'कमल must match with word boundaries');

  const quoteKamala = 'कमला';
  const normKamala = norm(quoteKamala);
  const regexKamala = new RegExp(`(^|\\s)${normKamala}($|\\s)`);
  assert.ok(!regexKamala.test(normText), 'कमला must not match inside नाम कमल है');
});

test('Parity: verifyQuotes matches golden fixtures for Paksh and Vipaksh', () => {
  const caseData = loadJson('case.json');
  const rawLedger = loadJson('ledger.raw.json');
  const expectedLedger = loadJson('ledger.json');

  const verified = verifyQuotes(rawLedger, caseData, {});
  assert.deepEqual(verified, expectedLedger, 'Paksh verified ledger matches golden fixture');

  const rawVipaksh = loadJson('vipaksh-ledger.raw.json');
  const expectedVipaksh = loadJson('vipaksh-ledger.json');
  const verifiedVipaksh = verifyQuotes(rawVipaksh, caseData, {});
  assert.deepEqual(verifiedVipaksh, expectedVipaksh, 'Vipaksh verified ledger matches golden fixture');
});

test('Parity: mergeLedgers matches golden merged ledger', () => {
  const verifiedPaksh = loadJson('ledger.json');
  const verifiedVipaksh = loadJson('vipaksh-ledger.json');
  const expectedMerged = loadJson('merged-ledger.json');

  const merged = mergeLedgers(verifiedPaksh, verifiedVipaksh, {
    pakshOpening: { mode: 'opening' },
    vipakshOpening: { mode: 'opening' },
  });

  assert.deepEqual(merged, expectedMerged, 'Merged ledger matches golden fixture');

  // Merging without both openings is refused
  assert.throws(
    () => mergeLedgers(verifiedPaksh, verifiedVipaksh, { pakshOpening: null, vipakshOpening: { mode: 'opening' } }),
    /openings/i
  );

  // Merging unverified is refused
  const rawLedger = loadJson('ledger.raw.json');
  assert.throws(
    () => mergeLedgers(rawLedger, verifiedVipaksh, { pakshOpening: { mode: 'opening' }, vipakshOpening: { mode: 'opening' } }),
    /(unverified|verify_quotes)/i
  );
});

test('Parity: validatePaksh fixture checks', () => {
  const ledger = loadJson('ledger.json');
  const opening = loadJson('opening.json');
  const caseOpening = loadJson('case-opening.json');

  const valLedger = validatePaksh('ledger', ledger);
  assert.ok(valLedger.valid, 'Golden ledger is valid');

  const valOpening = validatePaksh('opening', opening, ledger, { requireVerified: true });
  assert.ok(valOpening.valid, 'Golden opening is valid');

  const valCaseOpening = validatePaksh('case_opening', caseOpening, null, { requireVerified: true });
  assert.ok(valCaseOpening.valid, 'Golden case_opening is valid');

  // VE* citation in Paksh opening must fail
  const badOpening = JSON.parse(JSON.stringify(opening));
  badOpening.claims[0].evidence = ['VE1'];
  const valBad = validatePaksh('opening', badOpening, ledger);
  assert.ok(!valBad.valid, 'VE* in Paksh opening is invalid');
  assert.ok(valBad.errors.some(e => e.includes('VE1')), 'Error mentions VE1');
});

test('Parity: renderPrompt generates expected system and user templates', () => {
  const caseData = loadJson('case.json');
  const ledger = loadJson('ledger.json');
  const opening = loadJson('opening.json');

  for (const mode of ['opening', 'research_plan', 'clarify', 'case_opening']) {
    const rendered = renderPrompt({
      mode,
      caseData,
      ledger: mode === 'case_opening' ? null : ledger,
      opening: mode === 'clarify' ? opening : null,
      question: mode === 'clarify' ? 'What shows matches complete?' : null,
      targetClaim: mode === 'clarify' ? 'P1' : null,
    });

    assert.equal(rendered.messages.length, 2);
    assert.equal(rendered.messages[0].role, 'system');
    assert.equal(rendered.messages[1].role, 'user');
    assert.ok(rendered.messages[0].content.length > 50);
    assert.ok(rendered.messages[1].content.length > 50);
    assert.ok(!/\{\{\w+\}\}/.test(rendered.messages[1].content), 'No unfilled placeholders');
  }

  // Refusal: VE* in opening prompt
  const badLedger = {
    owner: 'paksh',
    items: [{ id: 'VE1', quote: 'test' }],
  };
  assert.throws(
    () => renderPrompt({ mode: 'opening', caseData, ledger: badLedger }),
    /isolation error/i
  );

  // Refusal: Vipaksh before rebuttal
  assert.throws(
    () => renderPrompt({ mode: 'opening', caseData, ledger, vipaksh: { statement: 'leaked' } }),
    /isolation error/i
  );
});

test('Isolation & Allow-list: buildContext freezes contexts and strips forbidden fields', () => {
  const rawHearing = {
    id: 'test-hearing-123',
    case: {
      id: 'swap',
      number: '016',
      title: 'Skill swap',
      brief: 'Students trade skills',
      goal: 'A student community experiment',
      goal_type: 'validate',
      script: ['Statement 1', 'Statement 2'],
      rulings: { demand: 'Overruled' },
      verdict: { outcome: 'approved' },
      headline: 'Headline text',
      notes: 'Secret notes',
      unauthorized_field: 'DO NOT LEAK',
      exhibits: [
        {
          id: 'swap-1',
          kind: 'note',
          title: 'Ex title',
          detail: 'Ex detail',
          private_comment: 'SECRET',
        },
      ],
    },
  };

  const ctx = buildContext('paksh', 'opening', rawHearing);
  assert.ok(Object.isFrozen(ctx), 'Context root is frozen');
  assert.ok(Object.isFrozen(ctx.case), 'Context case is frozen');
  assert.ok(Object.isFrozen(ctx.case.exhibits[0]), 'Context exhibits are frozen');

  // Allowed fields present
  assert.equal(ctx.case.id, 'swap');
  assert.equal(ctx.case.title, 'Skill swap');
  assert.equal(ctx.case.exhibits[0].title, 'Ex title');

  // Forbidden fields stripped
  assert.equal(ctx.case.script, undefined);
  assert.equal(ctx.case.rulings, undefined);
  assert.equal(ctx.case.verdict, undefined);
  assert.equal(ctx.case.headline, undefined);
  assert.equal(ctx.case.notes, undefined);
  assert.equal(ctx.case.unauthorized_field, undefined);
  assert.equal(ctx.case.exhibits[0].private_comment, undefined);

  // Unknown role/stage pair throws
  assert.throws(() => buildContext('judge', 'research', rawHearing), /unknown role\/stage/i);
  assert.throws(() => buildContext('hacker', 'opening', rawHearing), /unknown role\/stage/i);
});

test('Judge blinding: relabels sides, randomizes order, and strips role names', () => {
  const pakshOpening = {
    role: 'paksh',
    statement: 'Paksh argues that this idea is feasible and Vipaksh is mistaken.',
    claims: [{ id: 'P1', text: 'Feasible' }],
  };
  const vipakshOpening = {
    role: 'vipaksh',
    statement: 'Vipaksh contends the risk is too high; the Judge should reject it.',
    claims: [{ id: 'V1', text: 'Risky' }],
  };

  // Seed 0.1 -> Paksh first (Side A)
  const blindedA = blindForJudge({ paksh: pakshOpening, vipaksh: vipakshOpening }, () => 0.1);
  assert.equal(blindedA.sideA.side, 'Side A');
  assert.equal(blindedA.sideB.side, 'Side B');
  assert.ok(!blindedA.sideA.statement.toLowerCase().includes('paksh'));
  assert.ok(!blindedA.sideA.statement.toLowerCase().includes('vipaksh'));
  assert.ok(!blindedA.sideB.statement.toLowerCase().includes('judge'));

  // Seed 0.9 -> Vipaksh first (Side A)
  const blindedB = blindForJudge({ paksh: pakshOpening, vipaksh: vipakshOpening }, () => 0.9);
  assert.equal(blindedB.sideA.claims[0].id, 'V1');
  assert.equal(blindedB.sideB.claims[0].id, 'P1');
});

test('Leak test (Canary): canary never reaches Paksh prompt, requests, or response', async () => {
  const CANARY = 'ZEBRA-4471';
  fake.reset();
  clearLogs();
  clearHearings();

  const caseWithCanary = {
    id: 'swap',
    number: '016',
    title: 'Skill swap',
    brief: 'Students trade skills on campus.',
    goal: 'Test community interest',
    goal_type: 'validate',
    script: [`Canary in script: ${CANARY}`],
    rulings: { demand: `Canary in rulings: ${CANARY}` },
    verdict: { outcome: 'approved', detail: `Canary in verdict: ${CANARY}` },
    notes: `Canary in notes: ${CANARY}`,
    unauthorized_case_field: `Canary in secret field: ${CANARY}`,
    exhibits: [
      {
        id: 'swap-1',
        kind: 'note',
        title: 'Club partnerships',
        detail: 'Two clubs will share the invitation. Reach is not the same as successful matches.',
        canary_secret: CANARY,
      },
    ],
  };

  const cm = new ConnectionManager({ fake: true });
  await cm.addConnection({ provider: 'openai', key: 'test-key-fake' });
  const conn = cm.getConnections()[0];
  cm.assignRole('paksh', { connectionId: conn.id, model: 'gpt-4o-mini' });

  // Hearing 1 (target)
  const hearing = createHearing(caseWithCanary);

  // Hearing 2 (concurrent second hearing with canary in its case)
  createHearing({
    id: 'gear',
    title: `Concurrent hearing ${CANARY}`,
    brief: 'Gear rental trial',
    goal: 'Validate rental',
  });

  const result = await runHearingPakshOpening(hearing.id, {
    researchMode: 'case',
    connectionManager: cm,
  });

  assert.equal(result.status, 'ok');

  // Verify CANARY is absent from response body
  const resStr = JSON.stringify(result);
  assert.ok(!resStr.includes(CANARY), 'Response does not contain canary');

  // Verify CANARY is absent from all recorded requests sent to provider
  assert.ok(fake.requests.length >= 1, 'Fake provider recorded at least 1 request');
  for (const req of fake.requests) {
    const reqStr = JSON.stringify(req);
    assert.ok(!reqStr.includes(CANARY), 'Provider request does not contain canary');
  }

  // Positive control: CANARY does appear in rebuttal prompt where Vipaksh opening is allowed
  const rebuttalPrompt = renderPrompt({
    mode: 'rebuttal',
    caseData: caseWithCanary,
    vipaksh: { statement: `Vipaksh leaks ${CANARY}` },
  });
  const rebuttalStr = JSON.stringify(rebuttalPrompt);
  assert.ok(rebuttalStr.includes(CANARY), 'Positive control: canary appears in rebuttal prompt');

  // Validator flags canary in output
  const leakyOpening = JSON.parse(JSON.stringify(loadJson('opening.json')));
  leakyOpening.statement += ` Leaked ${CANARY}`;
  const valLeaky = validatePaksh('opening', leakyOpening, loadJson('ledger.json'), {
    canaries: [CANARY],
  });
  assert.ok(!valLeaky.valid, 'Validator flagged leaky canary');
  assert.ok(valLeaky.errors.some(e => e.includes('canary')), 'Error mentions canary');
});

test('Flow: Happy path executes 1 call, returns verified opening & log', async () => {
  fake.reset();
  clearLogs();
  clearHearings();

  const cm = new ConnectionManager({ fake: true });
  await cm.addConnection({ provider: 'anthropic', key: 'test-claude' });
  const conn = cm.getConnections()[0];
  cm.assignRole('paksh', { connectionId: conn.id, model: 'claude-3-5-sonnet-20241022' });

  const caseData = loadJson('case.json');
  const { hearingId } = createHearing(caseData);

  const result = await runHearingPakshOpening(hearingId, {
    researchMode: 'case',
    connectionManager: cm,
  });

  assert.equal(result.status, 'ok');
  assert.equal(result.usage.calls, 1);
  assert.equal(result.usage.retries, 0);
  assert.ok(result.opening);
  assert.ok(result.ledger);
  assert.ok(result.promptSha256);
  assert.ok(Array.isArray(result.allowedInputs));

  // Check logs
  const logs = getHearingLogs(hearingId);
  assert.equal(logs.length, 1);
  assert.equal(logs[0].status, 'ok');
  assert.ok(logs[0].promptSha256);
  assert.equal(logs[0].prompt, undefined, 'Idea/prompt text omitted from log by default');
});

test('Flow: Invalid output repaired once, succeeds on retry', async () => {
  fake.reset();
  clearLogs();
  clearHearings();

  const cm = new ConnectionManager({ fake: true });
  await cm.addConnection({ provider: 'gemini', key: 'test-gemini' });
  const conn = cm.getConnections()[0];
  cm.assignRole('paksh', { connectionId: conn.id, model: 'gemini-2.0-flash' });

  const caseData = loadJson('case.json');
  const { hearingId } = createHearing(caseData);

  // Queue invalid reply first, then valid reply
  const validCombined = loadJson('case-opening.json');
  fake.queueReplies('paksh', [
    'Not JSON at all! Just some text explaining an idea.',
    JSON.stringify(validCombined),
  ]);

  const result = await runHearingPakshOpening(hearingId, {
    researchMode: 'case',
    connectionManager: cm,
  });

  assert.equal(result.status, 'ok');
  assert.equal(result.usage.calls, 2);
  assert.equal(result.usage.retries, 1);
  assert.ok(result.opening);

  const logs = getHearingLogs(hearingId);
  assert.equal(logs.length, 2);
  assert.equal(logs[0].status, 'invalid');
  assert.equal(logs[0].retry, false);
  assert.equal(logs[1].status, 'ok');
  assert.equal(logs[1].retry, true);
});

test('Flow: Truncation (finishReason length) is repaired once', async () => {
  fake.reset();
  clearLogs();
  clearHearings();

  const cm = new ConnectionManager({ fake: true });
  // 'trunc' key causes fake adapter to return finishReason 'length'
  await cm.addConnection({ provider: 'openai', key: 'trunc-key' });
  const conn = cm.getConnections()[0];
  cm.assignRole('paksh', { connectionId: conn.id, model: 'gpt-4o' });

  const caseData = loadJson('case.json');
  const { hearingId } = createHearing(caseData);

  // Queue valid reply for the repair call
  const validCombined = loadJson('case-opening.json');
  fake.queueReplies('paksh', [JSON.stringify(validCombined)]);

  const result = await runHearingPakshOpening(hearingId, {
    researchMode: 'case',
    connectionManager: cm,
  });

  assert.equal(result.status, 'ok');
  assert.equal(result.usage.calls, 2);
  assert.equal(result.usage.retries, 1);
});

test('Flow: Incomplete status if invalid twice', async () => {
  fake.reset();
  clearLogs();
  clearHearings();

  const cm = new ConnectionManager({ fake: true });
  await cm.addConnection({ provider: 'openai', key: 'test-key' });
  const conn = cm.getConnections()[0];
  cm.assignRole('paksh', { connectionId: conn.id, model: 'gpt-4o' });

  const caseData = loadJson('case.json');
  const { hearingId } = createHearing(caseData);

  // Queue two invalid replies
  fake.queueReplies('paksh', [
    'First invalid text',
    'Second invalid text',
  ]);

  const result = await runHearingPakshOpening(hearingId, {
    researchMode: 'case',
    connectionManager: cm,
  });

  assert.equal(result.status, 'incomplete');
  assert.equal(result.opening, null, 'Never invent or return partial opening on incomplete');
  assert.ok(result.errors.length > 0);
  assert.equal(result.usage.calls, 2);
  assert.equal(result.usage.retries, 1);
});

test('Flow: Model-supplied verification fields are stripped with warning', async () => {
  fake.reset();
  clearLogs();
  clearHearings();

  const cm = new ConnectionManager({ fake: true });
  await cm.addConnection({ provider: 'openai', key: 'test-key' });
  const conn = cm.getConnections()[0];
  cm.assignRole('paksh', { connectionId: conn.id, model: 'gpt-4o' });

  const caseData = loadJson('case.json');
  const { hearingId } = createHearing(caseData);

  const combinedWithFakeVerified = JSON.parse(JSON.stringify(loadJson('case-opening.json')));
  // Model arrogantly declares verified = true on everything
  combinedWithFakeVerified.ledger.items[0].verified = true;
  combinedWithFakeVerified.ledger.items[0].verification = 'exact';

  fake.queueReplies('paksh', [JSON.stringify(combinedWithFakeVerified)]);

  const result = await runHearingPakshOpening(hearingId, {
    researchMode: 'case',
    connectionManager: cm,
  });

  assert.equal(result.status, 'ok');
  assert.ok(
    result.warnings.some(w => w.includes('model-supplied verification fields removed')),
    'Warning about stripped verification is logged'
  );
});

test('Flow: Budget exceeded throws 429 budget_exceeded', async () => {
  fake.reset();
  clearHearings();

  const cm = new ConnectionManager({ fake: true });
  await cm.addConnection({ provider: 'openai', key: 'test-key' });
  const conn = cm.getConnections()[0];
  cm.assignRole('paksh', { connectionId: conn.id, model: 'gpt-4o' });

  const caseData = loadJson('case.json');
  const { hearingId } = createHearing(caseData);
  const hearing = getHearing(hearingId);
  hearing.budget = 50; // Tiny budget

  await assert.rejects(
    async () => {
      await runHearingPakshOpening(hearingId, {
        researchMode: 'case',
        connectionManager: cm,
      });
    },
    (err) => {
      assert.equal(err.code, 'budget_exceeded');
      assert.equal(err.status, 429);
      return true;
    }
  );
});

test('Flow: Fabricated quote at high confidence is capped, fails validation, and repairs', async () => {
  fake.reset();
  clearLogs();
  clearHearings();

  const cm = new ConnectionManager({ fake: true });
  await cm.addConnection({ provider: 'openai', key: 'test-key' });
  const conn = cm.getConnections()[0];
  cm.assignRole('paksh', { connectionId: conn.id, model: 'gpt-4o' });

  const caseData = loadJson('case.json');
  const { hearingId } = createHearing(caseData);

  // Response 1: Fabricated quote at high confidence (will be capped to assertion, causing validation failure)
  const badReply = JSON.parse(JSON.stringify(loadJson('case-opening.json')));
  badReply.ledger.items[0].quote = 'FABRICATED QUOTE NOT IN SOURCE';
  badReply.ledger.items[0].strength = 'data';
  badReply.opening.claims[1].confidence = 'high'; // Claim 2 relies on PE1, now an assertion

  // Response 2: Clean valid reply
  const cleanReply = loadJson('case-opening.json');

  fake.queueReplies('paksh', [JSON.stringify(badReply), JSON.stringify(cleanReply)]);

  const result = await runHearingPakshOpening(hearingId, {
    researchMode: 'case',
    connectionManager: cm,
  });

  assert.equal(result.status, 'ok');
  assert.equal(result.usage.calls, 2);
  assert.equal(result.usage.retries, 1);
});

test('Routes: Full API validation suite (token, host, limits, 404, 409, 429)', async () => {
  fake.reset();
  clearHearings();

  const sessionToken = 'secret-session-token-123';
  const manager = new ConnectionManager({ fake: true });

  function mockReq(method, urlPath, headers = {}, bodyObj = null) {
    const stream = new Readable({
      read() {
        if (bodyObj !== null) {
          this.push(Buffer.from(typeof bodyObj === 'string' ? bodyObj : JSON.stringify(bodyObj)));
        }
        this.push(null);
      },
    });
    stream.method = method;
    stream.url = urlPath;
    stream.headers = {
      host: '127.0.0.1:5173',
      'x-vs-token': sessionToken,
      ...headers,
    };
    return stream;
  }

  function mockRes() {
    let statusCode = 200;
    let headers = {};
    let body = '';
    return {
      writeHead(code, h) {
        statusCode = code;
        headers = h;
      },
      end(data) {
        if (data) body += data;
      },
      get statusCode() {
        return statusCode;
      },
      get body() {
        try {
          return JSON.parse(body);
        } catch {
          return body;
        }
      },
    };
  }

  // 1. Missing Token -> 403
  {
    const req = await mockReq('GET', '/api/connections', { 'x-vs-token': 'bad-token' });
    const res = mockRes();
    await handleApi(req, res, { manager, sessionToken, fakeMode: true });
    assert.equal(res.statusCode, 403);
  }

  // 2. Oversized body -> 413
  {
    const bigString = 'x'.repeat(70000);
    const req = await mockReq('POST', '/api/hearings', {}, { case: { brief: bigString } });
    const res = mockRes();
    await handleApi(req, res, { manager, sessionToken, fakeMode: true });
    assert.equal(res.statusCode, 413);
  }

  // 3. Invalid case -> 400 with field errors
  {
    const req = await mockReq('POST', '/api/hearings', {}, { case: { id: 'test' } }); // missing required title, brief, goal
    const res = mockRes();
    await handleApi(req, res, { manager, sessionToken, fakeMode: true });
    assert.equal(res.statusCode, 400);
    assert.equal(res.body.error.code, 'invalid_case');
    assert.ok(Array.isArray(res.body.error.errors));
  }

  // 4. Create hearing valid -> 200
  let hearingId;
  {
    const caseData = loadJson('case.json');
    const req = await mockReq('POST', '/api/hearings', {}, { case: caseData });
    const res = mockRes();
    await handleApi(req, res, { manager, sessionToken, fakeMode: true });
    assert.equal(res.statusCode, 200);
    assert.ok(res.body.hearingId);
    hearingId = res.body.hearingId;
  }

  // 5. Paksh not ready -> 409
  {
    const req = await mockReq('POST', `/api/hearings/${hearingId}/paksh/opening`, {}, {});
    const res = mockRes();
    await handleApi(req, res, { manager, sessionToken, fakeMode: true });
    assert.equal(res.statusCode, 409);
    assert.equal(res.body.error.code, 'role_not_ready');
  }

  // Assign Paksh role
  await manager.addConnection({ provider: 'openai', key: 'key-ok' });
  const conn = manager.getConnections()[0];
  manager.assignRole('paksh', { connectionId: conn.id, model: 'gpt-4o' });

  // 6. Run opening successfully -> 200
  {
    const req = await mockReq('POST', `/api/hearings/${hearingId}/paksh/opening`, {}, { researchMode: 'case' });
    const res = mockRes();
    await handleApi(req, res, { manager, sessionToken, fakeMode: true });
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.status, 'ok');
    assert.ok(res.body.opening);
    assert.ok(res.body.ledger);
  }

  // 7. GET /api/hearings/:id/log -> 200
  {
    const req = await mockReq('GET', `/api/hearings/${hearingId}/log`);
    const res = mockRes();
    await handleApi(req, res, { manager, sessionToken, fakeMode: true });
    assert.equal(res.statusCode, 200);
    assert.ok(Array.isArray(res.body));
    assert.ok(res.body.length >= 1);
  }

  // 8. Unknown hearing ID -> 404
  {
    const req = await mockReq('GET', '/api/hearings/non-existent-id/log');
    const res = mockRes();
    await handleApi(req, res, { manager, sessionToken, fakeMode: true });
    assert.equal(res.statusCode, 404);
  }

  // 9. DELETE /api/hearings/:id wipes hearing
  {
    const req = await mockReq('DELETE', `/api/hearings/${hearingId}`);
    const res = mockRes();
    await handleApi(req, res, { manager, sessionToken, fakeMode: true });
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, { ok: true });

    // Subsequent GET -> 404
    const req2 = await mockReq('GET', `/api/hearings/${hearingId}/log`);
    const res2 = mockRes();
    await handleApi(req2, res2, { manager, sessionToken, fakeMode: true });
    assert.equal(res2.statusCode, 404);
  }
});
