# Isolation contract (for the orchestrator)

The skill can only control what goes **into** a Paksh prompt and check what comes **out**.
True isolation comes from how the caller runs the roles.

## Required

1. **Fresh call per role and stage.** No shared chat thread, no conversation memory, no
   provider-side "thread" or "assistant" objects reused across roles.
2. **Parallel openings.** Start Paksh and Vipaksh together (`Promise.all`); neither waits for the other.
3. **Allow-list prompt building.** Build each prompt only from `scripts/render_prompt.py`
   (or an equivalent allow-list). Never pass the whole hearing object.
4. **Separate research.** Each side has its own search budget, query cache and ledger
   (`PE*` / `VE*`). Do not share a search cache keyed by query across roles.
5. **Verify, then merge after both openings.** `verify_quotes.py` on each ledger, then
   `merge_ledgers.py` (it refuses to run earlier).
6. **Judge blinding.** Relabel Paksh/Vipaksh as Side A/Side B, randomise order per hearing,
   strip role names from statements.
7. **Output checks.** Validate every output; an opening citing `VE*` IDs or naming Vipaksh is a leak.
8. **Request log.** Store a hash and the source list of every prompt so you can prove what each role saw.

## Who sees what

| Stage | Paksh | Vipaksh | Judge |
|---|---|---|---|
| Research + opening | Case, goal, exhibits, rubric areas, own ledger | Same, own ledger | - |
| Ruling | - | - | Merged ledger, both openings as A/B (random order) |
| Clarify | Merged ledger, own opening, Judge question | Same | Prior ruling + answers |
| Rebuttal (full hearing) | + Vipaksh opening | + Paksh opening | Everything, still blinded |

Never visible to Paksh: sample scripts, rulings, verdicts, other roles' private reasoning,
Judge weights, previous verdicts on this case.

## Leak test

`tests/canary_test.py` plants `ZEBRA-4471` in the case script, rulings, verdict, a private
exhibit field, Vipaksh's ledger and Vipaksh's opening. It checks the canary never reaches a
Paksh research/ledger/opening prompt, that leaky inputs are refused, and - as a positive
control - that it does appear in a rebuttal prompt, where Vipaksh's opening is allowed.
Run the same idea end-to-end against real models with `validate_paksh.py --canary ZEBRA-4471`.

## Host-native skills

If one agent (e.g. one Claude Code session) plays all three roles in one conversation,
there is no isolation. Use separate subagents/sessions per role, or offer a single-assistant review.
