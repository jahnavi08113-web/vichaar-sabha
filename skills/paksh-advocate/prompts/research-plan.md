MODE: research_plan

Case:
<case>
{{case_json}}
</case>

Research budget: at most {{max_queries}} queries.

Part 1 - Plan. List the 2-3 assumptions this idea depends on most that have the least evidence (demand first if relevant). For each, write ONE neutral search query of 3-7 words that does not contain the conclusion. At least one query must be able to find evidence AGAINST the idea (drop-off, failure, cost, safety).

Return JSON matching schemas/paksh-research-plan.schema.json.

---

MODE: ledger   (second call, after searches; or same call in case mode)

Case:
<case>
{{case_json}}
</case>

Raw results (already truncated):
<raw_results>
{{raw_results}}
</raw_results>

Build an evidence ledger of at most {{max_ledger_items}} items. IDs PE1, PE2, ... Copy quotes EXACTLY (<= 300 chars). Rate strength: behavior > data > opinion > assertion (samples under 20 people are at most opinion). Set stance for/against/mixed/context. Keep every against item. Use canonical sources: exhibits -> source_type "exhibit", source = exhibit id; case text -> source_type "case", source = "case.brief" | "case.goal" | "case.title"; web -> source_type "web", source = page title, plus url; user answers -> source_type "user", source = answer key. Add sample_size when the fact counts people. Do NOT add verified, verification, original_strength or cap_reason: code checks every quote against its source and downgrades any quote it cannot find.

Return JSON matching schemas/evidence-ledger.schema.json.
