#!/usr/bin/env python3
"""Validate Paksh outputs against the skill's JSON Schemas and hard rules.

No third-party dependencies. Exit code 0 = valid, 1 = rule/schema errors, 2 = usage error.

Examples:
  python3 validate_paksh.py --mode ledger   --output ledger.json
  python3 validate_paksh.py --mode research_plan --output plan.json
  python3 validate_paksh.py --mode opening  --output opening.json --ledger ledger.json
  python3 validate_paksh.py --mode clarify  --output clarify.json --ledger merged.json --opening opening.json
  python3 validate_paksh.py --mode rebuttal --output rebuttal.json --ledger merged.json --opening opening.json --vipaksh vipaksh.json
  python3 validate_paksh.py --mode opening --output opening.json --ledger ledger.json --canary ZEBRA-4471

--canary: a planted string that only another role could have seen; finding it in the output is a leak.
--require-verified: treat an unverified ledger (no verify_quotes.py pass) as an error, not a warning.
"""
import argparse, json, re, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SCHEMAS = {
    "research_plan": "paksh-research-plan.schema.json",
    "ledger": "evidence-ledger.schema.json",
    "opening": "paksh-opening.schema.json",
    "clarify": "paksh-clarify.schema.json",
    "rebuttal": "paksh-rebuttal.schema.json",
    "case_opening": "case-opening.schema.json",
}
RANK = {"low": 0, "medium": 1, "high": 2}
TYPES = {"object": dict, "array": list, "string": str, "boolean": bool, "integer": int, "number": (int, float)}


def load(path):
    try:
        return json.loads(Path(path).read_text(encoding="utf-8"))
    except Exception as e:  # noqa: BLE001
        print(f"usage error: cannot read JSON {path}: {e}", file=sys.stderr)
        sys.exit(2)


def check_schema(value, schema, path, errors):
    """Small subset of JSON Schema 2020-12 used by this skill."""
    if "const" in schema and value != schema["const"]:
        errors.append(f"{path}: must equal {schema['const']!r}")
    if "enum" in schema and value not in schema["enum"]:
        errors.append(f"{path}: {value!r} not in {schema['enum']}")
    t = schema.get("type")
    if t:
        py = TYPES[t]
        if not isinstance(value, py) or (t in ("integer", "number") and isinstance(value, bool)):
            errors.append(f"{path}: expected {t}")
            return
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        if "minimum" in schema and value < schema["minimum"]:
            errors.append(f"{path}: less than minimum {schema['minimum']}")
    if isinstance(value, str):
        if "minLength" in schema and len(value) < schema["minLength"]:
            errors.append(f"{path}: shorter than {schema['minLength']} chars")
        if "maxLength" in schema and len(value) > schema["maxLength"]:
            errors.append(f"{path}: longer than {schema['maxLength']} chars ({len(value)})")
        if "pattern" in schema and not re.search(schema["pattern"], value):
            errors.append(f"{path}: {value!r} does not match {schema['pattern']}")
    if isinstance(value, list):
        if "minItems" in schema and len(value) < schema["minItems"]:
            errors.append(f"{path}: needs at least {schema['minItems']} items")
        if "maxItems" in schema and len(value) > schema["maxItems"]:
            errors.append(f"{path}: at most {schema['maxItems']} items ({len(value)})")
        if "items" in schema:
            for i, item in enumerate(value):
                check_schema(item, schema["items"], f"{path}[{i}]", errors)
    if isinstance(value, dict):
        props = schema.get("properties", {})
        for key in schema.get("required", []):
            if key not in value:
                errors.append(f"{path}: missing required '{key}'")
        if schema.get("additionalProperties") is False:
            for key in value:
                if key not in props:
                    errors.append(f"{path}: unexpected property '{key}'")
        for key, sub in props.items():
            if key in value:
                check_schema(value[key], sub, f"{path}.{key}", errors)


def words(text):
    return len(re.findall(r"\S+", text or ""))


def est_tokens(obj):
    return round(len(json.dumps(obj, ensure_ascii=False, separators=(",", ":"))) / 4)


def text_blobs(obj):
    if isinstance(obj, str):
        yield obj
    elif isinstance(obj, list):
        for x in obj:
            yield from text_blobs(x)
    elif isinstance(obj, dict):
        for x in obj.values():
            yield from text_blobs(x)


def check_banned(obj, cfg, errors):
    blob = " ".join(text_blobs(obj)).lower()
    for phrase in cfg["rules"]["banned_phrases"]:
        if phrase.lower() in blob:
            errors.append(f"banned phrase: '{phrase}'")
    if re.search(r"\b\d{1,3}\s?%\s+(chance|likely|probability)", blob):
        errors.append("states a probability of success")


