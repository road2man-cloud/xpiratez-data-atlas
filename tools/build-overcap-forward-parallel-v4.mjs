import fs from "node:fs";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {createSampleClock} from "./atlas-overcap-forward-clock-v4-samples.mjs";
import {START_RESEARCH} from "./atlas-overcap-rooted-early-research.mjs";
const files={data:"public/data/soldiers-modern-index.json",forwardSupply:"tools/data/overcap-forward-supply-catalog-v2.json",forwardStartingBase:"tools/data/overcap-forward-starting-base-v3.json",forwardJunk:"tools/data/overcap-forward-junk-extraction-v3.json"};
const bytes=Object.fromEntries(Object.entries(files).map(([k,p])=>[k,fs.readFileSync(p)]));
const data=JSON.parse(bytes.data);for(const k of Object.keys(files).filter(k=>k!=="data"))data[k]=JSON.parse(bytes[k]);
const clock=createSampleClock(data),runs=[];
const goals=["STR_WAT_DO","STR_INSPECT_MACHINERY","STR_QUESTION_OF_DRILL","STR_EMBRACE_THE_POWER","STR_MENACING_HULL","STR_PIRATE_STYLE","STR_LOOT_DISTRIBUTION","STR_NEPOTISM"];
for(const root of Object.values(START_RESEARCH))for(const roll of [50,100,150])for(const mode of ["serial","parallel"]){
 const s=clock.start();let reason="GOALS_REACHED",maxParallel=0;
 try{
  clock.begin(s,root,s.scientists,roll);
  while(s.projects.length)clock.tick(s);clock.flush(s);
  for(let day=0;!goals.every(id=>s.world.researched.has(id));day++){
   if(day>=28){reason="DAY_BUDGET";break;}
   clock.flush(s);
   const eligible=clock.options(s).filter(o=>o.action.type==="research"&&goals.includes(o.action.id)).map(o=>o.action.id).sort((a,b)=>goals.indexOf(a)-goals.indexOf(b));
   if(mode==="serial"){
    if(!s.projects.length&&eligible.length)clock.begin(s,eligible[0],s.scientists,roll);
   }else{
    // Start only labs currently available. Split at most three scientists;
    // use remaining staff on the first active project rather than idle them.
    for(const id of eligible){if(!clock.available(s))break;clock.begin(s,id,1,roll);}
    if(s.projects.length&&clock.available(s))clock.assign(s,s.projects[0].id,s.projects[0].assigned+clock.available(s));
   }
   if(!s.projects.length){reason="NO_SUPPORTED_LAB";break;}
   maxParallel=Math.max(maxParallel,s.projects.length);
   clock.tick(s);
  }
  clock.flush(s);
 }catch(e){reason=e.message;}
 const direct=s.trace.filter(t=>t.type==="researchSettlement");
 runs.push({root,roll,mode,reason,date:clock.stamp(s),elapsedHours:s.elapsedHours,maxParallel,direct:direct.length,completed:[...s.world.researched].sort(),sampleRecords:direct.filter(t=>t.sample),stock:s.world.items.STR_MENACING_HULL,unfinished:s.projects,trace:s.trace});
}
const sha=b=>createHash("sha256").update(b).digest("hex");
const out={schema:"ATLAS_FORWARD_PARALLEL_RESEARCH_V4_1",actualGameCertified:false,normalizationComplete:false,scope:"January-only conditional goal paths; no hiring, construction, manufacture, combat, or monthly scheduler. Native non-held sample path; destructive/returned adapter not yet demonstrated on actual campaign route.",inputs:Object.fromEntries(Object.entries(files).map(([k,p])=>[p,sha(bytes[k])])),engineSha256:sha(fs.readFileSync("tools/atlas-overcap-forward-clock-v4-samples.mjs","utf8").replace(/\r\n/g,"\n")),goals,runs};
assert(runs.some(r=>r.mode==="parallel"&&r.maxParallel>1&&r.sampleRecords.length),"No parallel sample path produced");
fs.writeFileSync("tools/data/overcap-forward-parallel-v4.json",JSON.stringify(out,null,2)+"\n");
console.log(JSON.stringify(runs.map(r=>({root:r.root,roll:r.roll,mode:r.mode,reason:r.reason,date:r.date,elapsedHours:r.elapsedHours,direct:r.direct,maxParallel:r.maxParallel,samples:r.sampleRecords.map(t=>[t.id,t.held,t.stock])})),null,2));
