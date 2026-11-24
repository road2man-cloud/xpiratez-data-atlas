import assert from "node:assert/strict";
import fs from "node:fs";
import zlib from "node:zlib";
import {createHash} from "node:crypto";
import {validateExactResourceIndex,queryExactResources,exactResourceWitness} from "../public/branch-soldier-exact-resources.js";
import {matchesResources} from "../public/branch-soldier-resources.js";
import {unpackExactResourceIndex,exactColumns} from "../public/branch-soldier-exact-packed.js";

export function checkExactResourceAssets(db){
 const spec=db.summary.exactResourceIndex;
 if(!spec)return;
 for(const s of Object.values(spec.versions||spec.classes)){
  const bytes=fs.readFileSync("public/data/"+s.file);
  assert.equal(bytes.length,s.bytes);
  assert.equal(createHash("sha256").update(bytes).digest("hex"),s.sha256);
  const a=validateExactResourceIndex(db,s,JSON.parse(zlib.gunzipSync(bytes)));
  const branches=new Map(db.branches.filter(b=>b.legacyKey).map(b=>[b.legacyKey,b]));
  for(const [key,pid] of a.parentCases){
   const id=s.combo+"|CAP_TARGET|"+pid;
   assert.equal(branches.get(key)?.results?.[s.combo]?.CAP_TARGET,id);
   assert(db.profiles[id]);
  }
  const profiles=[...new Set(db.branches.filter(b=>!b.sourceRootConflict).map(b=>b.results?.[s.combo]?.CAP_TARGET).filter(Boolean))];
  const targets=[[0,105],[2,95],[5,122]],resources={maxFees:200000,materialLimits:{STR_MUTANT_FISH:5,STR_GLAMOUR:25,STR_PORN:25}};
  const r=queryExactResources(db,a,{profileIds:profiles,targets,resources});
  assert.equal(r.labelsScanned,s.labels);
  if(s.packedTransport){
   const p=s.packedTransport,b=fs.readFileSync("public/data/"+p.file);
   assert.equal(b.length,p.bytes);assert.equal(createHash("sha256").update(b).digest("hex"),p.sha256);
   const packed=validateExactResourceIndex(db,s,unpackExactResourceIndex(zlib.gunzipSync(b),s.sha256));
   const x=exactColumns(a),y=exactColumns(packed),K=a.stats.length;
   for(let i=0;i<x.stateCount;i++){
    if(x.mask(i)!==y.mask(i)||x.random(i)!==y.random(i))throw Error("Packed state metadata "+i);
    for(let k=0;k<3*K;k++)if(x.stat(i,k)!==y.stat(i,k))throw Error("Packed stat "+i+"/"+k);
   }
   for(let i=0;i<x.labelCount;i++)if(x.node(i)!==y.node(i)||x.rid(i)!==y.rid(i)||x.code(i)!==y.code(i)||x.growth(i)!==y.growth(i))throw Error("Packed label "+i);
   for(let i=0;i<x.resourceCount;i++){
    if(x.resCode(i)!==y.resCode(i))throw Error("Packed resource code "+i);
    for(let k=1;k<8;k++)if(x.res(i,k)!==y.res(i,k))throw Error("Packed resource "+i+"/"+k);
   }
   assert.deepEqual(packed.masks,a.masks);assert.deepEqual(packed.profileMasks,a.profileMasks);
   assert.deepEqual(queryExactResources(db,packed,{profileIds:profiles,targets,resources}),r);
   const rule=exactResourceWitness(db,a,r.skyline.find(p=>p.vector[3]>0)?.label??r.skyline[0].label).witness.steps[0]?.id;
   if(rule){
    const filtered=queryExactResources(db,packed,{profileIds:profiles,targets,resources,requiredRuleIds:[rule]});
    assert(filtered.matched>0);
    for(const p of filtered.skyline)assert(exactResourceWitness(db,packed,p.label).witness.steps.some(s=>s.id===rule));
    const excluded=queryExactResources(db,packed,{profileIds:profiles,targets,resources,excludedRuleIds:[rule]});
    for(const p of excluded.skyline)assert(!exactResourceWitness(db,packed,p.label).witness.steps.some(s=>s.id===rule));
    assert.equal(filtered.matched+excluded.matched,r.matched);
   }
   console.log("PASS packed exact parity",s.combo,s.depth,s.labels);
  }
  assert(r.matched>0);
  assert(r.skyline.length>0);
  for(const p of r.skyline){
   const x=exactResourceWitness(db,a,p.label);
   assert(x.profiles.some(id=>profiles.includes(id)));
   assert(targets.every(([i,min])=>x.witness.vector[i]>=min));
   assert(matchesResources(x.resources,resources));
  }
  for(const p of r.skyline)assert(!r.skyline.some(q=>q!==p&&q.vector.every((v,i)=>v<=p.vector[i])));
  const empty=queryExactResources(db,a,{profileIds:profiles,targets:[[0,99999]],resources});
  assert.equal(empty.matched,0);
  console.log("PASS exact resource index",s.combo,s.labels,"labels",r.matched,"matches",r.skyline.length,"resource points");
 }
}
if(process.argv[1]?.endsWith("check-branch-soldier-exact-resources.mjs")){
 const db=JSON.parse(zlib.gunzipSync(fs.readFileSync("public/data/branch-soldier-results.json.gz")));
 assert(db.summary.exactResourceIndex,"Missing exact resource index");
 checkExactResourceAssets(db);
}
