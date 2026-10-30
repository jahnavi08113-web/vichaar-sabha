# Paksh skill — Vichaar Sabha advocate (v1.1.1)

Paksh makes the strongest **honest** case for an idea. It researches and writes its opening in
isolation from Vipaksh, tags every claim with evidence or marks it as an assumption, discloses
contrary evidence, concedes its weakest point and proposes the smallest proving test.

## Install

- **Claude Code / agents that read Agent Skills:** copy `paksh-advocate/` into `.claude/skills/`
  (project) or `~/.claude/skills/` (personal). `SKILL.md` is the entry point.
- **Other IDE agents (Cursor, Codex, etc.):** point the agent at `SKILL.md` or paste it into the
  rules file; the rest of the folder is referenced from there.
- **API orchestration (the Vichaar Sabha server):** use `scripts/render_prompt.py` to build the
  messages, call any provider with the returned `temperature`, `max_output_tokens` and
  `response_schema`, then check the result with `scripts/validate_paksh.py`.

## Hearing flow

```
            case + goal + exhibits
              │                  │
   (isolated) ▼                  ▼ (isolated)
   Paksh research → ledger   Vipaksh research → ledger
   verify_quotes.py          verify_quotes.py         ← code: quote check + caps
   Paksh opening             Vipaksh opening          ← parallel, call 1
              └── merge_ledgers.py (exact dupes) ──┘   ← code, after both openings
                           ▼
                        Judge                          ← call 2
          continue:true on a P claim? → Paksh clarify   (max 1 round)
          full hearing only?          → Paksh rebuttal
```

## Quick start

```bash
cd paksh-advocate
# 0. Check the model-written ledger against its sources (code, not a model)
python3 scripts/verify_quotes.py --ledger examples/skill-swap/ledger.raw.json \
  --case examples/skill-swap/case.json --out ledger.json
# 1. Build the prompt for the opening (case mode: ledger from brief + exhibits)
python3 scripts/render_prompt.py --mode opening \
  --case examples/skill-swap/case.json --ledger ledger.json > request.json
# 2. Send request.json "messages" to your model; save its JSON reply as opening.json
# 3. Validate
python3 scripts/validate_paksh.py --mode opening --output opening.json \
  --ledger ledger.json --require-verified
# 4. After BOTH openings: merge ledgers for the Judge
python3 scripts/merge_ledgers.py --paksh ledger.json --vipaksh vipaksh-ledger.json \
  --paksh-opening opening.json --vipaksh-opening vipaksh-opening.json --out merged-ledger.json
# Run all checks
tests/run_tests.sh
```

On a failed validation, send the error list back to the model once ("Fix these errors, return
JSON only") and re-validate. If it fails twice, fall back to the last valid output or mark the
statement as unavailable — never pass an invalid opening to the Judge.

## Folder

| Path | What it is |
|---|---|
| `SKILL.md` | Role, hard rules, modes, workflow, self-check |
| `config/paksh.config.json` | Default settings |
| `references/` | Thinking method, research protocol, rules, rebuttal/clarify, settings, sources |
| `prompts/` | System prompt and one template per mode |
| `schemas/` | JSON Schemas for case input, ledger and every output |
| `scripts/render_prompt.py` | Builds isolated prompts; refuses Vipaksh material before rebuttal |
| `scripts/validate_paksh.py` | Schema + rule checks, leak (`--canary`) and verification checks |
| `scripts/verify_quotes.py` | Quote-in-source check, strength caps |
| `scripts/merge_ledgers.py` | Exact-duplicate merge, only after both openings |
| `examples/skill-swap/` | Worked example for case 016: raw → verified → merged ledgers, opening, clarify, rebuttal |
| `examples/invalid/` | Rule-breaking outputs and a fabricated-quote ledger, used by the tests |
| `tests/run_tests.sh` | 37 checks, including `tests/canary_test.py` (leak test) |
| `references/isolation.md` | What the orchestrator must do for real isolation |
| `CHANGELOG.md` | Version history |

Requires Python 3.9+. No packages needed.
