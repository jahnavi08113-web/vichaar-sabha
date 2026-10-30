#!/usr/bin/env python3
"""Build one side's clarification data context; no prompts/model calls.
Requires trusted raw hearing, validated continue decision, and private maps.
--input raw.json --decision continue.json --maps maps.private.json --role paksh|vipaksh --out context.json
"""
import argparse,copy,sys
from pathlib import Path
from common import dump,load
from build_packet import build
from validate_judge import validate

def context(raw,decision,maps,role,seed=41):
    if role not in ('paksh','vipaksh'):raise ValueError('unknown clarification role')
    packet,expected=build(raw,seed)
    if expected!=maps:raise ValueError('private maps do not match immutable initial hearing')
    report=validate(decision,packet)
    if not report['valid'] or not decision['continue']:raise ValueError('a validated continue decision is required')
    q=decision['clarification'];original=maps['claims'][q['target_claim']]
    # Target is the only permitted cross-side card; never copy its entire opening.
    target=next(c for c in raw['openings'][original['role']]['claims']+raw['openings'][original['role']].get('critical_risks',[]) if c['id']==original['id'])
    clean_target={k:copy.deepcopy(target[k]) for k in ('id','area','text','basis','evidence','confidence') if k in target}
    own_side=next(s for s in packet['sides'] if s['id']==maps['sides'][role])
    # Use already sanitized side data, translate references to original IDs for side adapters.
    own=copy.deepcopy(own_side);own.pop('id')
    for k in ('claim_ids',):own[k]=[maps['claims'][i]['id'] for i in own[k]]
    own['contrary_evidence']=[maps['evidence'][i] for i in own['contrary_evidence']]
    if own['proving_test'].get('tests_claim'):own['proving_test']['tests_claim']=maps['claims'][own['proving_test']['tests_claim']]['id']
    own['claims']=[{**{k:copy.deepcopy(v) for k,v in c.items() if k!='side'},'id':maps['claims'][c['id']]['id'],'evidence':[maps['evidence'][e] for e in c['evidence']]} for c in packet['claims'] if c['side']==maps['sides'][role]]
    ev=[]
    for e in packet['evidence']:
        row=copy.deepcopy(e);row['id']=maps['evidence'][e['id']]
        if row.get('same_quote_as'):row['same_quote_as']=[maps['evidence'][i] for i in row['same_quote_as']]
        ev.append(row)
    clean_target['evidence']=[maps['evidence_aliases'][i] for i in clean_target.get('evidence',[])]
    clean_target['evidence']=[maps['evidence'][i] for i in clean_target['evidence']]
    return {'case':copy.deepcopy(packet['case']),'own_opening':own,'evidence':ev,'target_claim':clean_target,'question':q['question'],'existing_evidence':[maps['evidence'][i] for i in q['existing_evidence']]}

def main():
    ap=argparse.ArgumentParser(description=__doc__);ap.add_argument('--input',required=True);ap.add_argument('--decision',required=True);ap.add_argument('--maps',required=True);ap.add_argument('--role',choices=['paksh','vipaksh'],required=True);ap.add_argument('--seed',type=int,default=41);ap.add_argument('--out',required=True);a=ap.parse_args()
    try:Path(a.out).write_text(dump(context(load(a.input),load(a.decision),load(a.maps),a.role,a.seed)));print('isolated clarification context built')
    except (ValueError,KeyError,TypeError,OSError) as e:print('input error: '+str(e),file=sys.stderr);sys.exit(2)
if __name__=='__main__':main()
