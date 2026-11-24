import assert from "node:assert/strict";
import fs from "node:fs";
import zlib from "node:zlib";
import {createHash} from "node:crypto";
import {validateExactResourceIndex,queryExactResources,exactResourceWitness} from "../public/branch-soldier-exact-resources.js";
import {matchesResources} from "../public/branch-soldier-resources.js";

export function checkExactResourceAssets(db){
 const spec=db.summary.exactResourceIndex;
 if(!spec)return;
 for(const s of Object.values(spec.classes)){
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