def ledger_index(ledger):
    idx = {}
    if not ledger:
        return idx
    for item in ledger.get("items", []):
        idx[item["id"]] = item
        for alias in item.get("aliases", []):
            idx[alias] = item
    return idx


def max_conf_for(evidence_ids, idx, basis, cfg):
    if basis == "assumption" or not evidence_ids:
        return "medium" if cfg["rules"]["allow_medium_assumptions"] else "low"
    supportive = [idx[e] for e in evidence_ids if e in idx and idx[e]["stance"] in ("for", "mixed", "context")]
    strengths = {("assertion" if i.get("verified") is False else i["strength"]) for i in supportive}
    if strengths & {"behavior", "data"}:
        return "high"
    if "opinion" in strengths:
        return "medium"
    return "low"


def check_claim(c, where, idx, cfg, errors, warnings, allowed_prefixes):
    ev = c.get("evidence", [])
    if c["basis"] == "evidence" and not ev:
        errors.append(f"{where}: basis 'evidence' but no evidence IDs")
    if c["basis"] == "assumption" and ev:
        warnings.append(f"{where}: basis 'assumption' lists evidence; use basis 'evidence'")
    for e in ev:
        if not e.startswith(allowed_prefixes):
            errors.append(f"{where}: may not cite {e} in this mode")
        elif e not in idx:
            errors.append(f"{where}: cites {e}, which is not in the ledger")
    cap = max_conf_for(ev, idx, c["basis"], cfg)
    if RANK[c["confidence"]] > RANK[cap]:
        errors.append(f"{where}: confidence '{c['confidence']}' exceeds evidence cap '{cap}'")
    if c["basis"] == "assumption" and re.search(r"\d", c["text"]):
        errors.append(f"{where}: assumption claim contains a number (invented figure?)")
    if words(c["text"]) > 30:
        warnings.append(f"{where}: claim longer than 30 words")


def rules_opening(out, idx, cfg, errors, warnings):
    claims = out["claims"]
    if len(claims) > cfg["opening"]["max_claims"]:
        errors.append(f"more than {cfg['opening']['max_claims']} claims")
    ids = [c["id"] for c in claims]
    if len(set(ids)) != len(ids):
        errors.append("duplicate claim IDs")
    areas = [c["area"] for c in claims]
    if len(set(areas)) != len(areas):
        warnings.append("two claims share an area; prefer distinct areas")
    if "demand" not in areas:
        warnings.append("no demand claim; include one if at all defensible")
    for i, c in enumerate(claims):
        check_claim(c, f"claims[{i}] {c['id']}", idx, cfg, errors, warnings, ("PE",))
    must = {k for k, v in idx.items() if v["stance"] in ("against", "mixed") and k.startswith("PE") and k == v["id"]}
    missing = sorted(must - set(out["contrary_evidence"]))
    if missing:
        errors.append(f"contrary evidence not disclosed: {missing}")
    for e in out["contrary_evidence"]:
        if e not in idx:
            errors.append(f"contrary_evidence cites {e}, not in ledger")
    if out["proving_test"]["tests_claim"] not in ids:
        errors.append("proving_test.tests_claim is not one of the claims")
    if words(out["statement"]) > cfg["opening"]["statement_max_words"]:
        errors.append(f"statement over {cfg['opening']['statement_max_words']} words")
    if re.search(r"\b(P|PE|V|VE)\d\b", out["statement"]):
        errors.append("statement contains claim/evidence IDs")
    if re.search(r"\bvipaksh\b|\bopponent\b", out["statement"], re.I):
        errors.append("statement references Vipaksh (isolation)")
    tok = est_tokens(out)
    if tok > cfg["opening"]["max_output_tokens"]:
        errors.append(f"~{tok} tokens exceeds max_output_tokens {cfg['opening']['max_output_tokens']}")
    elif tok > cfg["opening"]["target_tokens"]:
        warnings.append(f"~{tok} tokens is above target {cfg['opening']['target_tokens']}")


def rules_ledger(out, cfg, errors, warnings):
    items = out["items"]
    if out["owner"] == "paksh" and len(items) > cfg["research"]["max_ledger_items"]:
        errors.append(f"more than {cfg['research']['max_ledger_items']} ledger items")
    ids = [i["id"] for i in items]
    if len(set(ids)) != len(ids):
        errors.append("duplicate ledger IDs")
    ev = cfg["evidence"]
    rank = {"assertion": 0, "opinion": 1, "data": 2, "behavior": 3}
    for i in items:
        prefix = {"paksh": "PE", "vipaksh": "VE"}.get(out["owner"])
        if prefix and not i["id"].startswith(prefix):
            errors.append(f"{i['id']}: {out['owner']} ledger IDs must start with {prefix}")
        if i.get("verified") is False and i["strength"] != ev["unverified_strength"]:
            errors.append(f"{i['id']}: unverified quote must be rated '{ev['unverified_strength']}' (run verify_quotes.py)")
        if i.get("sample_size") is not None and i["sample_size"] < ev["small_sample_threshold"] \
                and rank[i["strength"]] > rank[ev["small_sample_max_strength"]]:
            errors.append(f"{i['id']}: sample of {i['sample_size']} is at most '{ev['small_sample_max_strength']}'")
        if len(i["quote"]) > ev["max_quote_chars"]:
            errors.append(f"{i['id']}: quote longer than {ev['max_quote_chars']} chars")
        if i["source_type"] == "web" and "url" not in i:
            errors.append(f"{i['id']}: web evidence needs a url")
    if not any(i["stance"] in ("against", "mixed") for i in items):
        warnings.append("no against/mixed items; check that contrary evidence was not dropped")


