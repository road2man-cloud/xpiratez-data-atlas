// Rule-data census and independent, ordered exclusion verification.
import fs from "node:fs";
import assert from "node:assert/strict";
import {initialState,evaluate,apply,compileRelations,excludedByPrior,exclusionChanges} from "../public/trainings/planner.js";
import {enumerateConversionRoutes} from "../public/soldiers/conversion-routes.js";

const index=JSON.parse(fs.readFileSync("public/data/trainings-index.json","utf8"));
const soldier=JSON.parse(fs.readFileSync("public/data/soldiers-index.json","utf8"));
const transforms=index.transformations;
const byId=new Map(transforms.map(t=>[t.id,t]));
const profiles=[...index.soldiers.map(x=>({id:x.id,soldierType:x.id,previousTransformations:{}})),...index.profiles];
const arrows=transforms.flatMap(t=>t.forbiddenPreviousTransformations.map(prev=>[prev,t.id]));
const pairs=new Set(arrows.filter(([a,b])=>a!==b).map(([a,b])=>[a,b].sort().join("|")));
const mutual=[...pairs].filter(key=>{const [a,b]=key.split("|");return arrows.some(x=>x[0]===a&&x[1]===b)&&arrows.some(x=>x[0]===b&&x[1]===a)});
const asymmetric=[...pairs].filter(key=>!mutual.includes(key));
const self=transforms.filter(t=>t.forbiddenPreviousTransformations.includes(t.id));
const required=transforms.filter(t=>t.requiredPreviousTransformations.length);
const removers=transforms.filter(t=>t.removeTransformations.length);
const conversions=transforms.filter(t=>t.producedSoldierType&&!t.createsClone);
const clones=transforms.filter(t=>t.createsClone);
const conditions=["allowsLiveSoldiers","allowsWoundedSoldiers","allowsDeadSoldiers"];
const types=index.soldiers.map(s=>s.id);
const relations=compileRelations(transforms);
let checks=0;
for(const t of transforms){
  const r=relations.get(t.id);
  assert.deepEqual(r.blockedBy,t.forbiddenPreviousTransformations,t.id+" blockedBy missing");
  assert.deepEqual(r.requires,t.requiredPreviousTransformations,t.id+" prerequisites missing");
  for(const other of transforms)assert.equal(r.blocksLater.includes(other.id),other.forbiddenPreviousTransformations.includes(t.id),t.id+" -> "+other.id);
}
for(const origin of profiles)for(const t of transforms){
  const state=initialState(origin);
  const expected=[];
  if(t.requires.includes("STR_UNAVAILABLE"))expected.push("unavailable");
  if(t.allowedSoldierTypes.length&&!t.allowedSoldierTypes.includes(origin.soldierType))expected.push("type");
  if(t.forbiddenSoldierTypes.includes(origin.soldierType))expected.push("forbidden-type");
  if(t.forbiddenPreviousTransformations.some(id=>state.prior.has(id)))expected.push("forbidden");
  if(t.requiredPreviousTransformations.some(id=>!state.prior.has(id)))expected.push("prerequisite");
  if(t.allowsLiveSoldiers===false)expected.push("condition");
  assert.deepEqual(evaluate(t,state).map(x=>x.code),expected,origin.id+" "+t.id);
  checks++;
}
for(const [prev,next] of arrows){
  const rule=byId.get(next);
  const current={soldierType:"TEST",condition:"healthy",prior:new Set([prev]),steps:[]};
  const issues=evaluate(rule,current);
  assert(issues.some(x=>x.code==="forbidden"&&x.ids.includes(prev)),prev+" must forbid "+next);
  const now=initialState({soldierType:"TEST",previousTransformations:{}});
  const previous={...now,prior:new Set([prev])};
  const blocked=excludedByPrior(transforms,previous);
  assert(blocked.find(x=>x.id===next)?.blockedBy.includes(prev),prev+" missing in exclusion table "+next);
  assert(exclusionChanges(transforms,now,previous).newlyBlocked.some(x=>x.id===next),prev+" missing in exclusion delta "+next);
  checks++;
}
for(const origin of profiles){
  let start=initialState(origin);
  for(const t of transforms){
    if(evaluate(t,start).length)continue;
    const after=apply(t,start);
    assert(after.prior.has(t.id));
    assert.equal(after.soldierType,t.createsClone?start.soldierType:(t.producedSoldierType||start.soldierType));
    for(const removed of t.removeTransformations)if(removed!==t.id)assert(!after.prior.has(removed));
    for(const other of transforms){
      const expected=(other.forbiddenPreviousTransformations||[]).filter(id=>after.prior.has(id));
      const issue=evaluate(other,after).find(x=>x.code==="forbidden");
      assert.deepEqual(issue?.ids||[],expected,origin.id+" "+t.id+" "+other.id);
      checks++;
    }
  }
}
let chained=0,uniqueTwoStep=[],examples=[];
for(const soldierType of types){
  const base=initialState({soldierType,previousTransformations:{}});
  for(const t of conversions){
    if(evaluate(t,base).length)continue;
    const after=apply(t,base);
    for(const next of conversions){
      if(evaluate(next,after).length)continue;
      chained++;
      uniqueTwoStep.push([soldierType,t.id,next.id,after.soldierType]);
      if(examples.length<15)examples.push({type:soldierType,first:t.id,second:next.id});
    }
  }
}
// All known original unit profiles + base types across three health states.
for(const origin of profiles)for(const condition of ["healthy","wounded","dead"])for(const t of transforms){
  const state=initialState(origin,{condition});
  const expected=[];
  if(t.requires.includes("STR_UNAVAILABLE"))expected.push("unavailable");
  if(t.allowedSoldierTypes.length&&!t.allowedSoldierTypes.includes(origin.soldierType))expected.push("type");
  if(t.forbiddenSoldierTypes.includes(origin.soldierType))expected.push("forbidden-type");
  if(t.forbiddenPreviousTransformations.some(id=>state.prior.has(id)))expected.push("forbidden");
  if(t.requiredPreviousTransformations.some(id=>!state.prior.has(id)))expected.push("prerequisite");
  const field=condition==="dead"?"allowsDeadSoldiers":condition==="wounded"?"allowsWoundedSoldiers":"allowsLiveSoldiers";
  if(t[field]===false)expected.push("condition");
  assert.deepEqual(evaluate(t,state).map(x=>x.code),expected,origin.id+" "+condition+" "+t.id);
  checks++;
}
const indexedById=new Map(soldier.transformations.map(t=>[t.id,t]));
for(const t of transforms){
  const original=indexedById.get(t.id);
  assert(original,"Missing original transformation "+t.id);
  for(const field of ["allowedSoldierTypes","forbiddenSoldierTypes","requiredPreviousTransformations",
    "forbiddenPreviousTransformations","removeTransformations","producedSoldierType"])
    assert.deepEqual(t[field],original[field],t.id+" data drift in "+field);
}
// The final-soldier catalog must enumerate only sequentially legal, living
// conversions. A dead-only first operation is preserved but not chained
// without an explicitly modeled death/revival transition.
let total=0,overOne=0,maxDepth=0,affectedProfiles=0,deadOnly=0;
for(const profile of index.profiles){
  const actual=enumerateConversionRoutes(profile,transforms);
  const seen=new Set();
  let multi=0;
  const expect=[];
  function visit(state,chain){
    for(const t of conversions){
      if(chain.includes(t.id)||state.prior.has(t.id))continue;
      if(chain.length&&t.allowsLiveSoldiers===false)continue;
      const condition=t.allowsLiveSoldiers===false?"dead":"healthy";
      if(evaluate(t,{...state,condition}).length)continue;
      const next=apply(t,{...state,condition});
      const transformationIds=[...chain,t.id];
      const expected={
        transformationIds,finalSoldierType:t.producedSoldierType,
        previousTransformations:Object.fromEntries([...next.prior].map(id=>[id,1])),
        requiresDeadSoldier:t.allowsLiveSoldiers===false
      };
      expect.push(expected);
      if(t.allowsLiveSoldiers!==false)visit(next,transformationIds);
    }
  }
  visit(initialState(profile),[]);
  assert.equal(actual.length,expect.length,profile.id+" conversion route count");
  for(let i=0;i<expect.length;i++){
    assert.deepEqual(actual[i],expect[i],profile.id+" conversion at "+i);
    const path=actual[i].transformationIds.join("|");
    assert(!seen.has(path),profile.id+" duplicate path "+path);
    seen.add(path);
  }
  multi=actual.filter(x=>x.transformationIds.length>=2).length;
  total+=actual.length;overOne+=multi;
  deadOnly+=actual.filter(x=>x.requiresDeadSoldier).length;
  maxDepth=Math.max(maxDepth,...actual.map(x=>x.transformationIds.length),0);
  if(multi)affectedProfiles++;
  checks+=actual.length;
}
assert.equal(transforms.length,83);
assert.equal(arrows.length,209);
assert.equal(mutual.length,62);
assert.equal(asymmetric.length,16);
assert.equal(self.length,69);
assert.equal(required.reduce((n,t)=>n+t.requiredPreviousTransformations.length,0),17);
assert.equal(removers.length,0,"Official no-removal assumption changed, revisit route audit");
assert.equal(total,157,"Official conversion paths changed");
assert.equal(overOne,51,"Multi-conversion route audit changed");
assert.equal(deadOnly,29,"Dead-only first-stage conversions changed");
assert.equal(affectedProfiles,18);
assert.equal(maxDepth,3);
console.log("OK all soldier exclusion cases: "+transforms.length+" transformations, "+
  arrows.length+" directed edges, "+mutual.length+" mutual pairs, "+asymmetric.length+
  " one-way pairs, "+self.length+" one-shot, "+required.length+" prerequisite rules; "+
  profiles.length+" origins x 3 health conditions; "+checks+
  " checks; "+total+" ordered type changes ("+overOne+" multistage across "+affectedProfiles+
  " profiles; "+deadOnly+" dead-only terminal); max stages "+maxDepth);
