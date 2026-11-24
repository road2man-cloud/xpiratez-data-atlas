import fs from "node:fs";
import assert from "node:assert/strict";
import {gunzipSync} from "node:zlib";
const arg=(k,d)=>process.argv.find(x=>x.startsWith("--"+k+"="))?.slice(k.length+3)??d;
const db=JSON.parse(gunzipSync(fs.readFileSync(arg("registry","public/data/branch-soldier-results.json.gz"))));
const o=db.originCap12,s=o?.summary;
assert(o&&s&&o.sourceMetadataSha256===db.sourceMetadataSha256);
assert.equal(db.stats.length,12);assert.equal(Object.keys(o.records).length,72);
assert.equal(s.modeledOrigins,72);assert.equal(s.researchOrigins,72);assert.equal(s.actualGameCertified,0);
assert.equal(Object.keys(o.models).length,s.completedModels);
assert.equal(Object.keys(o.archiveEvidence).length,s.archivePaths);
let full=new Set(),refs=new Set();
for(const [id,m] of Object.entries(o.models)){
 const r=o.records[m.profileId];assert(r&&r.modelIds.includes(id));
 assert(m.candidates.length&&m.witnessIds.length);
 for(const c of m.candidates){assert(o.archiveEvidence[c.id]?.profileId===m.profileId);if(c.scope==="full-route")full.add(c.id);}
 for(const ref of m.witnessIds){
  const w=db.witnesses[ref];assert(w&&w.source==="ORIGINCAP12"&&w.reference===id&&w.originProfile===m.profileId&&w.body===m.finalBody);
  assert(w.actualGameCertified===false&&w.simultaneousGrowthCertified===false&&w.medalBonusesExcluded===true&&Array.isArray(w.branchIds));
  assert.equal(w.vector.length,12);assert(w.vector.every(Number.isSafeInteger));
  assert.deepEqual(w.vector,w.raw.map((n,i)=>Math.max(db.stats[i]==="health"?1:0,n+w.bonus[i])));
  assert.equal(w.growthSchedule.length,m.order.length+1);assert.deepEqual(w.steps.map(t=>t.id),m.order);
  refs.add(ref);
 }
}
assert.equal(full.size,s.modeledFullRoutes);
assert.equal(refs.size,s.registeredWitnesses);
for(const r of Object.values(o.records)){
 assert(r.archivePaths>0&&r.modelIds.length>0&&r.sameBodyProfile&&r.lineageProfile);
 assert(r.modelIds.every(id=>o.models[id]?.profileId===r.profileId));
 for(const pid of [r.sameBodyProfile,r.lineageProfile,...Object.values(r.bodyProfiles)]){
  const p=db.profiles[pid];assert(p?.source==="ORIGINCAP12"&&p.actualGameCertified===false);
  assert([...p.frontier,...p.best,...Object.values(p.objectives),...p.feeTotalFrontier].every(id=>refs.has(id)&&db.witnesses[id].originProfile===r.profileId));
 }
}
assert.equal(Object.keys(db.witnesses).length,db.summary.registeredWitnesses);
assert.equal(db.summary.gameLegalMaximumCertified,0);
console.log(JSON.stringify({pass:true,origins:72,models:s.completedModels,compatibleRoutes:full.size,witnesses:refs.size,canonicalPairs:s.canonicalResearchPairsCertified,certified:0}));
