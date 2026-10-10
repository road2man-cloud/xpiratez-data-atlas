// Regenerate only the training/planning sidecar. Never rewrites other published DBs.
// node tools/build-training-data.mjs --source "D:/.../Piratez"
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import zlib from "node:zlib";
import assert from "node:assert/strict";
import yaml from "js-yaml";

const args=process.argv.slice(2);
const arg=(name,fallback)=>{const i=args.indexOf(name);return i>=0?args[i+1]:fallback};
const source=arg("--source",process.env.XPIRATEZ_MOD_PATH);
const dataDir=path.resolve(arg("--data","public/data"));
if(!source)throw new Error("Supply --source <.../Piratez> (official v.o1.1.1 rules)");
const root=path.resolve(source);
const transformFile=path.join(root,"Ruleset","Piratez_Transformations.rul");
const read=p=>fs.readFileSync(p,"utf8").replace(/^\uFEFF/,"");
const sha=p=>crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex");
const locale=code=>{
  const obj=yaml.load(read(path.join(root,"Language",code+".yml")),{json:true})||{};
  return obj[code]||obj;
};
const ko=locale("ko"),en=locale("en-US");
const tr=(id,code="ko")=>{
  const value=(code==="ko"?ko:en)[id]??(code==="ko"?en:ko)[id]??id;
  return Array.isArray(value)?value.join(" / "):typeof value==="string"?value:id;
};
const doc=yaml.load(read(transformFile),{json:true})||{};
const raw=doc.soldierTransformation||[];
const soldierData=JSON.parse(read(path.join(dataDir,"soldiers-index.json")));
const researchData=JSON.parse(read(path.join(dataDir,"progression-research.json")));
const topics=new Map(researchData.topics.map(r=>[r.id,r]));
const researchIndex=JSON.parse(read(path.join(dataDir,"..","items","data","research-index.json"))).index;
const researchBucket=new Map(researchIndex.map(x=>[x.id,x.bucket]));
const researchChunkCache=new Map();
function researchRaw(id){
  const bucket=researchBucket.get(id);if(!bucket)return{};
  if(!researchChunkCache.has(bucket))
    researchChunkCache.set(bucket,JSON.parse(read(path.join(dataDir,"..","items","data","research-chunks",bucket+".json"))).details);
  return researchChunkCache.get(bucket)?.[id]?.raw||{};
}
const original=new Map(raw.map(t=>[t.name,t]));
assert.equal(original.size,raw.length,"duplicate transformation rules");
assert.equal(raw.length,soldierData.transformations.length,"rules/index transformation count diverged");
for(const row of soldierData.transformations) {
  const t=original.get(row.id);
  assert.ok(t,"No original transformation for "+row.id);
  for(const key of ["requires","requiredPreviousTransformations","forbiddenPreviousTransformations","allowedSoldierTypes","forbiddenSoldierTypes"])
    assert.deepEqual(t[key]||[],row[key]||[],row.id+" "+key+" diverged; regenerate soldiers-index first");
  assert.equal(t.producedSoldierType||null,row.producedSoldierType||null,row.id+" producedSoldierType diverged");
}
const asList=x=>Array.isArray(x)?x:x==null?[]:[x];
const asIds=x=>asList(x).map(x=>typeof x==="string"?x:x?.id).filter(Boolean);
const name=id=>({id,koName:tr(id),enName:tr(id,"en")});
const kvEntries=o=>Object.entries(o&&typeof o==="object"&&!Array.isArray(o)?o:{}).map(([id,amount])=>({...name(id),amount}));
const researchGraph=new Map();
function visitResearch(id) {
  if(!topics.has(id)||researchGraph.has(id))return;
  const r=topics.get(id),p=asIds(r.prerequisites),disables=asIds(r.disables);
  researchGraph.set(id,{...name(id),cost:r.cost??null,prerequisites:p,strictRequires:asIds(researchRaw(id).requires),disables,reenables:asIds(r.reenables),requiresBaseFunc:asList(r.requiresBaseFunc),needItem:r.needItem===true,destroyItem:r.destroyItem===true});
  for(const parent of p)visitResearch(parent);
}
const kindOf=t=>t.producedSoldierType?"병종 전환":t.createsClone?"복제/소환":/(TRAINING|EDUCATION|TIGER_TOURS)/.test(t.name)?"훈련/교육":"의식/개조";
const transformations=soldierData.transformations.map(row=>{
  const t=original.get(row.id);
  const requires=asList(t.requires);
  const researchRoots=requires.filter(x=>topics.has(x));
  researchRoots.forEach(visitResearch);
  return{
    ...row,kind:kindOf(t),researchRoots,requiredItems:kvEntries(t.requiredItems),
    requiredCommendations:kvEntries(t.requiredCommendations),
    transferTime:t.transferTime??null,minRank:t.minRank??null,
    allowsLiveSoldiers:t.allowsLiveSoldiers??null,
    allowsWoundedSoldiers:t.allowsWoundedSoldiers??null,
    allowsDeadSoldiers:t.allowsDeadSoldiers??null,
    requiredItemsByCode:t.requiredItems||{},requiredCommendationsByCode:t.requiredCommendations||{},
    // Keep true rule fields, including uncommon restrictions and stat transformations.
    rawRule:t
  };
});
// Surface the actual scenario choices rather than pretending that an unselected
// captain automatically owns research from every mutually exclusive route.
const choiceGroups=[
  {id:"captain",label:"선장 성격 / 직업",choices:[
    "STR_CAPTAIN_DUMBASS","STR_CAPTAIN_JACKASS","STR_CAPTAIN_SOREASS","STR_CAPTAIN_LAZYASS",
    "STR_CAPTAIN_PUSSY","STR_CAPTAIN_THIEF","STR_CAPTAIN_PRIEST","STR_CAPTAIN_RULER","STR_CAPTAIN_MAGE","STR_CAPTAIN_UNCLASSED_UP"
  ]},
  {id:"path",label:"갈라지는 길",choices:[
    "STR_GALS_ARE_SUPERIOR_PREQ","STR_WE_NEED_MALE_TOUCH_PREQ","STR_PEASANT_REVOLUTION_PREQ","STR_HYBRID_PATH_PREQ","STR_CAT_PATH_PREQ"
  ]},
  {id:"cause",label:"대의의 방향",choices:["STR_RED_KNIGHT_PREQ","STR_PEOPLES_ARMY_PREQ"]},
  {id:"queen",label:"여왕 분기",choices:["STR_QUEEN_GOLD","STR_QUEEN_GREEN","STR_QUEEN_RED","STR_QUEEN_GRAY","STR_QUEEN_SAVAGE"]},
  {id:"codex",label:"Codex 각성",choices:[
    "STR_CODEX_GOLD_AWAKENED","STR_CODEX_GREEN_AWAKENED",
    "STR_CODEX_RED_AWAKENED","STR_CODEX_GRAY_AWAKENED"
  ]},
  {id:"god",label:"신의 선물",choices:Array.from({length:8},(_,i)=>"STR_GODS_E"+(i+1))}
];
for(const group of choiceGroups)for(const id of group.choices)visitResearch(id);
const routeChoices=choiceGroups.map(g=>({id:g.id,label:g.label,choices:g.choices.filter(id=>topics.has(id)).map(name)}));
// OXCE: 'dependencies' are ALL required unless an explicit research 'unlocks'
// grants this topic regardless of dependencies. Random getOneFree and event
// grants are other bypass candidates; their existence does not imply ownership.
const alternativeSources={};
const alternate=(target,field,source)=>{
  if(!researchGraph.has(target))return;
  const entry=alternativeSources[target]||={unlockers:[],freeGrantors:[]};
  if(!entry[field].includes(source))entry[field].push(source);
};
for(const topic of topics.values()){
  for(const target of asIds(topic.unlocks))alternate(target,"unlockers",topic.id);
  const raw=researchRaw(topic.id);
  for(const target of asIds(raw.getOneFree))alternate(target,"freeGrantors",topic.id);
  for(const targets of Object.values(raw.getOneFreeProtected||{}))
    for(const target of asIds(targets))alternate(target,"freeGrantors",topic.id);
}

