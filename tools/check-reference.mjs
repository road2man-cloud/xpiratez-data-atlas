import assert from "node:assert/strict";
import {readFileSync, existsSync} from "node:fs";
import {join} from "node:path";
import {fileURLToPath} from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const path = (...parts) => join(root, ...parts);
const read = rel => readFileSync(path(rel), "utf8");
const parse = rel => JSON.parse(read(rel));
const engine = parse("public/reference/engine-codes.json");
const current = parse("public/reference/items.json");
const page = read("public/reference/index.html");
const home = read("public/index.html");
const app = read("public/reference/app.js");
const voxels = parse("public/reference/unit-voxels.json");
const voxelApp = read("public/reference/voxels.js");
const modernSoldiers = parse("public/data/soldiers-modern-index.json");

function contiguous(arr, max, field) {
  assert.equal(arr.length, max + 1, field + " count");
  assert.deepEqual(arr.map(x => x.value), Array.from({length: max + 1}, (_, i) => i), field + " values");
}
contiguous(engine.tables.experienceTrainingMode, 32, "experienceTrainingMode");
contiguous(engine.tables.damageType, 19, "damageType");
contiguous(engine.tables.RandomType, 9, "RandomType");
assert.equal(engine.tables.experienceTrainingMode[13].enum, "ETM_REACTIONS_AND_MELEE");
assert.equal(engine.tables.experienceTrainingMode[19].enum, "ETM_BRAVERY");
assert.equal(engine.tables.experienceTrainingMode[32].enum, "ETM_NOTHING");
assert.equal(engine.tables.RandomType[4].enum, "DRT_FIRE");
assert.match(engine.tables.RandomType[4].rule, /절대/);

assert.match(current.gameVersion, /v\.o2/);
assert.equal(current.items.length, 306);
assert.equal(new Set(current.items.map(x => x.i)).size, 306, "unique item IDs");
assert.equal(current.items.find(x => x.i === "STR_CAT_PAWS")?.m, 13);
for (const item of current.items) {
  assert.ok(Number.isInteger(item.m) && item.m >= 0 && item.m <= 32, item.i + " has valid mode");
  assert.ok(item.i && item.f.endsWith(".rul") && item.l > 0, "source location");
}
assert.match(current.sourceHashes["Piratez.rul"], /^[a-f0-9]{64}$/);

const sidecar = read("public/reference/items.js");
const needle = "window.XPZ_REFERENCE_ITEMS = ";
const start = sidecar.indexOf(needle);
assert.ok(start > 0, "current JS sidecar header");
assert.deepEqual(JSON.parse(sidecar.slice(start + needle.length).trim().replace(/;\s*$/, "")), current,
  "JSON and browser sidecar must be identical");

for (let i = 0; i <= 32; i++) assert.ok(page.includes('id="mode-' + i + '"'), "mode anchor " + i);
for (let i = 0; i <= 19; i++) assert.ok(page.includes('id="damage-' + i + '"'), "damage anchor " + i);
for (let i = 0; i <= 9; i++) assert.ok(page.includes('id="random-' + i + '"'), "random anchor " + i);
assert.ok(page.includes('href="./items.json"') && page.includes('src="./items.js?'));
assert.ok(page.includes('id="item-search"') && page.includes('id="item-mode"'));
assert.ok(app.includes("XPZ_REFERENCE_ITEMS") && app.includes("renderItems"));
assert.ok(!page.includes('id="item-version"'), "retired version selector still visible");
assert.ok(!page.includes('id="version-diff"'), "retired version comparison still visible");
assert.ok(!page.includes("v-o111") && !page.includes("v-o2-items"), "retired data links");
assert.ok(!app.includes("XPZ_REFERENCE_O111") && !app.includes("XPZ_REFERENCE_O2"), "retired snapshot lookup");
for (const legacy of ["v-o111-items.json", "v-o111-items.js", "v-o2-items.json", "v-o2-items.js"]) {
  assert.ok(!existsSync(path("public/reference", legacy)), "retired file remains: " + legacy);
}
assert.ok(home.includes('href="./reference/"'), "main navigation missing");
assert.ok(home.includes('class="card" href="./reference/"'), "main card missing");
assert.ok(!home.includes("v.o1.1.1·v.o2"), "main card still advertises versions");

