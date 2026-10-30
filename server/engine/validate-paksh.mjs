import { getSkill } from './skill.mjs';
import { checkSchema } from './schema.mjs';

const RANK = { low: 0, medium: 1, high: 2 };
const EVIDENCE_RANK = { assertion: 0, opinion: 1, data: 2, behavior: 3 };

export function words(text) {
  return (text || '').trim().split(/\s+/).filter(Boolean).length;
}

export function estTokens(obj) {
  return Math.round(JSON.stringify(obj).length / 4);
}

function* textBlobs(obj) {
  if (typeof obj === 'string') {
    yield obj;
  } else if (Array.isArray(obj)) {
    for (const x of obj) {
      yield* textBlobs(x);
    }
  } else if (typeof obj === 'object' && obj !== null) {
    for (const x of Object.values(obj)) {
      yield* textBlobs(x);
    }
  }
}

export function checkBanned(obj, cfg, errors) {
  const blob = [...textBlobs(obj)].join(' ').toLowerCase();
  for (const phrase of cfg.rules?.banned_phrases || []) {
    if (blob.includes(phrase.toLowerCase())) {
      errors.push(`banned phrase: '${phrase}'`);
    }
  }
  if (/\b\d{1,3}\s?%\s+(chance|likely|probability)/i.test(blob)) {
    errors.push('states a probability of success');
  }
}

export function ledgerIndex(ledger) {
  const idx = {};
  if (!ledger) return idx;
  for (const item of ledger.items || []) {
    idx[item.id] = item;
    for (const alias of item.aliases || []) {
      idx[alias] = item;
    }
  }
  return idx;
}

export function maxConfFor(evidenceIds, idx, basis, cfg) {
  if (basis === 'assumption' || !evidenceIds || evidenceIds.length === 0) {
    return cfg.rules?.allow_medium_assumptions ? 'medium' : 'low';
  }
  const supportive = evidenceIds
    .filter((e) => idx[e] && ['for', 'mixed', 'context'].includes(idx[e].stance))
    .map((e) => idx[e]);

  const strengths = new Set(
    supportive.map((i) => (i.verified === false ? 'assertion' : i.strength))
  );

  if (strengths.has('behavior') || strengths.has('data')) {
    return 'high';
  }
  if (strengths.has('opinion')) {
    return 'medium';
  }
  return 'low';
}

export function checkClaim(c, where, idx, cfg, errors, warnings, allowedPrefixes) {
  const ev = c.evidence || [];
  if (c.basis === 'evidence' && ev.length === 0) {
    errors.push(`${where}: basis 'evidence' but no evidence IDs`);
  }
  if (c.basis === 'assumption' && ev.length > 0) {
    warnings.push(`${where}: basis 'assumption' lists evidence; use basis 'evidence'`);
  }
  for (const e of ev) {
    const hasPrefix = allowedPrefixes.some((p) => e.startsWith(p));
    if (!hasPrefix) {
      errors.push(`${where}: may not cite ${e} in this mode`);
    } else if (!idx[e]) {
      errors.push(`${where}: cites ${e}, which is not in the ledger`);
    }
  }
  const cap = maxConfFor(ev, idx, c.basis, cfg);
  if (RANK[c.confidence] > RANK[cap]) {
    errors.push(`${where}: confidence '${c.confidence}' exceeds evidence cap '${cap}'`);
  }
  if (c.basis === 'assumption' && /\d/.test(c.text)) {
    errors.push(`${where}: assumption claim contains a number (invented figure?)`);
  }
  if (words(c.text) > 30) {
    warnings.push(`${where}: claim longer than 30 words`);
  }
}

