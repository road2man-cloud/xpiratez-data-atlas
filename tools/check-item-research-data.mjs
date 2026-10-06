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
  researchChunks[x.bucket]??=readJson("research-chunks",x.bucket+".json").details;
  const d=researchChunks[x.bucket][x.id];
  if(!d?.raw)throw new Error("Incomplete research detail "+x.id);
  if(hasPresentationResourceKey(d.raw))throw new Error("Presentation resource bundled into research core "+x.id);
  if(Object.prototype.hasOwnProperty.call(d,"references"))throw new Error("Redundant research reference union "+x.id);
  for(const k of ["dependencies","requiredBy","unlocks","getOneFree"])if(!(d[k]||[]).every(v=>typeof v==="string"))throw new Error("Non-normalized research ids "+x.id+" "+k);
  if(d.resourceFieldCount){
    researchResources[x.bucket]??=readJson("resource-chunks","research",x.bucket+".json").details;
    if(!researchResources[x.bucket][x.id])throw new Error("Missing research resource sidecar "+x.id);
  }
}

for(const f of schema.sortableItemFields||[])if(!["topLevel","sortable"].includes(f.storage))throw new Error("Bad sortable storage "+f.key);

const u=items.index.find(x=>x.id==="STR_UAC_CARBINE");
if(!u)throw new Error("Missing STR_UAC_CARBINE");
const ud=itemChunks[u.bucket].STR_UAC_CARBINE;
if(ud.raw.costBuy!==4500||ud.raw.costSell!==1500||ud.raw.weight!==6||
   ud.raw.accuracyAuto!==50||ud.raw.tuAuto!==27||
   ud.raw.accuracySnap!==70||ud.raw.tuSnap!==21||
   ud.raw.accuracyAimed!==100||ud.raw.tuAimed!==45)throw new Error("UAC Carbine smoke test failed");

console.log(`OK normalized item/research DB: ${items.index.length} items, ${research.index.length} research, ${Object.keys(entities.names).length} entity names, ${(totalBytes/1048576).toFixed(1)} MiB total, largest ${(largest.bytes/1048576).toFixed(1)} MiB`);
