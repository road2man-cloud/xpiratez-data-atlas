// V156: enforce a distinct monthly boundary before each selected scripted
// event. Not a complete monthly economy or exhaustive scheduler simulation.
// OXCE 8.7.1 source archive: GeoscapeState::determineAlienMissions uses
// isNewMonth, selects relevant scripts, then generates one weighted event per
// script. SavedGame::spawnEvent does not reject repeatable weighted events.
import assert from 'node:assert/strict';
import {applyOriginWitnessStep} from '../public/soldiers/modern/origin-witness.js';
import {eventScriptVerdict} from '../public/soldiers/modern/event-chronology.js';
import {exactStateHash} from './origin-pair-exact-prefix-checkpoint.mjs';
const arr=x=>Array.isArray(x)?x:[];
const qty=(w,k)=>Number(w.items[k]||0);
const active=(w,k)=>w.researched.has(k)&&!w.disabled.has(k);
const scripted=a=>['eventResearch','sourceEventItems','sourceRandomEventItem','sourceMonthlyItemEvent','missionResearch'].includes(a.type);
export function createMonthlyWitness(data,rp){
 function advance(s,a={type:'sourceMonthlyBoundary',month:s.world.month+1,assumeElapsed:true}){
  assert(s.root&&rp.settled(s)&&a.type==='sourceMonthlyBoundary'&&a.assumeElapsed===true);
  assert.equal(a.month,s.world.month+1,'Monthly boundaries must be consecutive');
  const r=applyOriginWitnessStep(s.world,{type:'advanceMonth',month:a.month},data);
  assert(r.ok,r.reason);assert.equal(r.world.funds,s.world.funds);
  const w=r.world;
  return {...s,world:w,actions:[...s.actions,a],trace:[...s.trace,{action:a,stateHash:exactStateHash(w),balance:w.funds,conditional:true,evidence:{kind:'SELECTED_MONTHLY_BOUNDARY',month:a.month,elapsedTimeConditional:true,otherEventsUnmodeled:true,monthlyEconomyUnmodeled:true}}]};
 }
 function requireSlot(s,a){
  assert(scripted(a)&&typeof a.script==='string');
  assert.equal(s.actions.at(-1)?.type,'sourceMonthlyBoundary','Selected event must follow its own boundary');
  assert.equal(s.actions.at(-1).month,s.world.month);
  assert(rp.settled(s));
 }
 function applyLegacy(s,a,fn){requireSlot(s,a);return fn(s,a);}
 function adapter(rawEvent,source){
  const id=rawEvent.id,r=rawEvent.raw;
  assert.equal(r.name,id);
  const keys=new Set(['name','description','background','music','everyItemList','everyMultiItemList','randomItemList','timer','timerRandom']);
  assert(Object.keys(r).every(k=>keys.has(k)),'Unmodeled reward or side effect');
  assert(Number.isSafeInteger(r.timer)&&r.timer>=0&&Number.isSafeInteger(r.timerRandom)&&r.timerRandom>=0);
  const fixed={};
  for(const item of arr(r.everyItemList))fixed[item]=(fixed[item]||0)+1;
  for(const [item,n] of Object.entries(r.everyMultiItemList||{})){assert(Number.isSafeInteger(n)&&n>0);fixed[item]=(fixed[item]||0)+n;}
  const pool=arr(r.randomItemList);assert(pool.every(x=>typeof x==='string'));
  if(pool.length)assert(!Object.keys(fixed).length,'Mixed rewards not supported here');
  else{assert(Object.keys(fixed).length);const c=data.forwardSupply.events[id];assert(c&&c.funds===0&&c.points===0&&!c.research.length);assert.deepEqual(c.fixed,fixed);}
  const scripts=[];
  for(const x of arr(rawEvent.scripts)){
   const c=x.conditions||{},t=x.triggerMaps||{};
   // Restrict new production to research-only, repeatable weighted scripts.
   if(Object.keys(c).some(k=>!['firstMonth','lastMonth','executionOdds','minDifficulty','maxDifficulty'].includes(k))||Object.keys(t).some(k=>k!=='researchTriggers'))continue;
   const weights=arr(x.eventWeights).map(b=>({month:Number(b.bucket),weight:arr(b.entries).find(e=>e.eventId===id)?.weight||0,totalWeight:b.totalWeight}));
   if(!weights.length||weights.some(b=>!Number.isSafeInteger(b.month)||!Number.isSafeInteger(b.weight)||!Number.isSafeInteger(b.totalWeight)||b.weight<0||b.totalWeight<b.weight))continue;
   const tr=arr(t.researchTriggers);assert(tr.every(x=>typeof x.value==='boolean'));
   scripts.push({script:x.id,eventId:id,mode:'weighted',firstMonth:c.firstMonth??0,lastMonth:c.lastMonth??null,executionOdds:c.executionOdds??100,otherConditions:Object.fromEntries(Object.entries(c).filter(([k])=>['minDifficulty','maxDifficulty'].includes(k))),researchPositive:tr.filter(x=>x.value).map(x=>x.id),researchNegative:tr.filter(x=>!x.value).map(x=>x.id),monthWeights:weights});
  }
  assert(scripts.length);
  function options(s,item=null){
   if(s.actions.at(-1)?.type!=='sourceMonthlyBoundary'||!rp.settled(s))return [];
   if(pool.length){
    if(!pool.includes(item))return [];
    const grants=arr(data.itemSupply?.[item]?.eventGrants).filter(g=>g.event===id&&arr(g.grants).length===1&&g.grants[0].mode==='randomOneOf'&&g.grants[0].choices===pool.length);
    if(grants.length!==1)return [];
   }else if(item!==null)return [];
   const result=[];
   for(const script of scripts){
    const verdict=eventScriptVerdict(script,s.world,{mode:'current'});
    if(verdict.kind==='blocked'||verdict.unknown.length||verdict.pending.some(x=>x.includes('카운터')))continue;
    const count=Number(s.world.generatedEvents[id]||0)+1;
    const action={type:'sourceMonthlyItemEvent',event:id,script:script.script,month:s.world.month,occurrence:count,randomItem:item,assumeOutcome:true};
    const rewards=pool.length?{[item]:1}:fixed;
    const evidence={kind:'REPEATABLE_WEIGHTED_MONTHLY_EVENT',source,month:s.world.month,occurrence:count,executionOdds:script.executionOdds,weight:verdict.weight,totalWeight:verdict.totalWeight,poolSize:pool.length,matchingSlots:pool.filter(k=>k===item).length,rewards,timer:r.timer,timerRandom:r.timerRandom,deliveryWithinMonthConditional:true,otherEventsUnmodeled:true};
    result.push({action,evidence});
   }return result;
  }
  function apply(s,a){
   requireSlot(s,a);
   const o=options(s,a.randomItem).find(x=>JSON.stringify(x.action)===JSON.stringify(a));assert(o,'Unsupported event or wrong month/occurrence');
   const w=structuredClone(s.world);w.generatedEvents[id]=a.occurrence;
   for(const [item,count] of Object.entries(o.evidence.rewards))w.forwardDeliveries=[...arr(w.forwardDeliveries),{kind:'event',source:id,item,count}];
   return {...s,world:w,actions:[...s.actions,a],trace:[...s.trace,{action:a,stateHash:exactStateHash(w),balance:w.funds,conditional:true,evidence:o.evidence}]};
  }
  return {options,apply,id};
 }
 return {advance,requireSlot,applyLegacy,adapter,scripted};
}
