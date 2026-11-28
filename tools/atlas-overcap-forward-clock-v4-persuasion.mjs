// V4.9: conditional rank thresholds, social research, 960-hour expedition and persuasion.
// Native archive: ResearchInfoState.cpp:48-62,160-166; Base.cpp:1311-1335;
// GeoscapeState.cpp:2447-2514,2686-2701. January-only, no external inputs.
// Completion uses V3's stricter current-world eligibility; unresolved native
// conflicts stop the witness rather than bypassing the verifier.
import assert from "node:assert/strict";
import {createForwardResearch} from "./atlas-overcap-forward-research-v3.mjs";
import {createElectronicsMissionSupply} from "./atlas-overcap-forward-electronics-mission-v3.mjs";
import {createGdxBridge} from "./atlas-overcap-forward-gdx-bridge-v3.mjs";
import {applyOriginWitnessStep} from "../public/soldiers/modern/origin-witness.js";
import {exactStateHash} from "./origin-pair-exact-prefix-checkpoint.mjs";
const rootsStart=Date.UTC(2601,0,1,12),boundary=Date.UTC(2602,2,1)-rootsStart;
const limitHours=boundary/3600000;
const qty=(w,id)=>Number(w.items[id]||0);
export function createPersuasionClock(data,{labCapacity=12,quarters=50,budget=325000,facilityFields,itemFields,manufactureFields,sellCoefficient=100,economy,monthlyInput,eventScenario=false,missionSource,missionTiming,missionMode='none',bridgeSource,bridgeTiming,nurseEvent,bridgeMode='none',captainSource,orderMode='strict',persuasionSource}={}){
 const engine=createForwardResearch(data,{maxMonth:15}),rules=data.researchRules,recipe=data.forwardJunk.recipe;
 const missionSupply=createElectronicsMissionSupply(data,engine,missionSource),packRecipe=missionSource.recipe;
 const bridge=createGdxBridge(data,engine,bridgeSource);
 const extraRecipes=new Map(persuasionSource.recipes.map(r=>[r.id,r]));
 for(const r of extraRecipes.values()){
  const raw=manufactureFields[r.id];assert(raw&&raw.time===r.time&&raw.cost===r.cost&&raw.space===r.space);
  assert.deepEqual(raw.requiredItems,r.inputs);assert.deepEqual(raw.producedItems,r.fixed);
  assert.deepEqual(raw.randomProducedItems,r.outcomes.map(o=>[o.weight,o.items]));
  assert(!raw.transferTimes&&!raw.requiredCrafts&&!raw.spawnedPersonType&&!raw.producedCraft);
 }
 const packRaw=manufactureFields[packRecipe.id];assert(packRaw&&packRaw.time===packRecipe.time&&packRaw.cost===packRecipe.cost&&packRaw.space===packRecipe.space);
 assert.deepEqual(packRaw.requiredItems,packRecipe.inputs);assert.deepEqual(packRaw.producedItems,packRecipe.fixed);assert.deepEqual(packRaw.randomProducedItems,packRecipe.outcomes.map(o=>[o.weight,o.items]));
 assert(!packRaw.transferTimes&&!packRaw.requiredCrafts&&!packRaw.spawnedPersonType&&!packRaw.producedCraft);
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
   const selectedRecipe=extraRecipes.get(p.id)||(p.id===packRecipe.id?packRecipe:recipe);
   const outputs={...selectedRecipe.fixed};
   for(const [id,n] of Object.entries(selectedRecipe.outcomes[p.outcome].items))outputs[id]=(outputs[id]||0)+n;
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
  if(action.type==="eventResearch"){
   const r=applyOriginWitnessStep(before,action,data);assert(r.ok,r.reason);s.world=r.world;
  }else if(action.type==="sourceGdxOrder")s.world=bridge.apply(before,action,s.firstRoot).world;
  else s.world=(action.type==="sourceMissionRecovery"?missionSupply:action.type==="sourceGdxCapture"?bridge:engine).apply(before,action,s.firstRoot).world;
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
   const opts=options(s).filter(x=>x.action.type==="freeResearch");
   const preferred={STR_ACADEMY_NURSE:"STR_GDX_001",STR_SECTOID_SOLDIER:"STR_ELECTRONIC_PIECES",STR_PARTY:"CIVILIAN_YOUNG_UBER",STR_SOCIALIZING:"STR_BEASTMEN",STR_SECTOID_LEADER:"STR_MIND_PROBE"}[s.world.pendingFree.source];
   const o=opts.find(x=>x.action.research===preferred)||opts[0];assert(o,"FREE_RESEARCH_UNRESOLVED");apply(s,o.action);
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
  if(p.held&&["STR_ACADEMY_NURSE","STR_SECTOID_SOLDIER","STR_SECTOID_MEDIC","STR_SECTOID_LEADER"].includes(p.sample)&&!p.returns)s.containmentAssumedFree++;
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
  if(nextMonth===4&&missionMode!=="none")queueMissions(s);
  if(nextMonth===6&&bridgeMode!=="none")queueBridge(s,rating,after);
  if(orderMode==="late_captain_recovery")queueCaptain(s);
  queuePersuasion(s,rating);
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
 // Mission scheduler projection. Native calls the mission script during
 // time1Month, before daily work and the same-boundary 30-minute handler.
 // A selected delay of 1050/2490 minutes yields 17/41 hours to the first wave.
 // Geography, mission table availability, flight and victory remain explicit
 // external conditions, never converted into certified campaign evidence.
 function queueMissions(s){
  for(const m of missionSource.missions){
   const opt=missionSupply.options(s.world,s.firstRoot).find(x=>x.action.type==="sourceMissionRecovery"&&x.action.source===m.id);
   if(!opt){record(s,"missionNotScheduled",{id:m.id,reason:"SOURCE_GATE_OR_CONTEXT_UNRESOLVED"});continue;}
   const t=missionTiming[m.id],delay=t.selectedDelay;
   assert(delay>=t.startDelay&&delay<=t.startDelay+t.randomDelay&&delay%60===30);
   const appears=s.elapsedHours+(delay-30)/60,expires=appears+t.durationMin;
   const p={id:m.id,action:opt.action,deployment:opt.evidence.deployment,script:opt.evidence.missionScript,scheduled:s.elapsedHours,appears,expires,arrive:appears+6,returnDue:appears+12,phase:"scheduled",conditional:true,evidence:opt.evidence,timing:t};
   assert(p.returnDue<expires,"SELECTED_ROUND_TRIP_OUTSIDE_SITE_WINDOW");
   s.missionQueue.push(p);record(s,"missionScheduled",{id:p.id,deployment:p.deployment,script:p.script,appears,expires,selectedDelay:delay,executionOdds:opt.evidence.executionOdds,conditional:true});
  }
 }
 function missionHour(s){
  for(const p of [...s.missionQueue]){
   if(p.phase==="scheduled"&&s.elapsedHours>=p.appears){
    p.phase="appeared";record(s,"missionAppeared",{id:p.id,deployment:p.deployment,expires:p.expires,conditional:true});
   }
   if(p.phase==="appeared"&&missionMode==="recover"&&s.elapsedHours>=p.arrive){
    assert(!s.missionQueue.some(q=>q!==p&&q.phase==="returning"),"CRAFT_OVERLAP");
    assert(s.elapsedHours<p.expires,"SITE_EXPIRED");
    const current=missionSupply.options(s.world,s.firstRoot).find(o=>o.action.type==="sourceMissionRecovery"&&o.action.source===p.id);
    assert(current,"RECOVERY_GATE_CHANGED");
    p.phase="returning";record(s,"missionVictoryAssumed",{id:p.id,departure:p.appears,arrival:p.arrive,returnDue:p.returnDue,combatScore:null,loot:p.evidence.loot,conditions:p.evidence.assumptions,conditional:true});
   }
   if(p.phase==="returning"&&s.elapsedHours>=p.returnDue){
    const oldStock=Object.fromEntries(Object.keys(p.evidence.loot).map(id=>[id,qty(s.world,id)]));
    apply(s,p.action);free(s);
    for(const [id,n] of Object.entries(p.evidence.loot))assert.equal(qty(s.world,id),oldStock[id]+n);
    const receipt={id:p.id,deployment:p.deployment,script:p.script,appeared:p.appears,arrival:p.arrive,returned:s.elapsedHours,loot:p.evidence.loot,combatScore:null,actualDebrief:false,conditional:true,assumptions:p.evidence.assumptions};
    s.missionReceipts.push(receipt);s.missionQueue=s.missionQueue.filter(x=>x!==p);record(s,"missionRecovery",receipt);
   }
   if(p.phase==="appeared"&&s.elapsedHours>=p.expires){
    s.missionQueue=s.missionQueue.filter(x=>x!==p);record(s,"missionExpired",{id:p.id,deployment:p.deployment,combatScore:null,loot:{},conditional:true});
   }
  }
 }
 function extractBackpack(s,assigned=5){
  assert(!s.industry.length&&Number.isInteger(assigned)&&assigned>0&&assigned<=s.engineers&&assigned+packRecipe.space<=s.workshopCapacity,"WORKSHOP_CAPACITY");
  const o=missionSupply.options(s.world,s.firstRoot).find(o=>o.action.type==="sourceMissionSampleExtraction");assert(o,"BACKPACK_EXTRACTION_GATE");
  // RuleManufacture::haveEnoughMoneyForOneMoreUnit permits zero cost even in debt.
  if(packRecipe.cost>0)checkFunds(s,packRecipe.cost);
  for(const [id,n] of Object.entries(packRecipe.inputs)){assert(qty(s.world,id)>=n);s.world.items[id]-=n;}
  s.world.funds-=packRecipe.cost;
  const p={id:packRecipe.id,assigned,spent:0,effort:packRecipe.time,outcome:packRecipe.stunOutcome,weight:o.evidence.weight,totalWeight:o.evidence.totalWeight,started:s.elapsedHours,cost:packRecipe.cost,inputs:packRecipe.inputs};
  s.industry.push(p);record(s,"manufactureStart",{...p,funds:s.world.funds,conditional:true});
 }
 function queueBridge(s,rating,projectedFunds){
  const c=bridgeSource.capture, opt=bridge.options(s.world,s.firstRoot).find(o=>o.action.type==="sourceGdxCapture");
  if(opt){
   const t=bridgeTiming,appears=s.elapsedHours+(t.selectedDelay-30)/60;
   assert(t.selectedDelay>=t.startDelay&&t.selectedDelay<=t.startDelay+t.randomDelay&&t.selectedDelay%60===30);
   const p={kind:"capture",id:c.id,action:opt.action,evidence:opt.evidence,scheduled:s.elapsedHours,appears,arrive:appears+6,returnDue:appears+12,expires:appears+t.durationMin,phase:"scheduled"};
   assert(p.returnDue<p.expires);s.bridgeQueue.push(p);
   record(s,"captureScheduled",{...p,conditional:true,combatScore:null});
  }
  if(bridgeMode==="capture_and_nurse"){
   const e=nurseEvent;
   assert(e.script.researchPositive.every(id=>s.world.researched.has(id)&&!s.world.disabled.has(id)));
   assert(e.script.firstMonth<=s.world.month&&rating>=e.script.otherConditions.minScore&&rating<=e.script.otherConditions.maxScore,"NURSE_EVENT_SCORE_GATE");
   const minutes=Math.max(60,Math.floor((e.timer+e.selectedRoll)/30)*30);assert(minutes===1050&&e.selectedRoll<=e.timerRandom);
   const p={kind:"nurse",id:e.id,script:e.script.script,scheduled:s.elapsedHours,due:s.elapsedHours+(minutes-30)/60,countdown:minutes,rating,projectedFunds,conditional:true};
   s.bridgeQueue.push(p);s.world.generatedEvents[e.id]=Number(s.world.generatedEvents[e.id]||0)+1;
   record(s,"nurseEventScheduled",p);
  }
 }
 function bridgeHour(s){
  for(const p of [...s.bridgeQueue]){
   if(p.kind==="capture"){
    if(p.phase==="scheduled"&&s.elapsedHours>=p.appears){p.phase="appeared";record(s,"captureAppeared",{id:p.id,expires:p.expires,conditional:true});}
    if(p.phase==="appeared"&&s.elapsedHours>=p.arrive){assert(s.elapsedHours<p.expires);p.phase="returning";record(s,"captureVictoryAssumed",{id:p.id,combatScore:null,conditional:true,assumptions:p.evidence.assumptions});}
    if(p.phase==="returning"&&s.elapsedHours>=p.returnDue){
     const c=bridgeSource.capture;assert(s.world.facilities.has(c.requiredFacility)&&s.containmentAssumedFree>=1,"CONTAINMENT_NOT_ESTABLISHED");
     apply(s,p.action);free(s);s.containmentAssumedFree--;
     s.bridgeQueue=s.bridgeQueue.filter(x=>x!==p);
     record(s,"captureRecovered",{id:p.id,loot:c.loot,combatScore:null,conditional:true,freeSlotAssumed:true,assumptions:p.evidence.assumptions});
    }
   }else if(p.due<=s.elapsedHours){
    const e=nurseEvent;assert(s.containmentAssumedFree>=1,"CONTAINMENT_NOT_ESTABLISHED");
    s.containmentAssumedFree--;s.monthEventPoints+=e.points;s.world.funds+=e.funds;
    for(const [id,count] of Object.entries(e.items))s.transfers.push({type:"item",id,count,due:s.elapsedHours+1,cost:0,sourceEvent:e.id});
    s.bridgeQueue=s.bridgeQueue.filter(x=>x!==p);record(s,"nurseEventResolved",{id:e.id,points:e.points,funds:e.funds,items:e.items,conditional:true,deliveryDue:s.elapsedHours+1});
   }
  }
 }
 // V4.7 omitted the initial guaranteed personality event. Do not rewrite
 // that prefix or claim a certified campaign. This branch selects a later
 // eligible monthly execution of the same repeatable script (negative gate).
 function queueCaptain(s){
  const month=s.world.month;
  const specs=month===8?[["STR_CAPTAIN_PERSONALITY_TEST",null]]:month===9?[["STR_CAPTAIN_JACKDUMB_EVENTS_1","STR_SECTOID_MEDIC"],["STR_CAPTAIN_JACKDUMB_EVENTS_2","STR_SECTOID_LEADER"]]:month===10?[["STR_GDX_EVENT_ORDERS_2",null]]:[];
  for(const [scriptId,item] of specs){
   const sc=captainSource.scripts.find(x=>x.script===scriptId),e=captainSource.events.find(x=>x.id===sc.event);assert(sc&&e);
   const missing=sc.researchPositive.filter(id=>!s.world.researched.has(id)||s.world.disabled.has(id));
   if(month<sc.firstMonth||(sc.lastMonth>=0&&month>sc.lastMonth)||missing.length||sc.researchNegative.some(id=>s.world.researched.has(id))){
    record(s,"captainEventBlocked",{script:scriptId,event:e.id,missing,month,firstMonth:sc.firstMonth});continue;
   }
   if(item)assert(e.pool.includes(item));
   const selectedRoll=scriptId.endsWith("_2")&&item?150:30;
   const minutes=Math.max(60,Math.floor((e.timer+selectedRoll)/30)*30);
   assert(selectedRoll<=e.timerRandom&&minutes%60===30);
   // 30-minute event handler also runs at the scheduling boundary.
   const p={id:e.id,script:scriptId,item,month,scheduled:s.elapsedHours,due:s.elapsedHours+(minutes-30)/60,countdownMinutes:minutes,selectedRoll,executionOdds:sc.executionOdds,weight:sc.weight,totalWeight:sc.totalWeight,poolSize:e.pool.length,poolWeight:item?e.pool.filter(x=>x===item).length:null,conditional:true};
   s.captainQueue.push(p);record(s,"captainEventScheduled",p);
  }
 }
 function captainHour(s){
  for(const p of [...s.captainQueue])if(p.due<=s.elapsedHours){
   const e=captainSource.events.find(x=>x.id===p.id);
   if(e.interruptResearch&&s.world.researched.has(e.interruptResearch)){
    s.captainQueue=s.captainQueue.filter(x=>x!==p);record(s,"captainEventInterrupted",p);continue;
   }
   if(p.item){
    assert(s.containmentAssumedFree>=1&&s.world.facilities.has("STR_JAIL"),"CONTAINMENT_NOT_ESTABLISHED");
    s.containmentAssumedFree--;
    s.world.generatedEvents[e.id]=Number(s.world.generatedEvents[e.id]||0)+1;
    s.transfers.push({type:"item",id:p.item,count:1,due:s.elapsedHours+1,cost:0,sourceEvent:e.id});
   }else if(e.research.length){
    assert.equal(e.research.length,1);
    if(e.id==="STR_GDX_EVENT_ORDERS_2"){
     const opt=bridge.options(s.world,s.firstRoot).find(o=>o.action.type==="sourceGdxOrder"&&o.action.event===e.id);assert(opt,"ORDER_GATE_AT_EXPIRY");apply(s,opt.action);
    }else apply(s,{type:"eventResearch",research:e.research[0],event:e.id,script:p.script,assumeOutcome:true});
    free(s);
   }
   s.monthEventPoints+=e.points;s.captainQueue=s.captainQueue.filter(x=>x!==p);
   record(s,"captainEventResolved",{...p,points:e.points,research:e.research,deliveryDue:p.item?s.elapsedHours+1:null,conditional:true});
  }
 }
 // Conditional monthly source selections. Rating is from the just-closed
 // bucket, including the native 400 council bonus after the first month.
 function queuePersuasion(s,rating){
  const month=s.world.month;
  const selected=month===11?[
   ["STR_CAPTAIN_JACKLAZY_EVENTS_1","STR_VODKA","STR_VODKA"],
   ["STR_CAPTAIN_JACKLAZY_EVENTS_2",null,null],
   ["STR_NOGREEN_YESGOLD_EVENTS",null,null],
   ["STR_CAPTAINS_RANK_01", "STR_CAPTAINS_RANK_01",null]
  ]:month===12?[["STR_CAPTAINS_RANK_02","STR_CAPTAINS_RANK_02",null]]:[];
  for(const [id,research,item] of selected){
   const sc=persuasionSource.scripts.find(x=>x.id===id),e=persuasionSource.events.find(x=>x.id===sc.event);assert(sc&&e);
   const missing=sc.positive.filter(k=>!s.world.researched.has(k)||s.world.disabled.has(k));
   const blocked=month<sc.firstMonth||(sc.lastMonth>=0&&month>sc.lastMonth)||missing.length||sc.negative.some(k=>s.world.researched.has(k))||(sc.minScore!==null&&rating<sc.minScore);
   if(blocked){record(s,"persuasionEventBlocked",{id,event:e.id,month,rating,minScore:sc.minScore,missing});continue;}
   if(research)assert(e.research.includes(research));if(item)assert(e.pool.includes(item));
   const roll=30,minutes=Math.max(60,Math.floor((e.timer+roll)/30)*30);
   assert(roll<=e.timerRandom&&minutes%60===30);
   const p={id:e.id,script:id,month,rating,minimumScore:sc.minScore,scheduled:s.elapsedHours,due:s.elapsedHours+(minutes-30)/60,executionOdds:sc.executionOdds,weight:sc.weight,totalWeight:sc.totalWeight,research,item,conditional:true};
   s.persuasionQueue.push(p);record(s,"persuasionEventScheduled",p);
  }
 }
 function persuasionHour(s){
  for(const p of [...s.persuasionQueue])if(p.due<=s.elapsedHours){
   const e=persuasionSource.events.find(x=>x.id===p.id);
   if(e.interrupt&&s.world.researched.has(e.interrupt)){s.persuasionQueue=s.persuasionQueue.filter(x=>x!==p);continue;}
   if(p.research&&!s.world.researched.has(p.research)){
    apply(s,{type:"eventResearch",research:p.research,event:e.id,script:p.script,assumeOutcome:true});free(s);
   }else s.world.generatedEvents[e.id]=Number(s.world.generatedEvents[e.id]||0)+1;
   const items={...e.fixed};if(p.item)items[p.item]=(items[p.item]||0)+1;
   for(const [id,count] of Object.entries(items))s.transfers.push({type:"item",id,count,due:s.elapsedHours+1,cost:0,sourceEvent:e.id});
   s.monthEventPoints+=e.points;s.world.funds+=e.funds;
   s.persuasionQueue=s.persuasionQueue.filter(x=>x!==p);
   record(s,"persuasionEventResolved",{...p,items,points:e.points,funds:e.funds,conditional:true});
  }
 }
 function expeditionOrder(s){
  const p=persuasionSource.purchase,raw=itemFields[p.id];
  // items-v2 omits transferTime; the producer validates the exact anchored raw block.
  assert(raw&&raw.costBuy===p.cost&&(raw.transferTime===undefined||raw.transferTime===p.transferHours)&&raw.size===p.size);
  assert(p.requires.every(id=>s.world.researched.has(id)&&!s.world.disabled.has(id)));
  assert(!s.expeditionOrdered&&s.expeditionFreeStorageAssumed>=p.size,"EXPEDITION_STORAGE_GATE");
  checkFunds(s,p.cost);s.world.funds-=p.cost;s.expeditionOrdered=true;
  const order={type:"item",id:p.id,count:1,due:s.elapsedHours+p.transferHours,cost:p.cost,transferHours:p.transferHours,storageAssumed:p.size};
  s.transfers.push(order);record(s,"purchaseOrder",{...order,transferType:order.type,funds:s.world.funds,conditional:true});
 }
 function expeditionManufacture(s,id,outcome,assigned=5){
  const r=extraRecipes.get(id);assert(r&&r.requires.every(k=>s.world.researched.has(k)&&!s.world.disabled.has(k))&&r.functions.every(k=>s.world.baseFunctions.has(k)));
  assert(!s.industry.length&&Number.isInteger(assigned)&&assigned>0&&assigned<=s.engineers&&assigned+r.space<=s.workshopCapacity);
  const result=r.outcomes[outcome];assert(result&&result.weight>0);
  if(r.cost>0)checkFunds(s,r.cost);
  for(const [k,n] of Object.entries(r.inputs))assert(qty(s.world,k)>=n,"MANUFACTURE_INPUT");
  for(const [k,n] of Object.entries(r.inputs))s.world.items[k]-=n;
  s.world.funds-=r.cost;
  const p={id,assigned,spent:0,effort:r.time,outcome,weight:result.weight,totalWeight:r.totalWeight,started:s.elapsedHours,cost:r.cost,inputs:r.inputs};
  s.industry.push(p);record(s,"manufactureStart",{...p,funds:s.world.funds,conditional:true});
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
   deliver(t,hour);resourceArrivals(t,hour);t.elapsedHours=hour;productionHour(t);eventHour(t);missionHour(t);bridgeHour(t);captainHour(t);persuasionHour(t);
  }
  t.elapsedHours=next;
  if(new Date(rootsStart+next*3600000).getUTCDate()===1)settleMonth(t);
  constructionDay(t);
  for(const p of t.projects)p.spent+=p.assigned;
  record(t,"researchDay",{projects:structuredClone(t.projects)});
  const finished=t.projects.filter(p=>p.spent>=p.cost);
  for(const p of finished)complete(t,p);
  for(const p of [...t.projects])if(t.world.disabled.has(p.id))cancel(t,p.id,"NATIVE_DISABLED");
  resourceArrivals(t,next);productionHour(t);eventHour(t);missionHour(t);bridgeHour(t);captainHour(t);persuasionHour(t);Object.assign(s,t);
 }
 function flush(s){
  if(!s.deliveryDue.length)return;
  const until=s.deliveryDue.at(-1),next=s.elapsedHours+24-((12+s.elapsedHours)%24);
  assert(until<next&&until<limitHours,"DELIVERY_REQUIRES_DAY_ADVANCE");
  const t=structuredClone(s);while(t.elapsedHours<until){const h=t.elapsedHours+1;deliver(t,h);resourceArrivals(t,h);t.elapsedHours=h;productionHour(t);eventHour(t);missionHour(t);bridgeHour(t);captainHour(t);persuasionHour(t);}Object.assign(s,t);
 }
 return {start,options,begin,assign,cancel,tick,flush,available,stamp,build,hire,buy,extract,sell,extractBackpack,expeditionOrder,expeditionManufacture};
}
