import assert from "node:assert/strict";
import fs from "node:fs";
import {execFileSync} from "node:child_process";
import {gunzipSync,gzipSync} from "node:zlib";
const file="public/data/soldier-population-missing-origin-career.json.gz";
const ref=process.argv[2]; assert(ref,"source commit required");
const source=JSON.parse(gunzipSync(execFileSync("git",["show",ref+":"+file],{maxBuffer:128*1024*1024})));
const target=JSON.parse(gunzipSync(fs.readFileSync(file)));
assert.equal(source.sourceMetadataSha256,target.sourceMetadataSha256);
const original=source.closureWave;assert(original?.records);
const records={...target.closureWave?.records};
for(const [id,r] of Object.entries(original.records)){
 const a=source.graphs[r.graph],b=target.graphs[r.graph];assert(a&&b);
 for(const i of [r.node,r.researchNode,...(r.outcomes||[]).map(x=>x.to)].filter(Number.isInteger)){
  assert(a.nodes[i]&&b.nodes[i],"missing graph node "+id);
  assert.equal(a.nodes[i].stateHash,b.nodes[i].stateHash,"graph node remapped "+id);
 }
 if(records[id])assert.deepEqual(records[id],r);
 else records[id]=r;
}
target.closureWave={records,metrics:target.closureWave?.metrics||original.metrics};
fs.writeFileSync(file+".tmp",gzipSync(JSON.stringify(target)));fs.renameSync(file+".tmp",file);
console.log(JSON.stringify({source:ref,receipts:Object.keys(records).length}));
