// CI gate for concise, source-grounded decision cards across all 14 DBs.
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import vm from "node:vm";
import assert from "node:assert/strict";

const root="public/data/play-guide";
const kinds=["starting","captains","soldiers","trainings","crafts","craft-weapons","facilities","armors","items","research","manufacture","events","forces","weapons"];
const read=p=>JSON.parse(fs.readFileSync(p,"utf8"));
const gunzip=p=>JSON.parse(zlib.gunzipSync(fs.readFileSync(p)).toString("utf8"));
const guides={};
let count=0;
for(const kind of kinds){
  const html=fs.readFileSync("public/"+kind+"/index.html","utf8");
  assert.match(html,/\.\.\/play-guide\.js/,kind+": missing guide script");
  assert.match(html,/\.\.\/play-guide\.css/,kind+": missing guide CSS");
  const guide=gunzip(path.join(root,kind+".json.gz"));
  const teaser=gunzip(path.join(root,kind+".teasers.json.gz"));
  const cards=Object.values(guide.cards||{});
  guides[kind]=guide.cards;
  assert.equal(cards.length,guide.count,kind+": output/card count divergence");
  assert.equal(Object.keys(teaser.titles||{}).length,cards.length,kind+": teaser coverage");
  assert.ok(cards.length>0,kind+": guide is empty");
  for(const c of cards){
    assert.equal(teaser.titles[c.id],c.title,kind+"/"+c.id+": missing teaser");
    for(const f of ["title","effect","gates","action","decision","watch","source"])
      assert.ok(typeof c[f]==="string"&&c[f].trim(),kind+"/"+c.id+": missing "+f);
    assert.ok(c.title.length<=240,kind+"/"+c.id+": summary is too long");
  }
  count+=cards.length;
  console.log(kind+": "+cards.length+" validated");
}

const trainings=read("public/data/trainings-index.json");
const expectedIds={
  items:read("public/items/data/items-index.json").index.map(x=>x.id),
  research:read("public/items/data/research-index.json").index.map(x=>x.id),
  manufacture:read("public/data/manufacture-index.json").index.map(x=>x.id),
  facilities:read("public/data/facilities-index.json").index.map(x=>x.id),
  armors:read("public/data/armors-index.json").index.map(x=>x.id),
  "craft-weapons":read("public/data/craft-weapons-index.json").index.map(x=>x.id),
  crafts:read("public/data/progression.json").crafts.map(x=>x.id),
  soldiers:[...read("public/data/soldiers-index.json").profiles,...read("public/data/soldiers-index.json").soldiers,...trainings.transformations].map(x=>x.id),
  trainings:trainings.transformations.map(x=>x.id),
  events:gunzip("public/data/events-index.json.gz").index.map(x=>x.id),
  forces:gunzip("public/data/enemy-forces-index.json.gz").index.map(x=>x.id)
};
const starting=read("public/data/starting-bonuses.json");
expectedIds.starting=[...starting.regions,...starting.countries].map(x=>x.triggerIds?.length?x.triggerIds.join("|"):"__NONE__");
const weaponData=read("public/data/weapons-index.json");
expectedIds.weapons=["shooting","melee","throwing"].flatMap(k=>
  (weaponData.sectionChunks?.[k]||[]).flatMap(rel=>read("public/data/"+rel).rows.map(x=>x.id)));
const sandbox={window:{}};
vm.runInNewContext(fs.readFileSync("public/captains/captain-rows.js","utf8"),sandbox,{timeout:2000});
expectedIds.captains=sandbox.window.CAPTAIN_ROWS.map(x=>x.id);
for(const [kind,ids] of Object.entries(expectedIds)){
  const unique=[...new Set(ids)].sort();
  assert.deepEqual(Object.keys(guides[kind]).sort(),unique,
    kind+": source IDs and published guide IDs diverged; rebuild with npm run build:play-guide");
}
assert.equal(Object.keys(guides.trainings).length,trainings.transformations.length,
  "Every transformation should have a decision card");
for(const t of trainings.transformations)assert.ok(guides.trainings[t.id],t.id+" training missing");

const c11=trainings.transformations.find(t=>t.id==="STR_CAPTAINS_11");
assert.ok(c11,"Captain's 11 transformation missing");
assert.equal(c11.cost,100000);
assert.equal(c11.transferTime,500);
assert.ok(c11.requiredItems.some(x=>x.id==="STR_CAPTAINS_11_TOKEN"&&x.amount===1));
assert.ok(c11.requiredItems.some(x=>x.id==="STR_GLAMOUR"&&x.amount===21));
assert.equal(c11.soldierBonusType,"STR_CAPTAINS_11");
const c11bonus=trainings.bonuses.STR_CAPTAINS_11;
assert.equal(c11bonus.stats.tu,10);
assert.equal(c11bonus.stats.mana,20);
assert.equal(c11bonus.recovery?.energy?.flatOne,2);
assert.equal(c11bonus.recovery?.stun?.flatOne,2);
assert.ok(!trainings.transformations.some(t=>t.id!==c11.id&&t.forbiddenPreviousTransformations?.includes(c11.id)),
  "Captain's 11 reverse exclusion assumptions changed");
const eventIndex=gunzip("public/data/events-index.json.gz").index;
const evRow=eventIndex.find(x=>x.id==="STR_CAPTAINS_11");
assert.ok(evRow,"Captain's 11 award event missing");
const event=gunzip("public/data/event-chunks/"+evRow.bucket+".json.gz").details.STR_CAPTAINS_11;
assert.ok(event.effects.researchRewards.some(x=>x.id==="STR_CAPTAINS_11"));
assert.ok(event.effects.guaranteedItems.some(x=>x.id==="STR_CAPTAINS_11_TOKEN"&&x.qty===11));
const required=["STR_CAPTAIN_THIEF","STR_CAPTAINS_LOG_01","STR_CAPTAINS_RANK_02","STR_TROPHY_GAMBLER","STR_BOUNTY_HUNTING_C_PASS"];
for(const id of required)assert.ok(event.scripts.some(s=>s.triggerMaps.researchTriggers.some(x=>x.id===id&&x.value===true)),
  "Captain's 11 grant gate missing: "+id);
for(const source of [guides.trainings.STR_CAPTAINS_11,guides.research.STR_CAPTAINS_11]){
  assert.match(source.gates,/도둑 선장/);
  assert.match(source.action,/11개|11회/);
  assert.match(source.action,/500시간/);
}
for(const id of ["STR_CHARMY_DANCE_TRAINING","STR_PERSON_OF_CULTURE_TRAINING"]){
  assert.ok(guides.trainings[id]&&guides.research[id],id+": research/training guide pair missing");
}
console.log("OK concise decision guidance: "+kinds.length+" catalogs, "+count+" cards, 100% key-field coverage, Captain's 11 event/training effect & gate cross-checks");
