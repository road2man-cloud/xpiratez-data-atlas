// Acquisition provenance regression for ALL v.o2 registered birth sources.
// Source indexing is not proof that an event always occurs or the materials
// are obtainable in every campaign. Keep distinct birth histories distinct.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {acquisitionPaths,renderAcquisitionPaths} from '../public/soldiers/modern/acquisition-paths.js';
const data=JSON.parse(fs.readFileSync('public/data/soldiers-modern-index.json','utf8'));
assert.equal(data.meta.mod.version,'v.o2');
assert.equal(data.profiles.length,72);
const allBirthItems=[...new Set(data.profiles.flatMap(p=>Object.keys(p.acquisitionRequiredItems||{})))];
assert(allBirthItems.length>=68);
assert(allBirthItems.every(id=>data.itemSupply?.[id]),'Every birth material needs an indexed supply record');
const ui={
  name:id=>id,fmt:n=>n==null?'—':String(n),
  esc:s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),
  node:id=>'<button data-research-node="'+id+'">'+id+'</button>'
};
for(const profile of data.profiles){
  const indexed=acquisitionPaths(profile,data);
  assert(indexed&&indexed.id===profile.id);
  assert.equal(indexed.requiredItems.length,Object.keys(profile.acquisitionRequiredItems||{}).length);
  assert.equal(indexed.requiredResearch.length,(profile.requires||[]).length);
  assert(indexed.requiredItems.every(item=>item.supply));
  const html=renderAcquisitionPaths(profile,data,ui);
  assert(html.includes('data-acquisition-profile="'+profile.id+'"'));
  assert(html.includes(profile.sourceId));
  if(profile.sourceType==='event'){
    assert(html.includes('최초 출생 이벤트의 대체 발생 조건'));
    assert(indexed.eventScripts.length>0,'Missing event spawn script: '+profile.id);
  }
}
const profile=data.profiles.find(p=>p.id==='manufacture:STR_THEBAN_ASSAULT_CLONE');
const route=acquisitionPaths(profile,data);
assert.equal(route.cost,10000);
assert.equal(route.time,1);
assert.equal(route.count,1);
assert.deepEqual(route.requiredResearch.map(r=>r.id),['STR_THEBAN_ASSAULT_CLONE_LICENSE']);
assert.deepEqual(route.requiredItems.map(r=>[r.id,r.quantity]),[['STR_THEBAN_ASSAULT_CLONE_LICENSE',1]]);
assert.equal(route.requiredResearch[0].rule.cost,3);
assert.equal(route.requiredResearch[0].rule.needItem,true);
assert.equal(route.requiredResearch[0].rule.destroyItem,false);
assert(route.requiredResearch[0].events.some(e=>e.event==='STR_REVOLUTIONARY_SPEECH_THEBES'));
const supply=route.requiredItems[0].supply;
assert.equal(supply.buyCost,125000);
assert.deepEqual(supply.buyRequires,['STR_CLEO_CHALLENGE_COMPLETED'],
  'Store research must come from item.requiresBuy, not item.requires');
assert.deepEqual(supply.generalRequires,[],'Unrelated general item gates stay separate');
assert.deepEqual(data.researchRules.STR_CLEO_CHALLENGE_COMPLETED.dependencies,[
  'STR_CLEO_CHALLENGE','STR_MONSTER_HUNT_PRIMAL_WEREWOLF_DONE',
  'STR_MONSTER_HUNT_PRIMAL_BULLFROG_DONE','STR_MONSTER_HUNT_PRIMAL_SHAMBLER_DONE',
  'STR_MONSTER_HUNT_PRIMAL_COCKROACH_DONE'
],'All five completion prerequisites must be retained as AND gates');
const egypt=supply.eventGrants.find(e=>e.event==='STR_START_COUNTRY_EGYPT_EVENT');
assert(egypt);
assert.equal(egypt.grants.find(g=>g.mode==='everyMulti')?.count,12);
assert(egypt.scriptRoutes.some(s=>s.countryPositive.includes('STR_EGYPT')&&
  s.firstMonth===0&&s.lastMonth===0));
