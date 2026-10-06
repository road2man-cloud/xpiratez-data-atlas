import fs from "node:fs";
import path from "node:path";
const args=process.argv.slice(2),i=args.indexOf("--data"),dataDir=path.resolve(i>=0&&args[i+1]?args[i+1]:"public/data");
const file=(...parts)=>path.join(dataDir,...parts);

const armors=JSON.parse(fs.readFileSync(file("armors-index.json"),"utf8"));
if(!armors.index?.length)throw new Error("No armors generated");
if(armors.index.length!==new Set(armors.index.map(x=>x.id)).size)throw new Error("Duplicate armor ids");
if(!armors.counts?.equipable)throw new Error("No equipable armors generated");
const expected={armors:957,equipable:496,manufacturable:303,buyable:46};
for(const [k,v] of Object.entries(expected))if(armors.counts?.[k]!==v)throw new Error(`Expected ${k}=${v}, got ${armors.counts?.[k]}`);

const routes=JSON.parse(fs.readFileSync(file("armor-routes","base.json"),"utf8"));
if(!routes.research||!routes.buy||!routes.researchRewards||!routes.events)throw new Error("Incomplete armor route catalog");
if(routes.researchModel?.costUnit!=="scientist-days"||routes.researchModel?.progressTickDays!==1)throw new Error("Invalid OXCE research unit model");
if(routes.researchModel?.randomizedCostPercent?.min!==50||routes.researchModel?.randomizedCostPercent?.max!==150)throw new Error("Invalid OXCE research randomization model");
const manufactureCache={};
function manufactureRoute(ref){
  if(!ref?.id||!ref?.bucket)return null;
  manufactureCache[ref.bucket]??=JSON.parse(fs.readFileSync(file("armor-routes","manufacture",`${ref.bucket}.json`),"utf8")).details;
  return manufactureCache[ref.bucket][ref.id]||null;
}

const cache={},rawCache={};
for(const x of armors.index){
  if(!x.bucket)throw new Error("Missing armor bucket "+x.id);
  cache[x.bucket]??=JSON.parse(fs.readFileSync(file("armor-chunks",`${x.bucket}.json`),"utf8")).details;
  const d=cache[x.bucket][x.id];
  if(!d)throw new Error("Missing armor detail "+x.id);
  if(!Array.isArray(d.damageModifier)||d.damageModifier.length<17)throw new Error("Incomplete damage modifiers "+x.id);
  if(d.hasStoreItem&&d.storeItemId&&!d.item)throw new Error("Missing linked store item "+x.id);
  if(d.raw||d.acquisition?.manufacture||d.acquisition?.researchRewards||d.acquisition?.events||d.acquisition?.references)throw new Error("Redundant armor detail payload "+x.id);
  rawCache[x.bucket]??=JSON.parse(fs.readFileSync(file("armor-raw-chunks",`${x.bucket}.json`),"utf8")).details;
  if(!rawCache[x.bucket][x.id]?.raw)throw new Error("Missing armor raw sidecar "+x.id);
  for(const ref of d.acquisition?.manufactureRefs||[])if(!manufactureRoute(ref))throw new Error("Missing manufacture catalog entry "+ref.id);
  if(d.acquisition?.buyKey&&!routes.buy[d.acquisition.buyKey])throw new Error("Missing buy catalog entry "+d.acquisition.buyKey);
  if(d.acquisition?.researchRewardKey&&!routes.researchRewards[d.acquisition.researchRewardKey])throw new Error("Missing reward catalog entry "+d.acquisition.researchRewardKey);
  for(const eid of d.acquisition?.eventIds||[])if(!routes.events[eid])throw new Error("Missing event catalog entry "+eid);
  for(const rid of d.acquisition?.equipResearch?.nodeIds||[])if(!routes.research[rid])throw new Error("Missing research catalog entry "+rid);
  if(d.resourceFieldCount){
    const p=file("resource-chunks","armors",`${x.bucket}.json`);
    if(!fs.existsSync(p))throw new Error("Missing armor resource chunk "+x.bucket);
    const rr=JSON.parse(fs.readFileSync(p,"utf8")).details;
    if(!rr[x.id])throw new Error("Missing armor resource sidecar "+x.id);
  }
}
for(const id of ["STR_SAILOR_UNIFORM_UC","STR_LEATHER_ARMOR_UC","STR_BASIC_ARMOR_UC"]){
  const row=armors.index.find(x=>x.id===id);
  if(!row)throw new Error("Missing reference armor "+id);
  const d=cache[row.bucket][id];
  if(!d.acquisition?.manufactureRefs?.length)throw new Error("Missing manufacture route "+id);
  const m=manufactureRoute(d.acquisition.manufactureRefs[0]);
  if(!m?.research?.nodeIds?.length)throw new Error("Missing research path "+id);
  for(const rid of m.research.nodeIds)if(!routes.research[rid])throw new Error("Missing research node "+rid);
}
const sailor=cache[armors.index.find(x=>x.id==="STR_SAILOR_UNIFORM_UC").bucket].STR_SAILOR_UNIFORM_UC;
const sailorM=manufactureRoute(sailor.acquisition.manufactureRefs[0]);
if(sailorM.time!==100||sailorM.requiredItems?.STR_RAIDER_CORPSE!==1)throw new Error("Sailor Uniform acquisition smoke test failed");
const leather=cache[armors.index.find(x=>x.id==="STR_LEATHER_ARMOR_UC").bucket].STR_LEATHER_ARMOR_UC;
const leatherM=manufactureRoute(leather.acquisition.manufactureRefs[0]);
if(leatherM.requiredItems?.STR_GUILD_CORPSE!==3)throw new Error("Durathread Armor acquisition smoke test failed");
console.log(`OK: ${armors.index.length} armors, ${armors.counts.equipable} equipable, ${armors.counts.manufacturable} manufacturable, ${armors.counts.buyable} buyable`);
