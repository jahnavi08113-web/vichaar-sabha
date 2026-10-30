# Judge isolation and blinding

| Stage | May see | Must not see |
| --- | --- | --- |
| Initial Judge | Confirmed case + originals, both compact openings/caveats/critical records, merged verified ledger, server round/budget controls | Provider/model identities, UI scripts, scripted verdicts, unrelated chats, keys, another hearing, final answer fixtures |
| Side clarification | Same public case/evidence pool, its OWN opening, the one Judge question and its target claim | Opponent opening, opponent answer, provisional Judge verdict/rubric, history or private caches |
| Final Judge | Same blinded packet/mapping + original question + both independently collected answers | New unrelated evidence, unrelated debate history, identities or scripted outcomes |

Use one fresh API call per stage with system + one user message. Do not carry a provider thread or chat history. Deep-clone/freeze allow-listed contexts; never pass the full hearing object to a role.

Assign randomized A/B sides and opaque C*/E* IDs once per hearing. Hold that mapping stable through final adjudication. Keep the reverse map outside the prompt. Strip structured identity fields; cosmetically replace role names only in advocate prose. Do not rewrite source quotations to hide identities. This is best-effort metadata blinding: stance, style and source content can still reveal a side/model. Randomizing one production call is not an unbiasedness guarantee.

Use an injectable seed for tests; do not expose it or the reverse maps to the model. `build_packet.py` can produce these maps for offline orchestration. Production stores them server-side and uses a secure random seed. Its deterministic mapping sorts roles by SHA-256 of UTF-8 `seed|side|role` and evidence by `seed|evidence|originalId` (lowercase hex, ascending). Port this directly using Node crypto; do not substitute a different random ordering unnoticed.

For final replies the orchestration input uses original P*/V*/PE*/VE* IDs. The builder maps them using the SAME seed and immutable openings/evidence order. If the input ordering changes, refuse or use stored maps; never relabel final answers by guesswork. Production should persist the initial maps rather than recompute from mutable input.

Blinding removes identity metadata; it cannot make an advocate's stance unknowable. Log hashes, allowed input paths and usage without case text. Single-context roleplay is not isolated execution.
