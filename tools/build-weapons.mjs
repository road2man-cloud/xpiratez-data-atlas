import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import yaml from "js-yaml";
import {buildWeaponData} from "./weapon-data.mjs";
import {buildSoldierData} from "./soldier-data.mjs";

const args=process.argv.slice(2);
const arg=(name,fallback=null)=>{const i=args.indexOf(name);return i>=0&&i+1<args.length?args[i+1]:fallback};
const source=arg("--source",process.env.XPIRATEZ_MOD_PATH);
const outFile=path.resolve(arg("--out","public/data/weapons-index.json"));
if(!source){console.error("Usage: node tools/build-weapons.mjs --source <.../user/mods/Piratez>");process.exit(2)}

const modRoot=path.resolve(source);
const rulesDir=path.join(modRoot,"Ruleset");
const langDir=path.join(modRoot,"Language");
const metadataPath=path.join(modRoot,"metadata.yml");
for(const p of [rulesDir,langDir,metadataPath])if(!fs.existsSync(p))throw new Error("Missing source: "+p);

const read=p=>fs.readFileSync(p,"utf8").replace(/^\uFEFF/,"");
const sha256=p=>crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex");
const loadYaml=p=>{const docs=[];yaml.loadAll(read(p),d=>{if(d)docs.push(d)},{json:true});return docs};

function deepMerge(a,b){
  if(a&&b&&typeof a==="object"&&b&&typeof b==="object"&&!Array.isArray(a)&&!Array.isArray(b)){
    const out={...a};for(const [k,v] of Object.entries(b))out[k]=k in out?deepMerge(out[k],v):v;return out;
  }
  return b;
}
const identityKeys=["type","name","id","article","race","category","region","deployment","missionName","script","eventScript","cutscene","commendation"];
function identityOf(x){
  if(!x||typeof x!=="object"||Array.isArray(x))return null;
  for(const k of identityKeys)if(typeof x[k]==="string")return k+":"+x[k];
  return null;
}
function mergeSection(oldValue,newValue){
  if(!Array.isArray(oldValue)||!Array.isArray(newValue))return deepMerge(oldValue,newValue);
  const out=[...oldValue],pos=new Map();out.forEach((x,i)=>{const id=identityOf(x);if(id)pos.set(id,i)});
  for(const x of newValue){
    if(x&&typeof x==="object"&&!Array.isArray(x)&&typeof x.delete==="string"){
      const idx=out.findIndex(y=>y&&typeof y==="object"&&Object.values(y).includes(x.delete));if(idx>=0)out.splice(idx,1);continue;
    }
    const id=identityOf(x);
    if(id&&pos.has(id)){const i=pos.get(id);out[i]=deepMerge(out[i],x)}
    else{out.push(x);if(id)pos.set(id,out.length-1)}
  }
  return out;
}
function resolveRefNode(value,depth=0){
  if(!value||typeof value!=="object"||Array.isArray(value))return value;
  if(depth>32)throw new Error("refNode nesting exceeded");
  const child={...value},parent=child.refNode;delete child.refNode;
  return parent&&typeof parent==="object"&&!Array.isArray(parent)?deepMerge(resolveRefNode(parent,depth+1),child):child;
}

const merged={},sourceHistory={};
const ruleFiles=fs.readdirSync(rulesDir).filter(f=>f.toLowerCase().endsWith(".rul")).sort((a,b)=>a.localeCompare(b,"en"));
for(const file of ruleFiles){
  for(const doc of loadYaml(path.join(rulesDir,file))){
    for(const [section,value] of Object.entries(doc)){
      merged[section]=section in merged?mergeSection(merged[section],value):value;
      if(Array.isArray(value))for(const entry of value){
        const id=identityOf(entry);if(!id)continue;
        const h=(sourceHistory[id]||=[]);if(h.at(-1)!==file)h.push(file);
      }
    }
  }
}
const effectiveMerged={};
for(const [section,value] of Object.entries(merged))effectiveMerged[section]=Array.isArray(value)?value.map(v=>resolveRefNode(v)):resolveRefNode(value);

function loadLocale(code){
  const p=path.join(langDir,code+".yml");if(!fs.existsSync(p))return{};
  const doc=yaml.load(read(p),{json:true})||{};return doc[code]||doc;
}
const ko=loadLocale("ko"),en=loadLocale("en-US");
function tr(key,locale="ko"){
  if(typeof key!=="string")return key;
  const a=locale==="ko"?ko:en,b=locale==="ko"?en:ko;
  const v=a[key]??b[key]??key;
  if(Array.isArray(v))return v.join(" / ");
  if(v&&typeof v==="object")return JSON.stringify(v);
  return String(v).replaceAll("{NEWLINE}","\n").replaceAll("{SMALLLINE}","\n");
}
const damageKeys=[
  "STR_DAMAGE_NONE","STR_DAMAGE_ARMOR_PIERCING","STR_DAMAGE_INCENDIARY","STR_DAMAGE_HIGH_EXPLOSIVE",
  "STR_DAMAGE_LASER_BEAM","STR_DAMAGE_PLASMA_BEAM","STR_DAMAGE_STUN","STR_DAMAGE_MELEE",
  "STR_DAMAGE_ACID","STR_DAMAGE_SMOKE","STR_DAMAGE_10","STR_DAMAGE_11","STR_DAMAGE_12",
  "STR_DAMAGE_13","STR_DAMAGE_14","STR_DAMAGE_15","STR_DAMAGE_16","STR_DAMAGE_17","STR_DAMAGE_18","STR_DAMAGE_19"
];