function rulesOpening(out, idx, cfg, errors, warnings) {
  const claims = out.claims || [];
  if (claims.length > cfg.opening.max_claims) {
    errors.push(`more than ${cfg.opening.max_claims} claims`);
  }
  const ids = claims.map((c) => c.id);
  if (new Set(ids).size !== ids.length) {
    errors.push('duplicate claim IDs');
  }
  const areas = claims.map((c) => c.area);
  if (new Set(areas).size !== areas.length) {
    warnings.push('two claims share an area; prefer distinct areas');
  }
  if (!areas.includes('demand')) {
    warnings.push('no demand claim; include one if at all defensible');
  }
  claims.forEach((c, i) => {
    checkClaim(c, `claims[${i}] ${c.id}`, idx, cfg, errors, warnings, ['PE']);
  });

  const must = new Set(
    Object.keys(idx).filter((k) => {
      const v = idx[k];
      return ['against', 'mixed'].includes(v.stance) && k.startsWith('PE') && k === v.id;
    })
  );
  const contrary = new Set(out.contrary_evidence || []);
  const missing = [...must].filter((k) => !contrary.has(k)).sort();
  if (missing.length > 0) {
    errors.push(`contrary evidence not disclosed: [${missing.map((m) => `'${m}'`).join(', ')}]`);
  }
  for (const e of out.contrary_evidence || []) {
    if (!idx[e]) {
      errors.push(`contrary_evidence cites ${e}, not in ledger`);
    }
  }

  if (out.proving_test && !ids.includes(out.proving_test.tests_claim)) {
    errors.push('proving_test.tests_claim is not one of the claims');
  }
  if (words(out.statement) > cfg.opening.statement_max_words) {
    errors.push(`statement over ${cfg.opening.statement_max_words} words`);
  }
  if (/\b(P|PE|V|VE)\d\b/.test(out.statement)) {
    errors.push('statement contains claim/evidence IDs');
  }
  if (/\bvipaksh\b|\bopponent\b/i.test(out.statement)) {
    errors.push('statement references Vipaksh (isolation)');
  }

  const tok = estTokens(out);
  if (tok > cfg.opening.max_output_tokens) {
    errors.push(`~${tok} tokens exceeds max_output_tokens ${cfg.opening.max_output_tokens}`);
  } else if (tok > cfg.opening.target_tokens) {
    warnings.push(`~${tok} tokens is above target ${cfg.opening.target_tokens}`);
  }
}

function rulesLedger(out, cfg, errors, warnings) {
  const items = out.items || [];
  if (out.owner === 'paksh' && items.length > cfg.research.max_ledger_items) {
    errors.push(`more than ${cfg.research.max_ledger_items} ledger items`);
  }
  const ids = items.map((i) => i.id);
  if (new Set(ids).size !== ids.length) {
    errors.push('duplicate ledger IDs');
  }
  const ev = cfg.evidence;
  for (const i of items) {
    const prefix = out.owner === 'paksh' ? 'PE' : out.owner === 'vipaksh' ? 'VE' : null;
    if (prefix && !i.id.startsWith(prefix)) {
      errors.push(`${i.id}: ${out.owner} ledger IDs must start with ${prefix}`);
    }
    if (i.verified === false && i.strength !== ev.unverified_strength) {
      errors.push(`${i.id}: unverified quote must be rated '${ev.unverified_strength}' (run verify_quotes.py)`);
    }
    if (
      i.sample_size != null &&
      i.sample_size < ev.small_sample_threshold &&
      EVIDENCE_RANK[i.strength] > EVIDENCE_RANK[ev.small_sample_max_strength]
    ) {
      errors.push(`${i.id}: sample of ${i.sample_size} is at most '${ev.small_sample_max_strength}'`);
    }
    if (i.quote && i.quote.length > ev.max_quote_chars) {
      errors.push(`${i.id}: quote longer than ${ev.max_quote_chars} chars`);
    }
    if (i.source_type === 'web' && !i.url) {
      errors.push(`${i.id}: web evidence needs a url`);
    }
  }
  if (!items.some((i) => ['against', 'mixed'].includes(i.stance))) {
    warnings.push('no against/mixed items; check that contrary evidence was not dropped');
  }
}

function rulesPlan(out, cfg, errors, warnings) {
  const qs = out.queries || [];
  if (qs.length > cfg.research.max_queries) {
    errors.push(`more than ${cfg.research.max_queries} queries`);
  }
  const aIds = new Set((out.assumptions || []).map((a) => a.id));
  for (const q of qs) {
    if (!aIds.has(q.assumption)) {
      errors.push(`${q.id}: unknown assumption ${q.assumption}`);
    }
    const n = words(q.query);
    if (n < 2 || n > 8) {
      warnings.push(`${q.id}: query should be 3-7 words (${n})`);
    }
    for (const pat of cfg.rules?.loaded_query_terms || []) {
      if (new RegExp(pat, 'i').test(q.query)) {
        errors.push(`${q.id}: loaded query term /${pat}/ - phrase it neutrally`);
      }
    }
  }
  if (!qs.some((q) => q.could_find_against)) {
    errors.push('no query can find evidence against the idea');
  }
}

