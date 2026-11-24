// Round-trip-stable fingerprint for the modeled game state. Preserve key,
// array, Map and Set iteration order, types, holes and reference topology.
// Unsupported objects fail closed; never collapse a state by JSON alone.
import fs from "node:fs";
import path from "node:path";
import {createHash} from "node:crypto";
import {serialize,deserialize} from "node:v8";
import {gzipSync,gunzipSync} from "node:zlib";
const sha=b=>createHash("sha256").update(b).digest("hex");
const key=x=>sha(JSON.stringify(x));
export function exactStateHash(value){
 const seen=new Map();
 function encode(x){
  if(x===null)return ["null"];
  const t=typeof x;
  if(t==="undefined")return ["undefined"];
  if(t==="number")return ["number",Object.is(x,-0)?"-0":String(x)];
  if(t==="string"||t==="boolean")return [t,x];
  if(t==="bigint")return [t,String(x)];
  if(t!=="object")throw Error("Unsupported state value "+t);
  if(seen.has(x))return ["ref",seen.get(x)];
  const id=seen.size;seen.set(x,id);
  const proto=Object.getPrototypeOf(x);
  if(proto===Map.prototype||proto===Set.prototype){
   if(Reflect.ownKeys(x).length)throw Error("Map/Set custom properties");
   return proto===Map.prototype?["map",id,[...x].map(([k,v])=>[encode(k),encode(v)])]:["set",id,[...x].map(encode)];
  }
  const array=Array.isArray(x);
  if(array?proto!==Array.prototype:proto!==Object.prototype)throw Error("Unsupported state prototype");
  const props=[];
  for(const k of Reflect.ownKeys(x)){
   if(array&&k==="length")continue;
   if(typeof k!=="string")throw Error("Symbol state key");
   const d=Object.getOwnPropertyDescriptor(x,k);
   if(!d.enumerable||!("value" in d))throw Error("Unsupported property descriptor");
   props.push([k,encode(d.value)]);
  }
  return array?["array",id,x.length,props]:["object",id,props];
 }
 return key(encode(value));
}
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
   if(e.fingerprint!==fingerprint||e.actionHash!==k||!Buffer.isBuffer(e.payload)||sha(e.payload)!==e.payloadHash||!Buffer.isBuffer(e.worldBytes)||sha(e.worldBytes)!==e.worldHash)throw Error("Checkpoint integrity");
   if(expectedWorldHash&&e.worldHash!==expectedWorldHash)throw Error("Legacy evidence hash mismatch");
   const n=deserialize(e.payload);
   if(key(n.steps)!==k||n.trace.length!==actions.length||exactStateHash(n)!==e.nodeHash||exactStateHash(n.world)!==e.canonicalWorldHash||exactStateHash(deserialize(e.worldBytes))!==e.canonicalWorldHash)throw Error("Checkpoint state identity");
   metrics.hits++;metrics.avoidedActionSteps+=actions.length;metrics.bytesRead+=raw.length;return n;
  }catch(e){metrics.misses++;if(e.code!=="ENOENT")metrics.invalid++;return null;}
 }
 function save(n,expectedWorldHash=null){
  if(!enabled)return;
  const k=key(n.steps);
  try{
   const payload=serialize(n),worldBytes=serialize(n.world),worldHash=sha(worldBytes),nodeHash=exactStateHash(n),canonicalWorldHash=exactStateHash(n.world);
   if(expectedWorldHash&&worldHash!==expectedWorldHash)throw Error("Unverified world");
   if(n.trace.length!==n.steps.length||exactStateHash(deserialize(payload))!==nodeHash||exactStateHash(deserialize(worldBytes))!==canonicalWorldHash)throw Error("Non-lossless checkpoint");
   const e={fingerprint,actionHash:k,worldHash,worldBytes,canonicalWorldHash,nodeHash,payloadHash:sha(payload),payload};
   const raw=gzipSync(serialize(e),{level:3}),p=file(k),tmp=p+"."+process.pid+".tmp";
   fs.writeFileSync(tmp,raw);fs.renameSync(tmp,p);metrics.writes++;metrics.bytesWritten+=raw.length;
  }catch{metrics.writeErrors++;}
 }
 return {load,save,metrics};
}