assert.match(voxels.gameVersion, /^v[.]o2/, "voxel table must use the current game");
assert.equal(voxels.engine, "OXCE 8.7.1");
assert.deepEqual(voxels.tile,{x:16,y:16,z:24});
assert.equal(voxels.soldiers.length,29,"all playable species/body types");
assert.equal(voxels.armors.length,540,"all modern wearable armor rules");
assert.equal(voxels.counts.soldiers,voxels.soldiers.length);
assert.equal(voxels.counts.wearableArmors,voxels.armors.length);
const soldierIds = new Set(voxels.soldiers.map(x=>x.id));
assert.equal(soldierIds.size,voxels.soldiers.length,"unique soldier IDs");
const armorIds = new Set(voxels.armors.map(x=>x.id));
assert.equal(armorIds.size,voxels.armors.length,"unique armor IDs");
const armorById = new Map(voxels.armors.map(a=>[a.id,a]));
const originals = new Map(modernSoldiers.soldiers.map(s=>[s.id,s]));
assert.equal(originals.size,voxels.soldiers.length,"modern soldier dataset alignment");
for(const row of voxels.soldiers){
  assert.ok(originals.has(row.id),"soldier present in current 2.1 data: "+row.id);
  const original = originals.get(row.id);
  assert.equal(row.base.standing,original.raw.standHeight,row.id+" standHeight");
  assert.equal(row.base.kneeling,original.raw.kneelHeight,row.id+" kneelHeight");
  assert.equal(row.defaultArmor,original.armor,row.id+" base armor");
  assert.ok(row.defaultArmorResolved,"unresolved default armor "+row.id);
  const armor=armorById.get(row.defaultArmor);
  assert.ok(armor&&armor.soldierTypes.includes(row.id),"default armor included "+row.id);
  const shape=row.defaultShape;
  assert.equal(shape.standing,armor.standHeightOverride===-1?row.base.standing:armor.standHeightOverride);
  assert.equal(shape.kneeling,armor.kneelHeightOverride===-1?row.base.kneeling:armor.kneelHeightOverride);
  assert.equal(shape.standingShotOrigin,shape.standing+shape.floating-4);
  assert.equal(shape.kneelingShotOrigin,shape.kneeling+shape.floating-4);
  assert.ok(shape.size>=1&&Number.isInteger(shape.size),"valid initial armor footprint "+row.id);
}
for(const armor of voxels.armors){
  assert.ok(armor.soldierTypes.length>0,"all armor rows have a compatible soldier");
  assert.ok(armor.soldierTypes.every(id=>soldierIds.has(id)),armor.id+" valid soldier types");
  assert.ok(Number.isInteger(armor.size)&&armor.size>=1);
}
for(const [id,standing,kneeling] of [
  ["STR_SOLDIER",22,14],
  ["STR_SOLDIER_LOKNAR",17,11],
  ["STR_SOLDIER_NEKOMIMI",21,13],
  ["STR_SOLDIER_DOGE",12,12],
  ["STR_SOLDIER_PUREBLOOD",22,13]
]){
  const s=voxels.soldiers.find(x=>x.id===id);
  assert.ok(s,id);
  assert.deepEqual([s.base.standing,s.base.kneeling],[standing,kneeling],id+" source heights");
}
const loknar=voxels.soldiers.find(s=>s.id==="STR_SOLDIER_LOKNAR");
const loknarRider=armorById.get("STR_LOKNAR_PLATE_MAIL_RIDER_UC");
assert.ok(loknar&&loknarRider,"mounted Bloodhound Loknar rule is indexed");
assert.deepEqual(loknar.defaultShape.loftempsSet,[2],"basic Loknar collision mask");
assert.deepEqual(loknarRider.loftempsSet,[4],"Bloodhound rider collision mask differs");
assert.equal(voxels.collisionTemplateSource.file,"GEODATA/LOFTEMPS.DAT");
assert.match(voxels.collisionTemplateSource.sha256,/^[a-f0-9]{64}$/);
assert.deepEqual([voxels.collisionTemplates[2].width,voxels.collisionTemplates[2].depth,
  voxels.collisionTemplates[2].occupied],[5,5,21],"decoded normal Loknar 16x16 collision mask");
assert.deepEqual([voxels.collisionTemplates[4].width,voxels.collisionTemplates[4].depth,
  voxels.collisionTemplates[4].occupied],[9,9,61],"decoded mounted Loknar mask");
