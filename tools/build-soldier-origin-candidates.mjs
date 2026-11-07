import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {createFoundationResearchPlanner} from '../public/soldiers/modern/foundation-research-planner.js';
import {replayOriginWitness,WITNESS_STATS,originEventScript} from '../public/soldiers/modern/origin-witness.js';
import {auditOriginCampaignContext} from '../public/soldiers/modern/origin-campaign-context.js';
import {bonusStats} from '../public/soldiers/modern/eligibility.js';
import {projectCandidateStats} from '../public/soldiers/modern/score-12.js';
import {researchBranchEvidence} from '../public/soldiers/modern/origin-branch-evidence.js';
import {classifyResearchSupplyGap} from '../public/soldiers/modern/research-supply-gap.js';
import {encodeOriginReport,decodeOriginReport} from './origin-report-codec.mjs';
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const data=read('public/data/soldiers-modern-index.json');
const ledger=read('public/data/soldier-acquisition-progression-20261102.json');
data.originRows=ledger.rows;
const catalog=read('public/data/soldier-source-catalog.json');
assert.deepEqual(catalog.sourceHashes,data.meta.source.rules);
data.sourceItemIds=new Set(catalog.itemIds);
assert.equal(data.meta.mod.version,'v.o2');assert.equal(data.profiles.length,72);
const output='public/data/soldier-origin-candidates.json';
const readReport=()=>decodeOriginReport(fs.readFileSync(output,'utf8'));
const shardArg=process.argv.find(x=>x.startsWith('--check-shard='))?.slice(14)||null;
const shardMatch=shardArg?.match(/^(\d+)\/(\d+)$/);
if(shardArg&&(!shardMatch||!process.argv.includes('--check')))
  throw Error('--check-shard requires --check and N/M');
const checkShard=shardMatch?{n:Number(shardMatch[1]),total:Number(shardMatch[2])}:null;
if(checkShard&&(!Number.isSafeInteger(checkShard.total)||checkShard.total<1||checkShard.total>72||
  !Number.isSafeInteger(checkShard.n)||checkShard.n<0||checkShard.n>=checkShard.total))
  throw Error('Invalid --check-shard N/M');
const digest=x=>crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');
const originSources=ledger.rows.filter(r=>r.kind==='SOURCE_SPAWN').map(r=>({id:r.id,kind:r.kind,prerequisites:{event:r.prerequisites?.event||null}})).sort((a,b)=>a.id.localeCompare(b.id,'en'));
const sourceHash=digest({rules:data.meta.source.rules,profiles:data.profiles,soldiers:data.soldiers,bonuses:data.bonuses,transforms:data.transformations,research:data.researchRules,missionResearch:data.missionResearchSources||{},itemIds:catalog.itemIds,originSources});
const labels=Object.fromEntries([...data.soldiers,...data.transformations,...data.bonuses].map(x=>[x.id,x.koName||x.id]));
for(const p of data.profiles)labels[p.sourceId]=p.sourceKoName;
const amount=x=>WITNESS_STATS.reduce((s,k)=>s+Number(x?.[k]||0),0);
// The website ranks all twelve game stats (including Mana). Candidate beam
// ordering must use the same objective, not the obsolete 11-stat total.
const score12Cache=new Map();
const score12=(p,c)=>{
  if(!score12Cache.has(c.id))score12Cache.set(c.id,
    projectCandidateStats({profileId:p.id},c,data).total);
  return score12Cache.get(c.id);
};
const unresolvedOnly=process.argv.includes('--unresolved-only');
const birthOnly=process.argv.includes('--birth-only');
const deepSearch=process.argv.includes('--deep-search');
const focusProfile=process.argv.find(x=>x.startsWith('--profile='))?.slice('--profile='.length)||null;
const transformDepthText=process.argv.find(x=>x.startsWith('--max-transforms='))?.slice('--max-transforms='.length);
const maxTransforms=transformDepthText==null?4:Number(transformDepthText);
const resumeFrontier=process.argv.includes('--resume-frontier');
const seedDepthText=process.argv.find(x=>x.startsWith('--seed-depth='))?.slice('--seed-depth='.length);
const seedDepth=seedDepthText==null?Math.max(0,maxTransforms-2):Number(seedDepthText);
const seedLimitText=process.argv.find(x=>x.startsWith('--seed-limit='))?.slice('--seed-limit='.length);
const seedLimit=seedLimitText==null?8:Number(seedLimitText);
const seedId=process.argv.find(x=>x.startsWith('--seed-id='))?.slice('--seed-id='.length)||null;
const searchOriginalBody=process.argv.includes('--origin-frontier-only');
const researchReadyOnly=process.argv.includes('--existing-research-only');
const branchLimitText=process.argv.find(x=>x.startsWith('--branch-limit='))?.slice('--branch-limit='.length);
const branchLimit=branchLimitText==null?12:Number(branchLimitText);
const targetTransforms=process.argv.filter(x=>x.startsWith('--target-transform='))
  .map(x=>x.slice('--target-transform='.length));
