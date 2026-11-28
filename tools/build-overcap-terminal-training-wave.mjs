// Bounded same-body development AFTER terminal research. No final admission.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {defaultRankData} from './population-frontier-default-rank.mjs';
import {createCareerReplay} from './population-chronological-career-core.mjs';
import {member,exactWorld} from './population-growth-replay-core.mjs';
import {deterministicRule} from './population-scalar-upper-bound.mjs';
import {createFirstSuccessorIndex} from './atlas-first-successor-obligations.mjs';
import {createBranchResearchExclusion} from './atlas-branch-research-exclusion.mjs';
import {createBranchContextResearchPlanner} from '../public/soldiers/modern/foundation-research-planner-context-v3-branch.js';
import {auditOriginCampaignContext} from '../public/soldiers/modern/origin-campaign-context.js';
import {buildTrainingResumeQueue} from './overcap-training-resume-core.mjs';
const read=p=>JSON.parse(fs.readFileSync(p,'utf8')),hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const arg=(k,d)=>process.argv.find(x=>x.startsWith('--'+k+'='))?.slice(k.length+3)??d;
const num=(k,d,min,max)=>{const n=Number(arg(k,d));assert(Number.isSafeInteger(n)&&n>=min&&n<=max,k);return n;};
const sort=x=>[...x].sort(),sum=x=>x.reduce((a,b)=>a+b,0),active=(w,k)=>w.researched.has(k)&&!w.disabled.has(k);
const source=read('tools/data/overcap-terminal-source-v1.json'),life=read('public/data/soldier-overcap-expanded-lifecycle.json'),next=read('public/data/soldier-overcap-direct-successors.json'),terminal=read('public/data/soldier-overcap-terminal-continuations.json'),material=read('public/data/soldier-overcap-successor-material-ledger.json');
const data=defaultRankData(read('public/data/soldiers-modern-index.json')).data;
data.originRows=read('public/data/soldier-acquisition-progression-20261102.json').rows;data.sourceItemIds=new Set(read('public/data/soldier-source-catalog.json').itemIds);
assert.equal(terminal.sourceHash,hash(next));assert.equal(terminal.baseSourceHash,hash(life));assert.equal(terminal.terminalSourceHash,hash(source));assert.equal(data.meta.source.metadataSha256,terminal.sourceMetadataSha256);assert.equal(material.inputs.lifecycle.canonicalJsonSha256,hash(next));
const parents=new Map(life.results.map(r=>[r.id,r])),children=new Map(next.rows.map(r=>[r.id,r])),mat=new Map(material.rows.map(r=>[r.id,r])),branches=new Map(source.branches.map(b=>[b.id,b])),targets=new Map(source.terminalRule.targets.map(t=>[t.id,t]));
const commit=b=>[...new Set([...b.captain,...Object.values(b.choices||{})].filter(Boolean))],allChoice=new Set(source.branches.flatMap(commit));
const replay=createCareerReplay(data),first=createFirstSuccessorIndex(data),exclusion=createBranchResearchExclusion(data),bonuses=new Map(data.bonuses.map(x=>[x.id,x]));
const finite=new Map(Object.values(material.catalog).filter(c=>c.cap!=null).map(c=>[c.id,c]));finite.set(material.confirmedReferencePool.id,material.confirmedReferencePool);
const resumeFile=arg('resume-queue',''),resumeQueue=resumeFile?read(resumeFile):null,resumeByJob=new Map(),checkpointRows=new Map(),knownRows=new Set();
if(resumeQueue){
 const waves=resumeQueue.waves.map(path=>({path,report:read(path)}));
 assert.deepEqual(buildTrainingResumeQueue(waves),resumeQueue,'resume queue differs from source waves');
 assert.equal(resumeQueue.sourceHash,hash(terminal));assert.equal(resumeQueue.terminalSourceHash,hash(source));assert.equal(resumeQueue.sourceLedgerHash,terminal.sourceLedgerHash);assert.equal(resumeQueue.sourceMetadataSha256,terminal.sourceMetadataSha256);
 for(const {report} of waves)for(const row of report.rows){checkpointRows.set(row.id,row);knownRows.add(row.id);}
 for(const c of resumeQueue.checkpoints){const list=resumeByJob.get(c.sourceTerminalId)||[];list.push(c);resumeByJob.set(c.sourceTerminalId,list);}
}
const bodyFilter=arg('body',''),jobs=terminal.rows.filter(r=>r.status==='CONDITIONAL_TERMINAL_RESEARCH_READY'&&(!bodyFilter||r.body===bodyFilter)&&(!resumeQueue||resumeByJob.has(r.id))).sort((a,b)=>a.branch.localeCompare(b.branch)||b.traits.length-a.traits.length||b.capTotal-a.capTotal||a.id.localeCompare(b.id));
const offset=num('offset',0,0,jobs.length),limit=num('limit',5,1,100),attempts=num('attempts',180,1,1000),calls=num('calls',3,0,20),depth=num('depth',3,1,6),width=num('width',2,1,5);
const rows=[],coverage=[],planners=new Map(),donors=new Map(),metrics={seeds:0,seedErrors:0,plannerCalls:0,researchAttempts:0,donorTrials:0,donorReplays:0,transforms:0,productive:0,firstInventoryClosed:0,resumedCheckpoints:0,resumeErrors:0,existingWitnesses:0};
const prev=arg('donor','');if(prev){const d=read(prev);assert.equal(d.sourceHash,hash(terminal));for(const x of d.researchDonors||[])donors.set(x.key,x.actions);}
function allowed(w,b,t){const keep=commit(b);return keep.every(k=>active(w,k))&&b.blockedResearch.every(k=>!active(w,k))&&[...allChoice].every(k=>!active(w,k)||keep.includes(k))&&t.researchGoals.every(k=>active(w,k))&&!(t.inactiveResearch||[]).some(k=>active(w,k));}
function applyTail(w,tail,b,t){let v=w;for(const a of tail){const before=v;v=replay.apply(v,a);if(!allowed(v,b,t)||[...v.researched].some(k=>!before.researched.has(k)&&b.blockedResearch.includes(k)))throw Error('branch or terminal goals lost');}assert(!v.pendingFree);return v;}
function planner(d,b,t){const k=[d,b.id,t.id].join('|');if(!planners.has(k)){const keep=commit(b);planners.set(k,createBranchContextResearchPlanner(data,{difficulty:d,maxAttempts:attempts,maxDepth:65,maxSteps:4500,methodLimit:60,collectFailures:true,forbiddenResearch:[...new Set([...b.blockedResearch,...[...allChoice].filter(k=>!keep.includes(k)),...(t.inactiveResearch||[])])],preserveResearch:[...keep,...t.researchGoals]}));}return planners.get(k);}
function snap(w){const s=member(w).state,f=replay.finish(w);return {body:s.soldierType,rank:s.rank,raw:f.raw,effective:f.permanentVector,capRaw:f.capRaw,cap:f.permanentCapVector,traits:[...s.bonusCounts].sort(),history:[...s.history].sort(),activeResearch:sort([...w.researched].filter(k=>active(w,k))),disabledResearch:sort(w.disabled)};}
function inventory(w,b){const s=member(w).state,f=replay.finish(w),act=new Set([...w.researched].filter(k=>active(w,k)));const q=first.assess({body:s.soldierType,history:new Set(s.history.keys()),historyKnown:s.historyKnown===true,active:act,raw:f.raw,capRaw:f.capRaw});
 const forbidden=new Set([...allChoice].filter(k=>!commit(b).includes(k))),open=[],excluded=[],other=[];
 for(const x of q.open){const r=replay.rules.get(x.id),direct=x.missingResearch.filter(k=>forbidden.has(k)||b.blockedResearch.includes(k)),proofs=x.missingResearch.map(k=>exclusion.prove(k,forbidden,act)).filter(Boolean);
 if(direct.length||proofs.length)excluded.push({id:x.id,direct,proofs});
 else if(x.destination!==s.soldierType||x.clone||r?.producedItem)other.push(x);
 else open.push(x);}
 const closed=s.historyKnown===true&&!q.openGrowth&&!q.unknownRules.length&&!open.length;
 return {scope:'INDEXED_FIRST_ACTION_FIXED_BODY_ONLY',open,excluded,otherBody:other,blocked:q.blocked,openGrowth:q.openGrowth,unknownRules:q.unknownRules,historyKnown:s.historyKnown===true,firstInventoryClosed:closed,finalAdmission:false};
}
function budget(base,tail){
 const supplied=Object.fromEntries(base.materials.filter(m=>finite.has(m.id)).map(m=>[m.id,m.external])),used=Object.fromEntries(base.materials.filter(m=>finite.has(m.id)).map(m=>[m.id,m.gross])),external={},training={},unknown=new Set();
 for(const a of tail){
  if(a.type==='externalInputs')for(const [k,n] of Object.entries(a.items||{})){assert(Number.isSafeInteger(n)&&n>=0);external[k]=(external[k]||0)+n;if(finite.has(k))supplied[k]=(supplied[k]||0)+n;if(!data.itemSupply[k]||material.catalog[k]?.kind==='SOURCE_UNRESOLVED')unknown.add(k);}
  if(a.type==='transform')for(const [k,n] of Object.entries(replay.rules.get(a.transform)?.requiredItems||{})){training[k]=(training[k]||0)+n;if(finite.has(k))used[k]=(used[k]||0)+n;}
  if(a.type==='research'||a.type==='repeatResearch'){const r=data.researchRules[a.id];if(r?.needItem&&r.destroyItem){const k=r.neededItem||a.id;if(finite.has(k))used[k]=(used[k]||0)+1;}}
 }
 const over=[...finite].filter(([k,c])=>Math.max(supplied[k]||0,used[k]||0)>c.cap).map(([k,c])=>({id:k,cap:c.cap,supplied:supplied[k]||0,consumed:used[k]||0}));
 return {ok:!over.length,over,additionalExternalItems:external,additionalTrainingItems:training,unknownNewExternalItems:sort(unknown),finiteAcquisitionNotCertified:true};
}
function options(w,inv){
 const s=member(w).state,body=replay.bodies.get(s.soldierType);
 return inv.open.map(x=>({x,r:replay.rules.get(x.id)})).filter(({r})=>r&&r.allowsLiveSoldiers&&!r.createsClone&&!r.producedItem&&!r.reset&&!r.resetRank&&!r.removeTransformations?.length&&!Object.keys(r.requiredCommendations||{}).length&&deterministicRule(r,[body])).map(({x,r})=>{
  const novel=r.soldierBonusType&&!s.bonusCounts.has(r.soldierBonusType),bs=bonuses.get(r.soldierBonusType)?.stats||{};
  const score=(novel?40+Object.values(bs).reduce((a,b)=>a+Number(b||0),0):0)+Object.values(r.flatOverallStatChange||{}).reduce((a,b)=>a+Number(b||0),0)+(r.id==='STR_BRIDES_TO_THE_QUEEN'?100:0)+(r.id==='STR_NEPOTISM'&&s.history.has(r.id)?-150:0);
  return {x,r,score};
 }).sort((a,b)=>b.score-a.score||Number(!!a.x.missingResearch.length)-Number(!!b.x.missingResearch.length)||a.r.id.localeCompare(b.r.id));
}
for(const job of jobs.slice(offset,offset+limit)){
 const child=children.get(job.sourceRecordId),parent=parents.get(job.parentRecordId),base=mat.get(child.id),b=branches.get(job.branch),t=targets.get(job.target);
 const receipt={id:job.id,body:job.body,origin:job.origin,branch:job.branch,seedReplayVerified:false,produced:[],attempted:[],status:'OPEN_NOT_EXHAUSTED',finalAdmission:false};
 try{
  const full=[...parent.actions,...child.suffix,...job.suffix];assert.equal(hash(full),job.fullActionHash);
  const w=replay.replay(full),s=snap(w);assert(allowed(w,b,t));for(const k of ['raw','effective','traits','history','activeResearch','disabledResearch'])assert.deepEqual(s[k],job[k]);
  receipt.seedReplayVerified=true;metrics.seeds++;
  const seen=new Set([exactWorld(w)]),p=planner(job.difficulty,b,t);let remaining=calls,frontier=[{world:w,steps:[]}];
  if(resumeQueue){
   frontier=[];receipt.resumeCheckpoints=[];
   for(const c of resumeByJob.get(job.id)||[])try{
    const row=checkpointRows.get(c.checkpointId);
    assert(row&&row.sourceTerminalId===job.id&&row.sourceRecordId===child.id&&row.parentRecordId===parent.id&&row.branch===b.id&&row.target===t.id&&row.difficulty===job.difficulty);
    assert.equal(row.sourceActionHash,job.fullActionHash);assert.equal(row.suffixHash,hash(row.suffix));assert.equal(row.fullActionHash,hash([...full,...row.suffix]));assert.equal(row.id,'OVERCAP-END-NEXT:'+hash([job.id,row.suffix]));
    assert.equal(c.fullActionHash,row.fullActionHash);assert.equal(c.suffixHash,row.suffixHash);
    const v=applyTail(w,row.suffix,b,t),end=snap(v),fp=exactWorld(v);
    for(const k of ['body','rank','raw','effective','capRaw','cap','traits','history','activeResearch','disabledResearch'])assert.deepEqual(end[k],row[k],k);
    const ctx=auditOriginCampaignContext([...full,...row.suffix],data);
    assert(ctx.kind==='compatible'&&ctx.allowedDifficulties.includes(job.difficulty));assert(budget(base,[...job.suffix,...row.suffix]).ok);
    if(seen.has(fp))continue;seen.add(fp);frontier.push({world:v,steps:row.suffix});
    receipt.resumeCheckpoints.push(row.id);metrics.resumedCheckpoints++;
   }catch(e){metrics.resumeErrors++;receipt.attempted.push({id:c.checkpointId,reason:'RESUME_CHECKPOINT_REPLAY_FAILED',detail:e.message});}
   assert(frontier.length,'no eligible resume checkpoint independently replayed');
  }
  for(let turn=0;turn<depth;turn++){
   const found=[];
   for(const n of frontier){
    const before=snap(n.world);let tries=0;
    for(const {x,r} of options(n.world,inventory(n.world,b))){
     if(tries++>=12)break;
     let prepared=n;
     if(x.missingResearch.length){
      const dk=[job.difficulty,b.id,t.id,r.id].join('|');let tail=null;
      if(donors.has(dk)){metrics.donorTrials++;try{const a=donors.get(dk),v=applyTail(n.world,a,b,t);if(r.requires.every(k=>active(v,k))){tail=a;prepared={world:v,steps:[...n.steps,...a]};metrics.donorReplays++;}}catch{}}
      if(!tail){if(remaining<=0)continue;remaining--;metrics.plannerCalls++;
       const steps=[...full,...n.steps],plan=p.ensure(r.requires,{world:n.world,steps,trace:[],diagnostics:[]});metrics.researchAttempts+=plan.attempts||0;
       if(!plan.ok){receipt.attempted.push({id:r.id,reason:plan.reason,unresolved:plan.unresolved});continue;}
       tail=plan.node.steps.slice(steps.length);
       try{const v=applyTail(n.world,tail,b,t);assert.equal(exactWorld(v),exactWorld(plan.node.world));prepared={world:v,steps:[...n.steps,...tail]};donors.set(dk,tail);}catch(e){receipt.attempted.push({id:r.id,reason:e.message});continue;}
      }
     }
     let result=null;metrics.transforms++;try{result=replay.transform(replay.grow(prepared),r);if(result)result=replay.grow(result);}catch{}
     if(!result){receipt.attempted.push({id:r.id,reason:'EXACT_TRANSFORM_NOT_APPLIED'});continue;}
     const end=snap(result.world),fp=exactWorld(result.world);if(seen.has(fp))continue;seen.add(fp);
     const bt=new Map(before.traits),et=new Map(end.traits),bh=new Set(before.history.map(([k])=>k));
     // Repeated trait counts without numeric/new-rule effects are not new display candidates.
     if(!before.traits.every(([k,n])=>(et.get(k)||0)>=n)||!end.cap.every((v,i)=>v>=before.cap[i])||!(end.cap.some((v,i)=>v>before.cap[i])||end.traits.some(([k])=>!bt.has(k))||end.history.some(([k])=>!bh.has(k)))){receipt.attempted.push({id:r.id,reason:'NO_SELECTED_PRODUCTIVE_GAIN_OR_TRADEOFF'});continue;}
     const actions=[...full,...result.steps],ctx=auditOriginCampaignContext(actions,data),m=budget(base,[...job.suffix,...result.steps]);
     if(!m.ok||ctx.kind!=='compatible'||!ctx.allowedDifficulties.includes(job.difficulty)||!allowed(result.world,b,t)){receipt.attempted.push({id:r.id,reason:'CONTEXT_OR_INDEXED_CAP_BLOCKED'});continue;}
     const verified=applyTail(w,result.steps,b,t);assert.equal(exactWorld(verified),fp);
     const inv=inventory(verified,b),id='OVERCAP-END-NEXT:'+hash([job.id,result.steps]),prior=new Map(s.traits);
     const item={id,sourceTerminalId:job.id,sourceRecordId:child.id,parentRecordId:parent.id,origin:job.origin,body:job.body,branch:b.id,difficulty:job.difficulty,target:t.id,sourceActionHash:job.fullActionHash,suffix:result.steps,suffixHash:hash(result.steps),fullActionHash:hash(actions),order:actions.filter(a=>a.type==='transform').map(a=>a.transform),...end,total:sum(end.effective),capTotal:sum(end.cap),capGain:sum(end.cap)-sum(s.cap),addedTraits:end.traits.filter(([k,n])=>n>(prior.get(k)||0)),firstSuccessorInventory:inv,material:m,conditionalReplayVerified:true,actualGameCertified:false,materialBudgetVerified:false,finalAdmission:false,commendationStatsIncluded:false,status:'TERMINAL_RESEARCH_RETAINED_PRODUCTIVE_SUCCESSOR'};
     if(knownRows.has(id)){metrics.existingWitnesses++;found.push({world:result.world,steps:result.steps,item});continue;}
     knownRows.add(id);rows.push(item);receipt.produced.push(id);metrics.productive++;metrics.firstInventoryClosed+=Number(inv.firstInventoryClosed);found.push({world:result.world,steps:result.steps,item});
    }
   }
   frontier=found.sort((a,b)=>Number(b.item.firstSuccessorInventory.firstInventoryClosed)-Number(a.item.firstSuccessorInventory.firstInventoryClosed)||b.item.capGain-a.item.capGain||b.item.addedTraits.length-a.item.addedTraits.length||a.steps.length-b.steps.length).slice(0,width);
   if(!frontier.length)break;
  }
 }catch(e){receipt.status='SEED_OR_WAVE_ERROR';receipt.error=e.message;metrics.seedErrors++;}
 coverage.push(receipt);
}
const name=bodyFilter?bodyFilter.replace('STR_SOLDIER_',''):'all',resumeTag=resumeQueue?'-resume-'+hash([resumeQueue,bodyFilter,offset,limit,depth,width,attempts,calls,prev]).slice(0,16):'',file='public/data/soldier-overcap-terminal-training-'+name+'-'+offset+resumeTag+'.json';
const report={schema:'ATLAS_OVERCAP_TERMINAL_TRAINING_WAVE_V1',sourceMetadataSha256:terminal.sourceMetadataSha256,sourceLedgerHash:terminal.sourceLedgerHash,sourceHash:hash(terminal),terminalSourceHash:hash(source),scope:'Bounded live deterministic same-body followthrough with terminal goals preserved; first-action inventory is not a final certificate.',batch:{body:bodyFilter,offset,limit,depth,width,attempts,calls,total:jobs.length,...(resumeQueue?{resumeQueue:resumeFile,resumeQueueHash:hash(resumeQueue)}:{})},summary:{...metrics,finalAdmission:0},coverage,researchDonors:[...donors].map(([key,actions])=>({key,actions})),rows};
fs.writeFileSync(file,JSON.stringify(report)+'\n');console.log(JSON.stringify({file,summary:report.summary,top:rows.slice().sort((a,b)=>Number(b.firstSuccessorInventory.firstInventoryClosed)-Number(a.firstSuccessorInventory.firstInventoryClosed)||b.capGain-a.capGain).slice(0,8).map(r=>({body:r.body,capGain:r.capGain,added:r.addedTraits,open:r.firstSuccessorInventory.open.map(x=>x.id),firstClosed:r.firstSuccessorInventory.firstInventoryClosed})),errors:coverage.filter(r=>r.error).map(r=>({id:r.id,error:r.error}))}));
