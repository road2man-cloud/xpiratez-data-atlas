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
  const materials=Object.keys(p.acquisitionRequiredItems||{});
  assert.equal((html.match(/data-guide-category="material"/g)||[]).length,materials.length,
    'Every birth item must have its own readable first-level card: '+p.id);
  for(const materialId of materials){
    assert(t.root.children.some(n=>n.id==='REQUIRED_ITEM:'+materialId&&
      n.children?.[0]?.kind==='item'),'A previous expensive item must not hide '+materialId);
    if(Number(data.itemSupply[materialId]?.buyCost)>0)
      assert(html.includes('data-guide-method="BUY:'+materialId+'"'),
        'Purchase choices must remain visible even if an earlier item hits its recursion limit: '+materialId);
  }
  assert(html.length<650000,'Bounded first-level birth preview must fit mobile: '+p.id);
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
assert(shopHtml.includes('guide-purchase-dependencies" open'),
  'The five first-order Cleopatra prerequisites should be expanded by default');
assert(shopHtml.includes('일반 연구실 경로에서는 아래 연구를 모두 완료해야 합니다'));
assert(shopHtml.includes('선행 5개'));
// The source-backed first-order event gates must never be replaced by an
// exploration-budget placeholder. These four paths are OR alternatives;
// research and facilities INSIDE any one path are simultaneous requirements.
const speech=licenseMethods.children.find(x=>x.id==='EVENT:STR_REVOLUTIONARY_SPEECH_THEBES');
assert(speech?.children?.length===4);
const routes=Object.fromEntries(speech.children.map(s=>[s.id,s.sourceScript]));
assert.deepEqual(routes.STR_PROPAGANDA_1.researchPositive,['STR_PEASANT_REVOLUTION']);
assert.deepEqual(routes.STR_PROPAGANDA_1.researchNegative,['STR_THE_GREAT_CAUSE']);
assert.deepEqual(routes.STR_PROPAGANDA_2.researchPositive,['STR_PROPAGANDA']);
assert.deepEqual(routes.STR_PROPAGANDA_3.researchPositive,['STR_PROPAGANDA']);
assert.deepEqual(routes.STR_PROPAGANDA_3.facilityPositive,['STR_WAR_BARRACKS']);
assert.deepEqual(routes.STR_PROPAGANDA_4.researchPositive,['STR_PROPAGANDA','STR_PERSUASION']);
const names=JSON.parse(fs.readFileSync('public/data/soldier-source-catalog.json','utf8')).names;
const sourceBackedHtml=renderAcquisitionTree(clone,{name:id=>names[id]||id});
assert(!sourceBackedHtml.includes('아직 펼치지 않은 선행 조건'),
  'Bounded traversal must not pretend that a placeholder is a game condition');
for(const id of ['STR_PROPAGANDA_1','STR_PROPAGANDA_2','STR_PROPAGANDA_3','STR_PROPAGANDA_4'])
  assert(sourceBackedHtml.includes('data-event-script="'+id+'"'));
assert(sourceBackedHtml.includes('선전물 · 선행 경로 보기')&&
  sourceBackedHtml.includes('data-trace-research-root="STR_PROPAGANDA"')&&
  sourceBackedHtml.includes('data-trace-target-id="STR_WAR_BARRACKS"')&&
  sourceBackedHtml.includes('설득 · 선행 경로 보기'),
  'The player guide must show full direct research/facility gates without IDs');
const cleo=buildAcquisitionSubtree('research','STR_CLEO_CHALLENGE_COMPLETED',data);
const cleoPrerequisites=walk(cleo.root,x=>x.id==='ALL_DEPENDENCIES:STR_CLEO_CHALLENGE_COMPLETED')[0];
assert(cleoPrerequisites?.kind==='and');
assert.equal(cleoPrerequisites.children.length,5,'All five Cleopatra conditions must be satisfied');
// Verify that the source count describes the entire indexed supply catalog,
 // never the first two preview records or "load more" placeholders. All
 // user-visible extra pages must be directly reachable without opening IDs.
const usedMaterialIds=[...new Set(data.profiles.flatMap(p=>
  Object.keys(p.acquisitionRequiredItems||{})))];
