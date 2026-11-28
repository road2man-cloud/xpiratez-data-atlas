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

const parentPath="tools/data/overcap-forward-advanced-career-timed-v4.json",parentBytes=fs.readFileSync(parentPath),parent=JSON.parse(parentBytes);
assert.equal(parent.schema,"ATLAS_FORWARD_ADVANCED_CAREER_TIMED_V4_14");
const rules=data.researchRules, coupon="STR_CASINO_KUPON_1_RECLAIM";
const extraPlan=[["STR_CASINO_KUPON_1",7],["STR_SMG",1],["STR_SHOTGUN_PA",1],["STR_CRACK",12],["STR_GRENADE",12],["STR_HUNTING_RIFLE",1],["STR_RUGER",1],["STR_COMBAT_SHOTGUN",1],["STR_WRENCH",1],["STR_GRENADE_FRAG",6]].map(([id,n])=>[coupon,id,n]);
const targets=[...new Set([...researchPlan,"STR_PSI_LAB","STR_SOULSENSE","STR_GYMNASTICS","STR_SKINNING","STR_CRACK","STR_MEDICAL_SUPPLIES","STR_MEDICINE","STR_MUTANT_EGG","STR_CUISINE","STR_GYM_ADVANCE","STR_BASIC_INCENDIARIES","STR_BALLISTICS","STR_FLINTLOCKS_PRODUCTION","STR_CLOCKWORK_GUN_PRODUCTION","STR_FLINTLOCK_RIFLE","STR_SNIPER_SUMMARY","STR_SMG","STR_SMG_SPIKED","STR_SHOTGUN_PA","STR_SHOTGUNS_SUMMARY","STR_SHOTGUN_FIST","STR_BABY_BOOMER","STR_GRENADE","STR_GRENADE_FRAG","STR_EXPLOSIVES_SUMMARY","STR_HUNTING_RIFLE","STR_RUGER","STR_GUN_SCOPE","STR_AMMO_MANUFACTURING_2_PREQ","STR_COMBAT_SHOTGUN","STR_WRENCH","STR_PRIMITIVE_WEAPONS_2","STR_EXCAVATION","STR_STEAM_POWER",...rules[KATA].dependencies,KATA])];
const encode=x=>JSON.parse(JSON.stringify(x,(k,v)=>v instanceof Set?{$set:[...v]}:v instanceof Map?{$map:[...v]}:v));
const active=(s,id)=>s.world.researched.has(id)&&!s.world.disabled.has(id);
const sourceArchive="tools/headless-simulator/native/oxce-source.tar.gz";
const soldierSource=execFileSync("tar",["-xOf",sourceArchive,"./src/Savegame/Soldier.cpp"],{maxBuffer:20000000});
const soldierLines=soldierSource.toString("utf8").split(/\r?\n/);
const psiLine=soldierLines.findIndex(x=>x.includes("_initialStats.psiStrength = RNG::generate(minStats.psiStrength, maxStats.psiStrength)"));
assert(psiLine>=0,"NATIVE_BIRTH_PSI_RANGE_NOT_FOUND");
const nativeBirth={path:"./src/Savegame/Soldier.cpp",line:psiLine+1,sha256:sha(soldierSource),excerpt:soldierLines[psiLine]};
const runs=[];
const jobs=[...parent.runs.filter(r=>r.order[0]===FIRE&&r.reason==="BOTH_TRAINED_AND_RECOVERED").map(old=>({old,high:false})),...prior.runs.filter(r=>r.goalDate).map(old=>({old,high:true}))];
for(const {old,high} of jobs){
 const s=JSON.parse(JSON.stringify(old.checkpoint.state),revive);
 assert.equal(exactStateHash(s.world),old.checkpoint.worldHash);
 if(old.checkpoint.fullStateHash)assert.equal(sha(JSON.stringify(old.checkpoint.state)),old.checkpoint.fullStateHash);
 s.trace=[];
 const monthlyInput=Object.fromEntries([23,24,25,26,27].map(m=>[m,{countryFunding:economy.fundingTarget,regionalNet:0,otherMaintenance:50000+(s.career?.salary||0)}]));
 const clock=createAdvancedCareerClock(data,{facilityFields,itemFields,manufactureFields,economy,monthlyInput,missionSource,bridgeSource,persuasionSource,captainSource,orderMode:"strict",hierarchyMode:"control",maxMonth:28});
 const startDate=clock.stamp(s),startFunds=s.world.funds;
 if(high){clock.initialize(s);clock.order(s,profiles[0].id,{birthPsiStrength:42});}
 const planned=high?[...recipePlan,...extraPlan]:extraPlan;
 let idx=0,keyBefore=null,reason="HORIZON",stalled=0;
 const productions=[];
 for(let day=0;day<120;day++){
  try{
   clock.flush(s);
   if(s.career.completed.some(x=>x.id===KATA)){reason="KATA_TRAINED_AND_RECOVERED";break;}
   const midnight=(s.elapsedHours+12)%24===0;
   let acted=false;
   if(midnight&&idx<planned.length&&!s.industry.length){
    productions.push(clock.produce(s,...planned[idx++]));acted=true;
   }
   const order=[FIRE,MIL,KATA],next=order[s.career.completed.length];
   if(midnight&&s.career.hire.arrived&&!s.career.training&&next&&active(s,next===MIL?"STR_PEASANT_MILITIA":next)){
    if(clock.verdict(s,next).kind==="eligible"){clock.train(s,next);acted=true;}
   }
   const key=JSON.stringify([[...s.world.researched].sort(),[...s.world.disabled].sort(),[...s.world.baseFunctions].sort(),s.world.items,s.projects.map(p=>p.id),s.world.month,s.deliveryDue]);
   if(clock.available(s)>0&&key!==keyBefore){
    const eligible=clock.options(s).filter(o=>o.action.type==="research"&&targets.includes(o.action.id)).map(o=>o.action.id).sort((a,b)=>targets.indexOf(a)-targets.indexOf(b));
    for(const id of eligible){if(!clock.available(s))break;clock.begin(s,id,1,50);acted=true;}
    keyBefore=key;
   }
   if(s.projects.length&&clock.available(s))clock.assign(s,s.projects[0].id,s.projects[0].assigned+clock.available(s));
   if(!acted&&!s.projects.length&&!s.industry.length&&!s.career.training&&idx===planned.length){if(++stalled>=2){reason="SUPPORTED_FRONTIER_EXHAUSTED";break;}}else stalled=0;
   if(s.elapsedHours+24>=(Date.UTC(2603,3,1)-Date.UTC(2601,0,1,12))/3600000){reason="MARCH_LIMIT";break;}
   clock.tick(s);
  }catch(e){reason=e.message;break;}
 }
 const snapshot=clock.snapshot(s);
 const kata=clock.verdict(s,KATA);
 const completedNew=[...s.world.researched].filter(k=>!old.research.includes(k)).sort();
 const monthly=s.monthlyLedger.slice(old.checkpoint.state.monthlyLedger.length);
 const spend=s.trace.filter(t=>["careerHireOrder","careerTrainingStart","manufactureStart"].includes(t.type)).reduce((n,t)=>n+t.cost,0);
 assert.equal(startFunds+monthly.reduce((n,r)=>n+r.countryFunding-r.maintenance+r.bonus,0)-spend,s.world.funds);
 assert(monthly.every(x=>x.otherMaintenance===52500));
 assert(s.trace.every((t,i)=>!i||t.elapsedHours>=s.trace[i-1].elapsedHours));
 assert.equal(snapshot.stats.initial.psiStrength,high?42:20);
 const frontier=rules[KATA].dependencies.map(id=>({id,complete:active(s,id),missingResearch:[...(rules[id]?.requires||[]),...(rules[id]?.dependencies||[])].filter(k=>!active(s,k)),missingFunctions:(rules[id]?.requiresBaseFunc||[]).filter(k=>!s.world.baseFunctions.has(k)),missingSample:rules[id]?.needItem&&!(s.world.items[rules[id].neededItem||id]>0)?rules[id].neededItem||id:null}));
 const lib=data.forwardSupply.facilities.STR_LIBRARY;
 const state=encode({...s,trace:undefined});
 runs.push({root:old.root,birthPsiStrength:high?42:20,sourceCheckpoint:old.checkpoint.worldHash,sourceFullStateHash:sha(JSON.stringify(old.checkpoint.state)),startDate,startFunds,date:clock.stamp(s),reason,funds:s.world.funds,productions,completedNew,completedKataDependencies:frontier.filter(x=>x.complete).length,frontier,kata,library:{research:active(s,"STR_LIBRARY"),cost:lib.cost,funds:s.world.funds,shortfall:Math.max(0,lib.cost-s.world.funds)},career:s.career,snapshot,monthly,checkpoint:{worldHash:exactStateHash(s.world),fullStateHash:sha(JSON.stringify(state)),state},trace:s.trace.filter(t=>t.type!=="researchDay"||t.projects.length)});
 console.log(JSON.stringify({root:old.root,high,reason,date:clock.stamp(s),funds:s.world.funds,newResearch:completedNew.length,kataPrereq:frontier.filter(x=>x.complete).length,training:s.career.completed.map(t=>t.id),kata:kata.blockers}));
}
assert.equal(runs.length,8);
assert(runs.every(r=>r.career.completed.some(t=>t.id===FIRE)&&r.career.completed.some(t=>t.id===MIL)));
assert(runs.every(r=>r.completedNew.includes("STR_SOULSENSE")&&r.completedNew.includes("STR_SMG_SPIKED")));
assert(runs.some(r=>r.monthly.some(m=>m.month>=24)));
const out={schema:"ATLAS_FORWARD_GUN_KATA_FRONTIER_V4_15",normalizationComplete:false,actualGameCertified:false,scope:"Source-backed selected coupon outcomes and timed research, not expected RNG or native gameplay. New high-psi recruit replays V4.12 from birth; existing V4.14 low-psi recruit unchanged. Horizon extends through March 2603 with inherited conditional funding and exact modeled recruit salary. No extra funds, samples, research, or tactical growth granted.",inputs:{...Object.fromEntries(Object.entries(files).map(([k,p])=>[p,sha(bytes[k])])),[careerPath]:sha(careerBytes),[parentPath]:sha(parentBytes)},nativeBirth,rawSources,targets,extraPlan,runs,summary:{runs:runs.length,highBirth:runs.filter(r=>r.birthPsiStrength===42).length,kataCompleted:runs.filter(r=>r.reason==="KATA_TRAINED_AND_RECOVERED").length,extended:runs.filter(r=>r.monthly.some(m=>m.month>=24)).length,distinctNewResearch:new Set(runs.flatMap(r=>r.completedNew)).size}};
fs.writeFileSync("tools/data/overcap-forward-gun-kata-frontier-v4.json",JSON.stringify(out,null,2)+"\n");
console.log(JSON.stringify(out.summary));
