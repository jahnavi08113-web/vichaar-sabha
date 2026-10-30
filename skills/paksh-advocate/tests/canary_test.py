#!/usr/bin/env python3
"""Leak test: plant a canary only in material Paksh must not see, then prove it never reaches Paksh.

Positive control: the canary DOES appear in a rebuttal prompt (where Vipaksh's opening is allowed),
which proves the test can detect a leak.
"""
import json, subprocess, sys, tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CANARY = "ZEBRA-4471"
EX = ROOT / "examples/skill-swap"
results = []


def run(*args):
    return subprocess.run([sys.executable, str(ROOT / "scripts/render_prompt.py"), *args],
                          capture_output=True, text=True)


def check(label, ok):
    results.append(ok)
    print(("ok   - " if ok else "FAIL - ") + label)


with tempfile.TemporaryDirectory() as d:
    d = Path(d)
    case = json.loads((EX / "case.json").read_text())
    # Canary in every field Paksh must not see
    case["script"] = [{"speaker": "vipaksh", "text": f"secret line {CANARY}"}]
    case["rulings"] = {"demand": f"Sustained {CANARY}"}
    case["verdict"] = {"headline": CANARY}
    case["exhibits"][0]["private_note"] = CANARY
    (d / "case.json").write_text(json.dumps(case))
    vled = json.loads((EX / "vipaksh-ledger.json").read_text())
    vled["items"][0]["note"] = f"Vipaksh strategy {CANARY}"
    (d / "vled.json").write_text(json.dumps(vled))
    vop = json.loads((EX / "vipaksh-opening.json").read_text())
    vop["statement"] += f" {CANARY}"
    (d / "vop.json").write_text(json.dumps(vop))
    merged = json.loads((EX / "merged-ledger.json").read_text())
    merged["items"].append({**vled["items"][1], "id": "VE3", "quote": f"leak {CANARY}"})
    (d / "merged.json").write_text(json.dumps(merged))

    for mode, extra in (("research_plan", []), ("ledger", []), ("opening", ["--ledger", str(EX / "ledger.json")]), ("case_opening", [])):
        r = run("--mode", mode, "--case", str(d / "case.json"), *extra)
        check(f"{mode}: renders", r.returncode == 0)
        check(f"{mode}: canary absent from Paksh prompt", CANARY not in r.stdout)

    r = run("--mode", "opening", "--case", str(d / "case.json"), "--ledger", str(d / "merged.json"))
    check("opening with merged (VE) ledger is refused", r.returncode != 0 and CANARY not in r.stdout)
    r = run("--mode", "opening", "--case", str(d / "case.json"), "--ledger", str(EX / "ledger.json"), "--vipaksh", str(d / "vop.json"))
    check("opening with Vipaksh opening is refused", r.returncode != 0 and CANARY not in r.stdout)
    r = run("--mode", "case_opening", "--case", str(d / "case.json"), "--vipaksh", str(d / "vop.json"))
    check("case_opening with Vipaksh opening is refused", r.returncode != 0 and CANARY not in r.stdout)

    r = run("--mode", "rebuttal", "--case", str(d / "case.json"), "--ledger", str(EX / "merged-ledger.json"),
            "--opening", str(EX / "opening.json"), "--vipaksh", str(d / "vop.json"))
    check("positive control: canary visible in rebuttal (allowed stage)", r.returncode == 0 and CANARY in r.stdout)
    check("rebuttal still strips case script/rulings/verdict", r.stdout.count(CANARY) == 1)

    # Output-side check: validator flags a leaked canary in Paksh's answer
    op = json.loads((EX / "opening.json").read_text())
    op["concession"] += f" {CANARY}"
    (d / "leaky.json").write_text(json.dumps(op))
    v = subprocess.run([sys.executable, str(ROOT / "scripts/validate_paksh.py"), "--mode", "opening",
                        "--output", str(d / "leaky.json"), "--ledger", str(EX / "ledger.json"), "--canary", CANARY],
                       capture_output=True, text=True)
    check("validator flags canary in Paksh output", v.returncode == 1 and "LEAK" in v.stdout)

print(f"{sum(results)} passed, {len(results) - sum(results)} failed")
sys.exit(0 if all(results) else 1)