let pagedMaterials=0;
for(const materialId of usedMaterialIds){
  const s=data.itemSupply[materialId];
  assert(s,'Missing item source catalog: '+materialId);
  const tree=buildAcquisitionSubtree('item',materialId,data);
  const item=tree.root.children.find(n=>n.kind==='item'&&n.id===materialId);
  assert(item,'Missing standalone material page '+materialId);
  const counts={
    buy:Number(s.buyCost)>0?1:0,
    event:(s.eventGrants||[]).length,
    manufacture:(s.manufacture||[]).length,
    random:(s.randomManufacture||[]).length,
    research:(s.researchGrants||[]).length,
    map:(s.mapLoot?.sources||[]).length
  };
  assert.deepEqual(item.supplyCounts,counts,'All source counts must be retained');
  const total=Object.values(counts).reduce((a,b)=>a+b,0);
  const html=renderAcquisitionTree(tree);
  if(total)assert(html.includes('data-indexed-source-count="'+total+'"'),
    'A limited preview must not masquerade as the full acquisition catalog: '+materialId);
  for(const category of ['event','manufacture','random','research','map']){
    if(counts[category]<=2)continue;
    pagedMaterials++;
    assert(html.includes('data-more-category="'+category+'"'),
      'Player guide must link to further '+category+' sources for '+materialId);
    assert(html.includes('data-trace-kind="item-method-'+category+'"'),
      'More sources must have their own reachable category: '+materialId);
  }
}
assert.equal(usedMaterialIds.length,68);
assert(pagedMaterials>48,'Expected many paginated birth supply categories');
const glamourFirst=renderAcquisitionTree(buildAcquisitionSubtree('item','STR_GLAMOUR',data));
assert(glamourFirst.includes('data-indexed-source-count="255"'),
  'Glamour must not be misreported as merely the first-page options');
const glamourNext=renderAcquisitionTree(buildAcquisitionSubtree(
  'item-method-event','STR_GLAMOUR',data,2));
for(const row of data.itemSupply.STR_GLAMOUR.eventGrants.slice(2,8))
  assert(glamourNext.includes('data-guide-method="EVENT:'+row.event+'"'),
    'Continuation must include each independent event source');
assert(glamourNext.includes('data-more-category="event"')&&
  glamourNext.includes('data-trace-offset="8"'),
  'Next event source page must remain reachable from its readable card');
const glamourMap=renderAcquisitionTree(buildAcquisitionSubtree(
  'item-method-map','STR_GLAMOUR',data,2));
assert(glamourMap.includes('data-more-category="map"'),
  'Map source continuations must be visible outside the raw evidence tree');
const amountGuide=(profileId)=>renderAcquisitionTree(buildAcquisitionTree(
  data.profiles.find(x=>x.id===profileId),data));
const glamourNeed=amountGuide('manufacture:STR_GLAMOUR_RECRUITMENT');
assert(glamourNeed.includes('data-required-quantity="250"'),
  'Requested birth material quantity must propagate to the next source page');
assert(glamourNeed.includes('고정 지급 10개 / 필요 250개')&&
  glamourNeed.includes('고정 지급분 기준 240개 부족')&&
  glamourNeed.includes('고정 지급 20개 / 필요 250개')&&
  glamourNeed.includes('고정 지급분 기준 230개 부족'),
  'Mutually exclusive starting-country rewards must be independently compared');
assert(glamourNeed.includes('1회 제조 산출 24개 / 필요 250개')&&
  glamourNeed.includes('수량상 최소 11회 제조')&&
  glamourNeed.includes('반복 가능 여부'),
  'Manufacturing batch arithmetic must remain conditional on repeat feasibility');
const pageQuantity=renderAcquisitionTree(buildAcquisitionSubtree(
  'item-method-event','STR_GLAMOUR',data,2),{requiredQuantity:250});
assert(pageQuantity.includes('data-required-quantity="250"')&&
  pageQuantity.includes('고정 지급 50개 / 필요 250개')&&
  pageQuantity.includes('고정 지급분 기준 200개 부족'),
  'Follow-up event pages must retain the originating birth requirement');
assert(!renderAcquisitionTree(buildAcquisitionSubtree(
  'item-method-event','STR_GLAMOUR',data,2)).includes('data-quantity-method='),
  'Standalone source inspection must not invent a birth material quantity');
const hybridNeed=amountGuide('manufacture:STR_HYBRID_HIVER_RECRUITMENT');
assert(hybridNeed.includes('필요 50개 기준 최소 구매 50개')&&
  hybridNeed.includes('표시 가격 합계 162,500')&&
  hybridNeed.includes('실제 재고·구매 제한'),
  'Store total is simple arithmetic, not evidence of enough stock');
assert(hybridNeed.includes('무작위 생산에서 이 결과가 선택되면')&&
  hybridNeed.includes('당첨과 재시도는 보장하지 않음'),
  'Random supply must never be treated as a guaranteed inventory amount');
