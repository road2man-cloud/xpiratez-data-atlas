// Branch-conditioned integer-box invariants using the necessary research
// masks and independently proved repeat budgets. Not a campaign certificate.
import fs from "node:fs";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {gunzipSync,gzipSync} from "node:zlib";
import {performance} from "node:perf_hooks";
import {buildInvariantModel} from "./population-invariant-bound-core.mjs";
import {repeatBounds} from "./population-repeat-proof-core.mjs";
const sha=x=>createHash("sha256").update(x).digest("hex"),key=x=>sha(JSON.stringify(x));
const decode=p=>JSON.parse(gunzipSync(fs.readFileSync(p)));
const arg=(k,d)=>process.argv.find(s=>s.startsWith("--"+k+"="))?.slice(k.length+3)??d;
const write=(p,x)=>{fs.writeFileSync(p+".tmp",gzipSync(Buffer.from(JSON.stringify(x)),{level:6}));fs.renameSync(p+".tmp",p);};
const start=performance.now(),db=decode("public/data/branch-soldier-results.json.gz"),data=JSON.parse(fs.readFileSync("public/data/soldiers-modern-index.json")),p=db.populationSearch;
const cf="public/data/soldier-population-research-constraints.json.gz",cb=fs.readFileSync(cf),c=JSON.parse(gunzipSync(cb));
const baseMeta=db.populationInvariantBound,baseFile="public/data/"+baseMeta.file,bb=fs.readFileSync(baseFile),base=JSON.parse(gunzipSync(bb));
assert.equal(sha(bb),baseMeta.sha256);assert.equal(c.sourceMetadataSha256,db.sourceMetadataSha256);assert.equal(base.sourceMetadataSha256,db.sourceMetadataSha256);
assert.deepEqual(c.origins,p.origins);assert.deepEqual(c.branches,p.branches);assert.deepEqual(base.origins,p.origins);assert.deepEqual(base.branches,p.branches);
const hashFile=f=>sha(fs.readFileSync(f,"utf8").replace(/\r\n/g,"\n"));
for(const x of [c,base])for(const [f,h] of Object.entries(x.hashes))assert.equal(hashFile(f),h,"Source drift "+f);
const hashes={...c.hashes,...base.hashes,"tools/build-population-branch-invariant.mjs":hashFile("tools/build-population-branch-invariant.mjs")};
const identity=key([db.sourceMetadataSha256,sha(cb),sha(bb),hashes]);
const model=buildInvariantModel(data),rules=data.transformations.filter(r=>!r.requires.includes("STR_UNAVAILABLE")&&!r.producedItem);
assert.deepEqual(model.rules,c.rules);assert.deepEqual(model.rules,base.rules);
const byId=new Map(data.profiles.map((x,i)=>[x.id,{profile:x,i}])),ruleIndex=new Map(rules.map((r,i)=>[r.id,i]));
const bits=rules.map((_,i)=>1n<<BigInt(i)),full=(1n<<BigInt(rules.length))-1n;
const byBody=new Map();
for(let i=0;i<rules.length;i++)for(const b of rules[i].allowedSoldierTypes||[]){
 if(rules[i].forbiddenSoldierTypes?.includes(b))continue;
 const a=byBody.get(b)||[];a.push(i);byBody.set(b,a);
}
function reachable(body,mask){
 let out=0n;const queue=[body],seen=new Set(queue);
 for(const b of queue)for(const i of byBody.get(b)||[]){
  if(!(mask&bits[i]))continue;out|=bits[i];
  const to=rules[i].producedSoldierType||b;if(!seen.has(to)){seen.add(to);queue.push(to);}
 }
 return out;
}
const checkpoint=arg("checkpoint","population-branch-invariant.checkpoint.json.gz"),seconds=Number(arg("seconds","70"));
assert(Number.isFinite(seconds)&&seconds>0);
let prev=null;if(fs.existsSync(checkpoint)&&!process.argv.includes("--fresh")){
 prev=decode(checkpoint);assert.equal(prev.identity,identity);assert.equal(prev.digest,key(prev.payload));
}
const groups=prev?.payload.groups||[],maskRecords=prev?.payload.maskRecords||[],pairClasses=prev?.payload.pairClasses||Array.from({length:p.origins.length},()=>Array(p.branches.length).fill(-1));
const index=new Map(groups.map((g,i)=>[g.signature,i])),oldMetrics=prev?.payload.metrics||{},elapsedBefore=prev?.payload.elapsedMs||0;
const branchIndex=new Map(p.branches.map((id,i)=>[id,i]));
let newComputations=0;
const metrics=()=>Object.fromEntries(Object.entries(model.metrics).map(([k,n])=>[k,n+(oldMetrics[k]||0)]));
function save(){
 const payload={groups,maskRecords,pairClasses,metrics:metrics(),elapsedMs:elapsedBefore+performance.now()-start};
 write(checkpoint,{identity,digest:key(payload),payload});
}
// Each distinct research mask gets its own repeat proof. Identical
// origin/mask/repetition signatures share a single numeric bound.
for(let mi=maskRecords.length;mi<c.groups.length;mi++){
 const cg=c.groups[mi],mask=BigInt("0x"+cg.mask),allowed=rules.filter((_,i)=>mask&bits[i]);
 const rr=repeatBounds({...data,transformations:allowed}),byRule=new Map(rr.rows.map(x=>[x.rule,x.bounds]));
 let finite=0,newFinite=0,reduced=0;
 const capRows=[];
 for(let oi=0;oi<p.origins.length;oi++){
  const origin=p.origins[oi],{profile,i:di}=byId.get(origin),bg=base.rows[oi].group,g0=base.groups[bg].result;
  assert.equal(base.rows[oi].origin,origin);
  const caps={};
  for(let k=0;k<rules.length;k++){
   const id=rules[k].id,b=g0.repeatCaps[id],r=(mask&bits[k])?byRule.get(id)[di]:0;
   const n=b===null?r:r===null?b:Math.min(b,r);
   caps[id]=n;if(Number.isSafeInteger(n)){finite++;if(b===null)newFinite++;else if(n<b)reduced++;}
  }
  // Remove actions that cannot be reached from this body even in the
  // relaxed body graph. Exclusion of zero-count actions is exact here.
  const nonzero=rules.reduce((m,r,k)=>caps[r.id]===0?m:m|bits[k],0n);
  const reach=reachable(profile.soldierType,nonzero);
  for(let k=0;k<rules.length;k++)if(!(reach&bits[k]))caps[rules[k].id]=0;
  const signature=key([bg,caps]);let gi=index.get(signature);
  if(gi===undefined){
   gi=groups.length;index.set(signature,gi);
   const same=rules.every(r=>caps[r.id]===g0.repeatCaps[r.id]);
   const result=same?g0:model.solve(profile,caps);
   if(!same)newComputations++;
   assert(result.rawMax.every((n,i)=>n<=g0.rawMax[i])&&result.effectiveMax.every((n,i)=>n<=g0.effectiveMax[i]),"Branch bound exceeds universal bound");
   for(const b of result.bounds){
    const old=g0.bounds.find(x=>x.body===b.body);
    assert(old&&b.raw.every((n,i)=>n<=old.raw[i])&&b.effective.every((n,i)=>n<=old.effective[i]),"Body bound exceeds universal bound");
   }
   groups.push({signature,baseGroup:bg,sourceOrigin:origin,reusedUniversal:same,reachableMask:reach.toString(16),result});
  }
  capRows.push(gi);
  for(const branch of cg.branches)pairClasses[oi][branchIndex.get(branch)]=gi;
 }
 maskRecords.push({maskGroup:mi,mask:cg.mask,repeatProofSha256:key(rr),repeatMetrics:rr.metrics,finiteOriginRulePairs:finite,newFiniteOriginRulePairs:newFinite,reducedOriginRulePairs:reduced,originGroups:capRows});
 if((mi+1)%4===0)save();
 if(performance.now()-start>=seconds*1000&&mi+1<c.groups.length){
  save();console.log(JSON.stringify({status:"CHECKPOINT",processedMasks:maskRecords.length,totalMasks:c.groups.length,groups:groups.length,newComputations,metrics:metrics()}));process.exit(0);
 }
}
save();
const pairCount=p.origins.length*p.branches.length;
assert.equal(pairClasses.length,p.origins.length);assert(pairClasses.every(r=>r.length===p.branches.length&&r.every(i=>groups[i])));
let rawTighter=0,effectiveTighter=0,bodyTighter=0,coordinateTighter=0,finiteRepeat=0,unboundedRepeat=0,universalPairs=0;
for(let oi=0;oi<p.origins.length;oi++)for(let bi=0;bi<p.branches.length;bi++){
 const g0=base.groups[base.rows[oi].group].result,g=groups[pairClasses[oi][bi]],x=g.result;
 if(g.reusedUniversal)universalPairs++;
 if(x.rawMax.some((v,i)=>v<g0.rawMax[i]))rawTighter++;
 if(x.effectiveMax.some((v,i)=>v<g0.effectiveMax[i]))effectiveTighter++;
 if(x.bounds.length<g0.bounds.length||x.bounds.some(b=>b.raw.some((v,i)=>v<g0.bounds.find(t=>t.body===b.body).raw[i])))bodyTighter++;
 coordinateTighter+=x.effectiveMax.filter((v,i)=>v<g0.effectiveMax[i]).length;
 finiteRepeat+=Object.values(x.repeatCaps).filter(Number.isSafeInteger).length;
 unboundedRepeat+=Object.values(x.repeatCaps).filter(v=>v===null).length;
}
assert.equal(finiteRepeat+unboundedRepeat,pairCount*rules.length);
const originIndex=new Map(p.origins.map((x,i)=>[x,i])),issues=[];let witnessChecks=0,witnessOutside=0;
for(const [id,w] of Object.entries(db.witnesses)){
 const oi=originIndex.get(w.originProfile);if(oi===undefined||w.vector?.length!==12)continue;
 for(const branch of w.branchIds||[]){
  const bi=branchIndex.get(branch);if(bi===undefined)continue;
  const b=groups[pairClasses[oi][bi]].result.bounds.find(x=>x.body===w.body);witnessChecks++;
  if(!b||w.vector.some((n,i)=>n>b.effective[i])){
   witnessOutside++;if(issues.length<30)issues.push({id,source:w.source,origin:w.originProfile,branch,body:w.body,vector:w.vector,bound:b?.effective||null});
  }
 }
}
// Existing witnesses that use unmodelled semantics are not discarded.
// No branch bound with an unexplained mismatch is eligible for pruning.
const summary={pairCount,coveredUpperBoundPairs:pairCount,independentGroups:groups.length,
 independentNumericalComputations:groups.filter(g=>!g.reusedUniversal).length,reusedUniversalGroups:groups.filter(g=>g.reusedUniversal).length,
 reusedUniversalPairs:universalPairs,groupReusePairs:pairCount-groups.length,reduction:1-groups.length/pairCount,
 researchMasks:c.groups.length,rawTighterPairs:rawTighter,effectiveTighterPairs:effectiveTighter,bodyTighterPairs:bodyTighter,coordinateTighter,
 finitePairRuleBounds:finiteRepeat,unboundedPairRuleBounds:unboundedRepeat,
 repeatNewFiniteMaskOriginRules:maskRecords.reduce((n,r)=>n+r.newFiniteOriginRulePairs,0),repeatReducedMaskOriginRules:maskRecords.reduce((n,r)=>n+r.reducedOriginRulePairs,0),
 witnessChecks,witnessOutside,metrics:metrics(),elapsedMs:Math.round(elapsedBefore+performance.now()-start),
 globalCompleted:0,globalImpossible:0,actualGameCertified:0};
