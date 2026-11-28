// Staged obstacle production from exact terminal research/training endpoints.
// All successful research transactions survive an unresolved final goal.
import fs from 'node:fs';
import {readTrainingLedger} from './overcap-training-ledger-store.mjs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {defaultRankData} from './population-frontier-default-rank.mjs';
import {createCareerReplay} from './population-chronological-career-core.mjs';
import {member,exactWorld} from './population-growth-replay-core.mjs';
import {createFirstSuccessorIndex} from './atlas-first-successor-obligations.mjs';
import {createRepeatQuotient} from './final-career-repeat-quotient.mjs';
import {createStagedResearch} from './population-recruitment-staged-research.mjs';
import {createResearchFragmentIndex} from './population-research-fragments-v2-ready.mjs';
import {createBranchContextResearchPlanner} from '../public/soldiers/modern/foundation-research-planner-context-v3-branch.js';
import {auditOriginCampaignContext} from '../public/soldiers/modern/origin-campaign-context.js';
import {deterministicRule} from './population-scalar-upper-bound.mjs';
import {STAT_KEYS} from '../public/soldiers/modern/eligibility.js';
const read=p=>JSON.parse(fs.readFileSync(p,'utf8')),hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const arg=(k,d)=>process.argv.find(x=>x.startsWith('--'+k+'='))?.slice(k.length+3)??d;
const num=(k,d,min,max)=>{const n=Number(arg(k,d));assert(Number.isSafeInteger(n)&&n>=min&&n<=max,k);return n;};
const active=(w,k)=>w.researched.has(k)&&!w.disabled.has(k),sort=x=>[...x].sort(),sum=x=>x.reduce((a,b)=>a+b,0);
const source=read('tools/data/overcap-terminal-source-v1.json'),base=read('public/data/soldier-overcap-expanded-lifecycle.json'),next=read('public/data/soldier-overcap-direct-successors.json'),terminal=read('public/data/soldier-overcap-terminal-continuations.json'),training=readTrainingLedger(arg('resume','')?read(arg('resume','')).trainingSourceHash:null),material=read('public/data/soldier-overcap-successor-material-ledger.json');
const d=defaultRankData(read('public/data/soldiers-modern-index.json')).data;
d.originRows=read('public/data/soldier-acquisition-progression-20261102.json').rows;d.sourceItemIds=new Set(read('public/data/soldier-source-catalog.json').itemIds);
assert.equal(source.sourceMetadataSha256,d.meta.source.metadataSha256);assert.equal(next.sourceHash,hash(base));assert.equal(terminal.sourceHash,hash(next));assert.equal(terminal.terminalSourceHash,hash(source));assert.equal(training.sourceHash,hash(terminal));assert.equal(material.inputs.lifecycle.canonicalJsonSha256,hash(next));
const parents=new Map(base.results.map(r=>[r.id,r])),children=new Map(next.rows.map(r=>[r.id,r])),term=new Map(terminal.rows.map(r=>[r.id,r])),tr=new Map(training.rows.map(r=>[r.id,r])),mats=new Map(material.rows.map(r=>[r.id,r])),branches=new Map(source.branches.map(b=>[b.id,b])),targets=new Map(source.terminalRule.targets.map(t=>[t.id,t]));
const commit=b=>[...new Set([...b.captain,...Object.values(b.choices||{})].filter(Boolean))],allChoice=new Set(source.branches.flatMap(commit));
const replay=createCareerReplay(d),first=createFirstSuccessorIndex(d),quotient=createRepeatQuotient(d),fragments=createResearchFragmentIndex(d);
const finite=new Map(Object.values(material.catalog).filter(c=>c.cap!=null).map(c=>[c.id,c]));finite.set(material.confirmedReferencePool.id,material.confirmedReferencePool);
for(const r of base.results)fragments.add(r.actions,r.id);
for(const r of next.rows)fragments.add(r.suffix,r.id);
for(const r of terminal.rows)fragments.add(r.suffix,r.id);
for(const r of training.rows)fragments.add(r.suffix,r.id);
function fullFor(r){const t=r.sourceTerminalId?term.get(r.sourceTerminalId):r,c=children.get(t.sourceRecordId),p=parents.get(t.parentRecordId);const a=[...p.actions,...c.suffix,...t.suffix,...(r.sourceTerminalId?r.suffix:[])];assert.equal(hash(a),r.fullActionHash);return a;}
function snap(w){const s=member(w).state,f=replay.finish(w);return {body:s.soldierType,rank:s.rank,raw:f.raw,effective:f.permanentVector,capRaw:f.capRaw,cap:f.permanentCapVector,traits:[...s.bonusCounts].sort(),history:[...s.history].sort(),activeResearch:sort([...w.researched].filter(k=>active(w,k))),disabledResearch:sort(w.disabled)};}
function permitted(w,b,t){const keep=commit(b);return keep.every(k=>active(w,k))&&b.blockedResearch.every(k=>!active(w,k))&&[...allChoice].every(k=>!active(w,k)||keep.includes(k))&&t.researchGoals.every(k=>active(w,k))&&!(t.inactiveResearch||[]).some(k=>active(w,k));}
function budget(actions){
 const given={},used={},events=new Set(),errors=[];
 const add=(a,k,n)=>{if(finite.has(k))a[k]=(a[k]||0)+n;};
 for(const a of actions){
  if(a.type==='eventResearch')events.add(a.event);
  if(a.type==='externalInputs')for(const [k,n] of Object.entries(a.items||{})){add(given,k,n);if(k==='STR_CAPTAINS_11_TOKEN'&&!events.has('STR_CAPTAINS_11'))errors.push('captain source missing');}
  if(a.type==='transform')for(const [k,n] of Object.entries(replay.rules.get(a.transform)?.requiredItems||{}))add(used,k,n);
  if(a.type==='recruit')for(const [k,n] of Object.entries(d.profiles.find(p=>p.id===a.profile)?.acquisitionRequiredItems||{}))add(used,k,n);
  if(a.type==='research'||a.type==='repeatResearch'){const r=d.researchRules[a.id];if(r?.needItem&&r.destroyItem)add(used,r.neededItem||a.id,1);}
 }
 for(const [k,c] of finite)if(Math.max(given[k]||0,used[k]||0)>c.cap)errors.push(k+': '+Math.max(given[k]||0,used[k]||0)+'/'+c.cap);
 return {ok:!errors.length,errors,given,used,scope:'known indexed finite pools only'};
}
function repeatProof(w,r){
 const state=member(w).state,body=replay.bodies.get(state.soldierType);
 if(!r||!r.allowsLiveSoldiers||!state.history.has(r.id)||!quotient.proof.safeHistory.includes(r.id)||Object.keys(r.requiredItems||{}).length||Object.keys(r.requiredCommendations||{}).length||r.reset||r.resetRank||r.removeTransformations?.length||r.createsClone||r.producedItem||r.producedSoldierType&&r.producedSoldierType!==state.soldierType||!deterministicRule(r,[body])||(first.byBody.get(state.soldierType)||[]).some(q=>q.requiredMaxStats))return null;
 try{
  const a=replay.transform({world:w,steps:[]},r);if(!a)return null;const z=replay.grow(a);
  assert(z.steps.every(a=>['transform','externalInputs','conditionalCapGrowth'].includes(a.type)));assert(z.steps.filter(a=>a.type==='transform').length===1);
  assert(z.steps.filter(a=>a.type==='externalInputs').every(a=>!Object.keys(a.items||{}).length&&!(a.functions||[]).length));
  assert.equal(exactWorld(replay.replay(z.steps,w)),exactWorld(z.world));
  const norm=v=>{const q=structuredClone(v);q.funds=0;return quotient.project(q);};
  assert.equal(norm(w),norm(z.world));const before=snap(w),after=snap(z.world);
  for(const k of ['raw','effective','capRaw','cap','rank','activeResearch','disabledResearch'])assert.deepEqual(before[k],after[k]);
  return {id:r.id,policy:'CAP_RESTORED_REPEAT_NO_ITEM_V1',before:exactWorld(w),after:exactWorld(z.world),quotient:norm(w),actions:z.steps,ruleHash:hash(r),cost:r.cost||0,notFinalAdmission:true};
 }catch{return null;}
}
function inventory(w,b){
 const s=member(w).state,f=replay.finish(w),act=new Set([...w.researched].filter(k=>active(w,k))),q=first.assess({body:s.soldierType,history:new Set(s.history.keys()),historyKnown:s.historyKnown===true,active:act,raw:f.raw,capRaw:f.capRaw}),keep=commit(b),forbidden=new Set([...b.blockedResearch,...[...allChoice].filter(k=>!keep.includes(k))]);
 const open=[],excluded=[],other=[],repeats=[];
 for(const x of q.open){const r=replay.rules.get(x.id);if(x.missingResearch.some(k=>forbidden.has(k))){excluded.push(x);continue;}if(x.destination!==s.soldierType||x.clone||r?.producedItem){other.push(x);continue;}const p=!x.missingResearch.length&&repeatProof(w,r);if(p)repeats.push(p);else open.push(x);}
 return {open,excluded,other,repeats,unknown:q.unknownRules,openGrowth:q.openGrowth,historyKnown:s.historyKnown===true,firstInventoryClosed:s.historyKnown===true&&!q.openGrowth&&!q.unknownRules.length&&!open.length,finalAdmission:false};
}
const body=arg('body','STR_SOLDIER_CHORT'),goal=arg('goal','STR_BRIDES_TO_THE_QUEEN'),rule=replay.rules.get(goal);assert(rule,'unknown transformation');
const allowTradeoffs=arg('allow-tradeoffs','0');assert(['0','1'].includes(allowTradeoffs));
const all=[...terminal.rows,...training.rows].filter(r=>r.body===body&&r.conditionalReplayVerified===true);
const ranked=all.filter(r=>!r.history.some(([k])=>k===goal)).sort((a,b)=>Number(b.history.some(([k])=>k==='STR_PERSONAL_ATTENTION'))-Number(a.history.some(([k])=>k==='STR_PERSONAL_ATTENTION'))||b.traits.length-a.traits.length||b.capTotal-a.capTotal||a.id.localeCompare(b.id));
const distinct=new Map();for(const r of ranked){const k=hash([r.origin,r.branch,r.difficulty,r.activeResearch,r.disabledResearch,r.raw,r.traits.map(([k])=>k),r.history.map(([k])=>k)]);if(!distinct.has(k))distinct.set(k,r);}
const jobs=[...distinct.values()],offset=num('offset',0,0,jobs.length),limit=num('limit',3,1,50),maxCalls=num('calls',20,1,100),attempts=num('attempts',100,1,1000),variant=num('variant',0,0,20);
const prev=arg('resume',''),old=prev?read(prev):null;
if(old){assert.equal(old.schema,'ATLAS_OVERCAP_STAGED_OBSTACLE_V1');assert.equal(old.sourceMetadataSha256,terminal.sourceMetadataSha256);assert.equal(old.sourceLedgerHash,terminal.sourceLedgerHash);assert.equal(old.body,body);assert.equal(old.trainingSourceHash,hash(training));assert.equal(old.terminalSourceHash,hash(terminal));assert.equal(old.goal,goal);for(const r of old.rows)fragments.add(r.suffix,r.id);}
const prior=new Map((old?.rows||[]).map(r=>[r.seedId,r]));
const rows=[],coverage=[],planners=new Map();
for(const j of jobs.slice(offset,offset+limit)){
 const b=branches.get(j.branch),t=targets.get(j.target),full=fullFor(j),receipt={seedId:j.id,origin:j.origin,body:j.body,branch:j.branch,difficulty:j.difficulty,goal,status:'OPEN',produced:false};
 try{
  const original=replay.replay(full);assert(permitted(original,b,t));assert.deepEqual(snap(original).raw,j.raw);assert.deepEqual(snap(original).traits,j.traits);
  const seed=prior.get(j.id);let w=original,steps=[];if(seed){assert.equal(seed.sourceActionHash,j.fullActionHash);assert.equal(seed.suffixHash,hash(seed.suffix));assert.equal(seed.conditionalReplayVerified,true);assert.equal(seed.finalAdmission,false);steps=seed.suffix;w=replay.replay(steps,w);assert.equal(hash([...full,...steps]),seed.fullActionHash);assert(permitted(w,b,t));const s=snap(w);for(const key of ['body','rank','raw','effective','capRaw','cap','traits','history','activeResearch','disabledResearch'])assert.deepEqual(s[key],seed[key],key);}
  const before=snap(original),keep=commit(b),k=j.branch+'|'+j.difficulty+'|'+t.id;
  if(!planners.has(k))planners.set(k,createBranchContextResearchPlanner(d,{difficulty:j.difficulty,maxAttempts:attempts,maxDepth:70,maxSteps:5000,methodLimit:70,collectFailures:true,forbiddenResearch:[...new Set([...b.blockedResearch,...[...allChoice].filter(k=>!keep.includes(k)),...(t.inactiveResearch||[])])],preserveResearch:[...keep,...t.researchGoals]}));
  const p=planners.get(k),accept=(actions,z)=>{const ctx=auditOriginCampaignContext(actions,d);return permitted(z,b,t)&&ctx.kind==='compatible'&&ctx.allowedDifficulties.includes(j.difficulty)&&budget(actions).ok;};
  const required=rule.requires;
  const donor=fragments.propose({world:w,goals:required,planner:p,replay,allowed:(a,z)=>permitted(z,b,t),accept:(tail,z)=>accept([...full,...steps,...tail],z),maxTrials:40,maxChunks:15});
  w=donor.world;steps=[...steps,...donor.steps];
  const staged=createStagedResearch({planner:p,active,accept:(a,z)=>accept(z.steps,z.world),maxCalls,maxDepth:12,variant});
  const progress=staged.run({world:w,steps:[...full,...steps],trace:[],diagnostics:[]},required);
  w=progress.node.world;steps=progress.node.steps.slice(full.length);receipt.staged=progress.stats;receipt.failures=progress.failures.slice(-8);receipt.fragments=donor.metrics;
  let applied=false,transition=null;
  if(required.every(k=>active(w,k))&&!member(w).state.history.has(goal)){
   const a=replay.transform(replay.grow({world:w,steps}),rule);
   if(!a)receipt.transformDecision={status:'TRANSFORM_NOT_REPLAYABLE'};
   else{
    const z=replay.grow(a),end=snap(z.world);
    const delta=Object.fromEntries(STAT_KEYS.map((k,i)=>[k,end.cap[i]-before.cap[i]])),rawDelta=Object.fromEntries(STAT_KEYS.map((k,i)=>[k,end.raw[i]-before.raw[i]]));
    const losses=STAT_KEYS.filter(k=>delta[k]<0),gains=STAT_KEYS.filter(k=>delta[k]>0),historyAdded=(new Map(end.history).get(goal)||0)>(new Map(before.history).get(goal)||0);
    const eligible=end.body===j.body&&before.traits.every(([k,n])=>(new Map(end.traits).get(k)||0)>=n)&&historyAdded,contextOK=accept([...full,...z.steps],z.world);
    transition={policy:losses.length?'EXPLICIT_CONDITIONAL_TRADEOFF_V1':'MONOTONE_CAP_V1',delta,rawDelta,gains,losses,historyAdded,capGain:sum(end.cap)-sum(before.cap)};
    receipt.transformDecision={...transition,status:!eligible?'BODY_TRAIT_OR_HISTORY_REJECTED':!contextOK?'CONTEXT_OR_MATERIAL_REJECTED':losses.length&&allowTradeoffs!=='1'?'TRADEOFF_FILTERED':'APPLIED'};
    if(eligible&&contextOK&&(!losses.length||allowTradeoffs==='1')){assert.equal(exactWorld(replay.replay(z.steps,original)),exactWorld(z.world));w=z.world;steps=z.steps;applied=true;}
   }
  }
  if(steps.length||required.every(k=>active(w,k))){
   assert.equal(exactWorld(replay.replay(steps,original)),exactWorld(w));assert(accept([...full,...steps],w));
   const end=snap(w),inv=inventory(w,b),remaining=required.filter(k=>!active(w,k));
   const row={id:'OVERCAP-STAGED:'+hash([j.id,goal,steps]),seedId:j.id,seedKind:j.sourceTerminalId?'terminalTraining':'terminalResearch',origin:j.origin,body:j.body,branch:j.branch,difficulty:j.difficulty,target:j.target,goal,sourceActionHash:j.fullActionHash,suffix:steps,suffixHash:hash(steps),fullActionHash:hash([...full,...steps]),...end,addedResearch:end.activeResearch.filter(k=>!before.activeResearch.includes(k)),remaining,applied,...(applied&&transition?.policy==='EXPLICIT_CONDITIONAL_TRADEOFF_V1'?{transition}:{}),capGain:sum(end.cap)-sum(before.cap),inventory:inv,budget:budget([...full,...steps]),conditionalReplayVerified:true,actualGameCertified:false,materialBudgetVerified:false,finalAdmission:false,commendationStatsIncluded:false,status:applied?(transition?.policy==='EXPLICIT_CONDITIONAL_TRADEOFF_V1'?'CONDITIONAL_STAGED_TRADEOFF_TRANSFORMATION':'PRODUCTIVE_STAGED_TRANSFORMATION'):remaining.length?'CONCRETE_PARTIAL_RESEARCH':'RESEARCH_READY_TRANSFORMATION_OPEN'};
   rows.push(row);receipt.status=row.status;receipt.produced=true;receipt.row=row.id;
  }else receipt.status='OPEN_SEARCH_LIMIT';
 }catch(e){receipt.error=e.message;receipt.status='ERROR';}
 coverage.push(receipt);
}
const report={schema:'ATLAS_OVERCAP_STAGED_OBSTACLE_V1',sourceMetadataSha256:source.sourceMetadataSha256,sourceLedgerHash:terminal.sourceLedgerHash,terminalSourceHash:hash(terminal),trainingSourceHash:hash(training),goal,body,scope:'Exact staged research and selected live transformation, repeat proofs for item-free fixed points only. No final admission.',batch:{offset,limit,maxCalls,attempts,variant,total:jobs.length,...(allowTradeoffs==='1'?{allowTradeoffs:true}:{}),...(prev?{resumePath:prev,resumeHash:hash(old)}:{})},summary:{attempted:coverage.length,produced:rows.length,transformations:rows.filter(r=>r.applied).length,tradeoffTransformations:rows.filter(r=>r.applied&&r.transition?.policy==='EXPLICIT_CONDITIONAL_TRADEOFF_V1').length,researchReady:rows.filter(r=>!r.remaining.length).length,partial:rows.filter(r=>r.remaining.length).length,repeatProofs:rows.reduce((n,r)=>n+r.inventory.repeats.length,0),firstInventoryClosed:rows.filter(r=>r.inventory.firstInventoryClosed).length,errors:coverage.filter(r=>r.error).length,finalAdmission:0},coverage,rows};
const file='public/data/soldier-overcap-staged-'+body.replace('STR_SOLDIER_','')+'-'+goal.replace('STR_','')+'-'+offset+'-v'+variant+(allowTradeoffs==='1'?'-tradeoff':'')+'.json';
fs.writeFileSync(file,JSON.stringify(report)+'\n');console.log(JSON.stringify({file,summary:report.summary,rows:rows.map(r=>({origin:r.origin,added:r.addedResearch.length,remaining:r.remaining,applied:r.applied,capGain:r.capGain,repeats:r.inventory.repeats.map(p=>p.id),open:r.inventory.open.map(x=>x.id)})),coverage:coverage.map(r=>({origin:r.origin,status:r.status,error:r.error,failures:r.failures?.slice(-2)}))}));
