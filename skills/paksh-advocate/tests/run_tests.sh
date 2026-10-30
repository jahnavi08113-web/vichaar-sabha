#!/usr/bin/env bash
# Runs every example through the validator and the prompt renderer.
set -u
cd "$(dirname "$0")/.."
V="python3 scripts/validate_paksh.py"
R="python3 scripts/render_prompt.py"
E=examples/skill-swap
X=examples/invalid
pass=0; fail=0
expect() { # expect <exit-code> <label> <command...>
  local want=$1 label=$2; shift 2
  "$@" >/tmp/paksh_test.out 2>&1; local got=$?
  if [ "$got" = "$want" ]; then pass=$((pass+1)); echo "ok   - $label"
  else fail=$((fail+1)); echo "FAIL - $label (exit $got, want $want)"; sed 's/^/       /' /tmp/paksh_test.out; fi
}
expect 0 "valid research plan"        $V --mode research_plan --output $E/research-plan.json
expect 0 "valid Paksh ledger"         $V --mode ledger --output $E/ledger.json
expect 0 "valid merged ledger"        $V --mode ledger --output $E/merged-ledger.json
expect 0 "valid opening"              $V --mode opening --output $E/opening.json --ledger $E/ledger.json
expect 0 "valid case_opening"         $V --mode case_opening --output $E/case-opening.json
expect 0 "valid clarify"              $V --mode clarify --output $E/clarify.json --ledger $E/merged-ledger.json --opening $E/opening.json
expect 0 "valid rebuttal"             $V --mode rebuttal --output $E/rebuttal.json --ledger $E/merged-ledger.json --opening $E/opening.json --vipaksh $E/vipaksh-opening.json
expect 1 "opening rule violations"    $V --mode opening --output $X/opening-violations.json --ledger $E/ledger.json
expect 1 "rebuttal caves to pressure" $V --mode rebuttal --output $X/rebuttal-caves.json --ledger $E/merged-ledger.json --opening $E/opening.json --vipaksh $E/vipaksh-opening.json
expect 1 "loaded research queries"    $V --mode research_plan --output $X/research-plan-loaded.json
expect 1 "opening without ledger"     $V --mode opening --output $E/opening.json
expect 0 "render opening prompt"      $R --mode opening --case $E/case.json --ledger $E/ledger.json
expect 0 "render research prompt"     $R --mode research_plan --case $E/case.json
expect 0 "render clarify prompt"      $R --mode clarify --case $E/case.json --ledger $E/merged-ledger.json --opening $E/opening.json --target-claim P2 --question "What shows reach becomes matches?"
expect 0 "render rebuttal prompt"     $R --mode rebuttal --case $E/case.json --ledger $E/merged-ledger.json --opening $E/opening.json --vipaksh $E/vipaksh-opening.json
expect 0 "render case_opening prompt" $R --mode case_opening --case $E/case.json
expect 1 "isolation: merged ledger in opening" $R --mode opening --case $E/case.json --ledger $E/merged-ledger.json
expect 1 "isolation: Vipaksh before rebuttal"  $R --mode opening --case $E/case.json --ledger $E/ledger.json --vipaksh $E/vipaksh-opening.json
expect 1 "isolation: Vipaksh in case_opening"  $R --mode case_opening --case $E/case.json --vipaksh $E/vipaksh-opening.json
# --- v1.1 evidence checks ---
T=$(mktemp -d)
VQ="python3 scripts/verify_quotes.py"
M="python3 scripts/merge_ledgers.py"
expect 0 "verify example Paksh ledger (strict)"  $VQ --strict --ledger $E/ledger.raw.json --case $E/case.json --out $T/l.json
expect 0 "verified ledger matches committed copy" diff -q $T/l.json $E/ledger.json
expect 1 "verify flags fabricated quotes (strict)" $VQ --strict --ledger $X/ledger-fabricated.raw.json --case $E/case.json --sources $X/sources.json --out $T/f.json
expect 0 "fabricated quote capped to assertion"   sh -c "jq -e '.items[0] | .verified==false and .strength==\"assertion\" and .cap_reason==\"unverified\"' $T/f.json"
expect 0 "small sample (5) capped to opinion"     sh -c "jq -e '.items[1] | .verified==true and .strength==\"opinion\" and .cap_reason==\"small_sample\"' $T/f.json"
expect 0 "web quote without source text unverified" sh -c "jq -e '.items[2].verification==\"no_source_text\"' $T/f.json"
expect 0 "verify is idempotent"                    sh -c "$VQ --ledger $T/f.json --case $E/case.json --sources $X/sources.json --out $T/f2.json 2>/dev/null && diff -q $T/f.json $T/f2.json"
expect 1 "opening cannot lean on capped evidence"  $V --mode opening --output $X/opening-on-fabricated.json --ledger $T/f.json
expect 1 "tampered ledger (unverified kept strong)" $V --mode ledger --output $X/ledger-tampered.json
expect 1 "unverified ledger rejected with --require-verified" $V --mode opening --output $E/opening.json --ledger $E/ledger.raw.json --require-verified
expect 0 "merge after both openings"               $M --paksh $E/ledger.json --vipaksh $E/vipaksh-ledger.json --paksh-opening $E/opening.json --vipaksh-opening $E/vipaksh-opening.json --out $T/m.json
expect 0 "merged ledger matches committed copy"    diff -q $T/m.json $E/merged-ledger.json
expect 0 "exact duplicate became alias (VE1 -> PE2)" sh -c "jq -e '.items[] | select(.id==\"PE2\") | .aliases==[\"VE1\"]' $T/m.json"
expect 1 "merge refused before openings"           $M --paksh $E/ledger.json --vipaksh $E/vipaksh-ledger.json --out $T/x.json
expect 1 "merge refused for unverified ledgers"    $M --paksh $E/ledger.raw.json --vipaksh $E/vipaksh-ledger.raw.json --paksh-opening $E/opening.json --vipaksh-opening $E/vipaksh-opening.json
jq '.items[0].stance="mixed"' $E/vipaksh-ledger.json > $T/v-diff.json
expect 0 "same quote, different rating kept for Judge" sh -c "$M --paksh $E/ledger.json --vipaksh $T/v-diff.json --paksh-opening $E/opening.json --vipaksh-opening $E/vipaksh-opening.json 2>/dev/null | jq -e '[.items[] | select(.id==\"VE1\")] | length==1 and .[0].same_quote_as==[\"PE2\"]'"
expect 0 "valid merged ledger"                     $V --mode ledger --output $E/merged-ledger.json
expect 0 "leak test (canary)"                      python3 tests/canary_test.py
rm -rf "$T"
echo "$pass passed, $fail failed"
[ "$fail" = 0 ]
