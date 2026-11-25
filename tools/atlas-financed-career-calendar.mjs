// V54: continue the actual finite-cash Codex prefix into the existing career.
// All physical inventory and money are carried from V53. Unknown sample,
// score, facility and mission gates remain explicit; no campaign admission.
import assert from "node:assert/strict";
import {key} from "./population-research-career-core.mjs";
import {eventScriptVerdict} from "../public/soldiers/modern/event-chronology.js";
import {countdownDomain} from "./atlas-initial-event-schedule.mjs";
const arr=x=>Array.isArray(x)?x:[],n=x=>Number(x)||0,day=24,own=(o,k)=>o[k]||0;
export function financedSoldierSignature(world,replay){
 const m=world.soldiers.find(s=>s.id==="origin");if(!m)return null;const s=m.state;
 return key({finish:replay.finish(world),state:{...s,history:[...s.history].sort(),bonusCounts:[...s.bonusCounts].sort(),bonusIds:[...s.bonusIds].sort(),researchIds:[...(s.researchIds||[])].sort()}});
}
export function produceFinancedCareerCalendar({data,index,economy,early,eventIndex,actions,trace,actionHash,difficulty,replay,prefix,staff=30,scientistTarget=1,farmLimit=2,costPercent=50,cashMode="STRICT_CASH",maxMonths=360,waitMonths=36,continueOpenEvents=true}){
 assert(prefix.status==="SOURCE_BOUND_CODEX_PREFIX"&&prefix.finance?.status==="CONDITIONAL_NONNEGATIVE_PREFIX_CASH"&&!prefix.open.length);
 assert.equal(key(prefix.steps),prefix.stepHash);assert.equal(prefix.difficulty,difficulty);assert.equal(prefix.variant.costPercent,costPercent);
 assert.equal(cashMode,"STRICT_CASH");
 assert.equal(key(actions),actionHash);assert(trace.length===actions.length);
 assert([50,100,150].includes(costPercent)&&["GAP_LEDGER","STRICT_CASH"].includes(cashMode));
 const {g,manufacture}=economy,{startBase:base,startDate}=early,items=index.items,fac=index.facilities;
 const epoch=Date.UTC(startDate.year,startDate.month-1,startDate.day,startDate.hour||0);
 const stock={...prefix.stock},held={},facilities=[],grid=Array.from({length:6},()=>Array(6).fill(null)),functions=new Set(),transactions=[],calendar=[],allocations=[],unresolved=[],labGateUnresolved=[],eventGates=[],monthly=[],fixedCosts=new Map(),buyMonth=new Map(),financeGates=[],fundingWaits=[],skipped=[],sourceRewards=[],logicalSteps=[],rewardedEvents=new Set(prefix.schedule.filter(s=>s.type==="EVENT_DELIVERY").map(s=>s.id));
 let supplyCalls=0;
 let world=replay.replay(prefix.steps),hour=prefix.elapsedHours,month=prefix.month,cash=prefix.finance.closingCash,minCash=cash,eng=prefix.finance.engineers,scientists=prefix.finance.scientists,recruits=0,at=prefix.first+1,finishedActions=at,blocked=null,sales=0,researchDays=0,nominalWork=0,actualWork=0,sourceFundRequests=0,careerSpent=0,procurementSpent=0,procureHours=0;
 for(const [id,count] of Object.entries(world.items||{})){const qty=Math.min(count,own(stock,id));if(qty>0)held[id]=qty;}
 for(const s of prefix.schedule.filter(s=>s.type==="RESEARCH"))fixedCosts.set(s.id,s.work);
 const seedInventory=key(stock),seedHeld=key(held),seedResearch=key([...world.researched].sort());
 // Only schedule fixed, trigger-free, single-month research events ahead of
 // their original witness position. All other deadline events stay open.
 const deadlineQueue=[],deadlineResolved=new Map(),deadlineDispatches=[];
 const deadlines=actions.map((a,i)=>({a,i,script:eventIndex.scripts.get(a.script),event:eventIndex.events.get(a.event)})).filter(({a,i,script:s,event:e})=>{
  if(i<=prefix.first||a.type!=="eventResearch"||!s||!e||!Number.isInteger(s.firstMonth)||s.firstMonth!==s.lastMonth||s.firstMonth<=prefix.month||difficulty<(s.minDifficulty??0)||difficulty>(s.maxDifficulty??4)||(s.executionOdds??100)!==100)return false;
  if(Object.keys(s).some(k=>!["type","firstMonth","lastMonth","executionOdds","minDifficulty","maxDifficulty","eventWeights","affectsGameProgression"].includes(k)))return false;
  const weights=Object.entries(s.eventWeights||{}).sort((a,b)=>Number(a[0])-Number(b[0])).filter(([m])=>Number(m)<=s.firstMonth).at(-1)?.[1];
  if(!weights||Object.entries(weights).filter(([,v])=>v>0).length!==1||!(weights[a.event]>0))return false;
  if(Object.keys(e).some(k=>!["name","description","background","music","alignBottom","researchList","timer","timerRandom","points"].includes(k))||e.researchList?.length!==1||e.researchList[0]!==a.research)return false;
  const r=data.researchRules[a.research];return r&&!r.lookup&&!arr(r.disables).length&&!arr(r.reenables).length&&!arr(r.unlocks).length&&!arr(r.getOneFree).length&&!Object.keys(r.getOneFreeProtected||{}).length;
 });
 function queueDeadlineEvents(){
  for(const d of deadlines.filter(d=>d.script.firstMonth===month)){
   if(deadlineResolved.has(d.i)||deadlineQueue.some(q=>q.i===d.i))continue;
   const timer=countdownDomain(d.event.timer??30,d.event.timerRandom??0),due=hour+Math.ceil(timer.minMinutes/60);
   const q={...d,dispatch:hour,dispatchMonth:month,due,dispatchFunds:cash,timer};deadlineQueue.push(q);
   deadlineDispatches.push({at:d.i+1,event:d.a.event,script:d.a.script,dispatch:hour,month,due,timer,scope:"FIXED_MONTH_TRIGGER_FREE_CONDITIONAL_DISPATCH"});
  }
 }
 function resolveDeadlines(){
  for(const q of deadlineQueue.filter(q=>q.due<=hour&&!deadlineResolved.has(q.i))){
   assert(!world.pendingFree,"DEADLINE_EVENT_PENDING_FREE");
   const before={...world,month:q.dispatchMonth,funds:q.dispatchFunds};
   if(!active(q.a.research)){
    const next=replay.apply(before,q.a);assert(!next.pendingFree,"DEADLINE_EVENT_AUTO_FREE_UNRESOLVED");
    logicalSteps.push({at:q.i+1,action:q.a,month:q.dispatchMonth,funds:q.dispatchFunds,afterMonth:month,afterFunds:cash,autoDeadline:true,hour});
    world={...next,month,funds:cash};
   }
   deadlineResolved.set(q.i,{event:q.a.event,dispatch:q.dispatch,due:q.due,resolved:hour,month:q.dispatchMonth});
   calendar.push({at:q.i+1,type:"DEADLINE_EVENT",id:q.a.event,start:q.dispatch,end:hour,dispatchMonth:q.dispatchMonth,timer:q.timer,scope:"CONDITIONAL_FIXED_MONTH_EARLY_RESEARCH_AWARD"});
  }
 }
 const originals=typeof base.randomSoldiers==="number"?base.randomSoldiers:Object.values(base.randomSoldiers||{}).reduce((s,v)=>s+v,0);
 const active=k=>world.researched.has(k)&&!world.disabled.has(k),hasResearch=ks=>arr(ks).every(active),hasFunctions=ks=>arr(ks).every(k=>functions.has(k));
 const date=()=>new Date(epoch+hour*3600000).toISOString().slice(0,16);
 const boundary=m=>Math.round((Date.UTC(startDate.year,startDate.month-1+m,1)-epoch)/3600000);
 const completed=()=>facilities.filter(f=>f.ready<=hour);
 const cap=k=>completed().reduce((s,f)=>s+n(f.rule[k]),0);
 const quantity=id=>own(stock,id),free=id=>Math.max(0,quantity(id)-own(held,id));
 const size=id=>n(items.get(id)?.size);
 const stores=()=>Object.entries(stock).reduce((s,[id,v])=>s+size(id)*v,0);
 function refresh(){functions.clear();for(const f of completed())for(const k of arr(f.rule.provideBaseFunc))functions.add(k);}
 function pos(id,x,y,ready,source){const r=fac.get(id),sx=n(r.sizeX)||n(r.size)||1,sy=n(r.sizeY)||n(r.size)||1;assert(r);
  for(let j=y;j<y+sy;j++)for(let i=x;i<x+sx;i++){assert(grid[j]&&i>=0&&i<6&&!grid[j][i],"base layout "+id);grid[j][i]=id;}
  const f={id,x,y,sx,sy,ready,source,rule:r};facilities.push(f);return f;
 }
 for(const f of prefix.built)pos(f.type,f.x,f.y,f.ready||0,f.ready?"CODEX_PREFIX_CONSTRUCTION":"ORIGINAL_START_BASE");refresh();
 function pay(amount,reason,details={}){
  assert(Number.isSafeInteger(amount));
  if(cashMode==="STRICT_CASH"&&cash+amount<0)throw Error("CASH_SHORTFALL:"+reason+":"+(cash+amount));
  cash+=amount;minCash=Math.min(minCash,cash);transactions.push({hour,month,at,amount,reason,cash,...details});
 }
 function maintenance(){
  const facility=cap("monthlyCost"),personnel=eng*g.engineerSalary+scientists*g.scientistSalary+(originals+recruits)*early.defaultSalary;
  const inventory=Object.entries(stock).reduce((s,[id,v])=>s+v*(n(items.get(id)?.monthlySalary)+n(items.get(id)?.monthlyMaintenance)),0);
  const craft=arr(base.crafts).reduce((s,c)=>s+n(index.crafts.get(c.type)?.rentCost)+Object.entries(c.items||{}).reduce((v,[id,count])=>v+count*(n(items.get(id)?.monthlySalary)+n(items.get(id)?.monthlyMaintenance)),0),0);
  return {facility,personnel,inventory,craft,total:facility+personnel+inventory+craft};
 }
 function tick(to){assert(Number.isSafeInteger(to)&&to>=hour);while(boundary(month+1)<=to){if(month>=maxMonths)throw Error("CALENDAR_BUDGET");hour=boundary(month+1);refresh();const m=maintenance();pay(early.openingCash-m.total,"monthlyFunding",{funding:early.openingCash,...m});month++;buyMonth.clear();monthly.push({month,hour,cash,...m,engineers:eng,scientists,farms:completed().filter(f=>f.id==="STR_HYDROPONICS").length});queueDeadlineEvents();}hour=to;refresh();resolveDeadlines();}
 function location(id){const r=fac.get(id);if(!r)return null;const sx=n(r.sizeX)||n(r.size)||1,sy=n(r.sizeY)||n(r.size)||1;
  for(let y=0;y<=6-sy;y++)for(let x=0;x<=6-sx;x++){let free=true,connected=false;
   for(let j=y;j<y+sy;j++)for(let i=x;i<x+sx;i++){if(grid[j][i])free=false;for(const [dx,dy] of [[0,1],[0,-1],[1,0],[-1,0]]){const q=grid[j+dy]?.[i+dx];if(q&&!fac.get(q)?.connectorsDisabled&&completed().some(f=>f.id===q))connected=true;}}
   if(free&&connected)return {x,y};
  }return null;
 }
 function allowedFacility(id,r){return r&&hasResearch(r.requires)&&!arr(r.requires).includes("STR_UNAVAILABLE")&&hasFunctions(r.requiresBaseFunc)&&!arr(r.buildOverFacilities).length&&
  !arr(r.forbiddenBaseFunc).some(k=>functions.has(k))&&!facilities.some(f=>arr(f.rule.forbiddenBaseFunc).some(k=>arr(r.provideBaseFunc).includes(k)))&&
  (!n(r.maxAllowedPerBase)||facilities.filter(f=>f.id===id).length<n(r.maxAllowedPerBase));}
 function materials(r){return Object.fromEntries(Object.entries(r.buildCostItems||{}).map(([id,v])=>[id,n(typeof v==="object"?v.build:v)]).filter(([,v])=>v>0));}
 function build(id,wait,stack=[]){const r=fac.get(id);if(!allowedFacility(id,r)||!location(id))return false;
  const mats=materials(r);for(const [k,v] of Object.entries(mats))if(!ensure(k,v,[...stack,"FAC:"+id]))return false;
  const p=location(id);if(!p||!allowedFacility(id,r)||Object.entries(mats).some(([k,v])=>free(k)<v))return false;
  const cost=n(r.buildCost);
  if(cash<cost&&!waitCash(cost,"FACILITY:"+id,6))return false;
  if(!allowedFacility(id,r)||Object.entries(mats).some(([k,v])=>free(k)<v))return false;
  const ready=hour+n(r.buildTime)*day;
  pay(-cost,"facility",{id,materials:mats,ready,...p});procurementSpent+=cost;
  for(const [k,v] of Object.entries(mats)){assert(free(k)>=v);stock[k]-=v;}
  pos(id,p.x,p.y,ready,"SOURCE_BOUND_CONSTRUCTION");
  if(wait)advance(ready);return true;
 }
 function ensureFunction(f,stack=[]){
  if(functions.has(f))return true;if(++supplyCalls>120||stack.includes("FUNC:"+f)||stack.length>16)return false;
  const pending=facilities.filter(q=>q.ready>hour&&arr(q.rule.provideBaseFunc).includes(f)).sort((a,b)=>a.ready-b.ready)[0];
  if(pending){advance(pending.ready);return functions.has(f);}
  const providers=(index.functions.get(f)||[]).filter(({id,r})=>hasResearch(r.requires)&&location(id)&&!arr(r.requires).includes("STR_UNAVAILABLE")&&!stack.includes("FAC:"+id)).sort((a,b)=>Object.keys(materials(a.r)).length-Object.keys(materials(b.r)).length||n(a.r.buildCost)-n(b.r.buildCost)||a.id.localeCompare(b.id));
  for(const {id,r} of providers.slice(0,5)){
   if(!arr(r.requiresBaseFunc).every(k=>ensureFunction(k,[...stack,"FUNC:"+f,"FAC:"+id])))continue;
   if(build(id,true,[...stack,"FUNC:"+f])&&functions.has(f))return true;
  }return false;
 }
 const safeRecipe=a=>{const r=manufacture.get(a.id);return r&&a.hours>0&&!a.randomExtras&&Object.keys(a.inputs).every(k=>k.startsWith("ITEM:"))&&Object.keys(a.outputs).every(k=>k.startsWith("ITEM:"))&&!r.spawnedPersonType&&!r.spawnedSoldier&&!r.spawnedItem&&!r.spawnedEvent&&!r.randomEvents&&!r.eventWeights&&!r.points;};
 const pure=[...index.recipes.values()].filter(a=>safeRecipe(a)&&!Object.keys(a.inputs).length&&!arr(manufacture.get(a.id).transferTimes).length).map(a=>({...a,revenue:Object.entries(a.outputs).reduce((s,[k,v])=>s+Math.trunc(n(items.get(index.raw(k))?.costSell)*g.sellCoefficients[difficulty]/100)*v,0)})).filter(a=>a.revenue>a.cost);
 let bestCache=null,cacheKey="",lastResearch=null,lastDisabled=null;
 function best(){const k=JSON.stringify([[...functions].sort(),eng,cap("workshops")]);if(k===cacheKey&&world.researched===lastResearch&&world.disabled===lastDisabled)return bestCache;cacheKey=k;lastResearch=world.researched;lastDisabled=world.disabled;
  bestCache=pure.filter(a=>hasResearch(a.research)&&hasFunctions(a.functions)&&cap("workshops")>a.space).map(a=>({...a,assigned:Math.min(eng,cap("workshops")-a.space)})).filter(a=>a.assigned>0).sort((a,b)=>(b.revenue-b.cost)*b.assigned/b.hours-(a.revenue-a.cost)*a.assigned/a.hours||a.id.localeCompare(b.id))[0];return bestCache;}
 function advance(to,produce=true){
  assert(Number.isSafeInteger(to)&&to>=hour);
  while(hour<to){
   refresh();resolveDeadlines();const next=Math.min(to,boundary(month+1),...facilities.filter(f=>f.ready>hour).map(f=>f.ready),...deadlineQueue.filter(q=>!deadlineResolved.has(q.i)&&q.due>hour).map(q=>q.due),cashMode==="STRICT_CASH"?hour+24:Infinity);
   const a=produce?best():null;
   // OXCE Production::step uses cumulative engineer hours across units.
   // Prepay the entire lot conservatively; do not round each cheap item
   // to a full hour. Partial progress at a segment boundary is discarded.
   let count=a?Math.floor((next-hour)*a.assigned/a.hours):0;
   if(cashMode==="STRICT_CASH"&&a?.cost)count=Math.min(count,Math.max(0,Math.floor(cash/a.cost)));
   if(count>0){
    const cost=count*a.cost,rev=count*a.revenue;pay(-cost,"incomeManufacture",{id:a.id,batches:count,assigned:a.assigned,engineerHours:count*a.hours});
    tick(hour+Math.ceil(count*a.hours/a.assigned));pay(rev,"incomeSale",{id:a.id,batches:count});sales+=rev;
   }else tick(next);
  }
 }
 function waitCash(required,reason,limit=waitMonths){
  if(cash>=required)return true;
  const start=hour,openingCash=cash;let turns=0,stale=0,last=cash;
  while(cash<required&&turns<limit&&month<maxMonths){
   advance(boundary(month+1));turns++;
   stale=cash<=last?stale+1:0;last=cash;
   if(stale>=3)break;
  }
  fundingWaits.push({at,reason,required,start,end:hour,months:turns,openingCash,closingCash:cash,met:cash>=required});
  return cash>=required;
 }
 function buildFarms(){while(facilities.filter(f=>f.id==="STR_HYDROPONICS").length<farmLimit){const r=fac.get("STR_HYDROPONICS");if(!r||!allowedFacility("STR_HYDROPONICS",r)||Object.keys(materials(r)).length||!location("STR_HYDROPONICS")||cash<n(r.buildCost)+Math.max(0,maintenance().total-early.openingCash))break;if(!build("STR_HYDROPONICS",false))break;}}
 function hire(){
  const freeQuarters=Math.max(0,cap("personnel")-originals-recruits-eng-scientists);
  const e=Math.max(0,Math.min(staff-eng,cap("workshops")-eng,freeQuarters));
  const s=Math.max(0,Math.min(scientistTarget-scientists,cap("labs")-scientists,freeQuarters-e));
  // Hire only with on-hand funds and a reserve for one monthly shortfall;
  // speculative gap mode does not finance optional expansion by debt.
  const budget=Math.max(0,cash-Math.max(0,maintenance().total-early.openingCash)-100000);
  const es=Math.min(e,Math.floor(budget/g.engineerHire)),ss=Math.min(s,Math.floor(Math.max(0,budget-es*g.engineerHire)/(g.scientistSalary*2)));
  if(es||ss){pay(-(es*g.engineerHire+ss*g.scientistSalary*2),"hire",{engineers:es,scientists:ss,ready:hour+g.personnelTransferHours});eng+=es;scientists+=ss; // payroll applies during transfer
   // No manufacturing or laboratory work by newly hired staff during transfer.
   advance(hour+g.personnelTransferHours,false);
  }
 }
 function purchaseEligible(id){const r=items.get(id);return r&&n(r.costBuy)>0&&hasResearch(r.requires)&&hasResearch(r.requiresBuy)&&!r.requiresBuyCountry&&!r.buyRequirements?.length&&!(r.buyRequirements&&typeof r.buyRequirements==="object"&&Object.keys(r.buyRequirements).length)&&!r.liveAlien;}
 function storeFits(extra){return stores()+Object.entries(extra).reduce((s,[id,v])=>s+size(id)*v,0)<=cap("storage")+1e-7;}
 function buy(id,count,stack){
  const r=items.get(id);if(!purchaseEligible(id)||!arr(r.requiresBuyBaseFunc).every(f=>ensureFunction(f,stack))||!storeFits({[id]:count}))return false;
  const unit=Math.trunc(n(r.costBuy)*g.buyCoefficients[difficulty]/100),limit=n(r.monthlyBuyLimit);
  // Do not wait arbitrary months for purchase caps; record open remainder.
  const qty=limit?Math.min(count,Math.max(0,limit-(buyMonth.get(id)||0))):count;if(!qty||cash<unit*qty&&!waitCash(unit*qty,"PURCHASE:"+id,3))return false;
  const cost=unit*qty,start=hour,delay=r.transferTime===undefined?24:n(r.transferTime);pay(-cost,"samplePurchase",{id,qty,unit,delay});procurementSpent+=cost;
  buyMonth.set(id,(buyMonth.get(id)||0)+qty);advance(hour+delay);stock[id]=quantity(id)+qty;
  calendar.push({at,type:"PURCHASE",id,qty,start,end:hour,cost,source:index.source("items",id)});procureHours+=hour-start;return true;
 }
 function manufactureItem(a,batches,stack){
  if(!safeRecipe(a)||!hasResearch(a.research)||!a.functions.every(f=>ensureFunction(f,stack))||cap("workshops")<=a.space)return false;
  const assigned=Math.min(eng,cap("workshops")-a.space);if(!assigned)return false;
  for(const [k,v] of Object.entries(a.inputs))if(!ensure(index.raw(k),v*batches,stack))return false;
  if(Object.entries(a.inputs).some(([k,v])=>free(index.raw(k))<v*batches))return false;
  const out=Object.fromEntries(Object.entries(a.outputs).map(([k,v])=>[index.raw(k),v*batches]));if(!storeFits(out))return false;
  const cost=a.cost*batches;if(cash<cost&&!waitCash(cost,"MANUFACTURE:"+a.id,3))return false;
  const start=hour;pay(-cost,"sampleManufacture",{id:a.id,batches,assigned});procurementSpent+=cost;
  for(const [k,v] of Object.entries(a.inputs)){const id=index.raw(k);assert(free(id)>=v*batches);stock[id]-=v*batches;}
  advance(hour+Math.ceil(a.hours*batches/assigned),false);
  const delay=Math.max(0,...arr(manufacture.get(a.id).transferTimes).map(n));if(delay)advance(hour+delay);
  for(const [id,v] of Object.entries(out))stock[id]=quantity(id)+v;
  calendar.push({at,type:"MANUFACTURE",id:a.id,batches,assigned,inputs:a.inputs,outputs:out,start,end:hour,cost,source:a.source});procureHours+=hour-start;return true;
 }
 function ensure(id,count,stack=[]){
  if(free(id)>=count)return true;if(++supplyCalls>120||stack.includes(id)||stack.length>12)return false;
  const k=index.asset(id),lack=count-free(id),next=[...stack,id];
  const canBuy=purchaseEligible(id);
  const choices=(index.byOutput.get(k)||[]).filter(a=>safeRecipe(a)&&hasResearch(a.research)&&!Object.keys(a.inputs).some(x=>next.includes(index.raw(x)))&&a.outputs[k]>0).sort((a,b)=>Object.entries(a.inputs).filter(([x,v])=>free(index.raw(x))<v).length-Object.entries(b.inputs).filter(([x,v])=>free(index.raw(x))<v).length||a.cost/a.outputs[k]-b.cost/b.outputs[k]||a.hours-b.hours);
  if(canBuy&&buy(id,lack,next)&&free(id)>=count)return true;
  for(const a of choices.slice(0,3)){if(free(id)>=count)return true;if(manufactureItem(a,Math.ceil((count-free(id))/a.outputs[k]),next)&&free(id)>=count)return true;}
  return free(id)>=count;
 }
 function bind(id,count,kind){
  const before=free(id);
  if(before<count)ensure(id,count);
  const qty=Math.min(count,free(id));
  if(qty){held[id]=own(held,id)+qty;allocations.push({at,id,qty,kind,source:before>=qty?"EXISTING_PHYSICAL_STOCK":"SOURCE_PROCUREMENT",hour});}
  if(qty<count)unresolved.push({at,id,qty:count-qty,kind});
  return qty;
 }
 try{
  // Reuse the exact original branch actions from the first Codex grant
 // onward, but never inject their assumed funds into the cash ledger.
 for(const [i,a] of actions.entries()){
   if(i<=prefix.first)continue;
   at=i+1;supplyCalls=0;const before=world,baseline=trace[i-1],expected=trace[i];const start=hour;let applied=a,dispatchFunds=null,dispatchMonth=null;
   if(a.type==="eventResearch"&&deadlineResolved.has(i)){
    const q=deadlineResolved.get(i);assert(active(a.research)&&!world.pendingFree);skipped.push({at,id:a.event,reason:"EARLIER_FIXED_MONTH_EVENT",...q});finishedActions=at;continue;
   }
   if(a.type==="research"&&active(a.id)&&!world.pendingFree||a.type==="freeResearch"&&active(a.research)&&!world.pendingFree){
    skipped.push({at,id:a.id||a.research,reason:"ALREADY_COMPLETED_IN_CODEX_PREFIX"});finishedActions=at;continue;
   }
   if(a.type==="advanceMonth"){const to=boundary(a.month);if(to>hour)advance(to);applied={type:"advanceMonth",month};calendar.push({at,type:"MONTH_FLOOR",originalMonth:a.month,actualMonth:month,start,end:hour});}
   else if(a.type==="externalInputs"){
    const logicalItems={};for(const [id,count] of Object.entries(a.items||{})){
     const surplus=Math.max(0,own(world.items||{},id)-own(baseline.items||{},id)),reuse=Math.min(count,surplus,own(held,id));
     if(reuse)allocations.push({at,id,qty:reuse,kind:"PREFIX_STOCK_REUSE",source:"SOURCE_PREFIX_OR_PREVIOUS_PHYSICAL_STOCK",hour});
     if(count>reuse)bind(id,count-reuse,"EXTERNAL_SAMPLE");
     const missing=Math.max(0,count-surplus);if(missing)logicalItems[id]=missing;
    }
    for(const f of a.functions||[]){if(ensureFunction(f))allocations.push({at,id:f,qty:1,kind:"BASE_FUNCTION",source:"COMPLETED_FACILITY",hour});else unresolved.push({at,id:f,qty:1,kind:"BASE_FUNCTION"});}
    sourceFundRequests+=n(a.funds);
    applied={...a,items:logicalItems,functions:arr(a.functions).filter(f=>!world.baseFunctions.has(f)),funds:0};
   }else if(a.type==="research"||a.type==="repeatResearch"){
    const r=data.researchRules[a.id];assert(r,"research rule absent "+a.id);
    if(r.needItem&&own(held,r.neededItem||a.id)<1){
     const id=r.neededItem||a.id,prior=unresolved.findLast(o=>o.id===id&&o.kind==="EXTERNAL_SAMPLE");
     if(prior&&own(before.items||{},id)>0)labGateUnresolved.push({at,id,linkedExternalAt:prior.at});
     else bind(id,1,"LAB_SAMPLE");
    }
    for(const f of r.requiresBaseFunc||[])if(!functions.has(f)&&!ensureFunction(f))unresolved.push({at,id:f,qty:1,kind:"LAB_FUNCTION"});
    const cost=n(r.cost);if(!fixedCosts.has(a.id))fixedCosts.set(a.id,cost?Math.max(1,Math.trunc(cost*costPercent/100)):0);
    const work=fixedCosts.get(a.id),assigned=Math.min(scientists,cap("labs"));assert(assigned>0||!work,"NO_LAB_CAPACITY");
    const days=work?Math.ceil(work/assigned):0,begin=hour;
    if(days){const firstDay=Math.floor((epoch+hour*3600000)/86400000+1)*86400000;const finish=Math.round((firstDay-epoch)/3600000)+(days-1)*24;advance(finish);}
    researchDays+=days;nominalWork+=cost;actualWork+=work;
    calendar.push({at,type:"LAB_RESEARCH",id:a.id,nominal:cost,cost:work,assigned,days,start:begin,end:hour,source:index.source("research",a.id),conditional:true});
   }else if(a.type==="eventResearch"){
    const match=(data.eventResearchSources?.[a.research]||[]).find(x=>x.event===a.event),script=match?.scripts?.find(x=>x.script===a.script),event=eventIndex.events.get(a.event);
    if(!script||!event)throw Error("EVENT_SOURCE_UNINDEXED:"+a.event);
    const rawScript=eventIndex.scripts.get(a.script);assert(rawScript);
    const fundMin=n(rawScript.minFunds??script.otherConditions?.minFunds),fundMax=rawScript.maxFunds??script.otherConditions?.maxFunds;
    const facilityOpen=[];
    for(const id of script.facilityPositive||[]){
     if(completed().some(f=>f.id===id))continue;
     const pending=facilities.find(f=>f.id===id&&f.ready>hour);
     if(pending)advance(pending.ready);
     else{const r=fac.get(id);if(r&&hasResearch(r.requires)&&arr(r.requiresBaseFunc).every(f=>ensureFunction(f)))build(id,true);}
     if(!completed().some(f=>f.id===id))facilityOpen.push({id,missingResearch:arr(fac.get(id)?.requires).filter(k=>!active(k)),hasLayout:!!location(id),materials:materials(fac.get(id)||{}),buildCost:n(fac.get(id)?.buildCost)});
    }
    // In OXCE determineAlienMissions(isNewMonth) checks projected
    // currentFunds = cash + funding + performanceBonus - maintenance.
    // Our fixed funding, zero performance bonus scenario is the balance
    // immediately after the monthly ledger transfer, not arbitrary cash.
    const pendingDeadline=deadlineQueue.find(q=>q.i===i&&!deadlineResolved.has(i));
    if(pendingDeadline){advance(pendingDeadline.due);assert(deadlineResolved.has(i)&&active(a.research));skipped.push({at,id:a.event,reason:"EARLIER_FIXED_MONTH_EVENT",...deadlineResolved.get(i)});finishedActions=at;continue;}
    const futureDeadline=deadlines.find(q=>q.i===i);
    if(futureDeadline&&month<futureDeadline.script.firstMonth){advance(boundary(futureDeadline.script.firstMonth));const q=deadlineQueue.find(q=>q.i===i);assert(q);advance(q.due);assert(deadlineResolved.has(i)&&active(a.research));skipped.push({at,id:a.event,reason:"EARLIER_FIXED_MONTH_EVENT",...deadlineResolved.get(i)});finishedActions=at;continue;}
    const initialCash=cash,initialHour=hour,initialMonth=month;
    let targetMonth=Math.max(month+1,script.firstMonth??0);
    if(script.lastMonth!=null&&script.lastMonth>=0&&targetMonth>script.lastMonth)throw Error("EVENT_MONTH_WINDOW_CLOSED:"+a.event);
    advance(boundary(targetMonth));
    let waited=0,stale=0,last=cash;
    while(cash<fundMin&&waited<waitMonths&&month<maxMonths&&(script.lastMonth==null||script.lastMonth<0||month<script.lastMonth)){
     advance(boundary(month+1));waited++;stale=cash<=last?stale+1:0;last=cash;if(stale>=3)break;
    }
    dispatchFunds=cash;dispatchMonth=month;
    const fundsMet=cash>=fundMin&&(fundMax===undefined||cash<=fundMax);
    if(fundMin||fundMax!==undefined)financeGates.push({at,event:a.event,script:a.script,minimum:fundMin,maximum:fundMax??null,openingCash:initialCash,dispatchCash:cash,openingMonth:initialMonth,dispatchMonth:month,start:initialHour,end:hour,waited,met:fundsMet});
    const judgment=eventScriptVerdict({...script,eventId:a.event},{...world,month,difficulty,funds:cash,triggerItems:stock,triggerFacilities:new Set(completed().map(f=>f.id)),score:null},{mode:"current"});
    eventGates.push({at,event:a.event,script:a.script,originalMonth:baseline.month,scheduledMonth:month,dispatchCash:cash,fundsMet,kind:judgment.kind,blocked:judgment.blocked||[],unknown:judgment.unknown||[],pending:judgment.pending||[],facilityOpen,scoreMinimum:rawScript.minScore??null,scoreMaximum:rawScript.maxScore??null,...(fundMin||facilityOpen.length?{gateState:{activeResearch:[...world.researched].filter(active).sort(),disabled:[...world.disabled].sort(),stock:{...stock},held:{...held},layout:facilities.map(({rule,...f})=>f),engineers:eng,scientists,storageUsed:stores(),storageCapacity:cap("storage"),hour,month,cash}}:{}),scope:"MONTHLY_PROJECTED_FUNDS_AND_SOURCE_BASE_CALENDAR"});
    if(!fundsMet)throw Error("EVENT_FUNDS_UNRESOLVED:"+a.event+":"+Math.max(0,fundMin-cash));
    if(judgment.blocked.length&&!continueOpenEvents)throw Error("EVENT_PHYSICAL_GATE_UNRESOLVED:"+a.event);
    const timer=countdownDomain(event.timer??30,event.timerRandom??0);
    const dispatch=hour;advance(hour+Math.ceil(timer.minMinutes/60));
    const cost=Math.max(0,-n(event.funds));if(cost){if(cash<cost)throw Error("EVENT_COST_UNFUNDED:"+a.event);pay(-cost,"conditionalEventCost",{id:a.event});careerSpent+=cost;}
    // Never credit rewards from an explicitly blocked event. A reward
    // with only unknown/RNG gates is still conditional, not guaranteed.
    const eligible=judgment.kind!=="blocked",safeReward=eligible&&!event.invert&&!rewardedEvents.has(a.event);
    const rewards={...event.everyMultiItemList};for(const id of arr(event.everyItemList))rewards[id]=n(rewards[id])+1;
    if(safeReward){
     if(n(event.funds)>0)pay(n(event.funds),"conditionalFixedEventFunds",{id:a.event});
     const valid=Object.entries(rewards).every(([id,v])=>items.has(id)&&Number.isSafeInteger(v)&&v>0&&!items.get(id)?.liveAlien);
     if(valid&&Object.keys(rewards).length){
      advance(hour+1);
      if(storeFits(rewards)){
       for(const [id,v] of Object.entries(rewards))stock[id]=quantity(id)+v;
       sourceRewards.push({at,event:a.event,hour,rewards,source:eventIndex.refs["events|"+a.event],scope:"CONDITIONAL_FIXED_REWARDS_WITH_OPEN_RNG_AND_SCORE"});
      }else unresolved.push({at,id:a.event,qty:1,kind:"EVENT_REWARD_STORAGE"});
     }
     rewardedEvents.add(a.event);
    }
    calendar.push({at,type:"EVENT_COUNTDOWN",id:a.event,start,dispatch,dispatchMonth,end:hour,timer,cost,scope:eligible?"CONDITIONAL_MONTHLY_DISPATCH":"LOGICAL_CONTINUATION_WITH_EXPLICIT_PHYSICAL_EVENT_BLOCKER"});
   }else if(a.type==="missionResearch"){calendar.push({at,type:"MISSION_UNRESOLVED",id:a.deployment,start,end:hour});}
   else if(a.type==="recruit"){const p=data.profiles.find(p=>p.id===a.profile);if(p?.sourceType==="manufacture"&&n(p.time)>0){const assigned=Math.max(1,Math.min(eng,cap("workshops")));advance(hour+Math.ceil(p.time/assigned),false);calendar.push({at,type:"RECRUIT_MANUFACTURE_TIME",id:a.profile,assigned,start,end:hour,scope:"FIXED_TIME_ONLY_OTHER_GATES_OPEN"});}recruits++;}
   // Replay original non-fund gates using the adapted research and logical
   // inventory. Only the economic ledger supplies funds. Event replay uses
   // the actual projected funds at dispatch, even when physical gates remain open.
   const expectedSpend=a.type==="externalInputs"?0:Math.max(0,n(baseline.funds)-n(expected.funds));
   if(expectedSpend&&!waitCash(expectedSpend,"CAREER:"+String(a.transform||a.profile||a.recipe||a.id),12))throw Error("CAREER_PAYMENT_UNFUNDED");
   const logicalBefore={...world,funds:dispatchFunds??cash,month:dispatchMonth??month};
   const after=replay.apply(logicalBefore,applied);
   const spend=Math.max(0,n(logicalBefore.funds)-n(after.funds));
   if(spend){pay(-spend,"careerAction",{id:a.transform||a.profile||a.id||a.recipe});careerSpent+=spend;}
   if(a.type!=="externalInputs"){
    for(const [id,v] of Object.entries(before.items||{})){const used=Math.max(0,v-own(after.items||{},id)),take=Math.min(used,own(held,id));if(take){held[id]-=take;stock[id]-=take;}}
   }
   logicalSteps.push({at,action:applied,month:logicalBefore.month,funds:logicalBefore.funds,afterMonth:month,afterFunds:cash});
   world={...after,funds:cash,month};finishedActions=at;
   if(a.type==="research"||a.type==="freeResearch"||a.type==="repeatResearch"||a.type==="eventResearch"){buildFarms();if(at<100||scientists<scientistTarget||eng<staff)hire();}
  }
 }catch(e){blocked={at,reason:String(e.message),hour,month,cash};}
 const incompatibleEvents=eventGates.filter(e=>e.kind==="blocked"||e.blocked?.length).length;
 const full=!blocked&&finishedActions===actions.length&&!world.pendingFree;
 const out={schema:"ATLAS_FINANCED_CAREER_CALENDAR_V1",actionHash,prefixHash:prefix.prefixHash,seedInventory,seedHeld,seedResearch,sourceFingerprint:early.evidence.fingerprint,eventSourceFingerprint:eventIndex.evidence.fingerprint,scenario:{difficulty,staff,scientistTarget,farmLimit,costPercent,cashMode,maxMonths,waitMonths,continueOpenEvents,openingCash:prefix.finance.closingCash,campaignOpeningCash:early.openingCash,countryFunding:"CONSTANT_INITIAL_ROLL_CONDITIONAL"},status:full?(incompatibleEvents?"FULL_LOGICAL_REPLAY_WITH_OPEN_EVENT_GATES":"FULL_LOGICAL_REPLAY_FINANCED_CONDITIONAL"):"PARTIAL_FINANCED_CAREER",finishedActions,totalActions:actions.length,prefixHours:prefix.elapsedHours,elapsedHours:hour,months:month,endingDate:date(),researchDays,nominalWork,actualWork,scientists,engineers:eng,closingCash:cash,minimumCash:minCash,wholePrefixMinimumCash:Math.min(minCash,prefix.finance.minimumCash),sales,sourceFundRequests,careerSpent,procurementSpent,procureHours,allocations,unresolved,labGateUnresolved,eventGates,incompatibleEvents,financeGates,fundingWaits,sourceRewards,logicalSteps,skipped,deadlineDispatches,deadlineResolved:[...deadlineResolved.entries()],calendar,transactions,monthly,layout:facilities.map(({rule,...f})=>f),closingStock:stock,closingHeld:held,blocked,finalResearch:[...world.researched].sort(),finalDisabled:[...world.disabled].sort(),finalSoldier:full?replay.finish(world):null,finalSoldierSignature:full?financedSoldierSignature(world,replay):null,openConditions:["CONDITIONAL_CODEX_PREFIX","COUNTRY_FUNDING_AND_SCORE_NOT_REPLAYED","FIXED_RESEARCH_COST_ROLL_SCENARIO","UNRESOLVED_PHYSICAL_SAMPLES_AND_EVENT_GATES","MISSION_GROWTH_AND_RNG_TIMING_UNPROVED","CONDITIONAL_EVENT_REWARDS_ONLY_WHEN_NO_KNOWN_BLOCK","BASE_CONNECTIVITY_AND_RUNTIME_SCRIPTS_NOT_ENGINE_REPLAYED","NO_ACTUAL_CAMPAIGN_TERMINAL_ADMISSION"],completeCampaigns:0};
 return {...out,calendarHash:key(out)};
}
