// V158: repeatable fixed-only weighted monthly reward, full indexed cash and stock deltas.
// No invented research grant or same-month event reuse. Raw source and supply catalog must agree.
import assert from 'node:assert/strict';
import {eventScriptVerdict} from '../public/soldiers/modern/event-chronology.js';
import {exactStateHash} from './origin-pair-exact-prefix-checkpoint.mjs';
const arr=x=>Array.isArray(x)?x:[];
const active=(w,k)=>w.researched.has(k)&&!w.disabled.has(k);
const own=(w,k)=>Number(w.items[k]||0);
export function createMonthlyFixedReward(data,rp,monthly,rawEvent,source){
 const id=rawEvent.id,raw=rawEvent.raw,c=data.forwardSupply.events[id];
 assert(raw.name===id);
 assert(Object.keys(raw).every(k=>['name','description','background','music','researchList','everyItemList','everyMultiItemList','funds','points','timer','timerRandom'].includes(k)),'Unsupported event side effects');
 const pool=arr(raw.researchList);assert(c&&pool.length===0);assert.deepEqual(c.research,pool);
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
  const route=c.scripts.find(s=>s.script===x.id&&s.mode==='weighted');
  if(!route)continue;
  const s={...route,eventId:id};
  assert.deepEqual(s.monthWeights,weight);
  assert.deepEqual(s.researchPositive,arr(tr.researchTriggers).filter(x=>x.value===true).map(x=>x.id));
  assert.deepEqual(s.researchNegative,arr(tr.researchTriggers).filter(x=>x.value===false).map(x=>x.id));
  assert.equal(s.firstMonth,cond.firstMonth??0);assert.equal(s.executionOdds,cond.executionOdds??100);assert.equal(s.lastMonth??-1,cond.lastMonth??-1);assert.equal(s.otherConditions?.minDifficulty??0,cond.minDifficulty??0);assert.equal(s.otherConditions?.maxDifficulty??4,cond.maxDifficulty??4);
  scripts.push(s);
 }
 assert(scripts.length);
 function options(s){
  if(s.actions.at(-1)?.type!=='sourceMonthlyBoundary'||!rp.settled(s)||s.world.funds+delta<0)return [];
  const out=[];
  for(const script of scripts){
   const v=eventScriptVerdict(script,s.world,{mode:'current'});
   if(v.kind==='blocked'||v.unknown.length||v.pending.some(x=>x.includes('카운터')))continue;
   const action={type:'sourceMonthlyFixedReward',event:id,script:script.script,month:s.world.month,occurrence:Number(s.world.generatedEvents[id]||0)+1,assumeOutcome:true};
   const evidence={kind:'SOURCE_BOUND_REPEATABLE_MONTHLY_FIXED_REWARD',source,month:s.world.month,executionOdds:script.executionOdds,weight:v.weight,totalWeight:v.totalWeight,rawResearchPoolSize:pool.length,noResearchReward:true,fixed,delta,points,timer:raw.timer,timerRandom:raw.timerRandom,deliveryWithinMonthConditional:true,otherEventsUnmodeled:true};
   out.push({action,evidence});
  }return out;
 }
 function apply(s,a){
  const o=options(s).find(x=>JSON.stringify(x.action)===JSON.stringify(a));assert(o,'Event reward unavailable or exhausted/used monthly slot');
  const w=structuredClone(s.world);w.generatedEvents[id]=a.occurrence;
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
