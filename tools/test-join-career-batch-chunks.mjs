import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {spawnSync} from "node:child_process";
import {fileURLToPath} from "node:url";
const script=fileURLToPath(new URL("./join-career-batch-chunks.mjs",import.meta.url));
const root=fs.mkdtempSync(path.join(os.tmpdir(),"xpz-chunks-"));
const a=Buffer.from("first part"),b=Buffer.from("second part"),data=Buffer.concat([a,b]);
const gitBlobSha=x=>createHash("sha1").update("blob "+x.length+"\0").update(x).digest("hex");
const manifest=()=>({schema:"XPZ_CAREER_BATCH_CHUNKS_V1",bytes:data.length,sha256:createHash("sha256").update(data).digest("hex"),chunks:[a,b].map((x,i)=>({file:"part-0"+i+".bin",bytes:x.length,gitBlobSha:gitBlobSha(x)}))});
let count=0;
function test(name,mutate,ok,expectedError,existing=false){
 const dir=fs.mkdtempSync(path.join(root,"case-")),out=path.join(dir,"restored.gz"),m=manifest();
 fs.writeFileSync(path.join(dir,"part-00.bin"),a);fs.writeFileSync(path.join(dir,"part-01.bin"),b);
 mutate(m,dir);
 fs.writeFileSync(path.join(dir,"manifest.json"),JSON.stringify(m));
 if(existing)fs.writeFileSync(out,"keep me");
 const r=spawnSync(process.execPath,[script,dir,out],{encoding:"utf8"});
 assert.equal(r.status===0,ok,name+": "+r.stderr);
 if(ok)assert.deepEqual(fs.readFileSync(out),data,name);
 else {assert.match(r.stderr,expectedError,name);if(existing)assert.equal(fs.readFileSync(out,"utf8"),"keep me");else assert(!fs.existsSync(out),name);}
 console.log("PASS "+name);count++;
}
try{
 test("canonical manifest",()=>{},true);
 test("legacy sha field",m=>{for(const c of m.chunks){c.sha=c.gitBlobSha;delete c.gitBlobSha;}},true);
 test("matching aliases",m=>{m.chunks[0].sha=m.chunks[0].gitBlobSha;},true);
 test("conflicting aliases",m=>{m.chunks[0].sha="0".repeat(40);},false,/Conflicting chunk SHA fields/);
 test("missing hash",m=>{delete m.chunks[0].gitBlobSha;},false,/Missing Git blob SHA/);
 test("reordered chunks",m=>m.chunks.reverse(),false,/out-of-order/);
 test("duplicate chunks",m=>{m.chunks[1]=m.chunks[0];},false,/duplicate/);
 test("tampered chunk",(m,d)=>fs.writeFileSync(path.join(d,"part-00.bin"),Buffer.alloc(a.length)),false,/Wrong Git blob SHA/);
 test("truncated chunk",(m,d)=>fs.writeFileSync(path.join(d,"part-01.bin"),b.subarray(1)),false,/Wrong chunk length/);
 test("packet length mismatch",m=>{m.bytes++;},false,/Wrong packet length/);
 test("packet hash mismatch",m=>{m.sha256="0".repeat(64);},false,/Wrong packet SHA-256/);
 test("existing output untouched",()=>{},false,/EEXIST/,true);
 console.log(count+" tests passed");
}finally{fs.rmSync(root,{recursive:true,force:true});}
