import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import yaml from "js-yaml";
import {buildArmorData} from "./armor-data.mjs";

const args=process.argv.slice(2);
const arg=(name,fallback=null)=>{const i=args.indexOf(name);return i>=0&&i+1<args.length?args[i+1]:fallback};
const source=arg("--source",process.env.XPIRATEZ_MOD_PATH);
const outDir=path.resolve(arg("--out","public/data"));
if(!source){console.error("Usage: node tools/build-armor-data.mjs --source <.../user/mods/Piratez>");process.exit(2)}

const modRoot=path.resolve(source);
const rulesDir=path.join(modRoot,"Ruleset");
const langDir=path.join(modRoot,"Language");
const metadataPath=path.join(modRoot,"metadata.yml");
for(const p of [rulesDir,langDir,metadataPath])if(!fs.existsSync(p))throw new Error("Missing X-Piratez source: "+p);

const read=p=>fs.readFileSync(p,"utf8").replace(/^\uFEFF/,"");
const sha256=p=>crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex");
const loadYaml=p=>{const docs=[];yaml.loadAll(read(p),d=>{if(d)docs.push(d)},{json:true});return docs};
const META=yaml.load(read(metadataPath),{json:true})||{};
const ruleFiles=fs.readdirSync(rulesDir).filter(f=>f.toLowerCase().endsWith(".rul")).sort((a,b)=>a.localeCompare(b,"en"));

function deepMerge(a,b){
  if(a&&b&&typeof a==="object"&&typeof b==="object"&&!Array.isArray(a)&&!Array.isArray(b)){
    const out={...a};
    for(const [k,v] of Object.entries(b))out[k]=k in out?deepMerge(out[k],v):v;
    return out;
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
  const out=[...oldValue],pos=new Map();
  out.forEach((x,i)=>{const id=identityOf(x);if(id)pos.set(id,i)});
  for(const x of newValue){
    if(x&&typeof x==="object"&&!Array.isArray(x)&&typeof x.delete==="string"){
      const idx=out.findIndex(y=>y&&typeof y==="object"&&Object.values(y).includes(x.delete));
      if(idx>=0)out.splice(idx,1);
      continue;
    }
    const id=identityOf(x);
    if(id&&pos.has(id)){const idx=pos.get(id);out[idx]=deepMerge(out[idx],x)}
    else{out.push(x);if(id)pos.set(id,out.length-1)}
  }
  return out;
}

const merged={},sourceHistory={};
for(const file of ruleFiles){
  const full=path.join(rulesDir,file);
  for(const doc of loadYaml(full)){
    for(const [section,value] of Object.entries(doc)){
      merged[section]=section in merged?mergeSection(merged[section],value):value;
      if(Array.isArray(value))value.forEach(entry=>{
        const id=identityOf(entry);if(!id)return;
        const h=(sourceHistory[id]||=[]);if(h.at(-1)!==file)h.push(file);
      });
    }
  }
}
function resolveRefNode(value,depth=0){
  if(!value||typeof value!=="object"||Array.isArray(value))return value;
  if(depth>32)throw new Error("refNode nesting exceeded 32 levels");
  const child={...value},parent=child.refNode;delete child.refNode;
  return parent&&typeof parent==="object"&&!Array.isArray(parent)?deepMerge(resolveRefNode(parent,depth+1),child):child;
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

const armorData=buildArmorData({effectiveMerged,sourceHistory,tr,damageKeys});
fs.mkdirSync(outDir,{recursive:true});
fs.rmSync(path.join(outDir,"armor-chunks"),{recursive:true,force:true});
fs.rmSync(path.join(outDir,"resource-chunks","armors"),{recursive:true,force:true});

function writeChunks(dir,details){
  const d=path.join(outDir,dir);fs.mkdirSync(d,{recursive:true});
  const buckets={};
  for(const [id,x] of Object.entries(details))(buckets[x.bucket]||={})[id]=x;
  for(const [b,v] of Object.entries(buckets))fs.writeFileSync(path.join(d,b+".json"),JSON.stringify({details:v}));
}
writeChunks("armor-chunks",armorData.details);
writeChunks("resource-chunks/armors",armorData.resourceDetails);

const manifest={
  generatedAt:new Date().toISOString(),
  mod:{name:META.name||"X-Piratez",version:META.version||"unknown",id:META.id||"piratez",requiredExtendedVersion:META.requiredExtendedVersion||null},
  source:{
    metadataSha256:sha256(metadataPath),
    rules:ruleFiles.map(file=>({file,sha256:sha256(path.join(rulesDir,file))})),
    languages:["ko.yml","en-US.yml"].filter(f=>fs.existsSync(path.join(langDir,f))).map(file=>({file,sha256:sha256(path.join(langDir,file))}))
  },
  counts:armorData.counts
};
fs.writeFileSync(path.join(outDir,"armors-index.json"),JSON.stringify({meta:manifest,counts:armorData.counts,statKeys:armorData.statKeys,damageTypes:armorData.damageTypes,index:armorData.index}));
console.log(JSON.stringify(armorData.counts));
