import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {gzipSync} from "node:zlib";
import {spawnSync} from "node:child_process";
import {fileURLToPath} from "node:url";
const script=fileURLToPath(new URL("./career-batch-transport.mjs",import.meta.url));
const files=["public/data/soldier-population-missing-origin-career.json.gz","public/data/soldier-population-missing-origin-career-index.json.gz","public/branch-soldier-missing-origin-summary.js","public/data/branch-soldier-results.json.gz"];
const hash=x=>createHash("sha256").update(JSON.stringify(x)).digest("hex");
const before={routes:[1]},after={routes:[1,2]},foreign={routes:[99]};
const root=fs.mkdtempSync(path.join(os.tmpdir(),"xpz-resume-"));
const encode=(p,x)=>p.endsWith(".gz")?gzipSync(JSON.stringify(x)):Buffer.from("export const missingOriginSummary="+JSON.stringify(x)+";\n");
const fixture=(states,wrongTarget=false)=>{
 const cwd=fs.mkdtempSync(path.join(root,"case-"));
 for(let i=0;i<files.length;i++){const p=path.join(cwd,files[i]);fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,encode(p,states[i]));}
 const packet={schema:"XPZ_CAREER_BATCH_TRANSPORT_V1",baseRef:"fixture",files:files.map((p,i)=>({path:p,baseHash:hash(before),targetHash:wrongTarget&&i===3?hash(foreign):hash(after),patch:[0,after]}))};
 fs.writeFileSync(path.join(cwd,"packet.gz"),gzipSync(JSON.stringify(packet)));return cwd;
};
const run=(cwd,mode)=>spawnSync(process.execPath,[script,mode,"packet.gz"],{cwd,encoding:"utf8"});
const snapshot=cwd=>files.map(p=>fs.readFileSync(path.join(cwd,p)));
const equalTargets=cwd=>assert.deepEqual(snapshot(cwd),files.map(p=>encode(p,after)));
try{
 const fresh=fixture(files.map(()=>before));let r=run(fresh,"apply");assert.equal(r.status,0,r.stderr);equalTargets(fresh);assert.match(r.stdout,/"applied":4/);console.log("PASS fresh apply");
 const repeated=snapshot(fresh);r=run(fresh,"apply");assert.equal(r.status,0,r.stderr);assert.deepEqual(snapshot(fresh),repeated);assert.match(r.stdout,/"applied":0/);console.log("PASS idempotent repeat");
 const mixed=fixture([after,before,after,before]);r=run(mixed,"apply");assert.equal(r.status,0,r.stderr);equalTargets(mixed);assert.match(r.stdout,/"applied":2/);console.log("PASS mixed resume");
 const check=fixture([after,before,after,before]);const prior=snapshot(check);r=run(check,"check");assert.equal(r.status,0,r.stderr);assert.deepEqual(snapshot(check),prior);console.log("PASS read-only check");
 const wrong=fixture([after,before,before,foreign]);const wrongPrior=snapshot(wrong);r=run(wrong,"apply");assert.notEqual(r.status,0);assert.match(r.stderr,/Wrong base/);assert.deepEqual(snapshot(wrong),wrongPrior);console.log("PASS foreign ledger untouched");
 const corrupt=fixture(files.map(()=>before),true);const corruptPrior=snapshot(corrupt);r=run(corrupt,"apply");assert.notEqual(r.status,0);assert.match(r.stderr,/Target hash mismatch/);assert.deepEqual(snapshot(corrupt),corruptPrior);console.log("PASS invalid target untouched");
 console.log("6 tests passed");
}finally{fs.rmSync(root,{recursive:true,force:true});}
