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
const researchInsight=readJson("research-insight-index.json");
const researchInsightById=new Map((researchInsight.index||[]).map(x=>[x.id,x]));
const researchEditorialMeta=readJson("research-editorial-meta.json");
const schema=readJson("schema.json");
const entities=readJson("entities.json");
const files=[];
function walkFiles(dir){for(const e of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,e.name);if(e.isDirectory())walkFiles(p);else if(e.isFile())files.push({path:p,bytes:fs.statSync(p).size})}}
walkFiles(dataDir);
const totalBytes=files.reduce((s,x)=>s+x.bytes,0),largest=files.slice().sort((a,b)=>b.bytes-a.bytes)[0];
if(largest?.bytes>=50*1024*1024)throw new Error("Generated file too large for normal Git workflow: "+largest.path+" "+largest.bytes);

if(items.index?.length!==4007)throw new Error("Expected 4007 items, got "+(items.index?.length??0));
if(research.index?.length!==4612)throw new Error("Expected 4612 research topics, got "+(research.index?.length??0));
if(researchInsight.index?.length!==4612)throw new Error("Expected 4612 research insight topics, got "+(researchInsight.index?.length??0));
if(researchEditorialMeta.count!==4612||researchEditorialMeta.version!==1)throw new Error("Research editorial metadata mismatch");
if(!String(researchEditorialMeta.generator||"").startsWith("GPT editorial synthesis"))throw new Error("Missing GPT editorial generator metadata");
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

const researchChunks={},researchInsightChunks={},researchEditorialChunks={},researchResources={};
for(const x of research.index){
  if(!Number.isInteger(x.spawnedItemCount)||x.spawnedItemCount<0)throw new Error("Invalid spawnedItemCount "+x.id);
  researchChunks[x.bucket]??=readJson("research-chunks",x.bucket+".json").details;
  researchInsightChunks[x.bucket]??=readJson("research-insight-chunks",x.bucket+".json").details;
  researchEditorialChunks[x.bucket]??=readJson("research-editorial-chunks",x.bucket+".json").details;
  const d=researchChunks[x.bucket][x.id],insight=researchInsightChunks[x.bucket][x.id]?.insight,editorial=researchEditorialChunks[x.bucket][x.id],ix=researchInsightById.get(x.id);
  if(!d?.raw)throw new Error("Incomplete research detail "+x.id);
  if(Object.prototype.hasOwnProperty.call(d,"insight"))throw new Error("Research insight leaked into canonical research detail "+x.id);
  if(insight?.version!==1||insight?.evidence!=="derived-from-ruleset"||!insight?.summary||!Array.isArray(insight.roles)||!insight.roles.length)throw new Error("Missing research insight "+x.id);
  if(!editorial||typeof editorial.core!=="string"||editorial.core.length<30||typeof editorial.decision!=="string"||!editorial.decision.length)throw new Error("Missing GPT research editorial "+x.id);
  if(/undefined|null/.test(JSON.stringify(editorial)))throw new Error("Invalid GPT research editorial text "+x.id);
  if(!ix||!Array.isArray(ix.insightKinds)||!ix.insightKinds.length||!ix.primaryInsightKind)throw new Error("Missing research insight index "+x.id);
  if(ix.dependencyIds&&(!Array.isArray(ix.dependencyIds)||ix.dependencyIds.some(v=>typeof v!=="string")))throw new Error("Invalid research dependencyIds "+x.id);
  if(ix.disableIds&&(!Array.isArray(ix.disableIds)||ix.disableIds.some(v=>typeof v!=="string")))throw new Error("Invalid research disableIds "+x.id);
  if(ix.eventLinks&&(!Array.isArray(ix.eventLinks)||ix.eventLinks.some(v=>!v||typeof v.id!=="string"||typeof v.kind!=="string")))throw new Error("Invalid research eventLinks "+x.id);
  if(hasPresentationResourceKey(d.raw))throw new Error("Presentation resource bundled into research core "+x.id);
  if(Object.prototype.hasOwnProperty.call(d,"references"))throw new Error("Redundant research reference union "+x.id);
  for(const k of ["dependencies","requiredBy","unlocks","getOneFree"])if(!(d[k]||[]).every(v=>typeof v==="string"))throw new Error("Non-normalized research ids "+x.id+" "+k);
  if(d.resourceFieldCount){
    researchResources[x.bucket]??=readJson("resource-chunks","research",x.bucket+".json").details;
    if(!researchResources[x.bucket][x.id])throw new Error("Missing research resource sidecar "+x.id);
  }
}

for(const f of schema.sortableItemFields||[])if(!["topLevel","sortable"].includes(f.storage))throw new Error("Bad sortable storage "+f.key);
const classifiedResearchCount=researchInsight.index.filter(x=>x.primaryInsightKind&&x.primaryInsightKind!=="other").length;
if(classifiedResearchCount<4500)throw new Error("Research insight semantic coverage regressed: "+classifiedResearchCount+"/"+research.index.length);

const littleBirdAssembly=researchChunks[littleBirdAssemblyIndex.bucket].STR_LITTLE_BIRD_ASSEMBLY;
const littleBirdInsight=researchInsightChunks[littleBirdAssemblyIndex.bucket].STR_LITTLE_BIRD_ASSEMBLY.insight;
const littleBirdEditorial=researchEditorialChunks[littleBirdAssemblyIndex.bucket].STR_LITTLE_BIRD_ASSEMBLY;
if(!littleBirdInsight.roles.includes("item-reward")||!littleBirdInsight.spawnedItems.includes("STR_HELICOPTER_WRECKAGE"))throw new Error("Little Bird assembly item-reward insight failed");
if(littleBirdAssembly.summaryKo===littleBirdInsight.summary)throw new Error("Derived research insight overwrote direct research summary");
if(!littleBirdEditorial.core.includes("헬리콥터 잔해")||!littleBirdEditorial.decision.includes("합계는 99")||!littleBirdEditorial.watch.includes("자동으로 완성"))throw new Error("Little Bird GPT editorial regression");

