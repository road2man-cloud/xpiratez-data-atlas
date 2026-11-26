// Conditional explicit independent integer flat-roll witnesses.
// Never modify the source rule index. A concrete outcome is replayed through
// the original campaign gates with only its random-flat interval resolved.
// No uniform probability or exhaustiveness is claimed by these samples.
import assert from "node:assert/strict";
import {STAT_KEYS} from "../public/soldiers/modern/eligibility.js";
import {applyOriginWitnessStep,foundationWorld} from "../public/soldiers/modern/origin-witness.js";
import {createCareerReplay} from "./population-chronological-career-core.mjs";
import {member} from "./population-growth-replay-core.mjs";
import {deterministicRule} from "./population-scalar-upper-bound.mjs";
import {sharedRankData} from "./population-shared-default-rank.mjs";
import {key} from "./population-research-career-core.mjs";
export const FLAT_ROLL_POLICY="INDEPENDENT_INTEGER_FLAT_ROLL_CONDITIONAL_V1";
const fields=["percent","percentGained"],num=(o,k)=>Number(o?.[k]||0);
export function flatRollCatalog(data){
 const bodies=new Map(data.soldiers.map(b=>[b.id,b])),rules=new Map();
 for(const r of data.transformations){
  if(!r.allowsLiveSoldiers||r.createsClone||r.producedItem||r.requires.includes("STR_UNAVAILABLE")||!r.allowedSoldierTypes?.length)continue;
  const dest=r.allowedSoldierTypes.map(k=>bodies.get(r.producedSoldierType||k));
  if(dest.some(b=>!b)||deterministicRule(r,dest))continue;
  if(fields.some(f=>STAT_KEYS.some(k=>num(r[f+"Min"],k)!==num(r[f+"Max"],k)))||STAT_KEYS.some(k=>r.rerollStats?.[k]))continue;
  const lo=Object.fromEntries(STAT_KEYS.map(k=>[k,num(r.flatMin,k)])),hi=Object.fromEntries(STAT_KEYS.map(k=>[k,num(r.flatMax,k)]));
  if(!STAT_KEYS.every(k=>Number.isSafeInteger(lo[k])&&Number.isSafeInteger(hi[k])&&lo[k]<=hi[k]))continue;
  const count=STAT_KEYS.reduce((n,k)=>n*BigInt(hi[k]-lo[k]+1),1n);if(count<=1n)continue;
  rules.set(r.id,{id:r.id,lo,hi,independentRollCount:count.toString(),ruleHash:key(r)});
 }
 return rules;
}
export function flatRollPolicy(data){
 return {id:FLAT_ROLL_POLICY,exactBuildVerified:false,independentIntegerDrawsAssumed:true,exhaustive:false,samples:["MIN","MID","MAX"],rules:[...flatRollCatalog(data).values()]};
}
export function createFlatRollReplay(data,base=createCareerReplay(data),policy=flatRollPolicy(data)){
 const catalog=flatRollCatalog(data);
 assert.deepEqual(policy,flatRollPolicy(data));
 const originalApply=base.apply,originalTransform=base.transform,variants=new Map();
 function resolve(r,roll){
  const c=catalog.get(r.id);assert(c,"Unsupported random rule "+r.id);
  assert(roll&&roll.policy===FLAT_ROLL_POLICY&&roll.ruleHash===c.ruleHash&&roll.flat&&Object.keys(roll.flat).length===STAT_KEYS.length,"Missing or invalid flat-roll evidence");
  for(const k of STAT_KEYS)assert(Number.isSafeInteger(roll.flat[k])&&roll.flat[k]>=c.lo[k]&&roll.flat[k]<=c.hi[k],"Flat roll outside source range "+k);
  const flat=Object.fromEntries(STAT_KEYS.map(k=>[k,roll.flat[k]]));
  return {...r,flatMin:flat,flatMax:flat};
 }
 function samples(r){
  const c=catalog.get(r.id);if(!c)return [];
  return ["MAX","MID","MIN"].map(band=>{
   const flat=Object.fromEntries(STAT_KEYS.map(k=>[k,band==="MAX"?c.hi[k]:band==="MIN"?c.lo[k]:Math.floor((c.lo[k]+c.hi[k])/2)]));
   return {band,policy:FLAT_ROLL_POLICY,ruleHash:c.ruleHash,flat};
  }).filter((x,i,a)=>a.findIndex(y=>key(y.flat)===key(x.flat))===i);
 }
 function apply(w,a){
  if(!a.flatRoll)return originalApply(w,a);
  assert(a.type==="transform"&&a.soldier==="origin"&&a.assumption===true&&!w.pendingFree);
  const r=base.rules.get(a.transform);assert(r);
  const resolved=resolve(r,a.flatRoll),vkey=key([r.id,a.flatRoll.flat]);
  let d=variants.get(vkey);
  if(!d){d={...data,transformations:data.transformations.map(x=>x.id===r.id?resolved:x)};variants.set(vkey,d);if(variants.size>48)variants.delete(variants.keys().next().value);}
  const result=applyOriginWitnessStep(w,a,d);if(!result.ok)throw Error(result.reason);
  assert(member(result.world)?.state.exactStats&&!member(result.world).state.retired,"Invalid resolved random transform");
  return result.world;
 }
 function replay(steps,w=foundationWorld()){for(const a of steps)w=apply(w,a);assert(!w.pendingFree);return w;}
 function transformSample(n,r,roll){
  if(!r.requires.every(k=>base.active(n.world,k)))return null;
  const q=base.meet(n,r);if(!q)return null;
  const w=q.world,items={};
  for(const [id,qty] of Object.entries(r.requiredItems||{})){const lack=Math.max(0,qty-(w.items[id]||0));if(lack)items[id]=lack;}
  const functions=(r.requiresBaseFunc||[]).filter(k=>!w.baseFunctions.has(k)),funds=Math.max(0,(r.cost||0)-w.funds),steps=[];
  if(Object.keys(items).length||functions.length||funds)steps.push({type:"externalInputs",items,functions,funds,reason:"Conditional growth continuation "+r.id,assumption:true});
  steps.push({type:"transform",soldier:"origin",transform:r.id,assumption:true,flatRoll:roll});
  try{return {world:replay(steps,w),steps:[...q.steps,...steps]};}catch{return null;}
 }
 function transformOutcomes(n,r){
  return catalog.has(r.id)?samples(r).map(roll=>({band:roll.band,value:transformSample(n,r,roll)})).filter(x=>x.value):[{band:null,value:originalTransform(n,r)}].filter(x=>x.value);
 }
 const transform=(n,r)=>catalog.has(r.id)?null:originalTransform(n,r);
 return {...base,apply,replay,transform,transformOutcomes,flatRollRules:catalog,concreteRule:r=>catalog.has(r.id)?resolve(r,samples(r)[0]):r};
}
export function createSharedCareerReplay(data,summary={}){
 const d=sharedRankData(data,summary.defaultRankPolicy),base=createCareerReplay(d);
 return summary.flatRollPolicy?createFlatRollReplay(d,base,summary.flatRollPolicy):base;
}
export function flatRollEvidence(actions,policy){
 const rolls=actions.flatMap((a,index)=>a.flatRoll?[{index,transform:a.transform,...a.flatRoll}]:[]);
 return rolls.length?{policy:policy.id,exactBuildVerified:false,exhaustive:false,rolls}:null;
}
