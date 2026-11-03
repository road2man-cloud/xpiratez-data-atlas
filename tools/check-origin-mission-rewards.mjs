// X-Piratez v.o2 deployments grant these eight cost-zero flags on mission
// SUCCESS. Never manufacture a specimen or grant the flag at mission spawn.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {foundationWorld,applyOriginWitnessStep,replayOriginWitness} from '../public/soldiers/modern/origin-witness.js';
import {createFoundationResearchPlanner} from '../public/soldiers/modern/foundation-research-planner.js';
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const data=read('public/data/soldiers-modern-index.json');
const catalog=read('public/data/soldier-source-catalog.json');
const source=data.meta.source.rules.find(x=>x.file==='Piratez_Factions.rul');
assert(source?.sha256==='c9f8952071a43777b6530cf5fd204d8cb9d4dd5138ee03d31cb85479307a7f95');
assert.deepEqual(data.meta.source.rules,catalog.sourceHashes);
const awards=[
  'STR_LOC_TAVERN_CELLAR_DONE','STR_HOT_PURSUITS_DONE','STR_NINJA_ESCALATION_3',
  'STR_MONSTER_HUNT_PRIMAL_WEREWOLF_DONE','STR_MONSTER_HUNT_PRIMAL_BULLFROG_DONE',
  'STR_MONSTER_HUNT_PRIMAL_SHAMBLER_DONE','STR_MONSTER_HUNT_PRIMAL_COCKROACH_DONE',
  'STR_QUEEN_SAVAGE'
];
for(const id of awards){
  assert.equal(data.researchRules[id]?.cost,0);
  assert.equal(data.researchRules[id]?.needItem,true);
  assert(data.missionResearchSources[id]?.some(s=>s.reward==='mission-success'&&s.scripts.length),
    'Missing source-grounded success-only mission source: '+id);
}
const step={type:'missionResearch',deployment:'STR_LOC_HOT_PURSUITS',
  script:'HotPursuits',research:'STR_HOT_PURSUITS_DONE',assumeOutcome:true};
const world=foundationWorld();
world.researched.add('STR_COMMUNICATIONS');
world.month=7;
const accepted=applyOriginWitnessStep(world,step,data);
assert(accepted.ok,accepted.reason);
assert(accepted.assumed,'Mission victory must not be certified as guaranteed');
assert(accepted.world.researched.has(step.research));
assert(!world.researched.has(step.research),'Simulation cannot mutate input state');
assert(accepted.world.completedMissions.has(step.deployment));
const late=applyOriginWitnessStep(world,{...step,assumeOutcome:false},data);
assert(!late.ok,'A mission site cannot automatically award victory research');
const before=structuredClone(world);before.month=6;
assert(!applyOriginWitnessStep(before,step,data).ok,'First-month trigger is mandatory');
const missing=foundationWorld();missing.month=7;
assert(!applyOriginWitnessStep(missing,step,data).ok,'Mission research gate is mandatory');
assert(!applyOriginWitnessStep(world,{...step,deployment:'FAKE_MISSION'},data).ok);
assert(!applyOriginWitnessStep(world,{...step,script:'FAKE_SCRIPT'},data).ok);
assert(!applyOriginWitnessStep(accepted.world,step,data).ok,'Victory reward must not be reused');
const disabled=structuredClone(world);disabled.disabled.add(step.research);
assert(!applyOriginWitnessStep(disabled,step,data).ok,'Disabled reward cannot be injected');
data.sourceItemIds=new Set(catalog.itemIds);
for(const id of awards){
  const planner=createFoundationResearchPlanner(data,{maxAttempts:1400,maxDepth:54,maxSteps:560});
  const reached=planner.ensure([id]);
  assert(reached.ok,'Mission reward was never reached chronologically: '+id+' '+reached.reason);
  assert(reached.node.world.researched.has(id),'Success reward not granted: '+id);
  assert(reached.node.steps.some(s=>s.type==='missionResearch'&&s.research===id),
    'Research was claimed without an actual mission-success step: '+id);
  const full=replayOriginWitness(reached.node.steps,data);
  assert(full.ok,full.reason);
  assert(full.conditional,'A chosen mission win must remain conditional');
  assert(full.world.researched.has(id));
}
console.log('PASS eight source-hashed mission-success research rewards mapped from actual v.o2 deployment/script pairs');
console.log('PASS all eight mission-reward paths generated chronologically from zero research and independently replayed');
console.log('PASS explicit mission-win assumption, research and month gates, disabled topics, duplicate and forged mission refusals');