const seedDifficultyText=process.argv.find(x=>x.startsWith('--seed-difficulty='))?.slice('--seed-difficulty='.length);
const seedDifficulty=seedDifficultyText==null?null:Number(seedDifficultyText);
if(!Number.isSafeInteger(maxTransforms)||maxTransforms<4||maxTransforms>24||
  (transformDepthText!=null&&(!focusProfile||!deepSearch)))
  throw Error('--max-transforms=4..24 requires --deep-search and --profile; it never certifies full coverage');
if(((resumeFrontier||searchOriginalBody||researchReadyOnly||seedDepthText!=null||seedLimitText!=null||branchLimitText!=null||seedId||targetTransforms.length||seedDifficultyText!=null)&&
  (!focusProfile||!deepSearch))||!Number.isSafeInteger(seedDepth)||seedDepth<0||seedDepth>=maxTransforms||
  !Number.isSafeInteger(seedLimit)||seedLimit<1||seedLimit>64||
  !Number.isSafeInteger(branchLimit)||branchLimit<1||branchLimit>83)
  throw Error('Scoped frontier options require --deep-search --profile and safe integer limits');
if(seedDifficultyText!=null&&(!resumeFrontier||!Number.isInteger(seedDifficulty)||
  seedDifficulty<0||seedDifficulty>4))
  throw Error('--seed-difficulty requires --resume-frontier and integer difficulty 0..4');
if(targetTransforms.length&&(!resumeFrontier||targetTransforms.length>maxTransforms-seedDepth||
  targetTransforms.some(id=>!data.transformations.some(t=>t.id===id))))
  throw Error('Ordered --target-transform goals require a resumable valid sequence within remaining layers');
const difficultyArg=process.argv.find(x=>x.startsWith('--difficulty='))?.slice('--difficulty='.length);
const difficulty=difficultyArg==null?seedDifficulty:Number(difficultyArg);
if(difficultyArg!=null&&seedDifficulty!=null&&difficulty!==seedDifficulty)
  throw Error('--difficulty and --seed-difficulty must agree');
if(difficultyArg!=null&&(!focusProfile||!Number.isInteger(difficulty)||difficulty<0||difficulty>4))
  throw Error('--difficulty requires --profile and an integer 0..4');
if(focusProfile&&!data.profiles.some(p=>p.id===focusProfile))
  throw Error('Unknown source profile: '+focusProfile);
if(birthOnly&&!focusProfile)throw Error('--birth-only requires --profile');
if(deepSearch&&!focusProfile)throw Error('--deep-search requires --profile to preserve unrelated origins');
// These are ordered SEARCH GOALS, never pre-completed flags. All prerequisites,
// samples, free-award timing and event guards still pass the existing verifier.
const researchFirst=[...new Set(process.argv.filter(x=>x.startsWith('--research-first='))
  .map(x=>x.slice('--research-first='.length)))];
if(researchFirst.length&&!focusProfile)throw Error('--research-first requires --profile to keep other origins untouched');
if(researchFirst.length>24)throw Error('At most 24 ordered research goals are supported');
for(const id of researchFirst)if(!id||id==='STR_UNAVAILABLE'||!data.researchRules[id])
  throw Error('Unknown or unavailable ordered research goal: '+id);
// Deeper campaigns need more room for legitimate event gates, free research,
// and conditional auto queues. Only a focused, explicitly ordered run receives
// this bounded increase: other 71 origin records stay byte-for-byte intact.
const deepFocused=Boolean(focusProfile&&(researchFirst.length||deepSearch||difficulty!=null));
const planner=createFoundationResearchPlanner(data,deepFocused?
  {maxAttempts:1600,maxDepth:64,maxSteps:1150,difficulty,methodLimit:32}:
  {maxAttempts:260,maxDepth:38,maxSteps:430,difficulty});
