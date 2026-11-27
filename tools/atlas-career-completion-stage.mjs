// Atomic intermediate artifact for the expensive research-line preparation.
// It is NOT a publishable registry. Only finalization may replace the DB.
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import assert from "node:assert/strict";
import {createGzip,createGunzip} from "node:zlib";
import {Readable} from "node:stream";
import {pipeline} from "node:stream/promises";
import {createInterface} from "node:readline";
import {key,sha} from "./population-research-career-core.mjs";
import {ledgers} from "../public/branch-soldier-atlas-career-core.js";
import {packResearchPaths,hydrateResearchPaths} from "../public/branch-soldier-research-path-codec.js";
import {packEconomyDetails} from "../public/branch-soldier-economy-detail-codec.js";
const schema="ATLAS_CAREER_COMPLETION_PREPARED_STAGE_V2";
export function completionStage(){
 const mode=process.argv.find(x=>x.startsWith("--completion-stage="))?.slice(19)||"all";
 assert(["all","prepare","finalize"].includes(mode),"Unknown completion stage");
 const file=process.env.ATLAS_COMPLETION_STAGE_FILE||path.join(os.tmpdir(),"atlas-completion-"+key(process.cwd()).slice(0,20)+".json.gz");
 function identity(){
  const files=new Map(),queue=["tools/build-atlas-career-completion.mjs"];
  while(queue.length){
   const p=queue.pop();if(files.has(p))continue;
   const source=fs.readFileSync(p,"utf8").replace(/\r\n/g,"\n");files.set(p,sha(source));
   for(const m of source.matchAll(/^\s*(?:import|export)\s+(?:[^;\n]*?\s+from\s+)?["'](\.[^"']+)["']/gm))queue.push(path.posix.normalize(path.posix.join(path.posix.dirname(p),m[1].split("?")[0])));
  }
  const data=["public/data/branch-soldier-results.json.gz","public/data/soldiers-modern-index.json","public/data/soldier-acquisition-progression-20261102.json","public/data/soldier-source-catalog.json","public/data/soldier-final-career-alternating-v9.json.gz","public/items/acquisition-index.json",...ledgers.flatMap(l=>[l.file,l.index].filter(Boolean).map(p=>"public/data/"+p+".json.gz"))];
  for(const p of new Set(data))files.set(p,fs.existsSync(p)?sha(fs.readFileSync(p)):null);
  return key([schema,process.versions.node,process.versions.v8,[...files].sort(([a],[b])=>a.localeCompare(b))]);
 }
 const inputIdentity=mode==="all"?null:identity();
 if(mode!=="all")assert(!process.argv.some(x=>x.startsWith("--game-root=")),"Staged build requires already extracted terminal rules");
 async function save({db,comparisonRows,seenSize}){
  assert(mode==="prepare");
  packEconomyDetails(packResearchPaths(db));
  const temp=file+"."+process.pid+".tmp";
  // Split top-level object maps and arrays into bounded records, not a
  // single massive JSON string. Projected comparison rows can be rebuilt.
  function* records(){
   yield JSON.stringify(["header",schema,inputIdentity,seenSize])+"\n";
   for(const [k,v] of Object.entries(db)){
    if(k==="careerCompletion"){
     for(const [f,x] of Object.entries(v))yield JSON.stringify(["career",f,x])+"\n";
    }else if(v&&typeof v==="object"&&!Array.isArray(v)){
     yield JSON.stringify(["map",k])+"\n";
     for(const [f,x] of Object.entries(v))yield JSON.stringify(["entry",k,f,x])+"\n";
    }else if(Array.isArray(v)){
     yield JSON.stringify(["array",k])+"\n";
     for(const x of v)yield JSON.stringify(["item",k,x])+"\n";
    }else yield JSON.stringify(["field",k,v])+"\n";
   }
   yield JSON.stringify(["end"])+"\n";
  }
  await pipeline(Readable.from(records()),createGzip({level:3}),fs.createWriteStream(temp));fs.renameSync(temp,file);
  console.log(JSON.stringify({stage:"prepared",file,researchLines:db.careerCompletion.researchLineRows.length,comparisonRows:comparisonRows.length,bytes:fs.statSync(file).size}));
 }
 async function load(){
  assert(mode==="finalize");
  const db={careerCompletion:{}};let seenSize=null,end=false;
  const input=fs.createReadStream(file),gzip=createGunzip();input.on("error",e=>gzip.destroy(e));input.pipe(gzip);
  for await(const line of createInterface({input:gzip,crlfDelay:Infinity})){
   const [kind,a,b,c]=JSON.parse(line);
   if(kind==="header"){assert.equal(a,schema);assert.equal(b,inputIdentity,"Prepared stage inputs changed; regenerate stage");seenSize=c;continue;}
   assert(seenSize!==null&&!end,"Invalid stage record order");
   if(kind==="career")db.careerCompletion[a]=b;
   else if(kind==="map")db[a]={};
   else if(kind==="entry")db[a][b]=c;
   else if(kind==="array")db[a]=[];
   else if(kind==="item")db[a].push(b);
   else if(kind==="field")db[a]=b;
   else if(kind==="end")end=true;
   else throw Error("Unknown stage record "+kind);
  }
  assert(end&&Number.isSafeInteger(seenSize)&&seenSize>=0,"Incomplete stage");
  return {db:hydrateResearchPaths(db),seenSize};
 }
 return {mode,save,load};
}
