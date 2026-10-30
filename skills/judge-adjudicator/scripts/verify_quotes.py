#!/usr/bin/env python3
"""Check that every ledger quote really appears in its source, then cap strength.

Run by the orchestrator (code, not a model) after a ledger is written and before it is used.

  python3 verify_quotes.py --ledger ledger.raw.json --case case.json [--sources sources.json] --out ledger.json

sources.json maps a web URL or a user-answer key to the full source text, e.g.
  {"https://example.org/report": "full page text...", "answer-1": "user's typed answer"}

For each item the script sets:
  verified       true/false
  verification   exact | normalized | not_found | no_source_text
  strength       capped: unverified -> assertion; sample_size < threshold -> at most opinion
  original_strength, cap_reason   when a cap applied
A non-canonical case source (e.g. "Case brief") is canonicalised if the quote is found.

Exit 0 normally, 1 with --strict if any item is unverified, 2 on usage errors.
A verified quote proves the words exist in the source. It does NOT prove they support the claim;
that remains the Judge's job.
"""
import argparse, json, re, sys, unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RANK = {"assertion": 0, "opinion": 1, "data": 2, "behavior": 3}
CASE_FIELDS = {"case.brief": "brief", "case.goal": "goal", "case.title": "title"}
EXHIBIT_FIELDS = ("title", "detail", "text")

TRANS = str.maketrans({"\u2018": "'", "\u2019": "'", "\u201c": '"', "\u201d": '"', "\u2013": "-", "\u2014": "-",
                       "\u2011": "-", "\u2212": "-", "\u00a0": " ", "\u2026": "..."})


def ws(s):
    return re.sub(r"\s+", " ", s or "").strip()


def norm(s):
    s = unicodedata.normalize("NFKC", s or "").translate(TRANS).lower()
    # keep letters, combining marks (e.g. Devanagari matras), numbers, "_" and whitespace
    s = "".join(c if (c == "_" or c.isspace() or unicodedata.category(c)[0] in "LMN") else " " for c in s)
    return re.sub(r"\s+", " ", s).strip()


def match(quote, text):
    if not text:
        return "no_source_text"
    if ws(quote) and ws(quote) in ws(text):
        return "exact"
    if norm(quote) and norm(quote) in norm(text):
        return "normalized"
    return "not_found"


def source_text(item, case, sources):
    """Return (text, canonical_source_or_None)."""
    st, src = item["source_type"], item.get("source", "")
    if st == "exhibit":
        ex = next((e for e in case.get("exhibits", []) if e.get("id") == src), None)
        if ex is None:  # tolerate "swap-1 (detail)" style labels
            ex = next((e for e in case.get("exhibits", []) if src.startswith(e.get("id", "\0"))), None)
            if ex is None:
                return None, None
            return "\n".join(str(ex.get(f, "")) for f in EXHIBIT_FIELDS), ex["id"]
        return "\n".join(str(ex.get(f, "")) for f in EXHIBIT_FIELDS), None
    if st == "case":
        if src in CASE_FIELDS:
            return case.get(CASE_FIELDS[src], ""), None
        for canon, field in CASE_FIELDS.items():  # canonicalise loose labels
            if match(item["quote"], case.get(field, "")) in ("exact", "normalized"):
                return case.get(field, ""), canon
        return None, None
    if st == "web":
        return sources.get(item.get("url", "")), None
    if st == "user":
        return sources.get(src), None
    return None, None


def verify(ledger, case, sources, cfg):
    ev = cfg["evidence"]
    report = []
    for item in ledger["items"]:
        base = item.get("original_strength", item["strength"])
        text, canon = source_text(item, case, sources)
        result = match(item["quote"], text) if text is not None else "no_source_text"
        if canon and result in ("exact", "normalized"):
            item["source"] = canon
        item["verified"] = result in ("exact", "normalized")
        item["verification"] = result
        strength, reason = base, None
        if not item["verified"]:
            strength, reason = ev["unverified_strength"], "unverified"
        elif item.get("sample_size") is not None and item["sample_size"] < ev["small_sample_threshold"] \
                and RANK[base] > RANK[ev["small_sample_max_strength"]]:
            strength, reason = ev["small_sample_max_strength"], "small_sample"
        item["strength"] = strength
        if reason:
            item["original_strength"], item["cap_reason"] = base, reason
        else:
            item.pop("original_strength", None); item.pop("cap_reason", None)
        report.append((item["id"], result, base, strength, reason))
    return ledger, report


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--ledger", required=True)
    ap.add_argument("--case", required=True)
    ap.add_argument("--sources")
    ap.add_argument("--out")
    ap.add_argument("--config")
    ap.add_argument("--strict", action="store_true")
    a = ap.parse_args()
    try:
        ledger = json.loads(Path(a.ledger).read_text(encoding="utf-8"))
        case = json.loads(Path(a.case).read_text(encoding="utf-8"))
        sources = json.loads(Path(a.sources).read_text(encoding="utf-8")) if a.sources else {}
        cfg = json.loads(Path(a.config or ROOT / "config/judge.config.json").read_text())
    except Exception as e:  # noqa: BLE001
        print(f"usage error: {e}", file=sys.stderr); sys.exit(2)
    ledger, report = verify(ledger, case, sources, cfg)
    out = json.dumps(ledger, ensure_ascii=False, indent=2)
    if a.out:
        Path(a.out).write_text(out + "\n", encoding="utf-8")
    else:
        print(out)
    bad = 0
    for iid, result, base, strength, reason in report:
        tag = "ok " if result in ("exact", "normalized") else "BAD"
        bad += tag == "BAD"
        cap = f"  {base} -> {strength} ({reason})" if reason else ""
        print(f"{tag} {iid}: {result}{cap}", file=sys.stderr)
    print(f"{len(report) - bad}/{len(report)} quotes verified", file=sys.stderr)
    sys.exit(1 if (a.strict and bad) else 0)


if __name__ == "__main__":
    main()