const branchEvidence=replay=>researchBranchEvidence(replay,data.researchRules);
// Scoped builds reuse the exactly verified stepwise witness to construct a
// candidate and its metadata. A separate --check always replays from zero
// with a fresh process and independently checks every published candidate.
const witnessCache=new Map(),birthCache=new Map();
const witnessFor=c=>{
  if(!witnessCache.has(c.id))witnessCache.set(c.id,replayOriginWitness(c.steps,data,{birthCache}));
  return witnessCache.get(c.id);
};
function candidate(node,p,description){
  const campaignContext=auditOriginCampaignContext(node.steps,data);
  if(campaignContext.kind!=='compatible')return null;
  // Each planner action already passed the SAME campaign verifier. Reuse its
  // chronological trace while enumerating branches; validateReport later
  // independently replays the entire candidate from zero before publishing.
  let replay;
  const current=node.world.soldiers.find(x=>x.id==='origin');
  if(current?.state.exactStats===true&&node.trace?.length===node.steps.length){
    const raw=Object.fromEntries(WITNESS_STATS.map(k=>[k,current.state.currentStats[k]]));
    const bonus=bonusStats(current.state,data,{commendations:current.commendations});
    const stats=Object.fromEntries(WITNESS_STATS.map(k=>[k,Math.max(k==='health'?1:0,raw[k]+(bonus[k]||0))]));
    replay={ok:true,exact:true,world:node.world,trace:node.trace,raw,bonus,stats,total:amount(stats)};
  }else replay=replayOriginWitness(node.steps,data);
  if(!replay.ok||!replay.stats||!replay.exact)return null;
  const member=replay.world.soldiers.find(x=>x.id==='origin');
  const transforms=node.steps.filter(s=>s.type==='transform').map(s=>s.transform);
  const result={id:digest({profile:p.id,steps:node.steps}).slice(0,20),profileId:p.id,
    status:'PROVISIONAL_CONDITIONAL',description,scope:'출생 최솟값 + 성장/훈장 추가 없음 + 실제 규칙을 재생한 훈련 후보',
    researchSequenceComplete:true,startsWithNoResearch:true,certifiedMaximum:false,campaignContext,
    raw:replay.raw,bonus:Object.fromEntries(WITNESS_STATS.map(k=>[k,replay.bonus[k]||0])),
    stats:replay.stats,total:replay.total,bonusTotal:amount(replay.bonus),
    finalSoldierType:member.state.soldierType,transforms,steps:node.steps,
    researchCount:new Set(replay.trace.flatMap(t=>t.added)).size,
    branchChoices:branchEvidence(replay),
    trainingExclusions:transforms.map(id=>({id,excludes:data.transformations.filter(t=>t.forbiddenPreviousTransformations.includes(id)).map(t=>({id:t.id,
      direction:data.transformations.find(t=>t.id===id).forbiddenPreviousTransformations.includes(t.id)?'bidirectional':'oneway'}))})),
    assumptions:node.steps.filter(s=>s.type==='externalInputs'||s.assumeOutcome||s.type==='recruit'||
      s.type==='advanceMonth'||s.type==='campaignContext'||s.type==='repeatResearch'),
    guarantees:['기초 연구 상태부터 공급 경로 없이 추가한 연구 플래그 없음','모든 연구·무료 지급·자동 큐·시술은 기존 재생기로 검사','서로 다른 병사의 성장·훈장·보너스 합산 없음'],
    limitations:['자금·표본·시설 실물 확보 조건부','출생 RNG와 이벤트 실제 발생 미실측','전투·체육관 성장 및 훈장 획득 경로 미포함','다른 경로보다 크다는 전역 최적성 미증명']};
  witnessCache.set(result.id,replay);
  return result;
}
function recoverAcquisition(p,previous){
  if(researchFirst.length||difficulty!=null||!previous?.candidates?.length)return null;
  // A proven birth prefix is stronger than repeatedly guessing its hundreds
  // of upstream research gates. Retain the exact chronology, never inject
  // a pre-completed research flag.
  const seeds=[...previous.candidates].sort((a,b)=>a.steps.length-b.steps.length);
  for(const old of seeds){
    const at=old.steps.findIndex(s=>s.type==='recruit'&&s.profile===p.id);
    if(at<0)continue;
    const steps=old.steps.slice(0,at+1);
    const replay=replayOriginWitness(steps,data,{birthCache});
    if(!replay.ok||!replay.exact)continue;
    const node={world:replay.world,trace:replay.trace,steps,diagnostics:[]};
    const result=candidate(node,p,'출생까지의 연구 경로 완결');
    if(result)return {node,result};
  }
  return null;
}
function obtain(p){
  const row=ledger.rows.find(r=>r.id===p.id),alternatives=p.sourceType==='event'?row.prerequisites.event?.alternatives||[]:[null];
  let last=null;
  for(const alt of alternatives){
    let node=planner.newNode();
    const event=alt?originEventScript(alt,p.sourceId):null;
    const goals=[...researchFirst,...p.requires,...(event?.researchPositive||[])];
    const required=planner.ensure(goals,node);
    if(!required.ok){last={id:required.unresolved,reason:required.reason};continue;}
    node=required.node;
    try{
      if(alt){
        const first=Math.max(0,alt.firstMonth||0,alt.mode==='weighted'?Math.min(...alt.monthWeights.filter(x=>x.weight>0).map(x=>x.month)):0);
        if(node.world.month<first)planner.append(node,{type:'advanceMonth',month:first,assumeContinuity:true});
        planner.supply(node,{items:Object.fromEntries((event.itemPositive||[]).map(x=>[x,1]))},'출생 이벤트 실물 조건: '+p.sourceId);
      }
      planner.supply(node,{items:p.acquisitionRequiredItems||{},functions:p.requiresBaseFunc||[],funds:Number(p.cost||0)},'병사 획득 자금·재료·기지 기능: '+p.id);
      planner.append(node,{type:'recruit',profile:p.id,soldier:'origin',band:'min',...(alt?{script:alt.script,assumeOutcome:true}:{})});
      const result=candidate(node,p,'출생까지의 연구 경로 완결');
      if(result)return {node,result};
      last={id:p.id,reason:'출생 상태 재생 실패'};
    }catch(e){last={id:p.id,reason:e.message};}
  }
  return {unresolved:last||{id:p.id,reason:'출생 이벤트 경로 미색인'}};
}
function train(target,start,seen=new Set()){
  if(seen.has(target.id)||target.createsClone||target.producedItem)return null;
  let node=planner.clone(start),member=node.world.soldiers.find(x=>x.id==='origin');
  if(!member||!target.allowedSoldierTypes.includes(member.state.soldierType)||target.minRank>member.state.rank||
    Object.keys(target.requiredCommendations||{}).length||target.forbiddenPreviousTransformations.some(id=>member.state.history.has(id)))return null;
  // The first release computes only deterministic transformations.
  for(const [lo,hi] of [['flatMin','flatMax'],['percentMin','percentMax'],['percentGainedMin','percentGainedMax']])
    if(WITNESS_STATS.some(k=>(target[lo]?.[k]||0)!==(target[hi]?.[k]||0)))return null;
  if(Object.values(target.rerollStats||{}).some(Boolean))return null;
  const visited=new Set(seen);visited.add(target.id);
  for(const id of target.requiredPreviousTransformations){
    if(node.world.soldiers[0].state.history.has(id))continue;
    const previous=data.transformations.find(t=>t.id===id);if(!previous)return null;
    node=train(previous,node,visited);if(!node)return null;
  }
  const solved=planner.ensure(target.requires,node);if(!solved.ok)return null;node=solved.node;
  try{
    planner.supply(node,{items:target.requiredItems||{},functions:target.requiresBaseFunc||[],funds:target.cost||0},'훈련 실물·자금: '+target.id);
    planner.append(node,{type:'transform',soldier:'origin',transform:target.id});return node;
  }catch{return null;}
}
// Explain the first unresolved upstream research/event gate without
// promoting a bounded planner failure to permanent impossibility.
function researchBottlenecks(record){
  if(record.candidates.length)return [];
  const original=record.unresolved?.id||record.profileId,queue=[{id:original,depth:0}];
  const found=[],seen=new Set();
  while(queue.length&&found.length<7&&seen.size<55){
    const {id,depth}=queue.shift();
    if(seen.has(id))continue;seen.add(id);
    const methods=planner.methods.get(id)||[];
    if(!data.researchRules[id]&&!methods.length){
      found.push({id,...classifyResearchSupplyGap(id,null,{itemIds:catalog.itemIds,itemSupply:data.itemSupply,eventResearchSources:data.eventResearchSources,missionResearchSources:data.missionResearchSources})});
      continue;
    }
    if(!methods.length){
      found.push({id,...classifyResearchSupplyGap(id,data.researchRules[id],{itemIds:catalog.itemIds,itemSupply:data.itemSupply,eventResearchSources:data.eventResearchSources,missionResearchSources:data.missionResearchSources})});
      continue;
    }
    const missing=[...new Set(methods.flatMap(m=>m.deps).filter(d=>!planner.distance.has(d)))];
    if(missing.length){
      if(depth>=7)found.push({id,kind:'UPSTREAM_UNRESOLVED',reason:'상위 연구 경로 탐색 한계',upstream:missing.slice(0,7)});
      else for(const dep of missing.slice(0,7))queue.push({id:dep,depth:depth+1});
      continue;
    }
    if(id===original)found.push({id,kind:'CHRONOLOGY_UNRESOLVED',reason:record.unresolved?.reason||'실제 연구 완료 순서 미재생'});
  }
  if(!found.length)found.push({id:original,kind:'SEARCH_LIMIT',reason:record.unresolved?.reason||'제한 탐색 미완료'});
  return found;
}
// Balance independent replay processes by recorded witness step count,
// rather than profile index. Several late-game births carry 500-900-step
// histories, so index-modulo shards are severely skewed and time out.
// This mapping is deterministic and covers each profile exactly once.
function shardForRecord(records,count){
  const loads=Array(count).fill(0),assigned=Array(records.length).fill(-1);
  const work=records.map((record,index)=>({index,weight:[
    ...record.candidates,...(record.rejectedCandidates||[])].reduce((n,c)=>n+c.steps.length,0)}));
  work.sort((a,b)=>b.weight-a.weight||a.index-b.index);
  for(const {index,weight} of work){
    let slot=0;
    for(let s=1;s<count;s++)if(loads[s]<loads[slot])slot=s;
    assigned[index]=slot;loads[slot]+=weight;
  }
  assert(assigned.every(n=>n>=0&&n<count));
  return assigned;
}
function validateReport(report,{focused=null,previous=null,shard=null}={}){
  assert.equal(report.sourceHash,sourceHash);assert.equal(report.records.length,72);
  assert.equal(new Set(report.records.map(r=>r.profileId)).size,72);
  const shardSlots=shard?shardForRecord(report.records,shard.total):null;
  let complete=0;
  for(const [index,record] of report.records.entries()){
    assert(data.profiles.some(p=>p.id===record.profileId));
    assert.equal(record.certifiedMaximum,false);
    if(shard&&shardSlots[index]!==shard.n)continue;
    if(focused&&record.profileId!==focused){
      const preserved=previous?.records.find(r=>r.profileId===record.profileId);
      assert.strictEqual(record,preserved,'A focused search changed another birth record');
      for(const c of record.candidates){
        assert.equal(c.certifiedMaximum,false);
        assert(c.startsWithNoResearch&&c.researchSequenceComplete);
        assert.equal(c.resultHash,digest({steps:c.steps,raw:c.raw,stats:c.stats,
          total:c.total,branches:c.branchChoices}),'Unchanged candidate evidence fingerprint mismatch');
        complete++;
      }
      continue;
    }
    for(const c of [...record.candidates,...(record.rejectedCandidates||[])]){
      const context=auditOriginCampaignContext(c.steps,data);
      assert.deepEqual(c.campaignContext,context,'Campaign-context source audit changed');
      if(record.candidates.includes(c))assert.equal(context.kind,'compatible','Inconsistent record leaked into comparison');
      else assert.notEqual(context.kind,'compatible','Compatible record was wrongly quarantined');
      const replay=witnessFor(c);assert(replay.ok,record.profileId+': '+replay.reason);
      assert(replay.exact);assert.deepEqual(replay.stats,c.stats);assert.equal(replay.total,c.total);
      assert.equal(c.certifiedMaximum,false);assert(c.startsWithNoResearch&&c.researchSequenceComplete);
      assert.deepEqual(branchEvidence(replay),c.branchChoices);
      complete++;
    }
    if(record.bestCandidateId)assert(record.candidates.some(c=>c.id===record.bestCandidateId));
    if(!record.candidates.length){
      assert((record.researchBottlenecks||[]).length>0,
        'Unresolved origin needs a concrete research/evidence bottleneck: '+record.profileId);
      assert.deepEqual(record.researchBottlenecks,researchBottlenecks(record),
        'A research bottleneck changed without recomputing the exact source graph: '+record.profileId);
      assert.equal(record.bottleneckHash,digest({profileId:record.profileId,
        unresolved:record.unresolved,gates:record.researchBottlenecks}));
    }
  }
  assert(complete>0,'At least one fully replayed foundation-to-terminal research record is required');
  return complete;
}
function attachMetadata(report,{focused=null}={}){
  for(const r of report.records){
    if(focused&&r.profileId!==focused)continue;
    const proof=ledger.rows.find(x=>x.id===r.profileId);
    r.sourceProof={id:proof.id,kind:proof.kind,prerequisites:{event:proof.prerequisites?.event||null}};
    r.researchBottlenecks=researchBottlenecks(r);
    r.bottleneckHash=r.researchBottlenecks.length?digest({profileId:r.profileId,
      unresolved:r.unresolved,gates:r.researchBottlenecks}):null;
    for(const c of r.candidates){
      const replay=witnessFor(c);
      if(!replay.ok)throw Error('기존 후보 재생 중단: '+r.profileId+' '+replay.reason);
      c.branchChoices=branchEvidence(replay);
      c.campaignContext=auditOriginCampaignContext(c.steps,data);
      c.modelAssumptions=[...new Set(replay.trace.flatMap(t=>t.notes||[]).filter(n=>/미검증|미증명|가상|재실행/.test(n)))];
      c.limitations=[...new Set([...c.limitations,'연구·제조·회복 소요시간과 월별 유지비의 달력 재생 미포함','반복 lookup 보호 해금·동시 연구 완료는 상세 조건부 가정'])];
      c.resultHash=digest({steps:c.steps,raw:c.raw,stats:c.stats,total:c.total,branches:c.branchChoices});
    }
  }
  return report;
}
const unresolvedScope=()=>({mode:'acquisition-unresolved',maxLayers:0,
  candidatesPerLayer:0,beamWidth:0,globalOptimumProven:false});
