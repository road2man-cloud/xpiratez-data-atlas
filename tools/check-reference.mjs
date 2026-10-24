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

console.log("PASS latest-only reference: 33 training modes, 20 damage types, 10 random types, 306 current items, original source hashes, no legacy version controls/data.");
