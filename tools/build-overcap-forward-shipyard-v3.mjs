// Source-bound scenario producer. The baseline cursor is replayed exactly;
// UK starts afresh and never retrofits its event into the baseline world.
// Only engine.options-generated actions can be materialized.
import fs from "node:fs";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {gzipSync,gunzipSync} from "node:zlib";
import {createForwardResearch,SCHEMA} from "./atlas-overcap-forward-research-v3.mjs";
import {exactStateHash} from "./origin-pair-exact-prefix-checkpoint.mjs";
import {key} from "./population-research-career-core.mjs";
const arg=(k,d)=>process.argv.find(x=>x.startsWith("--"+k+"="))?.slice(k.length+3)||d;
const scenario=arg("scenario","baseline"),root=arg("root","STR_INSPECT_MACHINERY"),limit=Number(arg("steps","100"));
assert(["baseline","uk"].includes(scenario)&&Number.isSafeInteger(limit)&&limit>0&&limit<=200);
const sha=b=>createHash("sha256").update(b).digest("hex"),arr=x=>Array.isArray(x)?x:[],pairs=x=>Object.entries(x||{}),load=p=>JSON.parse(fs.readFileSync(p));
const base="tools/data/overcap-forward-research-v3-frontier",bytes=fs.readFileSync(base+".json.gz"),summary=load(base+"-summary.json"),g=JSON.parse(gunzipSync(bytes));
assert.equal(sha(bytes),summary.artifactSha256);assert.equal(g.schema,SCHEMA);assert.deepEqual(g.inputs,summary.inputs);
for(const [p,h] of pairs(g.inputs.files))assert.equal(sha(fs.readFileSync(p)),h,p);
for(const [p,h] of pairs(g.inputs.engineFiles))assert.equal(sha(fs.readFileSync(p,"utf8").replace(/\r\n/g,"\n")),h,p);
const sourcePath="tools/data/overcap-forward-shipyard-sources-v3.json",sourceBytes=fs.readFileSync(sourcePath),sources=JSON.parse(sourceBytes);
const data=load("public/data/soldiers-modern-index.json");
data.forwardSupply=load("tools/data/overcap-forward-supply-catalog-v2.json");data.forwardStartingBase=load("tools/data/overcap-forward-starting-base-v3.json");data.forwardJunk=load("tools/data/overcap-forward-junk-extraction-v3.json");
assert.equal(sources.sourceMetadataSha256,data.meta.source.metadataSha256);
for(const s of sources.rows){const indexed=data.forwardSupply.events[s.id];assert(indexed&&indexed.research.includes(s.research));assert.deepEqual(indexed.fixed,s.items);const rule=data.eventResearchSources[s.research].find(x=>x.event===s.id).scripts.find(x=>x.script===s.id);assert.equal(rule.firstMonth,s.firstMonth);assert.equal(rule.lastMonth,s.lastMonth);assert.equal(rule.executionOdds,100);if(s.country)assert.deepEqual(rule.countryPositive,[s.country]);}
const engine=createForwardResearch(data,{maxMonth:g.budget.maxMonth}),rules=data.researchRules,roots=Object.values(g.roots);
assert(roots.includes(root));
const uk=sources.rows.find(s=>s.country),air=sources.rows.find(s=>s.research==="STR_VESSEL_RUSTFIGHTER3");
const goals=scenario==="uk"?[...g.goals,{kind:"research",id:"STR_CONTACT_SHIP_JUNKYARD"}]:[{kind:"research",id:air.research}];
const wanted=new Set(),sampleByItem=new Map(),facilities=new Set(),unlockers=new Map();
for(const [id,r] of pairs(rules))for(const k of arr(r.unlocks)){if(!unlockers.has(k))unlockers.set(k,[]);unlockers.get(k).push(id);}
function hint(id){
 if(wanted.has(id)||!rules[id])return;wanted.add(id);const r=rules[id];
 for(const k of [...arr(r.dependencies),...arr(r.requires)])hint(k);
 if(r.cost===0&&!r.needItem&&!arr(r.dependencies).length&&!arr(r.requires).length)for(const k of arr(unlockers.get(id)))hint(k);
 if(r.needItem&&r.cost>0){const k=r.neededItem||id;if(!sampleByItem.has(k))sampleByItem.set(k,[]);sampleByItem.get(k).push(id);}
}
for(const t of goals){if(t.kind==="facility"){facilities.add(t.id);for(const k of data.forwardSupply.facilities[t.id].research)hint(k);}else hint(t.id);}
if(scenario==="uk"){for(const id of roots)hint(id);hint("STR_DATA_DISK_B");hint(uk.research);sampleByItem.set("STR_DATA_DISK",["STR_SUPER_STAPLER"]);}
assert(wanted.size<1000);
let world=engine.start(),firstRoot=null,baselineCursor=null;
const initialAction={...engine.init,...(scenario==="uk"?{scenarioContext:{country:"STR_UK",assumption:true,scope:"One starting base located in UK; exact coordinates and other regional context not asserted."}}:{})};
if(scenario==="uk")world.countries=new Set(["STR_UK"]);
const steps=[],frontiers=[],failures=[];
const active=(w,id)=>w.researched.has(id)&&!w.disabled.has(id),reached=(w,t)=>t.kind==="facility"?w.facilities.has(t.id):active(w,t.id);
const allGoals=w=>goals.every(t=>reached(w,t))&&!w.pendingFree&&!arr(w.forwardDeliveries).length;
function record(opt,{priorEdge=null,choices=null}={}){
 const before=world,r=engine.apply(world,opt.action,firstRoot);world=r.world;
 if(!firstRoot){assert(opt.action.type==="research"&&roots.includes(opt.action.id));firstRoot=opt.action.id;}
 const itemChanges={};for(const k of new Set([...Object.keys(before.items),...Object.keys(world.items)])){const a=Number(before.items[k]||0),b=Number(world.items[k]||0);if(a!==b)itemChanges[k]={before:a,after:b,delta:b-a};}
 const step={index:steps.length+1,action:opt.action,evidence:opt.evidence,priorEdge,beforeHash:exactStateHash(before),afterHash:exactStateHash(world),monthBefore:before.month,monthAfter:world.month,added:[...world.researched].filter(k=>!before.researched.has(k)),closed:[...world.disabled].filter(k=>!before.disabled.has(k)),itemChanges,newFunctions:[...world.baseFunctions].filter(k=>!before.baseFunctions.has(k)),newFacilities:[...world.facilities].filter(k=>!before.facilities.has(k)),conditional:r.conditional,notes:r.notes};
 steps.push(step);
 if(choices)frontiers.push({step:step.index,beforeHash:step.beforeHash,offered:choices.length,selected:opt,unmaterialized:choices.filter(x=>key([x.action,x.evidence])!==key([opt.action,opt.evidence]))});
 return step;
}
if(scenario==="baseline"){
 // Use only previously materialized, selected V3 edges, not a legacy
 // research sequence. Preserve exact predecessor/successor world hashes.
 const runs=[...g.runs,...g.frontierProduction.runs].filter(r=>r.root===root),first=g.edges.find(e=>e.from===0&&e.action.id===root);
 assert(first);let at=0;const selected=[first.id,...runs.flatMap(r=>r.selected)];
 for(const id of selected){const e=g.edges[id];assert.equal(e.from,at);assert.equal(exactStateHash(world),g.nodes[at].stateHash);const s=record(e,{priorEdge:id});assert.equal(s.afterHash,g.nodes[e.to].stateHash);at=e.to;}
 baselineCursor=at;assert.equal(at,runs.at(-1)?.final??first.to);
}else{
 const options=engine.options(world,null).choices;assert.deepEqual(options.map(x=>x.action),roots.map(id=>({type:"research",id})));
 record(options.find(x=>x.action.id===root),{choices:options});
}
const initialCount=steps.length;
const needed=(w,id)=>!(Number(w.items[id]||0)>0)&&arr(sampleByItem.get(id)).some(k=>!active(w,k))&&!(id==="STR_DATA_DISK"&&Number(w.items.STR_DATA_DISK_B||0)>0);
function researchRank(w,id){return wanted.has(id)&&!active(w,id)&&!w.disabled.has(id)?(goals.some(t=>t.id===id)?180:100):0;}
function rank(w,opt){
 const a=opt.action,e=opt.evidence;
 if(w.pendingFree&&a.type==="freeResearch"){const r=rules[a.research],p=researchRank(w,a.research),i=r?.neededItem||a.research;return 1000+p*10+(p>0&&r?.needItem&&!Number(w.items[i]||0)?2000:0);}
 if(arr(w.forwardDeliveries).length&&a.type==="sourceResearchDelivery")return 10000;
 if(scenario==="uk"&&a.type==="eventResearch"&&a.event===uk.id&&a.research===uk.research)return 9000;
 if(a.type==="eventResearch"&&a.event===air.id&&a.research===air.research)return 500;
 if(a.type==="research")return researchRank(w,a.id);
 if(a.type==="sourceBuildFacility")return facilities.has(a.id)?250:0;
 if(a.type==="sourceRandomManufacture")return Object.keys({...e.fixed,...e.random}).filter(k=>needed(w,k)).length*40;
 if(a.type==="sourceBuySample")return needed(w,a.id)?30:0;
 if(a.type==="sourceManufactureItem")return a.id==="STR_DATA_DISK_B"&&!active(w,"STR_SUPER_STAPLER")&&!Number(w.items.STR_DATA_DISK_B||0)&&!active(w,"STR_DATA_DISK_B")?95:Object.keys(e.outputs||{}).filter(k=>needed(w,k)).length*35;
 if(a.type==="sourceEventItems")return Object.keys(e.items||{}).filter(k=>needed(w,k)).length*25;
 if(a.type==="eventResearch"||a.type==="missionResearch")return researchRank(w,a.research)*0.8;
 // The exact next indexed event window is calculated by V3; do not
 // jump to arbitrary dates or silently assign the delayed event.
 if(a.type==="advanceMonth"&&!active(w,air.research)&&a.month<=air.firstMonth)return 1;
 return 0;
}
let reason=null;
for(let i=0;i<limit&&!allGoals(world);i++){
 const {choices,unresolved}=engine.options(world,firstRoot);
 const ranked=choices.map((opt,i)=>({opt,i,p:rank(world,opt)})).filter(x=>x.p>0).sort((a,b)=>b.p-a.p||a.i-b.i);
 let applied=false;
 for(const x of ranked){try{record(x.opt,{choices});applied=true;break;}catch(e){failures.push({step:steps.length+1,action:x.opt.action,reason:e.message});}}
 if(!applied){reason="NO_SUPPORTED_TARGET_PROGRESS_EDGE";frontiers.push({step:steps.length+1,beforeHash:exactStateHash(world),offered:choices.length,selected:null,unmaterialized:choices,unresolved});break;}
}
if(!allGoals(world)&&!reason)reason="STEP_BUDGET";
const targets=goals.map(t=>{const r=rules[t.id];return {...t,reached:reached(world,t),missingDependencies:arr(r?.dependencies).filter(k=>!active(world,k)),missingFunctions:arr(r?.requiresBaseFunc).filter(k=>!world.baseFunctions.has(k))};});
const stem="tools/data/overcap-forward-shipyard-v3-"+scenario+"-"+root.toLowerCase();
const graph={schema:"ATLAS_FORWARD_SHIPYARD_SCENARIO_V3",scenario,root,baselineGraphSha256:summary.artifactSha256,baselineCursor,sourceAnchorsSha256:sha(sourceBytes),producerSha256:sha(fs.readFileSync("tools/build-overcap-forward-shipyard-v3.mjs","utf8").replace(/\r\n/g,"\n")),inputs:g.inputs,initialAction,steps,frontiers,failures,targets,reason,final:{stateHash:exactStateHash(world),month:world.month,researched:[...world.researched].sort(),disabled:[...world.disabled].sort(),items:world.items,baseFunctions:[...world.baseFunctions].sort(),facilities:[...world.facilities].sort()},normalizationComplete:false,actualGameCertified:false};
const out=gzipSync(JSON.stringify(graph),{level:9});fs.writeFileSync(stem+".json.gz",out);
const report={...graph,frontiers:undefined,artifact:stem+".json.gz",artifactSha256:sha(out),totalSteps:steps.length,newSteps:steps.length-initialCount,labDepth:steps.filter(s=>["research","repeatResearch"].includes(s.action.type)).length,researchCount:world.researched.size,deferredOptions:frontiers.reduce((n,f)=>n+f.unmaterialized.length,0),status:allGoals(world)?"CONDITIONAL_ALL_MILESTONES_REACHED":"OPEN"};
fs.writeFileSync(stem+"-summary.json",JSON.stringify(report,null,2)+"\n");
console.log(JSON.stringify({scenario,root,baselineCursor,steps:report.totalSteps,newSteps:report.newSteps,labDepth:report.labDepth,researchCount:report.researchCount,deferredOptions:report.deferredOptions,status:report.status,reason,targets,month:world.month,necro:world.items.STR_NECROPLANE_PARTS||0,actions:steps.slice(initialCount).map(s=>s.action),failures:failures.slice(0,3),artifactSha256:report.artifactSha256},null,2));
