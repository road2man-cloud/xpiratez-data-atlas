import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {createFoundationResearchPlanner} from '../public/soldiers/modern/foundation-research-planner.js';
import {replayOriginWitness,WITNESS_STATS,originEventScript} from '../public/soldiers/modern/origin-witness.js';
import {bonusStats} from '../public/soldiers/modern/eligibility.js';
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const data=read('public/data/soldiers-modern-index.json');
const ledger=read('public/data/soldier-acquisition-progression-20261102.json');
data.originRows=ledger.rows;
const catalog=read('public/data/soldier-source-catalog.json');
assert.deepEqual(catalog.sourceHashes,data.meta.source.rules);
data.sourceItemIds=new Set(catalog.itemIds);
assert.equal(data.meta.mod.version,'v.o2');assert.equal(data.profiles.length,72);
const output='public/data/soldier-origin-candidates.json';
const digest=x=>crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');
const originSources=ledger.rows.filter(r=>r.kind==='SOURCE_SPAWN').map(r=>({id:r.id,kind:r.kind,prerequisites:{event:r.prerequisites?.event||null}})).sort((a,b)=>a.id.localeCompare(b.id,'en'));
const sourceHash=digest({rules:data.meta.source.rules,profiles:data.profiles,soldiers:data.soldiers,bonuses:data.bonuses,transforms:data.transformations,research:data.researchRules,itemIds:catalog.itemIds,originSources});
const labels=Object.fromEntries([...data.soldiers,...data.transformations,...data.bonuses].map(x=>[x.id,x.koName||x.id]));
for(const p of data.profiles)labels[p.sourceId]=p.sourceKoName;
const amount=x=>WITNESS_STATS.reduce((s,k)=>s+Number(x?.[k]||0),0);
const planner=createFoundationResearchPlanner(data,{maxAttempts:260,maxDepth:38,maxSteps:430});
const unresolvedOnly=process.argv.includes('--unresolved-only');
const focusProfile=process.argv.find(x=>x.startsWith('--profile='))?.slice('--profile='.length)||null;
if(focusProfile&&!data.profiles.some(p=>p.id===focusProfile))
  throw Error('Unknown source profile: '+focusProfile);
