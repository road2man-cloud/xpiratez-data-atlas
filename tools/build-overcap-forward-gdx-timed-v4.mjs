import fs from "node:fs";
import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {createHash} from "node:crypto";
import {createGdxClock} from "./atlas-overcap-forward-clock-v4-gdx.mjs";
import {exactStateHash} from "./origin-pair-exact-prefix-checkpoint.mjs";
const sha=b=>createHash("sha256").update(b).digest("hex");
const files={data:"public/data/soldiers-modern-index.json",forwardSupply:"tools/data/overcap-forward-supply-catalog-v2.json",forwardStartingBase:"tools/data/overcap-forward-starting-base-v3.json",forwardJunk:"tools/data/overcap-forward-junk-extraction-v3.json",facilities:"public/data/facilities-v2-index.json",items:"public/data/items-v2-index.json",manufacture:"public/data/manufacture-v2-index.json",score:"tools/data/overcap-forward-score-sources-v3.json",economy:"tools/data/overcap-forward-monthly-v4.json",prior:"tools/data/overcap-forward-missions-v4.json",missions:"tools/data/overcap-forward-electronics-mission-sources-v3.json",bridge:"tools/data/overcap-forward-gdx-bridge-sources-v3.json"};
const bytes=Object.fromEntries(Object.entries(files).map(([k,p])=>[k,fs.existsSync(p)?fs.readFileSync(p):execFileSync("git",["show","HEAD:"+p],{maxBuffer:80*1024*1024})]));
const data=JSON.parse(bytes.data);for(const k of ["forwardSupply","forwardStartingBase","forwardJunk"])data[k]=JSON.parse(bytes[k]);
const score=JSON.parse(bytes.score),prior=JSON.parse(bytes.prior),missionSource=JSON.parse(bytes.missions),bridgeSource=JSON.parse(bytes.bridge),economy={...JSON.parse(bytes.economy).economy,research:score.research};
assert.equal(prior.schema,"ATLAS_FORWARD_TIMED_MISSIONS_V4_6");
assert.equal(bridgeSource.sourceMetadataSha256,data.meta.source.metadataSha256);
const facilityFields=Object.fromEntries(JSON.parse(bytes.facilities).facilities.map(x=>[x.id,x.fields])),itemFields=Object.fromEntries(JSON.parse(bytes.items).items.map(x=>[x.id,x.fields])),manufactureFields=Object.fromEntries(JSON.parse(bytes.manufacture).entries.map(x=>[x.id,x.fields]));
const rulesDir=process.env.XPZ_RULES_DIR||"C:/Dioxine_XPiratez_o2.1/Dioxine_XPiratez/user/mods/Piratez/Ruleset",sourceCache=new Map();
function anchored(a){
 if(!sourceCache.has(a.file)){const b=fs.readFileSync(rulesDir+"/"+a.file);sourceCache.set(a.file,{sha:sha(b),lines:b.toString("utf8").split(/\r?\n/)});}
 const b=sourceCache.get(a.file);assert.equal(b.sha,a.sha256);return b.lines.slice(a.startLine-1,a.endLine).join("\n");
}
const c=bridgeSource.capture,script=anchored(c.anchors.script),dep=anchored(c.anchors.deployment);
const num=(s,key)=>Number(s.match(new RegExp("^    "+key+": (\\d+)$","m"))?.[1]);
const dur=dep.match(/^    duration: \[(\d+), (\d+)\]$/m);
const bridgeTiming={startDelay:num(script,"startDelay"),randomDelay:num(script,"randomDelay"),durationMin:Number(dur[1]),durationMax:Number(dur[2]),selectedDelay:2490,source:c.anchors.script,deploymentSource:c.anchors.deployment};
assert.equal(bridgeTiming.startDelay,1000);assert.equal(bridgeTiming.randomDelay,40000);assert.equal(bridgeTiming.durationMin,100);
const id="STR_DELINQUENT_BULLY_GOOD",e=data.forwardSupply.events[id],eventScript=e.scripts.find(x=>x.script==="STR_DELINQUENT_SCORE"),eventBlock=anchored(score.events[id].anchor);
assert.deepEqual(eventScript.monthWeights,[{month:0,weight:100,totalWeight:1000}]);assert.equal(eventScript.executionOdds,85);assert.deepEqual(eventScript.otherConditions,{minScore:-300,maxScore:999});assert.deepEqual(eventScript.researchPositive,["STR_SCHOOLING_1"]);assert.equal(e.research.length,0);
assert.deepEqual(e.fixed,{STR_ACADEMY_NURSE:1,STR_STUN_BATON:1});
for(const [k,v] of Object.entries(eventScript))if(Array.isArray(v)&&!["monthWeights","researchPositive"].includes(k))assert.equal(v.length,0,k);
assert.equal(num(eventBlock,"points"),150);assert.equal(num(eventBlock,"timer"),1000);assert.equal(num(eventBlock,"timerRandom"),42000);
const nurseEvent={id,script:eventScript,points:e.points,funds:e.funds,items:e.fixed,timer:num(eventBlock,"timer"),timerRandom:num(eventBlock,"timerRandom"),selectedRoll:50,source:score.events[id].anchor,conditional:true};
const revive=(k,v)=>v&&typeof v==="object"&&Object.keys(v).length===1&&Array.isArray(v.$set)?new Set(v.$set):v&&typeof v==="object"&&Object.keys(v).length===1&&Array.isArray(v.$map)?new Map(v.$map):v;
const inputs={6:{countryFunding:economy.fundingTarget,regionalNet:0,otherMaintenance:50000},7:{countryFunding:economy.fundingTarget,regionalNet:0,otherMaintenance:50000}};
const targets=["STR_SMALL_RADAR_SYSTEM","STR_COMMUNICATIONS","STR_LARGE_RADAR_SYSTEM","STR_ACADEMY_NURSE","STR_SECTOID_SOLDIER","STR_ALIEN_ORIGINS","STR_SECTOID","STR_BEER","STR_GDX_000","STR_GDX_001","STR_DATA_MINING"];
const runs=[];
for(const old of prior.runs.filter(r=>r.mode==="recover"))for(const mode of ["capture_only","capture_and_nurse"]){
 const s=JSON.parse(JSON.stringify(old.checkpoint.state),revive);assert.equal(exactStateHash(s.world),old.checkpoint.worldHash);
 s.trace=[];s.bridgeQueue=[];s.containmentAssumedFree=2;
 const clock=createGdxClock(data,{facilityFields,itemFields,manufactureFields,economy,monthlyInput:inputs,missionSource,missionTiming:prior.missionTiming,bridgeSource,bridgeTiming,nurseEvent,bridgeMode:mode});
 const startFunds=s.world.funds,startDate=clock.stamp(s);let reason="AUGUST_LIMIT",lastSelectionKey=null,goalDate=null;
 console.log("Producing",old.root,mode);
 try{
  for(let i=0;i<80;i++){
   clock.flush(s);
   if(s.world.researched.has("STR_GDX_001"))goalDate??=clock.stamp(s);
   if(s.world.month>=7&&!s.projects.length){reason=goalDate?"GDX_001_REACHED":"GDX_001_NOT_REACHED";break;}
   const selectionKey=JSON.stringify([[...s.world.researched].sort(),[...s.world.disabled].sort(),[...s.world.baseFunctions].sort(),s.world.items,s.projects.map(p=>p.id),s.world.month,s.deliveryDue]);
   if(clock.available(s)>0&&selectionKey!==lastSelectionKey){
    const eligible=clock.options(s).filter(o=>o.action.type==="research"&&targets.includes(o.action.id)).map(o=>o.action.id).sort((a,b)=>targets.indexOf(a)-targets.indexOf(b));
    for(const id of eligible){if(!clock.available(s))break;clock.begin(s,id,1,50);}
    lastSelectionKey=selectionKey;
   }
   if(s.projects.length&&clock.available(s))clock.assign(s,s.projects[0].id,s.projects[0].assigned+clock.available(s));
   clock.tick(s);
  }
 }catch(e){reason=e.message;}
 const additional=s.monthlyLedger.slice(old.monthlyLedger.length),eventFunds=s.trace.filter(t=>t.type==="nurseEventResolved").reduce((n,t)=>n+t.funds,0);
 assert.equal(startFunds+additional.reduce((n,r)=>n+r.countryFunding-r.maintenance+r.bonus,0)+eventFunds,s.world.funds);
 const credited=new Set();for(const row of s.monthlyLedger)for(const k of row.researchIds){assert(!credited.has(k));credited.add(k);}
 assert(s.trace.every((t,i)=>!i||t.elapsedHours>=s.trace[i-1].elapsedHours));
 const captures=s.trace.filter(t=>t.type==="captureRecovered"),events=s.trace.filter(t=>t.type==="nurseEventResolved");
 if(goalDate){assert(events.length===1);assert(s.trace.some(t=>t.type==="freeResearch"&&t.action.research==="STR_GDX_001"&&t.action.source==="STR_ACADEMY_NURSE"));assert(s.world.researched.has("STR_ACADEMY_NURSE"));}
 runs.push({root:old.root,mode,startDate,startFunds,reason,goalDate,date:clock.stamp(s),funds:s.world.funds,monthlyLedger:s.monthlyLedger,captures,events,containmentAssumedFree:s.containmentAssumedFree,completedNew:[...s.world.researched].filter(k=>!old.research.includes(k)).sort(),research:[...s.world.researched].sort(),orderBlockers:bridgeSource.orders.map(o=>({id:o.id,firstMonth:o.script.firstMonth,missing:o.script.researchPositive.filter(k=>!s.world.researched.has(k)),alreadyResearched:s.world.researched.has(o.research),tooEarly:s.world.month<o.script.firstMonth})),checkpoint:{worldHash:exactStateHash(s.world),state:JSON.parse(JSON.stringify({...s,trace:undefined},(k,v)=>v instanceof Set?{$set:[...v]}:v instanceof Map?{$map:[...v]}:v))},trace:s.trace.filter(t=>t.type!=="researchDay"||t.projects.length)});
}
const nextStages=["STR_GDX_002","STR_GDX_003","STR_GDX_004","STR_GDX_005"].map(id=>({id,rule:data.researchRules[id],sampleSource:id==="STR_GDX_005"?data.itemSupply[id]?.mapLoot:null,paths:runs.filter(r=>r.goalDate).map(r=>({root:r.root,missingDependencies:data.researchRules[id].dependencies.filter(k=>!r.research.includes(k)),researchCompleted:r.research.includes(id),requiredSample:data.researchRules[id].needItem?data.researchRules[id].neededItem:null,stock:data.researchRules[id].needItem?r.checkpoint.state.world.items[data.researchRules[id].neededItem]||0:null}))}));
assert.equal(runs.length,8);assert.equal(runs.filter(r=>r.goalDate).length,4);assert(runs.every(r=>r.captures.length===1&&r.monthlyLedger.length===7));assert(runs.filter(r=>r.goalDate).every(r=>r.research.includes("STR_GDX_000")&&!r.research.includes("STR_GDX_002")));
const out={schema:"ATLAS_FORWARD_GDX_TIMED_V4_7",actualGameCertified:false,normalizationComplete:false,scope:"Conditional checkpoint continuation. Selected watchtower capture, selected delinquent event, selected free-research reward; no actual combat, geography, containment occupancy, RNG or full scheduler certified. Earlier financial/activity assumptions persist. No direct credit to GDX_002 or later.",inputs:Object.fromEntries(Object.entries(files).map(([k,p])=>[p,sha(bytes[k])])),rawSources:Object.fromEntries([...sourceCache].map(([k,v])=>[k,v.sha])),engineSha256:sha(fs.readFileSync("tools/atlas-overcap-forward-clock-v4-gdx.mjs","utf8").replace(/\r\n/g,"\n")),bridgeTiming,nurseEvent,targets,inputsByMonth:inputs,nextStages,runs};
fs.writeFileSync("tools/data/overcap-forward-gdx-timed-v4.json",JSON.stringify(out,null,2)+"\n");
console.log(JSON.stringify({runs:runs.length,gdx:runs.filter(r=>r.goalDate).length,captures:runs.reduce((n,r)=>n+r.captures.length,0),events:runs.reduce((n,r)=>n+r.events.length,0),summary:runs.map(r=>({root:r.root,mode:r.mode,reason:r.reason,date:r.date,goal:r.goalDate,funds:r.funds,new:r.completedNew,orders:r.orderBlockers}))},null,2));
