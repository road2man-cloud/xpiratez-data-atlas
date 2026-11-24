// Exact prefix checkpoint cache. Stores only internally produced modeled game
// worlds, never real saves. Full action digest, engine fingerprint and binary
// integrity checked on every load; a corrupt/stale entry is a cache miss.
import fs from "node:fs";
import path from "node:path";
import {createHash} from "node:crypto";
import {serialize,deserialize} from "node:v8";
import {gzipSync,gunzipSync} from "node:zlib";
const sha=b=>createHash("sha256").update(b).digest("hex");
const key=x=>sha(JSON.stringify(x));
export function createExactPrefixCheckpointCache(dir,fingerprint,{enabled=true}={}){
 const folder=path.join(dir,key([fingerprint,process.versions.node,process.versions.v8]));
 if(enabled)fs.mkdirSync(folder,{recursive:true});
 const metrics={hits:0,misses:0,writes:0,invalid:0,writeErrors:0,avoidedActionSteps:0,bytesRead:0,bytesWritten:0};
 const file=k=>path.join(folder,k+".bin.gz");
 function load(actions,expectedWorldHash=null){
  if(!enabled)return null;
  const k=key(actions);
  try{
   const raw=fs.readFileSync(file(k)),e=deserialize(gunzipSync(raw));
   if(e.fingerprint!==fingerprint||e.actionHash!==k||!Buffer.isBuffer(e.payload)||sha(e.payload)!==e.payloadHash)throw Error("Checkpoint integrity");
   const n=deserialize(e.payload);
   if(key(n.steps)!==k||n.trace.length!==actions.length||sha(serialize(n.world))!==e.worldHash||(expectedWorldHash&&e.worldHash!==expectedWorldHash))throw Error("Checkpoint state identity");
   metrics.hits++;metrics.avoidedActionSteps+=actions.length;metrics.bytesRead+=raw.length;return n;
  }catch(e){metrics.misses++;if(e.code!=="ENOENT")metrics.invalid++;return null;}
 }
 function save(n,expectedWorldHash=null){
  if(!enabled)return;
  const k=key(n.steps);
  try{
   const payload=serialize(n),worldHash=sha(serialize(n.world));
   if(expectedWorldHash&&worldHash!==expectedWorldHash)throw Error("Unverified world");
   if(n.trace.length!==n.steps.length)throw Error("Trace mismatch");
   const e={fingerprint,actionHash:k,worldHash,payloadHash:sha(payload),payload};
   const raw=gzipSync(serialize(e),{level:3}),p=file(k),tmp=p+"."+process.pid+".tmp";
   fs.writeFileSync(tmp,raw);fs.renameSync(tmp,p);metrics.writes++;metrics.bytesWritten+=raw.length;
  }catch{metrics.writeErrors++;}
 }
 return {load,save,metrics};
}
