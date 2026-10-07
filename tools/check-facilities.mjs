import fs from "node:fs";
import path from "node:path";

const args=process.argv.slice(2);
const i=args.indexOf("--data");
const dataDir=path.resolve(i>=0&&args[i+1]?args[i+1]:"public/data");
const read=(...parts)=>JSON.parse(fs.readFileSync(path.join(dataDir,...parts),"utf8"));

const facilities=read("facilities-index.json");
const baseFunctions=read("facility-base-functions.json");
const research=read("facility-research.json");

function assert(ok,msg){if(!ok)throw new Error(msg)}
assert(Array.isArray(facilities.index)&&facilities.index.length>0,"No facilities generated");
assert(facilities.index.length===new Set(facilities.index.map(x=>x.id)).size,"Duplicate facility ids");
assert(facilities.counts?.facilities===facilities.index.length,"Facility count mismatch");
assert(Array.isArray(facilities.baseFunctions)&&facilities.baseFunctions.length>0,"No base functions");
assert(baseFunctions.baseFunctionMeta&&typeof baseFunctions.baseFunctionMeta==="object","Missing base-function reverse index");
assert(research.researchCatalog&&typeof research.researchCatalog==="object","Missing facility research catalog");

const chunks={};
let income=0,available=0,stateOnly=0,startingTypes=0;
for(const row of facilities.index){
  assert(typeof row.id==="string"&&row.id,"Facility missing id");
  assert(typeof row.bucket==="string"&&row.bucket.length===1,"Facility missing bucket "+row.id);
  chunks[row.bucket]??=read("facility-chunks",row.bucket+".json").details;
  const d=chunks[row.bucket]?.[row.id];
  assert(d,"Missing facility detail "+row.id);
  assert(d.bucket===row.bucket,"Facility bucket mismatch "+row.id);
  assert(Number.isFinite(Number(d.area))&&Number(d.area)>=1,"Bad facility area "+row.id);
  assert(Array.isArray(d.roles),"Missing facility roles "+row.id);
  assert(Array.isArray(d.references),"Missing facility references "+row.id);
  assert(d.researchPlan&&Array.isArray(d.researchPlan.nodeIds),"Missing facility research plan "+row.id);
  for(const rid of d.researchPlan.nodeIds)assert(research.researchCatalog[rid],"Missing research node "+rid+" for "+row.id);
  for(const fid of [...(d.provideBaseFunc||[]),...(d.requiresBaseFunc||[])])assert(baseFunctions.baseFunctionMeta[fid],"Missing baseFunc "+fid+" for "+row.id);
  if(Number(d.monthlyCost)<0)income++;
  if(d.available)available++;
  if(d.stateOnly)stateOnly++;
  if(Number(d.startingCount)>0)startingTypes++;
}
assert(facilities.counts.income===income,"Income facility count mismatch");
assert(facilities.counts.available===available,"Available facility count mismatch");
assert(facilities.counts.stateOnly===stateOnly,"State-only facility count mismatch");
assert(facilities.counts.startingTypes===startingTypes,"Starting facility count mismatch");

for(const id of facilities.baseFunctions){
  const m=baseFunctions.baseFunctionMeta[id];
  assert(m&&Array.isArray(m.providers)&&Array.isArray(m.consumers),"Bad baseFunc metadata "+id);
}

console.log(`OK: ${facilities.index.length} facilities, ${facilities.baseFunctions.length} base functions, ${Object.keys(chunks).length} detail chunks`);
