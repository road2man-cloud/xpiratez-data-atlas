import fs from "node:fs";
import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {createHash} from "node:crypto";
import {createMultiMonthClock} from "./atlas-overcap-forward-clock-v4-multimonth.mjs";
import {exactStateHash} from "./origin-pair-exact-prefix-checkpoint.mjs";
const sha=b=>createHash("sha256").update(b).digest("hex");
const files={data:"public/data/soldiers-modern-index.json",forwardSupply:"tools/data/overcap-forward-supply-catalog-v2.json",forwardStartingBase:"tools/data/overcap-forward-starting-base-v3.json",forwardJunk:"tools/data/overcap-forward-junk-extraction-v3.json",facilities:"public/data/facilities-v2-index.json",items:"public/data/items-v2-index.json",manufacture:"public/data/manufacture-v2-index.json",score:"tools/data/overcap-forward-score-sources-v3.json",jan:"tools/data/overcap-forward-industry-v4.json",prior:"tools/data/overcap-forward-monthly-v4.json"};
const bytes=Object.fromEntries(Object.entries(files).map(([k,p])=>[k,fs.existsSync(p)?fs.readFileSync(p):execFileSync("git",["show","HEAD:"+p],{maxBuffer:80*1024*1024})]));
const data=JSON.parse(bytes.data);for(const k of ["forwardSupply","forwardStartingBase","forwardJunk"])data[k]=JSON.parse(bytes[k]);
const facilities=JSON.parse(bytes.facilities),items=JSON.parse(bytes.items),manufacture=JSON.parse(bytes.manufacture),score=JSON.parse(bytes.score),jan=JSON.parse(bytes.jan),prior=JSON.parse(bytes.prior);
assert.equal(score.sourceMetadataSha256,data.meta.source.metadataSha256);
assert.equal(prior.schema,"ATLAS_FORWARD_MONTHLY_V4_4");assert.equal(jan.schema,"ATLAS_FORWARD_INDUSTRY_V4_3");
const facilityFields=Object.fromEntries(facilities.facilities.map(x=>[x.id,x.fields])),itemFields=Object.fromEntries(items.items.map(x=>[x.id,x.fields])),manufactureFields=Object.fromEntries(manufacture.entries.map(x=>[x.id,x.fields]));
const eventId="STR_DRINKING_BINGE",scriptId="STR_DRINKING_BINGE_1",sourceEvent=data.forwardSupply.events[eventId],script=sourceEvent.scripts.find(s=>s.script===scriptId);
assert(script&&script.mode==="weighted"&&script.firstMonth===0&&script.lastMonth==null&&script.executionOdds===6);
for(const [k,v] of Object.entries(script))if(Array.isArray(v)&&k!=="monthWeights")assert.equal(v.length,0,"Unmodeled event trigger "+k);
assert.equal(Object.keys(script.otherConditions).length,0);assert.deepEqual(script.monthWeights,[{month:0,weight:100,totalWeight:100}]);assert.equal(sourceEvent.research.length,0);
const rawEvent=fs.readFileSync((process.env.XPZ_RULES_DIR||"C:/Dioxine_XPiratez_o2.1/Dioxine_XPiratez/user/mods/Piratez/Ruleset")+"/Piratez_Events.rul");
assert.equal(sha(rawEvent),score.events[eventId].anchor.sha256);
const eventText=rawEvent.toString("utf8").replace(/\r/g,""),eventStart=eventText.indexOf("  - name: "+eventId+"\n");assert(eventStart>=0);
const eventBlock=eventText.slice(eventStart).split(/\n  - /)[0];
const field=(key)=>Number(eventBlock.match(new RegExp("^    "+key+": (\\d+)$","m"))?.[1]);
assert.equal(field("points"),sourceEvent.points);assert.equal(field("timer"),60);assert.equal(field("timerRandom"),43400);
assert.deepEqual([...eventBlock.matchAll(/^    ([A-Za-z]+):/gm)].map(m=>m[1]).sort(),["background","description","everyItemList","points","timer","timerRandom"].sort());
const event={id:eventId,script:scriptId,firstMonth:script.firstMonth,executionOdds:script.executionOdds,weight:100,totalWeight:100,points:sourceEvent.points,funds:sourceEvent.funds,items:sourceEvent.fixed,timer:field("timer"),timerRandom:field("timerRandom"),source:score.events[eventId].anchor,scope:"Selected repeatable weighted event only; conditional execution roll and timer. Other scripts not simulated; one-hour item delivery option assumed."};
const economy={...prior.economy,research:score.research,event};
const revive=(k,v)=>v&&typeof v==="object"&&Object.keys(v).length===1&&Array.isArray(v.$set)?new Set(v.$set):v&&typeof v==="object"&&Object.keys(v).length===1&&Array.isArray(v.$map)?new Map(v.$map):v;
const inputs={2:{countryFunding:economy.fundingTarget,regionalNet:0,otherMaintenance:50000},3:{countryFunding:economy.fundingTarget,regionalNet:0,otherMaintenance:50000}};
const targets=["STR_WAT_DO","STR_JACKSTOWN_SCOUTING","STR_INSPECT_MACHINERY","STR_PIRATE_STYLE","STR_KULTUR","STR_HARDWARE_SHOPPING","STR_WEIRDNESS","STR_SCHOOLING_1","STR_SCI_REP","STR_SC_WIRE","STR_PERSONAL_LABS","STR_ELERIUM_115","STR_CUNNING","STR_GUN_SHOPPING","STR_THE_PHARMACIST","STR_CONTACT_GENERAL_SUPPLIES","STR_BASIC_ELECTRONICS","STR_SC_WIRE_USE","STR_SCHOOLING_2","STR_EXPLORE_TUNNELS","STR_CONTACT_BUILDERS","STR_CONTACT_CAR_THIEVES","STR_CONTACT_SHIP_JUNKYARD","STR_MENACING_HULL","STR_QUESTION_OF_DRILL","STR_EMBRACE_THE_POWER"];
const runs=[];
const selected=prior.runs.filter(r=>r.mode==="routine"&&r.roll===50&&r.input==="positive_activity");
for(const old of selected)for(const selectedEvent of [false,true]){
 const s=JSON.parse(JSON.stringify(old.checkpoint.state),revive);assert.equal(exactStateHash(s.world),old.checkpoint.worldHash);
 const initial=jan.runs.find(r=>r.root===old.root&&r.mode===old.mode&&r.roll===old.roll);assert(initial);
 const january=new Set(initial.research),february=new Set();let settled=false;
 for(const t of old.trace){if(t.type==="monthlySettlement"){settled=true;continue;}for(const id of t.added||[]){if(!settled)january.add(id);else if(!january.has(id))february.add(id);}}
 assert.equal([...january].reduce((n,id)=>n+score.research[id].points,0),old.monthlyLedger[0].researchPoints);
 assert([...s.world.researched].every(id=>january.has(id)||february.has(id)),"Missing prefix score provenance");
 s.awardedResearch=new Set([...january,...february]);s.monthResearchIds=[...february];s.monthEventPoints=0;s.eventQueue=[];s.monthlyLedger[0].month=1;s.monthlyLedger[0].researchIds=[...january];s.trace=[];
 const clock=createMultiMonthClock(data,{facilityFields,itemFields,manufactureFields,economy,monthlyInput:inputs,eventScenario:selectedEvent});
 const startDate=clock.stamp(s),startFunds=s.world.funds;let reason="APRIL_LIMIT",lastSelectionKey=null;
 console.log("Producing",old.root,selectedEvent);
 try{
  for(let i=0;i<75;i++){
   clock.flush(s);
   if(s.world.researched.has("STR_PERSONAL_LABS")&&!s.world.facilities.has("STR_PERSONAL_LABS")&&!s.construction.length&&s.world.funds>=data.forwardSupply.facilities.STR_PERSONAL_LABS.cost)clock.build(s,"STR_PERSONAL_LABS");
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
 const rows=s.monthlyLedger,additional=rows.slice(1),spend=s.trace.filter(t=>["constructionStart","purchaseOrder","hireOrder","manufactureStart"].includes(t.type)).reduce((n,t)=>n+t.cost,0),eventFunds=s.trace.filter(t=>t.type==="eventResolved").reduce((n,t)=>n+t.funds,0);
 assert.equal(startFunds+additional.reduce((n,r)=>n+r.countryFunding-r.maintenance+r.bonus,0)+eventFunds-spend,s.world.funds,"Cash reconciliation");
 const credited=new Set();for(const row of rows)for(const id of row.researchIds){assert(!credited.has(id),"Research credited twice "+id);credited.add(id);}
 assert(s.trace.every((t,i)=>!i||t.elapsedHours>=s.trace[i-1].elapsedHours),"Nonmonotonic trace");
 const resolved=s.trace.filter(t=>t.type==="eventResolved");if(resolved.length){assert.equal(resolved.length,1);assert.equal(resolved[0].due,resolved[0].elapsedHours);assert.equal(rows[1].eventPoints,0);if(rows[2])assert.equal(rows[2].eventPoints,125);}
 runs.push({root:old.root,mode:old.mode,roll:old.roll,input:old.input,eventScenario:selectedEvent,startDate,startFunds,reason,date:clock.stamp(s),funds:s.world.funds,monthlyLedger:rows,completedNew:[...s.world.researched].filter(id=>!old.research.includes(id)).sort(),research:[...s.world.researched].sort(),facilities:[...s.world.facilities].sort(),construction:s.construction,projects:s.projects,eleriumStock:s.world.items.STR_ELERIUM_115,eventResolved:resolved.length,eventQueue:s.eventQueue,checkpoint:{worldHash:exactStateHash(s.world),state:JSON.parse(JSON.stringify({...s,trace:undefined},(k,v)=>v instanceof Set?{$set:[...v]}:v instanceof Map?{$map:[...v]}:v))},trace:s.trace.filter(t=>t.type!=="researchDay"||t.projects.length)});
}
const out={schema:"ATLAS_FORWARD_MULTIMONTH_V4_5",actualGameCertified:false,normalizationComplete:false,scope:"Conditional March/April continuation of V4.4. January funding/activity assumptions preserved; later regional net zero scenario, funding target and residual maintenance conditional. Explicitly selected one source event only; no combat, full event scheduler, country changes or actual initial setup deduction. Research points from model flags, first-discovery only.",inputs:Object.fromEntries(Object.entries(files).map(([k,p])=>[p,sha(bytes[k])])),rawEventSha256:sha(rawEvent),engineSha256:sha(fs.readFileSync("tools/atlas-overcap-forward-clock-v4-multimonth.mjs","utf8").replace(/\r\n/g,"\n")),event,inputsByMonth:inputs,targets,runs};
assert(runs.some(r=>r.eventResolved===1&&r.monthlyLedger.length===3&&r.monthlyLedger[2].eventPoints===125),"No timed event accounting");
assert(runs.some(r=>r.mode==="routine"&&r.research.includes("STR_ELERIUM_115")),"No nonrare Elerium continuation");
fs.writeFileSync("tools/data/overcap-forward-multimonth-v4.json",JSON.stringify(out,null,2)+"\n");
console.log(JSON.stringify({runs:runs.length,threeSettlements:runs.filter(r=>r.monthlyLedger.length===3).length,events:runs.filter(r=>r.eventResolved).length,nonrareElerium:runs.filter(r=>r.mode==="routine"&&r.research.includes("STR_ELERIUM_115")).length,uniqueNew:new Set(runs.flatMap(r=>r.completedNew)).size,reasons:Object.fromEntries([...new Set(runs.map(r=>r.reason))].map(k=>[k,runs.filter(r=>r.reason===k).length])),examples:runs.filter(r=>r.root==="STR_WAT_DO"&&r.roll===50&&r.mode==="routine"&&r.input==="positive_activity").map(r=>({event:r.eventScenario,date:r.date,reason:r.reason,funds:r.funds,elerium:r.eleriumStock,new:r.completedNew,months:r.monthlyLedger.map(m=>({month:m.month,rating:m.rating,research:m.researchPoints,event:m.eventPoints,bonus:m.bonus,after:m.after})),events:r.trace.filter(t=>t.type.startsWith("event"))}))},null,2));
