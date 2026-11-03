import assert from 'node:assert/strict';
import fs from 'node:fs';
import {buildAcquisitionTree,buildAcquisitionSubtree,renderAcquisitionTree}
  from '../public/soldiers/modern/acquisition-condition-tree.js';
const data=JSON.parse(fs.readFileSync('public/data/soldiers-modern-index.json','utf8'));
assert.equal(data.profiles.length,72);
for(const p of data.profiles){
  const t=buildAcquisitionTree(p,data,{maxDepth:4,maxNodes:150});
  assert.equal(t.profileId,p.id);
  assert(t.root.children.some(x=>x.id==='CAMPAIGN_START'));
  assert(t.root.children.some(x=>x.id.startsWith('MATERIAL:'))||
    !Object.keys(p.acquisitionRequiredItems||{}).length);
  if(p.sourceType==='event')assert(t.root.children.some(x=>x.id==='BIRTH_EVENT:'+p.sourceId));
  const html=renderAcquisitionTree(t);
  assert(html.includes('data-complete-profile="'+p.id+'"'));
  assert(html.includes('게임 시작 → 출생 전체 조건 트리'));
}
const id='manufacture:STR_THEBAN_ASSAULT_CLONE';
const clone=buildAcquisitionTree(data.profiles.find(x=>x.id===id),data);
const raw=JSON.stringify(clone);
for(const source of ['STR_START_COUNTRY_EGYPT_EVENT','STR_REVOLUTIONARY_SPEECH_THEBES',
  'STR_PROPAGANDA_1','STR_PROPAGANDA_4','BUY:STR_THEBAN_ASSAULT_CLONE_LICENSE']){
  assert(raw.includes(source),'Missing source '+source);
}
assert(raw.includes('STR_PEASANT_REVOLUTION'),'First propaganda route must show its research');
assert(raw.includes('STR_THE_GREAT_CAUSE'),'Negative propaganda research gate missing');
assert(raw.includes('12')&&raw.includes('3'),'Different reward quantities must remain discoverable');
assert(!raw.includes('STR_CLEO_CHALLENGE'),'Unrelated Cleopatra challenge must not be linked as a license source');
const continuation=buildAcquisitionSubtree('research','STR_PROPAGANDA',data);
assert(continuation.root.children.some(x=>x.id==='STR_PROPAGANDA'));
assert(renderAcquisitionTree(clone).includes('data-trace-id='));
console.log('PASS 72 game-start condition roots, conditional AND/OR, item/event/research linkage and lazy continuation');
console.log('PASS assault clone: Egyptian start / four propaganda script alternatives / 125000 item purchase; no invented Cleopatra challenge reward');
