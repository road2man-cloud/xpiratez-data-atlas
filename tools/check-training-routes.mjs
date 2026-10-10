import fs from "node:fs";
import crypto from "node:crypto";
import assert from "node:assert/strict";
import {routeContext,trainingRouteAccess,eventAccess,researchBlock} from "../public/trainings/route-access.js";

const data=JSON.parse(fs.readFileSync("public/data/trainings-index.json","utf8"));
const byId=new Map(data.transformations.map(t=>[t.id,t]));
const route=(id,options)=>trainingRouteAccess(byId.get(id),routeContext(data,options),data);
const captains=["STR_CAPTAIN_DUMBASS","STR_CAPTAIN_JACKASS","STR_CAPTAIN_SOREASS","STR_CAPTAIN_LAZYASS",
  "STR_CAPTAIN_PUSSY","STR_CAPTAIN_THIEF","STR_CAPTAIN_PRIEST","STR_CAPTAIN_MAGE","STR_CAPTAIN_RULER"];
assert.equal(data.meta.schemaVersion,2);
assert.equal(data.meta.eventSourceHashes.length,16);
for(const r of data.meta.eventSourceHashes){
  const p="public/data/"+r.file;
  assert.equal(crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex"),r.sha256,p+" changed");
}
const token=data.itemSources.STR_CAPTAINS_11_TOKEN;
assert.equal(token.costBuy,0);
assert.equal(token.manufactureCount,0);
assert.deepEqual(token.guaranteedEvents.map(e=>e.eventId),["STR_CAPTAINS_11"]);
assert.equal(data.exclusiveJointGrants.STR_CAPTAINS_11[0].researchId,"STR_CAPTAINS_11");
const captainEvent=data.researchEventRoutes.STR_CAPTAINS_11[0];
assert.equal(captainEvent.eventId,"STR_CAPTAINS_11");
assert(captainEvent.scripts.some(s=>s.yes.includes("STR_CAPTAIN_THIEF")));
const dumb=routeContext(data,{captain:"STR_CAPTAIN_DUMBASS"});
const priest=routeContext(data,{captain:"STR_CAPTAIN_PRIEST"});
const thief=routeContext(data,{captain:"STR_CAPTAIN_THIEF"});
assert(dumb.disabledBy.get("STR_CAPTAIN_PUSSY")?.has("STR_CAPTAIN_DUMBASS"));
assert(thief.completed.has("STR_CAPTAIN_PUSSY_UP"));
assert(route("STR_CAPTAINS_11",{captain:"STR_CAPTAIN_DUMBASS"}).blocked,
  "Non-thief must not access Captain's 11 via the zero-dependency research flag");
for(const captain of captains.filter(id=>!["STR_CAPTAIN_PUSSY","STR_CAPTAIN_THIEF"].includes(id))){
  const a=route("STR_CAPTAINS_11",{captain});
  assert(a.blocked,"Captain's 11 was wrongly allowed for "+captain);
  assert(a.blockers.some(b=>["exclusive-event","disabled-research","event-grant-blocked"].includes(b.kind)),captain);
}
assert(!route("STR_CAPTAINS_11",{captain:"STR_CAPTAIN_THIEF"}).blocked,
  "Thief still needs event conditions and tokens, but is not route-excluded");
assert(!route("STR_CAPTAINS_11",{captain:"STR_CAPTAIN_THIEF",extra:"STR_CAPTAINS_11"}).blocked,
  "Already completed Captain's 11 research must not be blocked by its own one-time event's false trigger");
assert(!route("STR_CAPTAINS_11",{captain:"STR_CAPTAIN_PUSSY"}).blocked,
  "Undecided PUSSY captain may still select Thief; do not preemptively exclude");
assert(!route("STR_CAPTAINS_11",{}).blocked,"Unknown captain must not be assumed to be non-Thief");
const gate=eventAccess(captainEvent,dumb,data.researchGraph,data.researchEventRoutes);
assert(gate.impossible,"Captain's 11 event must be closed by DUMBASS");
assert(gate.paths.flatMap(s=>s.blocked).some(b=>b.disabledBy.includes("STR_CAPTAIN_DUMBASS")),
  "Expected evidence path to the disabled parent captain research");
assert(!eventAccess(captainEvent,thief,data.researchGraph,data.researchEventRoutes).impossible);
assert(route("STR_BREAD_AND_FISHES_TRAINING",{captain:"STR_CAPTAIN_DUMBASS"}).blocked,
  "Priest-only training cannot be available to DUMBASS");
assert(!route("STR_BREAD_AND_FISHES_TRAINING",{captain:"STR_CAPTAIN_PRIEST"}).blocked);
assert(route("STR_MILITARY_DRILL_TRAINING",{captain:"STR_CAPTAIN_PRIEST"}).blocked);
assert(route("STR_PURE_MAIDEN_TRAINING",{path:"STR_PEASANT_REVOLUTION_PREQ"}).blocked,
  "Peasant route expressly disables Maiden training");
assert(!route("STR_PURE_MAIDEN_TRAINING",{path:"STR_CAT_PATH_PREQ"}).blocked,
  "Cat route must not inherit competing Peasant research by assuming all nominal dependencies completed");
assert(!route("STR_PURE_MAIDEN_TRAINING",{path:"STR_HYBRID_PATH_PREQ"}).blocked,
  "Hybrid route must not inherit competing Peasant's exclusive penalty");
assert(!route("STR_MILITARY_DRILL_TRAINING",{captain:"STR_CAPTAIN_RULER"}).blocked);
assert(!route("STR_CHARMY_DANCE_TRAINING",{captain:"STR_CAPTAIN_DUMBASS"}).blocked);
// Charmy relies on tournament/event grants with multiple possible paths: do not
// declare a hard route closure until its event-chain exclusivity is proven.
const unknown=route("STR_CAPTAINS_11",{});
const reopened=routeContext({researchGraph:{
  "A":{disables:["X"],reenables:[]},
  "B":{disables:[],reenables:["X"]},
  "X":{disables:[],reenables:[]}
},routeChoices:[{id:"captain",choices:[{id:"A"}]},{id:"path",choices:[{id:"B"}]}]},
  {captain:"A",path:"B"});
assert(!reopened.disabledBy.has("X"),"Reenabled research cannot be treated as permanently blocked");
const unresolved=routeContext(data,{captain:"STR_CAPTAIN_DUMBASS",extra:"STR_UNKNOWN_RESEARCH"});
assert(unresolved.unknownIds.includes("STR_UNKNOWN_RESEARCH"),"Unknown research IDs must remain visible");
assert(unknown.unresolved.some(x=>x.type==="item")&&unknown.eventGates.length,
  "Unknown/unproven conditions must be visible instead of treated as already owned");
const routeSamples=[{}];
for(const group of data.routeChoices)for(const choice of group.choices)
  routeSamples.push({[group.id]:choice.id});
let checked=0,excluded=0;
for(const choices of routeSamples){
  const context=routeContext(data,choices);
  for(const t of data.transformations){
    const result=trainingRouteAccess(t,context,data);
    checked++;
    if(result.blocked){
      excluded++;
      assert(result.blockers.length,"Hard block has no explainable cause: "+t.id);
      for(const block of result.blockers)
        assert(data.researchGraph[block.researchId],"Blocker has unknown research: "+block.researchId);
    }
    for(const root of t.researchRoots)assert(data.researchGraph[root],t.id+" root is missing "+root);
    for(const item of t.requiredItems)assert(data.itemSources[item.id],t.id+" item source missing "+item.id);
  }
}
assert.equal(checked,routeSamples.length*83);
assert(excluded>0,"All route exclusions unexpectedly disappeared");
console.log("OK training route provenance: "+checked+" combinations for "+
  routeSamples.length+" route states, "+excluded+" proven blockers; "+
  "16 event chunks, sole joint research/item source, "+captains.length+
  " captain choices, event-to-captain chain, priest/ruler/peasant/cat/reenable cross-route locks");
