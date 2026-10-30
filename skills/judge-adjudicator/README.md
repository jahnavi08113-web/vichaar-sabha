# Vichaar Sabha — Judge adjudicator v1.0.0

A portable Judge skill and **offline reference toolkit**, not an installed live engine. It explains how to assess an idea, how to issue a conditional verdict, and when one clarification is worth its cost.

**Main rule:** continue only when a named existing-evidence question can change the next action. Stop when new real-world evidence is needed. One automatic clarification maximum; no autonomous appeals.

## What is included

- Role instructions and concise prompts for initial and final judging.
- Five independently anchored dimensions, five conditional verdicts, and explicit unknowns.
- JSON packet/output schemas, ID/reference checking, continuation gates and approval/blocker safeguards.
- A best-effort identity-blinded packet builder with private reverse maps.
- Quote-occurrence verification reused from the existing Paksh toolkit.
- An isolated clarification-context builder, including cross-side target claims.
- Five **synthetic** example sets and deterministic regression tests.
- Research notes with four pinned GitHub repositories, specific code findings, limitations and licence caveats.
- A live-model evaluation plan. It has **not** been run.

All sample market/behaviour/budget observations and example verdicts are fixtures, not findings about real users. The roster example proves the protocol's syntax and cross-side target handling, not that an extra clarification was necessary; a capable Judge may resolve it directly and stop. Do not use that fixture as a human-labeled mandatory-continue gold case.

## Run offline checks

Requires Python 3.10+; no third-party libraries, API key or network access.

```bash
cd skills/judge-adjudicator
bash tests/run_tests.sh

python3 scripts/build_packet.py \
  --input examples/one-clarification/raw.initial.json \
  --seed 41 --out /tmp/judge.packet.json --maps /tmp/judge.maps.private.json

python3 scripts/render_prompt.py \
  --packet /tmp/judge.packet.json --out /tmp/judge.prompt.json

python3 scripts/validate_judge.py \
  --packet /tmp/judge.packet.json \
  --output examples/one-clarification/continue.json --json

python3 scripts/clarification_context.py \
  --input examples/one-clarification/raw.initial.json \
  --decision examples/one-clarification/continue.json \
  --maps /tmp/judge.maps.private.json --role paksh --out /tmp/paksh.clarify.json
```

The prompt file contains private case/evidence text. Keep it out of logs/version control. The maps are private orchestration metadata, not secrets to show the Judge.

## Install into the project

Unzip so that `skills/judge-adjudicator/SKILL.md` exists. Give your IDE the separate `implement-judge-engine.md`. That handoff first checks that the provider/Paksh engine tasks actually exist. The current source checkout inspected during packaging did not contain the merged server engine.

- **Judge preview:** live Judge over clearly labeled structured fixture openings; automatic clarification disabled.
- **Full live hearing:** requires both real independent opening and clarification adapters. Missing Vipaksh is an explicit blocker, not permission to invent live work.
- This ZIP does not modify the scripted courtroom or provide browser automation, web retrieval, deployment, accounts, API keys or a new provider stack.

## Honest limits

The validator checks shape, references, quote metadata consistency and mechanical safety policy. It cannot prove semantic support, source authenticity, decision relevance, fairness, or business prospects. A structurally valid bad judgment is possible.

0/1/2/null are anchored qualitative assessments. Never total them. Unknown is not zero. Quote-found is not true. Side A/B blinding is not anonymity against semantic/style cues. Low temperature or a different-family Judge is not a correctness guarantee.

Defaults: initial/final temperature 0.1 when supported, max output 2400 tokens, one automatic clarification, one shared repair per initiating action, default project hearing budget 8000. These are proposed starting settings. Full schema + originals can make a six-call hearing exceed that budget: measure and configure honestly, never trim evidence or promise a fixed saving. Missing provider usage remains unknown.

## Files to read

Start with `SKILL.md`; then `references/thinking-method.md`, `rubric.md`, `stop-policy.md`, and `integration.md`. Research rationale is in `references/research-notes.md` and exact source links are in `references/sources.md`. See `tests/live-audit-plan.md` for model-quality testing separate from deterministic code checks.

## Reuse and licences

All bundled Judge code and prompts were authored for this project. No external repository code or prompt text is copied. `scripts/verify_quotes.py` and the evidence ledger schema reuse the user's existing Paksh toolkit, with only the verifier's standalone default config path changed. Keep shared implementations aligned in production. Public reference repository licence status is documented at its inspected commit; public visibility is not a reuse licence. No new blanket licence is imposed on the user's project.
