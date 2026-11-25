// Source-backed early Codex replacement. This is a conditional replay
// adapter, NOT an OXCE save or a proof of game-start economic solvency.
// The original witness remains immutable. No source grants are admitted
// unless their specific source action is recorded alongside the replay.
import assert from "node:assert/strict";
import {key} from "./population-research-career-core.mjs";
import {foundationWorld} from "../public/soldiers/modern/origin-witness.js";
import {createFoundationResearchPlanner} from "../public/soldiers/modern/foundation-research-planner.js";
import {eventScriptVerdict} from "../public/soldiers/modern/event-chronology.js";
import {countdownDomain} from "./atlas-initial-event-schedule.mjs";
import {member} from "./population-growth-replay-core.mjs";
const arr=x=>Array.isArray(x)?x:[],num=x=>Number(x)||0,active=(w,k)=>w.researched.has(k)&&!w.disabled.has(k);
const fixedReward=e=>{const o={...e.everyMultiItemList};for(const k of arr(e.everyItemList))o[k]=(o[k]||0)+1;return o;};
const stamp=(w,replay)=>{const m=member(w);if(!m)return null;return {finish:replay.finish(w),type:m.state.soldierType,history:[...m.state.history].sort(),traits:m.state.traitCounts||m.state.bonusCounts||null,state:key(m.state)};};
export function createCodexPrefixProducer({data,index,early,economy,eventIndex,replay}){
 const base=early.startBase,date=early.startDate,epoch=Date.UTC(date.year,date.month-1,date.day,date.hour||0),knownFunctions=new Set(base.facilities.flatMap(f=>arr(index.facilities.get(f.type)?.provideBaseFunc)));
 const starterWork=base.facilities.reduce((s,f)=>s+num(index.facilities.get(f.type)?.workshops),0);
 const starterStorage=base.facilities.reduce((s,f)=>s+num(index.facilities.get(f.type)?.storage),0);
 const cache=new Map(),planners=new Map();
 function planner(difficulty){if(!planners.has(difficulty))planners.set(difficulty,createFoundationResearchPlanner(data,{difficulty,maxAttempts:400,maxDepth:35,maxSteps:450,methodLimit:20,collectFailures:true}));return planners.get(difficulty);}
 const boundary=m=>(Date.UTC(date.year,date.month-1+m,1)-epoch)/3600000;
 const dayEnd=(hour,days)=>days?(Math.floor((epoch+hour*3600000)/86400000)+1)*24-epoch/3600000+(days-1)*24:hour;
 function prefix(actions,first,difficulty,variant){
  const target=Object.keys(actions[first].items||{}).find(k=>/^STR_CODEX_(RED|GREEN|GOLD|GRAY)$/.test(k));
  const color=target?.slice(10),recipe=index.recipes.get("STR_USE_DRILL_"+color);
  assert(recipe&&Object.keys(recipe.outputs).length===1&&Object.values(recipe.outputs)[0]===1);
  const anomaly=index.raw(Object.keys(recipe.outputs)[0]),eventIds=[anomaly+"_TENSION_EVENT",anomaly+"_EVENT"];
  const cacheKey=key([actions.slice(0,first+1),difficulty,variant,recipe.id]);
  if(cache.has(cacheKey))return cache.get(cacheKey);
  let w=foundationWorld(),hour=0,month=0,workshop=starterWork,cost=0,ready=null;
  const finite=variant.finance==="FINITE_CASH",scientists=variant.scientists??base.scientists,engineers=base.engineers;
  assert(Number.isInteger(scientists)&&scientists>0&&scientists<=base.scientists);
  let cash=early.openingCash,minimumCash=cash,sales=0,productionExpenses=0;
  const cashLedger=[],monthly=[],incomeProduction=[],maxMonths=variant.maxMonths??24;
  const originalSoldiers=typeof base.randomSoldiers==="number"?base.randomSoldiers:Object.values(base.randomSoldiers||{}).reduce((s,n)=>s+n,0);
  const steps=[],schedule=[],provenance=[],gates=[],open=[],stock={...base.items},built=base.facilities.map(f=>({...f})),grid=Array.from({length:6},()=>Array(6).fill(null)),budget=[];
  const append=a=>{w=replay.apply(w,a);steps.push(a);};
  for(const f of built){const r=index.facilities.get(f.type);assert(r);for(let y=f.y;y<f.y+(r.sizeY||r.size||1);y++)for(let x=f.x;x<f.x+(r.sizeX||r.size||1);x++){assert(!grid[y][x]);grid[y][x]=f.type;}}
  function pay(amount,reason,details={}){
   if(!finite)return;
   assert(Number.isSafeInteger(amount));
   if(cash+amount<0)throw Error("FINITE_PREFIX_CASH_SHORTFALL:"+reason+":"+Math.max(0,-cash-amount));
   cash+=amount;minimumCash=Math.min(minimumCash,cash);cashLedger.push({hour,month,amount,reason,cash,...details});
  }
  function maintenance(){
   const facility=built.reduce((s,f)=>s+num(index.facilities.get(f.type)?.monthlyCost),0);
   const personnel=engineers*economy.g.engineerSalary+scientists*economy.g.scientistSalary+originalSoldiers*early.defaultSalary;
   const inventory=Object.entries(stock).reduce((s,[id,n])=>s+n*(num(index.items.get(id)?.monthlySalary)+num(index.items.get(id)?.monthlyMaintenance)),0);
   const craft=arr(base.crafts).reduce((s,c)=>s+num(index.crafts.get(c.type)?.rentCost)+Object.entries(c.items||{}).reduce((v,[id,n])=>v+n*(num(index.items.get(id)?.monthlySalary)+num(index.items.get(id)?.monthlyMaintenance)),0),0);
   return {facility,personnel,inventory,craft,total:facility+personnel+inventory+craft};
  }
  const safeIncome=[...index.recipes.values()].filter(a=>{
   const r=economy.manufacture.get(a.id);
   return r&&a.hours>0&&!Object.keys(a.inputs).length&&!a.randomExtras&&Object.keys(a.outputs).length&&Object.keys(a.outputs).every(k=>k.startsWith("ITEM:"))&&!r.spawnedPersonType&&!r.spawnedSoldier&&!r.spawnedItem&&!r.spawnedEvent&&!r.randomEvents&&!r.eventWeights&&!r.points&&!arr(r.transferTimes).length;
  }).map(a=>({...a,revenue:Object.entries(a.outputs).reduce((s,[k,n])=>s+Math.trunc(num(index.items.get(index.raw(k))?.costSell)*economy.g.sellCoefficients[difficulty]/100)*n,0)})).filter(a=>a.revenue>a.cost);
  function earn(end){
   const a=safeIncome.filter(a=>a.research.every(k=>active(w,k))&&a.functions.every(f=>knownFunctions.has(f))&&workshop>a.space).map(a=>({...a,assigned:Math.min(engineers,workshop-a.space)})).filter(a=>a.assigned>0).sort((a,b)=>(b.revenue-b.cost)*b.assigned/b.hours-(a.revenue-a.cost)*a.assigned/a.hours||a.id.localeCompare(b.id))[0];
   if(!a){hour=end;return;}
   const start=hour;let batches=Math.floor((end-start)*a.assigned/a.hours);
   if(a.cost)batches=Math.min(batches,Math.floor(cash/a.cost));
   if(batches>0){
    pay(-batches*a.cost,"incomeManufacture",{id:a.id,batches,assigned:a.assigned});
    productionExpenses+=batches*a.cost;hour=start+Math.ceil(batches*a.hours/a.assigned);
    pay(batches*a.revenue,"incomeSale",{id:a.id,batches});sales+=batches*a.revenue;
    incomeProduction.push({id:a.id,start,end:hour,batches,assigned:a.assigned,engineerHours:batches*a.hours,cost:batches*a.cost,revenue:batches*a.revenue,source:a.source});
   }
   hour=end;
  }
  function advance(to,produce=true){
   assert(to>=hour&&Number.isFinite(to));
   while(hour<to){
    const end=Math.min(to,boundary(month+1),finite?hour+24:Infinity);
    if(finite&&produce)earn(end);else hour=end;
    if(hour===boundary(month+1)){
     if(finite){assert(month<maxMonths,"FINITE_PREFIX_MONTH_BUDGET");const m=maintenance();pay(early.openingCash-m.total,"monthlyFunding",{funding:early.openingCash,...m});monthly.push({month:month+1,hour,cash,funding:early.openingCash,...m});}
     month++;append({type:"advanceMonth",month});
    }
   }
  }
  function awaitCash(required){
   if(!finite)return;
   let previous=cash,stale=0;
   while(cash<required){
    advance(boundary(month+1));
    stale=cash<=previous?stale+1:0;previous=cash;
    if(stale>=3)throw Error("NO_POSITIVE_FINANCING_PROGRESS");
   }
  }
  function srcGrant(items,functions,source,funds=0){
   if(!Object.keys(items).length&&!functions.length&&!funds)return;
   const a={type:"externalInputs",items,functions,funds,reason:"SOURCE_BOUND_REPLAY_ADAPTER:"+source.kind,assumption:true};
   append(a);provenance.push({step:steps.length,source,items,functions,funds,scope:"SOURCE_PROPOSAL_NOT_RUNTIME_PROOF"});
  }
  function timed(a){
   const start=hour;
   if(a.type==="advanceMonth"){if(a.month>month)advance(boundary(a.month));return;}
   if(a.type==="research"||a.type==="repeatResearch"){
    const r=data.researchRules[a.id];assert(r);const nominal=num(r.cost),work=nominal?Math.max(1,Math.trunc(nominal*variant.costPercent/100)):0;
    const labs=base.facilities.reduce((s,f)=>s+num(index.facilities.get(f.type)?.labs),0),assigned=Math.min(labs,scientists);assert(assigned>0||!work);
    const days=work?Math.ceil(work/assigned):0;advance(dayEnd(hour,days));append(a);schedule.push({type:"RESEARCH",id:a.id,start,end:hour,work,assigned,days});return;
   }
   if(a.type==="eventResearch"){
    const e=eventIndex.events.get(a.event),s=eventIndex.scripts.get(a.script);assert(e&&s);
    // Monthly scripts run only in determineAlienMissions(isNewMonth).
    // At the initial named-base pass month zero is possible; subsequent
    // positive triggers require a later monthly pass, not an instant call.
    if(steps.length&&hour>0)advance(boundary(month+1));
    else if((s.firstMonth||0)>month)advance(boundary(s.firstMonth));
    if((s.firstMonth||0)>month)advance(boundary(s.firstMonth));
    const route=arr(data.eventResearchSources[a.research]).find(x=>x.event===a.event),script=route?.scripts.find(x=>x.script===a.script);assert(script);
    const verdict=eventScriptVerdict({...script,eventId:a.event},{...w,month,difficulty,...(finite?{funds:cash}:{}),triggerItems:stock,triggerFacilities:new Set(built.map(f=>f.type))},{mode:"current"});
    gates.push({event:a.event,script:a.script,month,blocked:verdict.blocked,unknown:verdict.unknown,weight:verdict.weight,totalWeight:verdict.totalWeight});
    assert(!verdict.blocked.length,"EVENT_GATE:"+a.event+":"+verdict.blocked.join(";"));
    const dispatch=hour,delay=countdownDomain(e.timer??30,e.timerRandom??0);
    advance(hour+Math.ceil((variant.delay==="MAX"?delay.maxMinutes:delay.minMinutes)/60));
    append(a);
    if(e.funds<0){cost-=e.funds;budget.push({hour,type:"EVENT_COST",id:a.event,cost:-e.funds});}
    if(num(e.funds))pay(num(e.funds),"eventFunds",{id:a.event});
    schedule.push({type:"MONTHLY_EVENT",id:a.event,script:a.script,dispatchMonth:gates.at(-1).month,dispatch,start,end:hour,countdown:delay,conditional:true});
    return;
   }
   if(a.type==="externalInputs"){
    // Planner may ask for source-start assets. Existing physical stock
    // is reserved once; unbacked resources are explicitly kept open.
    const supported={},unsupported={};for(const [id,n] of Object.entries(a.items||{})){const already=provenance.filter(p=>p.source.kind==="ORIGINAL_START_STOCK_AND_COMPLETED_BASE").reduce((s,p)=>s+(p.items[id]||0),0);const available=Math.max(0,(base.items[id]||0)-already);const take=Math.min(n,available);if(take)supported[id]=take;if(n>take)unsupported[id]=n-take;}
    const fs=arr(a.functions).filter(f=>knownFunctions.has(f)),missing=arr(a.functions).filter(f=>!knownFunctions.has(f));
    srcGrant(supported,fs,{kind:"ORIGINAL_START_STOCK_AND_COMPLETED_BASE",sourceFingerprint:early.evidence.fingerprint});
    if(Object.keys(unsupported).length||missing.length||num(a.funds)){const x={...a,items:unsupported,functions:missing};append(x);open.push({step:steps.length,action:x});}
    return;
   }
   append(a);
  }
  function expandWorkshop(){
   if(workshop>recipe.space)return;
   const choices=[...index.facilities].filter(([id,r])=>num(r.workshops)>0&&r.requires?.length&&r.requires.every(k=>active(w,k))&&arr(r.requiresBaseFunc).every(f=>knownFunctions.has(f))&&!Object.keys(r.buildCostItems||{}).length&&!arr(r.buildOverFacilities).length&&(!r.maxAllowedPerBase||built.filter(f=>f.type===id).length<r.maxAllowedPerBase)&&num(r.workshops)+workshop>recipe.space);
   choices.sort((a,b)=>num(a[1].buildCost)-num(b[1].buildCost)||num(a[1].buildTime)-num(b[1].buildTime)||a[0].localeCompare(b[0]));
   for(const [id,r] of choices){
    const sx=r.sizeX||r.size||1,sy=r.sizeY||r.size||1;
    for(let y=0;y<=6-sy;y++)for(let x=0;x<=6-sx;x++){let ok=true,touch=false;for(let j=y;j<y+sy;j++)for(let i=x;i<x+sx;i++){if(grid[j][i])ok=false;for(const [dx,dy] of [[0,1],[0,-1],[1,0],[-1,0]]){const v=grid[j+dy]?.[i+dx];if(v&&!index.facilities.get(v)?.connectorsDisabled)touch=true;}}
     if(!ok||!touch)continue;
     awaitCash(num(r.buildCost));const start=hour;cost+=num(r.buildCost);budget.push({hour,type:"FACILITY_COST",id,cost:num(r.buildCost)});pay(-num(r.buildCost),"facilityConstruction",{id,x,y});advance(hour+num(r.buildTime)*24);
     for(let j=y;j<y+sy;j++)for(let i=x;i<x+sx;i++)grid[j][i]=id;
     built.push({type:id,x,y,ready:hour});workshop+=num(r.workshops);schedule.push({type:"BUILD_FACILITY",id,x,y,sx,sy,start,end:hour,cost:num(r.buildCost),workshops:workshop,source:index.source("facilities",id)});ready=hour;return;
    }
   }throw Error("WORKSHOP_CAPACITY_OR_LAYOUT_UNRESOLVED");
  }
  try{
   if(finite&&scientists<base.scientists)schedule.push({type:"DISMISS_SCIENTISTS",start:0,end:0,count:base.scientists-scientists,remaining:scientists,source:"OXCE SellState::btnSellClick: TRANSFER_SCIENTIST"});
   for(let i=0;i<first;i++)timed(actions[i]);
   // Seed only the two actual starting objects needed for the drill.
   const requested={};for(const [k,v] of Object.entries(recipe.inputs)){const id=index.raw(k),n=Math.max(0,v-(w.items[id]||0));if(n){assert((stock[id]||0)>=v,"STARTING_DRILL_MATERIAL_MISSING");requested[id]=n;}}
   srcGrant(requested,["SHOP","CPU"].filter(f=>!w.baseFunctions.has(f)&&knownFunctions.has(f)),{kind:"ORIGINAL_START_STOCK_AND_COMPLETED_BASE",sourceFingerprint:early.evidence.fingerprint});
   const q=planner(difficulty).ensure(recipe.research,{world:w,steps:[...steps],trace:[],diagnostics:[]});
   assert(q.ok,q.reason||"PREREQUISITE_PLANNER_FAILED");
   for(const a of q.node.steps.slice(steps.length))timed(a);
   assert(recipe.research.every(k=>active(w,k))&&!w.pendingFree);
   expandWorkshop();
   const start=hour,assigned=Math.min(base.engineers,workshop-recipe.space);assert(assigned>0);
   for(const [k,v] of Object.entries(recipe.inputs)){const id=index.raw(k);assert(stock[id]>=v);stock[id]-=v;}
   awaitCash(recipe.cost);pay(-recipe.cost,"anomalyManufacture",{id:recipe.id});advance(hour+Math.max(1,Math.ceil(recipe.hours/assigned)),false);append({type:"manufacture",item:anomaly,recipe:recipe.id,count:1});stock[anomaly]=(stock[anomaly]||0)+1;cost+=recipe.cost;
   schedule.push({type:"MANUFACTURE_ANOMALY",id:recipe.id,output:anomaly,start,end:hour,assigned,space:recipe.space,capacity:workshop,inputs:recipe.inputs,cost:recipe.cost,source:recipe.source});
   // Research disables the drill dependency, so the one original drill
   // cannot be reused to manufacture another color.
   timed({type:"research",id:anomaly});
   for(let j=0;j<eventIds.length;j++){
    const id=eventIds[j],e=eventIndex.events.get(id),s=eventIndex.scripts.get(id),research=j?"STR_ANOMALY_DEP2":"STR_ANOMALY_DEP";
    assert(e&&s&&e.researchList?.length===1&&e.researchList[0]===research);
    assert((s.executionOdds??100)===100&&Object.values(s.eventWeights["0"]).filter(v=>v>0).length===1&&s.eventWeights["0"][id]>0);
    assert(!e.invert&&!arr(e.randomItemList).length&&!arr(e.randomMultiItemList).length&&!Object.keys(e.weightedItemList||{}).length);
    timed({type:"eventResearch",event:id,script:id,research,assumeOutcome:true});
    const rewards=fixedReward(e);advance(hour+1); // OXCE non-instant delivery
    for(const [k,v] of Object.entries(rewards)){assert(Number.isSafeInteger(v)&&v>0&&index.items.has(k));stock[k]=(stock[k]||0)+v;}
    srcGrant(rewards,[],{kind:"FIXED_EVENT_REWARD",event:id,script:id,source:eventIndex.refs["events|"+id],deliveryHours:1,scope:"CONDITIONAL_ON_DISPATCH_AND_RESOLUTION"});
    schedule.push({type:"EVENT_DELIVERY",id,at:hour,rewards,transferHours:1});
   }
   assert((w.items[target]||0)>=1&&stock[target]>=1&&w.baseFunctions.has("CPU"));
   // The original codex resource grant is replaced, not duplicated.
   const original=actions[first],extra=Object.fromEntries(Object.entries(original.items||{}).filter(([id])=>id!==target));
   if(Object.keys(extra).length||num(original.funds)||arr(original.functions).some(f=>!w.baseFunctions.has(f)))timed({...original,items:extra,functions:arr(original.functions).filter(f=>!w.baseFunctions.has(f))});
   const volume=Object.entries(stock).reduce((s,[id,n])=>s+num(index.items.get(id)?.size)*n,0);
   assert(volume<=starterStorage+1e-7,"PREFIX_STORAGE_CAPACITY");
   if(finite&&cash>num(w.funds))srcGrant({},[],{kind:"CONDITIONAL_PREFIX_CASH_BALANCE",openingCash:early.openingCash,sourceFingerprint:early.evidence.fingerprint,scope:"CONSTANT_COUNTRY_FUNDING_AND_SOURCE_SALES_NOT_ACTUAL_GAME"},cash-num(w.funds));
   const finance=finite?{status:"CONDITIONAL_NONNEGATIVE_PREFIX_CASH",openingCash:early.openingCash,scientists,engineers,countryFunding:"CONSTANT_INITIAL_ROLL_CONDITIONAL",closingCash:cash,minimumCash,sales,productionExpenses,cashLedger,monthly,incomeProduction,externalCashInjection:0}:null;
   const result={status:"SOURCE_BOUND_CODEX_PREFIX",target,anomaly,recipe:recipe.id,variant,difficulty,first,steps,stepHash:key(steps),schedule,gates,provenance,open,stock,built,workshop,initialWorkshop:starterWork,cost,elapsedHours:hour,month,storageVolume:volume,storageCapacity:starterStorage,budget,finance,sourceFingerprint:eventIndex.evidence.fingerprint,scope:"CONDITIONAL_SOURCE_PREFIX_WITH_LOGICAL_REPLAY_ADAPTER",completeCampaigns:0};
   const final={...result,prefixHash:key(result)};cache.set(cacheKey,final);return final;
  }catch(e){const result={status:"PARTIAL_CODEX_PREFIX",target,anomaly,variant,difficulty,first,steps,schedule,gates,provenance,open,month,elapsedHours:hour,reason:String(e.message),finance:finite?{status:"PARTIAL_FINITE_PREFIX_CASH",openingCash:early.openingCash,scientists,engineers,closingCash:cash,minimumCash,sales,cashLedger,monthly,incomeProduction}:null,completeCampaigns:0};cache.set(cacheKey,result);return result;}
 }
 function follow(p,original,originalWorld,beforeSnapshots=null){
  if(p.status!=="SOURCE_BOUND_CODEX_PREFIX")return {status:"PREFIX_UNRESOLVED",processedOriginal:p.first,reason:p.reason};
  let w=replay.replay(p.steps),baseline=beforeSnapshots?null:replay.replay(original.slice(0,p.first+1)),steps=[...p.steps],removed=[],shifted=[],at=p.first+1;
  const append=a=>{w=replay.apply(w,a);steps.push(a);};
  try{
   for(let i=p.first+1;i<original.length;i++){
    at=i+1;const a=original[i],before=beforeSnapshots?beforeSnapshots.get(i):baseline;if(!beforeSnapshots)baseline=replay.apply(baseline,a);
    // Skip only previously completed ordinary research / already granted
    // free award. Never skip repeatResearch or an unhandled pending award.
    if(a.type==="research"&&active(w,a.id)&&!w.pendingFree){removed.push({at,reason:"ALREADY_ACTIVE",id:a.id});continue;}
    if(a.type==="freeResearch"&&active(w,a.research)&&!w.pendingFree){removed.push({at,reason:"ALREADY_AWARDED",id:a.research});continue;}
    if(a.type==="advanceMonth"&&a.month<w.month){shifted.push({at,old:a.month,new:w.month});continue;}
    if(a.type==="externalInputs"){
     const items=Object.fromEntries(Object.entries(a.items||{}).map(([id,n])=>[id,Math.max(0,n-Math.max(0,(w.items[id]||0)-(before.items[id]||0)))]).filter(([,n])=>n>0));
     const functions=arr(a.functions).filter(f=>!w.baseFunctions.has(f)),funds=Math.max(0,num(a.funds)-Math.max(0,num(w.funds)-num(before.funds))),x={...a,items,functions,funds};
     if(key(items)!==key(a.items||{})||functions.length!==arr(a.functions).length||funds!==num(a.funds))removed.push({at,reason:"EXISTING_CONDITIONAL_INVENTORY_OR_FUNCTION",items:Object.fromEntries(Object.entries(a.items||{}).map(([id,n])=>[id,n-(items[id]||0)]).filter(([,n])=>n>0)),functions:arr(a.functions).filter(f=>!functions.includes(f)),funds:num(a.funds)-funds});
     if(!Object.keys(items).length&&!functions.length&&!funds)continue;append(x);continue;
    }
    append(a);
   }
   assert(!w.pendingFree);
   const a=stamp(w,replay),b=stamp(originalWorld,replay),same=key(a?.finish)===key(b?.finish)&&key(a?.history)===key(b?.history)&&key(a?.traits)===key(b?.traits)&&a?.state===b?.state;
   const missing=[...originalWorld.researched].filter(k=>!w.researched.has(k)),newlyDisabled=[...originalWorld.researched].filter(k=>active(originalWorld,k)&&!active(w,k));
   return {status:same&&!missing.length&&!newlyDisabled.length?"CONDITIONAL_FULL_SUFFIX_REPLAY_SAME_SOLDIER":"CONDITIONAL_FULL_SUFFIX_REPLAY_CHANGED_STATE",processedOriginal:original.length,stepHash:key(steps),suffix:steps.slice(p.steps.length),removed,shifted,sameSoldierState:same,missingOriginalResearch:missing,newlyDisabledOriginalResearch:newlyDisabled,addedResearch:[...w.researched].filter(k=>!originalWorld.researched.has(k)),finish:a?.finish};
  }catch(e){return {status:"PARTIAL_SUFFIX_REPLAY",processedOriginal:at-1,failedAt:at,reason:String(e.message),stepHash:key(steps),suffix:steps.slice(p.steps.length),removed,shifted};}
 }
 return {prefix,follow,cache};
}
