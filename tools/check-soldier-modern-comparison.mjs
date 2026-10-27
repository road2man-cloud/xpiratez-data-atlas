import fs from "node:fs";
import assert from "node:assert/strict";
import {compareSoldierFutureRoutes} from "../public/soldiers/modern/comparison.js";
const data=JSON.parse(fs.readFileSync("public/data/soldiers-modern-index.json","utf8"));
const view=compareSoldierFutureRoutes(data);
assert.equal(view.rows.length,83);
assert.equal(view.gal.excluded,45);
assert.equal(view.half.excluded,34);
assert.equal(view.gal.candidates+view.gal.excluded,83);
assert.equal(view.half.candidates+view.half.excluded,83);
assert.equal(view.different,27);
assert.equal(view.half.inheritedHistory,3);
const rows=new Map(view.rows.map(x=>[x.id,x]));
const internal=["STR_CAREER_SOLDIER","STR_THEBAN_ASSAULT_CLONE","STR_LONE_WOLF"];
for(const id of internal){
  const row=rows.get(id);
  assert(row,id);
  assert.equal(row.gal.kind,"excluded",id+" Gal");
  assert.equal(row.half.kind,"excluded",id+" half-peasant");
}
const firearm=rows.get("STR_BASIC_FIREARMS_TRAINING");
assert.equal(firearm.gal.kind,"conditional");
assert.equal(firearm.half.kind,"history");
assert(firearm.half.reason.includes("STR_BASIC_FIREARMS_TRAINING"));
const uber=rows.get("STR_UBERIZATION");
assert.equal(uber.gal.kind,"excluded");
assert.equal(uber.half.kind,"history");
assert.equal(rows.get("STR_GUN_KATA_TRAINING").gal.kind,"prerequisite");
for(const row of view.rows){
  for(const key of ["gal","half"]){
    const v=row[key];
    assert(v.label&&v.reason,row.id+"/"+key+" missing cause");
    assert.equal(v.originallyAccessible,v.kind!=="excluded",row.id+"/"+key+" wrong exclusion label");
  }
}
console.log("PASS X-Piratez 2.1 Gal vs half-super-peasant: 83 complete route comparisons, "+
  view.different+" divergences, 45/34 proven exclusions, 3 inherited history gates, no unproven permanent blocks");
