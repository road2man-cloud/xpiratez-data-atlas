// Produce a finite, depth-free optimistic bound for all 72 indexed origins.
// This is an overapproximation, not a legal campaign or Pareto completion.
import fs from "node:fs";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {gunzipSync,gzipSync} from "node:zlib";
import {performance} from "node:perf_hooks";
import {STAT_KEYS} from "../public/soldiers/modern/eligibility.js";
import {buildInvariantModel} from "./population-invariant-bound-core.mjs";
import {repeatBounds} from "./population-repeat-proof-core.mjs";
const sha=x=>createHash("sha256").update(x).digest("hex"),key=x=>sha(JSON.stringify(x));
const arg=(k,d)=>process.argv.find(x=>x.startsWith("--"+k+"="))?.slice(k.length+3)??d;
const read=p=>JSON.parse(fs.readFileSync(p)),decode=p=>JSON.parse(gunzipSync(fs.readFileSync(p)));
const data=read("public/data/soldiers-modern-index.json"),db=decode("public/data/branch-soldier-results.json.gz"),p=db.populationSearch;
assert.equal(data.meta.source.metadataSha256,db.sourceMetadataSha256);
assert.deepEqual(STAT_KEYS,db.stats);
assert.equal(p.origins.length,72);assert.equal(p.branches.length,1064);
const files=["tools/build-population-invariant-bound.mjs","tools/population-invariant-bound-core.mjs","tools/population-repeat-proof-core.mjs","public/data/soldiers-modern-index.json","public/soldiers/modern/eligibility.js"];
const hashes=Object.fromEntries(files.map(f=>[f,sha(fs.readFileSync(f,"utf8").replace(/\r\n/g,"\n"))]));
const identity=key([db.sourceMetadataSha256,hashes,p.origins,p.branches]);
const checkpoint=arg("checkpoint","population-invariant-bound-v2.checkpoint.json.gz");
const out=arg("out","public/data/soldier-population-invariant-bound-v2.json.gz");
const write=(f,x)=>{fs.writeFileSync(f+".tmp",gzipSync(Buffer.from(JSON.stringify(x)),{level:6}));fs.renameSync(f+".tmp",f);};
const start=performance.now(),seconds=Number(arg("seconds","60"));
assert(Number.isFinite(seconds)&&seconds>0);
let prev=null;
if(fs.existsSync(checkpoint)&&!process.argv.includes("--fresh")){
 prev=decode(checkpoint);assert.equal(prev.identity,identity);assert.equal(prev.digest,key(prev.payload));
}
const rows=prev?.payload.rows||[],groups=prev?.payload.groups||[],groupIndex=new Map(groups.map((g,i)=>[g.signature,i]));
const elapsedBefore=prev?.payload.elapsedMs||0;
const oldMetrics=prev?.payload.metrics||{};
const model=buildInvariantModel(data),profiles=new Map(data.profiles.map(x=>[x.id,x]));
const repeat=repeatBounds(data),profileIndex=new Map(data.profiles.map((p,i)=>[p.id,i]));
const capsFor=origin=>Object.fromEntries(repeat.rows.map(r=>[r.rule,r.bounds[profileIndex.get(origin)]]));
const finitePairs=repeat.rows.reduce((n,r)=>n+r.bounds.filter(Number.isSafeInteger).length,0);
const repeatSummary={rules:repeat.rows.length,origins:data.profiles.length,originRulePairs:repeat.rows.length*data.profiles.length,
 finiteOriginRulePairs:finitePairs,unboundedAbstractPairs:repeat.rows.length*data.profiles.length-finitePairs,
 allOriginFiniteRules:repeat.rows.filter(r=>r.bounds.every(Number.isSafeInteger)).length,
 allOriginAtMostOnce:repeat.rows.filter(r=>r.bounds.every(n=>Number.isSafeInteger(n)&&n<=1)).length,
 allOriginFiniteMultiple:repeat.rows.filter(r=>r.bounds.every(Number.isSafeInteger)&&Math.max(...r.bounds)>1).length,
 ...repeat.metrics};
const repeatFile="public/data/soldier-population-repeat-proof.json.gz";
const repeatResult={schemaVersion:1,kind:"POPULATION_REPEAT_UPPER_PROOF",identity,sourceMetadataSha256:db.sourceMetadataSha256,hashes,
 origins:data.profiles.map(p=>p.id),rows:repeat.rows,summary:repeatSummary,
 scope:"Indexed non-retiring non-clone body/history transitions. All unknown gates are relaxed. Finite count is a sound upper bound within this model; a positive SCC is unresolved, not a feasible infinite loop."};
