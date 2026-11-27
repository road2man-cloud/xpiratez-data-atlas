// Additive source-bound adapter: same-soldier death/recovery/revival.
// The preserved OXCE source proves the post-transformation lifecycle,
// not that a particular tactical death, corpse recovery or transfer occurred.
// Existing healthy actions are unchanged; clones and item conversions stay open.
import assert from "node:assert/strict";
import fs from "node:fs";
import {createHash} from "node:crypto";
import {createSharedCareerReplay as legacySharedReplay} from "./population-shared-flat-roll.mjs";
import {deterministicRule} from "./population-scalar-upper-bound.mjs";
import {key} from "./population-research-career-core.mjs";
import {member} from "./population-growth-replay-core.mjs";
import {foundationWorld} from "../public/soldiers/modern/origin-witness.js";
export {flatRollEvidence,flatRollPolicy} from "./population-shared-flat-roll.mjs";
export const LIFECYCLE_POLICY="SAME_SOLDIER_CONDITIONAL_RESURRECTION_OXCE_871_V1";
const archive="tools/headless-simulator/native/oxce-source.tar.gz";
const archiveSha256="4319b0ee922adf9b97ecdc8984b881a6b351b60ca5f3ea921839fb4c30aa02fb";
const sourceMetadata="a16408dc92af6f7377511843533c12749fbb43c79508b8c194f9680ca49c751e";
const validTime=n=>Number.isSafeInteger(n)&&n>=0;
export function verifyLifecycleEngineSource(){
 const lock=JSON.parse(fs.readFileSync("tools/headless-simulator/native/source.lock.json","utf8"));
 assert.equal(lock.engineVersion,"Extended 8.7.1");
 assert.equal(lock.archiveSha256,archiveSha256);
 assert.equal(createHash("sha256").update(fs.readFileSync(archive)).digest("hex"),archiveSha256);
}
export function lifecyclePolicy(data){
 assert.equal(data.meta.source.metadataSha256,sourceMetadata);
 assert.equal(data.meta.mod.version,"v.o2");
 const bodies=new Map(data.soldiers.map(b=>[b.id,b]));
 const rules=data.transformations.filter(r=>!r.allowsLiveSoldiers&&r.allowsDeadSoldiers&&!r.createsClone&&!r.producedItem&&!r.requires.includes("STR_UNAVAILABLE")&&r.allowedSoldierTypes?.length&&validTime(r.transferTime)&&validTime(r.recoveryTime)&&r.allowedSoldierTypes.every(id=>{const d=bodies.get(r.producedSoldierType||id);return d&&deterministicRule(r,[d]);})).map(r=>({
  id:r.id,ruleHash:key(r),needsCorpseRecovered:!!r.needsCorpseRecovered,
  transferHours:r.transferTime>0?r.transferTime:24,recoveryDays:r.recoveryTime
 }));
 return {id:LIFECYCLE_POLICY,sourceMetadataSha256:sourceMetadata,engine:{version:"Extended 8.7.1",archive,archiveSha256,exactInstalledExecutableMatchVerified:false,anchors:["src/Savegame/Soldier.cpp: Soldier::die, Soldier::isEligibleForTransformation, Soldier::transform","src/Basescape/SoldierTransformationState.cpp: SoldierTransformationState::performTransformation","src/Savegame/Transfer.cpp: Transfer::advance"]},scope:"Conditional same-soldier death, required corpse recovery, sufficient quarters, transfer and recovery elapsed; tactical acquisition, exact dates and executable parity not certified.",rules};
}
export function lifecycleEvidence(actions,policy){
 const steps=actions.flatMap((a,index)=>a.lifecycle?[{index,transform:a.transform,...a.lifecycle}]:[]);
 return steps.length?{policy:policy.id,actualGameCertified:false,steps}:null;
}
export function createLifecycleReplay(data,base,policy=lifecyclePolicy(data)){
 assert.deepEqual(policy,lifecyclePolicy(data));
 const supported=new Map(policy.rules.map(r=>[r.id,r]));
 const originalApply=base.apply,originalTransform=base.transform,originalOutcomes=base.transformOutcomes;
 function eventFor(id){
  const p=supported.get(id);assert(p,"Unindexed resurrection "+id);
  return {policy:policy.id,ruleHash:p.ruleHash,deathAssumed:true,corpseRecovered:p.needsCorpseRecovered,quartersAvailableAssumed:true,transferHours:p.transferHours,recoveryDays:p.recoveryDays,recoveryCompletedAssumed:true};
 }
 function apply(w,a){
  if(!a.lifecycle)return originalApply(w,a);
  assert(a.type==="transform"&&a.soldier==="origin"&&a.assumption===true&&!w.pendingFree&&!a.flatRoll,"Invalid lifecycle action");
  const r=base.rules.get(a.transform),s=member(w)?.state;
  assert(r&&s?.exactStats&&!s.retired&&s.status==="healthy","Lifecycle needs exact living same-soldier input");
  assert.deepEqual(a.lifecycle,eventFor(r.id));
  assert(supported.has(r.id)&&r.allowsDeadSoldiers&&!r.allowsLiveSoldiers&&!r.createsClone&&!r.producedItem);
  assert(r.allowedSoldierTypes.includes(s.soldierType));
  const dead=structuredClone(w),d=member(dead).state;
  // Soldier::die clears recovery/missing-health/equipment associations;
  // those tactical fields are not part of this existing permanent-state model.
  d.status="dead";d.corpseRecovered=a.lifecycle.corpseRecovered;
  // Original verifier enforces exact research, rank, materials, stats and history.
  const next=originalApply(dead,{type:"transform",soldier:"origin",transform:r.id});
  const m=member(next),z=m?.state;
  assert(m.id==="origin"&&z.exactStats&&!z.retired&&z.status==="unknown");
  assert.equal(z.remarks.at(-1),r.id+" · 이후 생존 상태 재검증 필요");
  z.remarks.pop();
  // Source: same soldier removed from memorial, transferred, _death cleared;
  // wait for transfer/recovery as explicit ordinary-effort assumption.
  z.status="healthy";z.corpseRecovered=false;
  return next;
 }
 function replay(steps,w=foundationWorld()){for(const a of steps)w=apply(w,a);assert(!w.pendingFree);return w;}
 function transform(n,r){
  if(!supported.has(r.id))return originalTransform(n,r);
  if(!r.requires.every(k=>base.active(n.world,k)))return null;
  const q=base.meet(n,r);if(!q)return null;
  const w=q.world,items={};
  for(const [id,qty] of Object.entries(r.requiredItems||{})){const lack=Math.max(0,qty-(w.items[id]||0));if(lack)items[id]=lack;}
  const functions=(r.requiresBaseFunc||[]).filter(k=>!w.baseFunctions.has(k)),funds=Math.max(0,(r.cost||0)-w.funds),steps=[];
  if(Object.keys(items).length||functions.length||funds)steps.push({type:"externalInputs",items,functions,funds,reason:"Conditional resurrection continuation "+r.id,assumption:true});
  steps.push({type:"transform",soldier:"origin",transform:r.id,assumption:true,lifecycle:eventFor(r.id)});
  try{return {world:replay(steps,w),steps:[...q.steps,...steps]};}catch{return null;}
 }
 function transformOutcomes(n,r){
  if(supported.has(r.id)){const value=transform(n,r);return value?[{band:null,value}]:[];}
  return originalOutcomes?originalOutcomes(n,r):[{band:null,value:originalTransform(n,r)}].filter(x=>x.value);
 }
 return {...base,apply,replay,transform,transformOutcomes,lifecycleRules:supported,lifecyclePolicy:policy};
}
export function createSharedCareerReplay(data,summary={}){
 const base=legacySharedReplay(data,summary);
 return summary.lifecyclePolicy?createLifecycleReplay(data,base,summary.lifecyclePolicy):base;
}
