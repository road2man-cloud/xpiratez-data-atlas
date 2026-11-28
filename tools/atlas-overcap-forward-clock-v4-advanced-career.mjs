// V4.14: extend the timed career clock with source-backed manufacturing.
// Deterministic recipes are represented as a single empty random outcome only
// inside the adapter, allowing the inherited hourly production queue to run them.
import assert from "node:assert/strict";
import {createTimedCareerClock} from "./atlas-overcap-forward-clock-v4-career.mjs";
export const ADVANCED_RECIPES=["STR_TROPHY_TARGET_50_JACK_DA","STR_SPIN_THE_WHEEL","STR_CASINO_KUPON_1_RECLAIM"];
export function createAdvancedCareerClock(data,config){
 const fields={...config.manufactureFields};
 const recipes=[...new Set([...ADVANCED_RECIPES,...(config.additionalRecipes||[])])].map(id=>{
  const f=fields[id];assert(f&&f.time>0&&!f.spawnedPersonType&&!f.producedCraft&&!f.transferTimes&&!f.requiredCrafts);
  const deterministic=!f.randomProducedItems?.length;
  const outcomes=(deterministic?[[1,{}]]:f.randomProducedItems).map(([weight,items])=>({weight,items}));
  assert(outcomes.every(o=>Number.isInteger(o.weight)&&o.weight>0));
  if(deterministic)fields[id]={...f,randomProducedItems:[[1,{}]]};
  return {id,time:f.time,cost:f.cost??0,space:f.space??0,requires:f.requires||[],functions:f.requiresBaseFunc||[],inputs:f.requiredItems||{},fixed:f.producedItems||{},outcomes,totalWeight:outcomes.reduce((n,o)=>n+o.weight,0),deterministic};
 });
 const core=createTimedCareerClock(data,{...config,manufactureFields:fields,persuasionSource:{...config.persuasionSource,recipes:[...config.persuasionSource.recipes,...recipes]}});
 function produce(s,id,item,count=1){
  const r=recipes.find(r=>r.id===id);assert(r);
  const outcome=r.outcomes.findIndex(o=>(Number(o.items[item]||0)+Number(r.fixed[item]||0))===count);
  assert(outcome>=0,"MANUFACTURE_OUTCOME_NOT_IN_SOURCE");
  core.expeditionManufacture(s,id,outcome,Math.min(s.engineers,s.workshopCapacity-r.space));
  s.trace.at(-1).deterministic=r.deterministic;
  s.trace.at(-1).selectedOutput={id:item,count};
  return {id,outcome,weight:r.outcomes[outcome].weight,totalWeight:r.totalWeight,deterministic:r.deterministic};
 }
 return {...core,produce,recipes};
}
