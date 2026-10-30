import { getSkill } from './skill.mjs';

const FILES = {
  research_plan: 'research_plan',
  ledger: 'research_plan',
  opening: 'opening',
  clarify: 'clarify',
  rebuttal: 'rebuttal',
  case_opening: 'case_opening',
};

const SCHEMAS = {
  research_plan: 'paksh-research-plan',
  ledger: 'evidence-ledger',
  opening: 'paksh-opening',
  clarify: 'paksh-clarify',
  rebuttal: 'paksh-rebuttal',
  case_opening: 'case-opening',
};

export function isolateCase(caseData) {
  if (!caseData) return {};
  const keep = ['id', 'number', 'title', 'brief', 'goal', 'goal_type'];
  const out = {};
  for (const k of keep) {
    if (k in caseData) {
      out[k] = caseData[k];
    }
  }
  const exKeep = ['id', 'kind', 'title', 'detail', 'url', 'text'];
  if (Array.isArray(caseData.exhibits)) {
    out.exhibits = caseData.exhibits.map(e => {
      const ex = {};
      for (const k of exKeep) {
        if (k in e) {
          ex[k] = e[k];
        }
      }
      return ex;
    });
  } else {
    out.exhibits = [];
  }
  return out;
}

function section(text, mode) {
  if (mode === 'research_plan' || mode === 'ledger') {
    const parts = text.split('\n---\n');
    return mode === 'research_plan' ? parts[0] : parts[1];
  }
  return text;
}

export function renderPrompt(opts = {}) {
  const {
    mode,
    caseData,
    ledger,
    rawResults,
    opening,
    vipaksh,
    targetClaim,
    question,
    config: customConfig,
  } = opts;

  const skill = getSkill();
  const cfg = customConfig || skill.config;

  if (!mode || !FILES[mode]) {
    throw new Error(`Invalid or missing mode: ${mode}`);
  }

  const isolated = isolateCase(caseData);

  if ((mode === 'opening' || mode === 'case_opening') && ledger && Array.isArray(ledger.items)) {
    if (ledger.items.some(i => i && typeof i.id === 'string' && i.id.startsWith('VE'))) {
      throw new Error("isolation error: opening must use Paksh's own ledger (found VE* items)");
    }
  }

  if (['opening', 'research_plan', 'ledger', 'case_opening'].includes(mode) && vipaksh) {
    throw new Error('isolation error: Vipaksh output is not allowed before rebuttal');
  }

  const maxRawLen =
    (cfg.research?.max_excerpt_chars ?? 600) *
    (cfg.research?.max_queries ?? 3) *
    (cfg.research?.max_results_per_query ?? 3);

  const values = {
    case_json: JSON.stringify(isolated),
    ledger_json: ledger ? JSON.stringify(ledger) : '{"owner":"paksh","items":[]}',
    raw_results: rawResults
      ? String(rawResults).slice(0, maxRawLen)
      : '(none - case mode: use the brief and exhibits)',
    paksh_opening_json: opening ? JSON.stringify(opening) : '{}',
    vipaksh_opening_json: vipaksh ? JSON.stringify(vipaksh) : '{}',
    target_claim: targetClaim || '',
    judge_question: question || '',
    max_claims: cfg.opening?.max_claims ?? 3,
    statement_max_words: cfg.opening?.statement_max_words ?? 120,
    target_tokens: cfg.opening?.target_tokens ?? 250,
    max_queries: cfg.research?.max_queries ?? 3,
    max_ledger_items: cfg.research?.max_ledger_items ?? 5,
    answer_max_words: cfg.clarify?.answer_max_words ?? 80,
    max_responses: cfg.rebuttal?.max_responses ?? 3,
    max_new_claims: cfg.rebuttal?.max_new_claims ?? 1,
  };

  if (mode === 'rebuttal') {
    values.statement_max_words = cfg.rebuttal?.statement_max_words ?? 120;
  }

  function fill(template) {
    const filled = template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
      if (key in values) {
        return String(values[key]);
      }
      return match;
    });

    const left = filled.match(/\{\{\w+\}\}/g);
    if (left && left.length > 0) {
      throw new Error(`unfilled placeholders: ${JSON.stringify(left)}`);
    }
    return filled.trim();
  }

  const promptKey = FILES[mode];
  const systemText = skill.prompts.system;
  const userTemplate = skill.prompts[promptKey];
  if (!userTemplate) {
    throw new Error(`Prompt template not found for mode: ${mode}`);
  }

  const system = fill(systemText);
  const user = fill(section(userTemplate, mode));

  const maxTokMap = {
    opening: cfg.opening?.max_output_tokens ?? 400,
    case_opening: cfg.case_combined?.max_output_tokens ?? 1000,
    clarify: cfg.clarify?.max_output_tokens ?? 250,
    rebuttal: cfg.rebuttal?.max_output_tokens ?? 350,
  };
  const maxOutputTokens = maxTokMap[mode] ?? 400;

  const tempMap = cfg.temperature || {};
  const temperature = tempMap[mode] ?? tempMap.opening ?? 0.3;

  const schemaName = SCHEMAS[mode];
  const responseSchema = skill.schemas[schemaName];

  return {
    mode,
    temperature,
    max_output_tokens: maxOutputTokens,
    response_schema: responseSchema,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
  };
}
