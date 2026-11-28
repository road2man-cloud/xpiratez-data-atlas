// Produce exact fixed-body closure candidates for the Chort terminal paths.
// This is a separate gate artifact, not a mutation of the canonical final
// registry. Only candidates with complete same-body inventory are closed.
import fs from 'node:fs';
import {readTrainingLedger} from './overcap-training-ledger-store.mjs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {defaultRankData,RANK_POLICY} from './population-frontier-default-rank.mjs';
import {createCareerReplay} from './population-chronological-career-core.mjs';
import {member,exactWorld} from './population-growth-replay-core.mjs';
import {createIrreversibleBodyCareerScope,SCOPE} from './atlas-body-career-scope-v4-irreversible.mjs';
import {auditOriginCampaignContext} from '../public/soldiers/modern/origin-campaign-context.js';
const read=p=>JSON.parse(fs.readFileSync(p,'utf8')),hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const source=read('tools/data/overcap-terminal-source-v1.json'),base=read('public/data/soldier-overcap-expanded-lifecycle.json'),next=read('public/data/soldier-overcap-direct-successors.json'),terminal=read('public/data/soldier-overcap-terminal-continuations.json'),training=readTrainingLedger(),material=read('public/data/soldier-overcap-successor-material-ledger.json'),catalog=read('public/data/soldier-source-catalog.json');
const data=defaultRankData(read('public/data/soldiers-modern-index.json')).data;
data.originRows=read('public/data/soldier-acquisition-progression-20261102.json').rows;data.sourceItemIds=new Set(catalog.itemIds);
assert.equal(data.meta.source.metadataSha256,source.sourceMetadataSha256);assert.equal(next.sourceHash,hash(base));assert.equal(terminal.sourceHash,hash(next));assert.equal(terminal.baseSourceHash,hash(base));assert.equal(terminal.terminalSourceHash,hash(source));assert.equal(training.sourceHash,hash(terminal));assert.equal(material.inputs.lifecycle.canonicalJsonSha256,hash(next));assert.deepEqual(catalog.sourceHashes,data.meta.source.rules);
const parents=new Map(base.results.map(r=>[r.id,r])),children=new Map(next.rows.map(r=>[r.id,r])),terms=new Map(terminal.rows.map(r=>[r.id,r])),branches=new Map(source.branches.map(b=>[b.id,b])),targets=new Map(source.terminalRule.targets.map(t=>[t.id,t]));
const commit=b=>[...new Set([...b.captain,...Object.values(b.choices||{})].filter(Boolean))],allChoices=new Set(source.branches.flatMap(commit));
const active=(w,k)=>w.researched.has(k)&&!w.disabled.has(k),sort=x=>[...x].sort();
const replay=createCareerReplay(data),scope=createIrreversibleBodyCareerScope(data,source.branches,replay,catalog);
const finite=new Map(Object.values(material.catalog).filter(c=>c.cap!=null).map(c=>[c.id,c]));finite.set(material.confirmedReferencePool.id,material.confirmedReferencePool);
function budget(actions){
 const given={},used={},events=new Set(),errors=[];
 const add=(a,k,n)=>{if(finite.has(k))a[k]=(a[k]||0)+n;};
 for(const a of actions){
  if(a.type==='eventResearch')events.add(a.event);
  if(a.type==='externalInputs')for(const [k,n] of Object.entries(a.items||{})){add(given,k,n);if(k==='STR_CAPTAINS_11_TOKEN'&&!events.has('STR_CAPTAINS_11'))errors.push('captain source missing');}
  if(a.type==='transform')for(const [k,n] of Object.entries(replay.rules.get(a.transform)?.requiredItems||{}))add(used,k,n);
  if(a.type==='recruit')for(const [k,n] of Object.entries(data.profiles.find(p=>p.id===a.profile)?.acquisitionRequiredItems||{}))add(used,k,n);
  if(a.type==='research'||a.type==='repeatResearch'){const r=data.researchRules[a.id];if(r?.needItem&&r.destroyItem)add(used,r.neededItem||a.id,1);}
 }
 for(const [k,c] of finite)if(Math.max(given[k]||0,used[k]||0)>c.cap)errors.push(k+': '+Math.max(given[k]||0,used[k]||0)+'/'+c.cap);
 return {ok:!errors.length,errors,given,used,scope:'Current indexed finite pools only; acquisition and terminal craft not certified'};
}
function actionsFor(r){const t=r.sourceTerminalId?terms.get(r.sourceTerminalId):r,c=children.get(t.sourceRecordId),p=parents.get(t.parentRecordId);const a=[...p.actions,...c.suffix,...t.suffix,...(r.sourceTerminalId?r.suffix:[])];assert.equal(hash(a),r.fullActionHash);return a;}
const wanted=process.argv.find(a=>a.startsWith('--body='))?.slice(7)||'STR_SOLDIER_CHORT';
const allInputs=[...terminal.rows,...training.rows].filter(r=>r.body===wanted&&r.conditionalReplayVerified===true);
const offset=Number(process.argv.find(a=>a.startsWith('--offset='))?.slice(9)||0),limit=Number(process.argv.find(a=>a.startsWith('--limit='))?.slice(8)||allInputs.length);
assert(Number.isSafeInteger(offset)&&offset>=0&&Number.isSafeInteger(limit)&&limit>0);
const inputs=allInputs.slice(offset,offset+limit);
const records=[],closed=[],errors=[];
const fingerprints=Object.fromEntries(['tools/atlas-body-career-scope-v4-irreversible.mjs','tools/atlas-replay-irreversible-research.mjs','tools/atlas-first-successor-obligations.mjs','tools/final-career-repeat-quotient.mjs','tools/population-chronological-career-core.mjs','tools/population-growth-replay-core.mjs','public/soldiers/modern/event-chronology.js','public/soldiers/modern/auto-zero-cascade.js','public/soldiers/modern/campaign-proof.js'].map(p=>[p,hash(fs.readFileSync(p,'utf8').replace(/\r\n/g,'\n'))]));
for(const r of inputs){
 const receipt={seedId:r.id,sourceTerminalId:r.sourceTerminalId||r.id,sourceRecordId:r.sourceRecordId,parentRecordId:r.parentRecordId,origin:r.origin,body:r.body,branch:r.branch,difficulty:r.difficulty,target:r.target,sourceActionHash:r.fullActionHash,finalAdmission:false,actualGameCertified:false};
 try{
  const actions=actionsFor(r),b=branches.get(r.branch),t=targets.get(r.target),w=replay.replay(actions),state=member(w).state,f=replay.finish(w),a=new Set([...w.researched].filter(k=>active(w,k)));
  assert.equal(state.soldierType,r.body);assert.equal(state.rank,r.rank);assert.deepEqual(f.raw,r.raw);assert.deepEqual(f.permanentVector,r.effective);assert.deepEqual([...state.bonusCounts].sort(),r.traits);assert.deepEqual([...state.history].sort(),r.history);assert.deepEqual(sort(a),r.activeResearch);assert.deepEqual(sort(w.disabled),r.disabledResearch);
  const ctx=auditOriginCampaignContext(actions,data);assert.equal(ctx.kind,'compatible');assert(ctx.allowedDifficulties.includes(r.difficulty));assert(!w.pendingFree);
  const chosen=commit(b);assert(chosen.every(k=>active(w,k))&&b.blockedResearch.every(k=>!active(w,k))&&[...allChoices].every(k=>!active(w,k)||chosen.includes(k)));
  assert(t.researchGoals.every(k=>active(w,k))&&!(t.inactiveResearch||[]).some(k=>active(w,k)));
  const m=budget(actions);assert(m.ok,m.errors.join('; '));
  const input={body:r.body,history:new Set(state.history.keys()),historyKnown:state.historyKnown===true,active:a,raw:f.raw,capRaw:f.capRaw};
  const q=scope.assess(input,b,w);
  const record={...receipt,status:q.closed?'FIXED_BODY_CLOSURE_CANDIDATE':'OPEN_FIXED_BODY',stateHash:exactWorld(w),cap:f.permanentCapVector,raw:f.raw,traits:r.traits,rank:r.rank,openRules:q.open,openGrowth:q.openGrowth,unknownRules:q.unknownRules,missingResearch:q.missingResearch,blocked:q.blocked,alternativeObjectives:q.alternatives,repeatProofs:q.repeats,budget:m};
  if(q.closed){
   const independent=replay.replay(actions);assert.equal(exactWorld(independent),exactWorld(w));
   const qq=scope.assess(input,b,independent);assert(qq.closed);assert.deepEqual(qq.blocked,q.blocked);
   const certificate={schema:'ATLAS_OVERCAP_FIXED_BODY_CLOSURE_CANDIDATE_V1',scope:SCOPE,sourceMetadataSha256:source.sourceMetadataSha256,sourceLedgerHash:terminal.sourceLedgerHash,terminalRuleHash:source.terminalRuleHash,ruleFingerprints:fingerprints,sourceCatalogHash:hash(catalog),rankPolicy:RANK_POLICY.id,sourceActionHash:r.fullActionHash,stateHash:exactWorld(w),branch:r.branch,difficulty:r.difficulty,target:r.target,terminalGoals:t.researchGoals,body:r.body,rank:r.rank,history:r.history,traits:r.traits,raw:r.raw,cap:f.permanentCapVector,activeResearch:sort(a),disabledResearch:sort(w.disabled),openRules:[],openGrowth:false,unknownRules:[],blocked:q.blocked,alternativeObjectives:q.alternatives,independentReplay:true,material:m,actualGameCertified:false,finalAdmission:false};
   const proofHash=hash(certificate);closed.push({id:'OVERCAP-FIXED-CLOSURE:'+hash([r.id,proofHash]),seedId:r.id,sourceTerminalId:receipt.sourceTerminalId,origin:r.origin,body:r.body,branch:r.branch,difficulty:r.difficulty,target:r.target,sourceActionHash:r.fullActionHash,proofHash,certificate,finalAdmission:false});
   record.proofHash=proofHash;
  }
  records.push(record);
 }catch(e){errors.push({...receipt,error:e.message});}
}
const groups=new Map();for(const c of closed){const p=c.certificate,k=hash([c.origin,c.body,c.branch,c.difficulty,c.target,p.raw,p.cap,p.rank,p.traits.map(([id])=>id),p.history.map(([id])=>id),p.activeResearch,p.disabledResearch]);const a=groups.get(k)||[];a.push(c.id);groups.set(k,a);}
const report={schema:'ATLAS_OVERCAP_FIXED_BODY_CLOSURE_LEDGER_V1',scope:SCOPE,sourceMetadataSha256:source.sourceMetadataSha256,sourceLedgerHash:terminal.sourceLedgerHash,terminalSourceHash:hash(terminal),trainingSourceHash:hash(training),terminalRuleHash:source.terminalRuleHash,sourceCatalogHash:hash(catalog),fingerprints,batch:{offset,limit,total:allInputs.length},summary:{body:wanted,inputs:inputs.length,replayed:records.length,closedCandidates:closed.length,coveredTerminalSeeds:new Set(closed.map(r=>r.sourceTerminalId)).size,displayGroups:groups.size,open:records.filter(r=>r.status==='OPEN_FIXED_BODY').length,irreversibleProofs:records.reduce((n,r)=>n+r.blocked.filter(x=>x.reason==='IRREVERSIBLE_INDEXED_RESEARCH_EXCLUSION').length,0),repeatProofs:records.reduce((n,r)=>n+r.repeatProofs.length,0),errors:errors.length,finalAdmission:0},modelScope:'Fixed final body, selected victory research and cap-restored item-free repeat fixed points. Other bodies and unknown paths stay separate. This is an input to, not a replacement for, canonical final admission.',records,closed,displayGroups:Object.fromEntries(groups),errors};
const file='public/data/soldier-overcap-fixed-body-closure-'+wanted.replace('STR_SOLDIER_','')+'-'+offset+'.json';fs.writeFileSync(file,JSON.stringify(report)+'\n');console.log(JSON.stringify({file,summary:report.summary,records:records.map(r=>({seed:r.seedId,origin:r.origin,status:r.status,open:r.openRules.map(x=>x.id),irreversible:r.blocked.filter(x=>x.reason==='IRREVERSIBLE_INDEXED_RESEARCH_EXCLUSION').map(x=>x.id),repeat:r.repeatProofs.map(x=>x.id)})),errors}));