function rulesClarify(out, idx, opening, cfg, errors, warnings) {
  if (words(out.answer) > cfg.clarify.answer_max_words) {
    errors.push(`answer over ${cfg.clarify.answer_max_words} words`);
  }
  for (const e of out.evidence || []) {
    if (!idx[e]) {
      errors.push(`cites ${e}, not in merged ledger`);
    }
  }
  if ((!out.evidence || out.evidence.length === 0) && !out.unknown) {
    errors.push('no evidence cited and unknown is false');
  }
  let prev = out.previous_confidence;
  if (opening) {
    const matchClaim = (opening.claims || []).find((c) => c.id === out.target_claim);
    if (!matchClaim) {
      errors.push(`target_claim ${out.target_claim} not in opening`);
    } else {
      prev = matchClaim.confidence;
    }
  }
  if (prev && RANK[out.confidence] > RANK[prev]) {
    const strong = (out.evidence || []).filter(
      (e) => idx[e] && ['behavior', 'data'].includes(idx[e].strength) && idx[e].stance === 'for'
    );
    if (strong.length === 0) {
      errors.push('raised confidence without behavior/data evidence');
    }
  }
}

function rulesRebuttal(out, idx, opening, vipaksh, cfg, errors, warnings) {
  if ((out.responses || []).length > cfg.rebuttal.max_responses) {
    errors.push(`more than ${cfg.rebuttal.max_responses} responses`);
  }
  const vIds = new Set((vipaksh?.claims || []).map((c) => c.id));
  const pIds = new Set((opening?.claims || []).map((c) => c.id));

  (out.responses || []).forEach((r, i) => {
    const where = `responses[${i}] ${r.target}/${r.move}`;
    if (vipaksh && !vIds.has(r.target)) {
      errors.push(`${where}: target not in Vipaksh opening`);
    }
    for (const e of r.evidence || []) {
      if (!idx[e]) {
        errors.push(`${where}: cites ${e}, not in merged ledger`);
      }
    }
    if (r.move === 'counter' && (!r.evidence || r.evidence.length === 0)) {
      errors.push(`${where}: counter needs evidence IDs`);
    }
    if (['narrow', 'concede'].includes(r.move) && !((r.evidence && r.evidence.length > 0) || r.named_flaw)) {
      errors.push(`${where}: moving position needs evidence or a named flaw (not pressure)`);
    }
    if (r.move === 'narrow' && !r.revised_claim) {
      errors.push(`${where}: narrow needs revised_claim`);
    }
    if (['narrow', 'concede'].includes(r.move) && !r.affects_claim) {
      warnings.push(`${where}: say which P claim this affects`);
    }
    if (r.affects_claim && opening && !pIds.has(r.affects_claim)) {
      errors.push(`${where}: affects_claim not in opening`);
    }
  });

  const newClaims = out.new_claims || [];
  if (newClaims.length > cfg.rebuttal.max_new_claims) {
    errors.push('too many new claims');
  }
  newClaims.forEach((c, i) => {
    if (pIds.has(c.id)) {
      errors.push(`new_claims[${i}]: reuses existing ID ${c.id}`);
    }
    checkClaim(c, `new_claims[${i}] ${c.id}`, idx, cfg, errors, warnings, ['PE', 'VE']);
  });

  if (words(out.statement) > cfg.rebuttal.statement_max_words) {
    errors.push(`statement over ${cfg.rebuttal.statement_max_words} words`);
  }
  if (/\b(P|PE|V|VE)\d\b/.test(out.statement)) {
    errors.push('statement contains claim/evidence IDs');
  }
  const tok = estTokens(out);
  if (tok > cfg.rebuttal.max_output_tokens) {
    errors.push(`~${tok} tokens exceeds max_output_tokens ${cfg.rebuttal.max_output_tokens}`);
  }
}

function checkVerification(ledger, cfg, require, errors, warnings, label = 'ledger') {
  if (!ledger || !cfg.evidence?.require_verification) return;
  const missing = (ledger.items || []).filter((i) => !('verified' in i)).map((i) => i.id);
  if (missing.length > 0) {
    const msg = `${label} not verified for [${missing.map((m) => `'${m}'`).join(', ')}]; run scripts/verify_quotes.py`;
    (require ? errors : warnings).push(msg);
  }
  const bad = (ledger.items || []).filter((i) => i.verified === false).map((i) => i.id);
  if (bad.length > 0) {
    warnings.push(`${label} has unverified quotes [${bad.map((b) => `'${b}'`).join(', ')}]; they count as assertions`);
  }
}

