// V158: replay a repeatable weighted event selecting an already discovered
// research topic with an outstanding getOneFree reward. Narrow safe subset:
// no lookup, no reenable, no spawned items/events, no undiscovered protected
// unlocks. Native GeoscapeEventState.cpp:434-493 and SavedGame.cpp:1455-1499,
// 1535-1615. Source proof is extracted from hash-matched rules, not guessed.
import assert from 'node:assert/strict';
import {eventScriptVerdict} from '../public/soldiers/modern/event-chronology.js';
import {exactStateHash} from './origin-pair-exact-prefix-checkpoint.mjs';
const arr=x=>Array.isArray(x)?x:[];
const active=(w,k)=>w.researched.has(k)&&!w.disabled.has(k);
export function createRepeatedResearchReward(data,rp,rawEvent,eventSource,proof,proofHash){
 assert.equal(proof.schema,'ATLAS_OVERCAP_REPEAT_RESEARCH_SOURCE_V1');
 assert.equal(proof.sourceMetadataSha256,data.meta.source.metadataSha256);
 assert.deepEqual(proof.sourceFiles,data.meta.source.rules);
 const rawBy=new Map(proof.rows.map(r=>[r.id,r.raw]));
 const id=rawEvent.id,raw=rawEvent.raw,c=data.forwardSupply.events[id];
 assert(c&&raw.name===id);
 assert(Object.keys(raw).every(k=>['name','description','background','music','researchList','everyItemList','everyMultiItemList','funds','points','timer','timerRandom'].includes(k)));
 assert.deepEqual(raw.researchList,c.research);
 const fixed={};for(const k of arr(raw.everyItemList))fixed[k]=(fixed[k]||0)+1;
 for(const [k,n] of Object.entries(raw.everyMultiItemList||{})){assert(Number.isSafeInteger(n)&&n>0);fixed[k]=(fixed[k]||0)+n;}
 assert.deepEqual(fixed,c.fixed);
 const delta=raw.funds??0,points=raw.points??0;assert.equal(delta,c.funds);assert.equal(points,c.points);
 assert(Number.isSafeInteger(delta)&&Number.isSafeInteger(points));
 const scripts=[];
 for(const x of arr(rawEvent.scripts)){
  const cond=x.conditions||{},tr=x.triggerMaps||{};
  if(Object.keys(cond).some(k=>!['firstMonth','lastMonth','executionOdds','minDifficulty','maxDifficulty'].includes(k))||Object.keys(tr).some(k=>k!=='researchTriggers'))continue;
  const s=c.scripts.find(s=>s.script===x.id&&s.mode==='weighted');if(!s)continue;
  assert.deepEqual(s.monthWeights,arr(x.eventWeights).map(b=>({month:Number(b.bucket),weight:arr(b.entries).find(e=>e.eventId===id)?.weight||0,totalWeight:b.totalWeight})));
  assert.deepEqual(s.researchPositive,arr(tr.researchTriggers).filter(x=>x.value===true).map(x=>x.id));
  assert.deepEqual(s.researchNegative,arr(tr.researchTriggers).filter(x=>x.value===false).map(x=>x.id));
  assert.equal(s.firstMonth,cond.firstMonth??0);assert.equal(s.lastMonth??-1,cond.lastMonth??-1);assert.equal(s.executionOdds,cond.executionOdds??100);
  assert.equal(s.otherConditions?.minDifficulty??0,cond.minDifficulty??0);assert.equal(s.otherConditions?.maxDifficulty??4,cond.maxDifficulty??4);
  scripts.push(s);
 }
 assert(scripts.length);
 const sourceFields=new Set(['name','cost','points','needItem','destroyItem','unlocks','getOneFree','getOneFreeProtected','requiresBaseFunc','dependencies','sequentialGetOneFree']);
 const freeFields=new Set([...sourceFields,'lookup']);
 function candidates(w,topic){
  const r=data.researchRules[topic],rr=rawBy.get(topic);
  if(!rr||!r||!Object.keys(rr).every(k=>sourceFields.has(k))||!active(w,topic)||r.repeatable||r.lookup||arr(r.reenables).length)return [];
  assert.deepEqual(arr(rr.getOneFree),arr(r.getOneFree));
  assert.deepEqual(rr.getOneFreeProtected||{},r.getOneFreeProtected||{});
  assert.deepEqual(arr(rr.unlocks),arr(r.unlocks));
  assert.equal(!!rr.sequentialGetOneFree,!!r.sequentialGetOneFree);
  if(arr(r.unlocks).some(k=>!active(w,k)&&!w.disabled.has(k)&&arr(data.researchRules[k]?.requires).length))return [];
  return [...arr(r.getOneFree),...Object.entries(r.getOneFreeProtected||{}).filter(([k])=>w.researched.has(k)).flatMap(([,v])=>arr(v))].filter(k=>!w.researched.has(k)&&!w.disabled.has(k));
 }
 function options(s,topic,bonus){
  if(s.actions.at(-1)?.type!=='sourceMonthlyBoundary'||!rp.settled(s)||s.world.funds+delta<0||!raw.researchList.includes(topic))return [];
  const choices=candidates(s.world,topic),b=rawBy.get(bonus);
  if(!choices.includes(bonus)||!b||!Object.keys(b).every(k=>freeFields.has(k)))return [];
  if(data.researchRules[topic].sequentialGetOneFree&&choices[0]!==bonus)return [];
  assert.equal(b.lookup??null,data.researchRules[bonus].lookup??null);
  const out=[];
  for(const script of scripts){
   if(!arr(data.eventResearchSources[topic]).some(e=>e.event===id&&arr(e.scripts).some(t=>t.script===script.script)))continue;
   const v=eventScriptVerdict(script,s.world,{mode:'current'});
   if(v.kind==='blocked'||v.unknown.length||v.pending.some(x=>x.includes('카운터')))continue;
   const action={type:'sourceMonthlyRepeatedResearchReward',event:id,script:script.script,month:s.world.month,occurrence:Number(s.world.generatedEvents[id]||0)+1,research:topic,bonus,assumeOutcome:true};
   const evidence={kind:'REPEAT_EVENT_EXISTING_RESEARCH_FREE_REWARD',eventSource,proofHash,month:s.world.month,executionOdds:script.executionOdds,weight:v.weight,totalWeight:v.totalWeight,remainingFreeChoices:choices,sourceAlreadyDiscovered:true,protectedUnlocksSettled:true,selectedBonus:bonus,fixed,delta,points,otherEventsUnmodeled:true,deliveryWithinMonthConditional:true};
   out.push({action,evidence});
  }
  return out;
 }
 function apply(s,a){
  const o=options(s,a.research,a.bonus).find(x=>JSON.stringify(x.action)===JSON.stringify(a));assert(o,'Unsupported repeated event reward');
  const w=structuredClone(s.world);
  w.generatedEvents[id]=a.occurrence;
  w.pendingFree={source:a.research,choices:o.evidence.remainingFreeChoices,sequential:!!data.researchRules[a.research].sequentialGetOneFree,phase:'after-source'};
  w.funds+=delta;w.forwardEventFunds=Number(w.forwardEventFunds||0)+delta;w.forwardEventPoints=Number(w.forwardEventPoints||0)+points;
  for(const [item,count] of Object.entries(fixed))w.forwardDeliveries=[...arr(w.forwardDeliveries),{kind:'event',source:id,item,count}];
  const income=s.income+Math.max(delta,0),procurement=s.procurement+Math.max(-delta,0);
  assert.equal(w.funds,income-procurement-s.careerSpend);
  return {...s,world:w,income,procurement,actions:[...s.actions,a],trace:[...s.trace,{action:a,evidence:o.evidence,stateHash:exactStateHash(w),balance:w.funds,conditional:true}]};
 }
 return {options,apply};
}
