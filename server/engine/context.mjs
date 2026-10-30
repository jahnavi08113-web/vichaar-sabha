import { isolateCase } from './render.mjs';

export const ALLOW_LIST = {
  'paksh:research': ['case', 'ledger'],
  'paksh:opening': ['case', 'ledger'],
  'paksh:clarify': ['ledger', 'opening', 'question'],
  'paksh:rebuttal': ['case', 'ledger', 'opening', 'vipaksh'],

  'vipaksh:research': ['case', 'ledger'],
  'vipaksh:opening': ['case', 'ledger'],
  'vipaksh:clarify': ['ledger', 'opening', 'question'],
  'vipaksh:rebuttal': ['case', 'ledger', 'opening', 'paksh'],

  'judge:ruling': ['ledger', 'openings'],
  'judge:clarify': ['ruling', 'answers'],
  'judge:rebuttal': ['ledger', 'openings', 'rebuttals'],
};

export function deepFreeze(obj) {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }
  Object.freeze(obj);
  for (const key of Object.getOwnPropertyNames(obj)) {
    const val = obj[key];
    if (val !== null && typeof val === 'object' && !Object.isFrozen(val)) {
      deepFreeze(val);
    }
  }
  return obj;
}

export function buildContext(role, stage, hearing = {}) {
  const key = `${role}:${stage}`;
  const allowed = ALLOW_LIST[key];
  if (!allowed) {
    throw new Error(`Unknown role/stage pair: ${role}/${stage}`);
  }

  const allowedInputs = [];
  const ctx = {
    role,
    stage,
    hearingId: hearing.id || null,
  };

  if (allowed.includes('case')) {
    const rawCase = hearing.case || {};
    const isolated = isolateCase(rawCase);
    ctx.case = isolated;

    const caseKeep = ['id', 'number', 'title', 'brief', 'goal', 'goal_type'];
    for (const k of caseKeep) {
      if (k in rawCase) {
        allowedInputs.push(`case.${k}`);
      }
    }
    if (Array.isArray(rawCase.exhibits)) {
      const exKeep = ['id', 'kind', 'title', 'detail', 'url', 'text'];
      rawCase.exhibits.forEach((ex, idx) => {
        for (const ek of exKeep) {
          if (ek in ex) {
            allowedInputs.push(`case.exhibits[${idx}].${ek}`);
          }
        }
      });
    }
  }

  if (allowed.includes('ledger')) {
    const ledger = role === 'paksh'
      ? hearing.pakshLedger
      : role === 'vipaksh'
        ? hearing.vipakshLedger
        : hearing.mergedLedger;
    if (ledger) {
      ctx.ledger = JSON.parse(JSON.stringify(ledger));
      allowedInputs.push('ledger');
    }
  }

  if (allowed.includes('opening')) {
    const opening = role === 'paksh' ? hearing.pakshOpening : hearing.vipakshOpening;
    if (opening) {
      ctx.opening = JSON.parse(JSON.stringify(opening));
      allowedInputs.push('opening');
    }
  }

  if (allowed.includes('vipaksh') && hearing.vipakshOpening) {
    ctx.vipaksh = JSON.parse(JSON.stringify(hearing.vipakshOpening));
    allowedInputs.push('vipaksh_opening');
  }

  if (allowed.includes('paksh') && hearing.pakshOpening) {
    ctx.paksh = JSON.parse(JSON.stringify(hearing.pakshOpening));
    allowedInputs.push('paksh_opening');
  }

  if (allowed.includes('question') && hearing.question) {
    ctx.question = hearing.question;
    allowedInputs.push('judge_question');
  }

  if (allowed.includes('openings')) {
    if (hearing.blindedOpenings) {
      ctx.openings = JSON.parse(JSON.stringify(hearing.blindedOpenings));
      allowedInputs.push('blinded_openings');
    }
  }

  if (allowed.includes('ruling') && hearing.ruling) {
    ctx.ruling = JSON.parse(JSON.stringify(hearing.ruling));
    allowedInputs.push('prior_ruling');
  }

  if (allowed.includes('answers') && hearing.answers) {
    ctx.answers = JSON.parse(JSON.stringify(hearing.answers));
    allowedInputs.push('answers');
  }

  if (allowed.includes('rebuttals') && hearing.rebuttals) {
    ctx.rebuttals = JSON.parse(JSON.stringify(hearing.rebuttals));
    allowedInputs.push('rebuttals');
  }

  ctx.allowedInputs = allowedInputs;
  return deepFreeze(ctx);
}
