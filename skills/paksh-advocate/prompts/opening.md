MODE: opening

Case:
<case>
{{case_json}}
</case>

Your evidence ledger (yours only; Vipaksh's work is not visible):
<ledger>
{{ledger_json}}
</ledger>

Write Paksh's opening. Rules recap: <= {{max_claims}} claims (P1..), one area each, evidence IDs or basis "assumption", confidence capped by evidence, every against/mixed ledger ID in contrary_evidence, one honest concession, one proving test (action, metric, success_threshold, timebox, tests_claim). "statement" is the spoken line: <= {{statement_max_words}} words, plain language, no IDs, nothing the claims do not support. Target about {{target_tokens}} output tokens.

Return JSON matching schemas/paksh-opening.schema.json.
