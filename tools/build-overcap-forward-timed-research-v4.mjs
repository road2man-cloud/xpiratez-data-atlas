import fs from "node:fs";
import {createHash} from "node:crypto";
import {createClock} from "./atlas-overcap-forward-clock-v4.mjs";
import {START_RESEARCH} from "./atlas-overcap-rooted-early-research.mjs";
const files={data:"public/data/soldiers-modern-index.json",forwardSupply:"tools/data/overcap-forward-supply-catalog-v2.json",forwardStartingBase:"tools/data/overcap-forward-starting-base-v3.json",forwardJunk:"tools/data/overcap-forward-junk-extraction-v3.json"};
const bytes=Object.fromEntries(Object.entries(files).map(([k,p])=>[k,fs.readFileSync(p)]));
const data=JSON.parse(bytes.data);
for(const k of Object.keys(files).filter(k=>k!=="data"))data[k]=JSON.parse(bytes[k]);
const clock=createClock(data),runs=[];
for(const root of Object.values(START_RESEARCH))for(const roll of [50,100,150]){
 const s=clock.start();let reason="STEP_LIMIT";
 for(let i=0;i<8;i++){
  const opts=clock.options(s).filter(o=>o.action.type==="research"&&!data.researchRules[o.action.id].needItem);
  const choice=i===0?opts.find(o=>o.action.id===root):opts.sort((a,b)=>Number(Object.values(START_RESEARCH).includes(a.action.id))-Number(Object.values(START_RESEARCH).includes(b.action.id))||data.researchRules[a.action.id].cost-data.researchRules[b.action.id].cost||a.action.id.localeCompare(b.action.id))[0];
  if(!choice){reason="NO_SUPPORTED_LAB";break;}
  try{clock.begin(s,choice.action.id,s.scientists,roll);while(s.projects.length)clock.tick(s);clock.deliver(s);}
  catch(e){reason=e.message;break;}
 }
 runs.push({root,roll,reason,date:clock.stamp(s),completed:[...s.world.researched].sort(),fixedCosts:s.fixedCosts,unfinished:s.projects,trace:s.trace});
}
const out={schema:"ATLAS_FORWARD_TIMED_RESEARCH_V4",actualGameCertified:false,normalizationComplete:false,scope:"January only; serial sample-free labs; fixed conditional cost bands; deterministic free choice; no monthly events, hiring, construction or combat.",inputs:Object.fromEntries(Object.entries(files).map(([k,p])=>[p,createHash("sha256").update(bytes[k]).digest("hex")])),initial:{date:"2601-01-01T12:00:00Z",weekday:5,scientists:data.forwardStartingBase.scientists,labCapacity:12},runs};
fs.writeFileSync("tools/data/overcap-forward-timed-research-v4.json",JSON.stringify(out,null,2)+"\n");
console.log(JSON.stringify(runs.map(r=>({root:r.root,roll:r.roll,date:r.date,direct:r.trace.filter(t=>t.type==="research").length,flags:r.completed.length,reason:r.reason})),null,2));