const standaloneLicense=renderAcquisitionTree(buildAcquisitionSubtree(
  'item','STR_THEBAN_ASSAULT_CLONE_LICENSE',data));
assert(!standaloneLicense.includes('data-quantity-method='),
  'Standalone material inspection must not silently import a birth requirement');
const cloneAmount=amountGuide('manufacture:STR_THEBAN_ASSAULT_CLONE');
assert(cloneAmount.includes('표시 가격 합계 125,000')&&
  cloneAmount.includes('고정 지급 12개 / 필요 1개')&&
  cloneAmount.includes('고정 지급 3개 / 필요 1개'),
  'Shop, Egypt and propaganda must keep separate fixed yields');
console.log('PASS '+usedMaterialIds.length+' birth materials: full source counts, '+pagedMaterials+
  ' readable continuations, quantities, shortfalls, no invented RNG or repeatability');
const pricedItems=Object.entries(data.itemSupply).filter(([,s])=>Number(s.buyCost)>0);
let researchGated=0,baseGated=0,noResearch=0;
const bootstrapCycles=[];
for(const [itemId,s] of pricedItems){
  const supplyTree=buildAcquisitionSubtree('item',itemId,data);
  const store=walk(supplyTree.root,n=>n.id==='BUY:'+itemId)[0];
  assert(store?.kind==='and','Missing original store route for '+itemId);
  const gates=[...new Set([...(s.buyRequires||[]),...(s.buyRequirements||[])])];
  assert.deepEqual(store.purchaseGateDetails.map(g=>g.id),gates,
    'Store-only requiresBuy conditions must all be present: '+itemId);
  assert.deepEqual(store.purchaseBaseFunctions,s.buyRequiresBaseFunc||[],
    'Base functions must not disappear from the purchase path: '+itemId);
  assert.equal(store.purchaseCountry,s.buyRequiresCountry||null);
  assert.deepEqual(store.purchaseGateDetails.map(g=>g.normalDependencies),
    gates.map(id=>data.researchRules[id]?.dependencies||[]),
    'The research-lab first-order dependencies must be retained: '+itemId);
  for(const gate of store.purchaseGateDetails)
    assert.equal(gate.requiresOwnPurchaseItemSpecimen,Boolean(
      data.researchRules[gate.id]?.needItem&&
      (data.researchRules[gate.id]?.neededItem||gate.id)===itemId),
    'A purchase-funded lab project must not silently self-finance its required specimen: '+itemId);
  const circular=store.purchaseGateDetails.some(g=>g.requiresOwnPurchaseItemSpecimen);
  if(circular)bootstrapCycles.push(itemId);
  const markup=renderAcquisitionTree(supplyTree);
  assert.equal(markup.includes('data-bootstrap-cycle="'+itemId+'"'),circular,
    'Only actual same-item laboratory prerequisites should receive a first-sample warning: '+itemId);
  assert(markup.includes('data-guide-method="BUY:'+itemId+'"'),
    'Purchase route must be accessible in the player guide: '+itemId);
  assert(markup.includes('실제 상점 재고와 자금은 별도 확인'),
    'A price must never imply immediate store availability: '+itemId);
  if(gates.length){
    researchGated++;
    for(const id of gates)
      assert(markup.includes('data-trace-research-root="'+id+'"'),
        'Missing game-start research continuation: '+itemId+' -> '+id);
  }else{
    noResearch++;
    assert(markup.includes('원본에 별도 연구 조건 없음'),
      'No research must be reported accurately: '+itemId);
  }
  if((s.buyRequiresBaseFunc||[]).length){
    baseGated++;
    assert(markup.includes('구매에 필요한 기지 기능:'),
      'A non-research store restriction must be visible before expanding raw data');
  }
}
assert.equal(pricedItems.length,133,'Pinned 2.1 store material audit changed');
assert.equal(researchGated,125);
assert.equal(noResearch,8);
assert.equal(baseGated,1);
for(const id of ['STR_MEDALLION','STR_KALTES_KLARES','STR_VODKA'])
  assert(bootstrapCycles.includes(id),'Missing source-verified first-purchase cycle: '+id);
assert(bootstrapCycles.length>=3);
const bypassItem=buildAcquisitionSubtree('item','STR_OPERATOR_ARMOR',data);
assert(renderAcquisitionTree(bypassItem).includes('직접 해금 대안 있음'),
  'Default laboratory prerequisites must not be presented as the only research access');
console.log('PASS 133 indexed purchasable materials: 125 research-gated, 8 without research gates, 1 base-function gate, '+bootstrapCycles.length+' same-item lab specimen cycles; separate source categories retained');
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
