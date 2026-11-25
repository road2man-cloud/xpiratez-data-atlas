// Chronological economic companion for existing career witnesses.
// Actual source start layout and stock; only explicit advanceMonth windows
// are used for additional manufacturing. Research-time/RNG and campaign
// survival remain unresolved. Never modify the canonical career replay.
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import yaml from "js-yaml";
import {key,sha} from "./population-research-career-core.mjs";
import {foundationWorld} from "../public/soldiers/modern/origin-witness.js";
const arr=x=>Array.isArray(x)?x:[],num=x=>Number(x)||0,DAY=24;
export function loadEarlyEconomyRules(gameRoot,index,economy){
 const manifest=JSON.parse(fs.readFileSync("public/ruleset/manifest.json")),dir=path.join(gameRoot,"user/mods/Piratez"),files={},countries=new Map(),soldiers=new Map();
 let startBase=null,startFunding=null,startDate=null;
 function read(file,full,expected){
  const b=fs.readFileSync(full),h=sha(b);if(expected)assert.equal(h,expected,file);files[file]=h;
  const d=yaml.load(b.toString("utf8"),{json:true});
  if(d.startingBase)startBase=d.startingBase;
  if(d.initialFunding!==undefined)startFunding=d.initialFunding;
  if(d.startingTime)startDate=d.startingTime;
  for(const [section,m] of [["countries",countries],["soldiers",soldiers]])for(const r of arr(d[section])){
   if(r.delete){m.delete(r.delete);continue;}if(r.type)m.set(r.type,{...m.get(r.type),...r});
  }
 }
 for(const f of ["vars","countries","soldiers","startingBase"]){const p="standard/xcom1/"+f+".rul";read(p,path.join(gameRoot,p));}
 for(const e of manifest.files.filter(e=>e.path.startsWith("Ruleset/")&&e.path.endsWith(".rul")).sort((a,b)=>a.path.localeCompare(b.path,"en")))read(e.path,path.join(dir,e.path),e.sha256);
 assert(startBase&&startDate&&Number.isInteger(startFunding));
 const eligibleCountries=[...countries].filter(([,r])=>arr(r.areas).length||arr(r.lonMin).length);
 assert(eligibleCountries.length>0);
 // One allowed RNG outcome, not an actual save: choose each country's
 // minimum initial roll, then reproduce Mod::newSave's integer adjustment.
 const rolls=eligibleCountries.map(([id,r])=>({id,base:num(r.fundingBase),cap:num(r.fundingCap),roll:num(r.fundingBase)}));
 const missing=Math.trunc((startFunding-rolls.reduce((s,r)=>s+r.roll,0))/rolls.length);
 for(const r of rolls)r.funding=(r.roll+missing>=0?r.roll+missing:r.roll)*1000;
 const openingCash=rolls.reduce((s,r)=>s+r.funding,0);
 const salaryCandidates=[...soldiers].filter(([,r])=>!arr(r.requires).length).map(([id,r])=>({id,salary:num(r.costSalary)}));
 const defaultSalary=Math.max(0,...salaryCandidates.map(s=>s.salary)); // conservative conditional envelope
 const evidence={schema:"ATLAS_EARLY_ECONOMY_SOURCE_V1",sourceMetadataSha256:index.evidence.sourceMetadataSha256,files,startDate,startBase,nominalFunding:startFunding*1000,countryRolls:rolls,openingCash,startingSoldierSalaryEnvelope:defaultSalary,salaryCandidates,economyFingerprint:economy.evidence.fingerprint,sourceSemantics:["Mod::newSave: country funding adjustment and original base","ResearchInfoState: fixed research cost 50..150 percent","Production::step: cumulative engineer-hour carry and adjusted sales","Base::getMonthlyMaintenace: facilities, personnel, inventory, craft"]};
 return {startBase,startDate,openingCash,rolls,defaultSalary,evidence:{...evidence,fingerprint:key(evidence)}};
}
// Replay once per exact action sequence. Keep just the economy-facing
// state, rather than cloning the entire soldier/campaign world per scenario.
export function traceEarlyEconomy(replay,actions){
 let w=foundationWorld();const trace=[];
 const view=w=>({researched:w.researched,disabled:w.disabled,items:w.items,funds:w.funds,month:w.month});
 for(const a of actions){w=replay.apply(w,a);trace.push(view(w));}
 assert(!w.pendingFree);
 return {trace,difficulty:w.difficulty,actionHash:key(actions)};
}
export function produceEarlyEconomy({data,index,economy,early,replay,actions,actionHash,difficulty,staffLimit=10,farmLimit=0,trace=null}){
 assert.equal(key(actions),actionHash);
 const {g,manufacture}=economy,{startBase:base,startDate}=early,raw=index.raw,items=index.items;
 const stock={...base.items},remainingInitial={...base.items},allocation=[],functions=new Set(),facilities=[],grid=Array.from({length:6},()=>Array(6).fill(null)),cashLedger=[],windows=[],obligations=[],milestones=[],fundsMissing=[];
 const epoch=Date.UTC(startDate.year,startDate.month-1,startDate.day,startDate.hour||0);
 let w=foundationWorld(),cash=early.openingCash,minCash=cash,eng=base.engineers,scientists=base.scientists,month=0,hour=0,nominalWork=0,minimumWork=0,maxWork=0,previousNominalWork=0,previousMinWork=0,previousMaxWork=0,paid=0,sales=0,supplyUnits=0,resourceFunctions=0,processed=0,blocked=null;
 const date=()=>new Date(epoch+hour*3600000).toISOString().slice(0,16);
 const active=(world,k)=>world.researched.has(k)&&!world.disabled.has(k);
 const cap=k=>facilities.filter(f=>f.ready<=hour).reduce((s,f)=>s+num(f.rule[k]),0);
 const buildCost=id=>num(index.facilities.get(id)?.buildCost);
 function place(id,x,y,ready,source){
  const r=index.facilities.get(id);assert(r,id);const sx=num(r.sizeX)||num(r.size)||1,sy=num(r.sizeY)||num(r.size)||1;
  for(let j=y;j<y+sy;j++)for(let i=x;i<x+sx;i++){assert(i>=0&&j>=0&&i<6&&j<6&&!grid[j][i],"overlap "+id);grid[j][i]=id;}
  const f={id,x,y,sx,sy,ready,source,rule:r};facilities.push(f);return f;
 }
 for(const f of base.facilities)place(f.type,f.x,f.y,0,"ORIGINAL_START_BASE");
 function refresh(){functions.clear();for(const f of facilities)if(f.ready<=hour)for(const k of arr(f.rule.provideBaseFunc))functions.add(k);}
 refresh();
 function delta(amount,reason,details={}){
  assert(Number.isSafeInteger(amount));
  if(cash+amount<0)return false;
  cash+=amount;minCash=Math.min(minCash,cash);cashLedger.push({hour,date:date(),month,amount,reason,cash,...details});return true;
 }
 const originalSoldiers=typeof base.randomSoldiers==="number"?base.randomSoldiers:Object.values(base.randomSoldiers||{}).reduce((s,n)=>s+n,0);
 let recruited=0;
 function monthlyCost(){
  const facility=cap("monthlyCost"),personnel=eng*g.engineerSalary+scientists*g.scientistSalary+(originalSoldiers+recruited)*early.defaultSalary;
  const inventory=Object.entries(stock).reduce((s,[k,n])=>s+n*(num(items.get(k)?.monthlySalary)+num(items.get(k)?.monthlyMaintenance)),0);
  const craft=arr(base.crafts).reduce((s,c)=>s+num(index.crafts.get(c.type)?.rentCost)+Object.entries(c.items||{}).reduce((v,[k,n])=>v+n*(num(items.get(k)?.monthlySalary)+num(items.get(k)?.monthlyMaintenance)),0),0);
  return {facility,personnel,inventory,craft,total:facility+personnel+inventory+craft};
 }
 // Fixed country funding is one explicitly conditional continuation of
 // the initial roll. No positive score or country growth is invented.
 const monthlyFunding=early.openingCash;
 function sourceBoundary(m){return Math.round((Date.UTC(startDate.year,startDate.month-1+m,1)-epoch)/3600000);}
 function tryFarm(){
  if(facilities.filter(f=>f.id==="STR_HYDROPONICS").length>=farmLimit)return false;
  const id="STR_HYDROPONICS",r=index.facilities.get(id);
  if(!r||!arr(r.requires).every(k=>active(w,k))||!arr(r.requiresBaseFunc).every(k=>functions.has(k))||Object.keys(r.buildCostItems||{}).length||cash<buildCost(id))return false;
  const sx=num(r.sizeX)||num(r.size)||1,sy=num(r.sizeY)||num(r.size)||1;
  for(let y=0;y<=6-sy;y++)for(let x=0;x<=6-sx;x++){
   let free=true,connected=false;
   for(let j=y;j<y+sy;j++)for(let i=x;i<x+sx;i++){
    if(grid[j][i])free=false;
    for(const [dx,dy] of [[0,1],[0,-1],[1,0],[-1,0]]){const q=grid[j+dy]?.[i+dx];if(q&&q!=="STR_RUBBLE"&&!index.facilities.get(q)?.connectorsDisabled)connected=true;}
   }
   if(free&&connected){
    // Reserve one month's negative net operating cost before investing.
    const reserve=Math.max(0,monthlyCost().total-monthlyFunding);
    if(cash-buildCost(id)<reserve)return false;
    assert(delta(-buildCost(id),"buildFacility",{id,x,y,ready:hour+num(r.buildTime)*DAY}));
    place(id,x,y,hour+num(r.buildTime)*DAY,"CONDITIONAL_EARLY_CONSTRUCTION");return true;
   }
  }
  return false;
 }
 const pureRecipes=[...index.recipes.values()].filter(a=>{
  const r=manufacture.get(a.id);
  return r&&a.hours>0&&!Object.keys(a.inputs).length&&!a.randomExtras&&Object.keys(a.outputs).every(k=>k.startsWith("ITEM:"))&&
   !r.spawnedPersonType&&!r.spawnedSoldier&&!r.spawnedItem&&!r.spawnedEvent&&!r.randomEvents&&!r.eventWeights&&!r.points;
 }).map(a=>({...a,revenue:Object.entries(a.outputs).reduce((s,[k,n])=>s+Math.trunc(num(items.get(raw(k))?.costSell)*g.sellCoefficients[difficulty]/100)*n,0)})).filter(a=>a.revenue>a.cost);
 function bestRecipe(){return pureRecipes.filter(a=>a.research.every(k=>active(w,k))&&a.functions.every(k=>functions.has(k))&&cap("workshops")>a.space).map(a=>({...a,staff:Math.min(eng,cap("workshops")-a.space)})).filter(a=>a.staff>0).sort((a,b)=>(b.revenue-b.cost)*b.staff/b.hours-(a.revenue-a.cost)*a.staff/a.hours||a.id.localeCompare(b.id))[0];}
 function manufactureWindow(end,at){
  refresh();const before=cash,start=hour,steps=[];
  while(hour<end){
   refresh();
   while(tryFarm()){}
   const desired=Math.min(staffLimit,Math.max(eng,cap("workshops")),Math.max(eng,cap("personnel")-scientists-originalSoldiers-recruited));
   // Hire only when affordable; preserve existing payroll reserve. No salary
   // reduction from firing staff is assumed. Transfer time consumes the window.
   const extra=Math.min(desired-eng,Math.max(0,Math.floor((cash-Math.max(0,monthlyCost().total-monthlyFunding))/g.engineerHire)));
   if(extra>0&&hour+g.personnelTransferHours<end){
    assert(delta(-extra*g.engineerHire,"hireEngineers",{count:extra,ready:hour+g.personnelTransferHours}));
    hour+=g.personnelTransferHours;eng+=extra;refresh();
   }
   const recipe=bestRecipe(),nextReady=Math.min(...facilities.filter(f=>f.ready>hour).map(f=>f.ready),Infinity),stop=Math.min(end,nextReady);
   if(!recipe){hour=stop;continue;}
   // Daily lots account for carry-over within the lot. Pay the entire lot
   // before producing it (conservative relative to unit-by-unit payment).
   const duration=Math.min(stop-hour,DAY),batches=Math.floor(duration*recipe.staff/recipe.hours);
   if(!batches){hour=stop;continue;}
   const cost=recipe.cost*batches;
   if(!delta(-cost,"manufacture",{recipe:recipe.id,batches,engineerHours:recipe.hours*batches,assigned:recipe.staff})){hour=stop;continue;}
   hour+=duration;
   assert(delta(recipe.revenue*batches,"sale",{recipe:recipe.id,batches,outputs:recipe.outputs}));
   sales+=recipe.revenue*batches;
   const prev=steps.at(-1);if(prev?.recipe===recipe.id){prev.batches+=batches;prev.hours+=duration;prev.net+=(recipe.revenue-recipe.cost)*batches;}else steps.push({recipe:recipe.id,batches,hours:duration,net:(recipe.revenue-recipe.cost)*batches});
  }
  hour=end;refresh();
  const m=monthlyCost(),net=monthlyFunding-m.total;
  if(!delta(net,"monthlyFunding",{funding:monthlyFunding,...m})){blocked={kind:"INSUFFICIENT_MONTHLY_CASH",at,month:month+1,required:-net,cash};return false;}
  month++;windows.push({month,at,start,end,openingCash:before,closingCash:cash,manufacture:steps,monthlyFunding,maintenance:m,engineers:eng,farms:facilities.filter(f=>f.id==="STR_HYDROPONICS"&&f.ready<=hour).length});return true;
 }
 const watchFacilities=["STR_HYDROPONICS","STR_WORKSHOP","STR_REFINERY"],seen=new Set();
 for(const [i,a] of actions.entries()){
  const before=w;w=trace?trace[i]:replay.apply(w,a);processed=i+1;
  // The exact original trace is kept. This separate allocation does not
  // consume virtual grants a second time or claim that the grant is removed.
  if(a.type==="externalInputs"){
   for(const [id,n] of Object.entries(a.items||{})){
    const available=Math.max(0,remainingInitial[id]||0),use=Math.min(n,available);
    if(use){remainingInitial[id]=available-use;supplyUnits+=use;allocation.push({at:i+1,asset:id,quantity:use,source:"ORIGINAL_START_STOCK",remaining:n-use});}
    if(n>use)obligations.push({at:i+1,kind:"ITEM",id,quantity:n-use});
   }
   for(const f of a.functions||[]){if(functions.has(f)){resourceFunctions++;allocation.push({at:i+1,function:f,source:"ORIGINAL_OR_EARLY_BASE_FUNCTION"});}else obligations.push({at:i+1,kind:"FUNCTION",id:f});}
   if(a.funds)fundsMissing.push({at:i+1,nominalExternalFunds:a.funds});
  }else{
   const spend=Math.max(0,before.funds-w.funds);
   if(spend){if(!delta(-spend,"careerAction",{at:i+1,action:a.type,id:a.transform||a.profile||a.recipe||a.id})){blocked={kind:"CAREER_PAYMENT_UNFUNDED",at:i+1,required:spend,cash};break;}paid+=spend;}
   // Deduct known consumption from the source-stock inventory when it was
   // allocated to a matching grant; other non-source materials stay open.
   for(const [id,n] of Object.entries(before.items||{})){
    const used=Math.max(0,n-(w.items[id]||0));
    const allocated=(stock[id]||0)-(remainingInitial[id]||0);
    if(used&&allocated>0)stock[id]-=Math.min(used,allocated);
   }
   if(a.type==="recruit")recruited++;
  }
  if(a.type==="research"||a.type==="repeatResearch"){
   const cost=num(data.researchRules[a.id]?.cost);
   nominalWork+=cost;minimumWork+=cost?Math.max(1,Math.trunc(cost*.5)):0;maxWork+=cost?Math.max(1,Math.trunc(cost*1.5)):0;
  }
  for(const id of watchFacilities){
   const r=index.facilities.get(id);if(r&&arr(r.requires).every(k=>active(w,k))&&!seen.has(id)){seen.add(id);milestones.push({at:i+1,month:w.month,id,nominalWork,minimumWork,maximumWork:maxWork,actionHash:key(actions.slice(0,i+1))});}
  }
  if(a.type==="advanceMonth"){
   // Manufacture only using the PRE-advance research state. advanceMonth
   // itself adds no research. The model does not establish how long the
   // preceding lab actions took; compare their workload to the window.
   const m0=month,target=w.month,days=(sourceBoundary(target)-hour)/24;
   const rw={nominal:nominalWork-previousNominalWork,minimum:minimumWork-previousMinWork,maximum:maxWork-previousMaxWork,scientistDaysAvailable:Math.max(0,days)*scientists};
   milestones.push({at:i+1,type:"RESEARCH_WORKLOAD_WINDOW",fromMonth:m0,toMonth:target,...rw,minimumFits:rw.minimum<=rw.scientistDaysAvailable});
   previousNominalWork=nominalWork;previousMinWork=minimumWork;previousMaxWork=maxWork;
   for(let m=month+1;m<=target;m++){if(!manufactureWindow(sourceBoundary(m),i+1))break;}
   if(blocked)break;
  }
 }
 const terminalReached=processed===actions.length&&!blocked;
 const trailingWork={nominal:nominalWork-previousNominalWork,minimum:minimumWork-previousMinWork,maximum:maxWork-previousMaxWork,calendarAssigned:false};
 const researchCapacity={initialScientists:scientists,labSlots:cap("labs"),nominalScientistDays:nominalWork,minScientistDays:minimumWork,maxScientistDays:maxWork,trailingWork,scope:"WORKLOAD_DIAGNOSTIC_NOT_RESEARCH_CALENDAR"};
 const out={schema:"ATLAS_EARLY_ECONOMIC_COMPANION_V1",actionHash,sourceFingerprint:early.evidence.fingerprint,scenario:{difficulty,staffLimit,farmLimit,countryFunding:"CONSTANT_INITIAL_ROLL_CONDITIONAL",openingCash:early.openingCash,startingEngineers:base.engineers,scientists:base.scientists},status:terminalReached?"CONDITIONAL_PREFIX_CASH_SCHEDULED":"PARTIAL_PREFIX_CASH_SCHEDULE",processedActions:processed,totalActions:actions.length,months:month,closingCash:cash,minimumCash:minCash,careerCashPaid:paid,sales,allocation,initialStockUnitsAllocated:supplyUnits,baseFunctionRequestsCovered:resourceFunctions,unresolvedResources:obligations,originalFundRequests:fundsMissing,windows,milestones,nominalResearchWork:nominalWork,minResearchWork:minimumWork,maxResearchWork:maxWork,researchCapacity,cashLedger,layout:facilities.map(({rule,...f})=>f),blocked,openConditions:["COUNTRY_FUNDING_AND_SCORES_NOT_REPLAYED","RESEARCH_TIME_NOT_REPLAYED; ORIGINAL_ADVANCE_MONTH_WINDOWS_USED","SOURCE_STOCK_ALLOCATIONS_ARE_CANDIDATE_REPLACEMENTS_NOT_CANONICAL_REPLAY","OTHER_EXTERNAL_RESOURCES_AND_EVENTS_UNRESOLVED","START_SOLDIER_TYPES_AND_SALARIES_CONDITIONAL","NO_CAMPAIGN_SURVIVAL_OR_TERMINAL_BASE_TRANSFER_PROOF"],completeCampaigns:0};
 return {...out,companionHash:key(out)};
}
