# Input and integration contract

## Offline raw hearing envelope (trusted orchestration/test fixture only)

`{case, ledger, openings:{paksh,vipaksh}, control, prior_request?, clarifications?}`.

- Case: existing Paksh fields; optional explicit arrays `constraints`, `alternatives`, `unknowns`, and `location`. Exhibits keep `id,kind,title,detail,text,url`. All unknown fields are omitted; missing/oversized required data is rejected, not invented.
- Ledger: existing merged evidence format, PE*/VE* IDs and aliases. Both openings must already exist; run exact-only merge after them. The builder re-verifies local quote occurrence; no external sources are fetched.
- Openings: Paksh v1.1.x opening is accepted. Vipaksh's *adapter input*, not an invented installed skill, has mode:opening, claims with V* IDs, area/text/evidence and optional basis/confidence; absent basis derives only from citation presence, absent confidence becomes low. Preserve statement, framing, assumptions, outside_view, concession, contrary_evidence and proving_test if supplied. Optional `coverage` has known area keys and enum values only. Optional `critical_risks` uses the same claim shape with unique IDs and is never silently dropped. A string-only scripted line is not a structured opening.
- Control: phase initial/final, clarification_rounds_used 0/1, can_clarify, budget_allows_clarification. **Server owns these.** Initial must use 0; final uses 1 after a round or 0 for force-final. Client values are ignored in production.
- `prior_request`: the one issued question with original `target_claim` and original `existing_evidence` IDs. The target may belong to either side. Both responders address that SAME original target ID.
- `clarifications`: exactly two trusted envelopes `{role, target_claim, answer, evidence, unknown}` after normal validation; IDs are original IDs. They must have distinct roles and match prior_request. Blank or missing reply is a failure, not unknown:true synthesized by code. A valid unknown:true answer is allowed.

## Important Paksh compatibility gap

The current Paksh clarify schema only allows P* targets. A Judge may target V*. For a full clarification round, add a **shared hearing-clarification schema** allowing `target_claim: ^(P|V)[1-9][0-9]?$`, plus answer/evidence/unknown/confidence. Do not rewrite a V target into a fake P target or overwrite the old standalone schema. Make a hearing-specific Paksh clarification template/adapter, and test cross-side targets. Both sides can see the target card during clarification, but not the opponent's whole opening or its answer.

## Runtime scope

Current checked-out project has the frontend and implementation prompts, not the merged provider/live-role engine. Do not claim this kit installs them. The implementation handoff has a strict prerequisite gate and a fixture-backed Judge preview that is honest about non-live roles. Full live clarification waits for both real side adapters; no canned answer may silently stand in for a failed live side.

A Judge module makes no search calls. Invalid JSON/schema/IDs/continuation cap → at most one shared repair; then incomplete. Include repair/failure/aborted usage when available; unknown is null, never zero. Production uses the provider selected for Judge, with a different family suggested as a diversity experiment, never a correctness guarantee.
