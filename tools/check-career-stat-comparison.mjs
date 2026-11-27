import assert from "node:assert/strict";
import fs from "node:fs";
import {gunzipSync} from "node:zlib";
import {ledgers,project,loadCareerRows} from "../public/branch-soldier-atlas-career-core.js";
import {CAREER_STAT_POLICY,comparisonStats} from "../public/branch-soldier-stat-comparison-policy.js";
import {hydrateResearchPaths} from "../public/branch-soldier-research-path-codec.js";
const read=p=>JSON.parse(gunzipSync(fs.readFileSync("public/data/"+p+".json.gz")));
const db=hydrateResearchPaths(read("branch-soldier-results"));
const ledger=read("soldier-population-missing-origin-career");
const stats=[];
for(const l of ledgers){
 const d=read(l.file),p=project(l,d,db.sourceMetadataSha256);
 assert.equal(p.rejected.length,0,l.key+" unproven projections");
 for(const row of p.rows){
  const r=d.routes[row.id];
  assert.equal(row.statPolicy,CAREER_STAT_POLICY.id);
  assert.deepEqual(row.current,r.permanentVector??r.vector);
  assert.deepEqual(row.cap,r.permanentCapVector??r.capVector);
 }
 stats.push({source:l.key,rows:p.rows.length,medals:p.rows.filter(r=>Object.keys(r.medals||{}).length).length});
}
const effective=(raw,b)=>raw.map((v,i)=>i===9&&v<=0&&b[i]>0?v:Math.max(i===2?1:0,v+b[i]));
let medalBearing=0,distinct=0;
for(const r of Object.values(ledger.routes)){
 const n=ledger.graphs[r.sourceGraph].nodes[r.sourceNode];
 assert.deepEqual(r.permanentVector,effective(n.raw,n.permanentBonus));
 assert.deepEqual(r.permanentCapVector,effective(n.capRaw,n.permanentBonus));
 if(Object.keys(r.medals||{}).length)medalBearing++;
 if(n.vector.some((v,i)=>v!==r.permanentVector[i]))distinct++;
}
const r=Object.values(ledger.routes).find(r=>Object.keys(r.medals||{}).length&&ledger.graphs[r.sourceGraph].nodes[r.sourceNode].vector.some((v,i)=>v!==r.permanentVector[i]));
assert(r);
const n=ledger.graphs[r.sourceGraph].nodes[r.sourceNode],main=ledgers[0];
const fallback={...r,permanentVector:undefined,permanentCapVector:undefined,vector:n.vector,capVector:n.capVector};
assert.equal(comparisonStats(main,ledger,fallback),null,"Medal-inclusive fallback must be blocked");
const old=read("soldier-population-new-pair-career"),l=ledgers.find(l=>l.key==="newpair"),decorated=Object.values(old.routes).find(r=>Object.keys(r.medals||{}).length);
assert(comparisonStats(l,old,decorated));
assert.equal(comparisonStats(l,{...old,careerPolicy:{...old.careerPolicy,medalDecorationExcluded:false}},decorated),null);
const modern=JSON.parse(fs.readFileSync("public/data/soldiers-modern-index.json"));
if(db.careerCompletion.finalCareerAdmission.sourceGraphSha256===ledger.sourceGraphSha256){
 const final=await loadCareerRows(modern,db,{includeWitnesses:true});
 assert.deepEqual(final.errors,[]);
 for(const row of final.rows)assert.equal(row.statPolicy,CAREER_STAT_POLICY.id);
 assert.equal(db.careerCompletion.statComparisonPolicy.id,CAREER_STAT_POLICY.id);
 console.log(JSON.stringify({finalRows:final.rows.length,finalMedalled:final.rows.filter(r=>Object.keys(r.medals||{}).length).length}));
}
console.log(JSON.stringify({stats,total:stats.reduce((s,r)=>s+r.rows,0),mainRoutes:Object.keys(ledger.routes).length,medalBearing,distinct,policy:CAREER_STAT_POLICY.id}));
