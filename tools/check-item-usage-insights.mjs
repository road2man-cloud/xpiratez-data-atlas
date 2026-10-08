import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const args=process.argv.slice(2);
const arg=(k,f)=>{const p=args.indexOf(k);return p>=0&&args[p+1]?args[p+1]:f};
const itemsDir=path.resolve(arg("--items","public/items/data"));
const worldDir=path.resolve(arg("--world","public/data"));
const json=(root,...xs)=>JSON.parse(fs.readFileSync(path.join(root,...xs),"utf8"));
const gz=(root,...xs)=>JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(root,...xs))));
function assert(v,msg){if(!v)throw new Error(msg)}
const items=json(itemsDir,"items-index.json").index;
const usageIndex=json(itemsDir,"item-usage-index.json");
const usageMap=new Map(usageIndex.index.map(x=>[x.id,x]));
const usageBuckets=new Map(),editorialBuckets=new Map(),itemBuckets=new Map();
const manufactured=json(worldDir,"manufacture-index.json").index;
const events=gz(worldDir,"events-index.json.gz").index;
const sourceManufacture=new Map(),sourceEvents=new Map();
function bucketRead(cache,root,dir,bucket,suffix=".json"){
  if(!cache.has(bucket))cache.set(bucket,suffix===".json"?json(root,dir,bucket+suffix).details:gz(root,dir,bucket+suffix).details);
  return cache.get(bucket);
}
function usage(row){return bucketRead(usageBuckets,itemsDir,"item-usage-chunks",row.bucket)[row.id]}
function editorial(row){return bucketRead(editorialBuckets,itemsDir,"item-editorial-chunks",row.bucket)[row.id]}
function item(row){return bucketRead(itemBuckets,itemsDir,"chunks",row.bucket)[row.id]}
function uniquePairs(xs){return xs.map(x=>x.id+":"+x.qty).sort()}
function equal(actual,expected,message){assert(JSON.stringify(actual)===JSON.stringify(expected),message+" expected="+JSON.stringify(expected)+" actual="+JSON.stringify(actual))}
assert(usageIndex.meta.version===1&&usageIndex.meta.itemCount===items.length,"Usage index metadata mismatch");
assert(usageMap.size===items.length&&new Set(usageIndex.index.map(x=>x.id)).size===items.length,"Item usage index coverage");
assert(usageIndex.meta.manufactureCount===manufactured.length&&usageIndex.meta.eventCount===events.length,"Source counts drift");
const itemMap=new Map(items.map(x=>[x.id,x]));
let edgeCount=0,monthlyReliefCount=0,sourceEdges=0,eventEdges=0;
for(const row of items){
  const u=usage(row),ed=editorial(row),i=item(row),ix=usageMap.get(row.id);
  assert(u?.id===row.id&&ed&&ix,"Missing item usage/editorial "+row.id);
  assert(typeof ed.uses==="string"&&ed.uses.length>=35&&typeof ed.economics==="string"&&ed.economics.length>=35,"Missing contextual insight "+row.id);
  assert(u.economy.monthlyMaintenance===row.monthlyMaintenance,"Maintenance source mismatch "+row.id);
  assert((u.economy.monthlyMaintenanceRelief||0)===Math.max(0,-row.monthlyMaintenance),"Maintenance benefit mismatch "+row.id);
  assert((u.economy.monthlyMaintenanceCost||0)===Math.max(0,row.monthlyMaintenance),"Maintenance cost mismatch "+row.id);
  assert(ix.materialUses===u.consumes.length,"Consumption index mismatch "+row.id);
  assert(ix.manufactureSources===new Set(u.produces.map(x=>x.id)).size,"Production index mismatch "+row.id);
  assert(ix.manufactureTotalRecipes===new Set([...u.consumes,...u.produces,...u.manufactureResearchGates].map(x=>x.id)).size,"Manufacture link index mismatch "+row.id);
  const expectedUnlocks=(i.research||[]).filter(x=>(x.paths||[]).some(p=>p.startsWith("dependencies.")||p.startsWith("requires."))).map(x=>x.id).sort();
  equal(u.researchUnlocks.map(x=>x.id).sort(),expectedUnlocks,"Research flag distinction "+row.id);
  if(row.monthlyMaintenance<0){monthlyReliefCount++;assert(ed.economics.includes("월 유지비")&&ed.economics.includes("절감"),"Negative-maintenance economic insight missing "+row.id)}
  for(const use of u.consumes){
    const recipe=sourceManufacture.get(use.id);
    if(!recipe)continue;
    assert(recipe.requiredItems.find(x=>x.id===row.id)?.qty===use.qty,"Wrong recipe material count "+row.id+" -> "+use.id);
  }
  edgeCount+=u.consumes.length;sourceEdges+=u.produces.length;eventEdges+=u.eventGrants.length;
}
let manufactureInputs=0,manufactureOutputs=0;
for(const r of manufactured){
  const d=bucketRead(sourceManufacture,worldDir,"manufacture-chunks",r.bucket)[r.id]||null;
  assert(d,"Missing source recipe "+r.id);
  for(const x of d.requiredItems||[]){
    if(!itemMap.has(x.id))continue;
    manufactureInputs++;
    const u=usage(itemMap.get(x.id));
    const match=u.consumes.filter(v=>v.id===r.id&&v.qty===x.qty);
    assert(match.length===1,"Missing manufacturing material edge "+r.id+" -> "+x.id);
  }
  for(const x of d.deterministicOutputs||[]){
    if(!itemMap.has(x.id))continue;
    manufactureOutputs++;
    assert(usage(itemMap.get(x.id)).produces.some(v=>v.id===r.id&&v.qty===x.qty&&v.kind==="fixed"),"Missing fixed production "+r.id+" -> "+x.id);
  }
  for(const op of d.randomOutputs||[])for(const x of op.outputs||[]){
    if(!itemMap.has(x.id))continue;
    manufactureOutputs++;
    assert(usage(itemMap.get(x.id)).produces.some(v=>v.id===r.id&&v.qty===x.qty&&v.kind==="random"&&v.option===op.index),"Missing random production "+r.id+" -> "+x.id);
  }
}
assert(edgeCount===manufactureInputs&&sourceEdges===manufactureOutputs,"Manufacture graph incomplete");
let grants=0;
for(const row of events){
  const d=bucketRead(sourceEvents,worldDir,"event-chunks",row.bucket,".json.gz")[row.id];
  assert(d,"Missing event source "+row.id);
  for(const x of d.effects?.researchRewards||[]){
    if(!itemMap.has(x.id))continue;
    assert(usage(itemMap.get(x.id)).eventResearchGrants.some(g=>g.id===row.id),"Missing event research-flag grant "+row.id+" -> "+x.id);
  }
  for(const x of d.effects?.guaranteedItems||[]){
    if(!itemMap.has(x.id))continue;
    grants++;
    assert(usage(itemMap.get(x.id)).eventGrants.some(g=>g.id===row.id&&g.kind==="fixed"&&g.qty===x.qty),"Missing guaranteed event grant "+row.id+" -> "+x.id);
  }
  for(const x of d.effects?.randomItems?.list||[]){
    if(!itemMap.has(x.id))continue;
    grants++;
    assert(usage(itemMap.get(x.id)).eventGrants.some(g=>g.id===row.id&&g.kind==="random-list"),"Missing random event grant "+row.id+" -> "+x.id);
  }
  for(const op of d.effects?.randomItems?.multi||[])for(const x of op.items||[]){
    if(!itemMap.has(x.id))continue;
    grants++;
    assert(usage(itemMap.get(x.id)).eventGrants.some(g=>g.id===row.id&&g.kind==="random-bundle"&&g.qty===x.qty),"Missing bundled event grant "+row.id+" -> "+x.id);
  }
}
assert(eventEdges===grants,"Event grant graph incomplete");
assert(monthlyReliefCount===usageIndex.meta.negativeMaintenanceItems,"Monthly cost coverage regression");
const bless=usage(itemMap.get("STR_MUTANT_BLESSINGS"));
const recipes=Object.fromEntries(bless.consumes.map(x=>[x.id,x.qty]));
equal(recipes,{STR_OFFERING_TO_PURPLE_BLOOM:69,STR_RIBBON:1,STR_WARRIOR_SUMMONING:32},"Blessings use cases");
assert(bless.researchUnlocks.some(x=>x.id==="STR_LAMIA_RECRUITMENT"),"Blessings research gate missing");
assert(bless.eventGrants.length>0,"Blessings event grant missing");
const offering=usage(itemMap.get("STR_OFFERING_TO_PURPLE_BLOOM"));
assert(offering.economy.monthlyMaintenance===-33000&&offering.economy.sellValue===69000&&offering.economy.size===-10,"Purple Bloom economics regression");
assert(offering.economy.holdingMonthsToExceedSale>2&&offering.economy.holdingMonthsToExceedSale<2.1,"Purple Bloom opportunity calculation regression");
assert(offering.transformations.some(x=>x.qty===1),"Purple Bloom transformation cost missing");
assert(editorial(itemMap.get("STR_MUTANT_BLESSINGS")).uses.includes("×32")&&editorial(itemMap.get("STR_MUTANT_BLESSINGS")).uses.includes("×69"),"Blessings consumer context missing");
assert(editorial(itemMap.get("STR_OFFERING_TO_PURPLE_BLOOM")).economics.includes("33,000"),"Offering income context missing");
assert(usage(itemMap.get("STR_INDUSTRIAL_STOCKS")).economy.monthlyMaintenanceRelief===100000,"Industrial Stocks recurring effect missing");
console.log("OK item-use insights: "+items.length+" items, "+manufactured.length+" recipes, "+edgeCount+" material uses, "+sourceEdges+" outputs, "+eventEdges+" event grants, "+monthlyReliefCount+" negative-maintenance items; Blessings 1/32/69 and Offering monthly -33,000 verified");
