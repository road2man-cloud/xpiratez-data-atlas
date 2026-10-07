import fs from "node:fs";
import path from "node:path";
import {hasPresentationResourceKey} from "./data-normalize.mjs";

const args=process.argv.slice(2);
const i=args.indexOf("--data");
const dataDir=path.resolve(i>=0&&args[i+1]?args[i+1]:"public/items/data");
const file=(...parts)=>path.join(dataDir,...parts);
const readJson=(...parts)=>JSON.parse(fs.readFileSync(file(...parts),"utf8"));

const items=readJson("items-index.json");
const research=readJson("research-index.json");
const schema=readJson("schema.json");
const entities=readJson("entities.json");
const files=[];
function walkFiles(dir){for(const e of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,e.name);if(e.isDirectory())walkFiles(p);else if(e.isFile())files.push({path:p,bytes:fs.statSync(p).size})}}
walkFiles(dataDir);
const totalBytes=files.reduce((s,x)=>s+x.bytes,0),largest=files.slice().sort((a,b)=>b.bytes-a.bytes)[0];
if(largest?.bytes>=50*1024*1024)throw new Error("Generated file too large for normal Git workflow: "+largest.path+" "+largest.bytes);

if(items.index?.length!==4007)throw new Error("Expected 4007 items, got "+(items.index?.length??0));
if(research.index?.length!==4612)throw new Error("Expected 4612 research topics, got "+(research.index?.length??0));
if(items.index.length!==new Set(items.index.map(x=>x.id)).size)throw new Error("Duplicate item ids");
if(research.index.length!==new Set(research.index.map(x=>x.id)).size)throw new Error("Duplicate research ids");
const littleBirdAssemblyIndex=research.index.find(x=>x.id==="STR_LITTLE_BIRD_ASSEMBLY");
if(littleBirdAssemblyIndex?.spawnedItemCount!==1)throw new Error("Little Bird assembly spawned item count missing from research index");
if(!entities.names||!Object.keys(entities.names).length)throw new Error("Missing normalized entity dictionary");
if(!schema.resourceStorage?.separated)throw new Error("Resource separation metadata missing");
if(!schema.effectiveCoreFields?.length||!schema.coreSourceLegend)throw new Error("Core-source codec metadata missing");

const itemChunks={},itemResources={};
for(const x of items.index){
  itemChunks[x.bucket]??=readJson("chunks",x.bucket+".json").details;
  const d=itemChunks[x.bucket][x.id];
  if(!d?.raw||!d.effectiveCore)throw new Error("Incomplete item detail "+x.id);
  if(hasPresentationResourceKey(d.raw)||hasPresentationResourceKey(d.rawDeclared))throw new Error("Presentation resource bundled into item core "+x.id);
  if(!d.inheritedViaRefNode&&Object.prototype.hasOwnProperty.call(d,"rawDeclared"))throw new Error("Redundant rawDeclared "+x.id);
  if(Object.prototype.hasOwnProperty.call(d,"references"))throw new Error("Redundant item reference union "+x.id);
  if(Object.prototype.hasOwnProperty.call(d,"globalItemDefaults"))throw new Error("Repeated global defaults "+x.id);
  if(Object.prototype.hasOwnProperty.call(d,"effectiveCoreSources"))throw new Error("Uncompressed effectiveCoreSources "+x.id);
  if(typeof d.effectiveCoreSourceCodes!=="string"||d.effectiveCoreSourceCodes.length!==schema.effectiveCoreFields.length)throw new Error("Bad source-code vector "+x.id);
  if(d.resourceFieldCount){
    itemResources[x.bucket]??=readJson("resource-chunks","items",x.bucket+".json").details;
    if(!itemResources[x.bucket][x.id])throw new Error("Missing item resource sidecar "+x.id);
  }
}

