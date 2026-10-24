import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {join} from "node:path";
import {fileURLToPath} from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const path = (...parts) => join(root, ...parts);
const read = rel => readFileSync(path(rel), "utf8");
const parse = rel => JSON.parse(read(rel));
const engine = parse("public/reference/engine-codes.json");
const old = parse("public/reference/v-o111-items.json");
const next = parse("public/reference/v-o2-items.json");
const page = read("public/reference/index.html");
const home = read("public/index.html");
const app = read("public/reference/app.js");

function contiguous(arr, max, field) {
  assert.equal(arr.length, max + 1, field + " count");
  assert.deepEqual(arr.map(x => x.value), Array.from({length:max+1},(_,i)=>i),field+" values");
}
contiguous(engine.tables.experienceTrainingMode, 32, "experienceTrainingMode");
contiguous(engine.tables.damageType, 19, "damageType");
contiguous(engine.tables.RandomType, 9, "RandomType");
assert.equal(engine.tables.experienceTrainingMode[13].enum,"ETM_REACTIONS_AND_MELEE");
assert.equal(engine.tables.experienceTrainingMode[19].enum,"ETM_BRAVERY");
assert.equal(engine.tables.experienceTrainingMode[32].enum,"ETM_NOTHING");
assert.equal(engine.tables.RandomType[4].enum,"DRT_FIRE");
assert.ok(engine.tables.RandomType[4].rule.includes("절대"));

function checkSnapshot(data, version, count, suffix) {
  assert.match(data.gameVersion, new RegExp(version));
  assert.equal(data.items.length, count);
  assert.equal(new Set(data.items.map(x => x.i)).size, count,"unique item IDs");
  const cat = data.items.find(x => x.i === "STR_CAT_PAWS");
  assert.ok(cat,"Cat Paws present");
  assert.equal(cat.m,13,"Cat Paws training mode 13");
  assert.ok(cat.f.endsWith(".rul") && Number.isInteger(cat.l) && cat.l>0);
  for (const x of data.items) {
    assert.ok(Number.isInteger(x.m) && x.m>=0 && x.m<=32,x.i+" mode valid");
    assert.ok(x.i.length>2 && x.f.endsWith(".rul") && x.l>0,"source location");
  }
  assert.match(data.sourceHashes["Piratez.rul"],/^[a-f0-9]{64}$/);
  const js = read("public/reference/"+suffix+"-items.js");
  const needle = suffix === "v-o111" ? "window.XPZ_REFERENCE_O111 = " : "window.XPZ_REFERENCE_O2 = ";
  const start = js.indexOf(needle);
  assert.ok(start>0,"sidecar JS header");
  assert.deepEqual(JSON.parse(js.slice(start+needle.length).trim().replace(/;\s*$/,"")),data,"JSON vs JS snapshot mismatch");
}
checkSnapshot(old,"v.o1.1.1",307,"v-o111");
checkSnapshot(next,"v.o2",306,"v-o2");
const A = new Map(old.items.map(x=>[x.i,x.m]));
const B = new Map(next.items.map(x=>[x.i,x.m]));
const common = [...A].filter(([id])=>B.has(id));
assert.equal(common.length,305);
assert.equal(common.filter(([id,mode])=>B.get(id)!==mode).length,0,"unverified experience-mode drift");

for(const id of Array.from({length:33},(_,i)=>"mode-"+i)) assert.ok(page.includes('id="'+id+'"'),"anchor "+id);
for(const id of Array.from({length:20},(_,i)=>"damage-"+i)) assert.ok(page.includes('id="'+id+'"'),"anchor "+id);
for(const id of Array.from({length:10},(_,i)=>"random-"+i)) assert.ok(page.includes('id="'+id+'"'),"anchor "+id);
assert.ok(page.includes('href="./v-o2-items.json"') && page.includes('href="./v-o111-items.json"'));
assert.ok(page.includes('id="item-version"') && page.includes('id="item-rows"'));
assert.ok(app.includes("renderVersionDiff") && app.includes("renderItems"));
assert.ok(home.includes('href="./reference/"'),"home navigation missing");
assert.ok(home.includes('class="card" href="./reference/"'),"home card missing");

console.log("PASS reference atlas: 33 experience modes, 20 damage types, 10 random modes, 307+306 versioned items, navigation, provenance and JSON/JS parity.");