const items=(effectiveMerged.items||[]).filter(x=>x&&typeof x.type==="string");
const itemIds=new Set(items.map(x=>x.type));
const itemDetails=Object.fromEntries(items.map(x=>[x.type,{research:[],manufacture:[]}]));

function collectItemIds(value,out){
  if(typeof value==="string"){if(itemIds.has(value))out.add(value);return}
  if(Array.isArray(value)){for(const v of value)collectItemIds(v,out);return}
  if(value&&typeof value==="object")for(const v of Object.values(value))collectItemIds(v,out);
}
for(const r of (effectiveMerged.research||[])){
  if(!r||typeof r.name!=="string")continue;
  const ids=new Set();collectItemIds(r,ids);
  for(const id of ids)itemDetails[id].research.push({
    id:r.name,owner:r.name,koName:tr(r.name,"ko"),cost:r.cost??null,points:r.points??null,
    needItem:r.needItem??null,destroyItem:r.destroyItem??null
  });
}
for(const m of (effectiveMerged.manufacture||[])){
  if(!m||typeof m.name!=="string")continue;
  const ids=new Set();collectItemIds(m,ids);
  for(const id of ids)itemDetails[id].manufacture.push({
    id:m.name,owner:m.name,koName:tr(m.name,"ko"),time:m.time??null,cost:m.cost??null,
    requiredQty:m.requiredItems&&typeof m.requiredItems==="object"?m.requiredItems[id]??null:null,
    producedQty:m.producedItems&&typeof m.producedItems==="object"?m.producedItems[id]??null:null
  });
}

const soldierData=buildSoldierData({effectiveMerged,sourceHistory,tr});
if(!Array.isArray(soldierData.soldiers)||!Array.isArray(soldierData.profiles))throw new Error("Generated soldier reference data is incomplete");

const weaponData=buildWeaponData({effectiveMerged,sourceHistory,tr,damageKeys,soldierData,itemDetails});
const meta={
  generatedAt:new Date().toISOString(),
  mod:yaml.load(read(metadataPath),{json:true})||{},
  source:{metadataSha256:sha256(metadataPath),ruleCount:ruleFiles.length,soldierProfiles:soldierData.profiles.length},
  counts:weaponData.counts
};
const dataDir=path.dirname(outFile),chunkDir=path.join(dataDir,"weapon-chunks"),detailDir=path.join(dataDir,"weapon-details");
fs.mkdirSync(dataDir,{recursive:true});
fs.rmSync(chunkDir,{recursive:true,force:true});
fs.rmSync(detailDir,{recursive:true,force:true});
fs.mkdirSync(chunkDir,{recursive:true});
fs.mkdirSync(detailDir,{recursive:true});
const sectionChunks={},chunkRows=180;
for(const [section,rows] of Object.entries(weaponData.sections)){
  const files=[];
  for(let i=0;i<rows.length;i+=chunkRows){
    const name=section+"-"+Math.floor(i/chunkRows)+".json";
    fs.writeFileSync(path.join(chunkDir,name),JSON.stringify({rows:rows.slice(i,i+chunkRows)}));
    files.push("weapon-chunks/"+name);
  }
  sectionChunks[section]=files;
}

const detailBuckets={},detailIndex={};
for(const [id,detail] of Object.entries(weaponData.details||{})){
  const bucket=crypto.createHash("sha256").update(id).digest("hex")[0];
  (detailBuckets[bucket]||={})[id]=detail;
  detailIndex[id]="weapon-details/"+bucket+".json";
}
for(const [bucket,details] of Object.entries(detailBuckets)){
  fs.writeFileSync(path.join(detailDir,bucket+".json"),JSON.stringify({details}));
}

fs.writeFileSync(outFile,JSON.stringify({
  meta,statKeys:weaponData.statKeys,characters:weaponData.characters,targetProfiles:weaponData.targetProfiles,damageProfiles:weaponData.damageProfiles,counts:weaponData.counts,
  engineNotes:weaponData.engineNotes,sectionChunks,detailIndex
}));
console.log(JSON.stringify({
  out:outFile,chunkRows,
  chunks:Object.fromEntries(Object.entries(sectionChunks).map(([k,v])=>[k,v.length])),
  detailChunks:Object.keys(detailBuckets).length,
  ...weaponData.counts
}));