const researchChunks={},researchResources={};
for(const x of research.index){
  if(!Number.isInteger(x.spawnedItemCount)||x.spawnedItemCount<0)throw new Error("Invalid spawnedItemCount "+x.id);
  researchChunks[x.bucket]??=readJson("research-chunks",x.bucket+".json").details;
  const d=researchChunks[x.bucket][x.id];
  if(!d?.raw)throw new Error("Incomplete research detail "+x.id);
  if(d.insight?.version!==1||!d.insight?.summary||!Array.isArray(d.insight?.roles)||!d.insight.roles.length||d.summaryKo!==d.insight.summary)throw new Error("Missing research insight "+x.id);
  if(!Array.isArray(x.insightKinds)||!x.insightKinds.length||!x.primaryInsightKind)throw new Error("Missing research insight index "+x.id);
  if(hasPresentationResourceKey(d.raw))throw new Error("Presentation resource bundled into research core "+x.id);
  if(Object.prototype.hasOwnProperty.call(d,"references"))throw new Error("Redundant research reference union "+x.id);
  for(const k of ["dependencies","requiredBy","unlocks","getOneFree"])if(!(d[k]||[]).every(v=>typeof v==="string"))throw new Error("Non-normalized research ids "+x.id+" "+k);
  if(d.resourceFieldCount){
    researchResources[x.bucket]??=readJson("resource-chunks","research",x.bucket+".json").details;
    if(!researchResources[x.bucket][x.id])throw new Error("Missing research resource sidecar "+x.id);
  }
}

for(const f of schema.sortableItemFields||[])if(!["topLevel","sortable"].includes(f.storage))throw new Error("Bad sortable storage "+f.key);
const classifiedResearchCount=research.index.filter(x=>x.primaryInsightKind&&x.primaryInsightKind!=="other").length;
if(classifiedResearchCount<4500)throw new Error("Research insight semantic coverage regressed: "+classifiedResearchCount+"/"+research.index.length);

