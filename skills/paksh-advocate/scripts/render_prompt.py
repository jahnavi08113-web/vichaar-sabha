#!/usr/bin/env python3
"""Render Paksh system + user messages for one mode, ready for any chat API.

Prints JSON: {"mode", "temperature", "max_output_tokens", "response_schema", "messages": [...]}

Examples:
  python3 render_prompt.py --mode opening --case case.json --ledger ledger.json
  python3 render_prompt.py --mode research_plan --case case.json
  python3 render_prompt.py --mode clarify --case case.json --ledger merged.json \
      --opening opening.json --target-claim P1 --question "What shows matches complete?"
  python3 render_prompt.py --mode rebuttal --case case.json --ledger merged.json \
      --opening opening.json --vipaksh vipaksh.json
"""
import argparse, json, re, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
FILES = {"research_plan": "research-plan.md", "ledger": "research-plan.md", "opening": "opening.md",
         "clarify": "clarify.md", "rebuttal": "rebuttal.md", "case_opening": "case-opening.md"}
SCHEMA = {"research_plan": "paksh-research-plan", "ledger": "evidence-ledger", "opening": "paksh-opening",
          "clarify": "paksh-clarify", "rebuttal": "paksh-rebuttal", "case_opening": "case-opening"}


def j(path):
    return json.loads(Path(path).read_text(encoding="utf-8")) if path else None


def compact(obj):
    return json.dumps(obj, ensure_ascii=False, separators=(",", ":"))


def isolate_case(case):
    """Strip anything Paksh must not see (scripts, rulings, verdicts, other agents' notes)."""
    keep = ("id", "number", "title", "brief", "goal", "goal_type")
    out = {k: case[k] for k in keep if k in case}
    ex_keep = ("id", "kind", "title", "detail", "url", "text")
    out["exhibits"] = [{k: e[k] for k in ex_keep if k in e} for e in case.get("exhibits", [])]
    return out


def section(text, mode):
    if mode in ("research_plan", "ledger"):
        parts = text.split("\n---\n")
        return parts[0] if mode == "research_plan" else parts[1]
    return text


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--mode", required=True, choices=sorted(FILES))
    ap.add_argument("--case", required=True)
    ap.add_argument("--ledger"); ap.add_argument("--raw-results")
    ap.add_argument("--opening"); ap.add_argument("--vipaksh")
    ap.add_argument("--target-claim"); ap.add_argument("--question")
    ap.add_argument("--config")
    a = ap.parse_args()
    cfg = j(a.config) or j(ROOT / "config/paksh.config.json")
    case = isolate_case(j(a.case))
    ledger = j(a.ledger)

    if a.mode in ("opening", "case_opening") and ledger and any(i["id"].startswith("VE") for i in ledger.get("items", [])):
        sys.exit("isolation error: opening must use Paksh's own ledger (found VE* items)")
    if a.mode in ("opening", "research_plan", "ledger", "case_opening") and a.vipaksh:
        sys.exit("isolation error: Vipaksh output is not allowed before rebuttal")
    if a.mode in ("rebuttal", "clarify") and ledger and ledger.get("owner") != "merged":
        print("note: clarify/rebuttal normally use the merged ledger", file=sys.stderr)
    if ledger and cfg.get("evidence", {}).get("require_verification") and any("verified" not in i for i in ledger.get("items", [])):
        print("warning: ledger has not been through verify_quotes.py", file=sys.stderr)
    if a.mode == "rebuttal" and not cfg["rebuttal"]["enabled"]:
        print("note: rebuttal.enabled is false in config (lean hearing skips rebuttal)", file=sys.stderr)

    values = {
        "case_json": compact(case),
        "ledger_json": compact(ledger) if ledger else '{"owner":"paksh","items":[]}',
        "raw_results": Path(a.raw_results).read_text()[: cfg["research"]["max_excerpt_chars"] * cfg["research"]["max_queries"] * cfg["research"]["max_results_per_query"]] if a.raw_results else "(none - case mode: use the brief and exhibits)",
        "paksh_opening_json": compact(j(a.opening)) if a.opening else "{}",
        "vipaksh_opening_json": compact(j(a.vipaksh)) if a.vipaksh else "{}",
        "target_claim": a.target_claim or "", "judge_question": a.question or "",
        "max_claims": cfg["opening"]["max_claims"], "statement_max_words": cfg["opening"]["statement_max_words"],
        "target_tokens": cfg["opening"]["target_tokens"], "max_queries": cfg["research"]["max_queries"],
        "max_ledger_items": cfg["research"]["max_ledger_items"], "answer_max_words": cfg["clarify"]["answer_max_words"],
        "max_responses": cfg["rebuttal"]["max_responses"], "max_new_claims": cfg["rebuttal"]["max_new_claims"],
    }
    if a.mode == "rebuttal":
        values["statement_max_words"] = cfg["rebuttal"]["statement_max_words"]

    def fill(t):
        out = re.sub(r"\{\{(\w+)\}\}", lambda m: str(values.get(m.group(1), m.group(0))), t)
        left = re.findall(r"\{\{\w+\}\}", out)
        if left:
            sys.exit(f"unfilled placeholders: {left}")
        return out.strip()

    system = fill((ROOT / "prompts/system.md").read_text())
    user = fill(section((ROOT / "prompts" / FILES[a.mode]).read_text(), a.mode))
    max_tok = {
        "opening": cfg["opening"]["max_output_tokens"],
        "case_opening": cfg.get("case_combined", {}).get("max_output_tokens", 1000),
        "clarify": cfg["clarify"]["max_output_tokens"],
        "rebuttal": cfg["rebuttal"]["max_output_tokens"],
    }.get(a.mode, 400)
    temp = cfg["temperature"].get(a.mode, cfg["temperature"]["opening"])
    print(json.dumps({
        "mode": a.mode,
        "temperature": temp,
        "max_output_tokens": max_tok,
        "response_schema": json.loads((ROOT / "schemas" / f"{SCHEMA[a.mode]}.schema.json").read_text()),
        "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}],
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
