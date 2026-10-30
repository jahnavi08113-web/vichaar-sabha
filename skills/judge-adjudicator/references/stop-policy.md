# Verdict or continue

## Decision tree

```text
Input/schema/source/infra failure? → incomplete/input error, NO fabricated verdict
Both openings complete and packet trusted? → continue checking
Final phase OR round already used? → STOP and rule on known facts
New observations/research required? → STOP; experiment or insufficient evidence
Decision already clear / question cannot change action? → STOP
Exactly one material unresolved/partial claim + existing quote-verified evidence?
  no → STOP
  yes → two plausible answers imply different action labels?
    no → STOP
    yes → server permits + can reserve BOTH answers and final Judge?
      no → STOP with limitations if a final call is affordable; else incomplete
      yes → continue:true for THAT claim only, verdict:null
```

All semantic gates are proposed model assessments and must be evaluated, not mistaken for code-proven facts. Code enforces the structural/cap/budget gates. It cannot prove that a question is genuinely important or answerable.

## State machine

`openings_ready → judge_initial → (complete | clarification_requested)`

`clarification_requested → reserve+consume_round → two_independent_answers → judge_final → complete`

Failure/cancel paths end in `incomplete`/`aborted`. No automatic return edge to openings or judge_initial. Consume the round atomically before dispatch and retain it after a failed/cancelled request; an explicit retry may resume the same pending slots, never grant a second round. Duplicate requests return the same in-flight/completed result. A manual retry resumes the same stage with the remaining global repair allowance, not a reset.

- Core live hearing: two opening calls + Judge = 3 successful calls.
- One clarification adds two answers + final Judge = 3 successful calls (6 total).
- One model repair/retry per initiating user action across all stages, not one per role; count it in usage. Do not nest SDK retries on top.
- Reserve estimate for the three remaining calls *together*, including an unused repair allowance, before dispatching a continuation. Budget/input token estimates are not exact usage guarantees.
- If there is not enough budget for any final Judge call, stop execution as incomplete. Do not manufacture an insufficient_evidence judgment from an API/budget error.
- A code-denied continue result is not silently rewritten into a verdict. If no side work has run, one force-final Judge call may run under the existing reservation; it replaces the denied branch and does not grant extra rounds or repairs. Otherwise show incomplete.
- Real-world evidence needed = stop now; user-triggered evidence update later. Targeted updates remain two calls (fresh affected-claim reviewer + Judge), no auto-clarification in this version; broad changes need a full new hearing.

## Five outcomes

| Label | When to use | Do not confuse with |
| --- | --- | --- |
| approved_pilot | Evidence warrants a safe, bounded, reversible next step | Full product approval / market validation |
| test_first | An identified load-bearing uncertainty has a concrete discriminating test | Generic indecision |
| revise | A supported, repairable scope/constraint/goal mismatch needs change | Every unknown |
| insufficient_evidence | Too little/coherent evidence for a more specific recommendation | Parser error / budget error / automatic middle verdict |
| not_recommended | An evidenced decisive blocker defeats the current scoped plan | Missing proof of demand |

Courtroom vocabulary is only presentation: Supported→'Sustained'; Partial→'Sustained in part'; Contradicted→'Overruled'; Unsupported/unresolved→'Noted — unproven/unresolved'. An unsupported claim is not proven false. These labels apply to claims, not business outcomes.
