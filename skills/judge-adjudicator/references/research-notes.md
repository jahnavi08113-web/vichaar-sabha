# Research notes: what changes the Judge design

Research/inspection date: 2026-10-30. Original papers and source files were read; external repositories were **not executed**, benchmarked, installed or treated as verified production systems. The Judge policy is our proposed product design, not an experimentally validated consequence of these papers.

## 1. Judge claim support, not persuasive presentation

MT-Bench investigates position, verbosity and possible self-enhancement effects in LLM evaluation. Its order-swap examples show the same pair receiving different preferences after reversal. Its controlled self-enhancement evidence is limited: the authors explicitly say their study cannot establish that effect conclusively. Adopt identity-metadata blinding, randomized order, concise claim records and evaluation-time order swaps; do not claim these remove bias. Human answer-preference agreement is not business-decision validity. [^https://arxiv.org/html/2306.05685v4]

G-Eval uses task-specific criteria and form-filling for NLG evaluation and discusses evaluator bias toward LLM-generated summaries. Borrow explicit criteria and structured output. Do not import its token-probability normalization, generate long hidden-reasoning transcripts, or pretend its summarization correlation validates our 0/1/2 rubric. [^https://arxiv.org/abs/2303.16634]

## 2. More debate and agreement are not automatic quality

A systematic MAD study tests five methods across nine benchmarks and reports that they often do not beat simple single-agent baselines under its setups; model heterogeneity helps there. Keep a single-assistant baseline and treat a different-family Judge as an experiment, not a requirement for truth. Neither majority agreement nor unanimous agreement supplies new evidence. [^https://arxiv.org/abs/2502.08788]

S²-MAD studies redundant exchanges and conditional participation on reasoning benchmarks. It reports savings on those tasks and explicitly acknowledges variability and missed semantic duplicates. Borrow bounded communication, not keyword-based semantic merging or transferable saving claims. Our code merges only exact records; semantic support remains a Judge assessment. [^https://arxiv.org/html/2502.04790v2]

## 3. Abstention can also be a Judge failure

DebateCV describes opposing evidence-based debaters and a moderator deciding whether another round is useful. It reports zero-shot moderators defaulting too often to neutral outcomes even when decisive evidence exists, then studies supervised fine-tuning. This cautions against equating 'neutral' with 'always insufficient evidence'. It does not prove our untrained prompt solves that problem, nor that claim-verification labels map directly to startup outcomes. Preserve both warranted approval and evidenced negative decisions in the human-reviewed test set. [^https://arxiv.org/html/2507.19090v4]

## 4. GitHub: inspect actual implementation, not only README claims

| Repository, pinned commit | Source finding | Adopt / reject |
| --- | --- | --- |
| FastChat `587d5cfa1609a43d192cedb8441cac3c17db105d` | `play_a_match_pair` calls `run_judge_pair` in both orders and maps A/B back to original models | Use order-swap **evaluation**. Do not add a second production Judge automatically, because that changes our call budget. Apache-2.0 found. [^https://github.com/lm-sys/FastChat/blob/587d5cfa1609a43d192cedb8441cac3c17db105d/fastchat/llm_judge/common.py] |
| llm-council `92e1fccb1bdcf1bab7221aa9ed90f9dc72529131` | Stage 2 uses anonymized labels in collection order; Stage 3 reintroduces `Model:` identities before chairman synthesis | Borrow independent collection and explicit stages. Keep our Judge metadata-blinded through final; do not assume this repo randomizes order or hides identity from its chairman. No LICENSE/COPYING/NOTICE file found in the inspected tree; no code copied. [^https://github.com/karpathy/llm-council/blob/92e1fccb1bdcf1bab7221aa9ed90f9dc72529131/backend/council.py] |
| council-review `e9a9ee372bc4e96eaa37ed1802dea2dafc245551` | SKILL proposes randomized peer labels, per-attribute assessment, an adaptive 'KS' stopping description using coarse claim fingerprints, and a max of five rounds; its synthesis de-anonymizes advisors. Quick-call counts conflict with a mandatory added pass | Borrow independent per-attribute assessment and a hard cap; reject treating its fingerprint description as a calibrated statistical stopping test, importing its claimed savings, or copying its call-count marketing. MIT found. [^https://github.com/ngmeyer/council-review/blob/e9a9ee372bc4e96eaa37ed1802dea2dafc245551/SKILL.md] |
| DebatingTruth `a495fd468a6fa66ff90205fbc7d19ece2c6802ff` | `_should_stop_debate` reads moderator 'Proceeding Necessity'; config describes repetition-based stopping. Unknown/malformed verdict normalization can default to 'Not Enough Evidence'; parse failure in final judgment also yields that label | Borrow an explicit stop signal. Do **not** silently turn parse/transport failures into a substantive insufficient-evidence verdict; use incomplete. Do not copy its sequential shared-history flow for independent openings. No licence file found in inspected tree; no code copied. [^https://github.com/TrustworthyComp/DebatingTruth/blob/a495fd468a6fa66ff90205fbc7d19ece2c6802ff/src/core/debate.py] [^https://github.com/TrustworthyComp/DebatingTruth/blob/a495fd468a6fa66ff90205fbc7d19ece2c6802ff/src/utils/prompt_utils.py] |

## 5. Our chosen stop rule (design, not published result)

Continue only for one material ambiguity whose resolution is available in the current evidence and could change the action. Require the model to name the target, sources, question and two different actions; require code to enforce IDs, phase, caps and resource reservation. Real-world uncertainty becomes an experiment, not another rhetorical exchange.

This is deliberately stricter than 'until consensus', a confidence cutoff or a fixed number of rounds. It makes the reason for extra work inspectable. It still needs human validation: the model can misjudge importance or invent an answerability rationale, and code cannot prove those semantic properties.

## 6. What is not established

- No measured accuracy, reduced bias, calibrated scores, live provider compatibility or token savings for this Judge.
- No proof that an extra clarification improves an idea decision.
- No authentication of user-supplied sources merely because quotations match.
- No guarantee that a different model family is more correct.
- No external code was run; syntax/logic inspection is not a security audit.
- The n<20 cap, 0.1 temperature, 2400-token cap, and five action labels are tunable engineering choices, not statistical conclusions from the cited studies.
