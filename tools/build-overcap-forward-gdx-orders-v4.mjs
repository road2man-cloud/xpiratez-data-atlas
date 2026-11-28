import fs from "node:fs";
import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {createHash} from "node:crypto";
import {createGdxOrderClock} from "./atlas-overcap-forward-clock-v4-gdx-orders.mjs";
import {exactStateHash} from "./origin-pair-exact-prefix-checkpoint.mjs";
const sha=b=>createHash("sha256").update(b).digest("hex");
const files={data:"public/data/soldiers-modern-index.json",forwardSupply:"tools/data/overcap-forward-supply-catalog-v2.json",forwardStartingBase:"tools/data/overcap-forward-starting-base-v3.json",forwardJunk:"tools/data/overcap-forward-junk-extraction-v3.json",facilities:"public/data/facilities-v2-index.json",items:"public/data/items-v2-index.json",manufacture:"public/data/manufacture-v2-index.json",score:"tools/data/overcap-forward-score-sources-v3.json",economy:"tools/data/overcap-forward-monthly-v4.json",prior:"tools/data/overcap-forward-gdx-timed-v4.json",captain:"tools/data/overcap-forward-captain-monthly-sources-v3.json",missions:"tools/data/overcap-forward-electronics-mission-sources-v3.json",bridge:"tools/data/overcap-forward-gdx-bridge-sources-v3.json"};
const bytes=Object.fromEntries(Object.entries(files).map(([k,p])=>[k,fs.existsSync(p)?fs.readFileSync(p):execFileSync("git",["show","HEAD:"+p],{maxBuffer:80*1024*1024})]));
const data=JSON.parse(bytes.data);for(const k of ["forwardSupply","forwardStartingBase","forwardJunk"])data[k]=JSON.parse(bytes[k]);
const score=JSON.parse(bytes.score),prior=JSON.parse(bytes.prior),missionSource=JSON.parse(bytes.missions),bridgeSource=JSON.parse(bytes.bridge),economy={...JSON.parse(bytes.economy).economy,research:score.research};
assert.equal(prior.schema,"ATLAS_FORWARD_GDX_TIMED_V4_7");
assert.equal(bridgeSource.sourceMetadataSha256,data.meta.source.metadataSha256);
const facilityFields=Object.fromEntries(JSON.parse(bytes.facilities).facilities.map(x=>[x.id,x.fields])),itemFields=Object.fromEntries(JSON.parse(bytes.items).items.map(x=>[x.id,x.fields])),manufactureFields=Object.fromEntries(JSON.parse(bytes.manufacture).entries.map(x=>[x.id,x.fields]));
const rulesDir=process.env.XPZ_RULES_DIR||"C:/Dioxine_XPiratez_o2.1/Dioxine_XPiratez/user/mods/Piratez/Ruleset",sourceCache=new Map();
function anchored(a){
 if(!sourceCache.has(a.file)){const b=fs.readFileSync(rulesDir+"/"+a.file);sourceCache.set(a.file,{sha:sha(b),lines:b.toString("utf8").split(/\r?\n/)});}
 const b=sourceCache.get(a.file);assert.equal(b.sha,a.sha256);return b.lines.slice(a.startLine-1,a.endLine).join("\n");
}
const captainSource=JSON.parse(bytes.captain);assert.equal(captainSource.sourceMetadataSha256,data.meta.source.metadataSha256);
const relevantScripts=captainSource.scripts.filter(s=>["STR_CAPTAIN_PERSONALITY_TEST","STR_CAPTAIN_JACKDUMB_EVENTS_1","STR_CAPTAIN_JACKDUMB_EVENTS_2","STR_GDX_EVENT_ORDERS_2"].includes(s.script));
for(const s of relevantScripts){anchored(s.anchor);anchored(s.weightsAnchor);const e=captainSource.events.find(e=>e.id===s.event);assert(e);anchored(e.anchor);}
const revive=(k,v)=>v&&typeof v==="object"&&Object.keys(v).length===1&&Array.isArray(v.$set)?new Set(v.$set):v&&typeof v==="object"&&Object.keys(v).length===1&&Array.isArray(v.$map)?new Map(v.$map):v;
const inputs=Object.fromEntries([8,9,10].map(n=>[n,{countryFunding:economy.fundingTarget,regionalNet:0,otherMaintenance:50000}]));
const targets=["STR_LOOT_DISTRIBUTION","STR_RECRUITMENT","STR_DIVERGING_PATHS","STR_RECRUIT_PEASANTS","STR_CAPTAIN_JACKASS","STR_SECTOID_MEDIC","STR_MUTANT_ORIGINS","STR_HUMANS","STR_NEPOTISM","STR_SURVIVAL","STR_VIOLENCE","STR_UBER_WHEAT","STR_FARMING","STR_RAIDER_CORPSE","STR_CONTACT_TIGER_TRANSPORT","STR_EXPEDITIONS","STR_MESS_HALL","STR_GDX_003","STR_GDX_004","STR_SECTOID_LEADER","STR_PIRATEZ_HIERARCHY"];
const runs=[];
for(const old of prior.runs.filter(r=>r.goalDate))for(const mode of ["strict","late_captain_recovery"]){
 const s=JSON.parse(JSON.stringify(old.checkpoint.state),revive);assert.equal(exactStateHash(s.world),old.checkpoint.worldHash);
 s.trace=[];s.captainQueue=[];
 const clock=createGdxOrderClock(data,{facilityFields,itemFields,manufactureFields,economy,monthlyInput:inputs,missionSource,bridgeSource,captainSource,orderMode:mode});
 const startFunds=s.world.funds,startDate=clock.stamp(s);let reason="NOVEMBER_LIMIT",lastSelectionKey=null,goalDate=null;
 console.log("Producing",old.root,mode);
 try{
  // Explicit alternative liquidity strategy: sell previously studied hull and excess scrap; do not sell captive items.
  clock.sell(s,"STR_MENACING_HULL",1);clock.sell(s,"STR_SCRAP_METAL",100);
  for(let i=0;i<122;i++){
   clock.flush(s);
   if(s.world.researched.has("STR_GDX_002"))goalDate??=clock.stamp(s);
   if(s.world.month>=10&&!s.captainQueue.length&&!s.projects.length){reason=goalDate?"GDX_002_REACHED":"GDX_002_NOT_REACHED";break;}
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
 const additional=s.monthlyLedger.slice(old.monthlyLedger.length),sales=s.trace.filter(t=>t.type==="stockSale").reduce((n,t)=>n+t.income,0);
 assert.equal(startFunds+additional.reduce((n,r)=>n+r.countryFunding-r.maintenance+r.bonus,0)+sales,s.world.funds);
 const credited=new Set();for(const row of s.monthlyLedger)for(const k of row.researchIds){assert(!credited.has(k));credited.add(k);}
 assert(s.trace.every((t,i)=>!i||t.elapsedHours>=rElapsed(s.trace[i-1])));
 const events=s.trace.filter(t=>t.type==="captainEventResolved");
 if(goalDate){assert(s.world.researched.has("STR_SECTOID_MEDIC"));assert(events.some(t=>t.id==="STR_GDX_EVENT_ORDERS_2"&&t.month>=9&&t.points===-100));assert(s.world.researched.has("STR_VESSEL_AMBULANCE"));}
 const next=["STR_GDX_003","STR_GDX_004","STR_GDX_005","STR_PERSUASION","STR_PIRATEZ_HIERARCHY","STR_SECTOID_LEADER"].map(id=>({id,reached:s.world.researched.has(id),missing:data.researchRules[id].dependencies.filter(k=>!s.world.researched.has(k)),sample:data.researchRules[id].needItem?data.researchRules[id].neededItem:null,stock:data.researchRules[id].needItem?s.world.items[data.researchRules[id].neededItem]||0:null}));
 runs.push({root:old.root,mode,startDate,startFunds,sales,reason,goalDate,date:clock.stamp(s),funds:s.world.funds,monthlyLedger:s.monthlyLedger,events,completedNew:[...s.world.researched].filter(k=>!old.research.includes(k)).sort(),research:[...s.world.researched].sort(),next,leaderStock:s.world.items.STR_SECTOID_LEADER||0,checkpoint:{worldHash:exactStateHash(s.world),state:JSON.parse(JSON.stringify({...s,trace:undefined},(k,v)=>v instanceof Set?{$set:[...v]}:v instanceof Map?{$map:[...v]}:v))},trace:s.trace.filter(t=>t.type!=="researchDay"||t.projects.length)});
}
function rElapsed(t){return t.elapsedHours;}
const out={schema:"ATLAS_FORWARD_GDX_ORDERS_V4_8",actualGameCertified:false,normalizationComplete:false,scope:"Explicit incomplete-prefix recovery scenario: previous V4.7 omitted guaranteed initial personality event; later selection permitted by negative gate, but not proof of valid initial campaign. Strict control omits all selected captain events. Conditional event outcomes and two assumed containment slots; inherited funding and activity assumptions; sales of existing hull and excess scrap at raw 100% coefficient, no script adjustment. No native combat, GDX prison or full scheduler certification.",inputs:Object.fromEntries(Object.entries(files).map(([k,p])=>[p,sha(bytes[k])])),rawSources:Object.fromEntries([...sourceCache].map(([k,v])=>[k,v.sha])),engineSha256:sha(fs.readFileSync("tools/atlas-overcap-forward-clock-v4-gdx-orders.mjs","utf8").replace(/\r\n/g,"\n")),targets,inputsByMonth:inputs,sourceScripts:relevantScripts,runs};
fs.writeFileSync("tools/data/overcap-forward-gdx-orders-v4.json",JSON.stringify(out,null,2)+"\n");
console.log(JSON.stringify({runs:runs.length,gdx2:runs.filter(r=>r.goalDate).length,summary:runs.map(r=>({root:r.root,mode:r.mode,reason:r.reason,goal:r.goalDate,date:r.date,funds:r.funds,leader:r.leaderStock,events:r.events.map(e=>[e.id,e.item,e.date]),new:r.completedNew,next:r.next}))},null,2));