const out=arg("out","public/data/soldier-population-branch-invariant.json.gz");
const result={schemaVersion:1,kind:"POPULATION_BRANCH_INDUCTIVE_BOUND",identity,sourceMetadataSha256:db.sourceMetadataSha256,hashes,
 researchConstraint:{file:cf.replace("public/data/",""),sha256:sha(cb),identity:c.identity,summary:c.summary},
 base:{file:baseMeta.file,sha256:sha(bb),identity:base.identity},
 origins:p.origins,branches:p.branches,rules:c.rules,stats:db.stats,pairClasses,groups,maskRecords,summary,issues,
 scope:{research:c.scope,numeric:base.scope,repeat:"Recompute SCC repetition bounds for each necessary research mask. Retain original proof digests and source identity.",
 warning:"Independent upper bounds only. All real-game completion counters zero. No pruning outside the declared indexed model. BDD action-subset relations retained separately, not used as additional pruning in the numeric solver."},
 proof:{method:"NECESSARY_RESEARCH_HYPERGRAPH_AND_SCC_REPEAT_INDUCTIVE_BOX",fullCampaign:false,unboundedActionDepth:true,witnessConsistency:witnessOutside===0}};
write(out,result);console.log(JSON.stringify({status:"BRANCH_BOUNDS_CLOSED",file:out,sha256:sha(fs.readFileSync(out)),bytes:fs.statSync(out).size,summary,issues:issues.slice(0,5)}));
