// Produce branch- and origin-specific upper envelopes with rank state,
// reset-sensitive retained transformation bonuses, and medal tier bounds.
// This is an optimistic model. It never marks a campaign pair complete.
import fs from "node:fs";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {gunzipSync,gzipSync} from "node:zlib";
import {performance} from "node:perf_hooks";
import {careerEnvelopeModel} from "./population-career-envelope-core.mjs";
const sha=x=>createHash("sha256").update(x).digest("hex"),key=x=>sha(JSON.stringify(x));
const decode=p=>JSON.parse(gunzipSync(fs.readFileSync(p))),read=p=>JSON.parse(fs.readFileSync(p));
const arg=(k,d)=>process.argv.find(x=>x.startsWith("--"+k+"="))?.slice(k.length+3)??d;
const start=performance.now(),db=decode("public/data/branch-soldier-results.json.gz"),data=read("public/data/soldiers-modern-index.json");
const bmeta=db.populationBranchInvariant,cmeta=db.populationResearchConstraints;
assert(bmeta&&cmeta);
const bp="public/data/"+bmeta.file,cp="public/data/"+cmeta.file;
assert.equal(sha(fs.readFileSync(bp)),bmeta.sha256);assert.equal(sha(fs.readFileSync(cp)),cmeta.sha256);
const a=decode(bp),c=decode(cp);
assert.equal(a.identity,bmeta.identity);assert.equal(c.identity,cmeta.identity);
assert.equal(a.sourceMetadataSha256,db.sourceMetadataSha256);
assert.equal(c.sourceMetadataSha256,db.sourceMetadataSha256);
assert.equal(data.meta.source.metadataSha256,db.sourceMetadataSha256);
assert.deepEqual(a.origins,c.origins);assert.deepEqual(a.branches,c.branches);assert.deepEqual(a.rules,c.rules);
assert.deepEqual(a.stats,db.stats);
const hashes=Object.fromEntries(["tools/population-career-envelope-core.mjs","tools/build-population-career-envelope.mjs","public/data/soldiers-modern-index.json","public/soldiers/modern/eligibility.js"].map(f=>[f,sha(fs.readFileSync(f,"utf8").replace(/\r\n/g,"\n"))]));
const identity=key([a.identity,c.identity,bmeta.sha256,cmeta.sha256,hashes]);
const model=careerEnvelopeModel(data,a.rules,c.bdd.conflictMasks),profiles=new Map(data.profiles.map(p=>[p.id,p]));
const cached=new Map(),groups=[],pairClasses=[],indices=new Map(c.records.map(r=>[r.branch,r]));
const originIndex=new Map(a.origins.map((id,i)=>[id,i])),branchIndex=new Map(a.branches.map((id,i)=>[id,i]));
const summary={pairCount:a.origins.length*a.branches.length,coveredUpperBoundPairs:0,independentGroups:0,
 reusePairs:0,cacheHits:0,effectiveTighterPairs:0,rawTighterPairs:0,bodyTighterPairs:0,
 coordinateTighter:0,coordinateReductionTotal:0,rankAffectedPairs:0,failedOpenPairs:0,
 conditionalWitnessChecks:0,witnessConflicts:0,globalCompleted:0,globalImpossible:0,actualGameCertified:0};
let largest={};const mx=(a,b)=>a.map((x,i)=>Math.max(x,b[i]));
const oldOf=i=>bmeta.groups[i];
for(let i=0;i<a.origins.length;i++){
 const p=profiles.get(a.origins[i]);assert(p);const row=[];
 const traitKey=[...new Set([...(p.traitNames||[]),...Object.entries(p.traitCounts||{}).filter(([,n])=>n>0).map(([id])=>id)])].sort();
 for(let j=0;j<a.branches.length;j++){
  const base=a.pairClasses[i][j],old=oldOf(base);assert(old);
  const split=indices.get(a.branches[j])?.fallback===false;
  const sig=key([base,p.soldierType,p.rank||0,traitKey,split]);
  let gi=cached.get(sig);
  if(gi===undefined){
   const value=model.solve(p,old,split);gi=groups.length;
   groups.push({signature:sig,baseGroup:base,originExample:p.id,split,value});cached.set(sig,gi);
  }else summary.cacheHits++;
  row.push(gi);summary.coveredUpperBoundPairs++;
 }
 pairClasses.push(row);
}
// All existing conditional witnesses within the same pair must fit the
// refined envelope. Model mismatches trigger a fail-open group, not deletion.
// This is a consistency screen, not a proof of game reachability.
const fallback=new Set(),issues=[];
const known=Array.from({length:a.origins.length},()=>Array(a.branches.length).fill(null));
const globalKnown=Array(12).fill(null);
for(const [id,w] of Object.entries(db.witnesses)){
 const i=originIndex.get(w.originProfile);if(i===undefined||w.vector?.length!==12||!w.vector.every(Number.isSafeInteger))continue;
 for(const branch of w.branchIds||[]){
  const j=branchIndex.get(branch);if(j===undefined)continue;
  const gi=pairClasses[i][j],g=groups[gi],b=g.value.bounds.find(b=>b.body===w.body);summary.conditionalWitnessChecks++;
  if(!b||w.vector.some((n,k)=>n>b.effective[k])){
   summary.witnessConflicts++;fallback.add(gi);
   if(issues.length<30)issues.push({id,source:w.source,origin:w.originProfile,branch,body:w.body,vector:w.vector,bound:b?.effective||null});
  }
  const entry=known[i][j];
  if(entry)known[i][j]=mx(entry,w.vector);else known[i][j]=w.vector.slice();
  for(let k=0;k<12;k++)globalKnown[k]=Math.max(globalKnown[k]??-Infinity,w.vector[k]);
 }
}
for(const gi of fallback){
 const g=groups[gi],old=oldOf(g.baseGroup);
 g.refinedCandidate=g.value;
 g.value={body:g.value.body,initialRank:g.value.initialRank,traits:g.value.traits,bounds:old.bounds.map(b=>({...b,bonusUpper:old.bonusUpper,ranks:null,retainedMask:null})),rawMax:old.rawMax,effectiveMax:old.effectiveMax,receipts:[]};
 g.failedOpen=true;
}
// Branch-and-bound query planner: reject a target only within this declared
// numeric upper-bound scope. A known witness is conditional, so the result
// is not a campaign optimality certificate. Equality is not rejected for
// a tie-search; targets here request STRICT improvement over known records.
const targets=db.stats.map((stat,k)=>({stat,conditionalRecord:globalKnown[k],target:globalKnown[k]===null?null:globalKnown[k]+1,
 oldRejectedPairs:0,newRejectedPairs:0,newlyRejectedPairs:0,remainingPairs:0,groups:[]}));
