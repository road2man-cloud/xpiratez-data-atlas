import assert from 'node:assert/strict';
import fs from 'node:fs';
import {decodeOriginReport} from './origin-report-codec.mjs';
import {classifyResearchSupplyGap} from '../public/soldiers/modern/research-supply-gap.js';

const data=JSON.parse(fs.readFileSync('public/data/soldiers-modern-index.json','utf8'));
const catalog=JSON.parse(fs.readFileSync('public/data/soldier-source-catalog.json','utf8'));
const report=decodeOriginReport(fs.readFileSync('public/data/soldier-origin-candidates.json','utf8'));
assert.equal(data.meta.mod.version,'v.o2');
assert.deepEqual(data.meta.source.rules,catalog.sourceHashes);
const opts={itemIds:catalog.itemIds,itemSupply:data.itemSupply,eventResearchSources:data.eventResearchSources,missionResearchSources:data.missionResearchSources};
const questFlags=[
 'STR_LOC_TAVERN_CELLAR_DONE','STR_HOT_PURSUITS_DONE','STR_NINJA_ESCALATION_3',
 'STR_MONSTER_HUNT_PRIMAL_WEREWOLF_DONE','STR_MONSTER_HUNT_PRIMAL_BULLFROG_DONE',
 'STR_MONSTER_HUNT_PRIMAL_SHAMBLER_DONE','STR_MONSTER_HUNT_PRIMAL_COCKROACH_DONE',
 'STR_QUEEN_SAVAGE'
];
for(const id of questFlags){
  const rule=data.researchRules[id];
  assert.equal(rule?.needItem,true);
  assert.equal(rule.cost,0);
  assert(!catalog.itemIds.includes(rule.neededItem||id));
  const gap=classifyResearchSupplyGap(id,rule,opts);
  assert.equal(gap.kind,'MISSION_SUCCESS_REWARD_CONDITIONAL',id);
  assert.equal(gap.neededItem,rule.neededItem||id);
  assert(gap.missions?.some(x=>x.deployment&&x.scripts.length),'Missing mission spawn evidence');
  const withoutMission=classifyResearchSupplyGap(id,rule,
    {...opts,missionResearchSources:{}});
  assert.equal(withoutMission.kind,'UNBACKED_SAMPLE_TOKEN',
    'Only exact source evidence can remove an unbacked-sample diagnostic');
}
const first=classifyResearchSupplyGap('STR_FIRST_CYCLE',{cost:0,needItem:false},opts);
assert.equal(first.kind,'AUTO_QUEUE_SOURCE_UNVERIFIED');
assert.notEqual(classifyResearchSupplyGap('STR_HAVE_REAL_ITEM',
 {cost:10,needItem:true,neededItem:'STR_ITEM_PRESENT'},
 {...opts,itemIds:['STR_ITEM_PRESENT']}).kind,'UNBACKED_SAMPLE_TOKEN');
assert.equal(classifyResearchSupplyGap('STR_UNKNOWN',null,opts).kind,'RULE_NOT_INDEXED');
const unresolved=report.records.filter(x=>!x.candidates.length);
for(const row of unresolved)
  assert(row.researchBottlenecks?.length,'Missing chronology evidence: '+row.profileId);
assert.equal(report.summary.unresolved,unresolved.length);
assert.equal(report.summary.certifiedMaxima,0);
assert(report.summary.witnesses>=4123,
  'Previously replayed valid candidates must remain (one cross-country start was rejected)');
console.log('PASS all '+questFlags.length+
  ' v.o2 zero-cost missing-item flags trace to exact mission-win rewards and mission spawn scripts; no phantom supplies');
console.log('PASS '+unresolved.length+
  ' remaining origins retain explicit chronology bottlenecks without fabricated research completion');
