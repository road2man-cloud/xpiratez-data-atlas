// Lightweight, deterministic event provenance sidecar for training/branch decisions.
// Reads existing derived event chunks only. No ruleset files or authored probabilities.
import fs from "node:fs";
import zlib from "node:zlib";
import path from "node:path";
import assert from "node:assert/strict";

const base=path.resolve("public/data");
const training=JSON.parse(fs.readFileSync(path.join(base,"trainings-index.json"),"utf8"));
const neededResearch=new Set(training.transformations.flatMap(x=>x.researchRoots||[]));
neededResearch.add("STR_CAPTAIN_SAINT");
const interestedItems=new Set(["STR_ROGUE_CLONE","STR_ORTHODOX_MAGE_DAMSEL"]);
const researchEvents={},itemEvents={};
const eventDetails=[];
for(const bucket of "0123456789abcdef") {
  const file=path.join(base,"event-chunks",bucket+".json.gz");
  const chunk=JSON.parse(zlib.gunzipSync(fs.readFileSync(file)));
  eventDetails.push(...Object.values(chunk.details||{}));
}
function scripts(e){
  return(e.scripts||[]).map(s=>({
    id:s.id,conditions:s.conditions||{},
    researchTriggers:Object.fromEntries((s.triggerMaps?.researchTriggers||[]).map(x=>[x.id,x.value])),
    itemTriggers:Object.fromEntries((s.triggerMaps?.itemTriggers||[]).map(x=>[x.id,x.value])),
    eventWeights:(s.eventWeights||[]).map(x=>({
      month:Number(x.bucket),selectionWeight:x.entries.find(v=>v.eventId===e.id)?.weight||0,
      totalWeight:x.totalWeight
    })).filter(x=>x.selectionWeight>0),
    oneTimeRandom:(s.oneTimeRandomEvents?.entries||[]).some(x=>x.eventId===e.id),
    oneTimeSequential:(s.oneTimeSequentialEvents||[]).includes(e.id)
  }));
}
for(const e of eventDetails){
  const event={id:e.id,koName:e.koName,scripts:scripts(e)};
  for(const reward of e.effects?.researchRewards||[]){
    if(!neededResearch.has(reward.id))continue;
    (researchEvents[reward.id]||=[]).push(event);
  }
  const items=[
    ...(e.effects?.guaranteedItems||[]).map(x=>({id:x.id,kind:"guaranteed",qty:x.qty})),
    ...(e.effects?.randomItems?.list||[]).map(x=>({id:x.id,kind:"random",weight:x.weight,totalWeight:e.effects.randomItems.totalWeight}))
  ];
  for(const item of items){
    if(!interestedItems.has(item.id))continue;
    (itemEvents[item.id]||=[]).push({...event,reward:item});
  }
}
for(const bucket of Object.values(researchEvents))bucket.sort((a,b)=>a.id.localeCompare(b.id));
for(const bucket of Object.values(itemEvents))bucket.sort((a,b)=>a.id.localeCompare(b.id));
assert(researchEvents.STR_CAPTAINS_11?.some(e=>e.scripts.some(s=>s.researchTriggers.STR_CAPTAIN_THIEF===true)),
  "Captain's 11 must have a Thief-only source event");
assert(researchEvents.STR_CAPTAIN_SAINT?.some(e=>e.scripts.some(s=>s.researchTriggers.STR_CAPTAIN_PUSSY===false)),
  "Saint must reject Pussy captain");
assert(itemEvents.STR_ROGUE_CLONE?.some(e=>e.scripts.some(s=>s.researchTriggers.STR_CAPTAIN_SAINT===true)));
assert(itemEvents.STR_ROGUE_CLONE?.some(e=>e.scripts.some(s=>s.researchTriggers.STR_CAPTAIN_DUMBLAZY===true)));
assert(itemEvents.STR_ORTHODOX_MAGE_DAMSEL?.some(e=>
  e.scripts.some(s=>s.researchTriggers.STR_CAPTAIN_DUMBASS===true&&s.researchTriggers.STR_CAPTAIN_SAINT===true)));
assert(itemEvents.STR_ORTHODOX_MAGE_DAMSEL?.some(e=>
  e.scripts.some(s=>s.researchTriggers.STR_CAPTAIN_JACKLAZY===true&&s.researchTriggers.STR_CAPTAIN_PUSSY_UP===true)));
const out={
  meta:{source:"published event-chunks from original v.o1.1.1 rules",
    ruleSha256:training.meta.sha256,events:eventDetails.length},
  researchEvents,itemEvents
};
const dest=path.join(base,"training-access.json");
fs.writeFileSync(dest,JSON.stringify(out));
console.log("Built "+dest+": "+Object.keys(researchEvents).length+" training research reward IDs, "+
 Object.keys(itemEvents).length+" recruitment item IDs, "+eventDetails.length+" events");
