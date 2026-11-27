// Produce terminal-research continuations from exact, already recruited endpoints.
// This is not victory, material acquisition, or final admission.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {defaultRankData,RANK_POLICY} from './population-frontier-default-rank.mjs';
import {createCareerReplay} from './population-chronological-career-core.mjs';
import {member,exactWorld} from './population-growth-replay-core.mjs';
import {createFirstSuccessorIndex} from './atlas-first-successor-obligations.mjs';
import {createBranchResearchExclusion} from './atlas-branch-research-exclusion.mjs';
import {createBranchContextResearchPlanner} from '../public/soldiers/modern/foundation-research-planner-context-v3-branch.js';
import {auditOriginCampaignContext} from '../public/soldiers/modern/origin-campaign-context.js';
import {expandOvercapSuccessor} from '../public/branch-soldier-overcap-successor-core.js';

const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const arg=(k,d)=>process.argv.find(x=>x.startsWith('--'+k+'='))?.slice(k.length+3)??d;
const num=(k,d,min,max)=>{const n=Number(arg(k,d));assert(Number.isSafeInteger(n)&&n>=min&&n<=max,'invalid '+k);return n;};
const sort=a=>[...a].sort(),active=(w,k)=>w.researched.has(k)&&!w.disabled.has(k);
const source=read('tools/data/overcap-terminal-source-v1.json'),life=read('public/data/soldier-overcap-expanded-lifecycle.json'),next=read('public/data/soldier-overcap-direct-successors.json'),materials=read('public/data/soldier-overcap-successor-material-ledger.json');
const data=defaultRankData(read('public/data/soldiers-modern-index.json')).data;
data.originRows=read('public/data/soldier-acquisition-progression-20261102.json').rows;
data.sourceItemIds=new Set(read('public/data/soldier-source-catalog.json').itemIds);
assert.equal(source.schema,'ATLAS_OVERCAP_TERMINAL_SOURCE_V1');assert.equal(source.terminalRuleHash,hash(source.terminalRule));
assert.equal(source.sourceMetadataSha256,data.meta.source.metadataSha256);assert.equal(next.sourceMetadataSha256,source.sourceMetadataSha256);assert.equal(next.sourceHash,hash(life));assert.equal(materials.inputs.lifecycle.canonicalJsonSha256,hash(next));assert.equal(materials.inputs.baseLifecycle.canonicalJsonSha256,hash(life));
const parents=new Map(life.results.map(r=>[r.id,r])),children=new Map(next.rows.map(r=>[r.id,r])),mat=new Map(materials.rows.map(r=>[r.id,r])),branches=new Map(source.branches.map(b=>[b.id,b]));
const commit=b=>[...new Set([...(b.captain||[]),...Object.values(b.choices||{})].filter(Boolean))];
const allChoices=new Set(source.branches.flatMap(commit));
const replay=createCareerReplay(data),first=createFirstSuccessorIndex(data),exclusion=createBranchResearchExclusion(data);
const finite=new Map(Object.values(materials.catalog).filter(c=>c.cap!=null).map(c=>[c.id,c]));
finite.set(materials.confirmedReferencePool.id,materials.confirmedReferencePool);
const targets=source.terminalRule.targets, targetIds=new Set(targets.map(t=>t.id));
const targetFilter=arg('target','');const selectedTargets=targetFilter?targets.filter(t=>t.id===targetFilter||t.id.includes(targetFilter)):targets;
assert(selectedTargets.length);
const jobs=next.terminalCandidates.map(c=>({...c,traitCount:children.get(c.id).traits.length,total:children.get(c.id).capTotal})).sort((a,b)=>a.branch.localeCompare(b.branch)||b.traitCount-a.traitCount||b.total-a.total||a.id.localeCompare(b.id));
assert.equal(jobs.length,next.summary.activeBranchPairs);
const offset=num('offset',0,0,jobs.length),limit=num('limit',4,1,200),attempts=num('attempts',180,1,2000),calls=num('calls',3,1,20),partialCalls=num('partial',2,0,10);
const selected=jobs.slice(offset,offset+limit),plannerCache=new Map(),rows=[],coverage=[],donors=[];
const previous=arg('donor','');
if(previous){const d=read(previous);assert.equal(d.sourceHash,hash(next));assert.equal(d.terminalSourceHash,hash(source));for(const r of d.rows)if(r.status==='CONDITIONAL_TERMINAL_RESEARCH_READY')donors.push(r);}
const metrics={seeds:0,seedErrors:0,plannerCalls:0,researchAttempts:0,donorTrials:0,donorReplays:0,ready:0,partial:0,blocked:0};
function planner(d,b){
 const k=d+'|'+b.id;
 if(!plannerCache.has(k)){
  const keep=commit(b),forbidden=[...new Set([...b.blockedResearch,...[...allChoices].filter(k=>!keep.includes(k))])];
  plannerCache.set(k,createBranchContextResearchPlanner(data,{difficulty:d,maxAttempts:attempts,maxDepth:75,maxSteps:4000,methodLimit:65,collectFailures:true,forbiddenResearch:forbidden,preserveResearch:keep}));
 }
 return plannerCache.get(k);
}
function branchOK(w,b){const keep=commit(b);return keep.every(k=>active(w,k))&&b.blockedResearch.every(k=>!active(w,k))&&[...allChoices].every(k=>!active(w,k)||keep.includes(k));}
function snapshot(w){const m=member(w),f=replay.finish(w);return {body:m.state.soldierType,rank:m.state.rank,raw:f.raw,effective:f.permanentVector,capRaw:f.capRaw,cap:f.permanentCapVector,traits:[...m.state.bonusCounts].sort(),history:[...m.state.history].sort(),activeResearch:sort([...w.researched].filter(k=>active(w,k))),disabledResearch:sort(w.disabled)};}
function materialCheck(steps,base){
 const supplied=Object.fromEntries(base.materials.filter(m=>m.pool||finite.has(m.id)).map(m=>[m.id,m.external]));
 const used=Object.fromEntries(base.materials.filter(m=>m.pool||finite.has(m.id)).map(m=>[m.id,m.gross]));
 const added={},unknown=new Set();
 for(const a of steps){
  if(a.type==='externalInputs')for(const [k,n] of Object.entries(a.items||{})){
   assert(Number.isSafeInteger(n)&&n>=0);
   added[k]=(added[k]||0)+n;
   if(finite.has(k))supplied[k]=(supplied[k]||0)+n;
   if(!data.itemSupply[k]||materials.catalog[k]?.kind==='SOURCE_UNRESOLVED')unknown.add(k);
  }
  if(a.type==='research'||a.type==='repeatResearch'){const r=data.researchRules[a.id];if(r?.needItem&&r.destroyItem){const k=r.neededItem||a.id;if(finite.has(k))used[k]=(used[k]||0)+1;}}
 }
 const over=[...finite].filter(([k,c])=>Math.max(supplied[k]||0,used[k]||0)>c.cap).map(([k,c])=>({id:k,cap:c.cap,supplied:supplied[k]||0,consumed:used[k]||0}));
 return {ok:!over.length,over,addedExternalItems:added,unknownNewExternalItems:sort(unknown),finiteSupplyStillConditional:true};
}
function openRules(w,b){
 const s=member(w).state,f=replay.finish(w),act=new Set([...w.researched].filter(k=>active(w,k))),hist=new Set(s.history.keys());
 const q=first.assess({body:s.soldierType,history:hist,historyKnown:s.historyKnown===true,active:act,raw:f.raw,capRaw:f.capRaw});
 const forbidden=new Set([...allChoices].filter(k=>!commit(b).includes(k))),open=[],modelExcluded=[],otherBody=[];
 for(const x of q.open){
  const r=replay.rules.get(x.id),direct=x.missingResearch.filter(k=>forbidden.has(k)||b.blockedResearch.includes(k));
  const proofs=x.missingResearch.map(k=>exclusion.prove(k,forbidden,act)).filter(Boolean);
  if(direct.length||proofs.length){modelExcluded.push({id:x.id,direct,proofs});continue;}
  if(x.destination!==s.soldierType||x.clone||r?.producedItem){otherBody.push(x);continue;}
  open.push(x);
 }
 return {scope:'FIRST_SUCCESSOR_INVENTORY_ONLY',open,modelExcluded,otherBody,blocked:q.blocked,unknownRules:q.unknownRules,openGrowth:q.openGrowth,historyKnown:s.historyKnown===true,closed:false};
}
function suffixFrom(result,baseSteps){return result.node.steps.slice(baseSteps.length);}
function verifyTail(w,tail,b){
 let v=w;
 for(const a of tail){
  const before=v;v=replay.apply(v,a);
  if(!branchOK(v,b)||[...v.researched].some(k=>!before.researched.has(k)&&b.blockedResearch.includes(k)))throw Error('branch changed during replay');
 }
 if(v.pendingFree)throw Error('pending free award');
 return v;
}
function targetReady(w,t){return t.researchGoals.every(k=>active(w,k))&&!(t.inactiveResearch||[]).some(k=>active(w,k));}
function publish(job,child,parent,base,w,tail,t,receipt,status){
 const full=[...parent.actions,...child.suffix,...tail],end=snapshot(w),ctx=auditOriginCampaignContext(full,data),budget=materialCheck(tail,base);
 assert.equal(ctx.kind,'compatible');assert(ctx.allowedDifficulties.includes(job.difficulty));assert(budget.ok);
 assert.deepEqual(end.raw,child.raw);assert.deepEqual(end.effective,child.effective);assert.deepEqual(end.traits,child.traits);assert.deepEqual(end.history,child.history);assert.equal(end.rank,child.rank);assert.equal(end.body,child.body);
 const b=branches.get(job.branch),a=targetReady(w,t);assert(branchOK(w,b));assert.equal(a,status==='CONDITIONAL_TERMINAL_RESEARCH_READY');
 const r={id:'OVERCAP-TERMINAL:'+hash([child.id,b.id,t.id,tail]),sourceRecordId:child.id,parentRecordId:parent.id,origin:job.origin,body:job.body,branch:b.id,difficulty:job.difficulty,target:t.id,requiredResearch:t.researchGoals,remaining:t.researchGoals.filter(k=>!active(w,k)),inactiveConflict:(t.inactiveResearch||[]).filter(k=>active(w,k)),addedResearch:end.activeResearch.filter(k=>!child.activeResearch.includes(k)),suffix:tail,suffixHash:hash(tail),sourceActionHash:child.fullActionHash,fullActionHash:hash(full),...end,capTotal:end.cap.reduce((a,b)=>a+b,0),material:budget,terminalAcquisitionRequiredItems:t.requiredItems||{},terminalBaseFunctions:t.baseFunctions||[],firstSuccessorInventory:openRules(w,b),status,conditionalReplayVerified:true,actualGameCertified:false,materialBudgetVerified:false,finalAdmission:false,commendationStatsIncluded:false};
 rows.push(r);receipt.produced.push(r.id);
 if(a){metrics.ready++;donors.push(r);}else metrics.partial++;
 return r;
}
for(const job of selected){
 const child=children.get(job.id),parent=parents.get(child.sourceRecordId),base=mat.get(child.id),b=branches.get(job.branch);
 const receipt={id:job.id,branch:job.branch,origin:job.origin,body:job.body,difficulty:job.difficulty,sourceActionHash:job.fullActionHash,produced:[],attempts:[],seedReplayVerified:false,finalAdmission:false,status:'OPEN'};
 try{
  assert(parent&&base&&b);const expanded=expandOvercapSuccessor(parent,child);assert.equal(hash(expanded.actions),job.fullActionHash);
  const w=replay.replay(expanded.actions);assert(branchOK(w,b),'seed branch incompatible');const s=snapshot(w);
  assert.deepEqual(s.raw,child.raw);assert.deepEqual(s.traits,child.traits);assert.deepEqual(s.activeResearch,child.activeResearch);assert.deepEqual(s.disabledResearch,child.disabledResearch);
  receipt.seedReplayVerified=true;metrics.seeds++;
  const p=planner(job.difficulty,b);let callsLeft=calls,partialLeft=partialCalls,done=false;
  const ordered=selectedTargets.slice().sort((a,z)=>a.researchGoals.filter(k=>!active(w,k)).length-z.researchGoals.filter(k=>!active(w,k)).length||Number(a.kind==='FINAL_DESTINATION')-Number(z.kind==='FINAL_DESTINATION')||a.id.localeCompare(z.id));
  for(const t of ordered){
   if(done)break;
   if(t.researchGoals.some(k=>b.blockedResearch.includes(k)||allChoices.has(k)&&!commit(b).includes(k))){receipt.attempts.push({target:t.id,reason:'SELECTED_BRANCH_MODEL_EXCLUDED'});continue;}
   if((t.inactiveResearch||[]).some(k=>active(w,k))){receipt.attempts.push({target:t.id,reason:'TARGET_INACTIVE_CONFLICT'});continue;}
   if(targetReady(w,t)){publish(job,child,parent,base,w,[],t,receipt,'CONDITIONAL_TERMINAL_RESEARCH_READY');done=true;break;}
   for(const d of donors.filter(d=>d.branch===b.id&&d.difficulty===job.difficulty&&d.target===t.id).slice(0,3)){
    metrics.donorTrials++;
    try{const v=verifyTail(w,d.suffix,b);if(!targetReady(v,t)||!materialCheck(d.suffix,base).ok)continue;publish(job,child,parent,base,v,d.suffix,t,receipt,'CONDITIONAL_TERMINAL_RESEARCH_READY');metrics.donorReplays++;done=true;break;}catch{}
   }
   if(done)break;if(callsLeft<=0)continue;callsLeft--;metrics.plannerCalls++;
   const start={world:w,steps:expanded.actions,trace:[],diagnostics:[]},res=p.ensureProgress(t.researchGoals,start);
   let progressNode=null,progressLength=0;
   metrics.researchAttempts+=res.attempts||0;
   if(res.ok){
    const tail=suffixFrom(res,expanded.actions);
    try{const v=verifyTail(w,tail,b);assert.equal(exactWorld(v),exactWorld(res.node.world));if(!targetReady(v,t))throw Error('target not ready');publish(job,child,parent,base,v,tail,t,receipt,'CONDITIONAL_TERMINAL_RESEARCH_READY');done=true;break;}catch(e){receipt.attempts.push({target:t.id,reason:'REPLAY_OR_MATERIAL_BLOCKED',detail:e.message});}
   }else{
    receipt.attempts.push({target:t.id,reason:res.reason,unresolved:res.unresolved,remaining:res.remaining,gained:res.gained,attempts:res.attempts,deadEnds:res.deadEnds?.slice(-5)||[]});
    if(res.status==='PARTIAL')try{
     const tail=suffixFrom(res,expanded.actions),v=verifyTail(w,tail,b);
     assert.equal(exactWorld(v),exactWorld(res.node.world));
     if(targetReady(v,t)){publish(job,child,parent,base,v,tail,t,receipt,'CONDITIONAL_TERMINAL_RESEARCH_READY');done=true;break;}
     publish(job,child,parent,base,v,tail,t,receipt,'CONDITIONAL_TERMINAL_RESEARCH_PARTIAL');
     progressNode=res.node;progressLength=tail.length;
    }catch(e){receipt.attempts.push({target:t.id,reason:'GOAL_PROGRESS_REPLAY_BLOCKED',detail:e.message});}
   }
   // Preserve actual progress toward direct prerequisites; never a guessed
   // completion or proof that the failed target is impossible.
   if(partialLeft>0){
    let n=progressNode||start,tail=n.steps.slice(expanded.actions.length);
    const deps=[...new Set(t.researchGoals.filter(k=>!active(n.world,k)).flatMap(k=>data.researchRules[k]?.dependencies||[]))].filter(k=>!active(n.world,k)&&!b.blockedResearch.includes(k));
    for(const goal of deps.slice(0,3)){
     if(partialLeft<=0)break;partialLeft--;metrics.plannerCalls++;
     const a=p.ensure([goal],n);metrics.researchAttempts+=a.attempts||0;
     if(a.ok&&t.researchGoals.every(k=>!active(n.world,k)||active(a.node.world,k))){n=a.node;tail=n.steps.slice(expanded.actions.length);}
     else if(a.ok)receipt.attempts.push({target:t.id,goal,reason:'GOAL_PROGRESS_LOST'});
     else receipt.attempts.push({target:t.id,goal,reason:a.reason,unresolved:a.unresolved,attempts:a.attempts});
    }
    if(tail.length>progressLength)try{
     const v=verifyTail(w,tail,b);assert.equal(exactWorld(v),exactWorld(n.world));
     if(targetReady(v,t)){publish(job,child,parent,base,v,tail,t,receipt,'CONDITIONAL_TERMINAL_RESEARCH_READY');done=true;break;}
     if([...v.researched].some(k=>active(v,k)&&!active(w,k)))publish(job,child,parent,base,v,tail,t,receipt,'CONDITIONAL_TERMINAL_RESEARCH_PARTIAL');
    }catch(e){receipt.attempts.push({target:t.id,reason:'PARTIAL_REPLAY_BLOCKED',detail:e.message});}
   }
  }
  receipt.status=done?'RESEARCH_READY':receipt.produced.length?'PARTIAL_PROGRESS':'OPEN_SEARCH_LIMIT';if(!done)metrics.blocked++;
 }catch(e){receipt.status='SEED_OR_WAVE_ERROR';receipt.error=e.message;metrics.seedErrors++;}
 coverage.push(receipt);
}
const report={schema:'ATLAS_OVERCAP_TERMINAL_CONTINUATION_WAVE_V1',sourceMetadataSha256:next.sourceMetadataSha256,sourceLedgerHash:next.sourceLedgerHash,sourceHash:hash(next),terminalSourceHash:hash(source),terminalRuleHash:source.terminalRuleHash,registryCommit:source.registryCommit,rankPolicy:RANK_POLICY.id,scope:'Selected-branch terminal research only. Explicit chronological replay, indexed finite cap checks, first successor inventory; no victory or final admission.',batch:{offset,limit,attempts,calls,partialCalls,targetFilter,total:jobs.length},summary:{...metrics,finalAdmission:0},coverage,rows};
const file='public/data/soldier-overcap-terminal-wave-'+offset+(targetFilter?'-'+targetFilter.replace(/[^a-zA-Z0-9_-]/g,'_'):'')+'.json';fs.writeFileSync(file,JSON.stringify(report)+'\n');
console.log(JSON.stringify({file,summary:report.summary,rows:rows.map(r=>({body:r.body,target:r.target,status:r.status,newResearch:r.addedResearch.length,openRules:r.firstSuccessorInventory.open.length})),blocked:coverage.filter(x=>x.status==='OPEN_SEARCH_LIMIT'||x.error).map(x=>({body:x.body,error:x.error,attempts:x.attempts.map(a=>({target:a.target,goal:a.goal,reason:a.reason,unresolved:a.unresolved}))}))}));
