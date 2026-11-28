import fs from "node:fs";
import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {createHash} from "node:crypto";
import {createPersuasionClock} from "./atlas-overcap-forward-clock-v4-persuasion.mjs";
import {exactStateHash} from "./origin-pair-exact-prefix-checkpoint.mjs";
const sha=b=>createHash("sha256").update(b).digest("hex");
const files={data:"public/data/soldiers-modern-index.json",forwardSupply:"tools/data/overcap-forward-supply-catalog-v2.json",forwardStartingBase:"tools/data/overcap-forward-starting-base-v3.json",forwardJunk:"tools/data/overcap-forward-junk-extraction-v3.json",facilities:"public/data/facilities-v2-index.json",items:"public/data/items-v2-index.json",manufacture:"public/data/manufacture-v2-index.json",score:"tools/data/overcap-forward-score-sources-v3.json",economy:"tools/data/overcap-forward-monthly-v4.json",prior:"tools/data/overcap-forward-gdx-orders-v4.json",persuasion:"tools/data/overcap-forward-persuasion-sources-v3.json",captain:"tools/data/overcap-forward-captain-monthly-sources-v3.json",missions:"tools/data/overcap-forward-electronics-mission-sources-v3.json",bridge:"tools/data/overcap-forward-gdx-bridge-sources-v3.json"};
const bytes=Object.fromEntries(Object.entries(files).map(([k,p])=>[k,fs.existsSync(p)?fs.readFileSync(p):execFileSync("git",["show","HEAD:"+p],{maxBuffer:80*1024*1024})]));
const data=JSON.parse(bytes.data);for(const k of ["forwardSupply","forwardStartingBase","forwardJunk"])data[k]=JSON.parse(bytes[k]);
const score=JSON.parse(bytes.score),prior=JSON.parse(bytes.prior),missionSource=JSON.parse(bytes.missions),bridgeSource=JSON.parse(bytes.bridge),economy={...JSON.parse(bytes.economy).economy,research:score.research};
assert.equal(prior.schema,"ATLAS_FORWARD_GDX_ORDERS_V4_8");
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
const revive=(k,v)=>v&&typeof v==="object"&&Object.keys(v).length===1&&Array.isArray(v.$set)?new Set(v.$set):v&&typeof v==="object"&&Object.keys(v).length===1&&Array.isArray(v.$map)?new Map(v.$map):v;
const modes={zero_activity:0,regional_3000:3000};
const targets=["STR_GALS_ARE_SUPERIOR_PREQ","STR_PARTY","STR_LINGERIE","STR_MUTANT_BLESSINGS","STR_GLAMOUR","STR_RIBBON","STR_MUTANT_ABILITIES","STR_YOUNG_UBER_RECRUITMENT","STR_SALVAGE","STR_SHAKEUP_CEREMONY","STR_PORN","STR_SECTOWEED","STR_OLD_EARTH_VOODOO","STR_MOST_COMMON_POWER","STR_WENCH_OUTFIT","STR_SOCIALIZING","STR_BOOK_OF_SERMONS","STR_PIRATEZ_HIERARCHY","STR_GDX_003","STR_PERSUASION","STR_SECTOID_LEADER","STR_GDX_004"];
const runs=[];
for(const old of prior.runs.filter(r=>r.goalDate))for(const mode of Object.keys(modes)){
 const s=JSON.parse(JSON.stringify(old.checkpoint.state),revive);assert.equal(exactStateHash(s.world),old.checkpoint.worldHash);
 s.trace=[];s.persuasionQueue=[];s.expeditionOrdered=false;s.expeditionFreeStorageAssumed=75;
 const monthlyInput=Object.fromEntries([11,12,13].map(n=>[n,{countryFunding:economy.fundingTarget,regionalNet:modes[mode],otherMaintenance:50000}]));
 const clock=createPersuasionClock(data,{facilityFields,itemFields,manufactureFields,economy,monthlyInput,missionSource,bridgeSource,persuasionSource,orderMode:"strict"});
 const startFunds=s.world.funds,startDate=clock.stamp(s);let reason="FEBRUARY_LIMIT",lastSelectionKey=null,goalDate=null;
 console.log("Producing",old.root,mode);
 try{
  for(let i=0;i<120;i++){
   clock.flush(s);
   if(s.world.researched.has("STR_GDX_004")){goalDate=clock.stamp(s);reason="GDX_004_REACHED";break;}
   if(!s.expeditionOrdered&&s.world.funds>=persuasionSource.purchase.cost&&s.world.researched.has("STR_EXPEDITION_RESEARCH_INCOMPLETE"))clock.expeditionOrder(s);
   if(!s.world.facilities.has("STR_MESS_HALL")&&!s.construction.length&&s.world.funds>=225000&&s.world.researched.has("STR_MESS_HALL"))clock.build(s,"STR_MESS_HALL");
   if(!s.industry.length){
    if((s.world.items.STR_EXPEDITION_RESEARCH||0)>0)clock.expeditionManufacture(s,"STR_EXPEDITION_DEBRIEF",2);
    else if((s.world.items.STR_LOOTBOX_EXPEDITION||0)>0){
     const done=s.industryFinished.filter(p=>p.id==="STR_LOOTBOX_EXPEDITION_EX").map(p=>p.outcome),next=[6,8,3].find(o=>!done.includes(o));
     if(next!==undefined)clock.expeditionManufacture(s,"STR_LOOTBOX_EXPEDITION_EX",next);
    }
   }
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
 const additional=s.monthlyLedger.slice(old.monthlyLedger.length),eventFunds=s.trace.filter(t=>t.type==="persuasionEventResolved").reduce((n,t)=>n+t.funds,0),spend=s.trace.filter(t=>["constructionStart","purchaseOrder","manufactureStart"].includes(t.type)).reduce((n,t)=>n+t.cost,0);
 assert.equal(startFunds+additional.reduce((n,r)=>n+r.countryFunding-r.maintenance+r.bonus,0)+eventFunds-spend,s.world.funds);
 const credited=new Set();for(const row of s.monthlyLedger)for(const k of row.researchIds){assert(!credited.has(k));credited.add(k);}
 assert(s.trace.every((t,i)=>!i||t.elapsedHours>=s.trace[i-1].elapsedHours));
 const events=s.trace.filter(t=>t.type==="persuasionEventResolved"),orders=s.trace.filter(t=>t.type==="purchaseOrder"),deliveries=s.trace.filter(t=>t.type==="transferArrival"&&t.id==="STR_EXPEDITION_RESEARCH");
 for(const p of deliveries)assert.equal(p.elapsedHours-orders.find(x=>x.id===p.id).elapsedHours,960);
 for(const e of events.filter(e=>e.minimumScore!==null))assert(e.rating>=e.minimumScore);
 const next=["STR_SOCIALIZING","STR_BEASTMEN","STR_CAPTAINS_RANK_01","STR_CAPTAINS_RANK_02","STR_PIRATEZ_HIERARCHY","STR_GDX_003","STR_PERSUASION","STR_SECTOID_LEADER","STR_GDX_004","STR_GDX_005"].map(id=>({id,reached:s.world.researched.has(id),missing:data.researchRules[id].dependencies.filter(k=>!s.world.researched.has(k)),sample:data.researchRules[id].needItem?data.researchRules[id].neededItem:null,stock:data.researchRules[id].needItem?s.world.items[data.researchRules[id].neededItem]||0:null}));
 runs.push({root:old.root,mode,regionalNet:modes[mode],startDate,startFunds,reason,goalDate,date:clock.stamp(s),funds:s.world.funds,monthlyLedger:s.monthlyLedger,events,orders,deliveries,next,completedNew:[...s.world.researched].filter(k=>!old.research.includes(k)).sort(),research:[...s.world.researched].sort(),checkpoint:{worldHash:exactStateHash(s.world),state:JSON.parse(JSON.stringify({...s,trace:undefined},(k,v)=>v instanceof Set?{$set:[...v]}:v instanceof Map?{$map:[...v]}:v))},trace:s.trace.filter(t=>t.type!=="researchDay"||t.projects.length)});
 console.log(JSON.stringify({root:old.root,mode,reason,date:clock.stamp(s),funds:s.world.funds,targets:next.map(x=>[x.id,x.reached,x.missing]),orders:orders.length,deliveries:deliveries.length}));
}
const out={schema:"ATLAS_FORWARD_PERSUASION_TIMED_V4_9",actualGameCertified:false,normalizationComplete:false,scope:"Continues incomplete V4.8 prefix. Regional net 0 vs +3000 explicit conditional sensitivity, not actual combat. Selected event, weighted manufacturing and free research outcomes are conditional; expedition storage 75 assumed; earlier funding and maintenance assumptions persist. No guaranteed rank or native proof.",inputs:Object.fromEntries(Object.entries(files).map(([k,p])=>[p,sha(bytes[k])])),rawSources:{...Object.fromEntries([...sourceCache].map(([k,v])=>[k,v.sha])),"Piratez.rul":sha(rawHall)},engineSha256:sha(fs.readFileSync("tools/atlas-overcap-forward-clock-v4-persuasion.mjs","utf8").replace(/\r\n/g,"\n")),targets,modes,runs};
fs.writeFileSync("tools/data/overcap-forward-persuasion-timed-v4.json",JSON.stringify(out,null,2)+"\n");
console.log(JSON.stringify({runs:runs.length,goals:runs.filter(r=>r.goalDate).length,social:runs.filter(r=>r.research.includes("STR_SOCIALIZING")).length,persuasion:runs.filter(r=>r.research.includes("STR_PERSUASION")).length,gdx3:runs.filter(r=>r.research.includes("STR_GDX_003")).length},null,2));