const charm=research.index.find(x=>x.id==="STR_CHARMY_DANCE_TRAINING");
if(!charm)throw new Error("Missing STR_CHARMY_DANCE_TRAINING");
if(!charm.insightTerms?.includes("STR_CHARMY_DANCER"))throw new Error("Charmy Dancer search term regression");
const cd=researchChunks[charm.bucket].STR_CHARMY_DANCE_TRAINING;
const ct=(cd.insight?.transformations||[]).find(x=>x.id==="STR_CHARMY_DANCE_TRAINING");
if(cd.insight.primaryRole!=="soldier-training"||!cd.insight.roles.includes("soldier-training")||cd.insight.automaticEffect!==false||!ct)throw new Error("Charmy Dance insight classification failed");
for(const id of ["STR_SUPER_SEXY_MARTIAL_DANCE","STR_CBT_TOURNAMENT_CHALLENGER_NINJA_DEFEAT"])if(!cd.dependencies.includes(id))throw new Error("Charmy Dance dependency regression "+id);
if(ct.cost!==1000||ct.recoveryTime!==28||ct.requiredMinStats?.bravery!==50||!ct.requiresBaseFunc.includes("DOJO"))throw new Error("Charmy Dance training requirements failed");
const charmItems=Object.fromEntries((ct.requiredItems||[]).map(x=>[x.id,x.qty]));
if(charmItems.STR_GLAMOUR!==6||charmItems.STR_PORN!==3)throw new Error("Charmy Dance item costs failed");
if(ct.flatOverallStatChange?.tu!==10||ct.flatOverallStatChange?.stamina!==10||ct.flatOverallStatChange?.health!==10||ct.flatOverallStatChange?.bravery!==10||ct.flatOverallStatChange?.reactions!==10||ct.flatOverallStatChange?.psiSkill!==5||ct.flatOverallStatChange?.mana!==10)throw new Error("Charmy Dance flat stat insight failed");
if(ct.soldierBonus?.id!=="STR_CHARMY_DANCER"||ct.soldierBonus?.stats?.health!==5||ct.soldierBonus?.stats?.reactions!==5||ct.soldierBonus?.armor?.frontArmor!==3||ct.soldierBonus?.armor?.underArmor!==3)throw new Error("Charmy Dancer bonus-layer insight failed");
if(ct.combinedFixedStatChange?.health!==15||ct.combinedFixedStatChange?.reactions!==15||ct.upperBoundAtStatCaps!==true)throw new Error("Charmy Dance derived stat insight failed");
for(const id of ["STR_CHARMY_DANCE_TRAINING","STR_MEDAL_BIOFIELD_COLLAPSE","STR_MILITARY_DRILL_TRAINING"])if(!ct.forbiddenPreviousTransformations.includes(id))throw new Error("Charmy Dance exclusivity regression "+id);
const expectedCharmySoldiers=["STR_SOLDIER","STR_SOLDIER_S","STR_SOLDIER_M","STR_SOLDIER_V","STR_SOLDIER_X","STR_SOLDIER_W","STR_SOLDIER_GNOME","STR_SOLDIER_OGRE"];
if(JSON.stringify([...(ct.allowedSoldierTypes||[])].sort())!==JSON.stringify([...expectedCharmySoldiers].sort()))throw new Error("Charmy Dance allowed soldier regression");
const ninjaDefeat=cd.insight.prerequisite.eventLinks.find(x=>x.eventId==="STR_CBT_TOURNAMENT_CHALLENGER_NINJA_DEFEAT");
if(!ninjaDefeat||ninjaDefeat.kind!=="event-grant"||!ninjaDefeat.scripts.some(s=>s.conditions.executionOdds===100&&s.researchTriggers.STR_SUPER_SEXY_MARTIAL_DANCE===true&&s.researchTriggers.STR_CBT_TOURNAMENT_CHALLENGER_NINJA===true&&s.researchTriggers.STR_CBT_TOURNAMENT_CHALLENGER_NINJA_DEFEAT===false&&s.facilityTriggers.STR_VIP_CLUB_FAC===true&&s.facilityTriggers.STR_LUXURY_SPA===true))throw new Error("Charmy Dance Ninja Defeat event route regression");
const ninjaChallenge=cd.insight.prerequisite.eventLinks.find(x=>x.eventId==="STR_CBT_TOURNAMENT_CHALLENGER_NINJA");
if(!ninjaChallenge||ninjaChallenge.kind!=="event-grant"||!ninjaChallenge.scripts.some(s=>s.conditions.executionOdds===50&&s.researchTriggers.STR_DUMBASS_CBT_CHAMPION===true&&s.researchTriggers.STR_CBT_TOURNAMENT_CHALLENGER_NINJA===false&&s.facilityTriggers.STR_VIP_CLUB_FAC===true&&s.facilityTriggers.STR_LUXURY_SPA===true))throw new Error("Charmy Dance Ninja challenge route regression");

const u=items.index.find(x=>x.id==="STR_UAC_CARBINE");
if(!u)throw new Error("Missing STR_UAC_CARBINE");
const ud=itemChunks[u.bucket].STR_UAC_CARBINE;
if(ud.raw.costBuy!==4500||ud.raw.costSell!==1500||ud.raw.weight!==6||
   ud.raw.accuracyAuto!==50||ud.raw.tuAuto!==27||
   ud.raw.accuracySnap!==70||ud.raw.tuSnap!==21||
   ud.raw.accuracyAimed!==100||ud.raw.tuAimed!==45)throw new Error("UAC Carbine smoke test failed");

console.log(`OK normalized item/research DB: ${items.index.length} items, ${research.index.length} research, ${classifiedResearchCount} semantically classified research, ${Object.keys(entities.names).length} entity names, ${(totalBytes/1048576).toFixed(1)} MiB total, largest ${(largest.bytes/1048576).toFixed(1)} MiB`);
