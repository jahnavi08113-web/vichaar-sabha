#!/usr/bin/env python3
"""Merge the Paksh and Vipaksh ledgers after BOTH openings are finished.

  python3 merge_ledgers.py --paksh ledger.json --vipaksh vipaksh-ledger.json \
      --paksh-opening opening.json --vipaksh-opening vipaksh-opening.json --out merged-ledger.json

Rules (code does only mechanical work):
  * Exact duplicate = same source_type, same source (URL for web), same normalised quote,
    same stance and same strength. The later item becomes an alias of the first (PE first).
  * Same source and quote but a different stance/strength: both items are kept and linked with
    same_quote_as. The Judge decides; code never picks a side.
  * Nothing is merged because it is similar, shares keywords or covers the same topic.
  * Conflicting facts are not flagged by code. Spotting "disputed" evidence is a review task.

Isolation guard: refuses to run unless both openings exist and are valid JSON with
mode "opening" (override with --allow-before-openings for tests only).
Requires verified ledgers (run verify_quotes.py first) unless --allow-unverified.
"""
import argparse, json, sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from verify_quotes import norm  # noqa: E402


def load(p):
    try:
        return json.loads(Path(p).read_text(encoding="utf-8"))
    except Exception as e:  # noqa: BLE001
        print(f"usage error: cannot read {p}: {e}", file=sys.stderr); sys.exit(2)


def fail(msg):
    print(f"merge refused: {msg}", file=sys.stderr); sys.exit(1)


def key(item):
    where = item.get("url", "") if item["source_type"] == "web" else item.get("source", "")
    return (item["source_type"], where.strip().lower(), norm(item["quote"]))


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--paksh", required=True); ap.add_argument("--vipaksh", required=True)
    ap.add_argument("--paksh-opening"); ap.add_argument("--vipaksh-opening")
    ap.add_argument("--out")
    ap.add_argument("--allow-before-openings", action="store_true")
    ap.add_argument("--allow-unverified", action="store_true")
    a = ap.parse_args()

    if not a.allow_before_openings:
        for label, path in (("Paksh", a.paksh_opening), ("Vipaksh", a.vipaksh_opening)):
            if not path or not Path(path).exists():
                fail(f"{label} opening not finished - merge only after both openings")
            if load(path).get("mode") != "opening":
                fail(f"{label} opening file is not an opening")

    P, V = load(a.paksh), load(a.vipaksh)
    if P.get("owner") != "paksh" or V.get("owner") != "vipaksh":
        fail("expected owner 'paksh' and owner 'vipaksh'")
    for led, prefix in ((P, "PE"), (V, "VE")):
        for it in led["items"]:
            if not it["id"].startswith(prefix):
                fail(f"{it['id']} in the {led['owner']} ledger must start with {prefix}")
            if not a.allow_unverified and "verified" not in it:
                fail(f"{it['id']} has not been through verify_quotes.py")

    merged, by_key, aliases, rating_diffs = [], {}, 0, 0
    for it in P["items"] + V["items"]:
        it = dict(it)
        k = key(it)
        same = by_key.get(k, [])
        twin = next((m for m in same if m["stance"] == it["stance"] and m["strength"] == it["strength"]), None)
        if twin:
            twin.setdefault("aliases", []).append(it["id"]); aliases += 1
            continue
        if same:
            rating_diffs += 1
            for m in same:
                m.setdefault("same_quote_as", []).append(it["id"])
                it.setdefault("same_quote_as", []).append(m["id"])
        by_key.setdefault(k, []).append(it)
        merged.append(it)

    modes = {P.get("research_mode", "case"), V.get("research_mode", "case")}
    out = {"owner": "merged", "research_mode": modes.pop() if len(modes) == 1 else "mixed",
           "merged_from": ["paksh", "vipaksh"], "items": merged}
    text = json.dumps(out, ensure_ascii=False, indent=2)
    Path(a.out).write_text(text + "\n", encoding="utf-8") if a.out else print(text)
    print(f"merged {len(P['items'])} + {len(V['items'])} -> {len(merged)} items "
          f"({aliases} exact duplicate(s) aliased, {rating_diffs} same-quote rating difference(s) kept for the Judge)",
          file=sys.stderr)


if __name__ == "__main__":
    main()
