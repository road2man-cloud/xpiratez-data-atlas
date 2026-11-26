// Merge independent production batches only when their graph edits do not
// overlap. Preserve both source histories; rebuild indexes with the producer.
import fs from "node:fs";
import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {gzipSync,gunzipSync} from "node:zlib";
import {key} from "./population-research-career-core.mjs";
const ref=k=>process.argv.find(a=>a.startsWith("--"+k+"="))?.slice(k.length+3);
const file="public/data/soldier-population-missing-origin-career.json.gz";
const read=r=>JSON.parse(gunzipSync(execFileSync("git",["show",r+":"+file],{maxBuffer:100*1024*1024})));
const base=read(ref("base")),remote=read(ref("remote")),local=read(ref("local"));
const eq=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
for(const x of [base,remote,local]){assert.equal(x.sourceMetadataSha256,base.sourceMetadataSha256);assert.equal(x.sourceGraphSha256,key(x.graphs));}
assert.equal(remote.schema,"COVERAGE_FIRST_RECRUITMENT_AND_CAREER_V25_RETRY_PRIORITY");
const out=structuredClone(remote),changes={};
function mergeMap(b={},r={},l={},label){
 const m={...r};let n=0;
 for(const k of Object.keys(b))assert(k in r&&k in l,"Deleted "+label+":"+k);
 for(const [k,v] of Object.entries(l)){
  if(eq(v,b[k]))continue;
  if(!eq(r[k],b[k])&&!eq(r[k],v)){if(label.endsWith(".turns")||label.endsWith(".groupTurns")){const before=b[k]||0;assert([before,r[k],v].every(Number.isSafeInteger)&&r[k]>=before&&v>=before,"Invalid turn counts");m[k]=r[k]+v-before;n++;continue;}throw Error("Overlapping edits "+label+":"+k);}
  if(!eq(r[k],v)){m[k]=v;n++;}
 }
 changes[label]=n;return m;
}
const graphChanges=x=>Object.keys(x.graphs).filter(k=>!eq(x.graphs[k],base.graphs[k]));
const lr=new Set(graphChanges(local)),rr=new Set(graphChanges(remote));
assert(![...lr].some(k=>rr.has(k)),"Graph edits overlap; require node remapping instead");
for(const k of ["graphs","routes","attempts","careerResearch","templates","stagedPrefixes","repairedStages","followThrough"])out[k]=mergeMap(base[k],remote[k],local[k],k);
for(const k of ["sharedIndex","traitSchedule"]){
 assert(eq(local[k],base[k])||eq(remote[k],base[k])||eq(remote[k],local[k]),"Overlapping "+k);
 if(!eq(local[k],base[k]))out[k]=local[k];
}
for(const [k,fields] of Object.entries({terminalResearch:["records","anchors"],endStage:["records","research","turns"],resetRecovery:["records","turns"],traitChain:["records","turns","groupTurns"],terminalSupply:["front","plans","records","attempted","resourceResearch"]})){
 for(const f of fields)out[k][f]=mergeMap(base[k]?.[f],remote[k]?.[f],local[k]?.[f],k+"."+f);
}
const seedKey=r=>r.id+"|"+r.node;
const seeds=new Map(remote.chainSeeds.map(r=>[seedKey(r),r]));
for(const r of local.chainSeeds){const k=seedKey(r);assert(!seeds.has(k)||eq(seeds.get(k),r),"Chain seed conflict "+k);seeds.set(k,r);}
out.chainSeeds=[...seeds.values()];
for(const [id,r] of Object.entries(out.routes)){const n=out.graphs[r.sourceGraph]?.nodes[r.sourceNode];assert(n&&n.stateHash===r.canonicalStateHash,"Route graph reference "+id);}
out.sourceGraphSha256=key(out.graphs);
out.summary={...out.summary,previousBalancedWork:local.summary.workPriority};
out.migration={...out.migration,concurrentMerge:{base:ref("base"),remote:ref("remote"),local:ref("local"),localGraphEdits:lr.size,remoteGraphEdits:rr.size}};
fs.writeFileSync(file+".tmp",gzipSync(JSON.stringify(out)));fs.renameSync(file+".tmp",file);
console.log(JSON.stringify({changes,localGraphEdits:lr.size,remoteGraphEdits:rr.size,graphs:Object.keys(out.graphs).length,routes:Object.keys(out.routes).length}));