// Official event DB is generated from the same effective XPiratez event scripts;
// retain each OR-alternative script and its true/false research triggers.
// The absence of a listed supplier is NOT proof that an item cannot be looted.
const eventDir=path.join(dataDir,"event-chunks");
const itemIndex=JSON.parse(read(path.join(dataDir,"..","items","data","items-index.json")));
const itemRows=new Map(itemIndex.index.map(row=>[row.id,row]));
const relevantResearch=new Set(researchGraph.keys());
const relevantItems=new Set(transformations.flatMap(t=>t.requiredItems.map(x=>x.id)));
const researchEventRoutes={},itemEventRoutes={};
const eventSourceHashes=[];
const addRoute=(into,id,route)=>(into[id]||=[]).push(route);
if(fs.existsSync(eventDir)){
  for(const filename of fs.readdirSync(eventDir).filter(x=>/^[0-9a-f][.]json[.]gz$/.test(x)).sort()){
    const file=path.join(eventDir,filename);
    eventSourceHashes.push({file:"event-chunks/"+filename,sha256:sha(file)});
    const chunk=JSON.parse(zlib.gunzipSync(fs.readFileSync(file)));
    for(const event of Object.values(chunk.details||{})){
      const grantResearch=(event.effects?.researchRewards||[]).filter(x=>relevantResearch.has(x.id));
      const grantItems=(event.effects?.guaranteedItems||[]).filter(x=>relevantItems.has(x.id));
      if(!grantResearch.length&&!grantItems.length)continue;
      const scripts=(event.scripts||[]).map(s=>({
        scriptId:s.id,
        yes:(s.triggerMaps?.researchTriggers||[]).filter(x=>x.value===true).map(x=>x.id),
        no:(s.triggerMaps?.researchTriggers||[]).filter(x=>x.value===false).map(x=>x.id),
        otherTriggers:Object.keys(s.triggerMaps||{}).filter(k=>k!=="researchTriggers"),
        conditions:s.conditions||{},
        paths:s.paths||[]
      }));
      const route={eventId:event.id,eventKoName:event.koName,scripts};
      for(const grant of grantResearch)addRoute(researchEventRoutes,grant.id,route);
      for(const grant of grantItems)addRoute(itemEventRoutes,grant.id,{...route,quantity:grant.qty});
    }
  }
}
const itemSources=Object.fromEntries([...relevantItems].sort().map(id=>{
  const row=itemRows.get(id);
  return[id,{...name(id),costBuy:row?.costBuy??null,manufactureCount:row?.manufactureCount??null,
    guaranteedEvents:itemEventRoutes[id]||[]}];
}));
// This is a PROVEN JOINT event grant: the same event is the only indexed research
// grant AND only indexed guaranteed token supplier, and no buy/manufacture source.
// Other event-only or material items remain warnings until all supplies are audited.
const exclusiveJointGrants={};
for(const t of transformations)for(const rootId of t.researchRoots){
  const root=researchGraph.get(rootId),sources=researchEventRoutes[rootId]||[];
  if(!root?.needItem||root.cost!=null||sources.length!==1)continue;
  const route=sources[0];
  for(const item of t.requiredItems){
    const supply=itemSources[item.id];
    if(supply?.costBuy!==0||supply?.manufactureCount!==0||
        supply.guaranteedEvents.length!==1||supply.guaranteedEvents[0].eventId!==route.eventId)continue;
    (exclusiveJointGrants[t.id]||=[]).push({researchId:rootId,itemId:item.id,eventId:route.eventId,
      reason:"same sole indexed research grant and guaranteed item supplier; no item purchase/manufacture"});
  }
}
const ids=new Set(transformations.map(t=>t.id));
const excludes=transformations.flatMap(t=>t.forbiddenPreviousTransformations.filter(x=>ids.has(x)).map(previous=>({previous,next:t.id})));
const excludedPairs=new Set(excludes.filter(e=>e.previous!==e.next).map(e=>[e.previous,e.next].sort().join("|")));
const completeSourceHash=soldierData.meta?.source?.rules?.find(x=>x.file==="Piratez_Transformations.rul")?.sha256;
assert.ok(!completeSourceHash||completeSourceHash===sha(transformFile),"Original transformation file differs from soldiers-index source");
const output={
  meta:{mod:soldierData.meta?.mod||{name:"X-Piratez",version:"v.o1.1.1"},ruleFile:"Piratez_Transformations.rul",sha256:sha(transformFile),
    source:"official ruleset + soldiers-index effective stats + published effective event grants",schemaVersion:2,
    eventSourceHashes},
  counts:{transformations:transformations.length,directionalExclusions:excludes.length,distinctExclusionPairs:excludedPairs.size,
    conditionalPrerequisites:transformations.filter(t=>t.requiredPreviousTransformations.length).length,
    categoryCounts:Object.fromEntries([...new Set(transformations.map(t=>t.kind))].map(k=>[k,transformations.filter(t=>t.kind===k).length]))},
  statKeys:soldierData.statKeys,statLabels:soldierData.statLabels,
  soldiers:soldierData.soldiers.map(s=>({id:s.id,koName:s.koName,enName:s.enName})),
  profiles:soldierData.profiles.map(p=>({id:p.id,sourceId:p.sourceId,sourceType:p.sourceType,
    sourceKoName:p.sourceKoName,sourceEnName:p.sourceEnName,soldierType:p.soldierType,
    soldierKoName:p.soldierKoName,previousTransformations:p.previousTransformations||{}})),
  bonuses:Object.fromEntries(soldierData.bonuses.map(b=>[b.id,b])),
  researchGraph:Object.fromEntries([...researchGraph].sort(([a],[b])=>a.localeCompare(b))),
  routeChoices,researchEventRoutes,itemSources,exclusiveJointGrants,alternativeSources,
  transformations,
};
const target=path.join(dataDir,"trainings-index.json");
fs.writeFileSync(target,JSON.stringify(output));
console.log("Built "+target+": "+output.counts.transformations+" transformations, "+excludes.length+" directional blocks, "+researchGraph.size+" research references, "+Object.keys(researchEventRoutes).length+" research event grants, "+Object.keys(itemEventRoutes).length+" item event supplies, "+Object.keys(exclusiveJointGrants).length+" joint locks; "+(fs.statSync(target).size/1024).toFixed(1)+" KiB");
