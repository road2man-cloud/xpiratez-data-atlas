import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {buildChoiceIndex,computeChoiceScenario} from "../public/captains/choice-simulator-core.js";

// Independent data provenance check: compare the compact progression catalog to
// each effective rule preserved verbatim inside the published research detail chunks.
const dir="public/items/data/research-chunks";
const details=new Map();
for(const filename of fs.readdirSync(dir).filter(x=>x.endsWith(".json"))){
  const blob=JSON.parse(fs.readFileSync(path.join(dir,filename),"utf8"));
  for(const row of Object.values(blob.details||{})){
    assert(!details.has(row.id),"Duplicate raw research "+row.id);
    details.set(row.id,row.raw);
  }
}
const topics=JSON.parse(fs.readFileSync("public/data/progression-research.json","utf8")).topics;
const graph=buildChoiceIndex(topics);
const ids=new Set(graph.byId.keys());
assert.equal(details.size,4612);
assert.equal(graph.byId.size,details.size);
const refs=v=>(Array.isArray(v)?v:v==null?[]:[v]).filter(id=>typeof id==="string"&&ids.has(id));
let rawDisable=0,rawReenable=0,freeGrantTopics=0,freeGrantTargets=0,protectedGrantTopics=0;
let explicitUnlockTopics=0;
for(const [id,raw] of details){
  assert(graph.byId.has(id),"Raw research missing in progression catalog: "+id);
  const topic=graph.byId.get(id);
  const same=(a,b,label)=>assert.deepEqual([...a].sort(),[...b].sort(),id+" "+label);
  const rawDisabled=refs(raw.disables);
  same(topic.disables,rawDisabled,"disables");
  const rawReenabled=refs(raw.reenables);
  same(topic.reenables,rawReenabled,"reenables");
  const dependencies=[...new Set([...refs(raw.dependencies),...refs(raw.requires)])];
  same(topic.prerequisites,dependencies,"prerequisites");
  rawDisable+=rawDisabled.length;
  rawReenable+=rawReenabled.length;
  if(refs(raw.unlocks).length)explicitUnlockTopics++;
  const free=refs(raw.getOneFree);
  if(free.length){freeGrantTopics++;freeGrantTargets+=free.length;}
  if(raw.getOneFreeProtected&&Object.keys(raw.getOneFreeProtected).length)protectedGrantTopics++;
}
assert.equal(rawDisable,440);
assert.equal(rawReenable,0,"Any newly introduced reenables must be present in compact progression topics");
assert(freeGrantTopics>350);
assert(protectedGrantTopics>70);
const example=computeChoiceScenario(graph,[],["STR_TRUCKS"]);
// Deliberately refuse to fabricate a free research draw without RNG, ownership
// and event conditions. The UI must disclose this important uncertainty.
assert.deepEqual(example.steps,["STR_TRUCKS"]);
assert.equal(example.completed.size,1);
console.log("OK independent engine-data audit: "+details.size+
  " effective research rules / "+rawDisable+" directed disables / "+rawReenable+
  " reenables / "+explicitUnlockTopics+" explicit-unlock topics / "+
  freeGrantTopics+" getOneFree sources ("+freeGrantTargets+" potential targets), "+
  protectedGrantTopics+" conditional getOneFree sources; no RNG grants guessed");
