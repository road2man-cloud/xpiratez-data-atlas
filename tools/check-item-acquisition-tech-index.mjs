import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createLegacyItemTechAdapter} from '../public/items/acquisition-tech-adapter.js';

const items=JSON.parse(fs.readFileSync('public/items/acquisition-index.json','utf8'));
const research=JSON.parse(fs.readFileSync('public/research/acquisition-index.json','utf8'));
assert.equal(items.meta.sourceVersion,'v.o1.1.1');
assert.equal(items.meta.count,4007);
assert.equal(items.meta.recipes,2105);
assert.equal(items.meta.totalProducers,7461);
assert.equal(items.meta.totalEvents,1253);
assert.equal(items.meta.sourceMetadataSha256,research.meta.sourceMetadataSha256);
const g=createLegacyItemTechAdapter(items,research,'STR_BUCKSHOT_HV');
const methods=g.expand(g.root);
assert.equal(methods.relation,'or');
const buy=methods.children.find(n=>n.id==='BUY:STR_BUCKSHOT_HV');
assert(buy);
const gates=g.expand(buy);
assert.equal(gates.relation,'and');
assert(gates.children.some(n=>n.kind==='research'&&n.id==='STR_BUCKSHOT_HV'),
  'requiresBuy MUST be a research prerequisite, never a guaranteed store listing');
assert(gates.children.some(n=>n.id==='STOCK:STR_BUCKSHOT_HV'));
assert.equal(items.meta.positivePriceItems,552);
assert.equal(items.meta.monthlyLimitedBuyItems,3);
assert.equal(items.meta.baseFunctionBuyItems,1);
assert.equal(items.meta.verifiedStoreListings,0);
assert.equal(items.items.STR_BUCKSHOT_HV.purchaseEvidence.status,'price-only');
assert.equal(items.items.STR_BUCKSHOT_HV.purchaseEvidence.stockVerified,false);
assert.equal(g.describe(buy).badge,'가격만 확인');
const medical=items.items.STR_LOOTBOX_MEDICAL;
assert(medical?.requiresBuyBaseFunc.includes('STR_MED_TRADE'),
  'Actual requiresBuyBaseFunc must remain separate from general manufacture requirements');
const medicalGraph=createLegacyItemTechAdapter(items,research,'STR_LOOTBOX_MEDICAL');
const medicalBuy=medicalGraph.expand(medicalGraph.root).children.find(n=>n.sourceKind==='buy');
assert(medicalBuy);
const medicalGates=medicalGraph.expand(medicalBuy).children;
assert(medicalGates.some(n=>n.kind==='facility-function'&&n.id==='STR_MED_TRADE'),
  'Purchase-only base function gate must be a real provider trace');
assert(medicalGates.some(n=>n.id==='STOCK:STR_LOOTBOX_MEDICAL'),
  'Original purchase prerequisites are insufficient to guarantee a shop listing');
assert(medicalGates.some(n=>n.id==='BUY_MONTHLY:STR_LOOTBOX_MEDICAL'&&
  medicalGraph.describe(n).detail.includes('1개')),
  'Monthly limit must be preserved separately from the one-time buying research');
assert(medicalGraph.renderEvidence(medicalBuy).includes('monthlyBuyLimit'));
const hassanGraph=createLegacyItemTechAdapter(items,research,'STR_LOOTBOX_HASSAN');
const hassanBuy=hassanGraph.expand(hassanGraph.root).children.find(n=>n.sourceKind==='buy');
assert(hassanGraph.expand(hassanBuy).children.some(n=>n.id==='BUY_MONTHLY:STR_LOOTBOX_HASSAN'&&
  hassanGraph.describe(n).detail.includes('5개')));
const mfg=methods.children.find(n=>n.sourceKind==='make');
assert(mfg);
const recipe=g.expand(mfg);
assert(recipe.children.some(n=>n.kind==='item'&&n.id==='STR_WASTELANDER_BACKPACK'&&n.qty===1),
  'A required real input item must remain a recursively traceable item');
assert(recipe.children.some(n=>n.kind==='research'&&n.id==='STR_WASTELANDER_BACKPACK'));
const roll=recipe.children.find(n=>n.kind==='random');
assert(roll&&g.describe(roll).detail.includes('0.388%'),
  'Manufacture random outcome is a CONDITIONAL relative share, not a global chance');
const researchChild=g.expand(recipe.children.find(n=>n.kind==='research'));
assert(researchChild.children.some(n=>n.id==='LAB:STR_WASTELANDER_BACKPACK'),
  'Research gates must use original legacy research adapter');
const mfgEvidence=g.renderEvidence(mfg);
assert(mfgEvidence.includes('STR_WASTELANDER_BACKPACK_EX')&&
  mfgEvidence.includes('../manufacture/#recipe='));
const ingredient=recipe.children.find(n=>n.kind==='item'&&
  n.id==='STR_WASTELANDER_BACKPACK');
