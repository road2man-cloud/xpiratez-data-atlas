import fs from "node:fs";
import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {createHash} from "node:crypto";
import {createAdvancedCareerClock,ADVANCED_RECIPES} from "./atlas-overcap-forward-clock-v4-advanced-career.mjs";
import {exactStateHash} from "./origin-pair-exact-prefix-checkpoint.mjs";
const sha=b=>createHash("sha256").update(b).digest("hex");
const files={data:"public/data/soldiers-modern-index.json",forwardSupply:"tools/data/overcap-forward-supply-catalog-v2.json",forwardStartingBase:"tools/data/overcap-forward-starting-base-v3.json",forwardJunk:"tools/data/overcap-forward-junk-extraction-v3.json",facilities:"public/data/facilities-v2-index.json",items:"public/data/items-v2-index.json",manufacture:"public/data/manufacture-v2-index.json",score:"tools/data/overcap-forward-score-sources-v3.json",economy:"tools/data/overcap-forward-monthly-v4.json",prior:"tools/data/overcap-forward-plotting-timed-v4.json",origin:"public/data/soldier-acquisition-progression-20261102.json",sourceCatalog:"public/data/soldier-source-catalog.json",persuasion:"tools/data/overcap-forward-persuasion-sources-v3.json",captain:"tools/data/overcap-forward-captain-monthly-sources-v3.json",missions:"tools/data/overcap-forward-electronics-mission-sources-v3.json",bridge:"tools/data/overcap-forward-gdx-bridge-sources-v3.json"};
const bytes=Object.fromEntries(Object.entries(files).map(([k,p])=>[k,fs.existsSync(p)?fs.readFileSync(p):execFileSync("git",["show","HEAD:"+p],{maxBuffer:80*1024*1024})]));
const data=JSON.parse(bytes.data);for(const k of ["forwardSupply","forwardStartingBase","forwardJunk"])data[k]=JSON.parse(bytes[k]);
const careerPath="tools/data/overcap-forward-career-timed-v4.json",careerBytes=fs.readFileSync(careerPath),careerPrior=JSON.parse(careerBytes);
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

