// Source-backed bill of materials and chronological procurement proposals.
 // These are not grants to the replay world. Open leaves are obligations.
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import yaml from "js-yaml";
import {key,sha} from "./population-research-career-core.mjs";
const arr=x=>Array.isArray(x)?x:[],qty=x=>Math.max(0,Number(x)||0),uniq=a=>[...new Set(a)];
export function loadSupplyRules(gameRoot,metadata){
 const manifest=JSON.parse(fs.readFileSync("public/ruleset/manifest.json")),root=path.join(gameRoot,"user/mods/Piratez");
 assert.equal(manifest.sourceVersion,"v.o2");
 const sections=["items","crafts","manufacture","facilities","research","events","eventScripts"],maps=Object.fromEntries(sections.map(s=>[s,new Map()])),refs={},hashes={};
 function read(file,p,expected){
  const b=fs.readFileSync(p),h=sha(b);if(expected)assert.equal(h,expected,file);hashes[file]=h;
  const d=yaml.load(b.toString("utf8"),{json:true});
  for(const s of sections)for(const r of arr(d?.[s])){
   if(!r||typeof r!=="object")continue;
   if(r.delete){maps[s].delete(r.delete);continue;}
   const id=s==="items"||s==="crafts"||s==="facilities"||s==="eventScripts"?r.type:r.name||r.type;
   if(!id)continue;maps[s].set(id,{...maps[s].get(id),...r});
   (refs[s+"|"+id]??=[]).push(file);
  }
 }
 for(const f of ["items","crafts","manufacture","facilities","research"]){const p="standard/xcom1/"+f+".rul";read(p,path.join(gameRoot,p));}
 for(const e of manifest.files.filter(e=>e.path.startsWith("Ruleset/")&&e.path.endsWith(".rul")).sort((a,b)=>a.path.localeCompare(b.path,"en")))read(e.path,path.join(root,e.path),e.sha256);
 const {items,crafts,manufacture,facilities,research,events,eventScripts}=maps;
 // RuleManufacture post-load resolves items before crafts. Craft category
 // produces a craft rather than inventory. Preserve multiple fixed outputs.
 const asset=id=>items.has(id)?"ITEM:"+id:crafts.has(id)?"CRAFT:"+id:"UNKNOWN:"+id;
 const raw=id=>id.slice(id.indexOf(":")+1);
 const source=(section,id)=>refs[section+"|"+id]||[];
 const recipes=new Map(),byOutput=new Map(),functions=new Map(),grants=new Map(),eventGrants=new Map();
 function push(m,k,v){const a=m.get(k)||[];a.push(v);m.set(k,a);}
 for(const [id,r] of manufacture){
  if(r.spawnedPersonType||r.spawnedItem||r.spawnedSoldier||r.spawnedPerson)continue;
  const explicit=r.producedItems;
  const outputs=explicit!==undefined?Object.entries(explicit):[[id,1]];
  const out=Object.fromEntries(outputs.filter(([k,n])=>qty(n)>0).map(([k,n])=>[r.category==="STR_CRAFT"?"CRAFT:"+k:asset(k),qty(n)]));
  if(!Object.keys(out).length||Object.keys(out).some(k=>k.startsWith("UNKNOWN:")))continue;
  if(r.category==="STR_CRAFT"&&(Object.keys(out).length!==1||Object.values(out)[0]!==1))continue;
  // Random-only recipes cannot create their default item by assumption.
  if(explicit===undefined&&arr(r.randomProducedItems).length)continue;
  const a={id,inputs:Object.fromEntries(Object.entries(r.requiredItems||{}).map(([k,n])=>[asset(k),qty(n)])),outputs:out,research:arr(r.requires),functions:arr(r.requiresBaseFunc),cost:qty(r.cost),hours:qty(r.time),space:qty(r.space),source:source("manufacture",id),randomExtras:arr(r.randomProducedItems).length>0};
  recipes.set(id,a);for(const k of Object.keys(out))push(byOutput,k,a);
 }
 for(const [id,r] of facilities)for(const f of arr(r.provideBaseFunc))push(functions,f,{id,r});
 for(const [id,r] of research)for(const k of uniq([r.spawnedItem,...arr(r.spawnedItemList)].filter(Boolean)))push(grants,asset(k),{research:id,count:k===r.spawnedItem?Math.max(1,qty(r.spawnedItemCount)):1});
 for(const [id,r] of events){
  const fixed={};for(const k of arr(r.everyItemList))fixed[k]=(fixed[k]||0)+1;for(const [k,n] of Object.entries(r.everyMultiItemList||{}))fixed[k]=(fixed[k]||0)+qty(n);
  const random=uniq([...arr(r.randomItemList),...Object.keys(r.weightedItemList||{}),...arr(r.randomMultiItemList).flatMap(o=>Object.keys(o||{}))]);
  for(const k of uniq([...Object.keys(fixed),...random]))push(eventGrants,asset(k),{event:id,fixed:fixed[k]||0,random:random.includes(k)});
 }
 const scripts=new Map();
 for(const [id,r] of eventScripts){
  const ids=new Set([...arr(r.oneTimeSequentialEvents),...arr(r.oneTimeRandomEvents),...Object.keys(r.eventWeights||{}),...Object.values(r.eventWeights||{}).flatMap(o=>o&&typeof o==="object"?Object.keys(o):[])]);
  for(const e of ids)if(events.has(e))push(scripts,e,{id,researchTriggers:r.researchTriggers||{},itemTriggers:r.itemTriggers||{},executionOdds:r.executionOdds??100,firstMonth:r.firstMonth??null,lastMonth:r.lastMonth??null});
 }
 const evidence={schema:"ATLAS_TERMINAL_SUPPLY_SOURCE_V1",sourceMetadataSha256:metadata,files:hashes,counts:{items:items.size,crafts:crafts.size,recipes:recipes.size,facilities:facilities.size,research:research.size,events:events.size,eventScripts:eventScripts.size},engine:"OXCE preserved source: RuleManufacture::afterLoad, Production::haveEnoughMaterialsForOneMoreUnit/startItem"};
 return {items,crafts,recipes,byOutput,facilities,functions,grants,eventGrants,scripts,asset,raw,source,evidence:{...evidence,fingerprint:key(evidence)}};
}
export function createSupplyPlan(index,data,w,{maxCalls=900,stockMode="conditional"}={}){
 const {items,crafts,recipes,byOutput,facilities,functions,grants,eventGrants,scripts,asset,raw,source}=index;
 const active=k=>w.researched.has(k)&&!w.disabled.has(k),hasResearch=ks=>arr(ks).every(active);
 const opening=Object.fromEntries(Object.entries(w.items||{}).filter(([,n])=>qty(n)>0).map(([k,n])=>[asset(k),qty(n)]));
 const stock=stockMode==="conditional"?{...opening}:{};
 const steps=[],obligations=[],built=new Set(),building=new Set(),provided=new Set(),selectedFacilities=[],used=new Set();
 let dollars=0,hours=0,buildDays=0,workshopSpace=0,calls=0,hangars=0;
 const count=k=>stock[k]||0,add=(k,n)=>stock[k]=count(k)+n;
 function consume(k,n){assert(count(k)>=n,"flow underflow "+k);stock[k]-=n;used.add(k);}
 function spend(k,n){const before=count(k);if(before<n)throw Error("unallocated "+k);consume(k,n);}
 function availablePurchase(k){
  if(!k.startsWith("ITEM:"))return null;
  const r=items.get(raw(k));if(!r||!(qty(r.costBuy)>0))return null;
  // buyRequirements (advanced conditions) and country are not silently ignored.
  if(!hasResearch(r.requiresBuy)||arr(r.buyRequirements).length||r.requiresBuyCountry||r.buyRequirements&&typeof r.buyRequirements==="object"&&!Array.isArray(r.buyRequirements)&&Object.keys(r.buyRequirements).length)return null;
  return {r,cost:qty(r.costBuy)};
 }
 function sources(k){
  const id=raw(k),r=items.get(id),m=data.itemSupply?.[id];
  const choices=[];
  if(r&&qty(r.costBuy)>0)choices.push({kind:"PURCHASE",cost:r.costBuy,missingResearch:arr(r.requiresBuy).filter(x=>!active(x)),functions:arr(r.requiresBuyBaseFunc),country:r.requiresBuyCountry||null,buyRequirements:r.buyRequirements||null});
  for(const a of (byOutput.get(k)||[]).filter(a=>!hasResearch(a.research)).slice(0,8))choices.push({kind:"MANUFACTURE_LOCKED",recipe:a.id,missingResearch:a.research.filter(x=>!active(x))});
  for(const a of grants.get(k)||[])choices.push({kind:"RESEARCH_GRANT",...a,alreadyResearched:w.researched.has(a.research)});
  for(const a of eventGrants.get(k)||[])choices.push({kind:"EVENT_GRANT",...a,scripts:(scripts.get(a.event)||[]).slice(0,8)});
  if(m?.mapLoot?.sourceCount)choices.push({kind:"MAP_LOOT",sourceCount:m.mapLoot.sourceCount,sources:arr(m.mapLoot.sources).slice(0,8).map(x=>({block:x.block,count:x.count,terrain:x.terrain}))});
  if(m?.randomManufacture?.length)choices.push({kind:"RANDOM_MANUFACTURE",recipes:m.randomManufacture.slice(0,8)});
  return choices;
 }
 function leaf(k,n,reason){
  const id="O"+obligations.length;
  obligations.push({id,asset:k,quantity:n,reason,sourceAlternatives:sources(k)});
  // Virtual reservation, not actual inventory. Every dependent action is
  // conditional on the explicit obligation recorded in this plan.
  steps.push({type:"procurementObligation",id,asset:k,quantity:n});add(k,n);
 }
 const facilityCandidates=f=>(functions.get(f)||[]).filter(({r})=>hasResearch(r.requires)&&!arr(r.requires).includes("STR_UNAVAILABLE"));
 function ensureFunction(f,stack){
  if(provided.has(f))return;
  if(stack.includes("FUNC:"+f)){const id="O"+obligations.length;obligations.push({id,function:f,reason:"FACILITY_CYCLE"});steps.push({type:"facilityObligation",id,function:f});provided.add(f);return;}
  const candidates=facilityCandidates(f).sort((a,b)=>arr(a.r.requiresBaseFunc).length-arr(b.r.requiresBaseFunc).length||Object.keys(a.r.buildCostItems||{}).length-Object.keys(b.r.buildCostItems||{}).length||qty(a.r.buildCost)-qty(b.r.buildCost)||a.id.localeCompare(b.id));
  const chosen=candidates.find(({id,r})=>!built.has(id)&&!building.has(id)&&!arr(r.requiresBaseFunc).includes(f)&&!stack.includes("FAC:"+id));
  if(!chosen){const id="O"+obligations.length;obligations.push({id,function:f,reason:"NO_ACTIVE_PROVIDER",providers:(functions.get(f)||[]).map(({id,r})=>({id,missingResearch:arr(r.requires).filter(k=>!active(k))}))});steps.push({type:"facilityObligation",id,function:f});provided.add(f);return;}
  build(chosen.id,[...stack,"FUNC:"+f]);
 }
 function build(id,stack=[]){
  const r=facilities.get(id);assert(r&&hasResearch(r.requires),"facility not active "+id);
  if(built.has(id))return;
  assert(!building.has(id));building.add(id);
  for(const f of arr(r.requiresBaseFunc))ensureFunction(f,[...stack,"FAC:"+id]);
  const material=Object.fromEntries(Object.entries(r.buildCostItems||{}).map(([k,v])=>[asset(k),qty(typeof v==="object"?v.build:v)]).filter(([,n])=>n>0));
  for(const [k,n] of Object.entries(material)){ensure(k,n,[...stack,"FAC:"+id]);spend(k,n);}
  dollars+=qty(r.buildCost);buildDays+=qty(r.buildTime);
  building.delete(id);built.add(id);for(const f of arr(r.provideBaseFunc))provided.add(f);hangars+=qty(r.crafts);workshopSpace+=qty(r.workshops);
  const step={type:"buildFacility",id,materials:material,cost:qty(r.buildCost),days:qty(r.buildTime),monthlyCost:qty(r.monthlyCost),size:Math.max(1,qty(r.size)),workshops:qty(r.workshops),crafts:qty(r.crafts),provides:arr(r.provideBaseFunc),requires:arr(r.requires),requiresFunctions:arr(r.requiresBaseFunc),source:source("facilities",id)};
  steps.push(step);selectedFacilities.push(id);
 }
 function recipeScore(a,k,stack){
  if(a.inputs[k]||Object.keys(a.inputs).some(x=>stack.includes(x)))return Infinity;
  const out=a.outputs[k];let s=qty(a.cost)/Math.max(1,out)+qty(a.hours)*5/Math.max(1,out);
  for(const [x,n] of Object.entries(a.inputs)){
   const buy=availablePurchase(x),missing=Math.max(0,n-count(x));
   const options=(byOutput.get(x)||[]).some(b=>hasResearch(b.research)&&!b.inputs[x]);
   s+=(buy?buy.cost:options?25000:250000)*missing/Math.max(1,out);
  }
  return s+1000*a.functions.filter(f=>!provided.has(f)).length+1000*Number(a.randomExtras);
 }
 function produce(a,batches,stack){
  assert(Number.isSafeInteger(batches)&&batches>0&&hasResearch(a.research));
  for(const f of a.functions)ensureFunction(f,stack);
  ensureCapacity(a.space+1,stack);
  for(const [x,n] of Object.entries(a.inputs)){const v=n*batches;ensure(x,v,stack);spend(x,v);}
  for(const [x,n] of Object.entries(a.outputs))add(x,n*batches);
  dollars+=a.cost*batches;hours+=a.hours*batches;
  steps.push({type:"manufacture",recipe:a.id,batches,inputs:Object.fromEntries(Object.entries(a.inputs).map(([x,n])=>[x,n*batches])),outputs:Object.fromEntries(Object.entries(a.outputs).map(([x,n])=>[x,n*batches])),cost:a.cost*batches,hours:a.hours*batches,space:a.space,requires:a.research,functions:a.functions,source:a.source,randomExtrasIgnored:a.randomExtras});
 }
 function ensure(k,n,stack=[]){
  assert(Number.isSafeInteger(n)&&n>=0,"invalid demand "+k);
  if(count(k)>=n)return;
  const lack=n-count(k);
  if(++calls>maxCalls||stack.includes(k)||stack.length>30){leaf(k,lack,stack.includes(k)?"RESOURCE_CYCLE":"SEARCH_BUDGET");return;}
  const candidates=(byOutput.get(k)||[]).filter(a=>hasResearch(a.research)&&a.outputs[k]>0).map(a=>({a,score:recipeScore(a,k,stack)})).filter(x=>Number.isFinite(x.score)).sort((a,b)=>a.score-b.score||a.a.id.localeCompare(b.a.id));
  const purchase=availablePurchase(k),best=candidates[0];
  if(purchase&&(!best||purchase.cost<=best.score)){
   for(const f of arr(purchase.r.requiresBuyBaseFunc))ensureFunction(f,[...stack,k]);
   // Facilities may consume existing stock; purchase the exact outstanding count.
   const units=Math.max(0,n-count(k));if(units){add(k,units);dollars+=purchase.cost*units;steps.push({type:"purchase",asset:k,quantity:units,cost:purchase.cost*units,unitCost:purchase.cost,requires:arr(purchase.r.requiresBuy),functions:arr(purchase.r.requiresBuyBaseFunc),source:source("items",raw(k))});}return;
  }
  if(best){const batches=Math.ceil(lack/best.a.outputs[k]);produce(best.a,batches,[...stack,k]);if(count(k)<n)leaf(k,n-count(k),"NET_OUTPUT_SHORTFALL");return;}
  leaf(k,lack,"NO_ACTIVE_DETERMINISTIC_SOURCE");
 }
 function demand(k,n){
  ensure(k,n,[]);spend(k,n);steps.push({type:"reserveForTarget",asset:k,quantity:n});
 }
 function ensureCapacity(required,stack=[]){
  while(workshopSpace<required){
   const viable=[...facilities].filter(([id,r])=>!built.has(id)&&!building.has(id)&&hasResearch(r.requires)&&qty(r.workshops)>0&&arr(r.requires).length&&!arr(r.requires).includes("STR_UNAVAILABLE"))
    .sort((a,b)=>Number(qty(b[1].workshops)>=required-workshopSpace)-Number(qty(a[1].workshops)>=required-workshopSpace)||qty(a[1].buildCost)-qty(b[1].buildCost)||a[0].localeCompare(b[0]));
   if(!viable.length){const id="O"+obligations.length;obligations.push({id,reason:"WORKSHOP_CAPACITY",required,provided:workshopSpace});steps.push({type:"capacityObligation",id,required,provided:workshopSpace});return;}
   build(viable[0][0],stack);
  }
 }
 function ensureHangar(){
  if(hangars>=1)return;
  const h=[...facilities].filter(([id,r])=>qty(r.crafts)>0&&hasResearch(r.requires)&&arr(r.requires).length&&!arr(r.requires).includes("STR_UNAVAILABLE")).sort((a,b)=>qty(a[1].buildCost)-qty(b[1].buildCost))[0];
  if(h)build(h[0]);else{const id="O"+obligations.length;obligations.push({id,reason:"HANGAR_CAPACITY",required:1});steps.push({type:"capacityObligation",id,required:1,provided:0});}
 }
 function finish({target,space=0,craft=false}){
  // Source-backed actions are a dependency DAG linearization. Opening
  // inventory, all funding, layout, actual calendar, and acquisition
  // leaves remain unverified; do not mutate the campaign world.
  const knownOpening=stockMode==="conditional"?Object.fromEntries(Object.entries(opening).filter(([k])=>used.has(k))):{};
  const out={target,scope:"CONDITIONAL_PROCUREMENT_PLAN_NOT_CAMPAIGN_REPLAY",stockMode,openingStock:knownOpening,steps,obligations,budget:{dollars,manufacturingEngineerHours:hours,sequentialFacilityBuildDays:buildDays,workshopSpace,hangars,openingConditionalFunds:w.funds||0,additionalFunds:Math.max(0,dollars-(w.funds||0))},facilities:selectedFacilities,sourceFingerprint:index.evidence.fingerprint,remainingResearch:uniq(steps.flatMap(s=>s.requires||[])).filter(k=>!active(k)),openConditions:["CAMPAIGN_FUNDING_AND_INCOME","BASE_LAYOUT_AND_CAPACITY","ACTUAL_BUILD_AND_MANUFACTURE_TIME","CONDITIONAL_OPENING_STOCK_PROVENANCE","ENGINE_RUNTIME_PARITY",...(craft?["CRAFT_STATUS_AND_FLIGHT_READINESS","MISSION_VICTORY"]:["TARGET_EVENT_OR_MISSION_OCCURRENCE"])]};
  return {...out,planHash:key(out)};
 }
 function planTerminal(t){
  // Capacity first to avoid counting materials already reserved for craft.
  const a=t.craft?recipes.get(t.craft):null;
  if(t.craft&&(!a||!a.outputs["CRAFT:"+t.craft]))throw Error("Craft recipe not found "+t.craft);
  for(const f of t.baseFunctions||[])ensureFunction(f,[]);
  if(a)ensureHangar();
  if(a){produce(a,1,["CRAFT:"+t.craft]);demand("CRAFT:"+t.craft,1);}
  else for(const [k,n] of Object.entries(t.requiredItems||{}))demand(asset(k),n);
  return finish({target:t.id,craft:!!t.craft});
 }
 function planSurgery(r){
  for(const f of r.requiresBaseFunc||[])ensureFunction(f,[]);
  for(const [k,n] of Object.entries(r.requiredItems||{}))demand(asset(k),n);
  dollars+=qty(r.cost);steps.push({type:"reserveSurgery",id:r.id,cost:qty(r.cost),requires:r.requires||[],functions:r.requiresBaseFunc||[]});
  return finish({target:r.id});
 }
 return {planTerminal,planSurgery};
}
