import fs from "node:fs";
import path from "node:path";
const args=process.argv.slice(2),i=args.indexOf("--data"),dataDir=path.resolve(i>=0&&args[i+1]?args[i+1]:"public/data");
const file=(...parts)=>path.join(dataDir,...parts);

const armors=JSON.parse(fs.readFileSync(file("armors-index.json"),"utf8"));
if(!armors.index?.length)throw new Error("No armors generated");

const canonicalMetadataSha="b2f262211bc83e1d78e0cd4431b50736935881cb399eb0d083f147ee22521c14";
const canonicalRules={
  "HitFX-basic.rul":"bd166fb81b7a140ea67310c15cafaf9b4716fef2bdd0896f6025e8295f511ecf",
  "Piratez.rul":"9e590f54431e03f1bfaaaf2d8ab3168ecfa44ff48b52840db1d61c061da0bd33",
  "Piratez_Armors.rul":"6cce3e4db270763350a51e2ad271badd44e0a5cbe742013dfec36bbf178dabeb",
  "Piratez_BaseNames.rul":"d2d3c491dcb137a64950e7ecf0c31a29144f12420c01d6ff1262720905c2ecff",
  "Piratez_Bonuses.rul":"23e0de08b8aa647fb16ebdb250a0dd2b2566e4efc71cc866541653f88d189ca1",
  "Piratez_Events.rul":"491d8e88df45fe21cbcf55b1b538a253b7be770a365f9b2f245d71fa0cdc7ff3",
  "Piratez_Factions.rul":"6d7d44235557e61919194c743f3ad1d01c5d80c664b7022d3752671a034484ce",
  "Piratez_Globals.rul":"5edc38fb8e0fccb52247b25ce2bb3fce3528a18eeaa0adcd26efcfd69cb0cd71",
  "Piratez_Mapscripts.rul":"de72f5752d4ad320abff3a414efd919cb9181d0ad51d5555d1ba86e10d3744cb",
  "Piratez_Planet.rul":"d1b2b2645284784b9468f5443130e66eef4bf047496a252a5d751552a50a0fce",
  "Piratez_Resources.rul":"080c8a0478443eb0a1696964972d89641eeda571263b920b8e03fc2f4d693892",
  "Piratez_Transformations.rul":"18fed01d0e134aa67b309b1ff820be4f4515b0f84d760ef8fb2864fe2ac9a1f4",
  "Piratez_Wardrobe.rul":"cf6ce9cfc4c0a7f1b339a400c89bc1ab1e48a9229303474cb391b8f1e1a0736a",
  "Recolr.rul":"d1b8b6187fc630b9905a4411ce2b070ce03ec2e6bc268f6098be428832da25c0",
  "Shotguns_Rebalance.rul":"2d14a888bfb9535f21c2dfe18feed3df66b45215fa01af4c229a14f99243751b",
  "Yankes_Scripts.rul":"4e35b8f5d4d3176736a6e2ded0476a0e2fc40d382a81936e92b4e7456bfc5eb1"
};
if(armors.meta?.source?.metadataSha256!==canonicalMetadataSha)throw new Error("Armor data is not from canonical XPZ o1.1.1 metadata");
const actualRules=Object.fromEntries((armors.meta?.source?.rules||[]).map(x=>[x.file,x.sha256]));
if(Object.keys(actualRules).length!==Object.keys(canonicalRules).length)throw new Error("Unexpected canonical rule count");
for(const [name,sha] of Object.entries(canonicalRules))if(actualRules[name]!==sha)throw new Error(`Canonical rule mismatch: ${name}`);
for(const name of Object.keys(actualRules))if(!(name in canonicalRules))throw new Error(`Non-canonical rule leaked into armor data: ${name}`);
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