const thebes=supply.eventGrants.find(e=>e.event==='STR_REVOLUTIONARY_SPEECH_THEBES');
assert(thebes);
assert.equal(thebes.grants.find(g=>g.mode==='every')?.count,3,
  'The v.o2 speech deliberately lists the assault clone license 3 times');
assert(thebes.directResearchAwards.includes('STR_THEBAN_ASSAULT_CLONE_LICENSE'),
  'The speech must award the license research as well as license items');
assert.deepEqual(thebes.scriptRoutes.map(s=>s.script).sort(),
  ['STR_PROPAGANDA_1','STR_PROPAGANDA_2','STR_PROPAGANDA_3','STR_PROPAGANDA_4']);
const e1=thebes.scriptRoutes.find(s=>s.script==='STR_PROPAGANDA_1');
assert(e1.researchPositive.includes('STR_PEASANT_REVOLUTION'));
assert(e1.researchNegative.includes('STR_THE_GREAT_CAUSE'));
const e2=thebes.scriptRoutes.find(s=>s.script==='STR_PROPAGANDA_2');
assert(e2.researchPositive.includes('STR_PROPAGANDA'));
const e3=thebes.scriptRoutes.find(s=>s.script==='STR_PROPAGANDA_3');
assert(e3.facilityPositive.includes('STR_WAR_BARRACKS'));
const e4=thebes.scriptRoutes.find(s=>s.script==='STR_PROPAGANDA_4');
assert(e4.researchPositive.includes('STR_PERSUASION'));
assert(thebes.scriptRoutes.every(s=>s.executionOdds===23));
assert(route.matchingHistory.some(p=>p.id==='manufacture:STR_ROGUE_CLONE_RECRUITMENT'));
assert(route.matchingHistory.some(p=>p.id==='manufacture:STR_THEBAN_ASSAULT_CATGIRL_RECRUITMENT'));
const html=renderAcquisitionPaths(profile,data,ui);
assert(html.includes('구매: 125000 / 1개'));
assert(html.includes('상점 판매 해금 연구:'));
assert(html.includes('data-trace-research-root="STR_CLEO_CHALLENGE_COMPLETED"'));
for(const prerequisite of data.researchRules.STR_CLEO_CHALLENGE_COMPLETED.dependencies)
  assert(html.includes(prerequisite),'Missing clickable upstream research '+prerequisite);
assert(html.includes('3개 고정'));
assert(html.includes('12개 고정'));
for(const id of ['STR_PROPAGANDA_1','STR_PROPAGANDA_2','STR_PROPAGANDA_3','STR_PROPAGANDA_4']){
  assert(html.includes('data-script="'+id+'"'));
}
assert(html.includes('data-open-origin="manufacture:STR_ROGUE_CLONE_RECRUITMENT"'));
assert(html.includes('data-open-origin="manufacture:STR_THEBAN_ASSAULT_CATGIRL_RECRUITMENT"'));
assert(!html.includes('획득 확정입니다'), 'Never overclaim a conditional event');
const zeroCostItems=allBirthItems.filter(id=>data.itemSupply[id]?.buyCost===0);
for(const id of zeroCostItems)if(data.itemSupply[id].eventGrants?.length){
  const p=data.profiles.find(x=>x.acquisitionRequiredItems?.[id]);
  const m=renderAcquisitionPaths(p,data,ui);
  assert(!m.includes('구매: 0 / 1개'),'Unknown buy source cannot become a free store purchase');
}
console.log('PASS 72 individual birth sources / '+allBirthItems.length+
  ' birth materials have source-indexed acquisition options without joining separate birth histories');
console.log('PASS assault-clone license: store 125000 locked by Cleopatra challenge completed (5 AND prerequisites), OR Egyptian start 12 OR Theban speech 3+research');
console.log('PASS different assault-clone-history variants remain separate original birth profiles');