function checkCanaries(out, canaries, errors) {
  const blob = JSON.stringify(out);
  for (const c of canaries || []) {
    if (c && blob.includes(c)) {
      errors.push(`LEAK: canary '${c}' found in output`);
    }
  }
}

export function validatePaksh(mode, out, ledgerOrOptions = {}, maybeOptions = {}) {
  let ledger = null;
  let options = {};

  if (ledgerOrOptions && typeof ledgerOrOptions === 'object' && ('owner' in ledgerOrOptions || 'items' in ledgerOrOptions)) {
    ledger = ledgerOrOptions;
    options = maybeOptions || {};
  } else if (ledgerOrOptions && typeof ledgerOrOptions === 'object') {
    options = ledgerOrOptions;
    ledger = options.ledger || null;
  } else {
    options = maybeOptions || {};
  }

  const {
    opening = null,
    vipaksh = null,
    cfg = null,
    config: customConfig = null,
    canaries = null,
    requireVerified = false,
  } = options;

  if (options.ledger) {
    ledger = options.ledger;
  }

  const skill = getSkill();
  const config = customConfig || cfg || skill.config;
  const errors = [];
  const warnings = [];

  if (mode === 'case_opening') {
    if (!out || typeof out !== 'object' || !out.ledger || !out.opening) {
      errors.push("case_opening output must be an object with 'ledger' and 'opening'");
      return { valid: false, errors, warnings };
    }
    const lRes = validatePaksh('ledger', out.ledger, {
      cfg: config,
      canaries,
      requireVerified,
    });
    const oRes = validatePaksh('opening', out.opening, {
      ledger: out.ledger,
      cfg: config,
      canaries,
      requireVerified,
    });
    const combinedErrors = [...errors, ...lRes.errors, ...oRes.errors];
    const combinedWarnings = [...warnings, ...lRes.warnings, ...oRes.warnings];
    checkBanned(out, config, combinedErrors);
    return {
      valid: combinedErrors.length === 0,
      errors: combinedErrors,
      warnings: combinedWarnings,
    };
  }

  const schemaKey = {
    research_plan: 'paksh-research-plan',
    ledger: 'evidence-ledger',
    opening: 'paksh-opening',
    clarify: 'paksh-clarify',
    rebuttal: 'paksh-rebuttal',
  }[mode];

  if (!schemaKey) {
    throw new Error(`Unknown mode for validation: ${mode}`);
  }

  const schema = skill.schemas[schemaKey];
  checkSchema(out, schema, '$', errors);

  if (ledger !== null && ledger !== undefined) {
    const lerr = [];
    checkSchema(ledger, skill.schemas['evidence-ledger'], 'ledger', lerr);
    errors.push(...lerr);
  }

  checkCanaries(out, canaries, errors);

  if (errors.length > 0) {
    return { valid: false, errors, warnings };
  }

  const idx = ledgerIndex(ledger);

  if (['opening', 'clarify', 'rebuttal'].includes(mode) && (ledger === null || ledger === undefined)) {
    errors.push(`${mode} needs --ledger to check evidence IDs and disclosure`);
    return { valid: false, errors, warnings };
  }

  if (ledger !== null && ledger !== undefined) {
    rulesLedger(ledger, config, errors, warnings);
    checkVerification(ledger, config, requireVerified, errors, warnings);
  }

  if (mode === 'opening') {
    if (Object.keys(idx).some((k) => k.startsWith('VE'))) {
      errors.push('isolation: opening was checked against a ledger with Vipaksh (VE*) items');
    }
    rulesOpening(out, idx, config, errors, warnings);
  } else if (mode === 'ledger') {
    rulesLedger(out, config, errors, warnings);
    checkVerification(out, config, requireVerified, errors, warnings, 'this ledger');
  } else if (mode === 'research_plan') {
    rulesPlan(out, config, errors, warnings);
  } else if (mode === 'clarify') {
    rulesClarify(out, idx, opening, config, errors, warnings);
  } else if (mode === 'rebuttal') {
    rulesRebuttal(out, idx, opening, vipaksh, config, errors, warnings);
  }

  checkBanned(out, config, errors);

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}
