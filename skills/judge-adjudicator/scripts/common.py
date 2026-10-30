"""Dependency-free schema subset and JSON helpers for the Judge kit."""
import json, re
from pathlib import Path
ROOT=Path(__file__).resolve().parent.parent
AREAS=('demand','feasibility','viability','risk','goal_fit')
LABELS=('approved_pilot','test_first','revise','insufficient_evidence','not_recommended')
def load(path):
    return json.loads(Path(path).read_text(encoding='utf-8'))
def dump(value):
    return json.dumps(value,ensure_ascii=False,indent=2)+'\n'
def schema_errors(value,schema,path='$'):
    errors=[]
    if 'anyOf' in schema:
        branches=[schema_errors(value,s,path) for s in schema['anyOf']]
        if all(branches):
            errors.append(f'{path}: no anyOf branch matched')
            errors.extend(min(branches,key=len))
        return errors
    types={'object':dict,'array':list,'string':str,'integer':int,'number':(int,float),'boolean':bool,'null':type(None)}
    t=schema.get('type')
    if t and (not isinstance(value,types[t]) or (t in ('integer','number') and isinstance(value,bool))):
        return [f'{path}: expected {t}']
    if 'const' in schema and (type(value)!=type(schema['const']) or value!=schema['const']):errors.append(f'{path}: wrong constant')
    if 'enum' in schema and not any(type(value)==type(x) and value==x for x in schema['enum']):errors.append(f'{path}: invalid enum')
    if isinstance(value,str):
        if len(value)<schema.get('minLength',0):errors.append(f'{path}: too short')
        if len(value)>schema.get('maxLength',float('inf')):errors.append(f'{path}: too long')
        if 'pattern' in schema and not re.search(schema['pattern'],value):errors.append(f'{path}: pattern mismatch')
    if isinstance(value,(int,float)) and not isinstance(value,bool):
        if value<schema.get('minimum',-float('inf')):errors.append(f'{path}: below minimum')
        if value>schema.get('maximum',float('inf')):errors.append(f'{path}: above maximum')
    if isinstance(value,list):
        if len(value)<schema.get('minItems',0):errors.append(f'{path}: too few items')
        if len(value)>schema.get('maxItems',float('inf')):errors.append(f'{path}: too many items')
        if schema.get('uniqueItems') and len({json.dumps(x,sort_keys=True) for x in value})!=len(value):errors.append(f'{path}: duplicate items')
        for i,x in enumerate(value):errors+=schema_errors(x,schema.get('items',{}),f'{path}[{i}]')
    if isinstance(value,dict):
        props=schema.get('properties',{})
        for k in schema.get('required',[]):
            if k not in value:errors.append(f'{path}: missing {k}')
        if schema.get('additionalProperties') is False:
            for k in value:
                if k not in props:errors.append(f'{path}: unexpected {k}')
        for k,s in props.items():
            if k in value:errors+=schema_errors(value[k],s,f'{path}.{k}')
    return errors
def ensure(value,schema):
    errors=schema_errors(value,schema)
    if errors:raise ValueError('; '.join(errors))
def packet_errors(p):
    errors=schema_errors(p,load(ROOT/'schemas/judge-packet.schema.json'))
    if errors:return errors
    cs={x['id']:x for x in p['claims']};es={x['id']:x for x in p['evidence']}
    if len(cs)!=len(p['claims']):errors.append('packet: duplicate claim IDs')
    if len(es)!=len(p['evidence']):errors.append('packet: duplicate evidence IDs')
    if {x['id'] for x in p['sides']}!={'A','B'}:errors.append('packet: need distinct sides A/B')
    def refs(ids,index,label):
        if len(ids)!=len(set(ids)):errors.append(f'{label}: duplicate references')
        for i in ids:
            if i not in index:errors.append(f'{label}: unknown reference {i}')
    for c in p['claims']:refs(c['evidence'],es,c['id'])
    seen=[]
    for s in p['sides']:
        refs(s['claim_ids'],cs,'side claims');seen+=s['claim_ids']
        for c in s['claim_ids']:
            if c in cs and cs[c]['side']!=s['id']:errors.append('packet: side ownership mismatch')
        refs(s['contrary_evidence'],es,'contrary evidence')
        test=s['proving_test']
        if set(test)-{'action','metric','success_threshold','timebox','tests_claim'}:errors.append('packet: unexpected proving_test field')
        if test.get('tests_claim'):
            refs([test['tests_claim']],cs,'proving test')
            if test['tests_claim'] not in s['claim_ids']:errors.append('packet: proving test targets other side')
        for key,v in test.items():
            if not isinstance(v,str) or len(v)>500:errors.append('packet: invalid proving_test value')
    if sorted(seen)!=sorted(cs):errors.append('packet: claims must occur exactly once across sides')
    cfg=load(ROOT/'config/judge.config.json')
    threshold=cfg['evidence']['small_sample_threshold']
    for e in p['evidence']:
        refs(e.get('same_quote_as',[]),es,'same quote')
        if e['verified']!=(e['verification'] in ('exact','normalized')):errors.append('packet: inconsistent verification')
        if not e['verified'] and e['strength']!='assertion':errors.append('packet: unverified strength must be assertion')
        if e.get('sample_size',threshold)<threshold and e['strength'] in ('behavior','data'):errors.append('packet: small sample strength not capped')
    ctrl=p['control']; req=p['clarification_request']; answers=p['clarifications']
    if ctrl['phase']=='initial' and (ctrl['clarification_rounds_used']!=0 or req is not None or answers):errors.append('packet: initial phase cannot contain a prior round')
    if ctrl['phase']=='final' and ctrl['can_clarify']:errors.append('packet: final phase cannot clarify')
    if req:
        refs([req['target_claim']],cs,'request target');refs(req['existing_evidence'],es,'request evidence')
    if ctrl['clarification_rounds_used']==1:
        if ctrl['phase']!='final' or req is None or len(answers)!=2:errors.append('packet: consumed round requires request and two replies')
        if {a['side'] for a in answers}!={'A','B'}:errors.append('packet: require one answer per side')
    elif req is not None or answers:errors.append('packet: answers without a consumed round')
    for a in answers:
        refs([a['target_claim']],cs,'answer target');refs(a['evidence'],es,'answer evidence')
        if req and a['target_claim']!=req['target_claim']:errors.append('packet: wrong answer target')
    cfg=load(ROOT/'config/judge.config.json')
    if len(json.dumps(p,ensure_ascii=False,separators=(',',':')))>cfg['limits']['max_packet_chars']:errors.append('packet: too large; do not truncate')
    return errors
