// Combine completed score products and expose native lab-effort bounds.
// These are workload calculations for ordered traces, not timed campaigns.
import fs from "node:fs";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {gunzipSync} from "node:zlib";
import {buildScoreLedger} from "./atlas-overcap-forward-score-v3.mjs";
const dir="tools/data/",sha=b=>createHash("sha256").update(b).digest("hex"),load=p=>JSON.parse(fs.readFileSync(p));
const indexPath=dir+"overcap-forward-persuasion-active-v3.json",sourcePath=dir+"overcap-forward-score-sources-v3.json",index=load(indexPath),source=load(sourcePath),rules=load("public/data/soldiers-modern-index.json").researchRules;
const nativeSha=sha(fs.readFileSync("tools/headless-simulator/native/oxce-source.tar.gz"));assert.equal(source.nativeArchiveSha256,nativeSha);
const ledgerPath=dir+"overcap-forward-score-ledgers-v3.json.gz",ledgerBytes=fs.readFileSync(ledgerPath),ledgerRegistry=JSON.parse(gunzipSync(ledgerBytes));
assert.equal(ledgerRegistry.inputs.persuasionIndexSha256,sha(fs.readFileSync(indexPath)));assert.equal(ledgerRegistry.inputs.scoreSourceSha256,sha(fs.readFileSync(sourcePath)));
const readGraph=(p,h)=>{const b=fs.readFileSync(p);assert.equal(sha(b),h,p);return JSON.parse(gunzipSync(b));};
const identity=r=>[r.scenario,r.root,r.award].join("|");
const staffing=[3,10,20,40,100],range=cost=>({minimum:Math.max(1,Math.floor(cost*50/100)),nominal:cost,maximum:Math.max(1,Math.floor(cost*150/100))});
function workload(steps){
 let month=0;const buckets=new Map(),out=[];
 for(const s of steps){
  month=s.monthAfter??month;
  if(!["research","repeatResearch"].includes(s.action.type))continue;
  const r=rules[s.action.id];assert(r&&Number.isInteger(r.cost)&&r.cost>0,s.action.id);
  const lab={step:s.index,month,id:s.action.id,...range(r.cost)};out.push(lab);
  if(!buckets.has(month))buckets.set(month,[]);buckets.get(month).push(lab);
 }
 return {labCount:out.length,labs:out,months:[...buckets.entries()].map(([month,rows])=>{
  const sums=Object.fromEntries(["minimum","nominal","maximum"].map(k=>[k,rows.reduce((n,r)=>n+r[k],0)]));
  return {month,labCount:rows.length,scientistDays:sums,serialDayFloor:rows.length,serialFitsAnyMonth:rows.length<=31,
   staffing:staffing.map(assigned=>({assigned,days:Object.fromEntries(["minimum","nominal","maximum"].map(k=>[k,rows.reduce((n,r)=>n+Math.ceil(r[k]/assigned),0)]))})),
   scope:"One project starts after the preceding completion; no prior partial research assumed. Does not include non-lab time, interruptions, hiring or parallel execution."};
 })};
}
const rows=[],extended=[];
for(const r of index.scenarios){
 const g=readGraph(r.path,r.sha256),p=readGraph(g.prefix.path,g.prefix.sha256),b=p.branches.find(x=>x.award===r.award);assert(b);
 const steps=[...p.shared,...b.steps,...g.steps].map((s,i)=>({...s,index:i+1}));
 const l=ledgerRegistry.rows.find(x=>identity(x)===identity(r));assert(l);assert.equal(l.stateHash,r.stateHash);
 const work=workload(steps);rows.push({scenario:r.scenario,root:r.root,award:r.award,prefix:r.path,prefixSha256:r.sha256,stateHash:r.stateHash,workload:work,rankRequirements:l.rankRequirements});
 const stem=dir+"overcap-forward-score-v3-"+r.scenario+"-"+r.root.toLowerCase()+"-"+r.award.toLowerCase(),pSummary=stem+"-summary.json";
 if(!fs.existsSync(pSummary))continue;
 const e=load(pSummary),x=readGraph(e.artifact,e.artifactSha256);
 assert.equal(x.prefix.sha256,r.sha256);assert.equal(x.prefix.stateHash,r.stateHash);assert.equal(x.prefix.steps,steps.length);assert.deepEqual(x.inputs,ledgerRegistry.inputs);
 let h=r.stateHash;for(const [i,s] of x.steps.entries()){assert.equal(s.index,steps.length+i+1);assert.equal(s.beforeHash,h);h=s.afterHash;}assert.equal(h,x.final.stateHash);
 const full=[...steps,...x.steps],fullWork=workload(full),addedWork=workload(x.steps),ledger=buildScoreLedger(full,source);
 const monthlyWork=fullWork.months.find(m=>m.month===x.final.month);
 extended.push({scenario:r.scenario,root:r.root,award:r.award,path:e.artifact,summary:pSummary,sha256:e.artifactSha256,stateHash:x.final.stateHash,newSteps:x.steps.length,newResearch:e.newResearch,researchCount:e.researchCount,scoreWindow:ledger.windows.at(-1),rankRequirements:x.final.rankRequirements,addedWorkload:addedWork,wholeMonthWorkload:monthlyWork,clockStatus:monthlyWork.serialFitsAnyMonth?"OPEN_TIME_AND_STAFFING":"SERIAL_MONTH_OVERBOOKED",gdx:x.gdx,deferredOptions:e.deferredOptions,actualGameCertified:false});
}
assert.equal(rows.length,10);assert.equal(extended.length,2);
const time={schema:"ATLAS_FORWARD_NATIVE_LAB_WORKLOAD_V3",sourceMetadataSha256:source.sourceMetadataSha256,nativeArchiveSha256:nativeSha,inputs:ledgerRegistry.inputs,
 native:{costRollPercent:[50,150],costRounding:"integer truncation, minimum 1 if positive",rollPolicy:"fixed for this research for the lifetime of the campaign",dailyProgress:"ResearchProject::step adds assigned scientist count; finished when spent >= fixed cost",anchors:["src/Basescape/ResearchInfoState.cpp:48-62","src/Savegame/ResearchProject.cpp:34-46"]},
 initialScientists:load(dir+"overcap-forward-starting-base-v3.json").scientists,staffingAssumptions:staffing,scenarios:rows,extensions:extended.map(x=>({scenario:x.scenario,root:x.root,award:x.award,sha256:x.sha256,addedWorkload:x.addedWorkload,wholeMonthWorkload:x.wholeMonthWorkload,clockStatus:x.clockStatus})),scope:"Exact workload arithmetic over the recorded direct lab sequence. Not a complete native schedule; actual scientists, prior project progress, overlapping labs, game dates and non-lab durations unknown. In particular a projected score from more than 31 serial completions is not certified as one month's score."};
