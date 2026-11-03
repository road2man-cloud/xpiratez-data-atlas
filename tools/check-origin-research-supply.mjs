import assert from 'node:assert/strict';
import fs from 'node:fs';
import {decodeOriginReport} from './origin-report-codec.mjs';
import {classifyResearchSupplyGap} from '../public/soldiers/modern/research-supply-gap.js';

const data=JSON.parse(fs.readFileSync('public/data/soldiers-modern-index.json','utf8'));
const catalog=JSON.parse(fs.readFileSync('public/data/soldier-source-catalog.json','utf8'));
const report=decodeOriginReport(fs.readFileSync('public/data/soldier-origin-candidates.json','utf8'));
assert.equal(data.meta.mod.version,'v.o2');
assert.deepEqual(data.meta.source.rules,catalog.sourceHashes);
const opts={itemIds:catalog.itemIds,itemSupply:data.itemSupply,eventResearchSources:data.eventResearchSources};
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
  assert.equal(gap.kind,'UNBACKED_SAMPLE_TOKEN',id);
  assert.equal(gap.neededItem,rule.neededItem||id);
  assert(gap.reason.includes('근거가 확인되기 전까지'));
}
const first=classifyResearchSupplyGap('STR_FIRST_CYCLE',{cost:0,needItem:false},opts);
assert.equal(first.kind,'AUTO_QUEUE_SOURCE_UNVERIFIED');
assert.notEqual(classifyResearchSupplyGap('STR_HAVE_REAL_ITEM',
 {cost:10,needItem:true,neededItem:'STR_ITEM_PRESENT'},
 {...opts,itemIds:['STR_ITEM_PRESENT']}).kind,'UNBACKED_SAMPLE_TOKEN');
assert.equal(classifyResearchSupplyGap('STR_UNKNOWN',null,opts).kind,'RULE_NOT_INDEXED');
let classified=0;
for(const row of report.records.filter(x=>!x.candidates.length)){
  assert(row.researchBottlenecks?.length, 'Missing provenance on '+row.profileId);
  for(const gap of row.researchBottlenecks){
    if(!questFlags.includes(gap.id))continue;
    const expected=classifyResearchSupplyGap(gap.id,data.researchRules[gap.id],opts);
    assert.equal(gap.kind,expected.kind);
    assert.equal(gap.reason,expected.reason);
    classified++;
  }
}
assert(classified>=5,'Expected at least five source-grounded quest-style research supply gaps');
assert.equal(report.summary.certifiedMaxima,0);
assert(report.summary.witnesses>=154,'Another agent may add valid witnesses; do not freeze the witness count');
console.log('PASS unresolved research provenance: '+questFlags.length+
  ' 2.1 cost-zero needItem flags have no item rule, mission/event evidence needed; no phantom supplies');
console.log('PASS '+classified+' recorded source-gap instances, exact original ID, no fake maxima or path success');
