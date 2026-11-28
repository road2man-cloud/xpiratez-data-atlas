// Continue each isolated source-start scenario. Existing prefix hashes
// must match exactly. New steps are selected from current engine options;
// conditional mission loot is only available through the narrow source module.
import fs from "node:fs";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {gzipSync,gunzipSync} from "node:zlib";
import {createForwardResearch,SCHEMA} from "./atlas-overcap-forward-research-v3.mjs";
import {createElectronicsMissionSupply} from "./atlas-overcap-forward-electronics-mission-v3.mjs";
import {exactStateHash} from "./origin-pair-exact-prefix-checkpoint.mjs";
import {key} from "./population-research-career-core.mjs";
const sha=b=>createHash("sha256").update(b).digest("hex"),load=p=>JSON.parse(fs.readFileSync(p)),arr=x=>Array.isArray(x)?x:[],pairs=x=>Object.entries(x||{}),dir="tools/data/";
const registryPath=dir+"overcap-forward-scenario-registry-v3.json",regBytes=fs.readFileSync(registryPath),reg=JSON.parse(regBytes);
const srcPath=dir+"overcap-forward-electronics-mission-sources-v3.json",srcBytes=fs.readFileSync(srcPath),source=JSON.parse(srcBytes);
const data=load("public/data/soldiers-modern-index.json");
data.forwardSupply=load(dir+"overcap-forward-supply-catalog-v2.json");data.forwardStartingBase=load(dir+"overcap-forward-starting-base-v3.json");data.forwardJunk=load(dir+"overcap-forward-junk-extraction-v3.json");
assert.equal(source.sourceMetadataSha256,reg.sourceMetadataSha256);
assert.equal(source.mapSourceSha256,reg.missionSourceIndex.sha256);
assert.equal(sha(fs.readFileSync("tools/headless-simulator/native/oxce-source.tar.gz")),source.nativeArchiveSha256);
const engine=createForwardResearch(data,{maxMonth:12}),mission=createElectronicsMissionSupply(data,engine,source),rules=data.researchRules;
const rootArg=process.argv.find(x=>x.startsWith("--root="))?.slice(7),scenarioArg=process.argv.find(x=>x.startsWith("--scenario="))?.slice(11);
const inputRows=reg.scenarios.filter(x=>(!rootArg||x.root===rootArg)&&(!scenarioArg||x.scenario===scenarioArg));assert(inputRows.length);
const goals=["STR_PADD","STR_ACADEMY_CORPSE","STR_GOVT_CORPSE","STR_WASTELANDER_BACKPACK","STR_STUN_BATON","STR_BASIC_ELECTRONICS","STR_LARGE_RADAR_SYSTEM","STR_HIDEOUT_DETECTOR","STR_DATA_MINING"];
const wanted=new Set();
function hint(id){if(wanted.has(id)||!rules[id])return;wanted.add(id);for(const k of arr(rules[id].dependencies))hint(k);}
for(const id of goals)hint(id);
const active=(w,k)=>w.researched.has(k)&&!w.disabled.has(k);
const targetCore=["STR_BASIC_ELECTRONICS","STR_LARGE_RADAR_SYSTEM","STR_HIDEOUT_DETECTOR"];
const need=(w,k)=>wanted.has(k)&&!active(w,k)&&!w.disabled.has(k);
const producerFiles=["tools/build-overcap-forward-electronics-v3.mjs","tools/atlas-overcap-forward-electronics-mission-v3.mjs","tools/build-overcap-forward-electronics-mission-sources-v3.mjs"];
const producerHashes=Object.fromEntries(producerFiles.map(p=>[p,sha(fs.readFileSync(p,"utf8").replace(/\r\n/g,"\n"))]));
const rows=[];
for(const row of inputRows){
 const b=fs.readFileSync(row.path);assert.equal(sha(b),row.sha256);
 const g=JSON.parse(gunzipSync(b));assert.equal(g.schema,"ATLAS_FORWARD_SHIPYARD_SCENARIO_V3");assert.equal(g.root,row.root);assert.equal(g.scenario,row.scenario);
 for(const [p,h] of pairs(g.inputs.files))assert.equal(sha(fs.readFileSync(p)),h,p);
 for(const [p,h] of pairs(g.inputs.engineFiles))assert.equal(sha(fs.readFileSync(p,"utf8").replace(/\r\n/g,"\n")),h,p);
 let w=engine.start(),root=null;
 if(g.scenario==="uk"){assert.equal(g.initialAction.scenarioContext.country,"STR_UK");w.countries=new Set(["STR_UK"]);}
 for(const step of g.steps){
  assert.equal(exactStateHash(w),step.beforeHash,"Prefix predecessor "+step.index);
  w=engine.apply(w,step.action,root).world;
  if(!root){assert.equal(step.action.id,g.root);root=g.root;}
  assert.equal(exactStateHash(w),step.afterHash,"Prefix successor "+step.index);
 }
 assert.equal(exactStateHash(w),g.final.stateHash);
 const steps=[],frontiers=[],failures=[];let coreCheckpoint=null;
 function opts(){
  const out=engine.options(w,root);
  // A mission projection does not know all other recovered items or the
  // full score/counter consequences. After it, only positive lab/recipe
  // progression and required free/delivery settlement are admitted here.
  const regular=w.forwardPartialMissionRecovery?out.choices.filter(x=>["research","freeResearch","sourceResearchDelivery","sourceRandomManufacture","sourceManufactureItem"].includes(x.action.type)):out.choices;
  return {choices:[...regular,...mission.options(w,root)],unresolved:out.unresolved};
 }
 function rank(x){
  const a=x.action,e=x.evidence;
  if(w.pendingFree&&a.type==="freeResearch")return 20000+(need(w,a.research)?1000:0);
  if(arr(w.forwardDeliveries).length&&a.type==="sourceResearchDelivery")return 20000;
  if(a.type==="sourceMissionRecovery")return Object.keys(e.loot).some(k=>need(w,k)&&!(w.items[k]>0))?500:0;
  if(a.type==="sourceMissionSampleExtraction")return need(w,"STR_STUN_BATON")&&!(w.items.STR_STUN_BATON>0)?400:0;
  if(a.type==="research")return need(w,a.id)?(goals.includes(a.id)?250:100):0;
  return 0;
 }
 for(let i=0;i<40;i++){
  const {choices,unresolved}=opts();
  const ranked=choices.map((x,i)=>({x,i,p:rank(x)})).filter(x=>x.p>0).sort((a,b)=>b.p-a.p||a.i-b.i);
  let selected=null;
  for(const {x} of ranked){
   try{
    const before=w,custom=["sourceMissionRecovery","sourceMissionSampleExtraction"].includes(x.action.type),r=custom?mission.apply(w,x.action,root):engine.apply(w,x.action,root);
    const next=r.world,itemChanges={};for(const k of new Set([...Object.keys(before.items),...Object.keys(next.items)])){const a=Number(before.items[k]||0),b=Number(next.items[k]||0);if(a!==b)itemChanges[k]={before:a,after:b,delta:b-a};}
    selected=x;steps.push({index:g.steps.length+steps.length+1,action:x.action,evidence:x.evidence,beforeHash:exactStateHash(before),afterHash:exactStateHash(next),month:next.month,added:[...next.researched].filter(k=>!before.researched.has(k)),closed:[...next.disabled].filter(k=>!before.disabled.has(k)),itemChanges,conditional:r.conditional,notes:r.notes});
    w=next;
    if(!coreCheckpoint&&targetCore.every(k=>active(w,k))&&!w.pendingFree&&!arr(w.forwardDeliveries).length)coreCheckpoint={step:g.steps.length+steps.length,stateHash:exactStateHash(w),researchCount:w.researched.size,researched:[...w.researched].sort(),disabled:[...w.disabled].sort(),items:{...w.items},baseFunctions:[...w.baseFunctions].sort(),facilities:[...w.facilities].sort(),partialInventory:!!w.forwardPartialMissionRecovery};
    break;
   }catch(e){failures.push({action:x.action,reason:e.message});}
  }
  frontiers.push({afterStep:g.steps.length+steps.length,offered:choices.length,selected:selected?.action||null,deferred:choices.filter(x=>!selected||key([x.action,x.evidence])!==key([selected.action,selected.evidence])),unresolved});
  if(!selected)break;
 }
 const targets=goals.map(id=>({id,reached:active(w,id),missingDependencies:arr(rules[id]?.dependencies).filter(k=>!active(w,k))}));
 const final={stateHash:exactStateHash(w),month:w.month,researched:[...w.researched].sort(),disabled:[...w.disabled].sort(),items:w.items,baseFunctions:[...w.baseFunctions].sort(),facilities:[...w.facilities].sort(),completedMissions:[...(w.completedMissions||[])],missionReceipts:w.forwardMissionReceipts||[],partialInventory:!!w.forwardPartialMissionRecovery};
 const stem=dir+"overcap-forward-electronics-v3-"+row.scenario+"-"+root.toLowerCase();
 const status=targetCore.every(k=>active(w,k))?"CONDITIONAL_ELECTRONICS_MILESTONES_REACHED":"OPEN";
 const result={schema:"ATLAS_FORWARD_ELECTRONICS_SCENARIO_V3",scenario:row.scenario,root,prefix:{path:row.path,sha256:row.sha256,stateHash:g.final.stateHash,steps:g.steps.length},registrySha256:sha(regBytes),sourceSha256:sha(srcBytes),producerHashes,inputs:g.inputs,steps,frontiers,failures,targets,status,coreCheckpoint,final,normalizationComplete:false,actualGameCertified:false,scope:"Continuation of exact existing scenario prefix. Mission outcomes and recovered samples assumed from source-bounded cases; inventory is a tracked subset, not a full live game state. No other event/mission consequences inferred."};
 const out=gzipSync(JSON.stringify(result),{level:9});fs.writeFileSync(stem+".json.gz",out);
 const report={...result,frontiers:undefined,artifact:stem+".json.gz",artifactSha256:sha(out),newSteps:steps.length,totalSteps:g.steps.length+steps.length,labDepth:row.labDepth+steps.filter(s=>s.action.type==="research").length,researchCount:w.researched.size,deferredOptions:frontiers.reduce((n,f)=>n+f.deferred.length,0)};
 fs.writeFileSync(stem+"-summary.json",JSON.stringify(report,null,2)+"\n");
 rows.push({scenario:row.scenario,root,path:report.artifact,summary:stem+"-summary.json",sha256:report.artifactSha256,stateHash:final.stateHash,status,newSteps:report.newSteps,totalSteps:report.totalSteps,labDepth:report.labDepth,researchCount:report.researchCount,deferredOptions:report.deferredOptions,targets,coreCheckpoint:coreCheckpoint?{step:coreCheckpoint.step,stateHash:coreCheckpoint.stateHash,researchCount:coreCheckpoint.researchCount}:null,missionReceipts:final.missionReceipts,partialInventory:final.partialInventory});
 console.log(JSON.stringify({scenario:row.scenario,root,status,newSteps:steps.length,researchCount:w.researched.size,targets,actions:steps.map(s=>s.action),failures}));
}
const indexPath=dir+"overcap-forward-electronics-active-v3.json";
const out={schema:"ATLAS_FORWARD_ELECTRONICS_ACTIVE_V3",baseRegistrySha256:sha(regBytes),sourceSha256:sha(srcBytes),producerHashes,scenarios:rows,normalizationComplete:false,actualGameCertified:false};
if(inputRows.length===reg.scenarios.length)fs.writeFileSync(indexPath,JSON.stringify(out,null,2)+"\n");
