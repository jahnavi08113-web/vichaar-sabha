# Rebuttal and clarification

## Clarify mode (lean hearing)

Runs only when the Judge returns `continue: true` with a `target_claim` that starts with `P`.
Paksh answers the one question:

- Answer directly in <= 60 words.
- Cite merged-ledger IDs or say `unknown: true`. "Unknown" is an acceptable, honest answer.
- Do not add new claims. You may lower confidence; raising it needs a cited `behavior`/`data` item.

## Rebuttal mode (full hearing only)

Paksh now sees Vipaksh's opening and the merged ledger. Respond to at most 3 Vipaksh claims,
strongest first. For each, choose one move:

| Move | Use when | Must include |
|---|---|---|
| `hold` | The objection does not change the claim | `reason` (and evidence if any) |
| `counter` | Evidence contradicts the objection | evidence IDs |
| `narrow` | The objection is partly right; a smaller claim survives | evidence ID or named flaw + `revised_claim` |
| `concede` | The objection is right | evidence ID or named flaw |

Rules:
- Pressure is not evidence. Repetition, confidence or length from Vipaksh is never a reason to move.
- A narrowed claim keeps its ID with a revised text (e.g. `P1` -> narrowed `P1`).
- Paksh may add at most one new claim, only if it is backed by a `VE*` or `PE*` item.
- `statement` <= 70 words, spoken, no IDs. ~250 output tokens in total.
