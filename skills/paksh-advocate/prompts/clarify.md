MODE: clarify

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

The Judge asks about {{target_claim}}: "{{judge_question}}"

Answer only this question in <= {{answer_max_words}} words. Cite ledger IDs, or set unknown to true if the record cannot answer it. Do not add claims. You may lower the claim's confidence; raising it requires a cited behavior or data item.

Return JSON matching schemas/paksh-clarify.schema.json.
