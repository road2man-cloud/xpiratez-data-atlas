// Incremental project-base economy: source-bound quantities and calendar.
// NOT a campaign proof: the base, research history and opening capital
// still require a realized campaign witness.
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import yaml from "js-yaml";
import {key,sha} from "./population-research-career-core.mjs";
const arr=x=>Array.isArray(x)?x:[],num=x=>Number(x)||0,DAY=24,EPS=1e-7;
export function loadEconomyRules(gameRoot,sourceIndex){
 const manifest=JSON.parse(fs.readFileSync("public/ruleset/manifest.json")),dir=path.join(gameRoot,"user/mods/Piratez");
 const globals={},manufacture=new Map(),files={};
 function read(file,p,expected){
  const b=fs.readFileSync(p),h=sha(b);if(expected)assert.equal(h,expected,file);files[file]=h;
  const d=yaml.load(b.toString("utf8"),{json:true});
  for(const k of ["costEngineer","costHireEngineer","costScientist","timePersonnel","initialFunding","startingTime","sellPriceCoefficient","buyPriceCoefficient","defeatFunds","newBaseUnlockResearch"])if(d[k]!==undefined)globals[k]=d[k];
  for(const r of arr(d.manufacture)){if(r.delete){manufacture.delete(r.delete);continue;}if(r.name)manufacture.set(r.name,{...manufacture.get(r.name),...r});}
 }
 for(const f of ["vars","manufacture"]){const p="standard/xcom1/"+f+".rul";read(p,path.join(gameRoot,p));}
 for(const e of manifest.files.filter(e=>e.path.startsWith("Ruleset/")&&e.path.endsWith(".rul")).sort((a,b)=>a.path.localeCompare(b.path,"en")))read(e.path,path.join(dir,e.path),e.sha256);
 const g={engineerSalary:globals.costEngineer,engineerHire:globals.costHireEngineer||globals.costEngineer*2,scientistSalary:globals.costScientist,personnelTransferHours:globals.timePersonnel,initialFundingNominal:globals.initialFunding*1000,defeatFunds:globals.defeatFunds,start:globals.startingTime,buyCoefficients:globals.buyPriceCoefficient||[100,100,100,100,100],sellCoefficients:globals.sellPriceCoefficient||[100,100,100,100,100],newBaseResearch:globals.newBaseUnlockResearch};
 assert(g.start&&g.engineerSalary>0&&g.engineerHire>0&&g.personnelTransferHours>=0);
 const evidence={schema:"ATLAS_PROJECT_ECONOMY_SOURCE_V1",sourceMetadataSha256:sourceIndex.evidence.sourceMetadataSha256,supplyFingerprint:sourceIndex.evidence.fingerprint,files,globals:g,engineSource:["Base::getAvailableWorkshops/getUsedWorkshops/getAvailableContainment/getFacilityMaintenance/getPersonnelMaintenance","Production::step/startItem","PurchaseState::increaseByValue/btnOkClick","SavedGame::monthlyFunding/getBuyPriceCoefficient/getSellPriceCoefficient","RuleItem::getBuyCostAdjusted/getSellCostAdjusted"]};
 return {g,manufacture,evidence:{...evidence,fingerprint:key(evidence)}};
}
export function simulateProject({index,economy,w,plan,target,difficulty,staff=30,farmCount=0,prefundCycles=0,prefundRecipe="STR_ELERIUM_115_XXX",prefundLotSize=1,purchaseElerium=false,funding=null}){
 assert(plan.obligations.length===0,"Unresolved procurement obligations");
 assert(Number.isInteger(difficulty)&&difficulty>=0&&difficulty<=4);
 assert(Number.isSafeInteger(prefundLotSize)&&prefundLotSize>0);
 const {g,manufacture}=economy,active=k=>w.researched.has(k)&&!w.disabled.has(k),activeAll=ks=>arr(ks).every(active);
 const raw=index.raw,asset=index.asset,items=index.items,facilities=index.facilities;
 // Start at first day of observed research month; this is a relative
 // calendar scenario, not a historical game date.
 const date=new Date(Date.UTC(g.start.year,g.start.month-1+Math.max(0,w.month||0),1,12));
 const initialPrefundCycles=prefundCycles;
 const finite=!!funding,seed=finite?funding.seed:0,maxMonths=finite?funding.maxMonths:Infinity;
 if(finite){assert(Number.isSafeInteger(seed)&&seed>=0&&Number.isSafeInteger(funding.reserve)&&funding.reserve>=0);assert(Number.isSafeInteger(maxMonths)&&maxMonths>0);assert(["PASSIVE","REPEAT_SALES"].includes(funding.mode));}
 const cashLedger=[],financing={cycles:0,lots:0,recipe:null,waitMonths:0,reserve:funding?.reserve??null,revenue:0,expense:0};
 const epoch=date.getTime(),iso=()=>new Date(epoch+hour*3600000).toISOString().slice(0,16);
 let hour=0,month=0,balance=0,minimum=0,eng=0,expense=0,income=0,sales=0,payroll=0,netFacilities=0,engineerHours=0,peakStores=0,peakCaptives=0;
 const stock={...plan.openingStock},built=[],grid=Array.from({length:6},()=>Array(6).fill(null)),events=[],monthly=[],buyLog={},open=new Set(["EARLIER_RESEARCH_AND_RECRUITMENT_NOT_ECONOMICALLY_REPLAYED","EXISTING_EMPTY_ACCESS_LIFT_AND_BASE_SITE_ASSUMED","OTHER_BASES_AND_COUNTRY_FUNDING_EXCLUDED","RESEARCH_STATUS_FROZEN_DURING_PROJECT","ACTIVE_MOD_AND_RUNTIME_SCRIPTS_NOT_EXECUTED","BASE_LAYOUT_ENGINE_VALIDATION_UNPROVED","CAMPAIGN_SURVIVAL_MISSION_VICTORY_AND_FLIGHT_READINESS_UNPROVED"]);
 if(Object.keys(stock).length)open.add("CONDITIONAL_OPENING_INVENTORY");
 if(finite)open.add("FINITE_SEED_AT_TERMINAL_RESEARCH_STATE_NOT_OBTAINED_FROM_GAME_START");
 function emit(type,details={}){events.push({type,hour,date:iso(),...details,balance});}
 function cash(delta,reason){
  assert(Number.isSafeInteger(delta),"non-integral cash "+reason);
  const next=balance+delta;
  if(finite&&seed+next<0)throw Error("FINITE_CASH_EXHAUSTED:"+reason+":"+(seed+next));
  balance=next;minimum=Math.min(minimum,balance);if(delta<0)expense-=delta;else income+=delta;
  if(finite)cashLedger.push({hour,date:iso(),delta,reason,balance:seed+balance});
 }
 const cap=k=>built.reduce((s,f)=>s+num(f.rule[k]),0);
 const funcs=()=>new Set(built.flatMap(f=>arr(f.rule.provideBaseFunc)));
 const hasFuncs=ks=>arr(ks).every(k=>funcs().has(k));
 const contained=type=>Object.entries(stock).reduce((s,[k,n])=>{const r=items.get(raw(k));return s+(k.startsWith("ITEM:")&&r?.liveAlien&&(r.prisonType||0)===type?n:0);},0);
 const prison=type=>built.reduce((s,f)=>s+((f.rule.prisonType||0)===type?num(f.rule.aliens):0),0);
 const stores=()=>Object.entries(stock).reduce((s,[k,n])=>s+(k.startsWith("ITEM:")?num(items.get(raw(k))?.size)*n:0),0);
 const craftCount=()=>Object.entries(stock).reduce((s,[k,n])=>s+(k.startsWith("CRAFT:")?n:0),0);
 const invCost=()=>Object.entries(stock).reduce((s,[k,n])=>{const r=k.startsWith("CRAFT:")?index.crafts.get(raw(k)):items.get(raw(k));return s+n*num(k.startsWith("CRAFT:")?r?.rentCost:r?.monthlyMaintenance);},0);
 function maintenance(){const f=cap("monthlyCost"),p=eng*g.engineerSalary,i=invCost();return {facilities:f,engineers:p,inventoryAndCraft:i,total:f+p+i};}
 function nextMonthHour(){const now=new Date(epoch+hour*3600000);return Math.round((Date.UTC(now.getUTCFullYear(),now.getUTCMonth()+1,1)-epoch)/3600000);}
 function advance(n){
  assert(Number.isSafeInteger(n)&&n>=0);
  const end=hour+n;
  while(nextMonthHour()<=end){if(month>=maxMonths)throw Error("FINANCING_MONTH_BUDGET_EXHAUSTED");hour=nextMonthHour();month++;const m=maintenance();cash(-m.total,"monthlyFunding");payroll+=m.engineers;netFacilities-=m.facilities;monthly.push({month,hour,date:iso(),...m,balance});for(const k of Object.keys(buyLog))delete buyLog[k];}
  hour=end;
 }
 // Wait only when the next month actually has positive net cash flow.
 // This is an executed calendar transition, never a synthetic cash grant.
 function awaitCash(amount){
  if(!finite)return;
  assert(Number.isSafeInteger(amount)&&amount>=0,"invalid liquidity target");
  while(seed+balance<amount){
   const m=maintenance();assert(m.total<0,"NO_POSITIVE_PASSIVE_CASHFLOW");
   advance(nextMonthHour()-hour);financing.waitMonths++;
   emit("fundingWait",{required:amount,netMonthly:-m.total,available:seed+balance});
  }
 }
 function add(k,n){assert(Number.isSafeInteger(n)&&n>=0);stock[k]=(stock[k]||0)+n;}
 function use(k,n){assert((stock[k]||0)>=n,"missing stock "+k);stock[k]-=n;}
 function footprint(r){return [num(r.sizeX)||num(r.size)||1,num(r.sizeY)||num(r.size)||1];}
 function place(id,r,first=false){
  const [sx,sy]=footprint(r),opts=[];
  for(let y=0;y<=6-sy;y++)for(let x=0;x<=6-sx;x++){
   let free=true,touches=0;
   for(let j=y;j<y+sy;j++)for(let i=x;i<x+sx;i++){if(grid[j][i])free=false;for(const [dx,dy] of [[0,1],[0,-1],[1,0],[-1,0]])if(grid[j+dy]?.[i+dx])touches++;}
   if(free&&(first||touches))opts.push({x,y,sx,sy,touches});
  }
  // Edge-first packing reserves contiguous interior regions for 2x2 facilities.
  opts.sort((a,b)=>(first?Math.abs(a.x-2)+Math.abs(a.y-2)-Math.abs(b.x-2)-Math.abs(b.y-2):Math.min(a.x,a.y,6-a.x-a.sx,6-a.y-a.sy)-Math.min(b.x,b.y,6-b.x-b.sx,6-b.y-b.sy)||b.touches-a.touches)||a.y-b.y||a.x-b.x);
  const p=opts[0];assert(p,"6x6 base cannot fit "+id);
  for(let y=p.y;y<p.y+p.sy;y++)for(let x=p.x;x<p.x+p.sx;x++)grid[y][x]=id;
  return {x:p.x,y:p.y,sizeX:p.sx,sizeY:p.sy};
 }
 const lift=facilities.get("STR_ACCESS_LIFT");assert(lift);built.push({id:"STR_ACCESS_LIFT",rule:lift,...place("STR_ACCESS_LIFT",lift,true),builtAt:0});
 function allowed(id,r){
  const count=built.filter(f=>f.id===id).length;
  return activeAll(r.requires)&&!arr(r.requires).includes("STR_UNAVAILABLE")&&hasFuncs(r.requiresBaseFunc)&&!arr(r.buildOverFacilities).length&&
   !arr(r.forbiddenBaseFunc).some(k=>funcs().has(k))&&!built.some(f=>arr(f.rule.forbiddenBaseFunc).some(k=>arr(r.provideBaseFunc).includes(k)))&&
   (!num(r.maxAllowedPerBase)||count<num(r.maxAllowedPerBase));
 }
 function build(id,material=null){
  const r=facilities.get(id);assert(r&&allowed(id,r),"facility gate "+id);
  const mats=Object.fromEntries(Object.entries(r.buildCostItems||{}).map(([k,v])=>[asset(k),num(typeof v==="object"?v.build:v)]).filter(([,v])=>v>0));
  if(material)assert.equal(key(Object.entries(mats).sort()),key(Object.entries(material).sort()),"facility material mismatch");
  const cost=num(r.buildCost),days=num(r.buildTime);awaitCash(cost);
  for(const [k,n] of Object.entries(mats))use(k,n);
  const p=place(id,r);cash(-cost,"facility:"+id);emit("startFacility",{id,cost,materials:mats,days,...p});advance(days*DAY);
  built.push({id,rule:r,...p,builtAt:hour});emit("finishFacility",{id,...p,monthlyCost:num(r.monthlyCost),workshops:num(r.workshops),storage:num(r.storage),personnel:num(r.personnel),aliens:num(r.aliens),prisonType:r.prisonType||0,crafts:num(r.crafts)});
 }
 function facilityFor(k,needed,type=0){
  const candidates=[...facilities].filter(([id,r])=>num(r[k])>0&&allowed(id,r)&&!Object.keys(r.buildCostItems||{}).length&&num(r.buildCost)>0&&(k!=="aliens"||(r.prisonType||0)===type));
  candidates.sort((a,b)=>Number(num(b[1][k])>=needed)-Number(num(a[1][k])>=needed)||num(a[1].buildCost)/Math.min(needed,num(a[1][k]))-num(b[1].buildCost)/Math.min(needed,num(b[1][k]))||a[0].localeCompare(b[0]));
  assert(candidates.length,"capacity source missing "+k);
  build(candidates[0][0]);
 }
 function capacity(k,needed,type=0){
  for(let i=0;i<36&&(k==="aliens"?prison(type):cap(k))+EPS<needed;i++)facilityFor(k,needed-(k==="aliens"?prison(type):cap(k)),type);
  assert((k==="aliens"?prison(type):cap(k))+EPS>=needed,"capacity "+k);
 }
 function stockCapacity(extra){
  let s=stores();const types=new Map();
  for(const [k,n] of Object.entries(extra)){
   if(!k.startsWith("ITEM:"))continue;const r=items.get(raw(k));assert(r,"unknown item "+k);s+=num(r.size)*n;if(r.liveAlien)types.set(r.prisonType||0,(types.get(r.prisonType||0)||0)+n);
  }
  capacity("storage",s);for(const [t,n] of types)capacity("aliens",contained(t)+n,t);
  peakStores=Math.max(peakStores,s);for(const [t,n] of types)peakCaptives=Math.max(peakCaptives,contained(t)+n);
 }
 function buy(k,n){
  assert(k.startsWith("ITEM:"));const r=items.get(raw(k));
  assert(r&&num(r.costBuy)>0&&activeAll(r.requires)&&activeAll(r.requiresBuy)&&hasFuncs(r.requiresBuyBaseFunc)&&!r.requiresBuyCountry&&!arr(r.buyRequirements).length&&!(r.buyRequirements&&typeof r.buyRequirements==="object"&&!Array.isArray(r.buyRequirements)&&Object.keys(r.buyRequirements).length),"purchase gate "+k);
  const unit=Math.trunc(num(r.costBuy)*g.buyCoefficients[difficulty]/100),limit=num(r.monthlyBuyLimit);
  if(r.script||r.scripts)open.add("ITEM_PRICE_OR_AVAILABILITY_SCRIPT_NOT_EXECUTED");
  while(n>0){
   let q=limit?Math.min(n,limit-(buyLog[k]||0)):n;
   if(q<=0){advance(nextMonthHour()-hour);continue;}
   stockCapacity({[k]:q}); // construction can cross a monthly boundary
   awaitCash(unit*q);cash(-unit*q,"purchase:"+k);buyLog[k]=(buyLog[k]||0)+q;const transfer=r.transferTime===undefined?24:num(r.transferTime);
   emit("purchase",{asset:k,quantity:q,unitCost:unit,cost:unit*q,transferHours:transfer,monthlyBuyLimit:limit});
   // Stock in transfer counts for stores/containment and maintenance.
   add(k,q);advance(transfer);emit("receive",{asset:k,quantity:q});n-=q;
  }
 }
 function hire(n){if(n<=eng)return;capacity("personnel",n);const count=n-eng;awaitCash(count*g.engineerHire);cash(-count*g.engineerHire,"engineerHire");emit("hireEngineers",{count,cost:count*g.engineerHire,transferHours:g.personnelTransferHours});eng=n;advance(g.personnelTransferHours);emit("engineersArrived",{count:eng});}
 function executeManufacture(s,autoSell=false){
  const a=index.recipes.get(s.recipe),r=manufacture.get(s.recipe);assert(a&&r&&activeAll(a.research)&&hasFuncs(a.functions),"manufacture gate "+s.recipe);
  assert(!r.spawnedPersonType&&!r.spawnedSoldier,"person output unsupported");
  if(r.randomProducedItems?.length||r.spawnedItem||r.spawnedEvent||r.randomEvents||r.eventWeights||r.points)open.add("MANUFACTURE_SIDE_EFFECTS_NOT_REPLAYED");
  assert.equal(key(Object.entries(s.inputs).sort()),key(Object.entries(a.inputs).map(([k,n])=>[k,n*s.batches]).sort()));
  assert.equal(key(Object.entries(s.outputs).sort()),key(Object.entries(a.outputs).map(([k,n])=>[k,n*s.batches]).sort()));
  // Capacity is based on completed buildings; the origin's real base is
  // not assumed to possess any facilities besides the dedicated lift.
  assert(cap("workshops")>a.space,"workshop fixed space "+s.recipe);
  hire(Math.min(staff,cap("workshops")-a.space));const assigned=Math.min(eng,cap("workshops")-a.space);assert(assigned>0);
  if(!autoSell){
   // Conservative peak storage: before input consumption plus all outputs.
   stockCapacity(s.outputs);
   const craftOut=Object.entries(s.outputs).filter(([k])=>k.startsWith("CRAFT:")).reduce((n,[,v])=>n+v,0);
   if(craftOut){const consumed=Object.entries(s.inputs).filter(([k])=>k.startsWith("CRAFT:")).reduce((n,[,v])=>n+v,0);capacity("crafts",Math.max(craftCount(),craftCount()-consumed+craftOut));}
  }
  const delay=Math.max(0,...arr(r.transferTimes).map(num));let duration=0,profit=0;
  // Single-batch payment then hourly progress. Round EACH batch up; this
  // is conservative versus engine carry-over across unit boundaries.
  const batchHours=Math.ceil(a.hours/assigned);assert(batchHours>=0);
  emit("manufactureStart",{recipe:s.recipe,batches:s.batches,assigned,space:a.space,unitHours:a.hours,unitCost:a.cost,autoSell});
  for(let i=0;i<s.batches;i++){
   awaitCash(a.cost);for(const [k,n] of Object.entries(a.inputs))use(k,n);
   cash(-a.cost,"manufacture:"+a.id);advance(batchHours);duration+=batchHours;engineerHours+=a.hours;
   if(autoSell){
    const val=Object.entries(a.outputs).reduce((v,[k,n])=>v+Math.trunc(num(items.get(raw(k))?.costSell)*g.sellCoefficients[difficulty]/100)*n,0);
    cash(val,"sale:"+a.id);sales+=val;profit+=val-a.cost;
   }else{for(const [k,n] of Object.entries(a.outputs))add(k,n);}
  }
  if(delay&&!autoSell)advance(delay);
  emit("manufactureFinish",{recipe:s.recipe,batches:s.batches,durationHours:duration,transferHours:delay,engineerHours:a.hours*s.batches,saleNet:profit,outputs:s.outputs});
 }
 try{
  // No country subsidies are booked. Farms are constructed only if their
  // actual research gate is open and the layout allows their placement.
  for(let i=0;i<farmCount;i++)build("STR_HYDROPONICS");
  const early=new Set();
  if(finite){
   if(funding.mode==="REPEAT_SALES"){
    // Only advance independent, material-free facilities already in
    // the procurement plan. No early construction of gated buildings.
    for(const [i,s] of plan.steps.entries()){
     if(s.type!=="buildFacility"||Object.keys(s.materials||{}).length||!s.workshops)continue;
     const r=facilities.get(s.id);
     if(r&&allowed(s.id,r)){build(s.id,s.materials);early.add(i);}
    }
    const lotSize=funding.lotSize||10;assert(Number.isSafeInteger(lotSize)&&lotSize>0);
    const candidates=[];
    for(const a of index.recipes.values()){
     const r=manufacture.get(a.id);
     if(!r||!activeAll(a.research)||!hasFuncs(a.functions)||a.randomExtras||a.hours<=0||cap("workshops")<=a.space||Object.keys(a.outputs).some(k=>!k.startsWith("ITEM:")))continue;
     if(r.spawnedPersonType||r.spawnedSoldier||r.spawnedItem||r.spawnedEvent||r.randomEvents||r.eventWeights||r.points)continue;
     let unitCost=a.cost,delay=0,valid=true;
     for(const [k,n] of Object.entries(a.inputs)){
      const v=items.get(raw(k));
      if(!k.startsWith("ITEM:")||!v||!num(v.costBuy)||v.liveAlien||v.monthlyBuyLimit||!activeAll(v.requires)||!activeAll(v.requiresBuy)||!hasFuncs(v.requiresBuyBaseFunc)||v.requiresBuyCountry||arr(v.buyRequirements).length||v.buyRequirements&&typeof v.buyRequirements==="object"&&!Array.isArray(v.buyRequirements)&&Object.keys(v.buyRequirements).length){valid=false;break;}
      unitCost+=Math.trunc(num(v.costBuy)*g.buyCoefficients[difficulty]/100)*n;
      delay+=v.transferTime===undefined?24:num(v.transferTime);
     }
     if(!valid)continue;
     const revenue=Object.entries(a.outputs).reduce((s,[k,n])=>s+Math.trunc(num(items.get(raw(k))?.costSell)*g.sellCoefficients[difficulty]/100)*n,0);
     const assigned=Math.min(staff,cap("workshops")-a.space),elapsed=Math.ceil(a.hours/assigned)*lotSize+delay;
     if(revenue<=unitCost||elapsed<=0)continue;
     candidates.push({a,unitCost,revenue,score:(revenue-unitCost)*lotSize/elapsed});
    }
    candidates.sort((a,b)=>b.score-a.score||a.a.id.localeCompare(b.a.id));
    const chosen=candidates[0];assert(chosen,"NO_REPEATABLE_PROFIT_RECIPE");
    const a=chosen.a;financing.recipe=a.id;financing.candidates=candidates.length;financing.unitMargin=chosen.revenue-chosen.unitCost;financing.lotSize=lotSize;
    const desired=Math.min(staff,cap("workshops")-a.space);
    // Finish the necessary capacity before committing to a higher monthly
    // payroll. Accumulate actual working capital while the base is still
    // net-positive; cover the first lot and three adverse monthly debits.
    capacity("personnel",desired);
    stockCapacity(Object.fromEntries(Object.entries(a.inputs).map(([k,v])=>[k,v*lotSize])));
    const extraEngineers=Math.max(0,desired-eng);
    const upkeepBuffer=3*Math.max(0,maintenance().total+extraEngineers*g.engineerSalary);
    const startupReserve=extraEngineers*g.engineerHire+chosen.unitCost*lotSize+upkeepBuffer;
    awaitCash(startupReserve);
    financing.startupReserve=startupReserve;financing.upkeepBuffer=upkeepBuffer;
    hire(desired);
    emit("fundingStart",{mode:funding.mode,recipe:a.id,reserve:funding.reserve,seed,unitMargin:financing.unitMargin,lotSize});
    let stale=0;
    while(seed+balance<funding.reserve){
     const before=balance,e0=expense,i0=income;
     const gap=funding.reserve-(seed+balance),lot=Math.min(lotSize,Math.max(1,Math.ceil(gap/financing.unitMargin)));
     const inputs=Object.fromEntries(Object.entries(a.inputs).map(([k,v])=>[k,v*lot]));
     const outputs=Object.fromEntries(Object.entries(a.outputs).map(([k,v])=>[k,v*lot]));
     awaitCash(chosen.unitCost*lot);
     for(const [k,v] of Object.entries(inputs))buy(k,v);
     executeManufacture({recipe:a.id,batches:lot,inputs,outputs},true);
     financing.cycles+=lot;financing.lots++;financing.expense+=expense-e0;financing.revenue+=income-i0;
     stale=balance<=before?stale+1:0;
     if(stale>=3)throw Error("REPEAT_SALES_NON_POSITIVE_OBSERVED_CASHFLOW");
    }
   }else{emit("fundingStart",{mode:funding.mode,reserve:funding.reserve,seed});awaitCash(funding.reserve);}
   financing.reserveReached=seed+balance;financing.fundingHours=hour;financing.fundingMonthPayments=month;
   emit("fundingReady",{available:seed+balance,reserve:funding.reserve,cycles:financing.cycles,lots:financing.lots});
  }
  for(const [i,s] of plan.steps.entries()){
   if(early.has(i))continue;
   if(s.type==="buildFacility"){build(s.id,s.materials);}
   else if(s.type==="purchase")buy(s.asset,s.quantity);
   else if(s.type==="manufacture"){
    if(purchaseElerium&&s.recipe==="STR_ELERIUM_115_XXX"){buy("ITEM:STR_ELERIUM_115",s.outputs["ITEM:STR_ELERIUM_115"]);continue;}
    if(prefundCycles>0&&s.recipe==="STR_ELERIUM_115_XXX"){
     const a=index.recipes.get(prefundRecipe),r=manufacture.get(prefundRecipe);
     assert(a&&r&&!a.randomExtras&&a.cost>=0&&a.hours>0&&activeAll(a.research)&&hasFuncs(a.functions)&&Object.keys(a.outputs).every(k=>k.startsWith("ITEM:")),"prefund recipe");
     assert(!r.spawnedPersonType&&!r.spawnedSoldier&&!r.spawnedItem&&!r.spawnedEvent&&!r.randomEvents&&!r.eventWeights&&!r.points,"prefund side effects");
     const n=prefundCycles;
     // Finance batches individually, including input purchases and arrival.
     // No money or stock grant is inserted between cycles.
     const perBatch={recipe:a.id,batches:1,inputs:a.inputs,outputs:a.outputs};
     if(!Object.keys(a.inputs).length)executeManufacture({recipe:a.id,batches:n,inputs:{},outputs:Object.fromEntries(Object.entries(a.outputs).map(([k,v])=>[k,v*n]))},true);
     else for(let j=0;j<n;){
      const lot=Math.min(prefundLotSize,n-j);
      const inputs=Object.fromEntries(Object.entries(a.inputs).map(([k,v])=>[k,v*lot]));
      const outputs=Object.fromEntries(Object.entries(a.outputs).map(([k,v])=>[k,v*lot]));
      // Reserve the entire lot's inputs and execute its production. Capacity,
      // transfer and purchase limits remain enforced by buy().
      for(const [k,v] of Object.entries(inputs))buy(k,v);
      executeManufacture({...perBatch,batches:lot,inputs,outputs},true);
      j+=lot;
     }
     prefundCycles=0;
    }
    executeManufacture(s);
   }else if(s.type==="reserveForTarget"){assert((stock[s.asset]||0)>=s.quantity);emit("targetReserved",{asset:s.asset,quantity:s.quantity});}
   else throw Error("unsupported plan step "+s.type);
  }
  const requiredCapital=finite?seed:Math.max(0,-minimum);
  const result={status:"CONDITIONAL_PROJECT_SCHEDULE",target:target.id,planHash:plan.planHash,sourceFingerprint:economy.evidence.fingerprint,scenario:{difficulty,staff,farmCount,prefundCycles:initialPrefundCycles,prefundRecipe,prefundLotSize,purchaseElerium,countryFunding:0,startingResearchMonth:w.month||0,startDate:new Date(epoch).toISOString(),existingLift:true,...(finite?{funding:{...funding},capitalMode:"FINITE_CONDITIONAL_SEED"}:{})},budget:{requiredCapital,closingCash:requiredCapital+balance,expenses:expense,income,sales,payroll,netFacilities,elapsedHours:hour,elapsedDays:hour/24,monthlyPayments:month,engineerHours,peakStores,peakCaptives,engineers:eng},events,monthly,...(finite?{financing,cashLedger,minimumActualBalance:seed+minimum}:{}),layout:built.map(({rule,...f})=>f),inventory:stock,openConditions:[...open],scope:"Incremental project schedule with conditional opening capital; no grant to career world, no full campaign admission."};
  return {...result,scheduleHash:key(result)};
 }catch(e){return {status:"UNRESOLVED_PROJECT_SCHEDULE",target:target.id,planHash:plan.planHash,sourceFingerprint:economy.evidence.fingerprint,scenario:{difficulty,staff,farmCount,prefundCycles:initialPrefundCycles,prefundRecipe,prefundLotSize,purchaseElerium},reason:String(e.message),partialEvents:events.length,elapsedHours:hour,...(finite?{funding,financing,minimumActualBalance:seed+minimum,closingActualBalance:seed+balance}: {})};}
}
