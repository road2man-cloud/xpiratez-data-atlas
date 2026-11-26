// Recompute presentation-only maxima from already admitted replay witnesses.
// Do not change research-line identities, proofs or acquisition provenance.
import fs from "node:fs";
import assert from "node:assert/strict";
import {gzipSync,gunzipSync} from "node:zlib";
import {loadCareerRows} from "../public/branch-soldier-atlas-career-core.js";
import {summarizeMaxComparison,summarizeOriginCoverage,careerClass} from "../public/branch-soldier-max-frontier.js";
const file="public/data/branch-soldier-results.json.gz";
const db=JSON.parse(gunzipSync(fs.readFileSync(file))),modern=JSON.parse(fs.readFileSync("public/data/soldiers-modern-index.json"));
const c=db.careerCompletion,comparison=await loadCareerRows(modern,db,{includeWitnesses:true});
assert.deepEqual(comparison.errors,[]);
assert.equal(comparison.rows.length,c.finalCareerAdmission.summary.completeWitnesses);
const coverage=summarizeOriginCoverage(modern.profiles,comparison.rows),max=summarizeMaxComparison(comparison.rows);
const byId=new Map(comparison.rows.map(r=>[r.id,r]));
for(const r of Object.values(coverage.origins))for(const k of ["capRoute","currentRoute"])if(r[k])assert.equal(careerClass(byId.get(r[k])),"ordinary");
for(const k of ["capRoute","currentRoute"])if(coverage.chort[k])assert.equal(careerClass(byId.get(coverage.chort[k])),"chort");
assert.equal(Object.values(coverage.origins).reduce((s,r)=>s+r.witnesses,0)+coverage.chort.witnesses,comparison.rows.length);
max.scope="Successor-closed final career witnesses only.";c.originCoverage=coverage.origins;c.chortCoverage=coverage.chort;c.maxComparison=max;
Object.assign(c.summary,coverage.summary,{maxComparison:{...max}});delete c.summary.maxComparison.routeIds;
db.summary.careerCompletion=c.summary;
fs.writeFileSync(file+".tmp",gzipSync(JSON.stringify(db),{level:6}));fs.renameSync(file+".tmp",file);
console.log(JSON.stringify({complete:c.summary.completeCombinations,...coverage.summary,ordinaryFrontier:max.ordinaryFrontier,chortFrontier:max.chortFrontier,farmer:coverage.origins["direct:STR_SOLDIER_PEASANT"],theban:coverage.origins["manufacture:STR_THEBAN_ASSAULT_CATGIRL_RECRUITMENT"],chort:coverage.chort}));
