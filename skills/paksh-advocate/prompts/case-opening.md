MODE: case_opening

Case:
<case>
{{case_json}}
</case>

Build Paksh's evidence ledger and opening together from the brief and exhibits.

Rules recap:
1. Ledger: <= {{max_ledger_items}} items (PE1..). Copy quotes EXACTLY (<= 300 chars) from the brief, goal, or exhibits. Set strength (behavior > data > opinion > assertion) and stance (for/against/mixed/context). Keep every against/mixed item. Canonical sources: exhibit id, "case.brief", "case.goal", "case.title". Do NOT set verified, verification, original_strength or cap_reason: code checks every quote against its source and downgrades any quote it cannot find.
2. Opening: <= {{max_claims}} claims (P1..), one area each, cite your PE* ledger IDs or basis "assumption", confidence capped by evidence, every against/mixed ledger ID in contrary_evidence, one honest concession, one proving test (action, metric, success_threshold, timebox, tests_claim). "statement" is the spoken line: <= {{statement_max_words}} words, plain language, no IDs, nothing the claims do not support. Target about {{target_tokens}} output tokens for the opening.

Return a single JSON object with two keys matching their respective schemas:
{
  "ledger": <matching schemas/evidence-ledger.schema.json>,
  "opening": <matching schemas/paksh-opening.schema.json>
}