assert.equal(loknarRider.size,1,"rider occupies one tile");
assert.equal(loknarRider.standHeightOverride,-1,"rider inherits Loknar standing height");
assert.equal(loknarRider.kneelHeightOverride,-1,"rider inherits Loknar kneeling height");
assert.deepEqual([loknar.defaultShape.standingShotOrigin,loknar.defaultShape.kneelingShotOrigin],[13,7]);
assert.ok(voxels.armors.every(a=>Array.isArray(a.loftempsSet)&&a.loftempsSet.length===a.size*a.size),
  "full source collision template matrix for every unit armor tile");
assert.ok(page.includes("블러드하운드") && voxelApp.includes("loftChanged"),"rider exceptions visible");
assert.ok(page.includes('id="large-unit-voxels"')&&page.includes('id="voxel-large-rows"'),"all 2x2 armors full list in reference");
assert.ok(page.includes("voxels.js?v=20261027-all-46-large-units"),"refresh deployed browser cache for updated 2x2 UI");
assert.ok(voxelApp.includes("renderLargeArmors")&&voxelApp.includes("collisionFootprint"),"2x2 aggregate client view");
const large=voxels.armors.filter(a=>a.size===2);
assert.equal(large.length,46,"all 2x2 equippable armors");
assert.equal(voxels.counts.twoByTwoArmors,46);
assert.ok(large.every(a=>a.allowsKneeling===false),"all 2x2 armors prohibit kneeling");
assert.ok(large.every(a=>a.loftempsSet.join(",")==="92,89,90,91"),
  "2x2 masks must match verified X-Piratez 2.1 rules");
for(const armor of voxels.armors){
  const f=armor.collisionFootprint;
  assert.ok(f,armor.id+" aggregate collision footprint");
  assert.equal(f.gridWidth,armor.size*16);
  assert.equal(f.gridDepth,armor.size*16);
  assert.equal(f.possiblePerLayer,256*armor.size*armor.size);
  assert.equal(f.occupiedPerLayer,
    armor.loftempsSet.reduce((sum,id)=>sum+voxels.collisionTemplates[id].occupied,0),
    armor.id+" horizontal mask area");
}
const largeFootprints=large.map(a=>a.collisionFootprint);
assert.ok(largeFootprints.every(f=>f.gridWidth===32&&f.gridDepth===32 &&
  f.boundsWidth===32&&f.boundsDepth===32&&f.occupiedPerLayer===780 &&
  f.possiblePerLayer===1024&&f.coveragePercent===76.17),
  "all 46 large-armor exact 32x32 collision footprints");
const baseHeights=[...new Set(large.flatMap(a=>a.soldierTypes.map(id=>{
  const soldier=voxels.soldiers.find(s=>s.id===id);
  return a.standHeightOverride===-1?soldier.base.standing:a.standHeightOverride;
})))].sort((a,b)=>a-b);
assert.deepEqual(baseHeights,[17,18,21,22],"large armor standing heights by species");
assert.ok(voxels.armors.some(a=>a.size===2),"large two-tile armor geometries are indexed");
assert.ok(voxels.armors.some(a=>a.allowsKneeling===false),"armor-level kneeling restrictions are indexed");
for(const [file,sha] of Object.entries(voxels.sourceHashes)){
  const origin=modernSoldiers.meta.source.rules.find(r=>r.file===file);
  assert.ok(origin,file+" modern 2.1 provenance");
  assert.equal(sha,origin.sha256,file+" input hash matches modern soldier dataset");
}
for(const required of ['id="unit-voxels"','id="voxel-body-rows"','id="voxel-armor-rows"',
  'id="voxel-species"','href="./unit-voxels.json"','src="./voxels.js?']){
  assert.ok(page.includes(required),"missing voxel reference HTML "+required);
}
assert.ok(voxelApp.includes('unit-voxels.json')&&voxelApp.includes('voxel-body-rows'));
assert.equal((page.match(/<th>무릎 사격 출발 Z<\/th>/g)||[]).length,2,
  "both soldier and armor reference tables must display kneeling shot height");
assert.ok(voxelApp.includes("kneelingShotOrigin")&&voxelApp.includes("무릎 불가"),
  "renderer must show kneeling projectile Z with prohibited-stance warning");
console.log("PASS latest-only reference: 33 training modes, 20 damage types, 10 random types, 306 current items, plus 29 soldier bodies / 540 armors with original-rule SHA-256 and stance heights.");
