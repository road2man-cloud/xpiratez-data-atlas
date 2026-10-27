import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import {gzipSync,gunzipSync} from "node:zlib";
import yaml from "js-yaml";

// X-Piratez 2.1-only companion data. Never read or publish a player's .sav.
// Usage: node tools/build-research-exclusivity-21.mjs --source C:/.../user/mods/Piratez
const argv=process.argv.slice(2);
const getArg=name=>{const i=argv.indexOf(name);return i>=0?argv[i+1]:null;};
const source=getArg("--source")||process.env.XPIRATEZ_MOD_PATH;
if(!source)throw Error("Provide --source <X-Piratez 2.1 mod path>.");
const modRoot=path.resolve(source),gameRoot=path.resolve(modRoot,"../../..");
const rulesDir=path.join(modRoot,"Ruleset");
const corePath=path.join(gameRoot,"standard","xcom1","research.rul");
const eventsPath=path.join(rulesDir,"Piratez_Events.rul");
const out=path.resolve(getArg("--out")||"public/data/research-exclusivity-21.json");
const files=[corePath,...fs.readdirSync(rulesDir).filter(x=>x.endsWith(".rul")).map(x=>path.join(rulesDir,x)).sort()];
const read=p=>fs.readFileSync(p,"utf8").replace(/^\uFEFF/,"");
const hash=p=>crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex");
const toIds=x=>Array.isArray(x)?x.filter(a=>typeof a==="string"):typeof x==="string"?[x]:[];
const merge=(a,b)=>({...a,...b});
const research=new Map(),eventRules=new Map(),scripts=new Map();
for(const file of files){
  const d=yaml.load(read(file),{json:true})||{};
  for(const r of d.research||[]){
    if(typeof r.delete==="string"){research.delete(r.delete);continue;}
    if(typeof r.name==="string")research.set(r.name,merge(research.get(r.name)||{},r));
  }
  for(const r of d.events||[]){
    if(typeof r.delete==="string"){eventRules.delete(r.delete);continue;}
    if(typeof r.name==="string")eventRules.set(r.name,merge(eventRules.get(r.name)||{},r));
  }
  for(const s of d.eventScripts||[]){
    if(typeof s.type==="string")scripts.set(s.type,merge(scripts.get(s.type)||{},s));
  }
}
const loadLanguage=code=>{
  const p=path.join(modRoot,"Language",code+".yml");
  if(!fs.existsSync(p))return {};
  const d=yaml.load(read(p),{json:true})||{};
  return d[code]||d;
};
const ko=loadLanguage("ko");
const names=id=>String(typeof ko[id]==="string"?ko[id]:id).replaceAll("{NEWLINE}"," ");
const compact=Object.fromEntries([...research].map(([id,r])=>[id,{
  id,name:names(id),cost:r.cost??0,
  dependencies:toIds(r.dependencies),requires:toIds(r.requires),
  disables:toIds(r.disables),reenables:toIds(r.reenables),
  unlocks:toIds(r.unlocks),getOneFree:toIds(r.getOneFree),
  getOneFreeProtected:Object.fromEntries(Object.entries(r.getOneFreeProtected||{}).map(([guard,target])=>[guard,toIds(target)])),
  sequentialGetOneFree:r.sequentialGetOneFree===true,repeatable:r.repeatable===true,
  needItem:r.needItem===true,destroyItem:r.destroyItem===true,
  neededItem:r.neededItem||id,requiresBaseFunc:toIds(r.requiresBaseFunc),
  spawnedItem:r.spawnedItem||null,spawnedItemCount:r.spawnedItemCount||0,
  getOneFreeProtectedCount:Object.values(r.getOneFreeProtected||{}).reduce((n,x)=>n+toIds(x).length,0)
}]));
const events=[];
const eventRefs=new Set();
function addScript(id,s,mode,weight,tableMonth=null){
  const e=eventRules.get(id);if(!e)return;
  if(!(e.researchList?.length||e.everyItemList?.length||e.everyMultiItemList||e.randomItemList?.length))return;
  const positive=[],negative=[],positiveItems=[],negativeItems=[],positiveFacilities=[],negativeFacilities=[];
  for(const [key,val] of Object.entries(s.researchTriggers||{}))(val?positive:negative).push(key);
  for(const [key,val] of Object.entries(s.itemTriggers||{}))(val?positiveItems:negativeItems).push(key);
  for(const [key,val] of Object.entries(s.facilityTriggers||{}))(val?positiveFacilities:negativeFacilities).push(key);
  events.push({
    id:e.name,script:s.type,mode,weight,tableMonth,
    firstMonth:s.firstMonth??0,lastMonth:s.lastMonth??null,executionOdds:s.executionOdds??100,
    minDifficulty:s.minDifficulty??null,maxDifficulty:s.maxDifficulty??null,
    researchPositive:positive,researchNegative:negative,
    itemPositive:positiveItems,itemNegative:negativeItems,
    facilityPositive:positiveFacilities,facilityNegative:negativeFacilities,
    otherConditions:Object.keys(s).filter(k=>/Triggers$|^min|^max|^counter|^mission|^xcom/i.test(k)&&
      !["researchTriggers","itemTriggers","facilityTriggers","minDifficulty","maxDifficulty"].includes(k)),
    researchList:toIds(e.researchList),
    itemRewards:Object.fromEntries(Object.entries(e.everyMultiItemList||{})),
    everyItemList:toIds(e.everyItemList),
    randomItemList:toIds(e.randomItemList)
  });
  eventRefs.add(e.name);
}
for(const s of scripts.values()){
  for(const [month,weights]of Object.entries(s.eventWeights||{}))
    for(const [id,weight]of Object.entries(weights||{}))
      if(Number(weight)>0)addScript(id,s,"weighted",Number(weight),Number(month));
  for(const [id,weight]of Object.entries(s.oneTimeRandomEvents||{}))
    if(Number(weight)>0)addScript(id,s,"oneTimeRandom",Number(weight));
  for(const id of toIds(s.oneTimeSequentialEvents))addScript(id,s,"oneTimeSequential",null);
}
const stats={
  researchCount:Object.keys(compact).length,
  disableSources:Object.values(compact).filter(x=>x.disables.length).length,
  disableEdges:Object.values(compact).reduce((n,x)=>n+x.disables.length,0),
  reenableEdges:Object.values(compact).reduce((n,x)=>n+x.reenables.length,0),
  protectedSources:Object.values(compact).filter(x=>Object.keys(x.getOneFreeProtected).length).length,
  scriptedEventPaths:events.length
};
const result={
  schemaVersion:1,modVersion:"X-Piratez 2.1",engineVersion:"OXCE 8.7.1",
  sourceDescription:"2.1 source rules; campaign status always imported locally, never distributed",
  sourceHashes:{
    "standard/xcom1/research.rul":hash(corePath),
    "Piratez.rul":hash(path.join(rulesDir,"Piratez.rul")),
    "Piratez_Events.rul":hash(eventsPath)
  },
  stats,research:compact,events
};
if(!compact.STR_CODEX_RED?.getOneFreeProtected?.STR_SHADOW_CHASING?.includes("STR_DARK_STAR"))
  throw Error("Missing 2.1 red codex protected Dark Star route");
