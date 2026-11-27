// Lossless transport for a worker's append-only career batch, not a merge.
// Apply only to the exact source JSON fingerprints; never overwrite a newer ledger.
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {createHash} from "node:crypto";
import {gzipSync,gunzipSync} from "node:zlib";
const FILES=[
 "public/data/soldier-population-missing-origin-career.json.gz",
 "public/data/soldier-population-missing-origin-career-index.json.gz",
 "public/branch-soldier-missing-origin-summary.js",
 "public/data/branch-soldier-results.json.gz"
];
const PREFIX="export const missingOriginSummary=";
const sha=b=>createHash("sha256").update(b).digest("hex");
const canonical=x=>JSON.stringify(x);
const hash=x=>sha(canonical(x));
const own=(o,k)=>Object.hasOwn(o,k);
const obj=x=>x!==null&&typeof x==="object"&&!Array.isArray(x);
function decode(p,b){
 if(p.endsWith(".gz"))return JSON.parse(gunzipSync(b).toString("utf8"));
 const s=b.toString("utf8").trim();
 assert(s.startsWith(PREFIX)&&s.endsWith(";"),"Unexpected summary module");
 return JSON.parse(s.slice(PREFIX.length,-1));
}
function encode(p,x){
 const s=canonical(x);
 return p.endsWith(".gz")?gzipSync(Buffer.from(s)):Buffer.from(PREFIX+s+";\n");
}
function diff(a,b){
 if(a===b)return null;
 if(Array.isArray(a)&&Array.isArray(b)){
  const changes=[];
  for(let i=0;i<b.length;i++){const d=diff(a[i],b[i]);if(d)changes.push([i,d]);}
  return changes.length||a.length!==b.length?[2,b.length,changes]:null;
 }
 if(obj(a)&&obj(b)){
  const ak=Object.keys(a),bk=Object.keys(b),del=ak.filter(k=>!own(b,k)),changes=[];
  for(const k of bk){const d=diff(own(a,k)?a[k]:undefined,b[k]);if(d)changes.push([k,d]);}
  const order=ak.filter(k=>own(b,k)).concat(bk.filter(k=>!own(a,k)));
  const reorder=order.length!==bk.length||order.some((k,i)=>k!==bk[i]);
  return del.length||changes.length||reorder?[1,del,changes,reorder?bk:null]:null;
 }
 return [0,b];
}
function put(o,k,v){Object.defineProperty(o,k,{value:v,writable:true,enumerable:true,configurable:true});}
function apply(a,p){
 if(!p)return a;
 if(p[0]===0)return p[1];
 if(p[0]===2){
  assert(Array.isArray(a));assert(Number.isSafeInteger(p[1])&&p[1]>=0);
  for(const [k,v] of p[2]){assert(Number.isSafeInteger(k)&&k>=0&&k<p[1]);a[k]=apply(a[k],v);}
  a.length=p[1];return a;
 }
 assert.equal(p[0],1);assert(obj(a));
 for(const k of p[1]){assert(own(a,k));delete a[k];}
 for(const [k,v] of p[2])put(a,k,apply(own(a,k)?a[k]:undefined,v));
 if(p[3]){const b={};assert.equal(p[3].length,Object.keys(a).length);for(const k of p[3]){assert(own(a,k));put(b,k,a[k]);}return b;}
 return a;
}
const readBase=(ref,p)=>execFileSync("git",["show",ref+":"+p],{maxBuffer:256*1024*1024});
const [mode,artifact,ref]=process.argv.slice(2);
assert(artifact&&["create","apply","check"].includes(mode),"Usage: node tools/career-batch-transport.mjs create|apply|check artifact.json.gz [baseRef]");
if(mode==="create"){
 assert(ref,"Base ref required");const files=[];
 for(const p of FILES){
  let a=decode(p,readBase(ref,p)),b=decode(p,fs.readFileSync(p));
  const baseHash=hash(a),targetHash=hash(b),patch=diff(a,b);
  assert.equal(hash(apply(a,patch)),targetHash,"Round-trip failed: "+p);
  files.push({path:p,baseHash,targetHash,patch});
  console.log(JSON.stringify({path:p,baseHash,targetHash,patchBytes:Buffer.byteLength(canonical(patch))}));
 }
 const packet={schema:"XPZ_CAREER_BATCH_TRANSPORT_V1",baseRef:ref,files};
 fs.mkdirSync(path.dirname(artifact),{recursive:true});
 fs.writeFileSync(artifact,gzipSync(Buffer.from(canonical(packet))));
 console.log(JSON.stringify({artifact,bytes:fs.statSync(artifact).size,sha256:sha(fs.readFileSync(artifact))}));
}else{
 const packet=JSON.parse(gunzipSync(fs.readFileSync(artifact)));
 assert.equal(packet.schema,"XPZ_CAREER_BATCH_TRANSPORT_V1");
 assert.deepEqual(packet.files.map(f=>f.path),FILES);
 const pending=[];
 for(const f of packet.files){
  const a=decode(f.path,fs.readFileSync(f.path)),h=hash(a);
  if(mode==="check"&&h===f.targetHash){console.log(f.path+" already at exact target");continue;}
  assert.equal(h,f.baseHash,"Wrong base, refusing overwrite: "+f.path);
  const b=apply(a,f.patch);assert.equal(hash(b),f.targetHash,"Target hash mismatch: "+f.path);
  if(mode==="apply")pending.push([f.path,encode(f.path,b)]);
  console.log(f.path+" verified");
 }
 if(mode==="apply"){
  for(const [p,b] of pending)fs.writeFileSync(p+".transport-tmp",b,{flag:"wx"});
  for(const [p] of pending)fs.renameSync(p+".transport-tmp",p);
 }
}
