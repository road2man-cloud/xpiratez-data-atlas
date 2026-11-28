import fs from "node:fs";
import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {createHash} from "node:crypto";
import {createTimedCareerClock} from "./atlas-overcap-forward-clock-v4-career.mjs";
import {exactStateHash} from "./origin-pair-exact-prefix-checkpoint.mjs";
const sha=b=>createHash("sha256").update(b).digest("hex");
const files={data:"public/data/soldiers-modern-index.json",forwardSupply:"tools/data/overcap-forward-supply-catalog-v2.json",forwardStartingBase:"tools/data/overcap-forward-starting-base-v3.json",forwardJunk:"tools/data/overcap-forward-junk-extraction-v3.json",facilities:"public/data/facilities-v2-index.json",items:"public/data/items-v2-index.json",manufacture:"public/data/manufacture-v2-index.json",score:"tools/data/overcap-forward-score-sources-v3.json",economy:"tools/data/overcap-forward-monthly-v4.json",prior:"tools/data/overcap-forward-plotting-timed-v4.json",origin:"public/data/soldier-acquisition-progression-20261102.json",sourceCatalog:"public/data/soldier-source-catalog.json",persuasion:"tools/data/overcap-forward-persuasion-sources-v3.json",captain:"tools/data/overcap-forward-captain-monthly-sources-v3.json",missions:"tools/data/overcap-forward-electronics-mission-sources-v3.json",bridge:"tools/data/overcap-forward-gdx-bridge-sources-v3.json"};
const bytes=Object.fromEntries(Object.entries(files).map(([k,p])=>[k,fs.existsSync(p)?fs.readFileSync(p):execFileSync("git",["show","HEAD:"+p],{maxBuffer:80*1024*1024})]));
const data=JSON.parse(bytes.data);for(const k of ["forwardSupply","forwardStartingBase","forwardJunk"])data[k]=JSON.parse(bytes[k]);
const score=JSON.parse(bytes.score),prior=JSON.parse(bytes.prior),missionSource=JSON.parse(bytes.missions),bridgeSource=JSON.parse(bytes.bridge),economy={...JSON.parse(bytes.economy).economy,research:score.research};
assert.equal(prior.schema,"ATLAS_FORWARD_PLOTTING_TIMED_V4_12");
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
const catalog=JSON.parse(bytes.sourceCatalog);assert.deepEqual(catalog.sourceHashes,data.meta.source.rules);
data.originRows=JSON.parse(bytes.origin).rows;data.sourceItemIds=new Set(catalog.itemIds);
const captainSource=JSON.parse(bytes.captain);
function rawBlock(file,header,check){
 const b=fs.readFileSync(rulesDir+"/"+file),lines=b.toString("utf8").split(/\r?\n/);sourceCache.set(file,{sha:sha(b),lines});
 const matches=[];for(let i=0;i<lines.length;i++)if(lines[i]===header){let z=i+1;while(z<lines.length&&!/^  - |^[^\s#]/.test(lines[z]))z++;const body=lines.slice(i,z).join("\n");if(check(body))matches.push({file,sha256:sha(b),startLine:i+1,endLine:z,blockSha256:sha(body)});}
 assert.equal(matches.length,1,header);return matches[0];
}
const profiles=["direct:STR_SOLDIER_PEASANT","direct:STR_SOLDIER_S"].map(id=>data.profiles.find(p=>p.id===id));
const rawSources=profiles.map(p=>rawBlock("Piratez.rul","  - type: "+p.soldierType,b=>b.includes("costBuy: "+p.cost)&&b.includes("costSalary: "+p.salary)&&b.includes("transferTime: "+p.time)));
rawSources.push(rawBlock("Piratez_Transformations.rul","  - name: STR_MILITIA_TRAINING",b=>b.includes("cost: 7500")&&b.includes("recoveryTime: 14")&&b.includes("upperBoundAtStatCaps: true")&&b.includes("STR_SOLDIER_PEASANT")&&b.includes("STR_SOLDIER_DAMSEL")));
const revive=(k,v)=>v&&typeof v==="object"&&Object.keys(v).length===1&&Array.isArray(v.$set)?new Set(v.$set):v&&typeof v==="object"&&Object.keys(v).length===1&&Array.isArray(v.$map)?new Map(v.$map):v;
const targets=["STR_GDX_009","STR_SMITHING","STR_PEASANT_MILITIA","STR_SOLDIER_TYPE_BASIC"];
const runs=[];
for(const old of prior.runs.filter(r=>r.goalDate))for(const p of (old.root==="STR_WAT_DO"?profiles:[profiles[0]])){
 const s=JSON.parse(JSON.stringify(old.checkpoint.state),revive);assert.equal(exactStateHash(s.world),old.checkpoint.worldHash);
 s.trace=[];const monthlyInput={23:{countryFunding:economy.fundingTarget,regionalNet:0,otherMaintenance:50000}};
 const clock=createTimedCareerClock(data,{facilityFields,itemFields,manufactureFields,economy,monthlyInput,missionSource,bridgeSource,persuasionSource,captainSource,orderMode:"strict",hierarchyMode:"control"});
 clock.initialize(s);
 const startDate=clock.stamp(s),startFunds=s.world.funds;let reason="DECEMBER_LIMIT",lastSelectionKey=null;
 console.log("Producing",old.root,p.id);
 try{
  clock.order(s,p.id);
  for(let i=0;i<45;i++){
   clock.flush(s);
   if(s.career.hire.arrived&&s.world.researched.has("STR_PEASANT_MILITIA")&&!s.career.training&&!s.career.completed.length&&!s.career.blocked.length&&(s.elapsedHours+12)%24===0)clock.train(s,"STR_MILITIA_TRAINING");
   if(s.world.researched.has("STR_GDX_009")&&s.world.researched.has("STR_SOLDIER_TYPE_BASIC")&&(s.career.completed.length||s.career.blocked.length)){reason=s.career.completed.length?"TRAINED_AND_RECOVERED":"BODY_RESTRICTION";break;}
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
 const added=s.monthlyLedger.slice(old.monthlyLedger.length),spend=s.trace.filter(t=>["careerHireOrder","careerTrainingStart"].includes(t.type)).reduce((n,t)=>n+t.cost,0);
 assert.equal(startFunds+added.reduce((n,r)=>n+r.countryFunding-r.maintenance+r.bonus,0)-spend,s.world.funds);
 assert(s.trace.every((t,i)=>!i||t.elapsedHours>=s.trace[i-1].elapsedHours));
 for(const m of added)assert.equal(m.otherMaintenance,50000+p.salary);
 const snapshot=clock.snapshot(s),arrival=s.trace.find(t=>t.type==="careerHireArrival"),order=s.trace.find(t=>t.type==="careerHireOrder");
 if(arrival)assert.equal(arrival.elapsedHours-order.elapsedHours,p.time);
 const recovery=s.career.completed[0];if(recovery){assert.equal(recovery.completed-recovery.started,14*24);assert.equal(recovery.afterRecovery.status,"healthy");assert.equal(recovery.delta.firing,10);assert.equal(recovery.delta.stamina,6);assert.equal(recovery.delta.bravery,10);}
 runs.push({root:old.root,profile:p.id,startDate,startFunds,reason,date:clock.stamp(s),funds:s.world.funds,monthlyLedger:s.monthlyLedger,career:s.career,snapshot,completedNew:[...s.world.researched].filter(k=>!old.research.includes(k)).sort(),research:[...s.world.researched].sort(),checkpoint:{worldHash:exactStateHash(s.world),state:JSON.parse(JSON.stringify({...s,trace:undefined},(k,v)=>v instanceof Set?{$set:[...v]}:v instanceof Map?{$map:[...v]}:v))},trace:s.trace.filter(t=>t.type!=="researchDay"||t.projects.length)});
 console.log(JSON.stringify({root:old.root,profile:p.id,reason,date:clock.stamp(s),funds:s.world.funds,new:runs.at(-1).completedNew,delta:recovery?.delta,blocked:s.career.blocked}));
}
assert.equal(runs.length,5);
assert.equal(runs.filter(r=>r.reason==="TRAINED_AND_RECOVERED").length,4);
assert.equal(runs.filter(r=>r.reason==="BODY_RESTRICTION").length,1);
for(const r of runs){
 assert(r.research.includes("STR_GDX_009")&&r.research.includes("STR_SOLDIER_TYPE_BASIC")&&r.research.includes("STR_PEASANT_MILITIA"));
 assert.equal(r.snapshot.transformations.length,data.transformations.length);
 if(r.reason==="TRAINED_AND_RECOVERED"){
  assert.equal(r.career.completed.length,1);
  assert.deepEqual(r.career.completed[0].before.rawStatCaps,r.snapshot.stats.rawStatCaps);
  assert.deepEqual(r.career.completed[0].before.trainingStatCaps,r.snapshot.stats.trainingStatCaps);
  assert.equal(r.snapshot.stats.history.STR_MILITIA_TRAINING,1);
 }else{
  assert.equal(r.career.completed.length,0);
  assert.equal(r.career.blocked.length,1);
  assert.equal(r.snapshot.stats.history.STR_MILITIA_TRAINING,undefined);
 }
}
const out={schema:"ATLAS_FORWARD_CAREER_TIMED_V4_13",actualGameCertified:false,normalizationComplete:false,scope:"Conditional V4.12 continuation; selected minimum birth stats, no tactical growth or native campaign certification. Direct purchase and arrival, same-body militia transformation, one recovery unit per day, exact new recruit salary added to inherited conditional upkeep. Existing initial six soldiers not individually modeled. No legacy route replay or public integration claim.",inputs:Object.fromEntries(Object.entries(files).map(([k,p])=>[p,sha(bytes[k])])),rawSources,engineFiles:Object.fromEntries(["tools/atlas-overcap-forward-clock-v4-career.mjs","tools/atlas-overcap-forward-clock-v4-plotting.mjs","public/soldiers/modern/origin-witness.js","public/soldiers/modern/eligibility.js"].map(p=>[p,sha(fs.readFileSync(p,"utf8").replace(/\r\n/g,"\n"))])),targets,runs};
fs.writeFileSync("tools/data/overcap-forward-career-timed-v4.json",JSON.stringify(out,null,2)+"\n");
console.log(JSON.stringify({runs:runs.length,trained:runs.filter(r=>r.reason==="TRAINED_AND_RECOVERED").length,blocked:runs.filter(r=>r.reason==="BODY_RESTRICTION").length},null,2));
