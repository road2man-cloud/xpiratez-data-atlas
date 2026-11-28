// V157: repeatable weighted monthly event with exact raw research pool,
// complete fixed rewards and signed cash delta. No same-boundary reuse.
// OXCE GeoscapeEventState.cpp:434ff chooses a research candidate from
// undiscovered topics or topics with outstanding free research. This adapter
// supports a new topic or a proven exhausted pool, never a guessed reward.
import assert from 'node:assert/strict';
import {applyOriginWitnessStep} from '../public/soldiers/modern/origin-witness.js';
import {eventScriptVerdict} from '../public/soldiers/modern/event-chronology.js';
import {exactStateHash} from './origin-pair-exact-prefix-checkpoint.mjs';
const arr=x=>Array.isArray(x)?x:[];
const active=(w,k)=>w.researched.has(k)&&!w.disabled.has(k);
const own=(w,k)=>Number(w.items[k]||0);
export function createMonthlyResearchReward(data,rp,monthly,rawEvent,source){
 const id=rawEvent.id,raw=rawEvent.raw,c=data.forwardSupply.events[id];
 assert(raw.name===id);
 assert(Object.keys(raw).every(k=>['name','description','background','music','researchList','everyItemList','everyMultiItemList','funds','points','timer','timerRandom'].includes(k)),'Unsupported event side effects');
 const pool=arr(raw.researchList);assert(pool.length&&pool.every(k=>data.researchRules[k]));if(c)assert.deepEqual(c.research,pool);
 const fixed={};for(const k of arr(raw.everyItemList))fixed[k]=(fixed[k]||0)+1;
 for(const [k,n] of Object.entries(raw.everyMultiItemList||{})){assert(Number.isSafeInteger(n)&&n>0);fixed[k]=(fixed[k]||0)+n;}
 if(c)assert.deepEqual(c.fixed,fixed);
 const delta=raw.funds??0,points=raw.points??0;assert(Number.isSafeInteger(delta)&&Number.isSafeInteger(points));if(c){assert.equal(c.funds,delta);assert.equal(c.points,points);}
 const scripts=[];
 for(const x of arr(rawEvent.scripts)){
  const cond=x.conditions||{},tr=x.triggerMaps||{};
  if(Object.keys(cond).some(k=>!['firstMonth','lastMonth','executionOdds','minDifficulty','maxDifficulty'].includes(k))||Object.keys(tr).some(k=>k!=='researchTriggers'))continue;
  const weight=arr(x.eventWeights).map(b=>({month:Number(b.bucket),weight:arr(b.entries).find(e=>e.eventId===id)?.weight||0,totalWeight:b.totalWeight}));
  if(!weight.length||!weight.every(b=>Number.isSafeInteger(b.month)&&Number.isSafeInteger(b.weight)&&Number.isSafeInteger(b.totalWeight)&&b.weight>=0&&b.totalWeight>=b.weight))continue;
  // A missing aggregate supply entry is not proof of absence. The raw
  // reward and independent research-event index both have to match.
  const indexed=pool.flatMap(k=>arr(data.eventResearchSources[k]).filter(e=>e.event===id).flatMap(e=>arr(e.scripts)));
  const route=indexed.find(s=>s.script===x.id&&s.mode==='weighted');
  if(!route)continue;
  const s={...(c?.scripts.find(s=>s.script===x.id&&s.mode==='weighted')||route),eventId:id};
  assert.deepEqual(s.monthWeights,weight);
  assert.deepEqual(s.researchPositive,arr(tr.researchTriggers).filter(x=>x.value===true).map(x=>x.id));
  assert.deepEqual(s.researchNegative,arr(tr.researchTriggers).filter(x=>x.value===false).map(x=>x.id));
  assert.equal(s.firstMonth,cond.firstMonth??0);assert.equal(s.executionOdds,cond.executionOdds??100);assert.equal(s.lastMonth??-1,cond.lastMonth??-1);assert.equal(s.otherConditions?.minDifficulty??0,cond.minDifficulty??0);assert.equal(s.otherConditions?.maxDifficulty??4,cond.maxDifficulty??4);
  scripts.push(s);
 }
 assert(scripts.length);
 const exhausted=(w,k)=>{
  const r=data.researchRules[k];
  return active(w,k)&&!arr(r.getOneFree).some(x=>!active(w,x))&&!Object.values(r.getOneFreeProtected||{}).flat().some(x=>!active(w,x));
 };
 function options(s,topic){
  if(s.actions.at(-1)?.type!=='sourceMonthlyBoundary'||!rp.settled(s)||s.world.funds+delta<0)return [];
  if(topic===null){if(!pool.every(k=>exhausted(s.world,k)))return [];}
  else if(!pool.includes(topic)||s.world.researched.has(topic)||s.world.disabled.has(topic))return [];
  const out=[];
  for(const script of scripts){
   const v=eventScriptVerdict(script,s.world,{mode:'current'});
   if(v.kind==='blocked'||v.unknown.length||v.pending.some(x=>x.includes('카운터')))continue;
   if(topic!==null&&!arr(data.eventResearchSources[topic]).some(e=>e.event===id&&arr(e.scripts).some(r=>r.script===script.script)))continue;
   const action={type:'sourceMonthlyResearchReward',event:id,script:script.script,month:s.world.month,occurrence:Number(s.world.generatedEvents[id]||0)+1,research:topic,assumeOutcome:true};
   const evidence={kind:'SOURCE_BOUND_REPEATABLE_MONTHLY_RESEARCH_REWARD',source,month:s.world.month,executionOdds:script.executionOdds,weight:v.weight,totalWeight:v.totalWeight,rawResearchPoolSize:pool.length,poolExhausted:topic===null,fixed,delta,points,timer:raw.timer,timerRandom:raw.timerRandom,deliveryWithinMonthConditional:true,otherEventsUnmodeled:true};
   out.push({action,evidence});
  }return out;
 }
 function apply(s,a){
  const o=options(s,a.research).find(x=>JSON.stringify(x.action)===JSON.stringify(a));assert(o,'Event reward unavailable or exhausted/used monthly slot');
  let w;
  if(a.research===null){w=structuredClone(s.world);w.generatedEvents[id]=a.occurrence;}
  else{
   const r=applyOriginWitnessStep(s.world,{type:'eventResearch',research:a.research,event:id,script:a.script,assumeOutcome:true},data);
   assert(r.ok,r.reason);w=r.world;
   assert.equal(w.generatedEvents[id],a.occurrence);
  }
  assert.equal(w.funds,s.world.funds);
  w.funds+=delta;
  w.forwardEventFunds=Number(w.forwardEventFunds||0)+delta;
  w.forwardEventPoints=Number(w.forwardEventPoints||0)+points;
  for(const [item,count] of Object.entries(fixed))w.forwardDeliveries=[...arr(w.forwardDeliveries),{kind:'event',source:id,item,count}];
  const income=s.income+Math.max(delta,0),procurement=s.procurement+Math.max(-delta,0);
  assert.equal(w.funds,income-procurement-s.careerSpend);
  return {...s,world:w,income,procurement,actions:[...s.actions,a],trace:[...s.trace,{action:a,evidence:o.evidence,stateHash:exactStateHash(w),balance:w.funds,conditional:true}]};
 }
 return {id,pool,options,apply};
}
