#!/usr/bin/env python3
"""Validate a model decision against a TRUSTED server-built Judge packet.
--packet packet.json --output decision.json [--canary ZEBRA-4471] [--json]
No model/network calls. Structure, references and safety gates only, not truth.
"""
import argparse,json,re,sys
from common import ROOT,load,dump,schema_errors,packet_errors,AREAS

def validate(out,packet,canaries=()):
    errors=packet_errors(packet);warnings=[]
    if errors:return {'valid':False,'errors':['invalid packet: '+x for x in errors],'warnings':[]}
    errors=schema_errors(out,load(ROOT/'schemas/judge-decision.schema.json'))
    if errors:return {'valid':False,'errors':errors,'warnings':[]}
    cs={c['id']:c for c in packet['claims']};es={e['id']:e for e in packet['evidence']};ctrl=packet['control']
    def refs(ids,index,label):
        if len(ids)!=len(set(ids)):errors.append(label+': duplicate references')
        for i in ids:
            if i not in index:errors.append(label+': unknown ID '+i)
    def verified(ids):return all(i in es and es[i]['verified'] for i in ids)
    rs={r['claim_id']:r for r in out['claim_reviews']}
    if len(rs)!=len(out['claim_reviews']):errors.append('duplicate claim reviews')
    if set(rs)!=set(cs):errors.append('review every input claim exactly once, including critical risks')
    for r in out['claim_reviews']:
        refs([r['claim_id']],cs,'claim review');refs(r['supports'],es,'supports');refs(r['opposes'],es,'opposes')
        if set(r['supports']) & set(r['opposes']):warnings.append('same evidence cited on both sides; justify its mixed meaning')
        if r['finding']=='supported' and (not r['supports'] or not verified(r['supports'])):errors.append('supported claim needs quote-verified supporting evidence')
        if r['finding']=='contradicted' and (not r['opposes'] or not verified(r['opposes'])):errors.append('contradicted claim needs quote-verified opposing evidence')
    for area in AREAS:
        refs(out['rubric'][area]['claim_ids'],cs,'rubric '+area)
        if out['rubric'][area]['score'] is not None and not out['rubric'][area]['claim_ids']:errors.append('scored rubric dimension needs claim references')
    refs(out['decisive_claims'],cs,'decisive claims')
    if not any(rs.get(c,{}).get('material') for c in out['decisive_claims']):errors.append('need a material decisive claim')
    ob=out['strongest_objection'];refs(ob['evidence'],es,'strongest objection evidence')
    if ob['claim_id'] is not None:refs([ob['claim_id']],cs,'strongest objection claim')
    for u in out['unknowns']:refs(u['claim_ids'],cs,'unknown')
    for b in out['blocking_risks']:
        refs([b['claim_id']],cs,'blocking risk');refs(b['evidence'],es,'blocking risk evidence')
        if b['status']=='confirmed' and (not b['evidence'] or not verified(b['evidence'])):errors.append('confirmed blocker needs quote-verified evidence')
    if out['mode']!=ctrl['phase']:errors.append('mode must match server phase')
    if out['continue']:
        q=out['clarification']
        if out['verdict'] is not None:errors.append('continue cannot include a final verdict')
        if q is None:errors.append('continue requires one clarification object')
        if out['reason_code']!='clarification_needed':errors.append('continue requires clarification_needed')
        if ctrl['phase']!='initial' or ctrl['clarification_rounds_used']!=0:errors.append('no second clarification round')
        if not ctrl['can_clarify'] or not ctrl['budget_allows_clarification']:errors.append('server disallows clarification')
        if any(b['status']=='confirmed' for b in out['blocking_risks']):errors.append('confirmed blocker: stop instead of extending debate')
        if q:
            refs([q['target_claim']],cs,'clarification target');refs(q['existing_evidence'],es,'clarification evidence')
            if not verified(q['existing_evidence']):errors.append('clarification needs existing quote-verified evidence')
            r=rs.get(q['target_claim'],{})
            if not r.get('material') or r.get('finding') not in ('partial','unresolved'):errors.append('clarification target must be material and partial/unresolved')
            if q['target_claim'] not in out['decisive_claims']:errors.append('clarification target must be decisive')
            if q['if_answer_a']==q['if_answer_b']:errors.append('clarification answers must change action label')
    else:
        if out['clarification'] is not None:errors.append('stop cannot request clarification')
        if out['reason_code']=='clarification_needed':errors.append('stop cannot use clarification_needed')
        v=out['verdict']
        if v is None:errors.append('stop requires a complete verdict')
        if out['reason_code']=='external_evidence_needed' and not out['unknowns']:errors.append('external evidence stop must name missing evidence')
        if out['reason_code'] in ('round_limit','clarification_inconclusive') and ctrl['clarification_rounds_used']!=1:errors.append('round-limit reason requires consumed round')
        if out['reason_code']=='budget_limit' and ctrl['budget_allows_clarification']:errors.append('budget-limit reason inconsistent with server control')
        if v:
            refs(v['experiment']['tests_claims'],cs,'experiment')
            if v['label']=='insufficient_evidence' and not out['unknowns']:errors.append('insufficient evidence must name unknowns')
            if v['label']=='approved_pilot':
                if out['blocking_risks']:errors.append('approval cannot retain a blocking risk for this scope')
                if not any(rs.get(c,{}).get('finding')=='supported' for c in out['decisive_claims']):errors.append('approval requires a supported decisive claim')
            if v['label']=='not_recommended' and not any(b['status']=='confirmed' and b['claim_id'] in out['decisive_claims'] for b in out['blocking_risks']):errors.append('negative verdict needs a confirmed decisive blocker, not missing evidence')
    blob=json.dumps(out,ensure_ascii=False).lower()
    cfg=load(ROOT/'config/judge.config.json')
    for s in cfg['rules']['banned_phrases']:
        if s in blob:errors.append('banned overclaim: '+s)
    # Heuristic guard only; the live semantic audit tests subtler formulations.
    if re.search(r'\b\d+(?:\.\d+)?\s*%\s*(?:chance|probability|likely)\b',blob) or re.search(r'(?:probability|chance) of (?:business )?success\s*(?:is|:|=)?\s*\d',blob):errors.append('success probability not permitted')
    for s in canaries:
        if s.lower() in blob:errors.append('forbidden canary in output')
    if any(e['verification'] in ('not_found','no_source_text') for e in es.values()):warnings.append('some quote occurrences are unverified; treat as assertions')
    if any(e.get('sample_size',20)<20 for e in es.values()):warnings.append('small-sample strength cap applied; no population-level inference')
    return {'valid':not errors,'errors':errors,'warnings':warnings}

def main():
    ap=argparse.ArgumentParser(description=__doc__);ap.add_argument('--packet',required=True);ap.add_argument('--output',required=True);ap.add_argument('--canary',action='append',default=[]);ap.add_argument('--json',action='store_true');a=ap.parse_args()
    try:report=validate(load(a.output),load(a.packet),a.canary)
    except (ValueError,KeyError,TypeError,OSError) as e:print('usage error: '+str(e),file=sys.stderr);sys.exit(2)
    print(dump(report) if a.json else ('VALID' if report['valid'] else 'INVALID')+'\n'+'\n'.join(report['errors']+report['warnings']),end='\n');sys.exit(0 if report['valid'] else 1)
if __name__=='__main__':main()
