# Sources and inspected versions

## Original research

1. Zheng et al., **Judging LLM-as-a-Judge with MT-Bench and Chatbot Arena**. Read the bias/mitigation passages and their limitations. https://arxiv.org/html/2306.05685v4
2. Liu et al., **G-Eval: NLG Evaluation using GPT-4 with Better Human Alignment**. Read criteria/form-filling and potential evaluator bias. https://arxiv.org/abs/2303.16634
3. **Stop Overvaluing Multi-Agent Debate—We Must Rethink Evaluation and Embrace Model Heterogeneity**. Baseline/evaluation caution, not startup adjudication. https://arxiv.org/abs/2502.08788
4. Zeng et al., **S²-MAD: Breaking the Token Barrier to Enhance Multi-Agent Debate Efficiency**. Sparse communication, task-specific efficiency and redundancy-filter limitations. https://arxiv.org/html/2502.04790v2
5. He et al., **Debating Truth: Debate-driven Claim Verification with Multiple Large Language Model Agents**. Moderator neutrality bias and learned adjudication; not evidence that our prompts match those results. https://arxiv.org/html/2507.19090v4

## Pinned GitHub files inspected (2026-10-30)

- FastChat: `common.py` (especially `play_a_match_pair`, source lines ~313–350), judge prompt definitions and LICENSE.
  - https://github.com/lm-sys/FastChat/blob/587d5cfa1609a43d192cedb8441cac3c17db105d/fastchat/llm_judge/common.py
  - https://github.com/lm-sys/FastChat/blob/587d5cfa1609a43d192cedb8441cac3c17db105d/fastchat/llm_judge/data/judge_prompts.jsonl
  - https://github.com/lm-sys/FastChat/blob/587d5cfa1609a43d192cedb8441cac3c17db105d/LICENSE
- llm-council: README and `backend/council.py` (stage 1, 2 and 3).
  - https://github.com/karpathy/llm-council/blob/92e1fccb1bdcf1bab7221aa9ed90f9dc72529131/backend/council.py
  - No licence file found in inspected repository tree; no code reused.
- council-review: README, SKILL.md (Step 3.5 adaptive stopping and Step 4 synthesis) and LICENSE.
  - https://github.com/ngmeyer/council-review/blob/e9a9ee372bc4e96eaa37ed1802dea2dafc245551/SKILL.md
  - https://github.com/ngmeyer/council-review/blob/e9a9ee372bc4e96eaa37ed1802dea2dafc245551/LICENSE
- DebatingTruth: README, `src/core/debate.py`, `players.py`, `src/utils/prompt_utils.py`, `config/default.json`.
  - https://github.com/TrustworthyComp/DebatingTruth/blob/a495fd468a6fa66ff90205fbc7d19ece2c6802ff/src/core/debate.py
  - https://github.com/TrustworthyComp/DebatingTruth/blob/a495fd468a6fa66ff90205fbc7d19ece2c6802ff/src/utils/prompt_utils.py
  - https://github.com/TrustworthyComp/DebatingTruth/blob/a495fd468a6fa66ff90205fbc7d19ece2c6802ff/config/default.json
  - No licence file found in inspected tree; no code reused.

Repository heads can change; the hashes above are the source snapshots inspected. Do not substitute another branch and keep making pinned-source claims without rechecking.

## Project baseline

The user's Lean Hearing blueprint specifies three-call default, at most one three-call clarification, explicit continue flag on a named claim, exact-only code merge and case-only MVP evidence. The existing Paksh v1.1.x package defines ledger format and confidence/quote caps. The Judge extends those contracts rather than replacing provider adapters or adding research swarms.
