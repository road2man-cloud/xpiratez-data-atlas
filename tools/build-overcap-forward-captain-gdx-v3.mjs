// Re-produce source-backed prefixes with captain choice at campaign start.
// Old selected actions are scheduling hints, not accepted old state hashes.
// Every edge is re-derived at its new predecessor. Keep independent RNG forks.
import fs from "node:fs";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {gzipSync,gunzipSync} from "node:zlib";
import {createForwardResearch} from "./atlas-overcap-forward-research-v3.mjs";
import {createElectronicsMissionSupply} from "./atlas-overcap-forward-electronics-mission-v3.mjs";
import {createGdxBridge} from "./atlas-overcap-forward-gdx-bridge-v3.mjs";
import {createCaptainMonthly} from "./atlas-overcap-forward-captain-monthly-v3.mjs";
import {exactStateHash} from "./origin-pair-exact-prefix-checkpoint.mjs";
import {key} from "./population-research-career-core.mjs";
const dir="tools/data/",sha=b=>createHash("sha256").update(b).digest("hex"),load=p=>JSON.parse(fs.readFileSync(p)),arr=x=>Array.isArray(x)?x:[],sort=x=>[...x].sort();
const arg=(k,d)=>process.argv.find(x=>x.startsWith("--"+k+"="))?.slice(k.length+3)||d;
const rootArg=arg("root","ALL"),scenarioArg=arg("scenario","ALL");
const basePath=dir+"overcap-forward-gdx-bridge-active-v3.json",baseBytes=fs.readFileSync(basePath),base=JSON.parse(baseBytes);
const sourcePath=dir+"overcap-forward-captain-monthly-sources-v3.json",sourceBytes=fs.readFileSync(sourcePath),source=JSON.parse(sourceBytes);
const data=load("public/data/soldiers-modern-index.json");
data.forwardSupply=load(dir+"overcap-forward-supply-catalog-v2.json");data.forwardStartingBase=load(dir+"overcap-forward-starting-base-v3.json");data.forwardJunk=load(dir+"overcap-forward-junk-extraction-v3.json");
const electronicsPath=dir+"overcap-forward-electronics-mission-sources-v3.json",gdxPath=dir+"overcap-forward-gdx-bridge-sources-v3.json";
const es=load(electronicsPath),gs=load(gdxPath);
assert.equal(source.sourceMetadataSha256,data.meta.source.metadataSha256);
assert.equal(source.nativeArchiveSha256,sha(fs.readFileSync("tools/headless-simulator/native/oxce-source.tar.gz")));
assert.equal(base.inputs.sourceSha256,sha(fs.readFileSync(gdxPath)));
const engine=createForwardResearch(data,{maxMonth:12}),electronic=createElectronicsMissionSupply(data,engine,es),bridge=createGdxBridge(data,engine,gs),monthly=createCaptainMonthly(data,source);
const sources={base:sha(baseBytes),monthly:sha(sourceBytes),electronics:sha(fs.readFileSync(electronicsPath)),gdx:sha(fs.readFileSync(gdxPath))};
const producerFiles=["tools/build-overcap-forward-captain-gdx-v3.mjs","tools/build-overcap-forward-captain-monthly-sources-v3.mjs","tools/atlas-overcap-forward-captain-monthly-v3.mjs"];
const producers=Object.fromEntries(producerFiles.map(p=>[p,sha(fs.readFileSync(p,"utf8").replace(/\r\n/g,"\n"))]));
const active=(w,k)=>w.researched.has(k)&&!w.disabled.has(k);
function readGraph(p,h){const b=fs.readFileSync(p);assert.equal(sha(b),h,p);return JSON.parse(gunzipSync(b));}
const targets=["STR_CAPTAIN_JACKDUMB","STR_SECTOID_MEDIC","STR_ACADEMY_NURSE","STR_SECTOID_LEADER","STR_MUTANT_ORIGINS","STR_GDX_001","STR_GDX_002","STR_GDX_000","STR_GDX_003","STR_GDX_004","STR_GDX_005","STR_PIRATEZ_HIERARCHY","STR_PERSUASION","STR_CONTACT_MUTANT_ALLIANCE","STR_SCHOOL_BOOKS","STR_LIBRARY","STR_SCHOOLING_2"];
const rows=[];
for(const row of base.scenarios.filter(x=>(rootArg==="ALL"||rootArg===x.root)&&(scenarioArg==="ALL"||scenarioArg===x.scenario))){
 const g=readGraph(row.path,row.sha256),e=readGraph(g.prefix.path,g.prefix.sha256),p=readGraph(e.prefix.path,e.prefix.sha256);
 assert.equal(g.root,row.root);assert.equal(e.root,row.root);assert.equal(p.root,row.root);
 for(const [path,h] of Object.entries(p.inputs.files))assert.equal(sha(fs.readFileSync(path)),h,path);
 for(const [path,h] of Object.entries({...p.inputs.engineFiles,...e.producerHashes,...base.inputs.producerFiles}))assert.equal(sha(fs.readFileSync(path,"utf8").replace(/\r\n/g,"\n")),h,path);
 assert.equal(e.sourceSha256,sources.electronics);
 const prior=[...p.steps,...e.steps.filter(x=>x.index<=g.prefix.step),...g.prefixSteps,...g.branches.find(x=>x.award==="STR_ALIEN_TERROR").steps];
 let firstRoot=null;
 const optionCache=new WeakMap();
 function opts(w){
  const cached=optionCache.get(w);if(cached?.root===firstRoot)return cached.choices;
  const choices=computeOptions(w);optionCache.set(w,{root:firstRoot,choices});return choices;
 }
 function computeOptions(w){
  const raw=engine.options(w,firstRoot);
  if(w.pendingFree||arr(w.forwardDeliveries).length)return raw.choices;
  if(w.forwardCaptainPending){
   // Only the first lab can run before the initial personality timer
   // expires. Other scheduled events are resolved before more actions.
   return [...monthly.options(w),...(!firstRoot?raw.choices:[])];
  }
  const regular=w.forwardPartialMissionRecovery?raw.choices.filter(x=>["research","freeResearch","sourceResearchDelivery","sourceRandomManufacture","sourceManufactureItem"].includes(x.action.type)||x.action.type==="sourceBuildFacility"&&x.action.id==="STR_MESS_HALL"):raw.choices;
  // New monthly events are dispatched exclusively by the narrow scheduler.
  const filtered=regular.filter(x=>x.action.type!=="advanceMonth"&&!(x.action.type==="eventResearch"&&source.events.some(e=>e.id===x.action.event)));
  return [...filtered,...monthly.options(w),...electronic.options(w,firstRoot),...bridge.options(w,firstRoot).filter(x=>x.action.type==="sourceGdxCapture")];
 }
 function transition(w,opt){
  assert(opts(w).some(x=>key([x.action,x.evidence])===key([opt.action,opt.evidence])),"Current option absent");
  const a=opt.action;
  const r=a.type.startsWith("sourceCaptain")?monthly.apply(w,opt):["sourceMissionRecovery","sourceMissionSampleExtraction"].includes(a.type)?electronic.apply(w,a,firstRoot):a.type==="sourceGdxCapture"?bridge.apply(w,a,firstRoot):engine.apply(w,a,firstRoot);
  if(a.type==="research"&&!firstRoot){assert.equal(a.id,row.root);firstRoot=a.id;}
  return r;
 }
 function run(w,opt,steps,phase,priorIndex=null){
  assert(opt,"Missing option: "+phase);
  const r=transition(w,opt),n=r.world,items={};
  for(const k of new Set([...Object.keys(w.items),...Object.keys(n.items)])){
   const before=Number(w.items[k]||0),after=Number(n.items[k]||0);if(before!==after)items[k]={before,after,delta:after-before};
  }
  steps.push({index:steps.length+1,phase,priorIndex,action:opt.action,evidence:opt.evidence,beforeHash:exactStateHash(w),afterHash:exactStateHash(n),monthBefore:w.month,monthAfter:n.month,added:sort([...n.researched].filter(k=>!w.researched.has(k))),closed:sort([...n.disabled].filter(k=>!w.disabled.has(k))),itemChanges:items,notes:r.notes,conditional:r.conditional});
  return n;
 }
 const find=(w,a)=>opts(w).find(x=>key(x.action)===key(a));
 const choose=(w,fn)=>opts(w).find(fn);
 function settle(w,steps,phase,award=null){
  for(let i=0;i<50&&(w.pendingFree||arr(w.forwardDeliveries).length);i++){
   const options=opts(w);let opt;
   if(w.pendingFree){opt=award?options.find(x=>x.action.type==="freeResearch"&&x.action.research===award):options[0];award=null;}
   else opt=options.find(x=>x.action.type==="sourceResearchDelivery");
   assert(opt,"Missing settlement "+phase);w=run(w,opt,steps,phase);
  }assert(!w.pendingFree&&!arr(w.forwardDeliveries).length);return w;
 }
 function lab(w,id,steps,phase,award=null){if(active(w,id))return w;w=run(w,choose(w,x=>x.action.type==="research"&&x.action.id===id),steps,phase);return settle(w,steps,phase,award);}
 function snapshot(w){return {stateHash:exactStateHash(w),month:w.month,researched:sort(w.researched),disabled:sort(w.disabled),items:w.items,baseFunctions:sort(w.baseFunctions),facilities:sort(w.facilities),receipts:arr(w.forwardCaptainReceipts),pendingFree:w.pendingFree||null,targets:targets.map(id=>({id,reached:active(w,id),missingDependencies:arr(data.researchRules[id]?.dependencies).filter(k=>!active(w,k)),missingFunctions:arr(data.researchRules[id]?.requiresBaseFunc).filter(k=>!w.baseFunctions.has(k)),sample:data.researchRules[id]?.needItem?{id:data.researchRules[id].neededItem||id,held:Number(w.items[data.researchRules[id].neededItem||id]||0)}:null}))};}
 let w=engine.start();if(row.scenario==="uk"){assert.equal(p.initialAction.scenarioContext.country,"STR_UK");w.countries=new Set(["STR_UK"]);}
 const initialHash=exactStateHash(w),shared=[],branches=[];let failure=null,replayed=0;
 try{
  w=run(w,choose(w,x=>x.action.type==="sourceCaptainMonthSchedule"),shared,"INITIAL_MONTH_SCHEDULE");
  assert.equal(prior[0].action.type,"research");assert.equal(prior[0].action.id,row.root);
  w=run(w,find(w,prior[0].action),shared,"REPRODUCED_ROOT",0);replayed++;
  // Reapply the actual deterministic settlement associated with the first lab.
  while(w.pendingFree||arr(w.forwardDeliveries).length){w=run(w,find(w,prior[replayed].action),shared,"REPRODUCED_ROOT_SETTLEMENT",replayed);replayed++;}
  w=run(w,choose(w,x=>x.action.type==="sourceCaptainEventExpire"),shared,"INITIAL_PERSONALITY_EVENT");
  w=settle(w,shared,"INITIAL_PERSONALITY_SETTLEMENT");
  w=lab(w,"STR_CAPTAIN_JACKASS",shared,"CAPTAIN_CHOICE");
  assert(active(w,"STR_CAPTAIN_JACKDUMB"),"Captain classification not unlocked");
  for(;replayed<prior.length;replayed++){
   const a=prior[replayed].action;
   if(a.type==="advanceMonth"){assert.equal(a.month,w.month+1,"Prior month jump is not one boundary");w=run(w,choose(w,x=>x.action.type==="sourceCaptainMonthWait"&&x.action.month===a.month),shared,"REPRODUCED_MONTH_BOUNDARY",replayed);}
   else w=run(w,find(w,a),shared,"REPRODUCED_SOURCE_ACTION",replayed);
  }
  assert(active(w,"STR_SECTOID_SOLDIER")&&active(w,"STR_BASIC_ELECTRONICS")&&active(w,"STR_SCHOOLING_1")&&active(w,"STR_GOVT_CORPSE"));
  assert.equal(w.month,2);
  function event(w,script,item,steps,phase){
   w=run(w,choose(w,x=>x.action.type==="sourceCaptainMonthSchedule"&&x.action.script===script),steps,phase);
   w=run(w,choose(w,x=>x.action.type==="sourceCaptainEventExpire"&&x.action.item===item),steps,phase);
   return settle(w,steps,phase);
  }
  w=event(w,"STR_CAPTAIN_JACKDUMB_EVENTS_1","STR_SECTOID_MEDIC",shared,"MEDIC_EVENT");
  w=lab(w,"STR_SECTOID_MEDIC",shared,"MEDIC_RESEARCH","STR_SECTOWEED");
  // Earlier UK cursors do not necessarily include the recruitment branch.
  // Reproduce its actual missing prerequisites before mutant origins.
  for(const id of ["STR_LOOT_DISTRIBUTION","STR_RECRUITMENT"])if(!active(w,id))w=lab(w,id,shared,"RECRUITMENT_PREREQUISITES");
  w=lab(w,"STR_MUTANT_ORIGINS",shared,"MUTANT_ORIGINS");
  w=event(w,"STR_CAPTAIN_JACKDUMB_EVENTS_2","STR_ACADEMY_NURSE",shared,"NURSE_EVENT");
  w=run(w,choose(w,x=>x.action.type==="research"&&x.action.id==="STR_ACADEMY_NURSE"),shared,"NURSE_RESEARCH");
  assert.equal(w.pendingFree?.source,"STR_ACADEMY_NURSE");
  const fork=w;
  for(const award of ["STR_GDX_001","STR_BEASTMEN"]){
   let world=fork;const steps=[];let error=null;
   try{
    world=settle(world,steps,"NURSE_BONUS",award);assert(active(world,award));
    if(award!=="STR_GDX_001")world=event(world,"STR_GDX_EVENT_ORDERS_1",null,steps,"GDX_FIRST_ORDER_EVENT");
    // Source reward for a leader is kept as stock until persuasion exists.
    world=event(world,"STR_CAPTAIN_JACKDUMB_EVENTS_3","STR_SECTOID_LEADER",steps,"LEADER_EVENT");
    while(world.month<8)world=run(world,choose(world,x=>x.action.type==="sourceCaptainMonthWait"),steps,"WAIT_FOR_SECOND_ORDER");
    world=event(world,"STR_GDX_EVENT_ORDERS_2",null,steps,"GDX_SECOND_ORDER_EVENT");
    world=lab(world,"STR_GDX_000",steps,"GDX_ORDERS_STUDY");
    if(choose(world,x=>x.action.type==="research"&&x.action.id==="STR_GDX_003"))world=lab(world,"STR_GDX_003",steps,"GDX_NEXT_STUDY");
    if(choose(world,x=>x.action.type==="research"&&x.action.id==="STR_GDX_004"))world=lab(world,"STR_GDX_004",steps,"GDX_NEXT_STUDY");
   }catch(err){error=err.message;}
   branches.push({award,seedHash:exactStateHash(fork),steps,failure:error,final:snapshot(world),nextOptions:opts(world),normalizationComplete:false,actualGameCertified:false});
  }
 }catch(err){failure={phase:shared.at(-1)?.phase||"START",nextPriorIndex:replayed,nextPriorAction:prior[replayed]?.action||null,reason:err.message};}
 const stem=dir+"overcap-forward-captain-gdx-v3-"+row.scenario+"-"+row.root.toLowerCase();
 const result={schema:"ATLAS_FORWARD_CAPTAIN_GDX_SCENARIO_V3",scenario:row.scenario,root:row.root,sources,producers,prior:{path:row.path,sha256:row.sha256,actionHints:prior.length,reproduced:replayed},initialAction:p.initialAction,initialHash,shared,failure,sharedFinal:snapshot(w),branches,normalizationComplete:false,actualGameCertified:false,scope:"New source-start chronology with early captain choice and narrow monthly scheduler. Old action hints must be currently available; no old state reused. Existing other event timings, labor duration, survival, score, full inventory and economy remain conditional; not a native campaign execution."};
 const bytes=gzipSync(JSON.stringify(result),{level:9});fs.writeFileSync(stem+".json.gz",bytes);
 const report={...result,branches:branches.map(({nextOptions,...b})=>({...b,deferredOptions:nextOptions.length})),artifact:stem+".json.gz",artifactSha256:sha(bytes)};
 fs.writeFileSync(stem+"-summary.json",JSON.stringify(report,null,2)+"\n");
 const item={scenario:row.scenario,root:row.root,path:report.artifact,summary:stem+"-summary.json",sha256:report.artifactSha256,reproduced:replayed,priorActions:prior.length,sharedSteps:shared.length,failure,branches:branches.map(b=>({award:b.award,steps:b.steps.length,failure:b.failure,month:b.final.month,researchCount:b.final.researched.length,stateHash:b.final.stateHash,leaderStock:b.final.items.STR_SECTOID_LEADER||0,reached:b.final.targets.filter(t=>t.reached).map(t=>t.id),deferredOptions:b.nextOptions.length}))};
 rows.push(item);console.log(JSON.stringify(item));
}
assert(rows.length);
if(rows.length===base.scenarios.length)fs.writeFileSync(dir+"overcap-forward-captain-gdx-active-v3.json",JSON.stringify({schema:"ATLAS_FORWARD_CAPTAIN_GDX_ACTIVE_V3",sources,producers,scenarios:rows,normalizationComplete:false,actualGameCertified:false},null,2)+"\n");
