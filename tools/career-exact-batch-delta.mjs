import fs from "node:fs";
import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {gunzipSync,gzipSync} from "node:zlib";
import {createHash} from "node:crypto";
const hash=x=>createHash("sha256").update(x).digest("hex"), key=x=>hash(JSON.stringify(x));
const eq=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const assets=["public/data/soldier-population-missing-origin-career.json.gz","public/data/soldier-population-missing-origin-career-index.json.gz"];
const read=(ref,path)=>JSON.parse(gunzipSync(execFileSync("git",["show",ref+":"+path],{maxBuffer:128*1024*1024})));
function diff(a,b,p=[],ops=[]){
 if(eq(a,b))return ops;
 if(Array.isArray(a)&&Array.isArray(b)){
  let prefix=0;while(prefix<Math.min(a.length,b.length)&&eq(a[prefix],b[prefix]))prefix++;
  if(prefix===a.length){ops.push(["append",p,b.slice(prefix)]);return ops;}
  if(a.length===b.length){for(let i=prefix;i<b.length;i++)diff(a[i],b[i],[...p,i],ops);return ops;}
 }
 if(a&&b&&typeof a==="object"&&typeof b==="object"&&!Array.isArray(a)&&!Array.isArray(b)){
  const ak=Object.keys(a),bk=Object.keys(b),kept=ak.filter(k=>Object.hasOwn(b,k)),added=bk.filter(k=>!Object.hasOwn(a,k));
  if(eq([...kept,...added],bk)){
   for(const k of ak)if(!Object.hasOwn(b,k))ops.push(["delete",[...p,k]]);
   for(const k of bk)if(!Object.hasOwn(a,k))ops.push(["set",[...p,k],b[k]]);else diff(a[k],b[k],[...p,k],ops);
   return ops;
  }
 }
 ops.push(["set",p,b]);return ops;
}
function apply(root,ops){
 for(const [op,p,value] of ops){
  if(!p.length){if(op==="set")root=value;else if(op==="append")root.push(...value);else throw Error("invalid root op");continue;}
  let n=root;for(const k of p.slice(0,-1)){assert(Object.hasOwn(n,k));n=n[k];}const k=p.at(-1);
  assert(!["__proto__","prototype","constructor"].includes(String(k)));
  if(op==="set")n[k]=value;else if(op==="append"){assert(Array.isArray(n[k]));n[k].push(...value);}else if(op==="delete"){assert(Object.hasOwn(n,k));delete n[k];}else throw Error("unknown op");
 }return root;
}
const mode=process.argv[2];
if(mode==="--apply"){
 const patch=JSON.parse(fs.readFileSync(process.argv[3],"utf8"));assert.equal(patch.schema,"ATLAS_CAREER_EXACT_BATCH_DELTA_V1");
 for(const asset of patch.assets){
  assert(assets.includes(asset.path));const base=read(patch.base,asset.path);assert.equal(key(base),asset.baseJsonSha256);
  const out=apply(base,asset.ops);assert.equal(key(out),asset.resultJsonSha256);
  fs.mkdirSync("career-delta-output/public/data",{recursive:true});
  fs.writeFileSync("career-delta-output/"+asset.path,gzipSync(JSON.stringify(out),{level:6}));
 }console.log("Exact batch reconstructed under career-delta-output; use append-only merge for a changed main. No final admission implied.");
}else{
 const refs=Object.fromEntries(["base","batch"].map((k,i)=>[k,execFileSync("git",["rev-parse",process.argv[i+2]|| (i?"HEAD":"HEAD^")],{encoding:"utf8"}).trim()]));
 const patch={schema:"ATLAS_CAREER_EXACT_BATCH_DELTA_V1",base:refs.base,batch:refs.batch,scope:"Conditional replay ledger, not final closure. Reconstruct only from exact base; do not overwrite concurrent main.",assets:[]};
 for(const path of assets){const a=read(refs.base,path),b=read(refs.batch,path);assert.equal(a.sourceMetadataSha256,b.sourceMetadataSha256);const ops=diff(a,b);const before=key(a),after=key(b);assert.equal(key(apply(a,ops)),after);patch.assets.push({path,baseJsonSha256:before,resultJsonSha256:after,ops});}
 fs.writeFileSync("overcap-v108-batch-delta.json",JSON.stringify(patch)+"\n");
 console.log(JSON.stringify({base:refs.base,batch:refs.batch,bytes:fs.statSync("overcap-v108-batch-delta.json").size,assets:patch.assets.map(a=>({path:a.path,ops:a.ops.length,hash:a.resultJsonSha256}))}));
}
