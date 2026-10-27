// Precompress public JSON payloads consumed by the Atlas browser clients.
// Keep canonical .json files untouched for offline verification and other tools.
import fs from "node:fs";
import path from "node:path";
import {gzipSync,gunzipSync} from "node:zlib";

const fixed=[
  "public/items/data/items-index.json",
  "public/items/data/item-usage-index.json",
  "public/items/data/research-index.json",
  "public/items/data/research-insight-index.json",
  "public/items/data/entities.json",
  "public/items/data/catalog-ids.json",
  "public/data/soldiers-index.json",
  "public/data/soldiers-modern-index.json",
  "public/data/trainings-index.json",
  "public/data/choice-simulator-index.json",
  "public/data/research-exclusivity-21.json",
  "public/data/weapons-index.json",
  "public/data/standard-evaluation.json",
  "public/data/armors-index.json",
  "public/data/progression.json",
  "public/data/progression-research.json"
];
const chunkDir="public/data/weapon-chunks";
const chunks=fs.existsSync(chunkDir)?fs.readdirSync(chunkDir).filter(x=>x.endsWith(".json")).map(x=>path.join(chunkDir,x)):[];
const paths=[...fixed,...chunks];
if(process.argv.includes("--check")){
  let total=0,compressed=0;
  for(const p of paths){
    if(!fs.existsSync(p))throw new Error("Missing JSON source "+p);
    if(!fs.existsSync(p+".gz"))throw new Error("Missing gzip sidecar "+p+".gz");
    const original=fs.readFileSync(p),gz=fs.readFileSync(p+".gz");
    if(!gunzipSync(gz).equals(original))throw new Error("Stale gzip sidecar "+p+".gz");
    if(gz.length>=original.length*.5)throw new Error("Inefficient gzip sidecar "+p+".gz");
    total+=original.length;compressed+=gz.length;
  }
  console.log("OK compressed browser payloads:",paths.length,"files",total,"->",compressed,"bytes");
}else{
  let total=0,compressed=0;
  for(const p of paths){
    if(!fs.existsSync(p)){console.warn("Skip absent source:",p);continue;}
    const original=fs.readFileSync(p);
    const gz=gzipSync(original,{level:9});
    fs.writeFileSync(p+".gz",gz);
    total+=original.length;compressed+=gz.length;
  }
  console.log("Compressed browser payloads:",paths.length,"files",total,"->",compressed,"bytes");
}
