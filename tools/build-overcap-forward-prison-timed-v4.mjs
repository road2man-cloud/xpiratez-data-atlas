import fs from "node:fs";
import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {createHash} from "node:crypto";
import {createPrisonClock} from "./atlas-overcap-forward-clock-v4-prison.mjs";
import {exactStateHash} from "./origin-pair-exact-prefix-checkpoint.mjs";
const sha=b=>createHash("sha256").update(b).digest("hex");
const files={data:"public/data/soldiers-modern-index.json",forwardSupply:"tools/data/overcap-forward-supply-catalog-v2.json",forwardStartingBase:"tools/data/overcap-forward-starting-base-v3.json",forwardJunk:"tools/data/overcap-forward-junk-extraction-v3.json",facilities:"public/data/facilities-v2-index.json",items:"public/data/items-v2-index.json",manufacture:"public/data/manufacture-v2-index.json",score:"tools/data/overcap-forward-score-sources-v3.json",economy:"tools/data/overcap-forward-monthly-v4.json",prior:"tools/data/overcap-forward-persuasion-timed-v4.json",persuasion:"tools/data/overcap-forward-persuasion-sources-v3.json",captain:"tools/data/overcap-forward-captain-monthly-sources-v3.json",missions:"tools/data/overcap-forward-electronics-mission-sources-v3.json",bridge:"tools/data/overcap-forward-gdx-bridge-sources-v3.json"};
const bytes=Object.fromEntries(Object.entries(files).map(([k,p])=>[k,fs.existsSync(p)?fs.readFileSync(p):execFileSync("git",["show","HEAD:"+p],{maxBuffer:80*1024*1024})]));
const data=JSON.parse(bytes.data);for(const k of ["forwardSupply","forwardStartingBase","forwardJunk"])data[k]=JSON.parse(bytes[k]);
const score=JSON.parse(bytes.score),prior=JSON.parse(bytes.prior),missionSource=JSON.parse(bytes.missions),bridgeSource=JSON.parse(bytes.bridge),economy={...JSON.parse(bytes.economy).economy,research:score.research};
assert.equal(prior.schema,"ATLAS_FORWARD_PERSUASION_TIMED_V4_9");
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
function rawBlock(file,header,filter=()=>true){
 const b=fs.readFileSync(rulesDir+"/"+file),lines=b.toString("utf8").split(/\r?\n/),candidates=[];
 sourceCache.set(file,{sha:sha(b),lines});
 for(let i=0;i<lines.length;i++)if(lines[i]===header){
  let end=i+1;while(end<lines.length&&!/^  - |^[^\s#]/.test(lines[end]))end++;
  const text=lines.slice(i,end).join("\n");
  if(filter(text))candidates.push({file,sha256:sha(b),startLine:i+1,endLine:end,blockSha256:sha(text),text});
 }
 assert.equal(candidates.length,1,file+":"+header);return candidates[0];
}
const id="STR_LOC_GDX_PRISON",sample="STR_GDX_005",done="STR_LOC_GDX_PRISON_DONE";
const script=rawBlock("Piratez_Factions.rul","  - type: gdxPrisonMission");
const mission=rawBlock("Piratez_Factions.rul","  - type: "+id,x=>x.includes("raceWeights:"));
const deployment=rawBlock("Piratez_Factions.rul","  - type: "+id,x=>x.includes("startingCondition:"));
const region=rawBlock("Piratez_Planet.rul","  - type: REGION_LOC_GDX_PRISON");
const terrain=rawBlock("Piratez_Planet.rul","  - name: GDX_PRISON");
const map=rawBlock("Piratez_Mapscripts.rul","  - type: GDX_PRISON");
const starting=rawBlock("Piratez_Globals.rul","  - type: STR_STARCON_PRISON");
const research=rawBlock("Piratez.rul","  - name: "+sample);
const route=data.missionResearchSources[done].find(x=>x.deployment===id&&x.reward==="mission-success"),scriptData=route.scripts.find(x=>x.script==="gdxPrisonMission");
assert.deepEqual(scriptData.researchPositive,["STR_GDX_004"]);assert.deepEqual(scriptData.researchNegative,[done]);assert.equal(scriptData.executionOdds,100);
assert(script.text.includes("STR_GDX_004: true")&&script.text.includes(done+": false")&&script.text.includes("useTable: false")&&script.text.includes("executionOdds: 100"));
assert(script.text.includes(id+": 100")&&script.text.includes("REGION_LOC_GDX_PRISON: 100"));
assert(mission.text.includes("STR_SECTOID_HOUSE: 100")&&mission.text.includes("waves: *dummyWave"));
assert(deployment.text.includes("unlockedResearch: "+done)&&deployment.text.includes("startingCondition: STR_STARCON_PRISON")&&deployment.text.includes("      - GDX_PRISON"));
const num=(b,k)=>Number(b.text.match(new RegExp("^    "+k+": (\\d+)$","m"))?.[1]);
const duration=deployment.text.match(/^    duration: \[(\d+), (\d+)\]$/m);
assert(duration&&num(script,"startDelay")===1000&&num(script,"randomDelay")===40000);
const block=terrain.text.split(/\n(?=      - name: )/).find(x=>x.startsWith("      - name: ABASE_03\n"));assert(block&&block.includes("groups: 7")&&block.includes("width: 20")&&block.includes("length: 20"));
assert.equal((terrain.text.match(/^          STR_GDX_005:\s*$/gm)||[]).length,1);
const marker=block.match(/^          STR_GDX_005:\n((?:            - [^\n]+\n?)+)/m);assert(marker);
const count=(marker[1].match(/^            - /gm)||[]).length;assert.equal(count,1);
assert.equal(terrain.text.split(/\n(?=      - name: )/).filter(x=>/^        groups: 7$/m.test(x)).length,1);
const commands=map.text.split(/\n(?=    - type: )/).slice(1);const selected=commands.filter(x=>/^      groups: 7$/m.test(x));assert.equal(selected.length,1);assert(selected[0].includes("type: addBlock")&&selected[0].includes("size: 2")&&selected[0].includes("executions: 1"));
const loot=data.itemSupply[sample].mapLoot.sources;assert.equal(loot.length,1);assert.equal(loot[0].count,count);assert.equal(loot[0].block,"ABASE_03");assert(loot[0].selectors.some(x=>x.soleCandidate&&x.candidateCount===1));
assert(research.text.includes("needItem: true")&&research.text.includes("destroyItem: true")&&research.text.includes("cost: 10")&&research.text.includes("      - "+done));
const allowedCraft=starting.text.split("    allowedCraft:\n")[1].split(/\n    \S/)[0].match(/STR_[A-Z0-9_]+/g);
assert(allowedCraft.includes("STR_AIRBUS"));
const prisonSource={id,sample,count,successResearch:done,script:"gdxPrisonMission",positive:scriptData.researchPositive,negative:scriptData.researchNegative,executionOdds:scriptData.executionOdds,startDelay:num(script,"startDelay"),randomDelay:num(script,"randomDelay"),durationMin:Number(duration[1]),durationMax:Number(duration[2]),selectedDelay:2490,region:"REGION_LOC_GDX_PRISON",candidateSites:(region.text.match(/^        - \[/gm)||[]).length,allowedCraft,startingCondition:route.startingCondition,block:loot[0].block,mapScript:loot[0].mapScript,anchors:[script,mission,deployment,region,terrain,map,starting,research].map(({text,...a})=>a)};
assert.equal(prisonSource.candidateSites,9);
const revive=(k,v)=>v&&typeof v==="object"&&Object.keys(v).length===1&&Array.isArray(v.$set)?new Set(v.$set):v&&typeof v==="object"&&Object.keys(v).length===1&&Array.isArray(v.$map)?new Map(v.$map):v;
const modes=["recover","victory_no_document","expire_then_retry"],targets=[sample,"STR_GDX_190","STR_GDX_006","STR_GDX_007","STR_GDX_008"];
const inputs=Object.fromEntries([14,15].map(n=>[n,{countryFunding:economy.fundingTarget,regionalNet:0,otherMaintenance:50000}]));
const runs=[];
for(const old of prior.runs.filter(r=>r.goalDate))for(const mode of modes){
 const s=JSON.parse(JSON.stringify(old.checkpoint.state),revive);assert.equal(exactStateHash(s.world),old.checkpoint.worldHash);
 s.trace=[];s.prisonQueue=[];s.prisonReceipts=[];s.prisonExpired=[];
 assert(s.world.researched.has("STR_GDX_004")&&!s.world.researched.has(done)&&!(s.world.items[sample]||0));
 const clock=createPrisonClock(data,{facilityFields,itemFields,manufactureFields,economy,monthlyInput:inputs,missionSource,bridgeSource,persuasionSource,orderMode:"strict",prisonSource,prisonMode:mode});
 const startFunds=s.world.funds,startDate=clock.stamp(s);let reason="APRIL_LIMIT",lastSelectionKey=null,goalDate=null;
 console.log("Producing",old.root,mode);
 try{
  for(let i=0;i<90;i++){
   clock.flush(s);
   if(s.world.researched.has(sample)&&s.world.researched.has("STR_GDX_190"))goalDate??=clock.stamp(s);
   if(s.world.month>=15&&!s.prisonQueue.length&&!s.projects.length){
    if(goalDate){reason="GDX_005_AND_190_REACHED";break;}
    if(mode==="victory_no_document"&&s.world.researched.has(done)){reason="MISSION_DONE_DOCUMENT_NOT_RECOVERED";break;}
   }
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
 const next=["STR_GDX_006","STR_GDX_007","STR_GDX_008","STR_SCHOOL_BOOKS","STR_ADVANCED_MEDICINE_PREQ","STR_SOLDIER_TYPE_BASIC_PREQ_A","STR_SOLDIER_TYPE_BASIC_PREQ_B"].map(id=>({id,reached:s.world.researched.has(id),missing:data.researchRules[id].dependencies.filter(k=>!s.world.researched.has(k))}));
 runs.push({root:old.root,mode,startDate,startFunds,reason,goalDate,date:clock.stamp(s),funds:s.world.funds,monthlyLedger:s.monthlyLedger,prisonReceipts:s.prisonReceipts,prisonExpired:s.prisonExpired,prisonQueue:s.prisonQueue,completedNew:[...s.world.researched].filter(k=>!old.research.includes(k)).sort(),research:[...s.world.researched].sort(),next,checkpoint:{worldHash:exactStateHash(s.world),state:JSON.parse(JSON.stringify({...s,trace:undefined},(k,v)=>v instanceof Set?{$set:[...v]}:v instanceof Map?{$map:[...v]}:v))},trace:s.trace.filter(t=>t.type!=="researchDay"||t.projects.length)});
 console.log(JSON.stringify({root:old.root,mode,reason,goalDate,date:clock.stamp(s),funds:s.world.funds,receipts:s.prisonReceipts.length,expired:s.prisonExpired.length,new:runs.at(-1).completedNew}));
}
const out={schema:"ATLAS_FORWARD_PRISON_TIMED_V4_10",actualGameCertified:false,normalizationComplete:false,scope:"V4.9 incomplete-prefix conditional continuation. Initial GDX prison script and map source verified; selected site, flight, victory and recovery remain hypothetical. Only document recovery credited; no invented combat scores or general loot. Zero regional activity in newly simulated months. Prior financial and RNG assumptions persist.",inputs:Object.fromEntries(Object.entries(files).map(([k,p])=>[p,sha(bytes[k])])),rawSources:Object.fromEntries([...sourceCache].map(([k,v])=>[k,v.sha])),engineSha256:sha(fs.readFileSync("tools/atlas-overcap-forward-clock-v4-prison.mjs","utf8").replace(/\r\n/g,"\n")),prisonSource,inputsByMonth:inputs,targets,modes,runs};
fs.writeFileSync("tools/data/overcap-forward-prison-timed-v4.json",JSON.stringify(out,null,2)+"\n");
console.log(JSON.stringify({runs:runs.length,goals:runs.filter(r=>r.goalDate).length,receipts:runs.reduce((n,r)=>n+r.prisonReceipts.length,0),expired:runs.reduce((n,r)=>n+r.prisonExpired.length,0)},null,2));
