import fs from "node:fs";
import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {createHash} from "node:crypto";
import {createIndustryClock} from "./atlas-overcap-forward-clock-v4-industry.mjs";
import {START_RESEARCH} from "./atlas-overcap-rooted-early-research.mjs";
import {exactStateHash} from "./origin-pair-exact-prefix-checkpoint.mjs";
const files={data:"public/data/soldiers-modern-index.json",forwardSupply:"tools/data/overcap-forward-supply-catalog-v2.json",forwardStartingBase:"tools/data/overcap-forward-starting-base-v3.json",forwardJunk:"tools/data/overcap-forward-junk-extraction-v3.json",facilities:"public/data/facilities-v2-index.json",items:"public/data/items-v2-index.json",manufacture:"public/data/manufacture-v2-index.json"};
const bytes=Object.fromEntries(Object.entries(files).map(([k,p])=>[k,fs.existsSync(p)?fs.readFileSync(p):execFileSync("git",["show","HEAD:"+p],{maxBuffer:80*1024*1024})]));
const data=JSON.parse(bytes.data);for(const k of ["forwardSupply","forwardStartingBase","forwardJunk"])data[k]=JSON.parse(bytes[k]);
const facilities=JSON.parse(bytes.facilities),items=JSON.parse(bytes.items),manufacture=JSON.parse(bytes.manufacture);
for(const d of [facilities,items,manufacture])assert.equal(d.meta.sourceVersion,"v.o2");
const facilityFields=Object.fromEntries(facilities.facilities.map(x=>[x.id,x.fields])),itemFields=Object.fromEntries(items.items.map(x=>[x.id,x.fields])),manufactureFields=Object.fromEntries(manufacture.entries.map(x=>[x.id,x.fields]));
const budget=325000,clock=createIndustryClock(data,{budget,labCapacity:12,quarters:20,facilityFields,itemFields,manufactureFields,sellCoefficient:100});
const recipe=data.forwardJunk.recipe,normal=recipe.outcomes.findIndex(o=>o.items.STR_SCRAP_METAL===1),rare=recipe.outcomes.findIndex(o=>o.items.STR_NUCLEAR_MATERIALS===1);
assert(normal>=0&&rare>=0);
const target=["STR_WAT_DO","STR_JACKSTOWN_SCOUTING","STR_INSPECT_MACHINERY","STR_PIRATE_STYLE","STR_KULTUR","STR_HARDWARE_SHOPPING","STR_WEIRDNESS","STR_SCHOOLING_1","STR_SCI_REP","STR_SC_WIRE","STR_PERSONAL_LABS"];
const runs=[];
for(const root of Object.values(START_RESEARCH))for(const mode of ["routine","rare_funding"])for(const roll of [50,100]){
 const s=clock.start();let reason="JANUARY_LIMIT",blocked=[],sales=0;
 try{
  clock.begin(s,root,s.scientists,roll);while(s.projects.length)clock.tick(s);clock.flush(s);
  for(let i=0;i<31;i++){
   clock.flush(s);
   if(mode==="rare_funding")while((s.world.items.STR_NUCLEAR_MATERIALS||0)>0){clock.sell(s,"STR_NUCLEAR_MATERIALS");sales++;}
   if(s.world.researched.has("STR_SCHOOLING_1")&&!s.industry.length&&s.industryFinished.length<(mode==="routine"?1:2))clock.extract(s,mode==="routine"?normal:rare);
   if(s.world.facilities.has("STR_PERSONAL_LABS")){reason="LAB_COMPLETE";break;}
   if(s.world.researched.has("STR_PERSONAL_LABS")&&!s.construction.length){
    if(s.world.funds>=data.forwardSupply.facilities.STR_PERSONAL_LABS.cost){clock.build(s,"STR_PERSONAL_LABS");reason="LAB_CONSTRUCTION_STARTED";}
    else if(!s.industry.length){reason="INSUFFICIENT_CONDITIONAL_BUDGET";blocked.push({id:"STR_PERSONAL_LABS",funds:s.world.funds,cost:data.forwardSupply.facilities.STR_PERSONAL_LABS.cost});break;}
   }
   const eligible=clock.options(s).filter(o=>o.action.type==="research"&&target.includes(o.action.id)).map(o=>o.action.id).sort((a,b)=>target.indexOf(a)-target.indexOf(b));
   for(const id of eligible){if(!clock.available(s))break;clock.begin(s,id,1,roll);}
   if(s.projects.length&&clock.available(s))clock.assign(s,s.projects[0].id,s.projects[0].assigned+clock.available(s));
   if(!s.projects.length&&!s.industry.length&&!s.construction.length&&!s.transfers.length){reason="NO_SUPPORTED_NEXT_STEP";break;}
   clock.tick(s);
  }
 }catch(e){reason=e.message;}
 if(reason==="MONTH_BOUNDARY_UNMODELED"&&s.construction.some(p=>p.id==="STR_PERSONAL_LABS"))reason="LAB_CONSTRUCTION_PENDING_MONTH_BOUNDARY";
 const income=s.trace.filter(t=>t.type==="stockSale").reduce((a,t)=>a+t.income,0),spend=s.trace.filter(t=>["manufactureStart","constructionStart","purchaseOrder","hireOrder"].includes(t.type)).reduce((a,t)=>a+t.cost,0);
 assert.equal(budget+income-spend,s.world.funds,"Unreconciled budget");
 for(const p of s.industryFinished)assert.equal(p.completed-p.started,Math.ceil(p.effort/p.assigned));
 assert(s.trace.every((t,i)=>!i||t.elapsedHours>=s.trace[i-1].elapsedHours));
 runs.push({root,mode,roll,reason,date:clock.stamp(s),funds:s.world.funds,finance:{openingBudget:budget,stockSales:income,spend,closingFunds:s.world.funds,monthlySettlement:"NOT_APPLIED",knownPersonnelSalarySubtotal:s.scientists*100000+s.engineers*5000},checkpoint:{worldHash:exactStateHash(s.world),state:JSON.parse(JSON.stringify({...s,trace:undefined},(k,v)=>v instanceof Set?{$set:[...v]}:v instanceof Map?{$map:[...v]}:v))},sales,workshopCapacity:s.workshopCapacity,research:[...s.world.researched].sort(),stock:s.world.items,industryFinished:s.industryFinished,industry:s.industry,construction:s.construction,transfers:s.transfers,projects:s.projects,blocked,trace:s.trace});
}
const coefficients=[115,100,90,75,60];
const outcomes=recipe.outcomes.map((o,index)=>{const outputs={...recipe.fixed};for(const [id,n] of Object.entries(o.items))outputs[id]=(outputs[id]||0)+n;
 const price=(coef)=>Object.entries(outputs).reduce((v,[id,n])=>v+Math.trunc((itemFields[id]?.costSell||0)*coef/100)*n,0);
 return {index,weight:o.weight,totalWeight:recipe.totalWeight,random:o.items,outputs,missingExplicitPrice:Object.keys(outputs).filter(id=>!Number.isInteger(itemFields[id]?.costSell)),grossByDifficulty:coefficients.map(price)};});
