# Evidence audit and trust boundary

- Reuse the Paksh PE*/VE* ledger and exact-only merge. A merged alias remains the same source, not independent corroboration. Different ratings of the same quote stay linked through `same_quote_as`.
- The packet builder rechecks quote occurrence against supplied original case/exhibit text. It strips incoming verification/original-strength/cap fields first. Runtime must invoke this on trusted server state, never accept a client-constructed verified Judge packet.
- `verified:true` means that the quote occurs, exactly or with formatting normalization. It does not authenticate a user-provided source, certify measurements, prove causation, establish representativeness, or settle semantic support.
- In case-only mode, web/user sources without retained original text downgrade to assertion. URLs are references, not permission to fetch. This kit has no downloader. Later controlled retrieval needs separate provenance and SSRF protections.
- Behaviour/data may be irrelevant or biased; an assertion may correctly express a user goal or fixed constraint. Do not mechanically equate source type/strength/stance with truth. Treat the source's 'for/against' label as relative to the original role, not a universal semantic polarity for all claims.
- Distinguish absence of evidence, negative observations, conflicting reliable observations and unsupported rhetoric. Missing support does not prove the opposite.
- Read the original small evidence pack, not only cherry-picked ledger quotes. Preserve every supplied original exhibit and all critical records; reject oversized packets instead of silently truncating them.
- Evidence caps are conservative compatibility defaults; the Judge can explain a limited observation without claiming the cap proves nonexistence.
- `scripts/verify_quotes.py` is reused from our Paksh v1.1.0 reference (default config path changed only). Node should reuse the existing shared verifier, not create another divergent implementation.
