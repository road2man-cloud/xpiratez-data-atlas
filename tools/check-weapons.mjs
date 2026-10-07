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
if(!d.detailIndex||typeof d.detailIndex!=="object")throw new Error("Missing weapon detail index");
const detailCache=new Map();
function loadDetail(id){
  const rel=d.detailIndex[id];
  if(!rel)throw new Error("Missing weapon detail mapping: "+id);
  let part=detailCache.get(rel);
  if(!part){
    const full=path.join(root,rel);
    if(!fs.existsSync(full))throw new Error("Missing weapon detail file: "+rel);
    part=JSON.parse(fs.readFileSync(full,"utf8"));
    if(!part.details||typeof part.details!=="object")throw new Error("Bad weapon detail chunk: "+rel);
    detailCache.set(rel,part);
  }
  const detail=part.details[id];
  if(!detail?.rule||detail.rule.type!==id)throw new Error("Bad effective weapon rule detail: "+id);
  return detail;
}
for(const key of ["shooting","melee","throwing"]){
  if(!sections[key].length)throw new Error("Missing weapon section: "+key);
  const ids=new Set();
  for(const r of sections[key]){
    if(!r.id||!r.itemId||!r.koName)throw new Error("Incomplete "+key+" row");
    if(ids.has(r.id))throw new Error("Duplicate weapon row: "+r.id);
    ids.add(r.id);
    if(!r.accuracyBonus||!r.damageBonus)throw new Error("Missing formula: "+r.id);
    if(typeof r.twoHanded!=="boolean"||typeof r.blockBothHands!=="boolean"||!Number.isFinite(Number(r.oneHandedPenalty)))throw new Error("Missing handedness data: "+r.id);
    const damageProfile=d.damageProfiles?.[r.id];
    if(!damageProfile||![damageProfile.randomType,damageProfile.resistType,damageProfile.armorEffectiveness,damageProfile.toHealth].every(x=>Number.isFinite(Number(x))))throw new Error("Missing effective damage profile: "+r.id);
    const sourceRule=loadDetail(r.itemId).rule;
    if(Boolean(sourceRule.twoHanded)!==r.twoHanded||Boolean(sourceRule.blockBothHands)!==r.blockBothHands)throw new Error("Handedness differs from effective rule: "+r.id);
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

if(!Array.isArray(d.targetProfiles)||d.targetProfiles.length!==310)throw new Error("Expected 310 searchable enemy target profiles, got "+(d.targetProfiles?.length??0));
if(Number(d.counts?.targetProfiles)!==d.targetProfiles.length)throw new Error("Target profile count mismatch");
const targetUnits=new Set();
for(const p of d.targetProfiles){
  if(!p.unitId||targetUnits.has(p.unitId))throw new Error("Duplicate/bad target unit: "+p.unitId);
  targetUnits.add(p.unitId);
  if(!p.armorId||!Array.isArray(p.damageModifier)||p.damageModifier.length<20)throw new Error("Incomplete target profile: "+p.unitId);
  if(!Array.isArray(p.races)||!p.races.length)throw new Error("Enemy target lacks alien-race reference: "+p.unitId);
  for(const key of ["frontArmor","sideArmor","rearArmor","underArmor"])if(!Number.isFinite(Number(p[key])))throw new Error("Bad target armor "+key+": "+p.unitId);
}
for(const id of ["STR_SECTOID_SOLDIER","STR_CHRYSSALID_TERRORIST","STR_MUTON_SOLDIER"])if(!targetUnits.has(id))throw new Error("Missing canonical enemy target: "+id);

const detailIds=new Set();
for(const r of [...sections.shooting,...sections.melee,...sections.throwing]){
  detailIds.add(r.itemId);
  if(r.ammoId)detailIds.add(r.ammoId);
  if(r.powerSourceId)detailIds.add(r.powerSourceId);
}
for(const id of detailIds)loadDetail(id);
if(Object.keys(d.detailIndex).length!==detailIds.size)throw new Error("Weapon detail index coverage mismatch: "+Object.keys(d.detailIndex).length+" != "+detailIds.size);
if(Number(d.counts?.detailItems)!==detailIds.size)throw new Error("Weapon detail count mismatch");
const twoHandedMelee=sections.melee.filter(x=>x.twoHanded);
const oneHandedMelee=sections.melee.filter(x=>!x.twoHanded&&!x.blockBothHands);
if(!twoHandedMelee.length||!oneHandedMelee.length)throw new Error("Melee handedness coverage missing");

console.log("OK weapons: "+sections.shooting.length+" shooting, "+sections.melee.length+" melee, "+sections.throwing.length+" throwing, "+d.characters.length+" reference characters, "+targetUnits.size+" searchable enemy target profiles, "+pelletRows.length+" pellet rows, "+shortRangeRows.length+" short-range rows, "+shortMultiRows.length+" short-range multi-hit rows, "+detailIds.size+" full rule details, "+twoHandedMelee.length+" two-handed melee rows, "+Object.values(d.sectionChunks).flat().length+" chunks");