function auditCampaignReport(report){
  assert.equal(report.sourceHash,sourceHash);
  let compatible=0,inconsistent=0,unknown=0,complete=0;
  for(const row of report.records){
    const evidence=[...new Map([...row.candidates,...(row.rejectedCandidates||[])].map(c=>[c.id,c])).values()];
    for(const c of evidence){
      assert.equal(c.resultHash,digest({steps:c.steps,raw:c.raw,stats:c.stats,total:c.total,branches:c.branchChoices}),
        'Historical numerical evidence changed during context audit');
      c.campaignContext=auditOriginCampaignContext(c.steps,data);
      if(c.campaignContext.kind==='compatible')compatible++;
      else if(c.campaignContext.kind==='inconsistent')inconsistent++;
      else unknown++;
    }
    const valid=evidence.filter(c=>c.campaignContext.kind==='compatible');
    row.candidates=valid;
    row.rejectedCandidates=evidence.filter(c=>c.campaignContext.kind!=='compatible');
    if(valid.length)complete++;
    row.campaignCoverage={compatible:valid.length,excluded:row.rejectedCandidates.length};
    row.bestCandidateId=[...valid].sort((a,b)=>b.total-a.total||a.steps.length-b.steps.length||a.id.localeCompare(b.id))[0]?.id||null;
    row.bestBonusCandidateId=[...valid].sort((a,b)=>b.bonusTotal-a.bonusTotal||b.total-a.total)[0]?.id||null;
  }
  report.summary={...report.summary,withCompleteResearch:complete,unresolved:72-complete,
    witnesses:compatible,archivedWitnesses:inconsistent+unknown,totalWitnessEvidence:compatible+inconsistent+unknown,
    withCompatibleResearch:complete,compatibleWitnesses:compatible,
    excludedDifficultyWitnesses:inconsistent,unknownContextWitnesses:unknown};
  report.campaignContextAuditVersion=1;
  report.notes=[...new Set([...report.notes,
    '난이도 조건이 서로 충돌하는 과거 수치 기록은 보존하지만 최고값·달성 경로 비교에서 제외',
    '같은 캠페인 난이도 일치는 필요조건이며 자금·시설·표본·게임 시간·무작위 실현의 충분조건이 아님'])];
  return report;
}
if(process.argv.includes('--audit-campaign-context')){
  const report=auditCampaignReport(readReport());
  fs.writeFileSync(output,encodeOriginReport(report));
  console.log('Campaign-context audit '+JSON.stringify(report.summary));
}else if(process.argv.includes('--repair-unresolved-scope')){
  const report=readReport();
  assert.equal(report.sourceHash,sourceHash);
  assert.equal(report.records.length,72);
  for(const row of report.records)if(!row.candidates.length)
    row.searchScope=unresolvedScope();
  fs.writeFileSync(output,encodeOriginReport(report));
  console.log('PASS unresolved acquisitions are not incorrectly marked as deep growth searches');
}else if(process.argv.includes('--rebind-source-hash')){
  // A newer indexed source channel from the SAME hashed v.o2 rules may be
  // added without rewriting any previously verified same-person witness.
  const report=readReport();
  assert.equal(report.records.length,72);
  assert.deepEqual(report.sourceHashes,data.meta.source.rules);
  const legacyHash=digest({rules:data.meta.source.rules,profiles:data.profiles,
    soldiers:data.soldiers,bonuses:data.bonuses,transforms:data.transformations,
    research:data.researchRules,itemIds:catalog.itemIds,originSources});
  if(report.sourceHash!==legacyHash&&report.sourceHash!==sourceHash)
    throw Error('An unrelated source changed: refuse to rebind witness registry');
  for(const row of report.records)for(const c of row.candidates)
    assert.equal(c.resultHash,digest({steps:c.steps,raw:c.raw,stats:c.stats,
      total:c.total,branches:c.branchChoices}),"Existing witness evidence changed");
  report.sourceHash=sourceHash;
  // The source graph genuinely gained mission-win alternatives. Only the
  // Unresolved bottleneck explanations may change without replaying
  // the previously signed, unchanged growth witnesses.
  for(const row of report.records)if(!row.candidates.length){
    row.researchBottlenecks=researchBottlenecks(row);
    row.bottleneckHash=digest({profileId:row.profileId,unresolved:row.unresolved,
      gates:row.researchBottlenecks});
  }
  fs.writeFileSync(output,encodeOriginReport(report));
  console.log('Rebound unchanged witnesses and refreshed six unresolved source explanations');
}else if(process.argv.includes('--refresh-metadata')){
  const report=auditCampaignReport(attachMetadata(readReport()));report.sourceHash=sourceHash;fs.writeFileSync(output,encodeOriginReport(report));
  console.log('Updated candidate evidence fingerprints and exact v.o2 birth guards');
}else if(process.argv.includes('--check')){
  const report=readReport();const checked=validateReport(report,{shard:checkShard});
  console.log('PASS origin provisional registry: 72 original profiles, '+checked+' conditional witnesses'+
    (checkShard?' in shard '+checkShard.n+'/'+checkShard.total:'')+
    '; no fake research flags or certified maxima');
}else{
  const prior=fs.existsSync(output)?readReport():null;
  if(focusProfile&&(!prior||prior.sourceHash!==sourceHash||prior.records.length!==72))
    throw Error('Focused update requires an intact, matching 72-origin registry');
  const records=[];
  for(const [index,p] of data.profiles.entries()){
    const previous=JSON.stringify(prior?.sourceHashes)===JSON.stringify(data.meta.source.rules)?prior.records.find(r=>r.profileId===p.id):null;
    if(focusProfile&&p.id!==focusProfile){
      assert(previous,'Focused update cannot discard an unselected origin: '+p.id);
      records.push(previous);continue;
    }
    if(unresolvedOnly&&previous?.candidates?.length){records.push(previous);continue;}
    const candidates=(previous?.candidates||[]).filter(c=>{const r=witnessFor(c);return r.ok&&r.exact&&JSON.stringify(r.stats)===JSON.stringify(c.stats)});
    const acquisition=resumeFrontier?{result:null,node:null}:
      recoverAcquisition(p,previous)||obtain(p);const attempts=[];
    if(acquisition.result||resumeFrontier){
      if(acquisition.result&&!candidates.some(c=>c.id===acquisition.result.id))
        candidates.push(acquisition.result);
      // Deep search is opt-in and profile-scoped: never rewrite the other 71
      // origins or claim global optimality from a bounded search.
      const deep=deepSearch;
      const maxLayers=birthOnly?0:unresolvedOnly?1:deep?maxTransforms:2;
      const width=deep?branchLimit:4,beamWidth=deep?8:1;
      const fromWitness=c=>{
        const oldContext=c.steps[0]?.type==='campaignContext'?c.steps[0]:null;
        if(oldContext&&seedDifficulty!=null&&oldContext.difficulty!==seedDifficulty)
          throw Error('Cannot change an already chosen campaign difficulty');
        const steps=seedDifficulty!=null&&!oldContext?
          [{type:'campaignContext',difficulty:seedDifficulty,assumption:true},...c.steps]:c.steps;
        // An assumed difficulty is chosen BEFORE the first research action.
        // The full source witness must replay under that same fixed context.
        const replay=steps===c.steps?witnessFor(c):
          replayOriginWitness(steps,data,{birthCache,requireCompatibleContext:true});
        if(!replay.ok||!replay.exact||replay.campaignContext?.kind!=='compatible')
          throw Error('Cannot resume source witness with this difficulty: '+c.id+' '+replay.reason);
        return {node:{world:replay.world,trace:replay.trace,steps,diagnostics:[]},result:c};
      };
      const startDepth=resumeFrontier?seedDepth:0;
      let frontier=resumeFrontier?
        candidates.filter(c=>c.transforms.length===startDepth&&
          (!seedId||c.id===seedId)&&
          (!searchOriginalBody||c.finalSoldierType!=='STR_SOLDIER_CHORT'))
          .sort((a,b)=>score12(p,b)-score12(p,a)||a.id.localeCompare(b.id))
          .slice(0,seedLimit).map(fromWitness):
        [{node:acquisition.node,result:acquisition.result}];
      if(resumeFrontier&&!frontier.length)throw Error('No matching seed candidates at transform depth '+startDepth);
      const seenHistory=new Set();
      for(let depth=startDepth;depth<maxLayers&&frontier.length;depth++){
        const next=[];
        for(const entry of frontier){
          const state=entry.node.world.soldiers[0].state;
          // Do not require positive immediate gain in deep search: a neutral
          // transformation may unlock a strictly better later branch.
          const requestedTarget=targetTransforms[depth-startDepth];
          const shortlist=data.transformations.filter(t=>(!requestedTarget||t.id===requestedTarget)&&
            t.allowedSoldierTypes.includes(state.soldierType)&&
            !t.requires.includes('STR_UNAVAILABLE')&&!t.createsClone&&!t.producedItem&&!state.history.has(t.id)&&
            t.minRank<=state.rank&&!Object.keys(t.requiredCommendations||{}).length&&
            !t.forbiddenPreviousTransformations.some(id=>state.history.has(id))&&
            (!researchReadyOnly||t.requires.every(id=>entry.node.world.researched.has(id)&&
              !entry.node.world.disabled.has(id)))&&
            (deep||amount(t.fixedEffectiveDelta)>0))
            .sort((a,b)=>{
              const rank=t=>amount(t.fixedEffectiveDelta)/(1+Math.log2(1+t.requires.reduce((s,id)=>s+(planner.distance.get(id)||10000),0)));
              return rank(b)-rank(a)||a.id.localeCompare(b.id,'en');
            }).slice(0,width);
          for(const t of shortlist){
            const trial=train(t,entry.node);
            if(!trial){attempts.push({training:t.id,result:'UNRESOLVED_OR_NOT_NOW'});continue;}
            const c=candidate(trial,p,'출생 → '+trial.steps.filter(x=>x.type==='transform').map(x=>labels[x.transform]||x.transform).join(' → '));
            if(!c)continue;
            if(!candidates.some(x=>x.id===c.id))candidates.push(c);
            // Two routes with the same transformation history may have
            // different research, disabled topics or month windows. Preserve
            // that future-relevant distinction during extended search.
            const key=c.finalSoldierType+'|'+c.transforms.join('>')+
              (resumeFrontier||transformDepthText!=null?'|'+digest({
                researched:[...trial.world.researched].sort(),
                disabled:[...trial.world.disabled].sort(),
                rank:trial.world.soldiers[0].state.rank,
                month:trial.world.month,
                functions:[...trial.world.baseFunctions].sort(),
                inventory:trial.world.items
              }).slice(0,16):'');
            if(!seenHistory.has(key)){seenHistory.add(key);next.push({node:trial,result:c});}
          }
        }
        // Retain distinct futures, not just the single best current score.
        // This is still a beam search, NOT proof that omitted branches lose.
        next.sort((a,b)=>score12(p,b.result)-score12(p,a.result)||
          b.result.bonusTotal-a.result.bonusTotal||
          a.result.steps.length-b.result.steps.length||
          a.result.id.localeCompare(b.result.id,'en'));
        // Shared terminal Chort must not eliminate all ordinary origin paths.
        // Separating search lanes does not prove either lane is exhaustive.
        const normal=next.filter(x=>x.result.finalSoldierType!=='STR_SOLDIER_CHORT');
        const chort=next.filter(x=>x.result.finalSoldierType==='STR_SOLDIER_CHORT');
        frontier=(resumeFrontier||transformDepthText!=null)?
          [...normal.slice(0,beamWidth),...(searchOriginalBody?[]:chort.slice(0,beamWidth))]:
          next.slice(0,beamWidth);
      }
    }
    candidates.sort((a,b)=>b.total-a.total||a.steps.length-b.steps.length||a.id.localeCompare(b.id));
    const comparable=candidates.filter(c=>auditOriginCampaignContext(c.steps,data).kind==='compatible');
    const best=comparable[0]||null,bestBonus=[...comparable].sort((a,b)=>b.bonusTotal-a.bonusTotal||b.total-a.total)[0]||null;
    // Never prune by present total alone: a lower-scoring branch may preserve
    // prerequisites or transformation options needed for a better future path.
    const keep=[...new Map(candidates.map(c=>[c.id,c])).values()];
    records.push({profileId:p.id,soldierType:p.soldierType,name:p.sourceKoName,soldierName:p.soldierKoName,
      status:best?'PROVISIONAL_CONDITIONAL':'RESEARCH_PATH_UNRESOLVED',certifiedMaximum:false,
      bestCandidateId:best?.id||null,bestBonusCandidateId:bestBonus?.id||null,
      candidates:keep,rejectedCandidates:previous?.rejectedCandidates||[],unresolved:acquisition.unresolved||null,attempts,
      searchScope:!keep.length?unresolvedScope():
        deepSearch?{mode:'bounded-beam',maxLayers:birthOnly?0:unresolvedOnly?1:maxTransforms,
          candidatesPerLayer:branchLimit,beamWidth:8,
          ...(resumeFrontier?{continuation:{seedDepth,seedLimit,seedId,
            originOnly:searchOriginalBody,researchReadyOnly,
            targetTransforms,seedDifficulty,notAllBranchesExplored:true}}:{}),
          globalOptimumProven:false}:
          previous?.searchScope||{mode:'limited-greedy',maxLayers:2,candidatesPerLayer:4,
            beamWidth:1,globalOptimumProven:false},
      birthReference:Object.fromEntries(WITNESS_STATS.map(k=>[k,p.effectiveStats.min[k]])),
      updatePolicy:'동일 출생처·동일 수치 가정에서 재생을 통과한 더 높은 후보만 교체. 조건이 다른 후보는 별도 보존.',
      improvement:previous?.bestCandidateId&&best&&previous.candidates[0]?.total<best.total?
        {from:previous.candidates[0].total,to:best.total}:null});
    console.log((index+1)+'/72 '+p.id+' '+(best?best.total+' ('+best.researchCount+' research)':'UNRESOLVED'));
  }
  const report={schemaVersion:1,kind:'origin-provisional-witnesses',sourceVersion:'v.o2',sourceHash,
    sourceHashes:data.meta.source.rules,scope:{birthBand:'min',growth:false,extraMedals:false,defaultTrainingDepth:2,
      defaultTrainingCandidatesPerLayer:4,globalOptimumProven:false},
    researchVocabularyVersion:1,stats:WITNESS_STATS,
    summary:{profiles:72,withCompleteResearch:records.filter(r=>r.candidates.length).length,
      unresolved:records.filter(r=>!r.candidates.length).length,
      witnesses:records.reduce((s,r)=>s+r.candidates.length,0),certifiedMaxima:0},
    notes:['모든 후보는 빈 연구 상태부터 재생함','잠정값은 자원·출생 RNG 등 가정을 가진 완결 경로의 최고 발견값이며 성장 하드캡이 아님','미완료 프로필에도 출생 원본과 병목을 등록하고 거짓 최종값을 채우지 않음'],records};
  attachMetadata(report,{focused:focusProfile});
  auditCampaignReport(report);
  // Focused writes only replay the changed record. The full independent
  // --check command replays ALL records before every publication.
  validateReport(report,{focused:focusProfile,previous:prior});
  fs.writeFileSync(output,encodeOriginReport(report));
  console.log(JSON.stringify(report.summary));
}