const timePath=dir+"overcap-forward-score-workload-v3.json";fs.writeFileSync(timePath,JSON.stringify(time,null,2)+"\n");
const counts={ledgerScenarios:rows.length,extendedScenarios:extended.length,newSteps:extended.reduce((n,x)=>n+x.newSteps,0),newResearchFlagsAcrossBranches:extended.reduce((n,x)=>n+x.newResearch,0),maxResearchCount:Math.max(...extended.map(x=>x.researchCount)),deferredOptions:extended.reduce((n,x)=>n+x.deferredOptions,0),rankGrants:0,serialMonthOverbooked:extended.filter(x=>x.clockStatus==="SERIAL_MONTH_OVERBOOKED").length};
const active={schema:"ATLAS_FORWARD_SCORE_UNIFIED_V3",inputs:ledgerRegistry.inputs,ledger:{path:ledgerPath,sha256:sha(ledgerBytes),scenarios:rows.length},workload:{path:timePath,sha256:sha(fs.readFileSync(timePath))},counts,extensions:extended.map(({addedWorkload,...x})=>({...x,addedWorkload:{labCount:addedWorkload.labCount,months:addedWorkload.months}})),normalizationComplete:false,actualGameCertified:false,scope:"Rank still blocked by native score, time and unmodeled regional activity. Source-based GDX mission acquisition task only, not a completed mission."};
fs.writeFileSync(dir+"overcap-forward-score-active-v3.json",JSON.stringify(active,null,2)+"\n");
console.log(JSON.stringify({counts,extensions:active.extensions.map(x=>({scenario:x.scenario,newSteps:x.newSteps,newResearch:x.newResearch,researchCount:x.researchCount,scoreWindow:x.scoreWindow.modeledSubtotal,clockStatus:x.clockStatus,workload:x.wholeMonthWorkload}))},null,2));
