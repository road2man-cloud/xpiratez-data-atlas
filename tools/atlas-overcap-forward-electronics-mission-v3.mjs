// Source-bound conditional mission recoveries. Only exact catalog outcomes
// are supported; no caller-provided quantities, no duplicate mission harvest.
// The world records partial inventory projection, not an actual debrief.
import assert from "node:assert/strict";
import {eventScriptVerdict} from "../public/soldiers/modern/event-chronology.js";
import {key} from "./population-research-career-core.mjs";
const arr=x=>Array.isArray(x)?x:[],qty=(w,k)=>Number(w.items[k]||0);
const active=(w,k)=>w.researched.has(k)&&!w.disabled.has(k);
const all=(w,ids)=>arr(ids).every(k=>active(w,k));
export function createElectronicsMissionSupply(data,engine,source){
 assert.equal(source.schema,"ATLAS_FORWARD_ELECTRONICS_MISSION_SOURCES_V3");
 assert.equal(source.sourceMetadataSha256,data.meta.source.metadataSha256);
 const missions=source.missions,recipe=source.recipe;
 assert.equal(new Set(missions.map(m=>m.route.deployment)).size,missions.length);
 for(const m of missions){
  for(const [k,v] of Object.entries(m.loot))assert(source.recoverable[k]?.nativeDefaultRecover&&Number.isSafeInteger(v)&&v>0);
  if(m.pool){assert(m.pool.mixed&&m.pool.selected.length===m.pool.amount);for(const k of m.pool.selected)assert(m.pool.items.includes(k));assert.deepEqual(Object.fromEntries([...new Set(m.pool.selected)].map(k=>[k,m.pool.selected.filter(v=>v===k).length])),m.loot);}
  if(m.enemyEquipment){const e=m.enemyEquipment;assert(e.selectedDistinctUnits<=e.minimumQuantity);assert.equal(m.loot.STR_WASTELANDER_BACKPACK,e.selectedDistinctUnits*e.itemSet.filter(k=>k==="STR_WASTELANDER_BACKPACK").length);assert.equal(m.fixedItem.count,m.loot[m.fixedItem.id]);}
 }
 function missionOption(w,m,root){
  const r=m.route,s=r.missionConditions;
  if(w.pendingFree||arr(w.forwardDeliveries).length||w.completedMissions?.has(r.deployment)||arr(w.forwardMissionReceipts).some(x=>x.deployment===r.deployment))return null;
  if(r.extraTriggerFields.length||arr(s.itemNegative).length||r.reasons.some(k=>k!=="RANDOM_MAP_POOL_REQUIRES_EXPLICIT_OUTCOME"))return null;
  const triggerItems={...w.otherItems};for(const [k,n] of Object.entries(w.items))triggerItems[k]=Number(triggerItems[k]||0)+n;
  const v=eventScriptVerdict({...s,mode:"fixed",eventId:"MISSION:"+r.deployment},{...w,triggerItems,triggerFacilities:w.globalFacilities},{mode:"current"});
  if(v.kind==="blocked"||v.unknown.length||v.pending.some(k=>k.includes("카운터")))return null;
  const bucket=arr(s.monthWeights).filter(x=>x.month<=w.month).sort((a,b)=>a.month-b.month).at(-1);
  if(!bucket||!(bucket.weight>0))return null;
  if(m.enemyEquipment){
   const e=m.enemyEquipment,row=e.alienItemLevels[Math.min(w.month,e.alienItemLevels.length-1)];
   if(!row?.includes(e.itemSetIndex))return null;
  }
  let reward=null;
  if(r.successResearch){
   if(w.researched.has(r.successResearch)||w.disabled.has(r.successResearch))return null;
   reward=engine.options(w,root).choices.find(x=>x.action.type==="missionResearch"&&x.action.research===r.successResearch&&x.action.deployment===r.deployment&&x.action.script===r.missionScript);
   if(!reward)return null;
  }
  return {action:{type:"sourceMissionRecovery",source:m.id,assumeMissionOutcome:true,assumeRecovered:true},evidence:{kind:"SOURCE_CONDITIONAL_MISSION_RECOVERY",deployment:r.deployment,missionScript:r.missionScript,terrain:r.terrain,mapScript:r.actualScript,block:r.block,executionOdds:s.executionOdds,month:w.month,loot:m.loot,pool:m.pool||null,enemyEquipment:m.enemyEquipment||null,startingCondition:r.startingCondition,successResearch:r.successResearch,successReward:reward?.action||null,assumptions:m.assumptions,partialInventory:true}};
 }
 function recipeOption(w){
  if(w.pendingFree||arr(w.forwardDeliveries).length||!all(w,recipe.requires)||!arr(recipe.functions).every(k=>w.baseFunctions.has(k))||!Object.entries(recipe.inputs).every(([k,n])=>qty(w,k)>=n))return null;
  const o=recipe.outcomes[recipe.stunOutcome];assert(o&&o.weight>0);
  return {action:{type:"sourceMissionSampleExtraction",id:recipe.id,outcome:recipe.stunOutcome,assumeOutcome:true},evidence:{kind:"SOURCE_WEIGHTED_MANUFACTURE_OUTCOME",requires:recipe.requires,functions:recipe.functions,inputs:recipe.inputs,fixed:recipe.fixed,random:o.items,weight:o.weight,totalWeight:recipe.totalWeight,time:recipe.time,cost:recipe.cost,space:recipe.space}};
 }
 function options(w,root){
  if(!root)return [];
  return [...missions.map(m=>missionOption(w,m,root)),recipeOption(w)].filter(Boolean);
 }
 function apply(w,a,root){
  const opt=options(w,root).find(x=>key(x.action)===key(a));assert(opt,"No currently supported source outcome");
  const e=opt.evidence;
  let next=structuredClone(w);
  if(a.type==="sourceMissionRecovery"){
   // Success research is granted by the existing engine, never direct
   // insertion. Loot and mission win constitute a single modeled outcome.
   if(e.successReward)next=engine.apply(w,e.successReward,root).world;
   if(!next.completedMissions)next.completedMissions=new Set();
   next.completedMissions.add(e.deployment);
   for(const [k,n] of Object.entries(e.loot))next.items[k]=qty(next,k)+n;
   next.forwardMissionReceipts=[...arr(next.forwardMissionReceipts),{source:a.source,deployment:e.deployment,script:e.missionScript,month:w.month,loot:e.loot}];
   next.forwardPartialMissionRecovery=true;
   return {world:next,notes:["Source-bounded conditional mission appearance, placement, victory, recovery. Tracked loot only; no actual game evidence.",...e.assumptions],conditional:true};
  }
  assert.equal(a.type,"sourceMissionSampleExtraction");
  for(const [k,n] of Object.entries(e.inputs))next.items[k]=qty(next,k)-n;
  for(const out of [e.fixed,e.random])for(const [k,n] of Object.entries(out))next.items[k]=qty(next,k)+n;
  return {world:next,notes:["Original recipe: inputs consumed, fixed outputs plus one weighted random outcome. Labor and elapsed time conditional."],conditional:true};
 }
 return {options,apply};
}
