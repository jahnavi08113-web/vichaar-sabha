import { getSkill } from './skill.mjs';

export const RANK = { assertion: 0, opinion: 1, data: 2, behavior: 3 };
export const CASE_FIELDS = { 'case.brief': 'brief', 'case.goal': 'goal', 'case.title': 'title' };
export const EXHIBIT_FIELDS = ['title', 'detail', 'text'];

const TRANS_MAP = {
  '\u2018': "'",
  '\u2019': "'",
  '\u201c': '"',
  '\u201d': '"',
  '\u2013': '-',
  '\u2014': '-',
  '\u2011': '-',
  '\u2212': '-',
  '\u00a0': ' ',
  '\u2026': '...',
};

export function ws(s) {
  return (s || '').replace(/\s+/g, ' ').trim();
}

export function norm(s) {
  let text = (s || '').normalize('NFKC');
  text = text.replace(/[\u2018\u2019\u201c\u201d\u2013\u2014\u2011\u2212\u00a0\u2026]/g, (c) => TRANS_MAP[c] || c);
  text = text.toLowerCase();
  text = text.replace(/[^\p{L}\p{M}\p{N}_\s]/gu, ' ');
  return text.replace(/\s+/g, ' ').trim();
}

export function match(quote, text) {
  if (!text) {
    return 'no_source_text';
  }
  const wQuote = ws(quote);
  const wText = ws(text);
  if (wQuote && wText.includes(wQuote)) {
    return 'exact';
  }
  const nQuote = norm(quote);
  const nText = norm(text);
  if (nQuote && nText.includes(nQuote)) {
    return 'normalized';
  }
  return 'not_found';
}

export function sourceText(item, caseObj, sources = {}) {
  const st = item.source_type;
  const src = item.source || '';
  if (st === 'exhibit') {
    const exhibits = caseObj?.exhibits || [];
    let ex = exhibits.find((e) => e?.id === src);
    if (!ex) {
      ex = exhibits.find((e) => e?.id && src.startsWith(e.id));
      if (!ex) {
        return { text: null, canon: null };
      }
      const text = EXHIBIT_FIELDS.map((f) => (ex[f] != null ? String(ex[f]) : '')).join('\n');
      return { text, canon: ex.id };
    }
    const text = EXHIBIT_FIELDS.map((f) => (ex[f] != null ? String(ex[f]) : '')).join('\n');
    return { text, canon: null };
  }
  if (st === 'case') {
    if (src in CASE_FIELDS) {
      return { text: caseObj?.[CASE_FIELDS[src]] || '', canon: null };
    }
    for (const [canon, field] of Object.entries(CASE_FIELDS)) {
      const fieldVal = caseObj?.[field] || '';
      if (['exact', 'normalized'].includes(match(item.quote, fieldVal))) {
        return { text: fieldVal, canon };
      }
    }
    return { text: null, canon: null };
  }
  if (st === 'web') {
    return { text: sources?.[item.url] ?? null, canon: null };
  }
  if (st === 'user') {
    return { text: sources?.[src] ?? null, canon: null };
  }
  return { text: null, canon: null };
}

export function verifyQuotes(ledgerInput, caseObj, sources = {}, cfg = null) {
  const ledger = JSON.parse(JSON.stringify(ledgerInput));
  const config = cfg || getSkill().config;
  const ev = config.evidence;
  const report = [];

  for (const item of ledger.items || []) {
    const base = item.original_strength || item.strength;
    const { text, canon } = sourceText(item, caseObj, sources);
    const result = text !== null ? match(item.quote, text) : 'no_source_text';
    if (canon && (result === 'exact' || result === 'normalized')) {
      item.source = canon;
    }
    item.verified = result === 'exact' || result === 'normalized';
    item.verification = result;

    let strength = base;
    let reason = null;

    if (!item.verified) {
      strength = ev.unverified_strength;
      reason = 'unverified';
    } else if (
      item.sample_size != null &&
      item.sample_size < ev.small_sample_threshold &&
      RANK[base] > RANK[ev.small_sample_max_strength]
    ) {
      strength = ev.small_sample_max_strength;
      reason = 'small_sample';
    }

    item.strength = strength;
    if (reason) {
      item.original_strength = base;
      item.cap_reason = reason;
    } else {
      delete item.original_strength;
      delete item.cap_reason;
    }

    report.push({
      id: item.id,
      result,
      base,
      strength,
      reason,
    });
  }

  Object.defineProperty(ledger, 'report', {
    value: report,
    enumerable: false,
    writable: true,
    configurable: true,
  });

  return ledger;
}
