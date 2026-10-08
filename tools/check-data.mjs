import fs from "node:fs";
import path from "node:path";
import {hasPresentationResourceKey} from "./data-normalize.mjs";
const args=process.argv.slice(2),i=args.indexOf("--data"),dataDir=path.resolve(i>=0&&args[i+1]?args[i+1]:"public/data");
const file=(...parts)=>path.join(dataDir,...parts);
// Item/research JSON was moved to the single canonical public/items/data tree.
// The shared public/data directory intentionally has no item/research copies.
const itemDataDir=path.resolve(dataDir,"../items/data");
const itemFile=(...parts)=>path.join(itemDataDir,...parts);
const items=JSON.parse(fs.readFileSync(itemFile("items-index.json"),"utf8"));
const research=JSON.parse(fs.readFileSync(itemFile("research-index.json"),"utf8"));
const schema=JSON.parse(fs.readFileSync(itemFile("schema.json"),"utf8"));
const soldiers=JSON.parse(fs.readFileSync(file("soldiers-index.json"),"utf8"));
const armors=JSON.parse(fs.readFileSync(file("armors-index.json"),"utf8"));
const facilities=JSON.parse(fs.readFileSync(file("facilities-index.json"),"utf8"));
const facilityBaseFunctions=JSON.parse(fs.readFileSync(file("facility-base-functions.json"),"utf8"));
const facilityResearch=JSON.parse(fs.readFileSync(file("facility-research.json"),"utf8"));
const entities=JSON.parse(fs.readFileSync(itemFile("entities.json"),"utf8"));
if(fs.existsSync(file("items-index.json"))||fs.existsSync(file("research-index.json"))){
  throw new Error("Legacy item/research copies found under shared public/data");
}
if(!items.index.length)throw new Error("No items generated");
if(!research.index.length)throw new Error("No research generated");
if(items.index.length!==new Set(items.index.map(x=>x.id)).size)throw new Error("Duplicate item ids");
if(research.index.length!==new Set(research.index.map(x=>x.id)).size)throw new Error("Duplicate research ids");
const cache={};
for(const x of items.index){
  cache[x.bucket]??=JSON.parse(fs.readFileSync(itemFile("chunks",`${x.bucket}.json`),"utf8")).details;
  const d=cache[x.bucket][x.id];if(!d)throw new Error("Missing item detail "+x.id);
  if(!d.raw||!d.effectiveCore)throw new Error("Incomplete item detail "+x.id);
  if(hasPresentationResourceKey(d.raw)||hasPresentationResourceKey(d.rawDeclared))throw new Error("Bundled presentation resource in item "+x.id);
  if(!d.inheritedViaRefNode&&Object.prototype.hasOwnProperty.call(d,"rawDeclared"))throw new Error("Redundant rawDeclared "+x.id);
  if(d.resourceFieldCount){const rr=JSON.parse(fs.readFileSync(itemFile("resource-chunks","items",`${x.bucket}.json`),"utf8")).details;if(!rr[x.id])throw new Error("Missing item resource sidecar "+x.id);}
}
const rc={};
for(const x of research.index){
  rc[x.bucket]??=JSON.parse(fs.readFileSync(itemFile("research-chunks",`${x.bucket}.json`),"utf8")).details;
  const d=rc[x.bucket][x.id];if(!d)throw new Error("Missing research detail "+x.id);
  if(hasPresentationResourceKey(d.raw))throw new Error("Bundled presentation resource in research "+x.id);
  if(Object.prototype.hasOwnProperty.call(d,"references"))throw new Error("Redundant research reference union "+x.id);
  if(d.resourceFieldCount){const rr=JSON.parse(fs.readFileSync(itemFile("resource-chunks","research",`${x.bucket}.json`),"utf8")).details;if(!rr[x.id])throw new Error("Missing research resource sidecar "+x.id);}
}
if(!schema.sortableItemFields?.length)throw new Error("No sortable fields");
if(!soldiers.soldiers?.length)throw new Error("No soldiers generated");
if(!soldiers.profiles?.length)throw new Error("No soldier spawn profiles generated");
if(!soldiers.transformations?.length)throw new Error("No soldier transformations generated");
if((soldiers.profileCounts?.direct??0)+(soldiers.profileCounts?.manufacture??0)+(soldiers.profileCounts?.event??0)!==soldiers.profiles.length)throw new Error("Soldier acquisition profile count mismatch");
if((soldiers.profileCounts?.saintUnique??0)!==soldiers.profiles.filter(x=>x.saintSlots>0).length)throw new Error("Saint unique profile count mismatch");
if(!armors.index?.length)throw new Error("No armors generated");
if(!facilities.index?.length)throw new Error("No facilities generated");
if(facilities.index.length!==new Set(facilities.index.map(x=>x.id)).size)throw new Error("Duplicate facility ids");
if(!facilities.baseFunctions?.length||!facilityBaseFunctions.baseFunctionMeta)throw new Error("Facility base function reverse index missing");
if(!facilityResearch.researchCatalog||!Object.keys(facilityResearch.researchCatalog).length)throw new Error("Facility research catalog missing");
const fc={};
for(const x of facilities.index){
  if(!x.bucket)throw new Error("Missing facility bucket "+x.id);
  fc[x.bucket]??=JSON.parse(fs.readFileSync(file("facility-chunks",`${x.bucket}.json`),"utf8")).details;
  const d=fc[x.bucket][x.id];if(!d)throw new Error("Missing facility detail "+x.id);
  if(!d.researchPlan||!Array.isArray(d.roles)||!Array.isArray(d.references))throw new Error("Incomplete facility detail "+x.id);
  if(!Number.isFinite(Number(d.area))||Number(d.area)<1)throw new Error("Invalid facility area "+x.id);
}
if(armors.index.length!==new Set(armors.index.map(x=>x.id)).size)throw new Error("Duplicate armor ids");
const ac={};
for(const x of armors.index){
  if(!x.bucket)throw new Error("Missing armor bucket "+x.id);
  ac[x.bucket]??=JSON.parse(fs.readFileSync(file("armor-chunks",`${x.bucket}.json`),"utf8")).details;
  const d=ac[x.bucket][x.id];if(!d)throw new Error("Missing armor detail "+x.id);
  if(!Array.isArray(d.damageModifier)||d.damageModifier.length<17)throw new Error("Incomplete armor modifiers "+x.id);
  if(hasPresentationResourceKey(d.raw))throw new Error("Bundled presentation resource in armor "+x.id);
  if(d.damageTypes)throw new Error("Redundant armor damageTypes "+x.id);
  if(d.resourceFieldCount){const rr=JSON.parse(fs.readFileSync(file("resource-chunks","armors",`${x.bucket}.json`),"utf8")).details;if(!rr[x.id])throw new Error("Missing armor resource sidecar "+x.id);}
}
if(!entities.names||!Object.keys(entities.names).length)throw new Error("No normalized entity names");
if(!schema.resourceStorage?.separated)throw new Error("Resource separation schema missing");
if(soldiers.soldiers.length!==new Set(soldiers.soldiers.map(x=>x.id)).size)throw new Error("Duplicate soldier ids");
for(const p of soldiers.profiles){if(!p.effectiveStats?.avg||!p.currentStatsBeforeTraits?.avg)throw new Error("Incomplete soldier profile "+p.id); for(const k of soldiers.statKeys||[]){if(!Number.isFinite(Number(p.effectiveStats.avg[k])))throw new Error("Bad effective stat "+p.id+" "+k)}}
console.log(`OK: ${items.index.length} items, ${research.index.length} research, ${armors.index.length} armors, ${facilities.index.length} facilities, ${soldiers.soldiers.length} base soldier rules, ${soldiers.profiles.length} acquisition profiles, ${soldiers.transformations.length} transformations, ${schema.sortableItemFields.length} sortable item fields`);
