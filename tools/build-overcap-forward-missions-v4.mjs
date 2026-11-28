import fs from "node:fs";
import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {createHash} from "node:crypto";
import {createMissionClock} from "./atlas-overcap-forward-clock-v4-missions.mjs";
import {exactStateHash} from "./origin-pair-exact-prefix-checkpoint.mjs";
const sha=b=>createHash("sha256").update(b).digest("hex");
const files={data:"public/data/soldiers-modern-index.json",forwardSupply:"tools/data/overcap-forward-supply-catalog-v2.json",forwardStartingBase:"tools/data/overcap-forward-starting-base-v3.json",forwardJunk:"tools/data/overcap-forward-junk-extraction-v3.json",facilities:"public/data/facilities-v2-index.json",items:"public/data/items-v2-index.json",manufacture:"public/data/manufacture-v2-index.json",score:"tools/data/overcap-forward-score-sources-v3.json",economy:"tools/data/overcap-forward-monthly-v4.json",prior:"tools/data/overcap-forward-multimonth-v4.json",missions:"tools/data/overcap-forward-electronics-mission-sources-v3.json"};
const bytes=Object.fromEntries(Object.entries(files).map(([k,p])=>[k,fs.existsSync(p)?fs.readFileSync(p):execFileSync("git",["show","HEAD:"+p],{maxBuffer:80*1024*1024})]));
const data=JSON.parse(bytes.data);for(const k of ["forwardSupply","forwardStartingBase","forwardJunk"])data[k]=JSON.parse(bytes[k]);
const facilities=JSON.parse(bytes.facilities),items=JSON.parse(bytes.items),manufacture=JSON.parse(bytes.manufacture),score=JSON.parse(bytes.score),prior=JSON.parse(bytes.prior),missionSource=JSON.parse(bytes.missions);
assert.equal(prior.schema,"ATLAS_FORWARD_MULTIMONTH_V4_5");
assert.equal(missionSource.sourceMetadataSha256,data.meta.source.metadataSha256);
const economy={...JSON.parse(bytes.economy).economy,research:score.research,event:prior.event};
const facilityFields=Object.fromEntries(facilities.facilities.map(x=>[x.id,x.fields])),itemFields=Object.fromEntries(items.items.map(x=>[x.id,x.fields])),manufactureFields=Object.fromEntries(manufacture.entries.map(x=>[x.id,x.fields]));
const rulesDir=process.env.XPZ_RULES_DIR||"C:/Dioxine_XPiratez_o2.1/Dioxine_XPiratez/user/mods/Piratez/Ruleset",sourceCache=new Map();
function anchored(a){
 if(!sourceCache.has(a.file)){const b=fs.readFileSync(rulesDir+"/"+a.file);sourceCache.set(a.file,{sha:sha(b),lines:b.toString("utf8").split(/\r?\n/)});}
 const b=sourceCache.get(a.file);assert.equal(b.sha,a.sha256);
 const txt=b.lines.slice(a.startLine-1,a.endLine).join("\n");
 return txt;
}
const missionTiming={};
for(const [i,m] of missionSource.missions.entries()){
 const script=anchored(m.route.anchors.missionScript),dep=anchored(m.route.anchors.deployment);
 const startDelay=Number(script.match(/^    startDelay: (\d+)$/m)?.[1]),randomDelay=Number(script.match(/^    randomDelay: (\d+)$/m)?.[1]);
 const dur=dep.match(/^    duration: \[(\d+), (\d+)\]$/m);assert(startDelay===1000&&randomDelay===40000&&dur);
 missionTiming[m.id]={startDelay,randomDelay,durationMin:Number(dur[1]),durationMax:Number(dur[2]),selectedDelay:i===0?1050:2490,source:m.route.anchors.missionScript,deploymentSource:m.route.anchors.deployment,conditional:"RNG delay and minimum duration, eligible site location, arrival after 6 hours, return after another 6 hours. Actual coordinates, craft/roster, combat and recovery not certified."};
}
const revive=(k,v)=>v&&typeof v==="object"&&Object.keys(v).length===1&&Array.isArray(v.$set)?new Set(v.$set):v&&typeof v==="object"&&Object.keys(v).length===1&&Array.isArray(v.$map)?new Map(v.$map):v;
const inputs={4:{countryFunding:economy.fundingTarget,regionalNet:0,otherMaintenance:50000},5:{countryFunding:economy.fundingTarget,regionalNet:0,otherMaintenance:50000}};
const targets=["STR_PADD","STR_WASTELANDER_BACKPACK","STR_ACADEMY_CORPSE","STR_GOVT_CORPSE","STR_STUN_BATON","STR_BASIC_ELECTRONICS"];
const runs=[];
for(const old of prior.runs.filter(r=>!r.eventScenario))for(const mode of ["expire","recover"]){
 const s=JSON.parse(JSON.stringify(old.checkpoint.state),revive);assert.equal(exactStateHash(s.world),old.checkpoint.worldHash);
 s.trace=[];s.missionQueue=[];s.missionReceipts=[];const clock=createMissionClock(data,{facilityFields,itemFields,manufactureFields,economy,monthlyInput:inputs,missionSource,missionTiming,missionMode:mode});
 const startFunds=s.world.funds,startDate=clock.stamp(s);let reason="JUNE_LIMIT",lastSelectionKey=null,goalDate=null;
 console.log("Producing",old.root,mode);
 try{
  for(let i=0;i<65;i++){
   clock.flush(s);
   if(mode==="expire"&&s.world.month>=4&&!s.missionQueue.length){reason="SITES_EXPIRED";goalDate??=clock.stamp(s);}
   if(mode==="recover"&&s.world.researched.has("STR_BASIC_ELECTRONICS")){reason="BASIC_ELECTRONICS_COMPLETED";goalDate??=clock.stamp(s);}
   if(goalDate&&s.world.month>=5)break;
   if(mode==="recover"&&s.world.researched.has("STR_WASTELANDER_BACKPACK")&&(s.world.items.STR_WASTELANDER_BACKPACK||0)>0&&!s.industry.length&&!s.industryFinished.some(p=>p.id===missionSource.recipe.id))clock.extractBackpack(s);
   const selectionKey=JSON.stringify([[...s.world.researched].sort(),[...s.world.disabled].sort(),[...s.world.baseFunctions].sort(),s.world.items,s.projects.map(p=>p.id),s.world.month,s.deliveryDue]);
   if(clock.available(s)>0&&selectionKey!==lastSelectionKey){
    const eligible=clock.options(s).filter(o=>o.action.type==="research"&&targets.includes(o.action.id)).map(o=>o.action.id).sort((a,b)=>targets.indexOf(a)-targets.indexOf(b));
    for(const id of eligible){if(!clock.available(s))break;clock.begin(s,id,1,old.roll);}
    lastSelectionKey=selectionKey;
   }
   if(s.projects.length&&clock.available(s))clock.assign(s,s.projects[0].id,s.projects[0].assigned+clock.available(s));
   clock.tick(s);
  }
 }catch(e){reason=e.message;}
 const additional=s.monthlyLedger.slice(old.monthlyLedger.length),spend=s.trace.filter(t=>["constructionStart","purchaseOrder","hireOrder","manufactureStart"].includes(t.type)).reduce((n,t)=>n+t.cost,0);
 assert.equal(startFunds+additional.reduce((n,r)=>n+r.countryFunding-r.maintenance+r.bonus,0)-spend,s.world.funds);
 assert(s.trace.every((t,i)=>!i||t.elapsedHours>=s.trace[i-1].elapsedHours));
 const recovery=s.trace.filter(t=>t.type==="missionRecovery"),expired=s.trace.filter(t=>t.type==="missionExpired"),pack=s.industryFinished.filter(p=>p.id===missionSource.recipe.id);
 if(mode==="expire")assert(!recovery.length&&!pack.length&&!s.world.researched.has("STR_BASIC_ELECTRONICS"));
 if(reason==="BASIC_ELECTRONICS_COMPLETED"){
  assert.equal(recovery.length,2);assert.equal(pack.length,1);assert.equal(pack[0].completed-pack[0].started,1);
  assert(data.researchRules.STR_BASIC_ELECTRONICS.dependencies.every(id=>s.world.researched.has(id)));
  const lab=s.trace.find(t=>t.type==="researchSettlement"&&t.id==="STR_BASIC_ELECTRONICS");
  for(const r of recovery)assert(r.returned<lab.elapsedHours&&r.combatScore===null);
 }
 runs.push({root:old.root,mode,startDate,startFunds,reason,goalDate,date:clock.stamp(s),funds:s.world.funds,monthlyLedger:s.monthlyLedger,missionReceipts:s.missionReceipts,missionQueue:s.missionQueue,expired:expired.map(t=>t.id),pack,completedNew:[...s.world.researched].filter(id=>!old.research.includes(id)).sort(),research:[...s.world.researched].sort(),checkpoint:{worldHash:exactStateHash(s.world),state:JSON.parse(JSON.stringify({...s,trace:undefined},(k,v)=>v instanceof Set?{$set:[...v]}:v instanceof Map?{$map:[...v]}:v))},trace:s.trace.filter(t=>t.type!=="researchDay"||t.projects.length)});
}
const monthlyComparison=runs.filter(r=>r.mode==="recover"&&r.reason==="BASIC_ELECTRONICS_COMPLETED").map(r=>{const control=runs.find(x=>x.root===r.root&&x.mode==="expire"),a=r.monthlyLedger.find(m=>m.month===5),b=control?.monthlyLedger.find(m=>m.month===5);assert(a&&b,"June comparison missing");return {root:r.root,goalDate:r.goalDate,researchPointsWithRecovery:a.researchPoints,researchPointsWithoutRecovery:b.researchPoints,bonusDifference:a.bonus-b.bonus,closingFundsWithRecovery:a.after,closingFundsWithoutRecovery:b.after,combatScore:null,scope:"Model research flag credit only; not a measured combat score."};});
const out={schema:"ATLAS_FORWARD_TIMED_MISSIONS_V4_6",actualGameCertified:false,normalizationComplete:false,scope:"Source-bound conditional mission selections, arrival, victory and partial loot recovery; compare expiry path. No actual combat score, mission geography, craft fuel/travel or roster validation. Earlier V4.5 financial/activity assumptions remain; no arbitrary combat credit. No full tactical debrief or full mission scheduler. Selected weighted loot and extraction outcomes are conditional, not guaranteed.",inputs:Object.fromEntries(Object.entries(files).map(([k,p])=>[p,sha(bytes[k])])),rawSources:Object.fromEntries([...sourceCache].map(([k,v])=>[k,v.sha])),engineSha256:sha(fs.readFileSync("tools/atlas-overcap-forward-clock-v4-missions.mjs","utf8").replace(/\r\n/g,"\n")),missionTiming,targets,inputsByMonth:inputs,monthlyComparison,runs};
fs.writeFileSync("tools/data/overcap-forward-missions-v4.json",JSON.stringify(out,null,2)+"\n");
console.log(JSON.stringify({monthlyComparison,runs:runs.length,electronics:runs.filter(r=>r.reason==="BASIC_ELECTRONICS_COMPLETED").length,recoveries:runs.reduce((n,r)=>n+r.missionReceipts.length,0),expired:runs.reduce((n,r)=>n+r.expired.length,0),pack:runs.reduce((n,r)=>n+r.pack.length,0),examples:runs.map(r=>({root:r.root,mode:r.mode,reason:r.reason,date:r.date,funds:r.funds,receipts:r.missionReceipts.length,expired:r.expired,new:r.completedNew}))},null,2));