const grossComplete=outcomes.every(o=>!o.missingExplicitPrice.length);
const expectedGrossByDifficulty=coefficients.map((_,i)=>grossComplete?outcomes.reduce((v,o)=>v+o.weight*o.grossByDifficulty[i],0)/recipe.totalWeight:null);
const rareProbability={perExtraction:{numerator:recipe.outcomes[rare].weight,denominator:recipe.totalWeight},twoConsecutiveAssumingIndependent:{numerator:recipe.outcomes[rare].weight**2,denominator:recipe.totalWeight**2}};
const sha=b=>createHash("sha256").update(b).digest("hex");
const out={schema:"ATLAS_FORWARD_INDUSTRY_V4_3",actualGameCertified:false,normalizationComplete:false,scope:"Conditional January-only one-unit extraction and stock sales. Opening budget is target, not observed balance; lab/quarters assumptions inherited. Sales assume no script modifier; 100% coefficient scenario. Exact outcome selection is conditional, not a guaranteed route. No month-crossing, combat, or full storage/maintenance model.",source:{recipe:recipe.id,workHours:recipe.time,initialEngineers:data.forwardStartingBase.engineers,initialJunk:data.forwardStartingBase.items.STR_JUNK_PILE,sellCoefficients:coefficients,sourceGlobals:"Piratez_Globals.rul:8859-8860,8870",salaryKnown:{scientist:100000,engineer:5000},monthlyBoundary:{status:"BLOCKED",known:"SavedGame::monthlyFunding adds countryFunding minus baseMaintenance and resets research score bucket",unresolved:["actual country funding","total base maintenance including facilities, craft, soldiers and inventory","monthly events, mission scheduling and defeat conditions"]}},inputs:Object.fromEntries(Object.entries(files).map(([k,p])=>[p,sha(bytes[k])])),engineSha256:sha(fs.readFileSync("tools/atlas-overcap-forward-clock-v4-industry.mjs","utf8").replace(/\r\n/g,"\n")),outcomeEconomics:{coefficients,expectedGrossByDifficulty,grossComplete,rareProbability,scope:"Gross sale of all produced items at raw adjusted price; not net profit, and not assuming sale of research-reserved resources."},outcomes,runs};
assert(runs.some(r=>r.industryFinished.length&&r.research.includes("STR_SC_WIRE")&&r.research.includes("STR_PERSONAL_LABS")),"No extraction-funded sample research");
assert(runs.filter(r=>r.mode==="rare_funding"&&r.roll===50).every(r=>r.reason==="LAB_CONSTRUCTION_PENDING_MONTH_BOUNDARY"&&r.construction.some(p=>p.id==="STR_PERSONAL_LABS"&&p.remainingDays<28)),"No funded construction carried to boundary");
fs.writeFileSync("tools/data/overcap-forward-industry-v4.json",JSON.stringify(out,null,2)+"\n");
console.log(JSON.stringify(runs.map(r=>({root:r.root,mode:r.mode,roll:r.roll,reason:r.reason,date:r.date,funds:r.funds,sales:r.sales,produced:r.industryFinished.length,wire:r.research.includes("STR_SC_WIRE"),labs:r.research.includes("STR_PERSONAL_LABS"),construction:r.construction.map(p=>({id:p.id,remainingDays:p.remainingDays}))})),null,2));