assert.equal(g.linkForNode(ingredient).href,
  '../items/#item=STR_WASTELANDER_BACKPACK');
assert.equal(g.linkForNode(recipe.children.find(n=>n.kind==='research')).href,
  '../research/#research=STR_WASTELANDER_BACKPACK');
const crowded=createLegacyItemTechAdapter(items,research,'STR_CREDIT_CHIP_M');
const grouped=crowded.expand(crowded.root);
const manufacturers=grouped.children.find(n=>n.sourceKind==='make-options');
const events=grouped.children.find(n=>n.sourceKind==='event-options');
assert(manufacturers&&events,
  'Dense manufacturing and event alternatives need separate first-level groups');
assert.equal(crowded.expand(manufacturers).relation,'or');
assert.equal(crowded.expand(events).relation,'or');
assert.equal(crowded.expand(manufacturers).children.length,
  items.items.STR_CREDIT_CHIP_M.producers.length);
const ev=createLegacyItemTechAdapter(items,research,'STR_MED_CANNON_PARTS');
const event=ev.expand(ev.root).children.find(n=>n.sourceKind==='event');
assert(event&&event.reward.kind==='fixed');
const eventRequirements=ev.expand(event);
assert(eventRequirements.children.some(n=>n.sourceKind==='event-triggers'||n.kind==='warning'));
const trigger=eventRequirements.children.find(n=>n.sourceKind==='event-triggers');
if(trigger){
  const alternatives=ev.expand(trigger);
  assert(alternatives.children.length>0,'Event occurrence scripts must be traceable');
  const script=alternatives.children[0];
  assert.equal(script.sourceKind,'event-script');
  assert(ev.expand(script).children.length>0);
  assert(ev.renderEvidence(script).includes('이벤트 발생 스크립트 근거'));
  const occurrence=ev.expand(script);
  for(const condition of occurrence.children.filter(n=>n.id.startsWith('EV_COND:')))
    assert(!/\b(firstMonth|lastMonth|executionOdds)\s*=/.test(condition.note),
      'Occurrence gates must show player-friendly labels, not raw condition keys');
}
assert(eventRequirements.children.every(n=>n.kind!=='random'));
assert(ev.renderEvidence(event).includes('../events/#event='));
assert(items.events[event.event]?.name,
  'A known event source must have a human-readable localized label where indexed');
// Audit indexed occurrence conditions against the original decompressed event script.
const zlib=await import('node:zlib');
const originalEvents=new Map();
for(const bucket of '0123456789abcdef'){
  const chunk=JSON.parse(zlib.gunzipSync(fs.readFileSync(`public/data/event-chunks/${bucket}.json.gz`)));
  for(const [id,detail] of Object.entries(chunk.details||{}))originalEvents.set(id,detail);
}
let verifiedScripts=0;
for(const [eventId,eventInfo] of Object.entries(items.events)){
  const source=originalEvents.get(eventId);
  for(const script of eventInfo.scripts||[]){
    const matching=source?.scripts.find(s=>s.id===script.id&&
      ((s.eventRefs||[]).includes(eventId)||
        (s.eventWeights||[]).some(w=>(w.entries||[]).some(e=>e.eventId===eventId))||
        (s.oneTimeRandomEvents?.entries||[]).some(e=>e.eventId===eventId)||
        (s.oneTimeSequentialEvents||[]).some(e=>e.eventId===eventId)));
    assert(matching,'Indexed event occurrence has no matching original '+eventId+' '+script.id);
    assert.deepEqual(script.conditions,matching.conditions||{});
    assert.deepEqual(script.triggerMaps,matching.triggerMaps||{});
    assert.deepEqual(script.eventWeights,matching.eventWeights||[]);
    assert.deepEqual(script.eventRefs,matching.eventRefs||[]);
    assert.deepEqual(script.paths,matching.paths||[]);
    assert.deepEqual(script.oneTimeRandomEvents,matching.oneTimeRandomEvents||null);
    assert.deepEqual(script.oneTimeSequentialEvents,matching.oneTimeSequentialEvents||[]);
    verifiedScripts++;
  }
}
assert(verifiedScripts>0,'Event occurrence source verification must execute');
// A source-script negative trigger is an explicit route exclusion, NOT an
// unknown-data warning and not a positive prerequisite.
let negativeVerified=0;
for(const [eventId,info] of Object.entries(items.events)){
  for(const [i,script] of (info.scripts||[]).entries()){
    if(!Object.values(script.triggerMaps||{}).some(entries=>entries.some(x=>x.value===false)))continue;
    const item=Object.values(items.items).find(x=>x.grants.some(g=>g.id===eventId));
    if(!item)continue;
    const graph=createLegacyItemTechAdapter(items,research,item.id);
    const condition=graph.expand({kind:'and',id:'EVENT_SCRIPT:'+eventId+':'+i,
      sourceKind:'event-script',event:eventId,scriptIndex:i});
    const exclusions=condition.children.filter(x=>x.id.startsWith('EV_GATE:')&&x.kind==='blocked');
    assert(exclusions.length>0,'Negative source gates must be visually blocked '+eventId);
    assert(exclusions.every(x=>graph.describe(x).category==='blocked'));
    negativeVerified++;break;
  }
  if(negativeVerified>=12)break;
}
assert(negativeVerified>=12,'Cover at least twelve genuine negative-trigger events');
// Real positive event gates must recurse into the prerequisite's own item or
// facility construction graph, while negative/absent gates stay exclusions.
const glamGraph=createLegacyItemTechAdapter(items,research,'STR_GLAMOUR');
const rock=glamGraph.expand({kind:'and',id:'EVENT_SCRIPT:STR_ASTROROCK_EVENT:0',
  sourceKind:'event-script',event:'STR_ASTROROCK_EVENT',scriptIndex:0});
