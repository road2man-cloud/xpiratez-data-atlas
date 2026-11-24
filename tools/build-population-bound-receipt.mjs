import fs from "node:fs";
import zlib from "node:zlib";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {queryPopulationGraph} from "../public/branch-soldier-population-query.js";
const path="public/data/branch-soldier-results.json.gz";
const db=JSON.parse(zlib.gunzipSync(fs.readFileSync(path))),p=db.populationSearch,v=p.versions[p.latest],bytes=fs.readFileSync("public/data/"+v.file);
assert.equal(createHash("sha256").update(bytes).digest("hex"),v.sha256);
const a=JSON.parse(zlib.gunzipSync(bytes));
const presets=[{objective:"total",targets:{}},{objective:"firing",targets:{tu:100,health:90},maxFees:200000},{objective:"mana",targets:{psiStrength:60},maxFees:100000}];
const results=[];
for(const opts of presets){
 const q={...opts,stats:db.stats},r=queryPopulationGraph(a,db.ruleDetails,q);
 const oi=db.stats.indexOf(q.objective),score=vec=>oi<0?vec.reduce((n,x)=>n+x,0):vec[oi];
 let best=null,ties=0,scanned=0;
 for(const g of a.groups)for(const [n,band,steps,growth,fees] of g.labels){
  scanned++;const s=g.states[n];
  if(q.maxFees!=null&&fees>q.maxFees||Object.entries(q.targets).some(([k,min])=>s.vector[db.stats.indexOf(k)]<min))continue;
  const x=score(s.vector);if(best==null||x>best){best=x;ties=0;}if(x===best)ties++;
 }
 assert.equal(r.bestScore,best);assert.equal(r.ties,ties);assert.equal(r.orderedLabels,scanned);
 results.push({query:opts,...r,identicalToFullLabelScan:true});
 console.log(JSON.stringify({query:opts,best:r.bestScore,ties:r.ties,visited:r.visitedLabels,pruned:r.prunedLabels,bounds:r.boundStates,total:r.orderedLabels}));
}
v.boundQueries={scope:"EXACT_COMPLETED_DAG_QUERY_NOT_GLOBAL_CAMPAIGN",actualGameCertified:false,sourceSha256:v.sha256,queries:results};
db.populationSearch.boundQueries=v.boundQueries;
fs.writeFileSync(path,zlib.gzipSync(Buffer.from(JSON.stringify(db)),{level:6}));
