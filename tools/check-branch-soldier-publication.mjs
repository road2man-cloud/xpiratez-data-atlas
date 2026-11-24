// Ensure newly published growth data reaches the existing primary origin table.
// The source registry is the one shared gzip asset; no parallel browser data.
import "./check-branch-soldier-pareto.mjs";
import assert from "node:assert/strict";
import fs from "node:fs";
import zlib from "node:zlib";
import {buildOriginGrowthIndex,registryCoverage,routeActionCount,registeredRouteDepths} from "../public/branch-soldier-catalog.js";
import {buildBranchRouteIndex,profileWitnessIds} from "../public/branch-soldier-query.js";
import {summarizeRouteResources,matchesResources} from "../public/branch-soldier-resources.js";

const db=JSON.parse(zlib.gunzipSync(fs.readFileSync("public/data/branch-soldier-results.json.gz")));
const modern=JSON.parse(fs.readFileSync("public/data/soldiers-modern-index.json"));
const index=buildOriginGrowthIndex(db,modern,db.stats);
const coverage=registryCoverage(db,index,modern.profiles.length);
assert(coverage.updatedOrigins>=2,"Latest registry must reach primary origin rows");
assert(coverage.unifiedDepth>=5,"Do not silently publish the old four-action scope");
assert(coverage.structuralDepth>=8,"Structural continuation evidence missing");
const depths=registeredRouteDepths(db);
assert.equal(depths.at(-1),Math.max(...Object.values(db.witnesses).map(routeActionCount)));
assert(depths.includes(coverage.unifiedDepth),"Latest unified depth must be selectable");
for(const [profileId,row] of index){
 const w=db.witnesses[row.route],longest=db.witnesses[row.longestRoute];
 assert.equal(w.originProfile,profileId);
 assert.equal(w.body,modern.profiles.find(p=>p.id===profileId).soldierType);
 assert.equal(row.total,w.vector.reduce((s,x)=>s+x,0));
 assert.deepEqual(db.stats.map(k=>row.stats[k]),w.vector);
 assert.equal(row.steps,routeActionCount(w));
 assert.equal(row.longestSteps,routeActionCount(longest));
 assert(row.longestSteps>=row.steps);
 assert(row.branchCount>0);
 const c=db.combos.find(c=>c.id===row.combo);
 const routes=buildBranchRouteIndex(db,c,"CAP_TARGET").scope(db.branches.map(b=>b.id),{includeGlobal:true});
 assert(routes.ids.includes(row.route),"Primary row's representative is not selectable");
 assert(routes.ids.includes(row.longestRoute),"Primary row's longest route is not selectable");
}
// Budget checkpoint witnesses belong to the existing model profiles.
for(const [id,p] of Object.entries(db.profiles)){
 for(const w of p.resourceCandidates||[]){
  assert(db.witnesses[w],"Dangling budget candidate");
  assert(profileWitnessIds(db,id).includes(w),"Budget candidate invisible in selector");
 }
}
const html=fs.readFileSync("public/soldiers/modern/index.html","utf8");
const js=fs.readFileSync("public/branch-soldier-results.js","utf8");
assert(html.includes('id="registryCoverage"'));
assert(html.includes('minDepth=5#integratedCaps'));
assert(js.includes('id="bsMinDepth"'));
assert(js.includes('bsBudgetCheckpoints'));
assert(js.includes('bsParetoMode'));
const r=summarizeRouteResources({steps:[{id:"STR_BREAD_AND_FISHES_TRAINING",count:2}]},db.ruleDetails);
assert.equal(r.grossFees,500);
assert.equal(r.items.STR_MUTANT_FISH,10);
assert.equal(r.items.STR_LEEK,10);
assert.equal(r.peakItems.STR_MUTANT_FISH,5);
assert(matchesResources(r,{maxFees:500,materialLimits:{STR_MUTANT_FISH:10,STR_LEEK:10}}));
assert(!matchesResources(r,{materialLimits:{STR_MUTANT_FISH:10,STR_LEEK:9}}));
assert(!matchesResources(summarizeRouteResources({steps:[{id:"MISSING"}]},db.ruleDetails),{maxFees:0}));
for(const w of Object.values(db.witnesses).filter(w=>w.resourceCheckpoint)){
 const a=summarizeRouteResources(w,db.ruleDetails);
 assert(a.complete.cash&&a.grossFees===w.directGrossFee,"Budget witness cash mismatch");
}
if(db.summary.statFeeFrontier){
 const metric=db.summary.statFeeFrontier;
 assert.equal(metric.depth,5);
 assert(metric.scope.exactNumericalSkylinePerStaticRiskProfile);
 let refs=0;
 for(const [id,p] of Object.entries(db.profiles)){
  for(const w of p.statFeeFrontier||[]){
   assert.equal(db.witnesses[w]?.source,"GATE12");
   refs++;
  }
 }
 assert.equal(refs,metric.resourceReferences);
 for(const c of db.combos.slice(0,2)){
  const scope=buildBranchRouteIndex(db,c,"CAP_TARGET").scope(db.branches.map(b=>b.id),{includeGlobal:true});
  assert(scope.statFeeIds.size>0);
  const ids=new Set(scope.ids);
  assert([...scope.statFeeIds].every(id=>ids.has(id)));
 }
 for(const w of Object.values(db.witnesses).filter(w=>w.resourceFrontier)){
  const r=summarizeRouteResources(w,db.ruleDetails);
  assert(r.complete.cash&&r.grossFees===w.directGrossFee);
 }
}
if(db.summary.resourceGoalCheckpoints){
 const spec=db.summary.resourceGoalCheckpoints,cache=new Map();
 const get=id=>{if(!cache.has(id))cache.set(id,summarizeRouteResources(db.witnesses[id],db.ruleDetails));return cache.get(id);};
 let refs=0;
 for(const [pid,p] of Object.entries(db.profiles)){
  if(!p.resourceGoalCheckpoints)continue;
  const registered=new Set(profileWitnessIds(db,pid)),own=new Set(p.resourceGoalCandidates);
  refs+=own.size;
  const validate=(id,preset)=>{
   assert(registered.has(id)&&own.has(id),"Resource goal witness missing");
   const w=db.witnesses[id],r=get(id);
   assert.equal(w.source,"GATE12");
   assert(routeActionCount(w)<=spec.depth);
   assert(matchesResources(r,preset),"Resource preset mismatch");
   return w;
  };
  for(const preset of spec.presets){
   const row=p.resourceGoalCheckpoints[preset.id];
   assert(row&&row.best.length===db.stats.length);
   for(const id of row.best.filter(Boolean))validate(id,preset);
   for(const goal of spec.goals){
    const refs=Object.values(row.goals[goal.id]);
    assert(refs.every(Boolean)||refs.every(x=>x===null),"Partial objective result");
    for(const id of refs.filter(Boolean)){
     const w=validate(id,preset);
     for(const [stat,min] of Object.entries(goal.stats))assert(w.vector[db.stats.indexOf(stat)]>=min);
    }
   }
  }
 }
 assert.equal(refs,spec.resourceReferences);
 for(const [id,w] of Object.entries(db.witnesses).filter(([,w])=>w.resourceGoalCheckpoint)){
  const r=get(id);
  assert.equal(r.grossFees,w.directGrossFee);assert.equal(r.recoveryDays,w.directRecoveryDays);assert.equal(r.transferHours,w.directTransferHours);
 }
}
console.log(JSON.stringify(coverage));
console.log("PASS shared growth registry, exact origin rows, long-route links, budget candidates");