function branchEvidence(replay){
  const choices=[],seen=new Set();
  for(const entry of replay.trace)for(const id of entry.added){
    if(seen.has(id))continue;seen.add(id);
    const r=data.researchRules[id];if(!r?.disables?.length)continue;
    choices.push({id,at:entry.index,excludes:r.disables.map(target=>({id:target,
      direction:target===id?'self':data.researchRules[target]?.disables?.includes(id)?'bidirectional':'oneway',
      actuallyClosed:replay.world.disabled.has(target)}))});
  }
  return choices;
}
function candidate(node,p,description){
  const replay=replayOriginWitness(node.steps,data);
  if(!replay.ok||!replay.stats||!replay.exact)return null;
  const member=replay.world.soldiers.find(x=>x.id==='origin');
  const transforms=node.steps.filter(s=>s.type==='transform').map(s=>s.transform);
  const result={id:digest({profile:p.id,steps:node.steps}).slice(0,20),profileId:p.id,
    status:'PROVISIONAL_CONDITIONAL',description,scope:'출생 최솟값 + 성장/훈장 추가 없음 + 실제 규칙을 재생한 훈련 후보',
    researchSequenceComplete:true,startsWithNoResearch:true,certifiedMaximum:false,
    raw:replay.raw,bonus:Object.fromEntries(WITNESS_STATS.map(k=>[k,replay.bonus[k]||0])),
    stats:replay.stats,total:replay.total,bonusTotal:amount(replay.bonus),
    finalSoldierType:member.state.soldierType,transforms,steps:node.steps,
    researchCount:new Set(replay.trace.flatMap(t=>t.added)).size,
    branchChoices:branchEvidence(replay),
    trainingExclusions:transforms.map(id=>({id,excludes:data.transformations.filter(t=>t.forbiddenPreviousTransformations.includes(id)).map(t=>({id:t.id,
      direction:data.transformations.find(t=>t.id===id).forbiddenPreviousTransformations.includes(t.id)?'bidirectional':'oneway'}))})),
    assumptions:node.steps.filter(s=>s.type==='externalInputs'||s.assumeOutcome||s.type==='recruit'||s.type==='advanceMonth'),
    guarantees:['기초 연구 상태부터 공급 경로 없이 추가한 연구 플래그 없음','모든 연구·무료 지급·자동 큐·시술은 기존 재생기로 검사','서로 다른 병사의 성장·훈장·보너스 합산 없음'],
    limitations:['자금·표본·시설 실물 확보 조건부','출생 RNG와 이벤트 실제 발생 미실측','전투·체육관 성장 및 훈장 획득 경로 미포함','다른 경로보다 크다는 전역 최적성 미증명']};
  return result;
}
function obtain(p){
  const row=ledger.rows.find(r=>r.id===p.id),alternatives=p.sourceType==='event'?row.prerequisites.event?.alternatives||[]:[null];
  let last=null;
  for(const alt of alternatives){
    let node=planner.newNode();
    const event=alt?originEventScript(alt,p.sourceId):null;
    const goals=[...p.requires,...(event?.researchPositive||[])];
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
      found.push({id,kind:'NOT_INDEXED',reason:'현재 색인에 직접 연구 공급 경로가 없음. 일회성 이벤트·임무 지급 등 별도 출처 검증 필요'});
      continue;
    }
    if(!methods.length){
      found.push({id,kind:'NO_SUPPLY_METHOD',reason:'연구실·직접 해금·무료 지급·이벤트 공급 경로 미확보'});
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
function validateReport(report){
  assert.equal(report.sourceHash,sourceHash);assert.equal(report.records.length,72);
  assert.equal(new Set(report.records.map(r=>r.profileId)).size,72);
  let complete=0;
  for(const record of report.records){
    assert(data.profiles.some(p=>p.id===record.profileId));
    assert.equal(record.certifiedMaximum,false);
    for(const c of record.candidates){
      const replay=replayOriginWitness(c.steps,data);assert(replay.ok,record.profileId+': '+replay.reason);
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
function attachMetadata(report){
  for(const r of report.records){
    const proof=ledger.rows.find(x=>x.id===r.profileId);
    r.sourceProof={id:proof.id,kind:proof.kind,prerequisites:{event:proof.prerequisites?.event||null}};
    r.researchBottlenecks=researchBottlenecks(r);
    r.bottleneckHash=r.researchBottlenecks.length?digest({profileId:r.profileId,
      unresolved:r.unresolved,gates:r.researchBottlenecks}):null;
    for(const c of r.candidates){
      const replay=replayOriginWitness(c.steps,data);
      if(!replay.ok)throw Error('기존 후보 재생 중단: '+r.profileId+' '+replay.reason);
      c.modelAssumptions=[...new Set(replay.trace.flatMap(t=>t.notes||[]).filter(n=>/미검증|미증명|가상|재실행/.test(n)))];
      c.limitations=[...new Set([...c.limitations,'연구·제조·회복 소요시간과 월별 유지비의 달력 재생 미포함','반복 lookup 보호 해금·동시 연구 완료는 상세 조건부 가정'])];
      c.resultHash=digest({steps:c.steps,raw:c.raw,stats:c.stats,total:c.total,branches:c.branchChoices});
    }
  }
  return report;
}
if(process.argv.includes('--refresh-metadata')){
  const report=attachMetadata(read(output));report.sourceHash=sourceHash;fs.writeFileSync(output,JSON.stringify(report)+'\n');
  console.log('Updated candidate evidence fingerprints and exact v.o2 birth guards');
}else if(process.argv.includes('--check')){
  const report=read(output);const checked=validateReport(report);
  console.log('PASS origin provisional registry: 72 original profiles, '+checked+' complete conditional witnesses; no fake research flags or certified maxima');
}else{
  const prior=fs.existsSync(output)?read(output):null;
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
    const candidates=(previous?.candidates||[]).filter(c=>{const r=replayOriginWitness(c.steps,data);return r.ok&&r.exact&&JSON.stringify(r.stats)===JSON.stringify(c.stats)});
    const acquisition=obtain(p);const attempts=[];
    if(acquisition.result){
      if(!candidates.some(c=>c.id===acquisition.result.id))candidates.push(acquisition.result);
      let node=acquisition.node;
      for(let depth=0;depth<(unresolvedOnly?1:2);depth++){
        const state=node.world.soldiers[0].state;
        const shortlist=data.transformations.filter(t=>t.allowedSoldierTypes.includes(state.soldierType)&&
          !t.requires.includes('STR_UNAVAILABLE')&&!t.createsClone&&!t.producedItem&&!state.history.has(t.id)&&
          t.minRank<=state.rank&&!Object.keys(t.requiredCommendations||{}).length&&
          !t.forbiddenPreviousTransformations.some(id=>state.history.has(id))&&
          amount(t.fixedEffectiveDelta)>0)
          .sort((a,b)=>{
            const rank=t=>amount(t.fixedEffectiveDelta)/(1+Math.log2(1+t.requires.reduce((s,id)=>s+(planner.distance.get(id)||10000),0)));
            return rank(b)-rank(a);
          }).slice(0,4);
        let better=null;
        for(const t of shortlist){
          const trial=train(t,node);if(!trial){attempts.push({training:t.id,result:'UNRESOLVED_OR_NOT_NOW'});continue;}
          const c=candidate(trial,p,'출생 → '+trial.steps.filter(x=>x.type==='transform').map(x=>labels[x.transform]||x.transform).join(' → '));
          if(!c)continue;
          if(!candidates.some(x=>x.id===c.id))candidates.push(c);
          if(!better||c.total>better.result.total)better={node:trial,result:c};
        }
        if(!better)break;node=better.node;
      }
    }
    candidates.sort((a,b)=>b.total-a.total||a.steps.length-b.steps.length||a.id.localeCompare(b.id));
    const best=candidates[0]||null,bestBonus=[...candidates].sort((a,b)=>b.bonusTotal-a.bonusTotal||b.total-a.total)[0]||null;
    // Never prune by present total alone: a lower-scoring branch may preserve
    // prerequisites or transformation options needed for a better future path.
    const keep=[...new Map(candidates.map(c=>[c.id,c])).values()];
    records.push({profileId:p.id,soldierType:p.soldierType,name:p.sourceKoName,soldierName:p.soldierKoName,
      status:best?'PROVISIONAL_CONDITIONAL':'RESEARCH_PATH_UNRESOLVED',certifiedMaximum:false,
      bestCandidateId:best?.id||null,bestBonusCandidateId:bestBonus?.id||null,
      candidates:keep,unresolved:acquisition.unresolved||null,attempts,
      birthReference:Object.fromEntries(WITNESS_STATS.map(k=>[k,p.effectiveStats.min[k]])),
      updatePolicy:'동일 출생처·동일 수치 가정에서 재생을 통과한 더 높은 후보만 교체. 조건이 다른 후보는 별도 보존.',
      improvement:previous?.bestCandidateId&&best&&previous.candidates[0]?.total<best.total?
        {from:previous.candidates[0].total,to:best.total}:null});
    console.log((index+1)+'/72 '+p.id+' '+(best?best.total+' ('+best.researchCount+' research)':'UNRESOLVED'));
  }
  const report={schemaVersion:1,kind:'origin-provisional-witnesses',sourceVersion:'v.o2',sourceHash,
    sourceHashes:data.meta.source.rules,scope:{birthBand:'min',growth:false,extraMedals:false,trainingDepth:2,trainingCandidatesPerLayer:4},
    researchVocabularyVersion:1,stats:WITNESS_STATS,
    summary:{profiles:72,withCompleteResearch:records.filter(r=>r.candidates.length).length,
      unresolved:records.filter(r=>!r.candidates.length).length,
      witnesses:records.reduce((s,r)=>s+r.candidates.length,0),certifiedMaxima:0},
    notes:['모든 후보는 빈 연구 상태부터 재생함','잠정값은 자원·출생 RNG 등 가정을 가진 완결 경로의 최고 발견값이며 성장 하드캡이 아님','미완료 프로필에도 출생 원본과 병목을 등록하고 거짓 최종값을 채우지 않음'],records};
  attachMetadata(report);
  validateReport(report);
  fs.writeFileSync(output,JSON.stringify(report)+'\n');
  console.log(JSON.stringify(report.summary));
}
