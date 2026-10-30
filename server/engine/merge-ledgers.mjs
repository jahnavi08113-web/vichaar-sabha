import { norm } from './verify-quotes.mjs';

function ledgerKey(item) {
  const where = item.source_type === 'web' ? item.url || '' : item.source || '';
  return `${item.source_type}|${where.trim().toLowerCase()}|${norm(item.quote)}`;
}

export function mergeLedgers(paksh, vipaksh, options = {}) {
  const { pakshOpening, vipakshOpening, allowBeforeOpenings = false, allowUnverified = false } = options;

  if (!allowBeforeOpenings) {
    if (!pakshOpening || pakshOpening.mode !== 'opening') {
      throw new Error('Paksh opening not finished - merge only after both openings');
    }
    if (!vipakshOpening || vipakshOpening.mode !== 'opening') {
      throw new Error('Vipaksh opening not finished - merge only after both openings');
    }
  }

  const P = JSON.parse(JSON.stringify(paksh));
  const V = JSON.parse(JSON.stringify(vipaksh));

  if (P.owner !== 'paksh' || V.owner !== 'vipaksh') {
    throw new Error("expected owner 'paksh' and owner 'vipaksh'");
  }

  for (const [led, prefix] of [[P, 'PE'], [V, 'VE']]) {
    for (const it of led.items || []) {
      if (!it.id.startsWith(prefix)) {
        throw new Error(`${it.id} in the ${led.owner} ledger must start with ${prefix}`);
      }
      if (!allowUnverified && !('verified' in it)) {
        throw new Error(`${it.id} has not been through verify_quotes.py`);
      }
    }
  }

  const merged = [];
  const byKey = new Map();
  let aliases = 0;
  let ratingDiffs = 0;

  for (const it of [...(P.items || []), ...(V.items || [])]) {
    const copy = { ...it };
    const k = ledgerKey(copy);
    const same = byKey.get(k) || [];
    const twin = same.find((m) => m.stance === copy.stance && m.strength === copy.strength);

    if (twin) {
      if (!twin.aliases) twin.aliases = [];
      twin.aliases.push(copy.id);
      aliases++;
      continue;
    }

    if (same.length > 0) {
      ratingDiffs++;
      for (const m of same) {
        if (!m.same_quote_as) m.same_quote_as = [];
        m.same_quote_as.push(copy.id);
        if (!copy.same_quote_as) copy.same_quote_as = [];
        copy.same_quote_as.push(m.id);
      }
    }

    same.push(copy);
    byKey.set(k, same);
    merged.push(copy);
  }

  const pMode = P.research_mode || 'case';
  const vMode = V.research_mode || 'case';
  const researchMode = pMode === vMode ? pMode : 'mixed';

  const result = {
    owner: 'merged',
    research_mode: researchMode,
    merged_from: ['paksh', 'vipaksh'],
    items: merged,
  };

  Object.defineProperty(result, '_stats', {
    value: { aliases, ratingDiffs },
    enumerable: false,
    writable: true,
    configurable: true,
  });

  return result;
}
