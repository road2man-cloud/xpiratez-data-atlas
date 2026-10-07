import fs from "node:fs";
import path from "node:path";

const file=path.resolve(process.argv[2]||"public/data/weapons-index.json");
const d=JSON.parse(fs.readFileSync(file,"utf8"));
const root=path.dirname(file);
function loadSection(key){
  const files=d.sectionChunks?.[key];
  if(!Array.isArray(files)||!files.length)throw new Error("Missing weapon chunks: "+key);
  const rows=[];
  for(const rel of files){
    const full=path.join(root,rel);
    if(!fs.existsSync(full))throw new Error("Missing weapon chunk file: "+rel);
    const part=JSON.parse(fs.readFileSync(full,"utf8"));
    if(!Array.isArray(part.rows))throw new Error("Bad weapon chunk: "+rel);
    rows.push(...part.rows);
  }
  return rows;
}
const sections=Object.fromEntries(["shooting","melee","throwing"].map(k=>[k,loadSection(k)]));
for(const key of ["shooting","melee","throwing"]){
  if(!sections[key].length)throw new Error("Missing weapon section: "+key);
  const ids=new Set();
  for(const r of sections[key]){
    if(!r.id||!r.itemId||!r.koName)throw new Error("Incomplete "+key+" row");
    if(ids.has(r.id))throw new Error("Duplicate weapon row: "+r.id);
    ids.add(r.id);
    if(!r.accuracyBonus||!r.damageBonus)throw new Error("Missing formula: "+r.id);
  }
  if(Number(d.counts?.[key])!==sections[key].length)throw new Error("Count mismatch: "+key);
}
if(!Array.isArray(d.characters)||d.characters.length<20)throw new Error("Too few reference characters");
for(const id of [
  "profile:manufacture:STR_THEBAN_ASSAULT_CLONE",
  "profile:manufacture:STR_FREAK_RECRUITMENT",
  "base:STR_SOLDIER"
]){
  if(!d.characters.some(x=>x.id===id))throw new Error("Missing reference character: "+id);
}
const weirdThrow=sections.throwing.filter(x=>x.categories?.includes("STR_BAT_CAT_CORPSE"));
if(weirdThrow.length)throw new Error("Corpse leaked into throwing weapons: "+weirdThrow[0].itemId);
const pelletRows=sections.shooting.filter(x=>Number(x.pellets)>1);
if(!pelletRows.length)throw new Error("No shotgun/pellet rows");

function expectShooting(itemId,mode,expected){
  const r=sections.shooting.find(x=>x.itemId===itemId&&x.mode===mode);
  if(!r)throw new Error("Missing shooting regression row: "+itemId+" / "+mode);
  for(const [key,value] of Object.entries(expected)){
    if(Number(r[key])!==Number(value))throw new Error("Bad "+itemId+" "+key+": "+r[key]+" != "+value);
  }
}
expectShooting("STR_CHAINSAW","auto",{basePower:35,shots:5,maxRange:1,powerRangeThreshold:3,powerRangeReduction:99});
expectShooting("STR_CHAINSAW_LOLI","auto",{basePower:15,shots:4,maxRange:1,powerRangeThreshold:3,powerRangeReduction:99});
expectShooting("STR_CHAINSAW_HEAVY","auto",{basePower:110,shots:5,maxRange:1,powerRangeThreshold:3,powerRangeReduction:99});
expectShooting("STR_RIPPER","snap",{basePower:30,shots:3,maxRange:1,powerRangeThreshold:3,powerRangeReduction:99});

const shortRangeRows=sections.shooting.filter(x=>Number(x.maxRange)<10);
const shortMultiRows=shortRangeRows.filter(x=>Number(x.shots)>1||Number(x.pellets)>1);
if(shortRangeRows.length<50)throw new Error("Suspiciously few short-range shooting rows: "+shortRangeRows.length);
if(shortMultiRows.length<8)throw new Error("Suspiciously few short-range multi-hit rows: "+shortMultiRows.length);
console.log("OK weapons: "+sections.shooting.length+" shooting, "+sections.melee.length+" melee, "+sections.throwing.length+" throwing, "+d.characters.length+" reference characters, "+pelletRows.length+" pellet rows, "+shortRangeRows.length+" short-range rows, "+shortMultiRows.length+" short-range multi-hit rows, "+Object.values(d.sectionChunks).flat().length+" chunks");
