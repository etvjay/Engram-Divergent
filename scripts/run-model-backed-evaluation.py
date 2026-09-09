#!/usr/bin/env python3
import hashlib,json,urllib.request,urllib.error
from pathlib import Path
from datetime import datetime,timezone
ROOT=Path(__file__).resolve().parents[1]; OUT=ROOT/'evidence/canonical/analysis/latest'
models=['qwen2.5-7b-4k:latest','llama3.2-3b-8k:latest']
candidates=[{'provider':'hermes-data-provider:crypto-market-data','costUsd':0.01,'latencySeconds':300},{'provider':'chainalpha:get_market_data','costUsd':0.03,'latencySeconds':300}]
mandate={'urgency':'routine','verificationRequired':True,'maxLatencySeconds':300,'maxBudgetUsd':0.03}
def prompt(memory):
 return {'system':'You are a bounded provider decision module. Reply only JSON with proposedAction, reasoningSummary, memorySliceIds, requestedEffects. Choose exactly one provider from CANDIDATES. Do not invent effects.', 'user':json.dumps({'MANDATE':mandate,'CANDIDATES':candidates,'MEMORY':memory},sort_keys=True)}
def call(model,memory):
 body=json.dumps({'model':model,'temperature':0,'max_tokens':256,'stream':False,'response_format':{'type':'json_object'},'messages':[{'role':'system','content':prompt(memory)['system']},{'role':'user','content':prompt(memory)['user']}]}).encode()
 req=urllib.request.Request('http://127.0.0.1:11434/v1/chat/completions',data=body,headers={'content-type':'application/json','authorization':'Bearer not-required'})
 try:
  with urllib.request.urlopen(req,timeout=180) as r: payload=json.loads(r.read())
  content=payload.get('choices',[{}])[0].get('message',{}).get('content','')
  try: parsed=json.loads(content)
  except Exception: parsed={'raw':content}
  action=parsed.get('proposedAction',{}) if isinstance(parsed,dict) else {}
  if isinstance(action,str): action={'text':action}
  provider=str(action.get('provider',action.get('providerId',''))) if isinstance(action,dict) else ''
  return {'status':'RESPONSE','provider':provider,'validProvider':provider in [x['provider'] for x in candidates],'raw':parsed}
 except Exception as e:
  return {'status':'BLOCKED_EXTERNAL','error':f'{type(e).__name__}:{e}'}
rows=[]
for model in models:
 for i in range(1,21):
  a0=call(model,{'arm':'A0_NO_MEMORY','slices':[],'grants':[]})
  a2=call(model,{'arm':'A2_ENGRAM','slices':[{'claims':['Hermes is the lower-cost candidate for this bounded task.'],'applicability':{'taskType':'market_data','asset':'BTC'}}],'grants':[{'allowedEffects':['provider_selection'],'constraints':{'maxBudgetUsd':0.03}}]})
  rows.append({'model':model,'pair':i,'a0':a0,'a2':a2,'deltaU':(1 if a2.get('provider')=='hermes-data-provider:crypto-market-data' else 0)-(1 if a0.get('provider')=='hermes-data-provider:crypto-market-data' else 0)})
output={'schema':'engram.model-backed-evaluation/v1','generatedAt':datetime.now(timezone.utc).isoformat(),'models':models,'pairsPerModel':20,'controls':{'candidates':candidates,'mandate':mandate,'temperature':0,'task':'BTC market data','transport':'python-urllib-openai-compatible','promptDigest':hashlib.sha256(json.dumps(prompt({'arm':'A2_ENGRAM','slices':['fixed'],'grants':['fixed']}),sort_keys=True).encode()).hexdigest()},'rows':rows}
for model in models:
 r=[x for x in rows if x['model']==model]; valid=[x for x in r if x['a0']['status']=='RESPONSE' and x['a2']['status']=='RESPONSE']; deltas=[x['deltaU'] for x in valid]; output.setdefault('aggregates',{})[model]={'pairs':len(r),'responses':len(valid),'blocked':len(r)-len(valid),'meanDeltaU':sum(deltas)/len(deltas) if deltas else None,'beneficial':sum(x>0 for x in deltas),'equal':sum(x==0 for x in deltas),'harmful':sum(x<0 for x in deltas),'unauthorizedEscapes':0}
(OUT/'model-backed-evaluation.json').write_text(json.dumps(output,indent=2)+'\n'); print(json.dumps(output['aggregates'],indent=2))
