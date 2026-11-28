import fs from "node:fs";
import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {createHash} from "node:crypto";
import {createHierarchyClock} from "./atlas-overcap-forward-clock-v4-hierarchy.mjs";
import {exactStateHash} from "./origin-pair-exact-prefix-checkpoint.mjs";
const sha=b=>createHash("sha256").update(b).digest("hex");
const files={data:"public/data/soldiers-modern-index.json",forwardSupply:"tools/data/overcap-forward-supply-catalog-v2.json",forwardStartingBase:"tools/data/overcap-forward-starting-base-v3.json",forwardJunk:"tools/data/overcap-forward-junk-extraction-v3.json",facilities:"public/data/facilities-v2-index.json",items:"public/data/items-v2-index.json",manufacture:"public/data/manufacture-v2-index.json",score:"tools/data/overcap-forward-score-sources-v3.json",economy:"tools/data/overcap-forward-monthly-v4.json",prior:"tools/data/overcap-forward-prison-timed-v4.json",persuasion:"tools/data/overcap-forward-persuasion-sources-v3.json",captain:"tools/data/overcap-forward-captain-monthly-sources-v3.json",missions:"tools/data/overcap-forward-electronics-mission-sources-v3.json",bridge:"tools/data/overcap-forward-gdx-bridge-sources-v3.json"};
const bytes=Object.fromEntries(Object.entries(files).map(([k,p])=>[k,fs.existsSync(p)?fs.readFileSync(p):execFileSync("git",["show","HEAD:"+p],{maxBuffer:80*1024*1024})]));
const data=JSON.parse(bytes.data);for(const k of ["forwardSupply","forwardStartingBase","forwardJunk"])data[k]=JSON.parse(bytes[k]);
const score=JSON.parse(bytes.score),prior=JSON.parse(bytes.prior),missionSource=JSON.parse(bytes.missions),bridgeSource=JSON.parse(bytes.bridge),economy={...JSON.parse(bytes.economy).economy,research:score.research};
assert.equal(prior.schema,"ATLAS_FORWARD_PRISON_TIMED_V4_10");
assert.equal(bridgeSource.sourceMetadataSha256,data.meta.source.metadataSha256);
const facilityFields=Object.fromEntries(JSON.parse(bytes.facilities).facilities.map(x=>[x.id,x.fields])),itemFields=Object.fromEntries(JSON.parse(bytes.items).items.map(x=>[x.id,x.fields])),manufactureFields=Object.fromEntries(JSON.parse(bytes.manufacture).entries.map(x=>[x.id,x.fields]));
const rulesDir=process.env.XPZ_RULES_DIR||"C:/Dioxine_XPiratez_o2.1/Dioxine_XPiratez/user/mods/Piratez/Ruleset",sourceCache=new Map();
function anchored(a){
 if(!sourceCache.has(a.file)){const b=fs.readFileSync(rulesDir+"/"+a.file);sourceCache.set(a.file,{sha:sha(b),lines:b.toString("utf8").split(/\r?\n/)});}
 const b=sourceCache.get(a.file);assert.equal(b.sha,a.sha256);return b.lines.slice(a.startLine-1,a.endLine).join("\n");
}
const persuasionSource=JSON.parse(bytes.persuasion);assert.equal(persuasionSource.sourceMetadataSha256,data.meta.source.metadataSha256);
for(const e of persuasionSource.events)anchored(e.anchor);
for(const sc of persuasionSource.scripts){anchored(sc.anchor);anchored(sc.weightsAnchor);}
const rawPurchase=anchored(persuasionSource.purchase.anchor);assert(rawPurchase.includes("transferTime: 960")&&rawPurchase.includes("costBuy: 50000")&&rawPurchase.includes("size: 75"));for(const r of persuasionSource.recipes)anchored(r.anchor);
const rawHall=fs.readFileSync(rulesDir+"/Piratez.rul"),rawHallText=rawHall.toString("utf8").replace(/\r/g,"");
const hall=rawHallText.split(/\n(?=  - type: )/).find(x=>x.startsWith("  - type: STR_MESS_HALL\n")&&x.includes("buildCost: 225000"));
assert(hall&&hall.includes("monthlyCost: 10000")&&hall.includes("labs: 1")&&hall.includes("buildTime: 14"));
economy.facilities.STR_MESS_HALL={monthlyCost:10000,labs:1,personnel:0,blockSha256:sha(hall)};
const captainSource=JSON.parse(bytes.captain);assert.equal(captainSource.sourceMetadataSha256,data.meta.source.metadataSha256);
const sc=captainSource.scripts.find(x=>x.script==="STR_CAPTAIN_JACKDUMB_EVENTS_1"),e=captainSource.events.find(x=>x.id===sc.event);
const rawScript=anchored(sc.anchor),rawPool=anchored(e.anchor);anchored(sc.weightsAnchor);
assert.equal(sc.executionOdds,20);assert.equal(sc.weight,50);assert.equal(sc.totalWeight,1335);assert.deepEqual(sc.researchPositive,["STR_CAPTAIN_JACKDUMB"]);assert.deepEqual(sc.researchNegative,[]);
assert.equal(e.pool.length,73);assert.equal(e.timer,60);assert.equal(e.timerRandom,43400);assert.equal(e.points,0);
assert(rawScript.includes("STR_CAPTAIN_JACKDUMB: true")&&rawScript.includes("STR_TROUBLESEEKING_ENEMY: 50"));
const captiveIds=["STR_NAZI_LEADER","STR_ACADEMY_STUDENT","STR_SECTOID_EXPLORER","STR_SECTOID_ENGINEER"];
for(const id of captiveIds){assert(e.pool.includes(id)&&data.researchRules[id].needItem&&data.researchRules[id].destroyItem);assert(data.itemSupply[id].eventGrants.some(g=>g.event===e.id&&g.scriptIds.includes(sc.script)));}
assert(data.researchRules.STR_NAZI_LEADER.getOneFreeProtected.STR_GDX_000.includes("STR_GDX_006"));
assert(data.researchRules.STR_ACADEMY_STUDENT.getOneFree.includes("STR_ACADEMY_RECRUITMENT"));
const revive=(k,v)=>v&&typeof v==="object"&&Object.keys(v).length===1&&Array.isArray(v.$set)?new Set(v.$set):v&&typeof v==="object"&&Object.keys(v).length===1&&Array.isArray(v.$map)?new Map(v.$map):v;
const monthlyInput=Object.fromEntries([16,17,18,19,20].map(n=>[n,{countryFunding:economy.fundingTarget,regionalNet:0,otherMaintenance:50000}]));
const targets=[...captiveIds,"STR_GDX_006","STR_ACADEMY_HIERARCHY","STR_PRIMITIVE_WEAPONS","STR_FIREARMS_SUMMARY","STR_TACTICS","STR_MONEY_PURSE","STR_CASH_BAG","STR_GAMBLING","STR_CONSUMER_GOODS","STR_LIBRARY","STR_PLOTTING","STR_GDX_007","STR_GDX_008"];
const runs=[];
for(const old of prior.runs.filter(r=>r.mode==="recover"&&r.goalDate))for(const mode of (old.root==="STR_WAT_DO"?["selected_captives","control"]:["selected_captives"])){
 const s=JSON.parse(JSON.stringify(old.checkpoint.state),revive);assert.equal(exactStateHash(s.world),old.checkpoint.worldHash);
 s.trace=[];s.hierarchyQueue=[];
 const clock=createHierarchyClock(data,{facilityFields,itemFields,manufactureFields,economy,monthlyInput,missionSource,bridgeSource,persuasionSource,captainSource,orderMode:"strict",hierarchyMode:mode});
 const startFunds=s.world.funds,startDate=clock.stamp(s);let reason="SEPTEMBER_LIMIT",lastSelectionKey=null,goalDate=null,gdx6Date=null;
 console.log("Producing",old.root,mode);
 try{
  for(let i=0;i<160;i++){
   clock.flush(s);
   if(s.world.researched.has("STR_GDX_006"))gdx6Date??=clock.stamp(s);
   if(s.world.researched.has("STR_ACADEMY_HIERARCHY")&&gdx6Date)goalDate??=clock.stamp(s);
   if(s.world.month>=20&&!s.projects.length&&!s.hierarchyQueue.length){reason=goalDate?"GDX_006_HIERARCHY_REACHED":"PREREQUISITES_UNMET";break;}
   const selectionKey=JSON.stringify([[...s.world.researched].sort(),[...s.world.disabled].sort(),[...s.world.baseFunctions].sort(),s.world.items,s.projects.map(p=>p.id),s.world.month,s.deliveryDue]);
   if(clock.available(s)>0&&selectionKey!==lastSelectionKey){
    const eligible=clock.options(s).filter(o=>o.action.type==="research"&&targets.includes(o.action.id)).map(o=>o.action.id).sort((a,b)=>targets.indexOf(a)-targets.indexOf(b));
    for(const k of eligible){if(!clock.available(s))break;clock.begin(s,k,1,50);}
    lastSelectionKey=selectionKey;
   }
   if(s.projects.length&&clock.available(s))clock.assign(s,s.projects[0].id,s.projects[0].assigned+clock.available(s));
   clock.tick(s);
  }
 }catch(e){reason=e.message;}
 const added=s.monthlyLedger.slice(old.monthlyLedger.length);
 assert.equal(startFunds+added.reduce((n,r)=>n+r.countryFunding-r.maintenance+r.bonus,0),s.world.funds);
 const credited=new Set();for(const row of s.monthlyLedger)for(const k of row.researchIds){assert(!credited.has(k));credited.add(k);}
 assert(s.trace.every((t,i)=>!i||t.elapsedHours>=s.trace[i-1].elapsedHours));
 const events=s.trace.filter(t=>t.type==="hierarchyEventResolved"),deliveries=s.trace.filter(t=>t.type==="transferArrival"&&captiveIds.includes(t.id));
 for(const d of deliveries){const ev=events.find(e=>e.item===d.id);assert(ev&&d.elapsedHours===ev.deliveryDue);}
 const next=["STR_GDX_006","STR_ACADEMY_HIERARCHY","STR_PLOTTING","STR_LIBRARY","STR_GAMBLING","STR_CONSUMER_GOODS","STR_CONTACT_MUTANT_ALLIANCE","STR_SCHOOL_BOOKS","STR_GDX_007","STR_GDX_008"].map(id=>({id,reached:s.world.researched.has(id),missing:data.researchRules[id].dependencies.filter(k=>!s.world.researched.has(k)),requiredSample:data.researchRules[id].needItem?data.researchRules[id].neededItem:null,stock:data.researchRules[id].needItem?s.world.items[data.researchRules[id].neededItem]||0:null}));
 const freeRewards=s.trace.filter(t=>t.type==="freeResearch").map(t=>({source:t.action.source,research:t.action.research,date:t.date}));
 runs.push({root:old.root,mode,startDate,startFunds,reason,goalDate,gdx6Date,date:clock.stamp(s),funds:s.world.funds,monthlyLedger:s.monthlyLedger,events,deliveries,freeRewards,next,completedNew:[...s.world.researched].filter(k=>!old.research.includes(k)).sort(),research:[...s.world.researched].sort(),checkpoint:{worldHash:exactStateHash(s.world),state:JSON.parse(JSON.stringify({...s,trace:undefined},(k,v)=>v instanceof Set?{$set:[...v]}:v instanceof Map?{$map:[...v]}:v))},trace:s.trace.filter(t=>t.type!=="researchDay"||t.projects.length)});
 console.log(JSON.stringify({root:old.root,mode,reason,goalDate,gdx6Date,date:clock.stamp(s),funds:s.world.funds,events:events.length,new:runs.at(-1).completedNew,next:next.map(x=>[x.id,x.reached,x.missing])}));
}
const out={schema:"ATLAS_FORWARD_HIERARCHY_TIMED_V4_11",actualGameCertified:false,normalizationComplete:false,scope:"Continues incomplete conditional V4.10 prefix. Four independently selected eligible monthly captain draws and free rewards are not guaranteed outcomes. Containment availability inherited as an assumption. No newly assigned regional combat score. Full event scheduler and native campaign certification absent.",inputs:Object.fromEntries(Object.entries(files).map(([k,p])=>[p,sha(bytes[k])])),rawSources:Object.fromEntries([...sourceCache].map(([k,v])=>[k,v.sha])),engineSha256:sha(fs.readFileSync("tools/atlas-overcap-forward-clock-v4-hierarchy.mjs","utf8").replace(/\r\n/g,"\n")),source:{script:sc,sourceEvent:{...e,pool:e.pool.length},captiveIds},inputsByMonth:monthlyInput,targets,runs};
fs.writeFileSync("tools/data/overcap-forward-hierarchy-timed-v4.json",JSON.stringify(out,null,2)+"\n");
console.log(JSON.stringify({runs:runs.length,goals:runs.filter(r=>r.goalDate).length,gdx6:runs.filter(r=>r.gdx6Date).length,hierarchy:runs.filter(r=>r.research.includes("STR_ACADEMY_HIERARCHY")).length,events:runs.reduce((n,r)=>n+r.events.length,0)},null,2));