const goalGroups=targets.map(()=>new Set());
for(let i=0;i<a.origins.length;i++)for(let j=0;j<a.branches.length;j++){
 const gi=pairClasses[i][j],g=groups[gi],x=g.value,old=oldOf(g.baseGroup);
 if(g.failedOpen)summary.failedOpenPairs++;
 if(x.rawMax.some((v,k)=>v<old.rawMax[k]))summary.rawTighterPairs++;
 if(x.effectiveMax.some((v,k)=>v<old.effectiveMax[k]))summary.effectiveTighterPairs++;
 if(x.bounds.length<old.bounds.length)summary.rankAffectedPairs++;
 if(x.bounds.length<old.bounds.length||x.bounds.some(b=>b.effective.some((v,k)=>v<old.bounds.find(t=>t.body===b.body).effective[k])))summary.bodyTighterPairs++;
 for(let k=0;k<12;k++){
  const drop=old.effectiveMax[k]-x.effectiveMax[k];assert(drop>=0);
  if(drop){summary.coordinateTighter++;summary.coordinateReductionTotal+=drop;if(!largest[db.stats[k]]||drop>largest[db.stats[k]].drop)largest[db.stats[k]]={drop,old:old.effectiveMax[k],new:x.effectiveMax[k],origin:a.origins[i],branch:a.branches[j]};}
  const t=targets[k];if(t.target===null)continue;
  const oldSkip=old.effectiveMax[k]<t.target,skip=x.effectiveMax[k]<t.target;
  if(oldSkip)t.oldRejectedPairs++;
  if(skip)t.newRejectedPairs++;else{t.remainingPairs++;goalGroups[k].add(gi);}
  if(skip&&!oldSkip)t.newlyRejectedPairs++;
 }
}
for(let k=0;k<12;k++){
 const t=targets[k];t.groups=[...goalGroups[k]].sort((i,j)=>groups[j].value.effectiveMax[k]-groups[i].value.effectiveMax[k]||i-j);
 t.remainingGroups=t.groups.length;
 assert(t.target===null||t.newRejectedPairs+t.remainingPairs===summary.pairCount);
}
summary.independentGroups=groups.length;summary.reusePairs=summary.pairCount-groups.length;summary.reduction=summary.reusePairs/summary.pairCount;
summary.failedOpenGroups=fallback.size;summary.knownPairs=known.flat().filter(Boolean).length;
summary.elapsedMs=Math.round(performance.now()-start);summary.metrics=model.metrics;
const scope={included:["branch-conditioned invariant raw boxes","one indexed rank state per body with relaxed promotion actions","rank reset, body rank cap and transformation bonus reset","one active ordinary medal level per medal type; modular level IDs remain unioned","necessary minimum-stat gate from earlier envelope","permanent research-conflict mask split"],
 relaxed:["campaign acquisition, time, resources, wounds/death/revival","promotion and medal earnability, medal prerequisites","history gates and positive repeat budgets beyond zero-use exclusions","joint attainability of 12 stat bounds","weapon mastery excluded as in earlier indexed model"],
 warning:"Finite abstract rank/bonus envelope. Not a feasible path or full-game proof. Target rejections are confined to this numeric model. Unknown rank lists use a threshold saturation, not a claimed actual maximum rank."};
const out=arg("out","public/data/soldier-population-career-envelope.json.gz");
const result={schemaVersion:1,kind:"POPULATION_CAREER_ENVELOPE",identity,sourceMetadataSha256:db.sourceMetadataSha256,hashes,
 base:{file:bmeta.file,sha256:bmeta.sha256,identity:a.identity},research:{file:cmeta.file,sha256:cmeta.sha256,identity:c.identity},
 stats:db.stats,origins:a.origins,branches:a.branches,medals:model.medals,medalUpper:model.medalUpper,medalUnionUpper:model.medalUnionUpper,
 bonusIds:model.bonusIds,rankThreshold:model.rankLimit,groups,pairClasses,targets,summary,scope,issues,largest,
 proof:{method:"FINITE_RANK_AND_RETAINED_BONUS_UNION_CLOSURE",globalCampaign:false,allPairsMapped:true,independentStatBounds:true}};
fs.writeFileSync(out+".tmp",gzipSync(Buffer.from(JSON.stringify(result)),{level:6}));fs.renameSync(out+".tmp",out);
console.log(JSON.stringify({file:out,sha256:sha(fs.readFileSync(out)),bytes:fs.statSync(out).size,summary,medalUnionUpper:model.medalUnionUpper,medalUpper:model.medalUpper,
 targets:targets.map(({groups,...t})=>t),largest,issues:issues.slice(0,5)}));