def rules_plan(out, cfg, errors, warnings):
    qs = out["queries"]
    if len(qs) > cfg["research"]["max_queries"]:
        errors.append(f"more than {cfg['research']['max_queries']} queries")
    a_ids = {a["id"] for a in out["assumptions"]}
    for q in qs:
        if q["assumption"] not in a_ids:
            errors.append(f"{q['id']}: unknown assumption {q['assumption']}")
        n = words(q["query"])
        if not 2 <= n <= 8:
            warnings.append(f"{q['id']}: query should be 3-7 words ({n})")
        for pat in cfg["rules"]["loaded_query_terms"]:
            if re.search(pat, q["query"], re.I):
                errors.append(f"{q['id']}: loaded query term /{pat}/ - phrase it neutrally")
    if not any(q["could_find_against"] for q in qs):
        errors.append("no query can find evidence against the idea")


def rules_clarify(out, idx, opening, cfg, errors, warnings):
    if words(out["answer"]) > cfg["clarify"]["answer_max_words"]:
        errors.append(f"answer over {cfg['clarify']['answer_max_words']} words")
    for e in out["evidence"]:
        if e not in idx:
            errors.append(f"cites {e}, not in merged ledger")
    if not out["evidence"] and not out["unknown"]:
        errors.append("no evidence cited and unknown is false")
    prev = out.get("previous_confidence")
    if opening:
        match = [c for c in opening["claims"] if c["id"] == out["target_claim"]]
        if not match:
            errors.append(f"target_claim {out['target_claim']} not in opening")
        else:
            prev = match[0]["confidence"]
    if prev and RANK[out["confidence"]] > RANK[prev]:
        strong = [e for e in out["evidence"] if e in idx and idx[e]["strength"] in ("behavior", "data") and idx[e]["stance"] == "for"]
        if not strong:
            errors.append("raised confidence without behavior/data evidence")


def rules_rebuttal(out, idx, opening, vipaksh, cfg, errors, warnings):
    if len(out["responses"]) > cfg["rebuttal"]["max_responses"]:
        errors.append(f"more than {cfg['rebuttal']['max_responses']} responses")
    v_ids = {c["id"] for c in (vipaksh or {}).get("claims", [])}
    p_ids = {c["id"] for c in (opening or {}).get("claims", [])}
    for i, r in enumerate(out["responses"]):
        where = f"responses[{i}] {r['target']}/{r['move']}"
        if vipaksh and r["target"] not in v_ids:
            errors.append(f"{where}: target not in Vipaksh opening")
        for e in r["evidence"]:
            if e not in idx:
                errors.append(f"{where}: cites {e}, not in merged ledger")
        if r["move"] == "counter" and not r["evidence"]:
            errors.append(f"{where}: counter needs evidence IDs")
        if r["move"] in ("narrow", "concede") and not (r["evidence"] or r.get("named_flaw")):
            errors.append(f"{where}: moving position needs evidence or a named flaw (not pressure)")
        if r["move"] == "narrow" and not r.get("revised_claim"):
            errors.append(f"{where}: narrow needs revised_claim")
        if r["move"] in ("narrow", "concede") and not r.get("affects_claim"):
            warnings.append(f"{where}: say which P claim this affects")
        if r.get("affects_claim") and opening and r["affects_claim"] not in p_ids:
            errors.append(f"{where}: affects_claim not in opening")
    new = out.get("new_claims", [])
    if len(new) > cfg["rebuttal"]["max_new_claims"]:
        errors.append("too many new claims")
    for i, c in enumerate(new):
        if c["id"] in p_ids:
            errors.append(f"new_claims[{i}]: reuses existing ID {c['id']}")
        check_claim(c, f"new_claims[{i}] {c['id']}", idx, cfg, errors, warnings, ("PE", "VE"))
    if words(out["statement"]) > cfg["rebuttal"]["statement_max_words"]:
        errors.append(f"statement over {cfg['rebuttal']['statement_max_words']} words")
    if re.search(r"\b(P|PE|V|VE)\d\b", out["statement"]):
        errors.append("statement contains claim/evidence IDs")
    tok = est_tokens(out)
    if tok > cfg["rebuttal"]["max_output_tokens"]:
        errors.append(f"~{tok} tokens exceeds max_output_tokens {cfg['rebuttal']['max_output_tokens']}")