const FIRE="STR_BASIC_FIREARMS_TRAINING",MIL="STR_MILITIA_TRAINING",KATA="STR_GUN_KATA_TRAINING";
const recipePlan=[
 ["STR_TROPHY_TARGET_50_JACK_DA","STR_TROPHY_CREDIT_JACK",50],
 ["STR_SPIN_THE_WHEEL","STR_CASINO_KUPON_1",1],
 ["STR_CASINO_KUPON_1_RECLAIM","STR_CASINO_KUPON_1",7],
 ["STR_CASINO_KUPON_1_RECLAIM","STR_PISTOL_LT",1],
 ["STR_CASINO_KUPON_1_RECLAIM","STR_RIFLE_AK",1],
];
const researchPlan=["STR_PISTOL_LT","STR_RIFLE_AK","STR_PISTOLS_SUMMARY","STR_RIFLES_SUMMARY",FIRE,"STR_GDX_009","STR_SMITHING","STR_PEASANT_MILITIA","STR_SOLDIER_TYPE_BASIC"];
for(const id of ADVANCED_RECIPES){
 const f=manufactureFields[id];
 rawSources.push(rawBlock("Piratez.rul","  - name: "+id,b=>b.includes("time: "+f.time)&&Object.keys(f.requiredItems).every(k=>b.includes(k))));
}
rawSources.push(rawBlock("Piratez_Transformations.rul","  - name: "+FIRE,b=>b.includes("cost: 5000")&&b.includes("recoveryTime: 7")));
assert.equal(careerPrior.schema,"ATLAS_FORWARD_CAREER_TIMED_V4_13");
const runs=[],encode=x=>JSON.parse(JSON.stringify(x,(k,v)=>v instanceof Set?{$set:[...v]}:v instanceof Map?{$map:[...v]}:v));
for(const order of [[MIL,FIRE],[FIRE,MIL]]){
 const parents=order[0]===MIL?careerPrior.runs.filter(r=>r.reason==="TRAINED_AND_RECOVERED"):prior.runs.filter(r=>r.goalDate);
 for(const old of parents){
  const s=JSON.parse(JSON.stringify(old.checkpoint.state),revive);
  assert.equal(exactStateHash(s.world),old.checkpoint.worldHash);
  s.trace=[];
  const existing=!!s.career;
  const monthlyInput={23:{countryFunding:economy.fundingTarget,regionalNet:0,otherMaintenance:50000+(existing?s.career.salary:0)}};
  const clock=createAdvancedCareerClock(data,{facilityFields,itemFields,manufactureFields,economy,monthlyInput,missionSource,bridgeSource,persuasionSource,captainSource,orderMode:"strict",hierarchyMode:"control"});
  const startDate=clock.stamp(s),startFunds=s.world.funds,production=[];
  if(!existing){clock.initialize(s);clock.order(s,profiles[0].id);}
  let recipeIndex=0,reason="DECEMBER_LIMIT",lastSelectionKey=null;
  console.log("Producing",old.root,order.join(" -> "),startDate);
  try{
   for(let day=0;day<60;day++){
    clock.flush(s);
    if(s.career.completed.length===2){reason="BOTH_TRAINED_AND_RECOVERED";break;}
    const midnight=(s.elapsedHours+12)%24===0;
    if(midnight&&recipeIndex<recipePlan.length&&!s.industry.length){
     production.push(clock.produce(s,...recipePlan[recipeIndex++]));
    }
    const next=order[s.career.completed.length];
    if(midnight&&s.career.hire.arrived&&!s.career.training&&next&&s.world.researched.has(next===MIL?"STR_PEASANT_MILITIA":FIRE)){
     const v=clock.verdict(s,next);
     if(v.kind==="eligible")clock.train(s,next);
     else {reason="TRAINING_BLOCKED:"+JSON.stringify(v.blockers||v.conditions);break;}
    }
    const key=JSON.stringify([[...s.world.researched].sort(),[...s.world.disabled].sort(),[...s.world.baseFunctions].sort(),s.world.items,s.projects.map(p=>p.id),s.world.month,s.deliveryDue]);
    if(clock.available(s)>0&&key!==lastSelectionKey){
     const eligible=clock.options(s).filter(o=>o.action.type==="research"&&researchPlan.includes(o.action.id)).map(o=>o.action.id).sort((a,b)=>researchPlan.indexOf(a)-researchPlan.indexOf(b));
     for(const id of eligible){if(!clock.available(s))break;clock.begin(s,id,1,50);}
     lastSelectionKey=key;
    }
    if(s.projects.length&&clock.available(s))clock.assign(s,s.projects[0].id,s.projects[0].assigned+clock.available(s));
    clock.tick(s);
   }
  }catch(e){reason=e.message;}
  const snapshot=clock.snapshot(s),kata=s.career.hire.arrived?clock.verdict(s,KATA):null;
  assert(s.trace.every((t,i)=>!i||t.elapsedHours>=s.trace[i-1].elapsedHours));
  const settled=s.monthlyLedger.slice(old.checkpoint.state.monthlyLedger.length);
  const spend=s.trace.filter(t=>["careerHireOrder","careerTrainingStart","manufactureStart"].includes(t.type)).reduce((n,t)=>n+t.cost,0);
  assert.equal(startFunds+settled.reduce((n,r)=>n+r.countryFunding-r.maintenance+r.bonus,0)-spend,s.world.funds);
  if(reason==="BOTH_TRAINED_AND_RECOVERED"){
   assert.deepEqual(s.career.completed.map(t=>t.id),order);
   assert.equal(s.career.completed.find(t=>t.id===FIRE).recoveryDays,7);
   assert.equal(s.career.completed.find(t=>t.id===FIRE).completed-s.career.completed.find(t=>t.id===FIRE).started,168);
   assert(s.world.researched.has(FIRE));
  }
  runs.push({root:old.root,order,reason,startDate,date:clock.stamp(s),funds:s.world.funds,sourceCheckpoint:old.checkpoint.worldHash,sourceFullStateHash:sha(JSON.stringify(old.checkpoint.state)),startFunds,production,completedNew:[...s.world.researched].filter(k=>!old.research.includes(k)).sort(),research:[...s.world.researched].sort(),career:s.career,snapshot,kata,checkpoint:{worldHash:exactStateHash(s.world),fullStateHash:sha(JSON.stringify(encode({...s,trace:undefined}))),state:encode({...s,trace:undefined})},trace:s.trace.filter(t=>t.type!=="researchDay"||t.projects.length)});
  console.log(JSON.stringify({root:old.root,order,reason,date:clock.stamp(s),production:production.length,completed:s.career.completed.map(t=>({id:t.id,delta:t.delta})),kata:kata?.kind}));
 }
}
const successful=runs.filter(r=>r.reason==="BOTH_TRAINED_AND_RECOVERED");
const comparisons=successful.filter(r=>r.order[0]===MIL).flatMap(a=>successful.filter(b=>b.order[0]===FIRE&&b.root===a.root).map(b=>({root:a.root,militiaFirst:a.snapshot.stats,firearmsFirst:b.snapshot.stats})));
const archive="tools/headless-simulator/native/oxce-source.tar.gz";
const nativeSources=[
 ["./src/Savegame/Soldier.cpp",2041,2059,"UnitStats::softLimit(statChange, currentStats, upperBound)"],
 ["./src/Mod/RuleSoldierTransformation.cpp",367,378,"return isSameSoldierType"]
].map(([path,start,end,expected])=>{const b=execFileSync("tar",["-xOf",archive,path],{maxBuffer:20000000});const block=b.toString("utf8").split(/\r?\n/).slice(start-1,end).join("\n");assert(block.includes(expected));return {path,start,end,sha256:sha(b),blockSha256:sha(block),excerpt:block};});
for(const c of comparisons){assert.equal(c.firearmsFirst.effective.firing-c.militiaFirst.effective.firing,6);assert.equal(c.firearmsFirst.effective.reactions-c.militiaFirst.effective.reactions,3);}
assert.equal(runs.length,8);assert.equal(successful.length,8);assert.equal(comparisons.length,4);
const out={nativeSources,schema:"ATLAS_FORWARD_ADVANCED_CAREER_TIMED_V4_14",normalizationComplete:false,actualGameCertified:false,scope:"Conditional V4.12/V4.13 continuation. Uses inherited trophy, credit chip and selected manufacturing outcomes. No new mission, free item injection, native certification or public integration. Deterministic trophy redemption normalized to one internal outcome; random branches are selected, not expected-value or guaranteed results.",inputs:{...Object.fromEntries(Object.entries(files).map(([k,p])=>[p,sha(bytes[k])])),[careerPath]:sha(careerBytes)},rawSources,recipePlan,researchPlan,runs,comparisons,engineFiles:Object.fromEntries(["tools/atlas-overcap-forward-clock-v4-advanced-career.mjs","tools/build-overcap-forward-advanced-career-timed-v4.mjs"].map(p=>[p,sha(fs.readFileSync(p,"utf8").replace(/\r\n/g,"\n"))])),summary:{runs:runs.length,successful:successful.length,comparisons:comparisons.length}};
fs.writeFileSync("tools/data/overcap-forward-advanced-career-timed-v4.json",JSON.stringify(out,null,2)+"\n");
console.log(JSON.stringify(out.summary));
