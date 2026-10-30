MODE: rebuttal

Case:
<case>
{{case_json}}
</case>

Merged ledger (Paksh PE*, Vipaksh VE*):
<ledger>
{{ledger_json}}
</ledger>

Your opening:
<opening>
{{paksh_opening_json}}
</opening>

Vipaksh's opening:
<vipaksh_opening>
{{vipaksh_opening_json}}
</vipaksh_opening>

Respond to at most {{max_responses}} Vipaksh claims, strongest first. For each choose one move: hold (reason), counter (evidence IDs), narrow (evidence ID or named flaw + revised_claim), concede (evidence ID or named flaw). Pressure, repetition or confidence is never a reason to move. You may add at most {{max_new_claims}} new claim, only if backed by a ledger item. "statement" <= {{statement_max_words}} words, spoken, no IDs.

Return JSON matching schemas/paksh-rebuttal.schema.json.
