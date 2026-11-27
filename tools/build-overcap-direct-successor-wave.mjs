// Exact-endpoint continuation producer. No fresh recruitment or arbitrary research flags.
// Bounded productive wave; never a terminal closure certificate.
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {defaultRankData,RANK_POLICY} from './population-frontier-default-rank.mjs';
import {createCareerReplay} from './population-chronological-career-core.mjs';
import {member,exactWorld} from './population-growth-replay-core.mjs';
import {deterministicRule} from './population-scalar-upper-bound.mjs';
import {createFirstSuccessorIndex} from './atlas-first-successor-obligations.mjs';
import {createContextResearchPlanner} from '../public/soldiers/modern/foundation-research-planner-context-v2.js';
import {auditOriginCampaignContext} from '../public/soldiers/modern/origin-campaign-context.js';
import {makeOvercapContinuationQueue} from './overcap-continuation-queue-v1.mjs';

const read=p=>JSON.parse(fs.existsSync(p)?fs.readFileSync(p,'utf8'):execFileSync('git',['-c','safe.directory='+process.cwd().replaceAll('\\','/'),'show','HEAD:'+p],{encoding:'utf8',maxBuffer:128*1024*1024}));
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const arg=(k,d)=>process.argv.find(a=>a.startsWith('--'+k+'='))?.slice(k.length+3)??d;
const num=(k,d,min,max)=>{const n=Number(arg(k,d));assert(Number.isSafeInteger(n)&&n>=min&&n<=max,'invalid '+k);return n;};
const sum=v=>v.reduce((n,x)=>n+x,0);
const active=(w,k)=>w.researched.has(k)&&!w.disabled.has(k);
const sort=a=>[...a].sort();
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const source='public/data/soldier-overcap-expanded-lifecycle.json',materialSource='public/data/soldier-overcap-material-ledger.json';
const life=read(source),material=read(materialSource),projection=read('public/data/soldier-overcap-unified-exploration.json'),branches=read('public/data/soldier-atlas-career-branches.json');
const data=defaultRankData(read('public/data/soldiers-modern-index.json')).data;
data.originRows=read('public/data/soldier-acquisition-progression-20261102.json').rows;
data.sourceItemIds=new Set(read('public/data/soldier-source-catalog.json').itemIds);
assert.equal(life.sourceMetadataSha256,data.meta.source.metadataSha256);
assert.equal(branches.sourceMetadataSha256,life.sourceMetadataSha256);
assert.equal(material.inputs.lifecycle.canonicalJsonSha256,hash(life));
assert.equal(projection.sourceHash,hash(life));
assert.equal(life.summary.complete,life.results.length);
const q=makeOvercapContinuationQueue(projection,branches);
const sourceIds=new Map(life.results.map(r=>[r.id,r]));
const projIds=new Map(projection.rows.map(r=>[r.sourceRecordId,r]));
const materialIds=new Map(material.rows.map(r=>[r.id,r]));
const replay=createCareerReplay(data),first=createFirstSuccessorIndex(data),bonus=new Map(data.bonuses.map(x=>[x.id,x]));
const branchById=new Map(branches.branches.map(b=>[b.id,b]));
const choices=new Set(Object.values(q.branchCommitments).flat());
const finite=new Map(Object.values(material.catalog).filter(x=>x.cap!=null).map(x=>[x.id,x]));
finite.set(material.confirmedReferencePool.id,material.confirmedReferencePool);
const queuePath='tools/data/overcap-continuation-queue-v2.json';
const queueJobs=q.jobs.map(j=>{
 const r=sourceIds.get(j.sourceRecordId),m=materialIds.get(j.sourceRecordId),p=projIds.get(j.sourceRecordId);
 assert(r&&m&&p&&p.id===j.id&&hash(r.actions)===j.sourceActionHash);
 const a=new Set(r.activeResearch),disabled=new Set(r.disabledResearch);
 const observed=sort([...a].filter(k=>choices.has(k)));
 // Keep the V1 historical restriction as an additional conservative filter.
 const candidates=j.candidates.flatMap(c=>{
  const b=branchById.get(c.id),required=q.branchCommitments[c.id];
  const conflicts=observed.filter(k=>!required.includes(k));
  if(conflicts.length||required.some(k=>disabled.has(k)))return [];
  const missing=required.filter(k=>!a.has(k));
  return [{id:c.id,missing,missingCount:missing.length,fullyActive:missing.length===0}];
 }).sort((a,b)=>a.missingCount-b.missingCount||a.id.localeCompare(b.id));
 return {...j,observedActiveCommitments:observed,candidates,materialStatus:m.status,status:candidates.length?'ACTIVE_COMMITMENT_CANDIDATE':'NO_STATIC_BRANCH_CANDIDATE'};
});
const priority=['STR_SOLDIER_HERO','STR_SOLDIER_W','STR_SOLDIER_X','STR_SOLDIER_R','STR_SOLDIER_PEASANT','STR_SOLDIER_DAMSEL','STR_SOLDIER_SLAVE','STR_SOLDIER_PUREBLOOD','STR_SOLDIER_CHORT'];
// Round robin: avoid exhausting the batch on one body or one origin.
const groups=new Map();
for(const j of queueJobs){const a=groups.get(j.body)||[];a.push(j);groups.set(j.body,a);}
for(const a of groups.values())a.sort((x,y)=>sourceIds.get(y.sourceRecordId).total-sourceIds.get(x.sourceRecordId).total||x.id.localeCompare(y.id));
const ordered=[];for(let i=0;ordered.length<queueJobs.length;i++)for(const b of priority){const j=groups.get(b)?.[i];if(j)ordered.push(j);}
assert.equal(new Set(ordered.map(j=>j.id)).size,queueJobs.length);
const queue={schema:'ATLAS_OVERCAP_CONTINUATION_QUEUE_V2',sourceMetadataSha256:life.sourceMetadataSha256,sourceHash:hash(life),materialHash:hash(material),scope:'Active and disabled endpoint research filter. Static branch candidates only; no final admission.',summary:{rows:ordered.length,candidatePairs:ordered.reduce((s,j)=>s+j.candidates.length,0),fullyActivePairs:ordered.reduce((s,j)=>s+j.candidates.filter(c=>c.fullyActive).length,0),noCandidate:ordered.filter(j=>!j.candidates.length).length},jobs:ordered};
fs.mkdirSync('tools/data',{recursive:true});fs.writeFileSync(queuePath,JSON.stringify(queue)+'\n');
const offset=num('offset',0,0,ordered.length),limit=num('limit',9,1,195),maxResearch=num('research',3,0,20),maxAttempts=num('attempts',100,1,1000),depth=num('depth',2,1,4),width=num('width',2,1,8);
const fullyActiveOnly=process.argv.includes('--fully-active');
const selection=fullyActiveOnly?ordered.filter(j=>j.candidates.some(c=>c.fullyActive)):ordered;
const selected=selection.slice(offset,offset+limit),planners=new Map(),out=[],coverage=[],metrics={seeds:0,seedErrors:0,transformTrials:0,plannerCalls:0,researchAttempts:0,productive:0};
function planner(d){if(!planners.has(d))planners.set(d,createContextResearchPlanner(data,{difficulty:d,maxAttempts,maxDepth:50,maxSteps:2200,methodLimit:35,collectFailures:true}));return planners.get(d);}
function snapshot(w){
 const s=member(w).state,f=replay.finish(w);
 return {body:s.soldierType,rank:s.rank,raw:f.raw,effective:f.permanentVector,capRaw:f.capRaw,cap:f.permanentCapVector,traits:[...s.bonusCounts].sort(),history:[...s.history].sort(),activeResearch:sort([...w.researched].filter(k=>active(w,k))),disabledResearch:sort(w.disabled)};
}
function knownFinite(steps){
 const given={},used={},events=new Map(),errors=[];
 const add=(o,k,n)=>{if(finite.has(k))o[k]=(o[k]||0)+n;};
 for(const a of steps){
  if(a.type==='eventResearch')events.set(a.event,(events.get(a.event)||0)+1);
  if(a.type==='externalInputs')for(const [k,n] of Object.entries(a.items||{})){
   add(given,k,n);const c=finite.get(k);if(c?.hardCap&&c.finiteGrantEvidence.every(g=>!events.has(g.event)))errors.push(k+': hard source missing');
  }
  if(a.type==='transform')for(const [k,n] of Object.entries(replay.rules.get(a.transform)?.requiredItems||{}))add(used,k,n);
  if(a.type==='recruit'){const p=data.profiles.find(p=>p.id===a.profile);if(p?.sourceType==='event')events.set(p.sourceId,(events.get(p.sourceId)||0)+1);else for(const [k,n] of Object.entries(p?.acquisitionRequiredItems||{}))add(used,k,n);}
  if(a.type==='research'||a.type==='repeatResearch'){const r=data.researchRules[a.id];if(r?.needItem&&r.destroyItem)add(used,r.neededItem||a.id,1);}
 }
 for(const [k,c] of finite)if(Math.max(given[k]||0,used[k]||0)>c.cap)errors.push(k+': indexed pool exceeded');
 return {ok:!errors.length,errors,given,used};
}
function retained(before,after){const t=new Map(after.traits);return before.traits.every(([k,n])=>(t.get(k)||0)>=n);}
function dominates(a,b){return a.every((v,i)=>v>=b[i]);}
function assess(w){const s=member(w).state,f=replay.finish(w);return first.assess({body:s.soldierType,history:new Set(s.history.keys()),historyKnown:s.historyKnown===true,active:new Set([...w.researched].filter(k=>active(w,k))),raw:f.raw,capRaw:f.capRaw});}
function candidates(w,assessment){
 const s=member(w).state,body=replay.bodies.get(s.soldierType);
 return assessment.open.map(x=>({x,r:replay.rules.get(x.id)})).filter(({x,r})=>r&&x.destination===s.soldierType&&r.allowsLiveSoldiers&&!r.createsClone&&!r.producedItem&&!r.reset&&!r.resetRank&&!r.removeTransformations?.length&&!Object.keys(r.requiredCommendations||{}).length&&deterministicRule(r,[body])).map(({x,r})=>{
  const bs=bonus.get(r.soldierBonusType)?.stats||{},novel=r.soldierBonusType&&!s.bonusCounts.has(r.soldierBonusType);
  const score=(novel?20+Object.values(bs).reduce((a,b)=>a+Number(b||0),0):0)+Object.values(r.flatOverallStatChange||{}).reduce((a,b)=>a+Number(b||0),0)+Object.values(r.flatMin||{}).reduce((a,b)=>a+Number(b||0),0);
  return {x,r,score};
 }).sort((a,b)=>Number(!!a.x.missingResearch.length)-Number(!!b.x.missingResearch.length)||b.score-a.score||a.r.id.localeCompare(b.r.id));
}
for(const job of selected){
 const r=sourceIds.get(job.sourceRecordId),base={sourceRecordId:r.id,sourceId:job.id,origin:r.origin,body:r.body,difficulty:r.difficulty,sourceActionHash:hash(r.actions)};
 const receipt={...base,status:'OPEN_NOT_EXHAUSTED',produced:[],attempted:[],firstOpen:[],seedReplayVerified:false,finalAdmission:false};
 try{
  const w=replay.replay(r.actions),s=snapshot(w);
  assert.deepEqual(s.raw,r.raw);assert.deepEqual(s.effective,r.effective);assert.equal(s.body,r.body);assert.equal(s.rank,r.rank);assert.deepEqual(s.traits,r.traits);assert.deepEqual(s.history,r.history);assert.deepEqual(s.activeResearch,r.activeResearch);assert.deepEqual(s.disabledResearch,r.disabledResearch);
  receipt.seedReplayVerified=true;metrics.seeds++;
  const a=assess(w);receipt.firstOpen=a.open;receipt.firstBlocked=a.blocked;receipt.unknownRules=a.unknownRules;receipt.openGrowth=a.openGrowth;
  let frontier=[{world:w,steps:[]}],researchLeft=maxResearch,seen=new Set([exactWorld(w)]);
  for(let turn=0;turn<depth;turn++){
   const next=[];
   for(const n of frontier){
    const before=snapshot(n.world),options=candidates(n.world,assess(n.world));let trials=0;
    for(const {x,r:rule} of options){
     if(trials>=12)break;trials++;
     let prepared=n;
     if(x.missingResearch.length){
      if(researchLeft<=0)continue;
      researchLeft--;metrics.plannerCalls++;
      const plan=planner(r.difficulty).ensure(rule.requires,{world:n.world,steps:[...r.actions,...n.steps],trace:[],diagnostics:[]});
      metrics.researchAttempts+=plan.attempts||0;
      if(!plan.ok){receipt.attempted.push({rule:rule.id,reason:plan.reason,unresolved:plan.unresolved||null});continue;}
      const tail=plan.node.steps.slice(r.actions.length+n.steps.length);
      prepared={world:plan.node.world,steps:[...n.steps,...tail]};
     }
     // Keep the currently witnessed campaign decisions active. The candidate
     // may acquire new commitments; actual branch matching is reported below.
     if([...choices].some(k=>active(n.world,k)&&!active(prepared.world,k))){receipt.attempted.push({rule:rule.id,reason:'ACTIVE_COMMITMENT_LOST'});continue;}
     let result=null;metrics.transformTrials++;
     try{result=replay.transform(replay.grow(prepared),rule);if(result)result=replay.grow(result);}catch{}
     if(!result){receipt.attempted.push({rule:rule.id,reason:'EXACT_TRANSFORM_NOT_APPLIED'});continue;}
     const end=snapshot(result.world),full=[...r.actions,...result.steps],fp=exactWorld(result.world);
     if(seen.has(fp))continue;seen.add(fp);
     if(!retained(before,end)||!dominates(end.cap,before.cap)||!(end.cap.some((v,i)=>v>before.cap[i])||end.traits.some(([k,v])=>v>(new Map(before.traits).get(k)||0))))continue;
     const ctx=auditOriginCampaignContext(full,data),budget=knownFinite(full);
     if(ctx.kind!=='compatible'||!ctx.allowedDifficulties.includes(r.difficulty)||!budget.ok){receipt.attempted.push({rule:rule.id,reason:'CONTEXT_OR_INDEXED_FINITE_LIMIT',details:budget.errors});continue;}
     const verified=replay.replay(result.steps,w);assert.equal(exactWorld(verified),fp);
     const id='OVERCAP-NEXT:'+hash([r.id,result.steps]),branchCandidates=job.candidates.filter(c=>q.branchCommitments[c.id].every(k=>active(verified,k))&&[...choices].every(k=>!active(verified,k)||q.branchCommitments[c.id].includes(k))).map(c=>c.id);
     const item={...base,id,depth:turn+1,order:full.filter(a=>a.type==='transform').map(a=>a.transform),suffix:result.steps,suffixHash:hash(result.steps),fullActionHash:hash(full),...end,total:sum(end.effective),capTotal:sum(end.cap),delta:end.cap.map((v,i)=>v-s.cap[i]),capGain:sum(end.cap)-sum(s.cap),addedTraits:end.traits.filter(([k,v])=>v>(new Map(s.traits).get(k)||0)),fullyActiveBranchCandidates:branchCandidates,knownFinite:budget,conditionalReplayVerified:true,actualGameCertified:false,materialBudgetVerified:false,finalAdmission:false,commendationStatsIncluded:false,status:'PRODUCTIVE_CONDITIONAL_SUCCESSOR'};
     out.push(item);receipt.produced.push(id);metrics.productive++;next.push({world:result.world,steps:result.steps,item});
    }
   }
   frontier=next.sort((a,b)=>b.item.capGain-a.item.capGain||b.item.addedTraits.length-a.item.addedTraits.length||a.steps.length-b.steps.length).slice(0,width);
   if(!frontier.length)break;
  }
 }catch(e){metrics.seedErrors++;receipt.error=String(e.message).slice(0,800);receipt.status='SEED_OR_WAVE_ERROR';}
 coverage.push(receipt);
}
const report={schema:'ATLAS_OVERCAP_DIRECT_SUCCESSOR_WAVE_V1',sourceMetadataSha256:life.sourceMetadataSha256,sourceLedgerHash:life.sourceLedgerHash,sourceHash:hash(life),queueHash:hash(queue),rankPolicy:RANK_POLICY.id,scope:'Bounded exact endpoint continuation, deterministic live same-body transformations, nondecreasing cap and retained traits, no medal bonuses. Unsupported actions and research remain open. Indexed finite constraints only. Not final admission.',batch:{offset,limit,depth,width,maxResearch,maxAttempts,total:selection.length,fullyActiveOnly},summary:{...metrics,byBody:Object.fromEntries(priority.map(b=>[b,{seeds:coverage.filter(r=>r.body===b&&r.seedReplayVerified).length,successors:out.filter(r=>r.body===b).length}])),finalAdmission:0},coverage,rows:out};
const target='public/data/soldier-overcap-successor-wave-'+(fullyActiveOnly?'committed-':'')+offset+'.json';fs.writeFileSync(target,JSON.stringify(report)+'\n');
console.log(JSON.stringify({queue:queue.summary,summary:report.summary,errors:coverage.filter(r=>r.error).map(r=>({body:r.body,origin:r.origin,error:r.error})),top:out.slice().sort((a,b)=>b.capGain-a.capGain).slice(0,5).map(r=>({body:r.body,origin:r.origin,gain:r.capGain,traits:r.addedTraits,order:r.order,branch:r.fullyActiveBranchCandidates.length}))}));
