import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {buildChoiceIndex,computeChoiceScenario,choiceStatus,choiceGrantCandidates} from "../public/captains/choice-simulator-core.js";

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
const gates=JSON.parse(fs.readFileSync("public/data/choice-research-gates.json","utf8"));
assert.equal(gates.schemaVersion,1);
assert.equal(gates.count,topics.length);
const graph=buildChoiceIndex(topics,gates);
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
  const gate=gates.topics[id];
  assert(gate,"Missing research gate "+id);
  same(topic.dependencies,refs(raw.dependencies),"engine dependencies");
  same(topic.unresolvedDependencies,(Array.isArray(raw.dependencies)?raw.dependencies:raw.dependencies?[raw.dependencies]:[]).filter(x=>typeof x==="string"&&!ids.has(x)),"unresolved raw dependencies");
  same(topic.unresolvedGetOneFree,(Array.isArray(raw.getOneFree)?raw.getOneFree:raw.getOneFree?[raw.getOneFree]:[]).filter(x=>typeof x==="string"&&!ids.has(x)),"unresolved raw free rewards");
  same(topic.requires,refs(raw.requires),"engine requires");
  same(topic.unlocks,refs(raw.unlocks),"engine unlocks");
  same(topic.getOneFree,refs(raw.getOneFree),"engine getOneFree");
  assert.equal(topic.zeroCost,raw.cost===0,"Engine zero cost mismatches "+id);
  for(const [required,targets] of Object.entries(topic.getOneFreeProtected))
    same(targets,refs(raw.getOneFreeProtected?.[required]),"protected free group "+required);
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
const winners=choiceGrantCandidates(graph,example,"STR_TRUCKS");
assert(winners.eligible.length>0,"STR_TRUCKS must expose candidate getOneFree rewards");
assert.equal(winners.eligible.some(x=>x.id==="STR_WRENCH"),true);
const unlockPair=[...graph.byId.values()].flatMap(source=>
  source.unlocks.filter(to=>graph.byId.get(to)?.dependencies.length>0).map(to=>[source.id,to]))[0];
assert(unlockPair,"Expected a nontrivial unlocks -> dependencies bypass pair");
const [unlocker,target]=unlockPair;
const unlocked=computeChoiceScenario(graph,[],[unlocker]);
const bypass=choiceStatus(graph,unlocked,target);
assert.equal(bypass.missingDependencies.length,0,"unlocks must bypass all dependencies");
assert(bypass.unlockedBy.includes(unlocker));
const notUnlocked=choiceStatus(graph,computeChoiceScenario(graph),target);
assert(notUnlocked.missingDependencies.length>0,"dependencies should be pending without unlock");
const protectedSource=[...graph.byId.values()].find(t=>
  Object.keys(t.getOneFreeProtected).length>0 &&
  Object.entries(t.getOneFreeProtected).some(([req,values])=>values.some(v=>graph.byId.has(v))));
assert(protectedSource);
const initialGrant=choiceGrantCandidates(graph,computeChoiceScenario(graph),protectedSource.id);
assert(initialGrant.pending.length>0);
const prereq=Object.keys(protectedSource.getOneFreeProtected)[0];
const openGrant=choiceGrantCandidates(graph,computeChoiceScenario(graph,[prereq]),protectedSource.id);
assert(openGrant.eligible.length>=initialGrant.eligible.length);
// Deliberately refuse to fabricate a free research draw without RNG, ownership
// and event conditions. The UI must disclose this important uncertainty.
assert.deepEqual(example.steps,["STR_TRUCKS"]);
assert.equal(example.completed.size,1);
console.log("OK independent engine-data audit: "+details.size+
  " effective research rules / "+rawDisable+" directed disables / "+rawReenable+
  " reenables / "+explicitUnlockTopics+" explicit-unlock topics / "+
  freeGrantTopics+" getOneFree sources ("+freeGrantTargets+" potential targets), "+
  protectedGrantTopics+" conditional getOneFree sources; verified unlocks dependency bypass ("+unlocker+" -> "+target+") and preserved uncertain RNG");
