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
assert(eventRequirements.children.some(n=>n.kind==='event'));
assert(eventRequirements.children.every(n=>n.kind!=='random'));
assert(ev.renderEvidence(event).includes('../events/#event='));
assert(items.events[event.event]?.name,
  'A known event source must have a human-readable localized label where indexed');
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
console.log('PASS legacy item paths: 4007 items, 2105 recipes, buy vs stock, AND prerequisites, recursive ingredients, manufacturing RNG, event uncertainty, no-source warning, version isolation');