def check_verification(ledger, cfg, require, errors, warnings, label="ledger"):
    if not ledger or not cfg["evidence"]["require_verification"]:
        return
    missing = [i["id"] for i in ledger.get("items", []) if "verified" not in i]
    if missing:
        msg = f"{label} not verified for {missing}; run scripts/verify_quotes.py"
        (errors if require else warnings).append(msg)
    bad = [i["id"] for i in ledger.get("items", []) if i.get("verified") is False]
    if bad:
        warnings.append(f"{label} has unverified quotes {bad}; they count as assertions")


def check_canaries(out, canaries, errors):
    blob = json.dumps(out, ensure_ascii=False)
    for c in canaries or []:
        if c and c in blob:
            errors.append(f"LEAK: canary '{c}' found in output")


def validate(mode, out, ledger=None, opening=None, vipaksh=None, cfg=None, canaries=None, require_verified=False):
    cfg = cfg or json.loads((ROOT / "config/paksh.config.json").read_text())
    errors, warnings = [], []
    if mode == "case_opening":
        if not isinstance(out, dict) or "ledger" not in out or "opening" not in out:
            errors.append("case_opening output must be an object with 'ledger' and 'opening'")
            return errors, warnings
        l_errors, l_warnings = validate("ledger", out["ledger"], cfg=cfg, canaries=canaries, require_verified=require_verified)
        o_errors, o_warnings = validate("opening", out["opening"], ledger=out["ledger"], cfg=cfg, canaries=canaries, require_verified=require_verified)
        errors.extend(l_errors)
        errors.extend(o_errors)
        warnings.extend(l_warnings)
        warnings.extend(o_warnings)
        check_banned(out, cfg, errors)
        return errors, warnings
    schema = json.loads((ROOT / "schemas" / SCHEMAS[mode]).read_text())
    check_schema(out, schema, "$", errors)
    if ledger is not None:
        lerr = []
        check_schema(ledger, json.loads((ROOT / "schemas" / SCHEMAS["ledger"]).read_text()), "ledger", lerr)
        errors += lerr
    check_canaries(out, canaries, errors)
    if errors:  # rule checks assume schema shape
        return errors, warnings
    idx = ledger_index(ledger)
    if mode in ("opening", "clarify", "rebuttal") and ledger is None:
        errors.append(f"{mode} needs --ledger to check evidence IDs and disclosure")
        return errors, warnings
    if ledger is not None:
        rules_ledger(ledger, cfg, errors, warnings)
        check_verification(ledger, cfg, require_verified, errors, warnings)
    if mode == "opening":
        if any(k.startswith("VE") for k in idx):
            errors.append("isolation: opening was checked against a ledger with Vipaksh (VE*) items")
        rules_opening(out, idx, cfg, errors, warnings)
    elif mode == "ledger":
        rules_ledger(out, cfg, errors, warnings)
        check_verification(out, cfg, require_verified, errors, warnings, "this ledger")
    elif mode == "research_plan":
        rules_plan(out, cfg, errors, warnings)
    elif mode == "clarify":
        rules_clarify(out, idx, opening, cfg, errors, warnings)
    elif mode == "rebuttal":
        rules_rebuttal(out, idx, opening, vipaksh, cfg, errors, warnings)
    check_banned(out, cfg, errors)
    return errors, warnings


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--mode", required=True, choices=sorted(SCHEMAS))
    ap.add_argument("--output", required=True)
    ap.add_argument("--ledger")
    ap.add_argument("--opening")
    ap.add_argument("--vipaksh")
    ap.add_argument("--config")
    ap.add_argument("--canary", action="append", default=[], help="planted string that must not appear")
    ap.add_argument("--require-verified", action="store_true")
    ap.add_argument("--json", action="store_true", help="print a JSON report")
    a = ap.parse_args()
    cfg = load(a.config) if a.config else None
    errors, warnings = validate(
        a.mode, load(a.output),
        load(a.ledger) if a.ledger else None,
        load(a.opening) if a.opening else None,
        load(a.vipaksh) if a.vipaksh else None,
        cfg, a.canary, a.require_verified,
    )
    if a.json:
        print(json.dumps({"valid": not errors, "errors": errors, "warnings": warnings}, indent=2))
    else:
        for w in warnings:
            print(f"warning: {w}")
        for e in errors:
            print(f"error:   {e}")
        print("VALID" if not errors else f"INVALID ({len(errors)} error(s))")
    sys.exit(0 if not errors else 1)


if __name__ == "__main__":
    main()
