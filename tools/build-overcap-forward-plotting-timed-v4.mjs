import fs from "node:fs";
import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {createHash} from "node:crypto";
import {createPlottingClock} from "./atlas-overcap-forward-clock-v4-plotting.mjs";
import {exactStateHash} from "./origin-pair-exact-prefix-checkpoint.mjs";
const sha=b=>createHash("sha256").update(b).digest("hex");
const files={data:"public/data/soldiers-modern-index.json",forwardSupply:"tools/data/overcap-forward-supply-catalog-v2.json",forwardStartingBase:"tools/data/overcap-forward-starting-base-v3.json",forwardJunk:"tools/data/overcap-forward-junk-extraction-v3.json",facilities:"public/data/facilities-v2-index.json",items:"public/data/items-v2-index.json",manufacture:"public/data/manufacture-v2-index.json",score:"tools/data/overcap-forward-score-sources-v3.json",economy:"tools/data/overcap-forward-monthly-v4.json",prior:"tools/data/overcap-forward-hierarchy-timed-v4.json",persuasion:"tools/data/overcap-forward-persuasion-sources-v3.json",captain:"tools/data/overcap-forward-captain-monthly-sources-v3.json",missions:"tools/data/overcap-forward-electronics-mission-sources-v3.json",bridge:"tools/data/overcap-forward-gdx-bridge-sources-v3.json"};
const bytes=Object.fromEntries(Object.entries(files).map(([k,p])=>[k,fs.existsSync(p)?fs.readFileSync(p):execFileSync("git",["show","HEAD:"+p],{maxBuffer:80*1024*1024})]));
const data=JSON.parse(bytes.data);for(const k of ["forwardSupply","forwardStartingBase","forwardJunk"])data[k]=JSON.parse(bytes[k]);
const score=JSON.parse(bytes.score),prior=JSON.parse(bytes.prior),missionSource=JSON.parse(bytes.missions),bridgeSource=JSON.parse(bytes.bridge),economy={...JSON.parse(bytes.economy).economy,research:score.research};
assert.equal(prior.schema,"ATLAS_FORWARD_HIERARCHY_TIMED_V4_11");
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
const captiveRewards={STR_BANDIT_BOY:"STR_CASH_BAG",STR_RAIDER_SCOUT:"STR_MONEY_PURSE"};
for(const [id,reward] of Object.entries(captiveRewards)){assert(e.pool.includes(id)&&data.researchRules[id].needItem&&data.researchRules[id].destroyItem&&data.researchRules[id].getOneFree.includes(reward));assert(data.itemSupply[id].eventGrants.some(g=>g.event===e.id&&g.scriptIds.includes(sc.script)));}
assert(data.researchRules.STR_GDX_005.unlocks.includes("STR_SCHOOL_BOOKS"));
assert(data.researchRules.STR_CONTACT_GENERAL_SUPPLIES.unlocks.includes("STR_SMGS_SUMMARY"));
assert(data.researchRules.STR_SMGS_SUMMARY.unlocks.includes("STR_FIREARMS_SUMMARY"));
const rawLines=rawHall.toString("utf8").split(/\r?\n/);
const unlockSources=[["STR_GDX_005","STR_SCHOOL_BOOKS"],["STR_CONTACT_GENERAL_SUPPLIES","STR_SMGS_SUMMARY"],["STR_SMGS_SUMMARY","STR_FIREARMS_SUMMARY"]].map(([source,target])=>{
 const i=rawLines.findIndex(l=>l==="  - name: "+source);assert(i>=0);
 let end=i+1;while(end<rawLines.length&&!/^  - |^[^\s#]/.test(rawLines[end]))end++;
 const b=rawLines.slice(i,end).join("\n"),u=b.match(/^    unlocks:\n((?:      - [^\n]+\n?)+)/m);assert(u&&u[1].split("\n").includes("      - "+target));
 return {source,target,file:"Piratez.rul",sha256:sha(rawHall),startLine:i+1,endLine:end,blockSha256:sha(b)};
});
const revive=(k,v)=>v&&typeof v==="object"&&Object.keys(v).length===1&&Array.isArray(v.$set)?new Set(v.$set):v&&typeof v==="object"&&Object.keys(v).length===1&&Array.isArray(v.$map)?new Map(v.$map):v;
const monthlyInput=Object.fromEntries([21,22,23].map(n=>[n,{countryFunding:economy.fundingTarget,regionalNet:0,otherMaintenance:50000}]));
const targets=["STR_BOW_H","STR_BOWS_SUMMARY","STR_MELEE_SUMMARY","STR_PRIMITIVE_WEAPONS","STR_SMGS_SUMMARY","STR_TACTICS","STR_SCHOOL_BOOKS","STR_LIBRARY","STR_SEA_TRANSPORT","STR_LOGISTICS","STR_BANDIT_BOY","STR_RAIDER_SCOUT","STR_GAMBLING","STR_PLOTTING","STR_GDX_007","STR_GDX_008"];
const runs=[];
for(const old of prior.runs.filter(r=>r.goalDate))for(const mode of (old.root==="STR_WAT_DO"?["selected_captives","control"]:["selected_captives"])){
 const s=JSON.parse(JSON.stringify(old.checkpoint.state),revive);assert.equal(exactStateHash(s.world),old.checkpoint.worldHash);
 s.trace=[];s.hierarchyQueue=[];
 const clock=createPlottingClock(data,{facilityFields,itemFields,manufactureFields,economy,monthlyInput,missionSource,bridgeSource,persuasionSource,captainSource,orderMode:"strict",hierarchyMode:mode});
 const startFunds=s.world.funds,startDate=clock.stamp(s);let reason="DECEMBER_LIMIT",lastSelectionKey=null,goalDate=null;
 console.log("Producing",old.root,mode);
 try{
  for(let i=0;i<122;i++){
   clock.flush(s);
   if(s.world.researched.has("STR_GDX_008")){goalDate=clock.stamp(s);reason="GDX_008_REACHED";break;}
   if(s.world.month>=23&&!s.projects.length&&!s.hierarchyQueue.length){reason="PREREQUISITES_UNMET";break;}
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
 const events=s.trace.filter(t=>t.type==="hierarchyEventResolved"),deliveries=s.trace.filter(t=>t.type==="transferArrival"&&Object.hasOwn(captiveRewards,t.id));
 for(const d of deliveries){const ev=events.find(e=>e.item===d.id);assert(ev&&d.elapsedHours===ev.deliveryDue);}
 const freeRewards=s.trace.filter(t=>t.type==="freeResearch").map(t=>({source:t.action.source,research:t.action.research,date:t.date}));
 const next=["STR_SCHOOL_BOOKS","STR_TACTICS","STR_LIBRARY","STR_GAMBLING","STR_PLOTTING","STR_GDX_007","STR_GDX_008","STR_CONTACT_MUTANT_ALLIANCE"].map(id=>({id,reached:s.world.researched.has(id),missingDirectDependencies:data.researchRules[id].dependencies.filter(k=>!s.world.researched.has(k)),completedUnlockSources:Object.entries(data.researchRules).filter(([k,r])=>s.world.researched.has(k)&&r.unlocks.includes(id)).map(([k])=>k)}));
 if(goalDate){assert(s.world.researched.has("STR_GDX_007")&&s.world.researched.has("STR_PLOTTING"));assert(!s.world.researched.has("STR_CONTACT_MUTANT_ALLIANCE"));assert(freeRewards.some(x=>x.source==="STR_BANDIT_BOY"&&x.research==="STR_CASH_BAG"));assert(freeRewards.some(x=>x.source==="STR_RAIDER_SCOUT"&&x.research==="STR_MONEY_PURSE"));}
 runs.push({root:old.root,mode,startDate,startFunds,reason,goalDate,date:clock.stamp(s),funds:s.world.funds,monthlyLedger:s.monthlyLedger,events,deliveries,freeRewards,next,completedNew:[...s.world.researched].filter(k=>!old.research.includes(k)).sort(),research:[...s.world.researched].sort(),checkpoint:{worldHash:exactStateHash(s.world),state:JSON.parse(JSON.stringify({...s,trace:undefined},(k,v)=>v instanceof Set?{$set:[...v]}:v instanceof Map?{$map:[...v]}:v))},trace:s.trace.filter(t=>t.type!=="researchDay"||t.projects.length)});
 console.log(JSON.stringify({root:old.root,mode,reason,goalDate,date:clock.stamp(s),funds:s.world.funds,events:events.length,new:runs.at(-1).completedNew,next:next.map(x=>[x.id,x.reached,x.missingDirectDependencies,x.completedUnlockSources])}));
}
assert.equal(runs.length,5);assert.equal(runs.filter(r=>r.goalDate).length,4);
for(const r of runs){
 assert(r.research.includes("STR_LIBRARY")&&r.research.includes("STR_SCHOOL_BOOKS")&&r.research.includes("STR_TACTICS"));
 assert(!r.research.includes("STR_CONTACT_MUTANT_ALLIANCE"));
 if(r.mode==="control"){assert.equal(r.events.length,0);assert(!r.research.includes("STR_GAMBLING")&&!r.goalDate);}
 else {assert.equal(r.events.length,2);assert.equal(r.deliveries.length,2);for(const id of Object.keys(captiveRewards)){const t=r.trace.find(t=>t.type==="researchSettlement"&&t.id===id);assert(t&&t.consumed&&t.stock===0);}}
}
const out={schema:"ATLAS_FORWARD_PLOTTING_TIMED_V4_12",actualGameCertified:false,normalizationComplete:false,scope:"Continuation of incomplete conditional V4.11 prefix. Two selected eligible captain draws and two selected free rewards. Alternative explicit unlocks for school books and firearms summary; no claim of completed mutant alliance contact. No newly assigned regional combat score. Inherited finance, containment and prior RNG assumptions persist. Full event scheduler and native campaign certification absent.",inputs:Object.fromEntries(Object.entries(files).map(([k,p])=>[p,sha(bytes[k])])),rawSources:Object.fromEntries([...sourceCache].map(([k,v])=>[k,v.sha])),engineSha256:sha(fs.readFileSync("tools/atlas-overcap-forward-clock-v4-plotting.mjs","utf8").replace(/\r\n/g,"\n")),source:{script:sc,sourceEvent:{...e,pool:e.pool.length},captiveRewards},inputsByMonth:monthlyInput,unlockSources,targets,runs};
fs.writeFileSync("tools/data/overcap-forward-plotting-timed-v4.json",JSON.stringify(out,null,2)+"\n");
console.log(JSON.stringify({runs:runs.length,goals:runs.filter(r=>r.goalDate).length,plotting:runs.filter(r=>r.research.includes("STR_PLOTTING")).length,events:runs.reduce((n,r)=>n+r.events.length,0)},null,2));
