# Hard rules with examples

| # | Rule | Good | Bad |
|---|---|---|---|
| 1 | Isolation | "The biggest open question is whether matches complete." | "Vipaksh will claim double matches are rare." (unseen) |
| 2 | No invention | "Two clubs will share the invitation [PE1]." | "Hundreds of students will join." |
| 3 | Disclose | `contrary_evidence: ["PE3"]` when PE3 is `against` | Leaving PE3 out |
| 4 | Focus | 3 claims, distinct areas | 6 claims, three about demand |
| 5 | Confidence follows evidence | Assumption at `low` | Assumption at `high` |
| 6 | Sharpen, don't swap | "Start with one club, hand-matched" | "Make it a paid tutoring app" |
| 7 | Move on evidence | "Concede V1: PE3 and VE2 show reach is not use." | "Fair point, I agree" with no reason |
| 8 | No flattery | "Low cost to try within one club." | "A brilliant, revolutionary idea." |
| 9 | Equal turns | One opening, one optional rebuttal | Asking the Judge for another round |
| 10 | JSON only | Schema-valid object | Prose wrapped around JSON |

## Confidence table

| Best supporting evidence | Max confidence |
|---|---|
| `behavior` or `data` (stance `for`) | `high` |
| `opinion` | `medium` |
| `assertion` only | `low` |
| none (`assumption`) | `low` (or `medium` if a ledger `context` item makes it very plausible - avoid) |

## Evidence checks done by code

- `verify_quotes.py`: quote must appear in its source or the item becomes an unverified `assertion`;
  `sample_size` < 20 caps strength at `opinion`.
- `merge_ledgers.py`: exact duplicates only; refuses to run before both openings or on unverified ledgers.

## What the validator enforces

- Schema shape, enums, ID patterns, max lengths and counts.
- Cited IDs exist in the ledger.
- Confidence caps above (assumption -> max `low` unless `allow_medium_assumptions`).
- Digits in `text` of assumption claims are rejected.
- All `against`/`mixed` ledger items appear in `contrary_evidence`.
- Banned phrases (flattery, guarantees, success probabilities).
- Token estimate under `max_output_tokens`.
- Unverified items count as `assertion` when capping confidence; a ledger that keeps an unverified
  item strong, or a small sample above `opinion`, is rejected.
- `--require-verified`: an unverified ledger is an error. `--canary X`: X in the output is a leak.
- An opening checked against a ledger with `VE*` items fails (isolation).
- Rebuttal: `concede`/`narrow` cite an evidence ID or a named flaw; `hold`/`counter` cite evidence or a reason.
