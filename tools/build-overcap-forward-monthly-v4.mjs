import fs from "node:fs";
import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {createHash} from "node:crypto";
import {createMonthlyClock} from "./atlas-overcap-forward-clock-v4-monthly.mjs";
import {exactStateHash} from "./origin-pair-exact-prefix-checkpoint.mjs";
const sha=b=>createHash("sha256").update(b).digest("hex");
const files={data:"public/data/soldiers-modern-index.json",forwardSupply:"tools/data/overcap-forward-supply-catalog-v2.json",forwardStartingBase:"tools/data/overcap-forward-starting-base-v3.json",forwardJunk:"tools/data/overcap-forward-junk-extraction-v3.json",facilities:"public/data/facilities-v2-index.json",items:"public/data/items-v2-index.json",manufacture:"public/data/manufacture-v2-index.json",score:"tools/data/overcap-forward-score-sources-v3.json",prior:"tools/data/overcap-forward-industry-v4.json"};
const bytes=Object.fromEntries(Object.entries(files).map(([k,p])=>[k,fs.existsSync(p)?fs.readFileSync(p):execFileSync("git",["show","HEAD:"+p],{maxBuffer:80*1024*1024})]));
const data=JSON.parse(bytes.data);for(const k of ["forwardSupply","forwardStartingBase","forwardJunk"])data[k]=JSON.parse(bytes[k]);
const facilities=JSON.parse(bytes.facilities),items=JSON.parse(bytes.items),manufacture=JSON.parse(bytes.manufacture),score=JSON.parse(bytes.score),prior=JSON.parse(bytes.prior);
assert.equal(score.sourceMetadataSha256,data.meta.source.metadataSha256);
for(const d of [facilities,items,manufacture])assert.equal(d.meta.sourceVersion,"v.o2");
const facilityFields=Object.fromEntries(facilities.facilities.map(x=>[x.id,x.fields])),itemFields=Object.fromEntries(items.items.map(x=>[x.id,x.fields])),manufactureFields=Object.fromEntries(manufacture.entries.map(x=>[x.id,x.fields]));
const rulesDir=process.env.XPZ_RULES_DIR||"C:/Dioxine_XPiratez_o2.1/Dioxine_XPiratez/user/mods/Piratez/Ruleset";
const ruleBytes=fs.readFileSync(rulesDir+"/Piratez.rul"),globalBytes=fs.readFileSync(rulesDir+"/Piratez_Globals.rul");
const source=ruleBytes.toString("utf8").replace(/\r/g,""),globals=globalBytes.toString("utf8").replace(/\r/g,"");
function section(name){
 const re=new RegExp("^"+name+":\\s*$","m"),m=re.exec(source);assert(m,"section:"+name);const text=source.slice(m.index),z=text.slice(name.length+2).search(/\n[^\s#][^\n]*:/);
 return z<0?text:text.slice(0,name.length+2+z);
}
function block(sectionName,id){
 const sec=section(sectionName),lines=sec.split("\n"),i=lines.findIndex(l=>l==="  - type: "+id);assert(i>=0,sectionName+":"+id);
 let end=i+1;while(end<lines.length&&!/^  - /.test(lines[end]))end++;
 const text=lines.slice(i,end).join("\n");
 return {text,sha256:sha(text),startLine:source.slice(0,source.indexOf(sec)).split("\n").length+i};
}
function field(text,key,fallback){
 const hits=[...text.matchAll(new RegExp("^    "+key+":\\s*(-?\\d+)\\s*$","gm"))];assert(hits.length<=1,key);
 if(hits.length)return Number(hits[0][1]);assert(fallback!==undefined,"missing "+key);return fallback;
}
function globalInt(key){const m=globals.match(new RegExp("^"+key+":\\s*(-?\\d+)\\s*$","m"));assert(m,key);return Number(m[1]);}
const economy={facilities:{},craftRent:{},craftAnchors:{},research:score.research,thresholds:JSON.parse(globals.match(/^  monthlyRatingThresholds: (\[.*\])$/m)[1]),scientistSalary:globalInt("costScientist"),engineerSalary:globalInt("costEngineer"),defeatFunds:globalInt("defeatFunds"),performanceFactor:globalInt("performanceBonusFactor"),fundingTarget:globalInt("initialFunding")*1000};
for(const id of new Set([...data.forwardStartingBase.facilities.map(f=>f.id),"STR_PERSONAL_LABS"])){
 const b=block("facilities",id);economy.facilities[id]={monthlyCost:field(b.text,"monthlyCost"),labs:field(b.text,"labs",0),personnel:field(b.text,"personnel",0),sourceLine:b.startLine,blockSha256:b.sha256};
}
for(const c of data.forwardStartingBase.crafts){const b=block("crafts",c.type);economy.craftRent[c.type]=field(b.text,"costRent");economy.craftAnchors[c.type]={sourceLine:b.startLine,blockSha256:b.sha256};}
const baseLab=data.forwardStartingBase.facilities.reduce((n,f)=>n+economy.facilities[f.id].labs,0),quarters=data.forwardStartingBase.facilities.reduce((n,f)=>n+economy.facilities[f.id].personnel,0);
assert.equal(baseLab,12);assert.equal(quarters,50);
const revive=(k,v)=>v&&typeof v==="object"&&Object.keys(v).length===1&&Array.isArray(v.$set)?new Set(v.$set):v&&typeof v==="object"&&Object.keys(v).length===1&&Array.isArray(v.$map)?new Map(v.$map):v;
const scenarios=[
 {id:"zero_activity",countryFunding:economy.fundingTarget,regionalNet:0,otherMaintenance:50000,previousRating:0,priorDebtWarning:false},
 {id:"positive_activity",countryFunding:economy.fundingTarget,regionalNet:2000,otherMaintenance:50000,previousRating:0,priorDebtWarning:false},
 {id:"negative_activity",countryFunding:economy.fundingTarget,regionalNet:-1000,otherMaintenance:50000,previousRating:0,priorDebtWarning:false}
];
const runs=[];
for(const old of prior.runs)for(const input of scenarios){
 const s=JSON.parse(JSON.stringify(old.checkpoint.state),revive);assert.equal(exactStateHash(s.world),old.checkpoint.worldHash);
 s.trace=[];s.labCapacity=baseLab;s.quarters=quarters;
 const clock=createMonthlyClock(data,{facilityFields,itemFields,manufactureFields,economy,monthlyInput:input,labCapacity:baseLab,quarters});
 const startDate=clock.stamp(s),startFunds=s.world.funds;
 let reason="FEBRUARY_LIMIT";
 const target=["STR_WAT_DO","STR_JACKSTOWN_SCOUTING","STR_INSPECT_MACHINERY","STR_PIRATE_STYLE","STR_KULTUR","STR_HARDWARE_SHOPPING","STR_WEIRDNESS","STR_SCHOOLING_1","STR_SCI_REP","STR_SC_WIRE","STR_PERSONAL_LABS","STR_ELERIUM_115"];
 try{
  for(let i=0;i<42;i++){
   clock.flush(s);
   if(s.world.researched.has("STR_ELERIUM_115")){reason="ELERIUM_RESEARCH_COMPLETED";break;}
   // Preserve the earlier route. Do not manufacture additional rare outcomes.
   if(s.world.researched.has("STR_PERSONAL_LABS")&&!s.world.facilities.has("STR_PERSONAL_LABS")&&!s.construction.length&&s.world.funds>=data.forwardSupply.facilities.STR_PERSONAL_LABS.cost)clock.build(s,"STR_PERSONAL_LABS");
   const eligible=clock.options(s).filter(o=>o.action.type==="research"&&target.includes(o.action.id)).map(o=>o.action.id).sort((a,b)=>target.indexOf(a)-target.indexOf(b));
   for(const id of eligible){if(!clock.available(s))break;clock.begin(s,id,1,old.roll);}
   if(s.projects.length&&clock.available(s))clock.assign(s,s.projects[0].id,s.projects[0].assigned+clock.available(s));
   clock.tick(s);
  }
 }catch(e){reason=e.message;}
 const rows=s.monthlyLedger||[],spend=s.trace.filter(t=>["constructionStart","purchaseOrder","hireOrder","manufactureStart"].includes(t.type)).reduce((n,t)=>n+t.cost,0);
 assert.equal(startFunds+rows.reduce((n,r)=>n+r.countryFunding-r.maintenance+r.bonus,0)-spend,s.world.funds);
 assert(s.trace.every((t,i)=>!i||t.elapsedHours>=s.trace[i-1].elapsedHours));
 if(s.world.researched.has("STR_ELERIUM_115"))assert(s.world.facilities.has("STR_PERSONAL_LABS")&&s.world.baseFunctions.has("STUDY"));
 runs.push({root:old.root,mode:old.mode,roll:old.roll,input:input.id,startDate,startFunds,reason,date:clock.stamp(s),funds:s.world.funds,monthlyLedger:rows,research:[...s.world.researched].sort(),facilities:[...s.world.facilities].sort(),construction:s.construction,projects:s.projects,labCapacity:s.labCapacity,quarters:s.quarters,eleriumStock:s.world.items.STR_ELERIUM_115,checkpoint:{worldHash:exactStateHash(s.world),state:JSON.parse(JSON.stringify({...s,trace:undefined},(k,v)=>v instanceof Set?{$set:[...v]}:v instanceof Map?{$map:[...v]}:v))},trace:s.trace});
}
const {research,...economySummary}=economy;
const fundingThresholds=runs.filter(r=>r.input==="zero_activity"&&r.mode==="routine"&&r.monthlyLedger.length).map(r=>{const m=r.monthlyLedger[0],cost=data.forwardSupply.facilities.STR_PERSONAL_LABS.cost,preBonus=m.before+m.countryFunding-m.maintenance,neededBonus=Math.max(0,cost-preBonus),neededRating=Math.ceil(neededBonus/economy.performanceFactor);return {root:r.root,roll:r.roll,openingFunds:m.before,researchPoints:m.researchPoints,maintenance:m.maintenance,preBonus,buildCost:cost,neededBonus,neededRating,minimumRegionalNet:neededRating-m.researchPoints,scope:"Conditional arithmetic threshold; no claim that the required activity is achievable."};});
const out={schema:"ATLAS_FORWARD_MONTHLY_V4_4",actualGameCertified:false,normalizationComplete:false,scope:"Conditional first monthly settlement only. Country funding is the target, regional net and other maintenance are scenario inputs, not verified mission results. Research points sum model flags, not native-award certification. No event scheduler, country funding adjustment or actual mission proof. February-only continuation; second boundary blocked.",inputs:Object.fromEntries(Object.entries(files).map(([k,p])=>[p,sha(bytes[k])])),rawSources:{"Piratez.rul":sha(ruleBytes),"Piratez_Globals.rul":sha(globalBytes)},economy:economySummary,initialCapacities:{lab:baseLab,quarters},fundingThresholds,scenarios,runs};
assert(runs.some(r=>r.reason==="ELERIUM_RESEARCH_COMPLETED"),"No February research continuation");
for(const r of runs.filter(r=>r.reason==="ELERIUM_RESEARCH_COMPLETED")){const complete=r.trace.find(t=>t.type==="constructionComplete"&&t.id==="STR_PERSONAL_LABS"),sample=r.trace.find(t=>t.type==="researchSettlement"&&t.id==="STR_ELERIUM_115");assert(complete&&sample&&sample.elapsedHours>complete.elapsedHours&&sample.consumed&&sample.stock===4&&r.labCapacity===16);}
assert(runs.every(r=>r.monthlyLedger.length===1),"Missing conditional month settlement");
assert(runs.some(r=>r.mode==="routine"&&r.construction.length),"No nonrare conditional funding route");
fs.writeFileSync("tools/data/overcap-forward-monthly-v4.json",JSON.stringify(out,null,2)+"\n");
console.log(JSON.stringify({runs:runs.length,settled:runs.filter(r=>r.monthlyLedger.length).length,elerium:runs.filter(r=>r.reason==="ELERIUM_RESEARCH_COMPLETED").length,lab:runs.filter(r=>r.facilities.includes("STR_PERSONAL_LABS")).length,routineStarted:runs.filter(r=>r.mode==="routine"&&r.construction.length).length,baseUpkeep:data.forwardStartingBase.facilities.reduce((n,f)=>n+economy.facilities[f.id].monthlyCost,0),examples:runs.filter(r=>r.root==="STR_WAT_DO"&&r.roll===50).map(r=>({mode:r.mode,input:r.input,reason:r.reason,date:r.date,funds:r.funds,monthlyLedger:r.monthlyLedger,remaining:r.construction.map(p=>p.remainingDays),elerium:r.eleriumStock}))},null,2));
