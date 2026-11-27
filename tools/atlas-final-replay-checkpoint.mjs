// Local resumable memo of exact final-scope replays. Never used as a
// pruning certificate, and never bypasses current descendant/material gates.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {key,sha} from "./population-research-career-core.mjs";
export const CACHE_SCHEMA="ATLAS_EXACT_FINAL_REPLAY_CHECKPOINT_V1";
export function replayContext({db,ledger,sets,budget,sourceHashes}){
 const files=new Map(),queue=["tools/atlas-final-career-admission-v3-body-scope.mjs","tools/population-shared-lifecycle-replay.mjs"];
 while(queue.length){
  const p=queue.pop();if(files.has(p))continue;
  const src=fs.readFileSync(p,"utf8").replace(/\r\n/g,"\n");files.set(p,sha(src));
  for(const m of src.matchAll(/^\s*(?:import|export)\s+(?:[^;\n]*?\s+from\s+)?["'](\.[^"']+)["']/gm))queue.push(path.posix.normalize(path.posix.join(path.posix.dirname(p),m[1].split("?")[0])));
 }
 return key([CACHE_SCHEMA,process.versions.node,process.versions.v8,[...files].sort(([a],[b])=>a.localeCompare(b)),sourceHashes,sets.sourceMetadataSha256,sets.replayFingerprint,db.branches,db.careerCompletion.terminalRule,budget.sha256,budget.finite,ledger.summary.defaultRankPolicy||null,ledger.summary.flatRollPolicy||null,ledger.summary.lifecyclePolicy||null]);
}
export function createFinalReplayCheckpoint(context,{file=process.env.ATLAS_FINAL_REPLAY_CACHE||path.join(os.tmpdir(),"atlas-final-replay-"+key(process.cwd()).slice(0,20)+".ndjson"),enabled=process.env.ATLAS_FINAL_REPLAY_CACHE!=="off"}={}){
 const entries=new Map(),metrics={schema:CACHE_SCHEMA,loaded:0,hits:0,misses:0,written:0,rejected:0,ioErrors:0,enabled};
 if(enabled&&fs.existsSync(file)){
  try{for(const line of fs.readFileSync(file,"utf8").split("\n")){
   if(!line.trim())continue;
   try{const r=JSON.parse(line);if(r.context!==context)continue;
    if(r.schema!==CACHE_SCHEMA||r.hash!==key([r.context,r.input,r.value])||!r.value||!["FINAL_CLOSED","OPEN_RESEARCH_OR_GROWTH","OPEN_TRANSFORMATION"].includes(r.value.status)){metrics.rejected++;continue;}
    entries.set(r.input,r.value);
   }catch{metrics.rejected++;}
  }}catch{metrics.ioErrors++;}
 }
 metrics.loaded=entries.size;
 function get(input){
  if(!enabled)return null;
  const v=entries.get(input);if(!v){metrics.misses++;return null;}
  metrics.hits++;return structuredClone(v);
 }
 function put(input,value){
  if(!enabled||!value||!["FINAL_CLOSED","OPEN_RESEARCH_OR_GROWTH","OPEN_TRANSFORMATION"].includes(value.status))return;
  if(!(value.certificate?.independentReplay||value.independentReplay))return;
  const v=structuredClone(value),r={schema:CACHE_SCHEMA,context,input,value:v,hash:key([context,input,v])};
  entries.set(input,v);
  try{fs.appendFileSync(file,JSON.stringify(r)+"\n","utf8");metrics.written++;}
  catch{metrics.ioErrors++;}
 }
 return {get,put,metrics};
}
