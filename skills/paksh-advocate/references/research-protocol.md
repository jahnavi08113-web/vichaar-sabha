# Isolated research protocol

## Why isolated

Agents start copying each other after minimal exposure, and agreeableness collapses debates
into early consensus. Paksh and Vipaksh therefore research and write openings **in parallel,
in separate contexts**. Each side's research is a division of labour: Paksh gathers the best
support; Vipaksh attacks it; the Judge checks both against quotes.

## Isolation contract (enforced by the orchestrator)

| Paksh may see before opening | Paksh must not see before opening |
|---|---|
| Case title, brief, goal, exhibits | Vipaksh research plan, ledger, opening |
| Judge's five scoring areas and the evidence ladder | Judge weights for this case, prior verdicts on this case |
| Its own research plan, raw results and ledger | Any other agent's chain of thought |

## Research modes

- `off` - no ledger; every claim is an assumption except facts quoted from the brief.
- `case` (default) - ledger built only from the brief and exhibits. Zero search calls.
- `web` - research plan, then up to `max_queries` searches, then ledger.

## Step 1 - Plan (web mode)

1. List the assumptions the idea depends on. Rank by importance x lack of evidence. Keep 2-3.
2. For each, write one neutral query (3-7 words). Neutral means the query does not contain
   the conclusion.
   - Neutral: "campus peer tutoring participation rates"
   - Loaded: "proof peer tutoring is popular", "why skill swaps succeed"
3. Include at least one query that could find *against* evidence (drop-off, failure, cost).
4. Stay within budget (default 3 queries, 3 results each, 500 characters per excerpt).

## Step 2 - Ledger

Each item:

```json
{"id":"PE1","source_type":"web","source":"Title - publisher","url":"https://...",
 "quote":"exact words from the source","strength":"data","stance":"for",
 "supports_area":"demand","query_id":"Q1"}
```

- `quote` is copied exactly, <= 300 characters. No paraphrase.
- `strength` ladder: `behavior` (people paid, signed up, used, returned) > `data`
  (measured numbers, comparables, calculations) > `opinion` (interviews, surveys, quotes of intent)
  > `assertion` (claim without support, including the founder's own belief).
- Small samples (< 20 people) are at most `opinion`, even if counted.
- `stance`: `for`, `against`, `mixed`, or `context` (useful background).
- Keep contrary items. They must be disclosed in the opening.
- Max `max_ledger_items` (default 8). Drop weakest duplicates first, never drop `against` items to save space.

- Canonical `source` values: exhibit id; `case.brief` / `case.goal` / `case.title`; web page title + `url`;
  user answer key. Add `sample_size` when the fact counts people.

## Step 3 - Verify (code: `scripts/verify_quotes.py`)

| Check | Result | Effect |
|---|---|---|
| Quote found word-for-word | `verification: "exact"` | `verified: true` |
| Found ignoring spacing, punctuation, curly quotes, dashes, case | `"normalized"` | `verified: true` |
| Source text available, quote absent | `"not_found"` | `verified: false`, strength -> `assertion` |
| No source text (unknown exhibit, URL not supplied) | `"no_source_text"` | `verified: false`, strength -> `assertion` |
| `sample_size` < 20 and rated `behavior`/`data` | - | strength -> `opinion` |

- Capped items keep `original_strength` and `cap_reason` (`unverified` / `small_sample`). Re-running is idempotent.
- Web text must be supplied in `sources.json` (URL -> page text) by whatever fetched the page.
  The MVP does not fetch arbitrary URLs.
- Loose case labels ("Case brief") are canonicalised when the quote is found.
- A verified quote proves the words exist. It does not prove they support the claim.

## Step 4 - Merge (code: `scripts/merge_ledgers.py`)

- Runs only after **both** openings exist (isolation guard) and only on verified ledgers.
- Paksh items keep `PE*` IDs; Vipaksh items keep `VE*` IDs, so no renumbering is needed.
- **Exact duplicate** = same `source_type`, same `source` (URL for web), same normalised quote,
  same stance and strength -> the later item becomes an alias (`"aliases": ["VE1"]` on `PE2`).
  Citations to either ID resolve to the same item.
- **Same quote, different rating** -> both kept, linked with `same_quote_as`, for the Judge.
- Code never merges by similarity or keywords and never marks evidence "disputed".
  Deciding that two different facts conflict is the Judge's task.
- Paksh sees the merged ledger only in `clarify` or `rebuttal` mode.

## Token hygiene

- Send the Judge the ledger and claims, not raw search results.
- Truncate excerpts before the model sees them.
- In `case` mode the ledger step can be done in the same call as the opening.
