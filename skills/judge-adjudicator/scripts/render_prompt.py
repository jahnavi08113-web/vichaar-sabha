#!/usr/bin/env python3
"""Render a fresh Judge API envelope, never make a call.
--packet packet.json [--out prompt.json]
"""
import argparse,hashlib,json,sys
from pathlib import Path
from common import ROOT,load,dump,packet_errors

def render(packet):
    errors=packet_errors(packet)
    if errors:raise ValueError('; '.join(errors))
    cfg=load(ROOT/'config/judge.config.json');phase=packet['control']['phase']
    system=(ROOT/'prompts/system.md').read_text().strip()
    template=(ROOT/f'prompts/{phase}.md').read_text().strip()
    data=json.dumps(packet,ensure_ascii=False,separators=(',',':'))
    # JSON-string encode, including <>&, so data cannot literally close the wrapper.
    encoded=json.dumps(data,ensure_ascii=False).replace('<',r'\u003c').replace('>',r'\u003e').replace('&',r'\u0026')
    schema=json.dumps(load(ROOT/'schemas/judge-decision.schema.json'),ensure_ascii=False,separators=(',',':'))
    # Replace the data placeholder LAST so attacker strings cannot expand a placeholder.
    user=template.replace('{{OUTPUT_SCHEMA}}',schema).replace('{{PACKET_JSON_STRING}}',encoded)
    envelope={'system':system,'messages':[{'role':'user','content':user}],'temperature':cfg['temperature'][phase],'maxOutputTokens':cfg['generation']['max_output_tokens']}
    canonical=json.dumps(envelope,ensure_ascii=False,separators=(',',':'))
    return {'request':envelope,'promptSha256':hashlib.sha256(canonical.encode()).hexdigest(),'estimatedInputTokens':(len(system)+len(user)+3)//4,'estimateOnly':True}

def main():
    ap=argparse.ArgumentParser(description=__doc__);ap.add_argument('--packet',required=True);ap.add_argument('--out');a=ap.parse_args()
    try:
        result=dump(render(load(a.packet)))
        if a.out:Path(a.out).write_text(result)
        else:print(result,end='')
    except (ValueError,KeyError,TypeError,OSError) as e:print('input error: '+str(e),file=sys.stderr);sys.exit(2)
if __name__=='__main__':main()
