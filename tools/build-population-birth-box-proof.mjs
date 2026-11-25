// Extend the published partial-cap antichain proof to ALL integer birth
// vectors in the coordinatewise initial/current bounds from the source index.
// This is an exact optimum of the enlarged numeric box, not a claim that
// independent birth rolls, resources or combat growth are all game-attainable.
import fs from "node:fs";
import zlib from "node:zlib";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {performance} from "node:perf_hooks";
import {STAT_KEYS} from "../public/soldiers/modern/eligibility.js";
import {createClosureModel,assertClosed} from "./population-closure-core.mjs";
import {createSimulationChecker,verifyCover} from "./population-antichain-core.mjs";
const MODEL="BIRTH_BOX_PARTIAL_CAP_PARETO_V1";
const sha=x=>createHash("sha256").update(x).digest("hex"),key=x=>sha(JSON.stringify(x)),decode=b=>JSON.parse(zlib.gunzipSync(b));
const file="public/data/branch-soldier-results.json.gz",db=decode(fs.readFileSync(file)),data=JSON.parse(fs.readFileSync("public/data/soldiers-modern-index.json"));
const cl=db.populationClosure,ac=db.populationAntichain,v=db.populationSearch.versions.D3;
assert(cl&&ac&&v);assert.equal(data.meta.source.metadataSha256,db.sourceMetadataSha256);
function asset(meta){const bytes=fs.readFileSync("public/data/"+meta.file);assert.equal(sha(bytes),meta.sha256);return decode(bytes);}
const b=asset(cl),a=asset(ac),p=asset(ac.partialProof),snap=asset(v);
assert.equal(a.sourceClosureSha256,cl.sha256);assert.equal(a.sourcePartialSha256,ac.partialProof.sha256);assert.equal(p.closureSha256,cl.sha256);
for(const x of [a,b,p]){
 assert.equal(x.sourceMetadataSha256,db.sourceMetadataSha256);assert.equal(x.sourceD3Sha256,v.sha256);assert.equal(x.pairMapHash,b.pairMapHash);
 for(const [path,h] of Object.entries(x.hashes))assert.equal(sha(fs.readFileSync(path,"utf8").replace(/\r\n/g,"\n")),h,"Proof source changed "+path);
}
assert.deepEqual(b.origins,ac.origins);assert.deepEqual(b.branches,ac.branches);assert.equal(a.model,ac.model);
const model=createClosureModel(data,snap),checker=createSimulationChecker(data,model),started=performance.now();
const source="tools/build-population-birth-box-proof.mjs",hashes={...a.hashes,[source]:sha(fs.readFileSync(source,"utf8").replace(/\r\n/g,"\n"))};
const fingerprint=key([MODEL,db.sourceMetadataSha256,v.sha256,cl.sha256,ac.sha256,ac.partialProof.sha256,hashes]);
const discrete=s=>s.map((v,i)=>i===5||i===6?null:v);
const step=k=>k==="bravery"?10:1,valid=(n,k)=>Number.isSafeInteger(n)&&n>=(k==="health"?1:0)&&n<=9999&&(k!=="bravery"||n%10===0);
const fields=["percentGainedStatChange","percentGainedMin","percentGainedMax"];
// No positive gained coefficient means f(raw, initial) is nondecreasing
// in initial at fixed raw, since truncation is monotone. The sum, bravery
// rounding, lower bound, hard/soft upper clipping are also nondecreasing
// in change at fixed raw. Reroll constants do not depend on initial.
const coeffs=model.rules.map(r=>({id:r.id,positive:fields.flatMap(f=>STAT_KEYS.filter(k=>Number(r[f]?.[k]||0)>0).map(k=>[f,k,r[f][k]])),nonzero:fields.flatMap(f=>STAT_KEYS.filter(k=>Number(r[f]?.[k]||0)!==0).map(k=>[f,k,r[f][k]]))}));
assert(coeffs.every(r=>r.positive.length===0),"Positive gained coefficient invalidates birth-box simulation");
const profileById=new Map(data.profiles.map(p=>[p.id,p])),profiles=[],groupReceipts=[],aGroup=new Map(a.groups.map(g=>[g.group,g])),pathAudit=new Map();
const sourceChecks=new Set();let checkedStates=0,checkedTransitions=0,checkedPaths=0,coveredAliases=0;
for(const id of b.origins){
 const profile=profileById.get(id),[lo,hi]=model.initial(profile);
 assert.deepEqual(discrete(lo),discrete(hi),"Discrete birth field mismatch "+id);
 let initial=1n,current=1n;
 for(let i=0;i<STAT_KEYS.length;i++){
  const k=STAT_KEYS[i];for(const j of [5,6])assert(valid(lo[j][i],k)&&valid(hi[j][i],k)&&lo[j][i]<=hi[j][i]&&(hi[j][i]-lo[j][i])%step(k)===0,"Invalid birth interval "+id+"/"+k);
  initial*=BigInt((hi[5][i]-lo[5][i])/step(k)+1);
  current*=BigInt((hi[6][i]-lo[6][i])/step(k)+1);
 }
 profiles.push({origin:id,lowerInitial:lo[5],upperInitial:hi[5],lowerCurrent:lo[6],upperCurrent:hi[6],lower:lo,upper:hi,initialBoxSize:initial.toString(),currentBoxSize:current.toString(),independentRectangleSize:(initial*current).toString()});
}
const profileIndex=new Map(profiles.map((p,i)=>[p.origin,i]));
for(let gi=0;gi<b.groups.length;gi++){
 const g=b.groups[gi],g2=aGroup.get(gi),meta=ac.groups[gi];assert.equal(meta.id,gi);
 if(!meta.closed){groupReceipts.push({group:gi,status:"SOURCE_UNPROVED"});continue;}
 const mask=BigInt("0x"+g.mask);
 // All original aliases must admit the *same* maximal birth representative.
 // Each independent birth vector is dominated by that root in both initial
 // and current coordinates while all discrete fields remain unchanged.
 for(const [oi,hi] of g.aliases){
  const prof=profiles[profileIndex.get(b.origins[oi])];assert(prof);
  assert(g.roots.some(id=>key(b.nodes[id].state)===key(prof.upper)),"Max birth root missing");
  assert(g.roots.some(id=>key(b.nodes[id].state)===key(prof.lower)),"Min birth root missing");
  coveredAliases++;
 }
 let method,states,frontierHash;
 if(p.proofs[gi].status==="PARTIAL_CAP_BOX_PARETO_EXACT"){
  assert(g.closed&&!g2);assert.equal(meta.proofHash,g.closureHash);assertClosed(g,b.nodes,model);
  // The old source checker proves f(current_upper, initial_upper) dominates
  // f(current_lower, initial_upper). Coefficient signs prove that latter
  // dominates f(current_lower, initial_lower). Hence joint dominance.
  for(const id of g.ids){const ck=g.mask+"|"+id;if(sourceChecks.has(ck))continue;sourceChecks.add(ck);
   assert.equal(checker.check(b.nodes[id].state,mask),null,"Birth box scalar obligation failed "+gi);checkedStates++;
  }
  method="SOURCE_GRAPH_LIFT";states=g.ids.length;frontierHash=key(g.frontier);
 }else{
  assert(g2&&g2.status==="PARTIAL_CAP_BOX_PARETO_EXACT");assert.equal(meta.proofHash,g2.proofHash);
  assert.deepEqual(g2.roots.map(id=>a.nodes[id].state),g.roots.map(id=>b.nodes[id].state));
  const proof=verifyCover(g2,a.nodes,model,checker,{replay:true,transitionCache:pathAudit});
  assert(proof.ok,"Birth box antichain obligation failed "+gi);
  checkedStates+=proof.counts.live;checkedTransitions+=proof.counts.edgeChecks;checkedPaths+=proof.counts.pathChecks;
  method="ANTICHAIN_LIFT";states=proof.counts.live;frontierHash=key(g2.frontier);
 }
 // No clone or other action in this model changes the initial vector.
 // Current-growth and deterministic transform gates are independent of
 // initial except for the stat formula; the lifted relation is inductive.
 groupReceipts.push({group:gi,status:"BIRTH_BOX_PARETO_EXACT",method,states,aliases:g.aliases.length,sourceProofHash:meta.proofHash,frontierHash});
}
const pairStatus=[],reps=new Map(),pairs=[],origins=new Set();let direct=0,equivalent=0,partial=0,unmodeled=0;
for(let i=0;i<b.pairGroups.length;i++){
 const gs=b.pairGroups[i];
 if(!gs.length){pairStatus.push("UNMODELED");unmodeled++;continue;}
 if(!gs.every(g=>groupReceipts[g].status==="BIRTH_BOX_PARETO_EXACT")){pairStatus.push("PARTIAL_OR_UNPROVED");partial++;continue;}
 const sig=gs.slice().sort((a,b)=>a-b).join(",");origins.add(b.origins[Math.floor(i/b.branches.length)]);
 if(reps.has(sig)){pairStatus.push("LIMITED_EQUIVALENT");equivalent++;}else{reps.set(sig,i);pairStatus.push("LIMITED_DIRECT");direct++;}
 pairs.push([i,gs,reps.get(sig)]);
}
const certifiedGroups=groupReceipts.filter(g=>g.status==="BIRTH_BOX_PARETO_EXACT").length;
const summary={pairCount:b.summary.pairCount,fullCompleted:0,actualGameCertified:0,globalOptimalCertified:0,limitedDirect:direct,limitedEquivalent:equivalent,limitedClosed:direct+equivalent,partialOrUnproved:partial,unmodeled,groups:b.groups.length,certifiedGroups,coveredOrigins:origins.size,sourceProfiles:profiles.length,coveredAliases,nonzeroGainedRules:coeffs.filter(r=>r.nonzero.length).length,positiveGainedCoefficients:0,checkedStates,checkedTransitions,checkedPaths,independentTransitionReplays:pathAudit.size,simulationChecks:checker.metrics,frontierRepresentatives:ac.summary.combinedFrontierRepresentatives,newExplicitBirthVectors:0,elapsedSeconds:(performance.now()-started)/1000};
const scope={included:["all integer initial/current birth vectors in source coordinatewise bounds (bravery in tens)","fixed observed final active research","deterministic healthy no-clone non-retiring transforms","independent within-cap partial growth","conditional unlimited resources","unbounded action depth"],excluded:["random transforms","growth overshoot and special training outside ordinary growth model","promotion and commendations","intermediate or unobserved research histories","actual recruitment RNG distribution and correlations, timing, resource acquisition, events, wounds, death and cloning"],theorem:["Every vector in the source birth rectangle is dominated by the included maximum endpoint with identical discrete fields.","Every gained-stat coefficient of every modeled transformation is nonpositive. Increasing initial with current fixed cannot lower the transformed stat.","The existing scalar prefix-max checks prove dominance for all lower current inputs at the representative initial vector. Combining both inequalities gives joint initial/current dominance.","The initial vector is unchanged by all modeled actions. Partial-cap growth and lower stat gates preserve dominance at equal discrete state. The existing closed graph or inductive antichain covers every enabled successor.","The old model endpoints are included in the rectangle. Its exact per-body Pareto frontier is therefore also exact for the enlarged rectangle."],notClaimed:"A numerical box proof does not imply that all independent birth rolls or growth histories are physically realizable; it is not a full-game optimality certificate."};
const result={schemaVersion:1,kind:"POPULATION_BIRTH_BOX_PROOF",model:MODEL,fingerprint,hashes,sourceMetadataSha256:db.sourceMetadataSha256,sourceD3Sha256:v.sha256,sourceClosureSha256:cl.sha256,sourceAntichainSha256:ac.sha256,sourcePartialSha256:ac.partialProof.sha256,pairMapHash:b.pairMapHash,scope,coefficients:coeffs,profiles,groupReceipts,pairStatus,pairs,summary};
const out=process.argv[2]||"population-birth-box-proof.json.gz";fs.writeFileSync(out+".tmp",zlib.gzipSync(Buffer.from(JSON.stringify(result)),{level:6}));fs.renameSync(out+".tmp",out);console.log(JSON.stringify(summary));