const charm=research.index.find(x=>x.id==="STR_CHARMY_DANCE_TRAINING");
if(!charm)throw new Error("Missing STR_CHARMY_DANCE_TRAINING");
const charmIx=researchInsightById.get(charm.id);
if(!charmIx?.insightTerms?.includes("STR_CHARMY_DANCER"))throw new Error("Charmy Dancer search term regression");
const cd=researchChunks[charm.bucket].STR_CHARMY_DANCE_TRAINING;
const ci=researchInsightChunks[charm.bucket].STR_CHARMY_DANCE_TRAINING.insight;
const ct=(ci.transformations||[]).find(x=>x.id==="STR_CHARMY_DANCE_TRAINING");
const charmEditorial=researchEditorialChunks[charm.bucket].STR_CHARMY_DANCE_TRAINING;
if(ci.primaryRole!=="soldier-training"||!ci.roles.includes("soldier-training")||ci.automaticEffect!==false||!ct)throw new Error("Charmy Dance insight classification failed");
if(!charmEditorial.core.includes("즉시 버프")||!charmEditorial.core.includes("soldierBonus")||!charmEditorial.watch.includes("연구 완료 = 병사 강화 완료"))throw new Error("Charmy Dance GPT editorial regression");
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

const researchIndexById=new Map(research.index.map(x=>[x.id,{...x,...(researchInsightById.get(x.id)||{})}]));
function prerequisiteIds(id){
  const seen=new Set(),stack=[...(researchIndexById.get(id)?.dependencyIds||[])];
  while(stack.length){
    const cur=stack.pop();if(seen.has(cur))continue;seen.add(cur);
    stack.push(...(researchIndexById.get(cur)?.dependencyIds||[]));
  }
  return [...seen];
}
const charmEventLinks=prerequisiteIds(charm.id).flatMap(researchId=>(researchIndexById.get(researchId)?.eventLinks||[]).map(x=>({...x,researchId,eventId:x.id})));
const ninjaDefeat=charmEventLinks.find(x=>x.eventId==="STR_CBT_TOURNAMENT_CHALLENGER_NINJA_DEFEAT");
if(!ninjaDefeat||ninjaDefeat.kind!=="event-grant"||!ninjaDefeat.scripts?.some(s=>s.conditions.executionOdds===100&&s.researchTriggers.STR_SUPER_SEXY_MARTIAL_DANCE===true&&s.researchTriggers.STR_CBT_TOURNAMENT_CHALLENGER_NINJA===true&&s.researchTriggers.STR_CBT_TOURNAMENT_CHALLENGER_NINJA_DEFEAT===false&&s.facilityTriggers.STR_VIP_CLUB_FAC===true&&s.facilityTriggers.STR_LUXURY_SPA===true))throw new Error("Charmy Dance Ninja Defeat event route regression");
const ninjaChallenge=charmEventLinks.find(x=>x.eventId==="STR_CBT_TOURNAMENT_CHALLENGER_NINJA");
if(!ninjaChallenge||ninjaChallenge.kind!=="event-grant"||!ninjaChallenge.scripts?.some(s=>s.conditions.executionOdds===50&&s.researchTriggers.STR_DUMBASS_CBT_CHAMPION===true&&s.researchTriggers.STR_CBT_TOURNAMENT_CHALLENGER_NINJA===false&&s.facilityTriggers.STR_VIP_CLUB_FAC===true&&s.facilityTriggers.STR_LUXURY_SPA===true))throw new Error("Charmy Dance Ninja challenge route regression");

const editorialBytes=files.filter(x=>x.path.includes("research-editorial-")).reduce((s,x)=>s+x.bytes,0);
if(editorialBytes>=4*1024*1024)throw new Error("Research editorial data bloat regression: "+(editorialBytes/1048576).toFixed(1)+" MiB");
if(totalBytes>=44*1024*1024)throw new Error("Research data bloat regression: "+(totalBytes/1048576).toFixed(1)+" MiB");

const violence=research.index.find(x=>x.id==="STR_VIOLENCE");
const violenceEditorial=violence&&researchEditorialChunks[violence.bucket]?.STR_VIOLENCE;
if(!violenceEditorial?.decision.includes("후속 연구가 14개")||!violenceEditorial?.watch.includes("무료 지급 경로"))throw new Error("Violence GPT editorial regression");

const u=items.index.find(x=>x.id==="STR_UAC_CARBINE");
if(!u)throw new Error("Missing STR_UAC_CARBINE");
const ud=itemChunks[u.bucket].STR_UAC_CARBINE;
if(ud.raw.costBuy!==4500||ud.raw.costSell!==1500||ud.raw.weight!==6||
   ud.raw.accuracyAuto!==50||ud.raw.tuAuto!==27||
   ud.raw.accuracySnap!==70||ud.raw.tuSnap!==21||
   ud.raw.accuracyAimed!==100||ud.raw.tuAimed!==45)throw new Error("UAC Carbine smoke test failed");

console.log(`OK normalized item/research DB: ${items.index.length} items, ${research.index.length} research, ${classifiedResearchCount} semantically classified research, ${researchEditorialMeta.count} GPT editorials, ${Object.keys(entities.names).length} entity names, ${(totalBytes/1048576).toFixed(1)} MiB total, editorial ${(editorialBytes/1048576).toFixed(1)} MiB, largest ${(largest.bytes/1048576).toFixed(1)} MiB`);
