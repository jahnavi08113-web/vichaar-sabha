# Settings (config/paksh.config.json)

| Key | Default | Why |
|---|---|---|
| `model.prefer_different_family_from` | `"vipaksh"` | Debates work better with diverse models; also lowers judge self-preference if the Judge differs from both |
| `temperature.research_plan` | 0.3 | Focused, neutral queries |
| `temperature.opening` | 0.6 | Room for creative framing |
| `temperature.rebuttal` | 0.3 | Careful, evidence-bound replies |
| `temperature.clarify` | 0.2 | Direct answer |
| `research.mode` | `"case"` | Zero search cost by default; `web` for deeper hearings; `off` for pure demos |
| `research.max_queries` | 3 | Token budget |
| `research.max_results_per_query` | 3 | Token budget |
| `research.max_excerpt_chars` | 500 | Token budget |
| `research.max_ledger_items` | 8 | Keeps the Judge's input small |
| `opening.max_claims` | 3 | Focus |
| `opening.target_tokens` / `max_output_tokens` | 450 / 550 | Budget with headroom |
| `opening.statement_max_words` | 90 | Spoken line length in the UI |
| `rebuttal.enabled` | false | Lean hearing skips rebuttal |
| `rebuttal.max_responses` | 3 | Equal, short turns |
| `clarify.max_rounds` | 1 | Matches the Judge's stop rule |
| `isolation.sees_vipaksh_before_opening` | false | Independence |
| `isolation.sees_judge_rubric` | true | Paksh should argue in the Judge's areas |
| `isolation.sees_judge_weights` | false | Avoids gaming the score |
| `rules.allow_medium_assumptions` | false | Strict honesty by default |
| `evidence.require_verification` | true | Quotes must pass `verify_quotes.py` before use |
| `evidence.small_sample_threshold` | 20 | Fewer people than this is at most `opinion` |
| `evidence.unverified_strength` | `"assertion"` | What an unfound quote is worth |
| `evidence.max_quote_chars` | 300 | Short, checkable quotes |
| `rules.banned_phrases` | list | Flattery and guarantees |
