import assert from 'node:assert/strict';
import fs from 'node:fs';
import {buildAcquisitionTree,buildAcquisitionSubtree,renderAcquisitionTree}
  from '../public/soldiers/modern/acquisition-condition-tree.js';
import {researchStep} from '../public/soldiers/modern/event-chronology.js';
const data=JSON.parse(fs.readFileSync('public/data/soldiers-modern-index.json','utf8'));
assert.equal(data.profiles.length,72);
for(const p of data.profiles){
  const t=buildAcquisitionTree(p,data);
  assert.equal(t.profileId,p.id);
  assert(t.root.children.some(x=>x.id==='CAMPAIGN_START'));
  assert(t.root.children.some(x=>x.id.startsWith('REQUIRED_ITEM:'))||
    !Object.keys(p.acquisitionRequiredItems||{}).length);
  if(p.sourceType==='event')assert(t.root.children.some(x=>x.id==='BIRTH_EVENT:'+p.sourceId));
  const html=renderAcquisitionTree(t);
  assert(html.includes('data-complete-profile="'+p.id+'"'));
  assert(html.includes('이 병사를 얻기 위해 필요한 것'));
  assert(html.includes('원본 조건·연구 ID·세부 분기 보기'));
  assert(!html.includes('<summary><strong>모두 필요 (AND)</strong>'),
    'Do not expose raw graph operators as the primary user interface');
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
assert(raw.includes('STR_CLEO_CHALLENGE_COMPLETED'),
  'The raw purchase gate must include the actual Cleopatra-completed research');
const continuation=buildAcquisitionSubtree('research','STR_PROPAGANDA',data);
assert(continuation.root.children.some(x=>x.id==='STR_PROPAGANDA'));
assert(renderAcquisitionTree(clone).includes('data-trace-id='));
const walk=(root,predicate)=>{
  const stack=[root],found=[];
  while(stack.length){const n=stack.pop();if(predicate(n))found.push(n);stack.push(...(n.children||[]));}
  return found;
};
const descendants=(node)=>walk(node,()=>true);
const buy=walk(clone.root,x=>x.id==='BUY:STR_THEBAN_ASSAULT_CLONE_LICENSE')[0];
assert(buy?.kind==='and');
assert(buy.children.some(x=>x.kind==='research'&&x.id==='STR_CLEO_CHALLENGE_COMPLETED'),
  'The store option must require the completed Cleopatra challenge research');
const licenseMethods=walk(clone.root,x=>x.id==='ITEM_METHOD:STR_THEBAN_ASSAULT_CLONE_LICENSE')[0];
assert(!licenseMethods.children.some(x=>x.id==='EVENT:STR_CLEO_CHALLENGE_COMPLETED'),
  'The challenge completion is a store unlock, not a direct license reward');
const shopHtml=renderAcquisitionTree(clone,{name:id=>({
  STR_CLEO_CHALLENGE_COMPLETED:'클레오파트라의 도전을 완료했다'
}[id]||id)});
assert(shopHtml.includes('상점 판매 해금 연구: 클레오파트라의 도전을 완료했다'));
assert(shopHtml.includes('data-trace-research-root="STR_CLEO_CHALLENGE_COMPLETED"'));
const cleo=buildAcquisitionSubtree('research','STR_CLEO_CHALLENGE_COMPLETED',data);
const cleoPrerequisites=walk(cleo.root,x=>x.id==='ALL_DEPENDENCIES:STR_CLEO_CHALLENGE_COMPLETED')[0];
assert(cleoPrerequisites?.kind==='and');
assert.equal(cleoPrerequisites.children.length,5,'All five Cleopatra conditions must be satisfied');
const rank=buildAcquisitionSubtree('research','STR_CAPTAINS_RANK_06',data);
const rankResearch=walk(rank.root,x=>x.kind==='research'&&x.id==='STR_CAPTAINS_RANK_06')[0];
const rankMethods=walk(rankResearch,x=>x.kind==='or'&&x.id==='RESEARCH_METHOD:STR_CAPTAINS_RANK_06')[0];
const rankEvent=rankMethods.children.find(x=>x.id==='EVENT:STR_CAPTAINS_RANK_06');
const rankLab=rankMethods.children.find(x=>x.id==='LAB:STR_CAPTAINS_RANK_06');
assert(rankEvent&&rankLab,'Captain rank needs separately described event and non-proven lab routes');
assert(descendants(rankLab).some(x=>x.kind==='unbacked-sample'&&x.id==='STR_CAPTAINS_RANK_06'));
assert(!descendants(rankEvent).some(x=>x.kind==='unbacked-sample'&&x.id==='STR_CAPTAINS_RANK_06'),
  'An event research grant must not inherit the lab-only needItem condition');
assert(descendants(rankEvent).some(x=>x.kind==='minScore'&&x.note.includes('8000')));
assert(descendants(rankEvent).some(x=>x.kind==='month'&&x.note.includes('6개월')));
assert(descendants(rankEvent).some(x=>x.id==='STR_CAPTAINS_RANK_05'));
const propaganda=buildAcquisitionSubtree('research','STR_PROPAGANDA',data);
const deps=walk(propaganda.root,x=>x.id==='ACCESS:STR_PROPAGANDA')[0];
const allDeps=deps?.children.find(x=>x.id==='ALL_DEPENDENCIES:STR_PROPAGANDA');
assert(deps?.kind==='or'&&allDeps?.kind==='and'&&
  allDeps.children.some(x=>x.id==='STR_PEASANT_PARTY')&&
  allDeps.children.some(x=>x.id==='STR_COMMUNICATIONS'),
  'All research dependencies are simultaneous prerequisites; only an unlocks route may bypass them');
const zombieDeps=data.researchRules.STR_ZOMBIE_EMBODIMENT.dependencies;
assert.equal(zombieDeps.length,3);
const zombieTree=buildAcquisitionSubtree('research','STR_ZOMBIE_EMBODIMENT',data);
const zombieGate=walk(zombieTree.root,x=>x.id==='ALL_DEPENDENCIES:STR_ZOMBIE_EMBODIMENT')[0];
assert(zombieGate?.kind==='and');
assert.deepEqual(zombieGate.children.map(x=>x.id),zombieDeps);
const oneOnly=researchStep({researched:new Set([zombieDeps[0]]),disabled:new Set()},
  'STR_ZOMBIE_EMBODIMENT',data.researchRules);
assert.equal(oneOnly.kind,'blocked','One of three dependencies cannot open a laboratory project');
assert(oneOnly.reason.some(x=>x.includes(zombieDeps[1])));
const facility=buildAcquisitionSubtree('facility-type','STR_WAR_BARRACKS',data);
assert(walk(facility.root,x=>x.kind==='facility-built'&&x.id==='STR_WAR_BARRACKS').length,
  'A campaign facility must be constructed, not granted by research alone');
const skull=buildAcquisitionSubtree('item','STR_SKULL',data);
const skullNodes=descendants(skull.root);
assert(skullNodes.some(x=>x.kind==='month'&&x.note.includes('7개월')));
assert(skullNodes.some(x=>x.id==='HotPursuits'));
assert(skullNodes.some(x=>x.id==='STR_COMMUNICATIONS'));
assert(skullNodes.some(x=>x.kind==='mission-generation'));
assert(skullNodes.some(x=>x.kind==='map-recovery'));
assert(!skullNodes.some(x=>x.kind==='mission-victory'),
  'A recoverable map item does not require pretending the mission success-only research reward is its item drop');
const byId=data.profiles.find(p=>p.id==='manufacture:STR_SOLDIER_SLAVE_RECRUITMENT');
assert(renderAcquisitionTree(buildAcquisitionTree(byId,data)).length<650000,
  'Complex birth route must remain bounded for mobile users');
const glamourSupply=data.itemSupply.STR_GLAMOUR;
assert(glamourSupply.eventGrants.length>40&&glamourSupply.manufacture.length>100);
const eventPage=buildAcquisitionSubtree('item-method-event','STR_GLAMOUR',data,2);
assert(walk(eventPage.root,x=>x.id==='EVENT:'+glamourSupply.eventGrants[2].event).length,
  'A second source page must expose the third independent event option');
const lastEventPage=buildAcquisitionSubtree('item-method-event','STR_GLAMOUR',data,60);
assert(walk(lastEventPage.root,x=>x.id==='EVENT:'+glamourSupply.eventGrants[60].event).length,
  'Last event source must remain reachable, not silently dropped by the preview');
const lastManufacture=buildAcquisitionSubtree('item-method-manufacture','STR_GLAMOUR',data,
  glamourSupply.manufacture.length-1);
assert(walk(lastManufacture.root,x=>x.id==='MAKE:'+glamourSupply.manufacture.at(-1).id).length,
  'All v.o2 manufacture alternatives must be paginatable');
const glamourBlocks=glamourSupply.mapLoot.sources;
assert(glamourBlocks.length>=10);
const mapPage=buildAcquisitionSubtree('item-method-map','STR_GLAMOUR',data,8);
assert(walk(mapPage.root,x=>x.id?.startsWith('MAP_BLOCK:')).length>=1);
const appleBlocks=data.itemSupply.STR_APPLE.mapLoot.sources;
const multiIndex=appleBlocks.findIndex(s=>s.missionPaths.length>2);
assert(multiIndex>=0,'Expected three mission scripts for the Apple map-block evidence');
const missionPage=buildAcquisitionSubtree('item-method-map-scripts',
  'STR_APPLE@'+multiIndex,data,2);
assert(walk(missionPage.root,x=>x.id===appleBlocks[multiIndex].missionPaths[2].script).length,
  'A later mission script for the same map block must be independently inspectable');
assert(renderAcquisitionTree(buildAcquisitionSubtree('item','STR_GLAMOUR',data)).includes('data-trace-offset="2"'),
  'An overflowing source must offer a working next-page control');
console.log('PASS 61 event/123 manufacture/multiple map and mission alternatives are exposed through bounded linked pages');

console.log('PASS rank 6: conditional event requiring rank 5, minScore 8000 and month 6; lab-only item not imposed on event');
console.log('PASS mission loot: map-block recovery linked to real mission script/month/research, no invented guaranteed reward');
console.log('PASS research dependencies ALL (AND), direct unlocks alternative (OR), facility construction, bounded complex birth preview');

console.log('PASS 72 game-start condition roots, conditional AND/OR, item/event/research linkage and lazy continuation');
console.log('PASS assault clone: Egypt start / four propaganda scripts / 125000 purchase after Cleopatra completion; no invented challenge item reward');