const guitar=rock.children.find(x=>x.kind==='item'&&x.id==='STR_PIRATE_GUITAR');
assert(guitar,'Positive itemTriggers must retain a recursively traceable physical item');
assert(glamGraph.expand(guitar).children.length>0);
const booksGraph=createLegacyItemTechAdapter(items,research,'STR_OLD_BOOKS');
const bookScript=booksGraph.expand({kind:'and',id:'EVENT_SCRIPT:STR_BOOKWORM_BUY_BOOKS:4',
  sourceKind:'event-script',event:'STR_BOOKWORM_BUY_BOOKS',scriptIndex:4});
const library=bookScript.children.find(x=>x.kind==='facility-type'&&x.id==='STR_LIBRARY');
assert(library,'Positive facilityTriggers must expand through actual facility construction');
assert(booksGraph.expand(library).children.length>0);
// One-time selection weight is not event occurrence odds or reward probability.
const onceInfo=Object.entries(items.events).flatMap(([id,e])=>
  (e.scripts||[]).map((script,index)=>({id,script,index})))
  .find(x=>(x.script.oneTimeRandomEvents?.entries||[]).some(y=>y.eventId===x.id));
assert(onceInfo,'Source contains one-time event selection evidence');
const onceItem=Object.values(items.items).find(x=>x.grants.some(g=>g.id===onceInfo.id));
const onceGraph=createLegacyItemTechAdapter(items,research,onceItem.id);
const onceNode=onceGraph.expand({kind:'and',id:'EVENT_SCRIPT:'+onceInfo.id+':'+onceInfo.index,
  sourceKind:'event-script',event:onceInfo.id,scriptIndex:onceInfo.index});
assert(onceNode.children.some(x=>x.id.startsWith('EV_ONCE:')&&
  onceGraph.describe(x).detail.includes('선택표 내부 상대 비중')));
const missing=createLegacyItemTechAdapter(items,research,'SPC_CUM_OR_ELSE');
const unknown=missing.expand(missing.root);
assert.equal(unknown.children.length,1);
assert.equal(unknown.children[0].kind,'warning');
assert.match(missing.describe(unknown.children[0]).detail,/미색인/);
assert.throws(()=>createLegacyItemTechAdapter(items,{
  ...research,meta:{...research.meta,sourceVersion:'v.o2'}
},'STR_BUCKSHOT_HV'));
for(const item of Object.values(items.items)){
  for(const edge of item.producers)
    assert(items.recipes[edge.id],'Every indexed producer recipe must have its actual prerequisites');
}
let verifiedPurchases=0;
for(const bucket of '0123456789abcdef'){
  const original=JSON.parse(fs.readFileSync(`public/items/data/chunks/${bucket}.json`,'utf8'));
  for(const [id,detail] of Object.entries(original.details||{})){
    const item=items.items[id],raw=detail.raw||{};
    assert.deepEqual(item.requiresBuy,raw.requiresBuy||[]);
    assert.deepEqual(item.requiresBuyBaseFunc,raw.requiresBuyBaseFunc||[]);
    assert.equal(item.requiresBuyCountry,raw.requiresBuyCountry||null);
    assert.equal(item.monthlyBuyLimit,raw.monthlyBuyLimit||null);
    assert.equal(item.transferTime,raw.transferTime??null);
    assert.equal(item.costBuy,Number(raw.costBuy)>0?Number(raw.costBuy):null);
    if(item.costBuy!=null){
      verifiedPurchases++;
      assert.equal(item.purchaseEvidence.status,'price-only');
      assert.equal(item.purchaseEvidence.stockVerified,false);
      assert.deepEqual(item.purchaseEvidence.storeIds,[]);
    }else assert.equal(item.purchaseEvidence,null);
  }
}
assert.equal(verifiedPurchases,552);
console.log('PASS legacy item paths: 4007 items / 2105 recipes / '+verifiedPurchases+
  ' price-only purchase rules / 3 monthly caps / 1 purchase facility / '+verifiedScripts+
  ' event occurrence scripts / conditional RNG / original source audit / version isolation');
