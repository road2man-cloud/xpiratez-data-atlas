// Genuine v.o2 sequential contact events must occur in time order.
// Knowing the same bonus research from a separate free source is NOT proof
// that the prerequisite event happened. Never replace event provenance with
// a synthetic research flag.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createFoundationResearchPlanner} from '../public/soldiers/modern/foundation-research-planner.js';
import {replayOriginWitness} from '../public/soldiers/modern/origin-witness.js';

const data=JSON.parse(fs.readFileSync('public/data/soldiers-modern-index.json','utf8'));
const catalog=JSON.parse(fs.readFileSync('public/data/soldier-source-catalog.json','utf8'));
data.sourceItemIds=new Set(catalog.itemIds);
const planner=createFoundationResearchPlanner(data,{maxAttempts:1100,maxDepth:55,maxSteps:560});
const sequence=planner.ensure(['STR_TEC_177']);
assert(sequence.ok,sequence.reason||sequence.unresolved);
const steps=sequence.node.steps;
const first=steps.findIndex(s=>s.type==='eventResearch'&&
  s.event==='STR_TEC_EVENT_FIRST_CONTACT');
const second=steps.findIndex(s=>s.type==='eventResearch'&&
  s.event==='STR_TEC_EVENT_SECOND_CONTACT');
assert(first>=0&&second>first,'First Contact must actually happen before Second Contact');
assert.equal(steps[first].research,'STR_PINUP_128');
assert.equal(steps[second].research,'STR_TEC_036');
assert(steps[first].assumeOutcome&&steps[second].assumeOutcome,
  'Random one-time events are never guaranteed');
const replay=replayOriginWitness(steps,data);
assert(replay.ok,replay.reason);
assert(replay.world.generatedEvents.STR_TEC_EVENT_FIRST_CONTACT>=1);
assert(replay.world.generatedEvents.STR_TEC_EVENT_SECOND_CONTACT>=1);
assert(replay.world.researched.has('STR_TEC_177'));
assert.equal(replay.certifiedMaximum,false);
const forged=structuredClone(steps);
forged[first].event='STR_FAKE_EVENT';
const rejected=replayOriginWitness(forged,data);
assert(!rejected.ok,'Fabricated predecessor event must never unlock a later event');
console.log('PASS v.o2 TEC first/second-contact chronology requires actual event occurrences and valid rewards');
console.log('PASS zero-research foundation -> '+steps.length+' steps -> TEC_177, conditional one-time event sequence, 0 final-certification claims');