if(!compact.STR_CAPTAIN_LAZYASS)throw Error("Missing captain lazy route");
if(!events.some(e=>e.id==="STR_CODEX_RED_AWAKENS"&&e.researchList.includes("STR_CODEX_RED_AWAKENED")))
  throw Error("Missing red-codex awakening event");
if(!events.some(e=>e.id==="STR_CAPTAIN_SAINT"&&e.researchList.includes("STR_CAPTAIN_SAINT")))
  throw Error("Missing saint captain event");
if(!events.some(e=>e.id==="STR_GOLD_AT_SEANS_NEW_FACES"&&e.researchList.includes("STR_VIP_014")))
  throw Error("Missing probabilistic VIP_014 event");
const serialized=JSON.stringify(result);
if(argv.includes("--check")){
  if(!fs.existsSync(out)||fs.readFileSync(out,"utf8")!==serialized)throw Error("Stale 2.1 research graph: regenerate with --source.");
  if(!fs.existsSync(out+".gz")||gunzipSync(fs.readFileSync(out+".gz")).toString("utf8")!==serialized)throw Error("Stale compressed 2.1 research graph");
  console.log("2.1 research graph current:",JSON.stringify(stats));
}else{
  fs.mkdirSync(path.dirname(out),{recursive:true});
  fs.writeFileSync(out,serialized);
  fs.writeFileSync(out+".gz",gzipSync(serialized,{level:9}));
  console.log("Built",out,Buffer.byteLength(serialized),"bytes",JSON.stringify(stats));
}
