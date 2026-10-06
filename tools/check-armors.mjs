import fs from "node:fs";

const armors=JSON.parse(fs.readFileSync("public/data/armors-index.json","utf8"));
if(!armors.index?.length)throw new Error("No armors generated");
if(armors.index.length!==new Set(armors.index.map(x=>x.id)).size)throw new Error("Duplicate armor ids");
if(!armors.counts?.equipable)throw new Error("No equipable armors generated");
const expected={armors:957,equipable:496,manufacturable:303,buyable:46};
for(const [k,v] of Object.entries(expected))if(armors.counts?.[k]!==v)throw new Error(`Expected ${k}=${v}, got ${armors.counts?.[k]}`);

const cache={};
for(const x of armors.index){
  if(!x.bucket)throw new Error("Missing armor bucket "+x.id);
  cache[x.bucket]??=JSON.parse(fs.readFileSync(`public/data/armor-chunks/${x.bucket}.json`,"utf8")).details;
  const d=cache[x.bucket][x.id];
  if(!d)throw new Error("Missing armor detail "+x.id);
  if(!Array.isArray(d.damageModifier)||d.damageModifier.length<17)throw new Error("Incomplete damage modifiers "+x.id);
  if(d.hasStoreItem&&d.storeItemId&&!d.item)throw new Error("Missing linked store item "+x.id);
  if(d.resourceFieldCount){
    const p=`public/data/resource-chunks/armors/${x.bucket}.json`;
    if(!fs.existsSync(p))throw new Error("Missing armor resource chunk "+x.bucket);
    const rr=JSON.parse(fs.readFileSync(p,"utf8")).details;
    if(!rr[x.id])throw new Error("Missing armor resource sidecar "+x.id);
  }
}
for(const id of ["STR_SAILOR_UNIFORM_UC","STR_LEATHER_ARMOR_UC","STR_BASIC_ARMOR_UC"]){
  const row=armors.index.find(x=>x.id===id);
  if(!row)throw new Error("Missing reference armor "+id);
  const d=cache[row.bucket][id];
  if(!d.acquisition?.manufacture?.length)throw new Error("Missing manufacture route "+id);
  if(!d.acquisition.manufacture[0].research?.nodes?.length)throw new Error("Missing research path "+id);
}
const sailor=cache[armors.index.find(x=>x.id==="STR_SAILOR_UNIFORM_UC").bucket].STR_SAILOR_UNIFORM_UC;
if(sailor.acquisition.manufacture[0].time!==100||sailor.acquisition.manufacture[0].requiredItems?.STR_RAIDER_CORPSE!==1)throw new Error("Sailor Uniform acquisition smoke test failed");
const leather=cache[armors.index.find(x=>x.id==="STR_LEATHER_ARMOR_UC").bucket].STR_LEATHER_ARMOR_UC;
if(leather.acquisition.manufacture[0].requiredItems?.STR_GUILD_CORPSE!==3)throw new Error("Durathread Armor acquisition smoke test failed");
console.log(`OK: ${armors.index.length} armors, ${armors.counts.equipable} equipable, ${armors.counts.manufacturable} manufacturable, ${armors.counts.buyable} buyable`);
