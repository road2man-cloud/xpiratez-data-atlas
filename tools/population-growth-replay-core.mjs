// Explicit conditional growth extension. The original campaign verifier and
// its fingerprints remain untouched; a growth step is NOT actual gameplay.
import assert from "node:assert/strict";
import {applyOriginWitnessStep,foundationWorld} from "../public/soldiers/modern/origin-witness.js";
import {STAT_KEYS,bonusStats} from "../public/soldiers/modern/eligibility.js";
import {scalarGrowth,deterministicRule} from "./population-scalar-upper-bound.mjs";
import {exactStateHash} from "./origin-pair-exact-prefix-checkpoint.mjs";
export const MODEL="CHRONOLOGICAL_CONDITIONAL_CAP_GROWTH_V1";
export const member=w=>w.soldiers.find(s=>s.id==="origin");
export function createGrowthReplay(data){
 const bodies=new Map(data.soldiers.map(b=>[b.id,b]));
 const rules=new Map(data.transformations.map(r=>[r.id,r]));
 const active=(w,k)=>w.researched.has(k)&&!w.disabled.has(k);
 const vec=s=>STAT_KEYS.map(k=>s[k]||0);
 function finish(w){
  const m=member(w);assert(m?.state.exactStats&&!m.state.retired);
  const raw=vec(m.state.currentStats),bonus=vec(bonusStats(m.state,data,{commendations:m.commendations||{}}));
  assert([...raw,...bonus].every(Number.isSafeInteger));
  const effective=v=>v.map((x,i)=>STAT_KEYS[i]==="psiSkill"&&x<=0&&bonus[i]>0?x:Math.max(STAT_KEYS[i]==="health"?1:0,x+bonus[i]));
  const capRaw=raw.map((v,i)=>scalarGrowth(bodies.get(m.state.soldierType),STAT_KEYS[i],v,data));
  return {body:m.state.soldierType,raw,bonus,vector:effective(raw),capRaw,capVector:effective(capRaw)};
 }
 function apply(w,step){
  if(step.type!=="conditionalCapGrowth"){
   const r=applyOriginWitnessStep(w,step,data);if(!r.ok)throw Error(r.reason);
   if(step.type==="transform"){const m=member(r.world);assert(m?.state.exactStats&&!m.state.retired,"Nonexact or retired transformation");}
   return r.world;
  }
  assert(step.assumption===true&&step.soldier==="origin"&&!w.pendingFree);
  const m=member(w);assert(m?.state.exactStats&&!m.state.retired&&m.state.status==="healthy","Growth requires live exact state");
  const next=structuredClone(w),s=member(next).state,b=bodies.get(s.soldierType);assert(b);
  s.currentStats=Object.fromEntries(STAT_KEYS.map(k=>[k,scalarGrowth(b,k,s.currentStats[k],data)]));
  assert(STAT_KEYS.every(k=>Number.isSafeInteger(s.currentStats[k])));
  return next;
 }
 const growth={type:"conditionalCapGrowth",soldier:"origin",assumption:true};
 function grow(n){
  const w=apply(n.world,growth),before=member(n.world).state.currentStats,after=member(w).state.currentStats;
  if(STAT_KEYS.every(k=>before[k]===after[k]))return n;
  return {world:w,steps:[...n.steps,growth]};
 }
 function replay(steps,w=foundationWorld()){
  for(const step of steps)w=apply(w,step);
  assert(!w.pendingFree);return w;
 }
 function transform(n,r){
  if(!r.allowsLiveSoldiers||r.createsClone||r.producedItem||!r.requires.every(k=>active(n.world,k)))return null;
  const m=member(n.world),b=bodies.get(r.producedSoldierType||m.state.soldierType);
  if(!b||!deterministicRule(r,[b]))return null;
  const w=n.world,items={};
  for(const [id,qty] of Object.entries(r.requiredItems||{})){const lack=Math.max(0,qty-(w.items[id]||0));if(lack)items[id]=lack;}
  const functions=(r.requiresBaseFunc||[]).filter(k=>!w.baseFunctions.has(k)),funds=Math.max(0,(r.cost||0)-w.funds);
  const steps=[];
  if(Object.keys(items).length||functions.length||funds)steps.push({type:"externalInputs",items,functions,funds,reason:"Conditional growth continuation "+r.id,assumption:true});
  steps.push({type:"transform",soldier:"origin",transform:r.id});
  try{return {world:replay(steps,w),steps:[...n.steps,...steps]};}catch{return null;}
 }
 return {finish,apply,grow,replay,transform,rules,bodies,growth,active};
}
export function birthActions(db,r){
 const ledger=r.kind==="unlock"?db.originUnlockSearch:db.originEventBirth;
 const p=r.kind==="unlock"?ledger.pairs[r.pair]:ledger.variants[r.input.slice(6)];
 assert(p&&p.origin===r.origin&&p.branch===r.branch&&p.root===r.root);
 const root=ledger.roots[r.root].actions;
 return {p,steps:r.kind==="unlock"?[...root,...p.suffix]:[...root.slice(0,p.insertionAt),...p.extraBeforeBirth,...p.inserted,...root.slice(p.insertionAt)]};
}
export function statStateKey(w){
 const m=member(w),s=m.state;
 // ONLY a within-seed heuristic deduplication signature. Full-world
 // reachability witnesses are independently replayed; not a proof quotient.
 return JSON.stringify([s.soldierType,s.armorId,s.status,s.rank,s.initialStats,s.currentStats,[...s.history].sort(),[...s.bonusCounts].sort(),m.commendations,[...w.researched].sort(),[...w.disabled].sort(),w.items,w.funds,[...w.baseFunctions].sort()]);
}
export const exactWorld=exactStateHash;