write(repeatFile,repeatResult);
const repeatSha256=sha(fs.readFileSync(repeatFile));
function metrics(){return Object.fromEntries(Object.entries(model.metrics).map(([k,n])=>[k,n+(oldMetrics[k]||0)]));}
function save(){
 const payload={rows,groups,elapsedMs:elapsedBefore+performance.now()-start,metrics:metrics()};
 write(checkpoint,{identity,digest:key(payload),payload});
}
for(let i=rows.length;i<p.origins.length;i++){
 const origin=p.origins[i],profile=profiles.get(origin);assert(profile);
 const a=model.initial(profile),caps=capsFor(origin),signature=key([profile.soldierType,a,[...new Set([...(profile.traitNames||[]),...Object.keys(profile.traitCounts||{})])].sort(),caps]);
 let g=groupIndex.get(signature);
 if(g===undefined){g=groups.length;groups.push({signature,result:model.solve(profile,caps)});groupIndex.set(signature,g);}
 rows.push({origin,group:g});
 if(rows.length%4===0)save();
 if(performance.now()-start>=seconds*1000&&rows.length<p.origins.length){save();console.log(JSON.stringify({status:"CHECKPOINT",origins:rows.length,groups:groups.length,metrics:metrics()}));process.exit(0);}
}
save();
const pairCount=p.origins.length*p.branches.length;
const targetByOrigin=new Map(rows.map(r=>[r.origin,groups[r.group].result]));
// The invariant is used for safe rejection of TARGETS within its own
// relaxed stat scope, not to reject campaign reachability or certify routes.
// Existing witnesses are separately scoped and may have other assumptions;
// report any conflicting vectors rather than silently lowering the bounds.
let witnessChecks=0,witnessOutside=0;
const witnessOutsideExamples=[];
for(const [id,w] of Object.entries(db.witnesses)){
 const g=targetByOrigin.get(w.originProfile);if(!g||!Array.isArray(w.vector)||w.vector.length!==12)continue;
 const b=g.bounds.find(x=>x.body===w.body);witnessChecks++;
 if(!b||w.vector.some((n,i)=>n>b.effective[i])){witnessOutside++;if(witnessOutsideExamples.length<30)witnessOutsideExamples.push({id,source:w.source,origin:w.originProfile,body:w.body,vector:w.vector,bound:b?.effective||null});}
}
const s={pairCount,origins:rows.length,independentOriginGroups:groups.length,coveredUpperBoundPairs:pairCount,groupReusePairs:pairCount-groups.length,independentCalculationReduction:1-groups.length/pairCount,
 bodyBoxes:groups.reduce((n,g)=>n+g.result.bounds.length,0),repeatCountLayers:groups.reduce((n,g)=>n+g.result.layers.length,0),rules:model.rules.length,repeat:repeatSummary,metrics:metrics(),witnessChecks,witnessOutside,elapsedMs:Math.round(elapsedBefore+performance.now()-start),fullCompleted:0,globalOptimalCertified:0,actualGameCertified:0,globalImpossible:0};
const result={schemaVersion:1,kind:"POPULATION_INDUCTIVE_UPPER_BOUND",identity,hashes,sourceMetadataSha256:db.sourceMetadataSha256,origins:p.origins,branches:p.branches,stats:STAT_KEYS,rows,groups,rules:model.rules,summary:s,witnessOutsideExamples,repeatProof:{file:repeatFile.replace("public/data/",""),sha256:repeatSha256,bytes:fs.statSync(repeatFile).size,summary:repeatSummary},
 scope:{included:["all indexed non-retiring non-clone transformations except explicit STR_UNAVAILABLE","research/rank/medal/status/resource gates relaxed; history projection supplies finite repeat bounds; raw max gate and body rules retained","all integer birth stats inside indexed min/max boxes","random indexed stat coefficient endpoints and reroll max","growth up to max of indexed combat, training and maximum initial caps","positive union of applicable SoldierBonus IDs and medal bonus levels","unbounded number of actions"],
 excluded:["unindexed engine or script effects","equipment stats","separate weapon mastery resolver","actual campaign reachability and simultaneous stat attainability","full game proof"]},
 proof:{method:"MONOTONE_INTEGER_BOX_FIXED_POINT",finite:true,unboundedActionDepth:true,initialIncluded:true,growthClosed:true,everyRelaxedTransitionBounded:true,repeatProjection:"SCC_WEIGHTED_CONDENSATION_LONGEST_PATH",globalCampaign:false}};
write(out,result);
console.log(JSON.stringify({status:"INVARIANT_CLOSED",file:out,sha256:sha(fs.readFileSync(out)),bytes:fs.statSync(out).size,summary:s,witnessOutsideExamples}));
