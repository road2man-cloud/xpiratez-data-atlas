// Actual conditional continuations from the preserved electronics core.
// The newly acquired captive is consumed by research. Free reward alternatives
// are separate branches, never simultaneous research grants.
import fs from "node:fs";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {gzipSync} from "node:zlib";
import {resumeElectronics} from "./replay-overcap-forward-electronics-v3.mjs";
import {createForwardResearch} from "./atlas-overcap-forward-research-v3.mjs";
import {createGdxBridge} from "./atlas-overcap-forward-gdx-bridge-v3.mjs";
import {exactStateHash} from "./origin-pair-exact-prefix-checkpoint.mjs";
import {key} from "./population-research-career-core.mjs";
const dir="tools/data/",sha=b=>createHash("sha256").update(b).digest("hex"),load=p=>JSON.parse(fs.readFileSync(p)),arr=x=>Array.isArray(x)?x:[],sort=x=>[...x].sort();
const indexPath=dir+"overcap-forward-electronics-active-v3.json",indexBytes=fs.readFileSync(indexPath),index=JSON.parse(indexBytes);
const sourcePath=dir+"overcap-forward-gdx-bridge-sources-v3.json",sourceBytes=fs.readFileSync(sourcePath),source=JSON.parse(sourceBytes);
assert.equal(source.nativeArchiveSha256,sha(fs.readFileSync("tools/headless-simulator/native/oxce-source.tar.gz")));
const inputs={electronicsIndexSha256:sha(indexBytes),sourceSha256:sha(sourceBytes),producerFiles:Object.fromEntries(["tools/build-overcap-forward-gdx-bridge-v3.mjs","tools/atlas-overcap-forward-gdx-bridge-v3.mjs","tools/build-overcap-forward-gdx-sources-v3.mjs","tools/replay-overcap-forward-electronics-v3.mjs"].map(p=>[p,sha(fs.readFileSync(p,"utf8").replace(/\r\n/g,"\n"))]))};
const arg=(k,d)=>process.argv.find(x=>x.startsWith("--"+k+"="))?.slice(k.length+3)||d;
const rootArg=arg("root","ALL"),scenarioArg=arg("scenario","ALL");
const targets=["STR_SECTOID_SOLDIER","STR_ALIEN_ORIGINS","STR_BEER","STR_ALIEN_TERROR","STR_DATA_MINING","STR_GLAMOUR","STR_SALVAGE","STR_GDX_001","STR_GDX_002","STR_GDX_000","STR_GDX_003","STR_GDX_004","STR_GDX_005","STR_CONTACT_MUTANT_ALLIANCE","STR_SCHOOL_BOOKS","STR_LIBRARY","STR_SCHOOLING_2"];
const support=new Set(["STR_SECTOID_SOLDIER","STR_ALIEN_ORIGINS","STR_BEER","STR_ALIEN_TERROR","STR_DATA_MINING","STR_GLAMOUR","STR_SALVAGE","STR_MESS_HALL","STR_FARMING","STR_CUNNING","STR_GDX_001","STR_GDX_002","STR_GDX_000","STR_GDX_003","STR_GDX_004","STR_GDX_005","STR_SECTOID_MEDIC","STR_ACADEMY_NURSE"]);
const active=(w,id)=>w.researched.has(id)&&!w.disabled.has(id);
const rows=[];
for(const base of index.scenarios.filter(r=>(rootArg==="ALL"||r.root===rootArg)&&(scenarioArg==="ALL"||r.scenario===scenarioArg))){
 const c=resumeElectronics({scenario:base.scenario,root:base.root,cursor:"core"}),data=c.data,engine=createForwardResearch(data,{maxMonth:12}),bridge=createGdxBridge(data,engine,source),rules=data.researchRules;
 const root=c.root;
 function options(w){
  const opts=c.optionsAt(w);
  const native=engine.options(w,root);
  // These extra operations only use positive research, facility and stock
  // gates. No score/geography/negative inventory dependent action.
  const facility=native.choices.filter(x=>x.action.type==="sourceBuildFacility"&&x.action.id==="STR_MESS_HALL");
  return {choices:[...opts,...facility,...bridge.options(w,root)],unresolved:native.unresolved};
 }
 function apply(w,opt){
  assert(options(w).choices.some(x=>key([x.action,x.evidence])===key([opt.action,opt.evidence])),"No current source option");
  if(["sourceGdxCapture","sourceGdxOrder"].includes(opt.action.type))return bridge.apply(w,opt.action,root);
  if(opt.action.type==="sourceBuildFacility")return engine.apply(w,opt.action,root);
  return c.apply(w,opt.action);
 }
 function record(w,opt,index){
  const r=apply(w,opt),n=r.world,items={};
  for(const k of new Set([...Object.keys(w.items),...Object.keys(n.items)])){
   const before=Number(w.items[k]||0),after=Number(n.items[k]||0);if(before!==after)items[k]={before,after,delta:after-before};
  }
  return {world:n,step:{index,action:opt.action,evidence:opt.evidence,beforeHash:exactStateHash(w),afterHash:exactStateHash(n),added:sort([...n.researched].filter(k=>!w.researched.has(k))),closed:sort([...n.disabled].filter(k=>!w.disabled.has(k))),itemChanges:items,newFunctions:sort([...n.baseFunctions].filter(k=>!w.baseFunctions.has(k))),newFacilities:sort([...n.facilities].filter(k=>!w.facilities.has(k))),notes:r.notes,conditional:r.conditional}};
 }
 // Establish the capture and then stop before the bonus roll, so the
 // siblings actually share the same predecessor.
 let w=c.world;const prefixSteps=[],sharedFrontiers=[];
 for(const type of ["sourceGdxCapture","research"]){
  const {choices}=options(w),opt=choices.find(x=>x.action.type===type&&(type!=="research"||x.action.id==="STR_SECTOID_SOLDIER"));
  assert(opt,"Missing source-backed captive step "+type);
  const r=record(w,opt,c.through+prefixSteps.length+1);
  sharedFrontiers.push({beforeHash:exactStateHash(w),selected:opt.action,deferred:choices.filter(x=>key(x.action)!==key(opt.action))});
  w=r.world;prefixSteps.push(r.step);
 }
 const forkHash=exactStateHash(w),forkWorld=w;assert(w.pendingFree?.source==="STR_SECTOID_SOLDIER");
 const branches=[];
 for(const award of ["STR_ALIEN_TERROR","STR_VODKA","STR_ELECTRONIC_PIECES"]){
  let world=forkWorld;
  const steps=[],frontiers=[],failures=[];
  const seen=new Set([forkHash]);
  function rank(opt){
   const a=opt.action,e=opt.evidence;
   if(world.pendingFree&&a.type==="freeResearch")return a.research===award&&steps.length===0?100000:steps.length===0?0:20000+(support.has(a.research)?500:0);
   if(arr(world.forwardDeliveries).length&&a.type==="sourceResearchDelivery")return 20000;
   if(a.type==="sourceGdxOrder")return 1000;
   if(a.type==="sourceBuildFacility")return world.baseFunctions.has("CULT")?0:500;
   if(a.type==="research"&&support.has(a.id)&&!active(world,a.id))return ["STR_ALIEN_ORIGINS","STR_BEER","STR_DATA_MINING","STR_GLAMOUR","STR_SALVAGE"].includes(a.id)?250:100;
   return 0;
  }
  for(let i=0;i<32;i++){
   const {choices,unresolved}=options(world);
   const ranked=choices.map((x,i)=>({x,i,p:rank(x)})).filter(x=>x.p>0).sort((a,b)=>b.p-a.p||a.i-b.i);
   let chosen=null;
   for(const {x} of ranked){
    try{const r=record(world,x,c.through+prefixSteps.length+steps.length+1);if(seen.has(r.step.afterHash))continue;chosen=x;seen.add(r.step.afterHash);steps.push(r.step);world=r.world;break;}
    catch(e){failures.push({action:x.action,reason:e.message});}
   }
   frontiers.push({beforeHash:chosen?steps.at(-1).beforeHash:exactStateHash(world),selected:chosen?.action||null,deferred:choices.filter(x=>!chosen||key([x.action,x.evidence])!==key([chosen.action,chosen.evidence])),unresolved});
   if(!chosen)break;
  }
  assert.equal(steps[0]?.action.research,award);assert(active(world,award));
  assert(!world.pendingFree&&!arr(world.forwardDeliveries).length);
  const milestones=targets.map(id=>({id,reached:active(world,id),disabled:world.disabled.has(id),missingDependencies:arr(rules[id]?.dependencies).filter(k=>!active(world,k)),missingFunctions:arr(rules[id]?.requiresBaseFunc).filter(k=>!world.baseFunctions.has(k)),sample:rules[id]?.needItem?{id:rules[id].neededItem||id,held:Number(world.items[rules[id].neededItem||id]||0)}:null}));
  branches.push({award,seedHash:forkHash,steps,frontiers,failures,final:{stateHash:exactStateHash(world),researchCount:world.researched.size,researched:sort(world.researched),disabled:sort(world.disabled),items:world.items,baseFunctions:sort(world.baseFunctions),facilities:sort(world.facilities),month:world.month,missionReceipts:world.forwardMissionReceipts},milestones,orderBlockers:bridge.orderBlockers(world),deferredOptions:frontiers.reduce((n,f)=>n+f.deferred.length,0),actualGameCertified:false});
 }
 const stem=dir+"overcap-forward-gdx-bridge-v3-"+base.scenario+"-"+root.toLowerCase();
 const out={schema:"ATLAS_FORWARD_GDX_BRIDGE_SCENARIO_V3",scenario:base.scenario,root,prefix:{path:base.path,sha256:base.sha256,cursor:"core",step:c.through,stateHash:c.stateHash},inputs,prefixSteps,sharedFrontiers,forkHash,branches,normalizationComplete:false,actualGameCertified:false,scope:"Three distinct conditional outcomes of one captive's free research. No branch merge. Further GDX event research only when actual prerequisite flags and time are satisfied. Partial inventory, construction and combat outcomes remain conditional."};
 const b=gzipSync(JSON.stringify(out),{level:9});fs.writeFileSync(stem+".json.gz",b);
 const compact=branches.map(({frontiers,...r})=>r);
 const report={...out,sharedFrontiers:undefined,branches:compact,artifact:stem+".json.gz",artifactSha256:sha(b),deferredShared:sharedFrontiers.reduce((n,f)=>n+f.deferred.length,0)};
 fs.writeFileSync(stem+"-summary.json",JSON.stringify(report,null,2)+"\n");
 const row={scenario:base.scenario,root,path:report.artifact,summary:stem+"-summary.json",sha256:report.artifactSha256,prefix:out.prefix,forkHash,sharedSteps:prefixSteps.length,branches:branches.map(r=>({award:r.award,stateHash:r.final.stateHash,steps:r.steps.length,researchCount:r.final.researchCount,milestones:r.milestones.filter(x=>x.reached).map(x=>x.id),baseFunctions:r.final.baseFunctions,orderBlockers:r.orderBlockers,deferredOptions:r.deferredOptions}))};
 rows.push(row);console.log(JSON.stringify(row));
}
assert(rows.length);
if(rows.length===index.scenarios.length)fs.writeFileSync(dir+"overcap-forward-gdx-bridge-active-v3.json",JSON.stringify({schema:"ATLAS_FORWARD_GDX_BRIDGE_ACTIVE_V3",inputs,scenarios:rows,normalizationComplete:false,actualGameCertified:false},null,2)+"\n");
