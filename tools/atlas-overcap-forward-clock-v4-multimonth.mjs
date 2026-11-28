// V4.5: checkpoint continuation, per-month score buckets, one timed event.
// Native archive: ResearchInfoState.cpp:48-62,160-166; Base.cpp:1311-1335;
// GeoscapeState.cpp:2447-2514,2686-2701. January-only, no external inputs.
// Completion uses V3's stricter current-world eligibility; unresolved native
// conflicts stop the witness rather than bypassing the verifier.
import assert from "node:assert/strict";
import {createForwardResearch} from "./atlas-overcap-forward-research-v3.mjs";
import {exactStateHash} from "./origin-pair-exact-prefix-checkpoint.mjs";
const rootsStart=Date.UTC(2601,0,1,12),boundary=Date.UTC(2601,4,1)-rootsStart;
const limitHours=boundary/3600000;
const qty=(w,id)=>Number(w.items[id]||0);
export function createMultiMonthClock(data,{labCapacity=12,quarters=50,budget=325000,facilityFields,itemFields,manufactureFields,sellCoefficient=100,economy,monthlyInput,eventScenario=false}={}){
 const engine=createForwardResearch(data),rules=data.researchRules,recipe=data.forwardJunk.recipe;
 assert([115,100,90,75,60].includes(sellCoefficient));
 const raw=manufactureFields[recipe.id];assert(raw&&raw.time===recipe.time&&raw.cost===recipe.cost&&raw.space===recipe.space);
 assert.deepEqual(raw.requiredItems,recipe.inputs);assert.deepEqual(raw.producedItems,recipe.fixed);assert.deepEqual(raw.randomProducedItems,recipe.outcomes.map(o=>[o.weight,o.items]));
 assert(!raw.transferTimes&&!raw.requiredCrafts&&!raw.spawnedPersonType&&!raw.producedCraft);
 const workshopCapacity=data.forwardStartingBase.facilities.reduce((sum,f)=>sum+(facilityFields[f.id]?.workshops||0),0);
 const stamp=s=>new Date(rootsStart+s.elapsedHours*3600000).toISOString();
 const record=(s,type,details)=>s.trace.push({...details,type,date:stamp(s),elapsedHours:s.elapsedHours});
 const start=()=>{
  const b=data.forwardStartingBase,world=engine.start();world.funds=budget;
  return {world,firstRoot:null,elapsedHours:0,scientists:b.scientists,engineers:b.engineers,soldiers:b.randomSoldiers,labCapacity,quarters,budget,fixedCosts:{},projects:[],industry:[],industryFinished:[],workshopCapacity,trace:[],deliveryDue:[],construction:[],transfers:[],grid:b.facilities.map(f=>({...f,size:facilityFields[f.id]?.size||1}))};
 };
 const checkFunds=(s,c)=>assert(Number.isSafeInteger(c)&&c>=0&&s.world.funds>=c,"INSUFFICIENT_CONDITIONAL_BUDGET");
 const nextMidnight=s=>s.elapsedHours+24-((12+s.elapsedHours)%24);
 const cells=f=>Array.from({length:f.size*f.size},(_,i)=>[f.x+i%f.size,f.y+Math.floor(i/f.size)]);
 function location(s,size){
  const occupied=new Set(s.grid.concat(s.construction).flatMap(cells).map(v=>v.join(",")));
  const connected=new Set(s.grid.filter(f=>f.id!=="STR_RUBBLE").flatMap(cells).map(v=>v.join(",")));
  for(let y=0;y<=6-size;y++)for(let x=0;x<=6-size;x++){
   const f={x,y,size},c=cells(f);
   if(c.some(v=>occupied.has(v.join(","))))continue;
   if(c.some(([a,b])=>[[a-1,b],[a+1,b],[a,b-1],[a,b+1]].some(v=>connected.has(v.join(",")))))return f;
  }
  throw Error("NO_CONNECTED_FREE_TILE");
 }
 function build(s,id){
  assert(s.firstRoot&&!s.world.pendingFree&&!s.construction.some(p=>p.id===id));
  const o=options(s).find(o=>o.action.type==="sourceBuildFacility"&&o.action.id===id);assert(o,"FACILITY_GATE");
  const f=data.forwardSupply.facilities[id],raw=facilityFields[id];assert(raw&&raw.buildTime===f.days&&raw.buildCost===f.cost&&f.days>0);
  assert(!raw.buildCostItems&&!raw.buildOverFacilities&&!raw.upgradeOnly,"UNMODELED_FACILITY_RULE");
  checkFunds(s,f.cost);
  const p={id,...location(s,f.size),remainingDays:f.days,cost:f.cost,action:o.action};
  // Validate the V3 transition without applying it at start.
  engine.apply(s.world,o.action,s.firstRoot);
  s.world.funds-=f.cost;s.construction.push(p);
  record(s,"constructionStart",{...p,funds:s.world.funds,providesAfterCompletion:f.provides});
 }
 function hire(s,count=1){
  assert(s.firstRoot&&!s.world.pendingFree&&Number.isInteger(count)&&count>0);
  assert(s.scientists+s.engineers+s.soldiers+s.transfers.filter(p=>p.type==="scientist").reduce((n,p)=>n+p.count,0)+count<=s.quarters,"QUARTERS_LIMIT");
  // Mod hire gate fields absent from inspected Piratez rules. Base/default and
  // actual starting population/quarters remain conditional in the manifest.
  const cost=200000*count;checkFunds(s,cost);s.world.funds-=cost;
  const p={type:"scientist",count,due:s.elapsedHours+72,cost};s.transfers.push(p);
  record(s,"hireOrder",{...p,transferType:p.type,funds:s.world.funds});
 }
 function buy(s,id){
  const o=options(s).find(o=>o.action.type==="sourceBuySample"&&o.action.id===id);
  assert(o&&!s.transfers.some(p=>p.type==="item"&&p.id===id),"PURCHASE_GATE");
  const raw=itemFields[id],b=data.forwardSupply.buys[id];assert(raw&&b&&raw.costBuy===b.cost&&!raw.monthlyBuyLimit,"PURCHASE_FIELDS_UNMODELED");
  const hours=raw.transferTime??24;assert(Number.isInteger(hours)&&hours>0);
  const cost=b.cost*o.action.count;checkFunds(s,cost);
  // Reuse exact purchase gate, but separate the queued delivery from V3's
  // immediate delivery adapter. No stock grant until its actual due hour.
  engine.apply(s.world,o.action,s.firstRoot);
  s.world.funds-=cost;
  const p={type:"item",id,count:o.action.count,due:s.elapsedHours+hours,cost,transferHours:hours};s.transfers.push(p);
  record(s,"purchaseOrder",{...p,transferType:p.type,funds:s.world.funds});
 }
 function extract(s,outcome,assigned=s.engineers){
  assert(s.firstRoot&&!s.world.pendingFree&&!s.industry.length,"MANUFACTURE_ALREADY_ACTIVE_OR_UNAVAILABLE");
  assert(Number.isInteger(assigned)&&assigned>0&&assigned<=s.engineers&&assigned+recipe.space<=s.workshopCapacity,"WORKSHOP_CAPACITY");
  const o=options(s).find(o=>o.action.type==="sourceRandomManufacture"&&o.action.id===recipe.id&&o.action.outcome===outcome);assert(o,"EXTRACTION_GATE");
  // Validate the existing exact rule transition, but do not apply its output yet.
  engine.apply(s.world,o.action,s.firstRoot);checkFunds(s,recipe.cost);
  const result=recipe.outcomes[outcome];assert(result&&result.weight>0);
  for(const [id,n] of Object.entries(recipe.inputs)){assert(qty(s.world,id)>=n);s.world.items[id]-=n;}
  s.world.funds-=recipe.cost;
  const p={id:recipe.id,assigned,spent:0,effort:recipe.time,outcome,weight:result.weight,totalWeight:recipe.totalWeight,started:s.elapsedHours,cost:recipe.cost,inputs:recipe.inputs};
  s.industry.push(p);record(s,"manufactureStart",{...p,funds:s.world.funds,stock:Object.fromEntries(Object.keys(recipe.inputs).map(id=>[id,qty(s.world,id)])),stateHash:exactStateHash(s.world)});
 }
 function productionHour(s){
  for(const p of [...s.industry]){
   p.spent+=p.assigned;if(p.spent<p.effort)continue;
   const outputs={...recipe.fixed};
   for(const [id,n] of Object.entries(recipe.outcomes[p.outcome].items))outputs[id]=(outputs[id]||0)+n;
   for(const [id,n] of Object.entries(outputs))s.world.items[id]=qty(s.world,id)+n;
   s.industry=s.industry.filter(x=>x!==p);s.industryFinished.push({...p,completed:s.elapsedHours,outputs});
   record(s,"manufactureComplete",{...p,outputs,elapsedManufactureHours:s.elapsedHours-p.started,stock:Object.fromEntries(Object.keys(outputs).map(id=>[id,qty(s.world,id)])),stateHash:exactStateHash(s.world)});
  }
 }
 function sell(s,id,count=1){
  assert(s.firstRoot&&!s.world.pendingFree&&Number.isInteger(count)&&count>0&&qty(s.world,id)>=count);
  const raw=itemFields[id];assert(raw&&Number.isSafeInteger(raw.costSell)&&raw.costSell>0&&!raw.liveAlien&&!raw.isAlien,"UNSUPPORTED_SALE");
  const unit=Math.trunc(raw.costSell*sellCoefficient/100),income=unit*count;
  s.world.items[id]-=count;s.world.funds+=income;
  record(s,"stockSale",{id,count,unit,basePrice:raw.costSell,coefficient:sellCoefficient,income,funds:s.world.funds,stock:qty(s.world,id),stateHash:exactStateHash(s.world)});
 }
 function resourceArrivals(s,until){
  for(const p of [...s.transfers].sort((a,b)=>a.due-b.due)){
   if(p.due>until)break;
   s.elapsedHours=Math.max(s.elapsedHours,p.due);
   if(p.type==="scientist")s.scientists+=p.count;else s.world.items[p.id]=qty(s.world,p.id)+p.count;
   s.transfers=s.transfers.filter(x=>x!==p);
   record(s,"transferArrival",{...p,transferType:p.type,scientists:s.scientists,stock:p.id?qty(s.world,p.id):null,stateHash:exactStateHash(s.world)});
  }
 }
 function constructionDay(s){
  for(const p of [...s.construction]){
   if(--p.remainingDays>0)continue;
   apply(s,p.action);s.grid.push({id:p.id,x:p.x,y:p.y,size:p.size});s.construction=s.construction.filter(x=>x!==p);
   record(s,"constructionComplete",{id:p.id,x:p.x,y:p.y,size:p.size,functions:[...s.world.baseFunctions].sort(),funds:s.world.funds,stateHash:exactStateHash(s.world)});
   const f=economy.facilities[p.id];assert(f,"FACILITY_CAPACITY_SOURCE_MISSING");
   s.labCapacity+=f.labs;s.quarters+=f.personnel;
  }
 }
 const available=s=>Math.min(s.scientists,s.labCapacity)-s.projects.reduce((n,p)=>n+p.assigned,0);
 const options=s=>engine.options(s.world,s.firstRoot).choices.filter(o=>!s.projects.some(p=>p.id===o.action.id&&o.action.type==="research"));
 function begin(s,id,assigned,roll=100){
  assert(Number.isInteger(assigned)&&assigned>0&&assigned<=available(s),"RESEARCH_CAPACITY");
  assert(s.firstRoot||!s.projects.length,"FIRST_ROOT_MUST_FINISH");
  assert(options(s).some(o=>o.action.type==="research"&&o.action.id===id),"LAB_NOT_AVAILABLE");
  assert(Number.isInteger(roll)&&roll>=50&&roll<=150,"COST_ROLL_RANGE");
  const r=rules[id],sample=r.needItem?(r.neededItem||id):null,held=!!(sample&&(r.destroyItem||r.returnsItem));
  if(sample)assert(qty(s.world,sample)>0,"SAMPLE_NOT_AVAILABLE");
  if(!Object.hasOwn(s.fixedCosts,id))s.fixedCosts[id]={cost:Math.max(1,Math.floor(r.cost*roll/100)),roll};
  const p={id,assigned,cost:s.fixedCosts[id].cost,spent:0,sample,held,returns:!!r.returnsItem,destroys:!!r.destroyItem};
  if(held)s.world.items[sample]=qty(s.world,sample)-1;
  s.world.activeResearch.add(id);s.projects.push(p);
  record(s,"researchStart",{...p,roll:s.fixedCosts[id].roll,stock:sample?qty(s.world,sample):null,available:available(s),stateHash:exactStateHash(s.world)});
 }
 function assign(s,id,n){
  const p=s.projects.find(x=>x.id===id);assert(p&&Number.isInteger(n)&&n>=0&&n<=p.assigned+available(s));
  p.assigned=n;record(s,"researchAssign",{id,assigned:n,available:available(s)});
 }
 function cancel(s,id,reason="USER_CANCEL"){
  const p=s.projects.find(x=>x.id===id);assert(p);
  if(p.held)s.world.items[p.sample]=qty(s.world,p.sample)+1;
  s.world.activeResearch.delete(id);s.projects=s.projects.filter(x=>x!==p);
  record(s,"researchCancel",{id,reason,returned:p.held,stock:p.sample?qty(s.world,p.sample):null,stateHash:exactStateHash(s.world)});
 }
 function apply(s,action){
  const before=s.world,old=before.forwardDeliveries?.length||0;
  s.world=engine.apply(before,action,s.firstRoot).world;
  if(action.type==="research"&&!s.firstRoot)s.firstRoot=action.id;
  const added=(s.world.forwardDeliveries?.length||0)-old;
  if(action.type==="sourceResearchDelivery")s.deliveryDue.shift();
  else {assert(added>=0);for(let i=0;i<added;i++)s.deliveryDue.push(s.elapsedHours+1);}
  const addedResearch=[...s.world.researched].filter(x=>!before.researched.has(x));
  for(const id of addedResearch)if(!s.awardedResearch.has(id)){
   assert(Number.isInteger(economy.research[id]?.points),"RESEARCH_POINTS_UNKNOWN:"+id);
   s.awardedResearch.add(id);s.monthResearchIds.push(id);
  }
  record(s,action.type,{action,added:addedResearch,stateHash:exactStateHash(s.world)});
 }
 function free(s){
  while(s.world.pendingFree){
   const o=options(s).find(x=>x.action.type==="freeResearch");assert(o,"FREE_RESEARCH_UNRESOLVED");apply(s,o.action);
  }
 }
 function complete(s,p){
  assert(!s.world.researched.has(p.id)&&!s.world.disabled.has(p.id),"COMPLETION_CONFLICT_UNMODELED");
  s.world.activeResearch.delete(p.id);s.projects=s.projects.filter(x=>x!==p);
  // V3 consumes destroyItem after its completion cascade. Do not let a
  // temporary validation sample create a phantom zero-cost item unlock.
  if(p.held&&!p.returns&&qty(s.world,p.sample)===0){
   assert(!Object.entries(rules).some(([id,r])=>r.cost===0&&r.needItem&&(r.neededItem||id)===p.sample),"HELD_SAMPLE_AUTO_ZERO_ORDER_UNMODELED");
  }
  // Temporarily restore the held sample for the stricter V3 verifier.
  if(p.held)s.world.items[p.sample]=qty(s.world,p.sample)+1;
  apply(s,{type:"research",id:p.id});
  if(p.held&&p.returns&&p.destroys)s.world.items[p.sample]=qty(s.world,p.sample)+1;
  // Native archive clears the roll only on completion, not on cancellation.
  delete s.fixedCosts[p.id];
  record(s,"researchSettlement",{id:p.id,cost:p.cost,spent:p.spent,sample:p.sample,held:p.held,returned:p.held&&p.returns,consumed:p.held&&!p.returns,stock:p.sample?qty(s.world,p.sample):null,stateHash:exactStateHash(s.world)});
  free(s);
 }
 function deliver(s,until){
  while(s.deliveryDue.length&&s.deliveryDue[0]<=until){
   const g=s.world.forwardDeliveries[0];assert(g&&(!g.kind||g.kind==="research"),"UNSUPPORTED_DELIVERY");
   s.elapsedHours=Math.max(s.elapsedHours,s.deliveryDue[0]);
   assert(s.elapsedHours<limitHours,"MONTH_BOUNDARY_UNMODELED");
   const o=options(s).find(x=>x.action.type==="sourceResearchDelivery");assert(o);apply(s,o.action);
  }
 }
 // MonthlyReportState calculates council rating after monthlyFunding.
 // The caller supplies scenario-specific country funding, other activity and
 // unresolved soldier/inventory salaries; do not silently promote them to facts.
 function settleMonth(s){
  const nextMonth=s.world.month+1;
  assert(nextMonth===s.monthlyLedger.length+1,"MONTH_LEDGER_SEQUENCE");
  const input=monthlyInput[nextMonth];assert(input&&["countryFunding","regionalNet","otherMaintenance"].every(k=>Number.isSafeInteger(input[k]))&&input.countryFunding>=0,"MONTH_INPUT_REQUIRED");
  const discovered=[...s.monthResearchIds],unknown=discovered.filter(id=>!Number.isInteger(economy.research[id]?.points));
  assert(!unknown.length,"RESEARCH_POINTS_UNKNOWN:"+unknown.join(","));
  const researchPoints=discovered.reduce((n,id)=>n+economy.research[id].points,0);
  const eventPoints=s.monthEventPoints||0,councilBonus=nextMonth>1?400:0;
  const rating=researchPoints+eventPoints+councilBonus+input.regionalNet;
  const threshold=economy.thresholds[1];
  const scientists=s.scientists+s.transfers.filter(p=>p.type==="scientist").reduce((n,p)=>n+p.count,0);
  const payroll=scientists*economy.scientistSalary+s.engineers*economy.engineerSalary;
  const facilities=s.grid.reduce((n,f)=>{assert(economy.facilities[f.id],"FACILITY_UPKEEP_UNKNOWN");return n+economy.facilities[f.id].monthlyCost;},0);
  const craft=data.forwardStartingBase.crafts.reduce((n,c)=>{assert(Number.isInteger(economy.craftRent[c.type]));return n+economy.craftRent[c.type];},0);
  const maintenance=payroll+facilities+craft+input.otherMaintenance;
  const bonus=Math.max(0,Math.trunc(rating*economy.performanceFactor));
  const before=s.world.funds,after=before+input.countryFunding-maintenance+bonus;
  const loss=rating<=threshold&&s.monthlyLedger.at(-1).rating<=threshold;
  const debt=after<=economy.defeatFunds;
  assert(!loss,"CONDITIONAL_RATING_DEFEAT");
  assert(!(debt&&s.monthlyLedger.at(-1).debtWarning),"CONDITIONAL_DEBT_DEFEAT");
  // Native selects month scripts before financial/report payout; the event
  // is queued and only credited after the selected countdown elapses.
  if(eventScenario&&nextMonth===2)queueEvent(s,nextMonth,rating,after);
  s.world.funds=after;s.world.month=nextMonth;
  const row={month:nextMonth,before,countryFunding:input.countryFunding,maintenance,payroll,facilities,craft,otherMaintenance:input.otherMaintenance,researchIds:discovered,researchPoints,eventPoints,councilBonus,regionalNet:input.regionalNet,rating,threshold,bonus,after,debtWarning:debt,conditional:true,eventScheduler:eventScenario?"ONE_EXPLICIT_SCRIPT_ONLY":"NO_SELECTED_EVENT_SCENARIO",countryFundingChanges:"NOT_SIMULATED"};
  s.monthlyLedger.push(row);s.monthResearchIds=[];s.monthEventPoints=0;record(s,"monthlySettlement",row);
 }
 function queueEvent(s,month,score,projectedFunds){
  const e=economy.event;
  assert(e.id==="STR_DRINKING_BINGE"&&e.script==="STR_DRINKING_BINGE_1"&&e.firstMonth<=month&&e.executionOdds===6&&e.weight===e.totalWeight&&e.points===125);
  const rollMinutes=30,countdown=Math.max(60,Math.floor((e.timer+rollMinutes)/30)*30);
  assert(rollMinutes<=e.timerRandom&&countdown===90);
  const p={id:e.id,script:e.script,month,score,projectedFunds,scheduled:s.elapsedHours,due:s.elapsedHours+1,countdown,rollMinutes,conditional:true};
  s.eventQueue.push(p);s.world.generatedEvents[e.id]=Number(s.world.generatedEvents[e.id]||0)+1;
  record(s,"eventScheduled",p);
 }
 function eventHour(s){
  for(const p of [...s.eventQueue])if(p.due<=s.elapsedHours){
   const e=economy.event;s.monthEventPoints+=e.points;s.world.funds+=e.funds;
   for(const [id,count] of Object.entries(e.items))s.transfers.push({type:"item",id,count,due:s.elapsedHours+1,cost:0,sourceEvent:e.id});
   s.eventQueue=s.eventQueue.filter(x=>x!==p);
   record(s,"eventResolved",{...p,points:e.points,funds:e.funds,items:e.items,deliveryDue:s.elapsedHours+1,conditional:true});
  }
 }
 function tick(s){
  assert(!s.world.pendingFree,"UNRESOLVED_FREE_RESEARCH");
  // Atomic day: if the legacy completion adapter rejects a conflict,
  // preserve the predecessor rather than publishing a half-completed day.
  const t=structuredClone(s);
  const next=t.elapsedHours+24-((12+t.elapsedHours)%24);
  assert(next<limitHours,"MONTH_BOUNDARY_UNMODELED");
  // Deliveries and personnel at the same midnight are handled after daily work.
  // Research-grant deliveries in the predecessor must be strictly before midnight.
  assert(!t.deliveryDue.some(d=>d===next),"MIDNIGHT_LAB_DELIVERY_ORDER_UNMODELED");
  // Hourly native order: transfer arrivals, then production. At midnight
  // daily construction/research precedes the hourly handler.
  while(t.elapsedHours+1<next){
   const hour=t.elapsedHours+1;
   deliver(t,hour);resourceArrivals(t,hour);t.elapsedHours=hour;productionHour(t);eventHour(t);
  }
  t.elapsedHours=next;
  if(new Date(rootsStart+next*3600000).getUTCDate()===1)settleMonth(t);
  constructionDay(t);
  for(const p of t.projects)p.spent+=p.assigned;
  record(t,"researchDay",{projects:structuredClone(t.projects)});
  const finished=t.projects.filter(p=>p.spent>=p.cost);
  for(const p of finished)complete(t,p);
  for(const p of [...t.projects])if(t.world.disabled.has(p.id))cancel(t,p.id,"NATIVE_DISABLED");
  resourceArrivals(t,next);productionHour(t);eventHour(t);Object.assign(s,t);
 }
 function flush(s){
  if(!s.deliveryDue.length)return;
  const until=s.deliveryDue.at(-1),next=s.elapsedHours+24-((12+s.elapsedHours)%24);
  assert(until<next&&until<limitHours,"DELIVERY_REQUIRES_DAY_ADVANCE");
  const t=structuredClone(s);while(t.elapsedHours<until){const h=t.elapsedHours+1;deliver(t,h);resourceArrivals(t,h);t.elapsedHours=h;productionHour(t);eventHour(t);}Object.assign(s,t);
 }
 return {start,options,begin,assign,cancel,tick,flush,available,stamp,build,hire,buy,extract,sell};
}
