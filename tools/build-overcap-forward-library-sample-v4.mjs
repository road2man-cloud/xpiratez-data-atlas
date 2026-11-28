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


const KATA="STR_GUN_KATA_TRAINING",LIB="STR_LIBRARY",SCHOOL="STR_SCHOOLING_2",PACK="STR_WASTELANDER_BACKPACK_EX",VARMINT="STR_VARMINT_RIFLE",ADV="STR_HUNTING_RIFLE_ADV";
const parentPath="tools/data/overcap-forward-gun-kata-frontier-v4.json",parentBytes=fs.readFileSync(parentPath),parent=JSON.parse(parentBytes);
assert.equal(parent.schema,"ATLAS_FORWARD_GUN_KATA_FRONTIER_V4_15");
const libAnchor=rawBlock("Piratez.rul","  - type: STR_LIBRARY",b=>b.includes("buildCost: 1050000")&&b.includes("buildTime: 18")&&b.includes("monthlyCost: 40000")&&b.includes("labs: 1")&&b.includes("provideBaseFunc: [LIB]"));
economy.facilities[LIB]={monthlyCost:40000,labs:1,personnel:0,blockSha256:libAnchor.blockSha256};
rawSources.push(libAnchor,rawBlock("Piratez.rul","  - name: "+SCHOOL,b=>b.includes("cost: 200")&&b.includes("LIB")));
const eventId="STR_NOGREEN_YESRED_ROUNDUP",scriptId="STR_NOGREEN_YESRED_EVENTS";
const eventAnchor=rawBlock("Piratez_Events.rul","  - name: "+eventId,b=>b.includes("everyMultiItemList:")&&b.includes("STR_WASTELANDER_BACKPACK: 3")&&b.includes("STR_WASTELANDER_BACKPACK: 2")&&b.includes("timerRandom: 43400"));
const scriptAnchor=rawBlock("Piratez_Events.rul","  - type: "+scriptId+" #order absolute",b=>b.includes("STR_NOGREEN_YESRED_ROUNDUP: 100")&&b.includes("STR_CAPTAIN_YESRED_NOGREEN: true")&&b.includes("executionOdds: 25"));
const eventText=anchored(eventAnchor),scriptText=anchored(scriptAnchor);
assert(eventText.includes("STR_SLAVE: 2\n")&&eventText.includes("STR_SLAVE_MAID: 2")&&eventText.includes("STR_SLAVE: 1\n        STR_WASTELANDER_BACKPACK: 2"));
assert.equal([...scriptText.matchAll(/^        STR_\w+: (\d+)$/gm)].reduce((n,m)=>n+Number(m[1]),0),550);
const events=[{id:eventId,fixed:{STR_SLAVE:3,STR_SLAVE_MAID:2,STR_WASTELANDER_BACKPACK:5},pool:[],research:[],interrupt:null,points:0,funds:0,timer:60,timerRandom:43400,anchor:eventAnchor,selectedRandomMulti:0,deterministic:{STR_SLAVE:2,STR_SLAVE_MAID:2,STR_WASTELANDER_BACKPACK:3},randomMulti:{STR_SLAVE:1,STR_WASTELANDER_BACKPACK:2}}];
const scripts=[{id:scriptId,event:eventId,positive:["STR_CAPTAIN_YESRED_NOGREEN"],negative:[],firstMonth:0,lastMonth:-1,executionOdds:25,minScore:null,weight:100,totalWeight:550,anchor:scriptAnchor,weightsAnchor:scriptAnchor}];
for(const n of [3,4,5]){
 const id="STR_CAPTAINS_RANK_0"+n,source=data.eventResearchSources[id].find(e=>e.event===id).scripts.find(x=>x.script===id);
 const a=rawBlock("Piratez_Events.rul","  - name: "+id,b=>b.includes("researchList: ["+id+"]")&&b.includes("timerRandom: 1300"));
 const b=rawBlock("Piratez_Events.rul","  - type: "+id,x=>x.includes("minScore: "+source.otherConditions.minScore)&&x.includes("executionOdds: 100"));
 const scriptBody=anchored(b);
 assert(source.researchPositive.every(k=>scriptBody.includes(k+": true"))&&source.researchNegative.every(k=>scriptBody.includes(k+": false")));
 events.push({id,fixed:{},pool:[],research:[id],interrupt:null,points:0,funds:0,timer:60,timerRandom:1300,anchor:a});
 scripts.push({id,event:id,positive:source.researchPositive,negative:source.researchNegative,firstMonth:source.firstMonth,lastMonth:source.lastMonth??-1,executionOdds:source.executionOdds,minScore:source.otherConditions.minScore,weight:100,totalWeight:100,anchor:b,weightsAnchor:b});
}
for(const e of events)rawSources.push(e.anchor);for(const sc of scripts)rawSources.push(sc.anchor);
const source={...persuasionSource,events:[...persuasionSource.events,...events],scripts:[...persuasionSource.scripts,...scripts]};
const junk=data.forwardJunk.recipe, uranium="STR_NUCLEAR_MATERIALS",junkIndex=junk.outcomes.findIndex(o=>o.items[uranium]===1);
assert(junkIndex>=0&&junk.outcomes[junkIndex].weight>0);
rawSources.push(rawBlock("Piratez.rul","  - name: "+junk.id,b=>b.includes("time: "+junk.time)&&b.includes(uranium)),rawBlock("Piratez.rul","  - name: "+PACK,b=>b.includes(VARMINT)&&b.includes("STR_MEDICAL_SUPPLIES")&&b.includes("STR_GUNS_N_AMMO")));
const packPlan=[[PACK,VARMINT,1],[PACK,"STR_MEDICAL_SUPPLIES",3],[PACK,"STR_GUNS_N_AMMO",1],[PACK,"STR_ALIEN_ENTERTAINMENT",1]];
const targets=[VARMINT,ADV,"STR_MEDICAL_SUPPLIES","STR_MEDICINE","STR_GUNS_N_AMMO","STR_WORKSHOP","STR_ENGINEER_PLUS","STR_CRAFT_WEAPONS_SUMMARY","STR_WE_NEED_CRAFT_WEAPONS","STR_CRAFT_AUXILARY_SYSTEMS","STR_HIDEOUT_DETECTOR","STR_CONTACT_CAR_THIEVES","STR_CONTACT_DEALERS",SCHOOL,KATA];
const active=(s,id)=>s.world.researched.has(id)&&!s.world.disabled.has(id);
const encode=x=>JSON.parse(JSON.stringify(x,(k,v)=>v instanceof Set?{$set:[...v]}:v instanceof Map?{$map:[...v]}:v));
const runs=[];
for(const old of parent.runs.filter(r=>r.birthPsiStrength===42)){
 const s=JSON.parse(JSON.stringify(old.checkpoint.state),revive);
 assert.equal(exactStateHash(s.world),old.checkpoint.worldHash);
 assert.equal(sha(JSON.stringify(old.checkpoint.state)),old.checkpoint.fullStateHash);
 s.trace=[];
 const priorResearch=new Set(s.world.researched),priorMonths=s.monthlyLedger.length,startFunds=s.world.funds;
 const monthlyInput=Object.fromEntries(Array.from({length:9},(_,i)=>[25+i,{countryFunding:economy.fundingTarget,regionalNet:0,otherMaintenance:50000+s.career.salary}]));
 const rankSelections=[3,4,5].map(n=>["STR_CAPTAINS_RANK_0"+n,"STR_CAPTAINS_RANK_0"+n,null]);
 const extraMonthlySelections={25:[[scriptId,null,null],...rankSelections],26:rankSelections,27:rankSelections,28:rankSelections,29:rankSelections};
 const clock=createAdvancedCareerClock(data,{facilityFields,itemFields,manufactureFields,economy,monthlyInput,missionSource,bridgeSource,persuasionSource:source,captainSource,orderMode:"strict",hierarchyMode:"control",maxMonth:34,extraMonthlySelections,additionalRecipes:[PACK]});
 const startDate=clock.stamp(s),productions=[];
 let draws=0,packIndex=0,reason="HORIZON",selectionKey=null;
 for(let day=0;day<150;day++){
  try{
   clock.flush(s);
   const midnight=(s.elapsedHours+12)%24===0;
   if(midnight){
    if((s.world.items[uranium]||0)>0)clock.sell(s,uranium,s.world.items[uranium]);
    if(!s.industry.length){
     if(draws<3){clock.extract(s,junkIndex,s.engineers);draws++;}
     else if(packIndex<packPlan.length&&(s.world.items.STR_WASTELANDER_BACKPACK||0)>0){productions.push(clock.produce(s,...packPlan[packIndex]));packIndex++;}
    }
    if(!s.world.facilities.has(LIB)&&!s.construction.some(p=>p.id===LIB)&&s.world.funds>=data.forwardSupply.facilities[LIB].cost)clock.build(s,LIB);
   }
   if(active(s,SCHOOL)&&active(s,ADV)&&active(s,"STR_MEDICINE")&&packIndex===packPlan.length&&!s.industry.length){reason="LIBRARY_SCHOOLING_AND_SAMPLE_RESEARCH_COMPLETE";break;}
   const key=JSON.stringify([[...s.world.researched].sort(),[...s.world.disabled].sort(),[...s.world.baseFunctions].sort(),s.world.items,s.projects.map(p=>p.id),s.world.month,s.deliveryDue]);
   if(clock.available(s)>0&&key!==selectionKey){
    const choices=clock.options(s).filter(o=>o.action.type==="research"&&targets.includes(o.action.id)).map(o=>o.action.id).sort((a,b)=>targets.indexOf(a)-targets.indexOf(b));
    for(const id of choices){if(!clock.available(s))break;clock.begin(s,id,1,50);}
    selectionKey=key;
   }
   if(s.projects.length&&clock.available(s))clock.assign(s,s.projects[0].id,s.projects[0].assigned+clock.available(s));
   if(s.elapsedHours+24>=(Date.UTC(2603,5,1)-Date.UTC(2601,0,1,12))/3600000){reason="MAY_LIMIT";break;}
   clock.tick(s);
  }catch(e){reason=e.message;break;}
 }
 const monthly=s.monthlyLedger.slice(priorMonths),state=encode({...s,trace:undefined});
 const spend=s.trace.filter(t=>["careerTrainingStart","manufactureStart","constructionStart","purchaseOrder"].includes(t.type)).reduce((n,t)=>n+t.cost,0);
 const income=s.trace.filter(t=>t.type==="stockSale").reduce((n,t)=>n+t.income,0);
 assert.equal(startFunds+income-spend+monthly.reduce((n,r)=>n+r.countryFunding-r.maintenance+r.bonus,0),s.world.funds);
 assert(monthly.every(m=>m.otherMaintenance===52500));
 assert(s.trace.every((t,i)=>!i||t.elapsedHours>=s.trace[i-1].elapsedHours));
 const frontier=data.researchRules[KATA].dependencies.map(id=>({id,complete:active(s,id)}));
 const completedNew=[...s.world.researched].filter(k=>!priorResearch.has(k)).sort();
 const ranks=s.trace.filter(t=>t.type==="persuasionEventBlocked"&&/^STR_CAPTAINS_RANK_/.test(t.id));
 const report={root:old.root,sourceFullStateHash:old.checkpoint.fullStateHash,sourceWorldHash:old.checkpoint.worldHash,startDate,startFunds,date:clock.stamp(s),reason,funds:s.world.funds,draws,productions,income,spend,completedNew,frontier,library:s.world.facilities.has(LIB),schooling:active(s,SCHOOL),varmint:active(s,VARMINT),huntingAdvanced:active(s,ADV),medicine:active(s,"STR_MEDICINE"),ranks,kata:clock.verdict(s,KATA),snapshot:clock.snapshot(s),monthly,checkpoint:{worldHash:exactStateHash(s.world),fullStateHash:sha(JSON.stringify(state)),state},trace:s.trace.filter(t=>t.type!=="researchDay"||t.projects.length)};
 runs.push(report);
 console.log(JSON.stringify({root:old.root,reason,date:report.date,funds:report.funds,draws,income,library:report.library,schooling:report.schooling,varmint:report.varmint,huntingAdvanced:report.huntingAdvanced,medicine:report.medicine,completedNew,frontier:frontier.filter(x=>x.complete).length}));
}
assert.equal(runs.length,4);
const out={schema:"ATLAS_FORWARD_LIBRARY_SAMPLE_CONTINUATION_V4_16",actualGameCertified:false,normalizationComplete:false,scope:"Conditional continuation of high-psi V4.15 paths. Selected three rare junk draws, selected monthly roundup event with first randomMulti outcome and backpack outcomes; no injected cash, items or score. Storage capacity and global scheduler remain inherited conditional assumptions.",inputs:{...Object.fromEntries(Object.entries(files).map(([k,p])=>[p,sha(bytes[k])])),[parentPath]:sha(parentBytes)},rawSources,events,scripts,junkOutcome:{index:junkIndex,weight:junk.outcomes[junkIndex].weight,totalWeight:junk.totalWeight,selectedDraws:3},packPlan,targets,runs,summary:{runs:runs.length,libraries:runs.filter(r=>r.library).length,schooling:runs.filter(r=>r.schooling).length,huntingAdvanced:runs.filter(r=>r.huntingAdvanced).length,medicine:runs.filter(r=>r.medicine).length,distinctNewResearch:new Set(runs.flatMap(r=>r.completedNew)).size}};
fs.writeFileSync("tools/data/overcap-forward-library-sample-v4.json",JSON.stringify(out,null,2)+"\n");
console.log(JSON.stringify(out.summary));
