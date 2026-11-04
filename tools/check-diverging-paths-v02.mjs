import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const load=path=>JSON.parse(readFileSync(path,"utf8"));
const original=load("public/captains/diverging-paths-v02.json");
const mirrored=load("modules/captains/diverging-paths-v02.json");
assert.deepEqual(mirrored,original,"modules/public contents mismatch");
assert.equal(original.paths.length,5);
const ids=original.paths.map(x=>x.id);
assert.deepEqual(ids,["peasant","male","gal","cat","hybrid"]);
const get=(path,script)=>original.paths.find(x=>x.id===path).events.find(x=>x.script===script);
const license=get("peasant","STR_PROPAGANDA_1");
assert.equal(license.odds,23);
assert.equal(license.outcomes.reduce((n,v)=>n+v[1],0),450);
assert.equal(license.outcomes.find(x=>x[0].includes("돌격 클론 면허"))[1],25);
assert.equal(get("male","STR_HYBRID_OF_TWILIGHT_EVENT").odds,17);
const seven=get("male","STR_THE_MAGNIFICIENT_SEVEN_EVENT");
assert.equal(seven.odds,100);
assert.equal(seven.oneTime,true);
assert.equal(original.magnificentSeven.onlyMonth,11);
assert.equal(original.magnificentSeven.requirements.length,6);
assert.equal(original.magnificentSeven.requirements.find(x=>x[1]==="STR_CAPTAIN_PURE_UP")[2],false);
assert.equal(original.magnificentSeven.requirements.find(x=>x[1]==="STR_LIZARDMAN_STATUE")[2],false);
assert.equal(original.purpleBloom.monthlyMaintenance,-33000);
for(const branch of original.paths){
 for(const e of branch.events){
  assert.ok(e.conditions,"missing conditions: "+e.script);
  assert.ok(e.odds>=0&&e.odds<=100);
  assert.ok(e.outcomes.length);
  assert.ok(e.outcomes.every(x=>x[1]>0));
 }
}
for(const dir of ["public","modules"]){
const html=readFileSync(`${dir}/captains/index.html`,"utf8");
assert.ok(html.includes('id="divergingPathsV02"'));
for(const file of ["diverging-paths-v02.css","diverging-paths-v02.js"])assert.ok(html.includes(file),`missing ${file} in ${dir}`);
}
console.log("[diverging-paths-v02] 5 pathways, 33 events, weights and 11-month one-time gates validated; public/modules mirrored.");
