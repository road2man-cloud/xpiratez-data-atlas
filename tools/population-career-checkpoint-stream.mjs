// Bounded-memory JSON-lines gzip checkpoint. A single giant JSON.stringify
// cannot serialize the full state store once V8's string limit is reached.
import fs from "node:fs";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {createGzip,createGunzip} from "node:zlib";
import {Readable} from "node:stream";
import {pipeline} from "node:stream/promises";
import {StringDecoder} from "node:string_decoder";
export const CHECKPOINT_SCHEMA="CAREER_CHUNKED_JSONL_V1";
const BATCH=512;
export async function writeCareerCheckpoint(file,identity,payload){
 const {nodes,work,...meta}=payload;
 const hash=createHash("sha256");
 function* rows(){
  const emit=x=>{const b=Buffer.from(JSON.stringify(x)+"\n");hash.update(b);return b;};
  yield emit({kind:"header",schema:CHECKPOINT_SCHEMA,identity,meta,nodeCount:nodes.length,groupCount:work.length});
  for(let i=0;i<nodes.length;i+=BATCH)yield emit({kind:"nodes",offset:i,rows:nodes.slice(i,i+BATCH)});
  for(let i=0;i<work.length;i++){
   const {records,...group}=work[i];
   yield emit({kind:"group",index:i,group,recordCount:records.length});
   for(let j=0;j<records.length;j+=BATCH)yield emit({kind:"records",index:i,offset:j,rows:records.slice(j,j+BATCH)});
  }
  yield Buffer.from(JSON.stringify({kind:"footer",digest:hash.digest("hex")})+"\n");
 }
 const tmp=file+".tmp";
 try{
  await pipeline(Readable.from(rows()),createGzip({level:4}),fs.createWriteStream(tmp));
  fs.renameSync(tmp,file);
 }catch(e){if(fs.existsSync(tmp))fs.unlinkSync(tmp);throw e;}
 return {bytes:fs.statSync(file).size,nodeCount:nodes.length,groupCount:work.length};
}
export async function readCareerCheckpoint(file){
 const hash=createHash("sha256"),decoder=new StringDecoder("utf8"),nodes=[],work=[];
 let header=null,footer=null,expected=0,carry="";
 function consume(line){
  assert(line.length>0&&!footer,"Empty line or data after checkpoint footer");
  const r=JSON.parse(line);
  if(r.kind==="footer"){
   assert(header&&nodes.length===header.nodeCount&&work.length===header.groupCount&&(!work.length||work.at(-1).records.length===expected));
   assert.equal(r.digest,hash.digest("hex"),"Checkpoint content digest mismatch");footer=r;return;
  }
  hash.update(line+"\n");
  if(r.kind==="header"){
   assert(!header&&r.schema===CHECKPOINT_SCHEMA);
   assert(Number.isSafeInteger(r.nodeCount)&&Number.isSafeInteger(r.groupCount));
   header=r;return;
  }
  assert(header,"Missing checkpoint header");
  if(r.kind==="nodes"){
   assert(!work.length&&r.offset===nodes.length&&r.rows.length<=BATCH&&r.rows.length>0);
   for(const n of r.rows)nodes.push(n);
  }else if(r.kind==="group"){
   assert(nodes.length===header.nodeCount&&r.index===work.length&&(!work.length||work.at(-1).records.length===expected));
   assert(Number.isSafeInteger(r.recordCount)&&r.recordCount>=0);
   expected=r.recordCount;work.push({...r.group,records:[]});
  }else if(r.kind==="records"){
   const g=work.at(-1);assert(g&&r.index===work.length-1&&r.offset===g.records.length&&r.rows.length>0&&r.rows.length<=BATCH);
   for(const record of r.rows)g.records.push(record);
   assert(g.records.length<=expected);
  }else throw Error("Unexpected checkpoint record "+r.kind);
 }
 function feed(s){
  carry+=s;let start=0,end;
  while((end=carry.indexOf("\n",start))>=0){consume(carry.slice(start,end));start=end+1;}
  carry=carry.slice(start);
 }
 await pipeline(fs.createReadStream(file),createGunzip(),async source=>{
  for await(const chunk of source)feed(decoder.write(chunk));
  feed(decoder.end());
 });
 assert.equal(carry,"","Checkpoint missing final newline");assert(header&&footer,"Incomplete checkpoint");
 return {identity:header.identity,digest:footer.digest,payload:{...header.meta,nodes,work},schema:CHECKPOINT_SCHEMA};
}
