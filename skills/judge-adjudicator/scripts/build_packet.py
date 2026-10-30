#!/usr/bin/env python3
"""Build a blinded packet from trusted raw orchestration state; no network.
--input raw.json --seed 41 --out packet.json --maps maps.private.json
Keep maps server-side; use the same immutable inputs/seed for final stage.
"""
import argparse,copy,hashlib,json,re,sys
from pathlib import Path
from common import ROOT,AREAS,load,dump,ensure,packet_errors
from verify_quotes import verify
CASE=('id','number','title','brief','goal','goal_type','location','constraints','alternatives','unknowns','exhibits')
EXHIBIT=('id','kind','title','detail','text','url')
EV=('source_type','source','quote','strength','stance','url','note','sample_size','supports_area')
def build(raw,seed=41):
    cfg=load(ROOT/'config/judge.config.json')
    case={k:copy.deepcopy(v) for k,v in raw['case'].items() if k in CASE}
    case['exhibits']=[{k:copy.deepcopy(v) for k,v in ex.items() if k in EXHIBIT} for ex in case.get('exhibits',[])]
    ledger=copy.deepcopy(raw['ledger'])
    ensure(ledger,load(ROOT/'schemas/evidence-ledger.schema.json'))
    if ledger['owner']!='merged':raise ValueError('need merged ledger after both openings')
    for e in ledger['items']:
        for key in ('verified','verification','original_strength','cap_reason'):e.pop(key,None)
    ledger,_=verify(ledger,case,{},cfg)
    rank=lambda kind,key: hashlib.sha256(f'{seed}|{kind}|{key}'.encode('utf-8')).hexdigest()
    roles=sorted(['paksh','vipaksh'],key=lambda role:rank('side',role))
    evidence=sorted(ledger['items'],key=lambda e:rank('evidence',e['id']))
    emap={};e_private={}
    for i,e in enumerate(evidence,1):
        eid=f'E{i}';e_private[eid]=e['id']
        for orig in [e['id']]+e.get('aliases',[]):
            if orig in emap:raise ValueError('duplicate evidence ID/alias')
            emap[orig]=eid
    def erefs(ids):
        vals=[]
        for x in ids:
            if x not in emap:raise ValueError(f'unknown original evidence {x}')
            if emap[x] not in vals:vals.append(emap[x])
        return vals
    cmap={};private_claims={};side_map={role:chr(65+i) for i,role in enumerate(roles)}
    claims=[];sides=[]
    for role in roles:
        opening=raw['openings'][role]
        if opening.get('mode')!='opening' or not opening.get('claims'):raise ValueError(f'{role}: completed structured opening required')
        for original,critical in [(c,False) for c in opening['claims']]+[(c,True) for c in opening.get('critical_risks',[])]:
            oid=original['id'];prefix='P' if role=='paksh' else 'V'
            if not re.fullmatch(prefix+r'[1-9][0-9]?',oid):raise ValueError('invalid original claim ID')
            if oid in cmap:raise ValueError('duplicate original claim ID')
            cid=f'C{len(claims)+1}';cmap[oid]=cid;private_claims[cid]={'role':role,'id':oid}
            claims.append({'id':cid,'side':side_map[role],'area':original['area'],'text':original['text'],'basis':original.get('basis','evidence' if original.get('evidence') else 'assumption'),'evidence':erefs(original.get('evidence',[])),'confidence':original.get('confidence','low'),'critical':critical})
    def cosmetic(text):
        for role in ('vipaksh','paksh'):
            text=re.sub(r'\b'+role+r'\b','Side '+side_map[role],text,flags=re.I)
        return text
    for c in claims:c['text']=cosmetic(c['text'])
    for role in roles:
        op=raw['openings'][role]
        test={k:copy.deepcopy(v) for k,v in op.get('proving_test',{}).items() if k in ('action','metric','success_threshold','timebox','tests_claim')}
        if test.get('tests_claim'):
            if test['tests_claim'] not in cmap:raise ValueError('unknown proving_test claim')
            test['tests_claim']=cmap[test['tests_claim']]
        for k in test:
            if isinstance(test[k],str) and k!='tests_claim':test[k]=cosmetic(test[k])
        sides.append({'id':side_map[role],'framing':cosmetic(op.get('framing','')),'statement':cosmetic(op.get('statement','')),'claim_ids':[c['id'] for c in claims if c['side']==side_map[role]],'assumptions':[cosmetic(s) for s in op.get('assumptions',[])],'outside_view':[cosmetic(s) for s in op.get('outside_view',[])],'concession':cosmetic(op.get('concession','')),'contrary_evidence':erefs(op.get('contrary_evidence',[])),'proving_test':test,'coverage':{k:v for k,v in op.get('coverage',{}).items() if k in AREAS}})
    ev=[]
    for e in evidence:
        row={k:copy.deepcopy(e[k]) for k in EV if k in e};row['id']=emap[e['id']]
        for k in ('verified','verification','original_strength','cap_reason'):
            if k in e:row[k]=e[k]
        if e.get('same_quote_as'):row['same_quote_as']=erefs(e['same_quote_as'])
        ev.append(row)
    ctrl={k:raw['control'][k] for k in ('phase','clarification_rounds_used','can_clarify','budget_allows_clarification')}
    req=raw.get('prior_request');mapped_req=None
    if req:
        if req['target_claim'] not in cmap:raise ValueError('unknown clarification target')
        mapped_req={'target_claim':cmap[req['target_claim']],'question':req['question'],'existing_evidence':erefs(req['existing_evidence'])}
    answers=[]
    for a in raw.get('clarifications',[]):
        if a['role'] not in side_map or a['target_claim'] not in cmap:raise ValueError('unknown clarification role/target')
        answers.append({'side':side_map[a['role']],'target_claim':cmap[a['target_claim']],'answer':a['answer'],'evidence':erefs(a['evidence']),'unknown':a['unknown']})
    packet={'schema_version':'1.0.0','case':case,'claims':claims,'sides':sides,'evidence':ev,'control':ctrl,'clarification_request':mapped_req,'clarifications':answers}
    errors=packet_errors(packet)
    if errors:raise ValueError('; '.join(errors))
    maps={'sides':side_map,'claims':private_claims,'evidence':e_private,'evidence_aliases':emap,'original_claims':cmap}
    return packet,maps

def main():
    ap=argparse.ArgumentParser(description=__doc__);ap.add_argument('--input',required=True);ap.add_argument('--seed',type=int,default=41);ap.add_argument('--out',required=True);ap.add_argument('--maps',required=True);a=ap.parse_args()
    try:
        packet,maps=build(load(a.input),a.seed);Path(a.out).write_text(dump(packet));Path(a.maps).write_text(dump(maps));print('packet built; keep reverse maps outside model context')
    except (ValueError,KeyError,TypeError,OSError) as e:print(f'input error: {e}',file=sys.stderr);sys.exit(2)
if __name__=='__main__':main()
