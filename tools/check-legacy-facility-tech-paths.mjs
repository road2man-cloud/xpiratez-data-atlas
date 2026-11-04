// Check original facility-index sources and the item/research construction graphs.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createLegacyFacilityTechAdapter} from '../public/facilities/legacy-acquisition-tech.js';
import {createLegacyResearchTechAdapter} from '../public/research/acquisition-tech-adapter.js';
import {createLegacyItemTechAdapter} from '../public/items/acquisition-tech-adapter.js';

const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const facility=read('public/data/facilities-index.json');
const items=read('public/items/acquisition-index.json');
const research=read('public/research/acquisition-index.json');
const index=items.facilities;
assert.equal(facility.meta.source.metadataSha256,index.meta.sourceMetadataSha256);
assert.deepEqual(index,research.facilities,'Item and research indexes must retain identical facility source');
assert.equal(Object.keys(index.facilities).length,115);
assert.equal(index.meta.functionCount,Object.keys(index.functions).length);
const adapter=createLegacyFacilityTechAdapter(index,items.meta);
let counted=0;
for(const [id,f] of Object.entries(index.facilities)){
  const row=facility.index.find(x=>x.id===id);
  assert(row,'Missing original facility '+id);
  assert.equal(f.buildCost,row.buildCost,'Build cost drift '+id);
  assert.equal(f.buildTime,row.buildTime,'Build time drift '+id);
  assert.deepEqual(f.provideBaseFunc,row.provideBaseFunc,'Function source drift '+id);
  for(const func of f.provideBaseFunc){
    assert(index.functions[func].includes(id),'Function provider missing '+id+' '+func);
    counted++;
  }
}
assert(counted>30);
const node=(kind,id)=>({kind,id,children:[]});
const func=adapter.expand(node('facility-function','SHOP'));
const options=adapter.expand(func.children[0]);
assert.equal(options.relation,'or');
assert(options.children.some(x=>x.id==='STR_WAR_BARRACKS'));
const war=options.children.find(x=>x.id==='STR_WAR_BARRACKS');
const warMethods=adapter.expand(war);
const build=warMethods.children.find(x=>x.sourceKind==='facility-build');
assert(build,'War barracks must have its own construction route');
const requirements=adapter.expand(build);
assert.equal(requirements.relation,'and');
assert(requirements.children.some(x=>x.kind==='research'&&x.id==='STR_WAR_BARRACKS'));
assert(requirements.children.some(x=>x.kind==='item'&&x.id==='STR_SCRAP_METAL'&&x.qty===3000));
assert(requirements.children.some(x=>x.kind==='funds'&&x.note.includes('700,000')));
assert(requirements.children.some(x=>x.id==='FACILITY_BUILD_TIME:STR_WAR_BARRACKS'&&x.note.includes('36')));
assert(adapter.renderEvidence(war).includes('STR_WAR_BARRACKS'));
assert.equal(adapter.linkForNode(war).href,'../facilities/#facility=STR_WAR_BARRACKS');
const start=adapter.expand(node('facility-type','STR_ACCESS_LIFT'));
assert(start.children.some(x=>x.sourceKind==='facility-start'));
assert(!adapter.expand(start.children.find(x=>x.sourceKind==='facility-start')).children.some(x=>x.kind==='research'));
const stateOnly=Object.values(index.facilities).find(x=>x.stateOnly&&!x.startingCount);
assert(stateOnly&&!adapter.expand(node('facility-type',stateOnly.id)).children.some(x=>x.sourceKind==='facility-build'),
  'A damage/state-only facility must not masquerade as generally constructible');
const study=createLegacyResearchTechAdapter(research,'STR_INSPECT_MACHINERY');
const lab=study.expand(study.root).children.find(x=>x.id==='LAB:STR_INSPECT_MACHINERY');
const required=study.expand(lab).children.find(x=>x.kind==='facility-function'&&x.id==='SHOP');
assert(required,'A research requiring SHOP must retain the exact base function');
assert(study.expand(study.expand(required).children[0]).children.some(x=>x.id==='STR_WAR_BARRACKS'),
  'Research -> base function -> real facility path must stay inside the tech viewer');
let productionGate=null,productId=null;
for(const item of Object.values(items.items)){
  const edge=item.producers.find(x=>items.recipes[x.id]?.requiresBaseFunc?.length);
  if(edge){productionGate=edge;productId=item.id;break;}
}
assert(productId);
const itemAdapter=createLegacyItemTechAdapter(items,research,productId);
const maker=itemAdapter.expand(itemAdapter.root).children;
const make=maker.find(x=>x.sourceKind==='make')||
  itemAdapter.expand(maker.find(x=>x.sourceKind==='make-options')).children.find(x=>x.recipe===productionGate.id);
const gate=itemAdapter.expand(make).children.find(x=>x.kind==='facility-function');
assert(gate&&itemAdapter.expand(gate).children.length,
  'Item manufacture -> required base function -> providers must expand');
assert.throws(()=>createLegacyFacilityTechAdapter(index,{...items.meta,sourceVersion:'v.o2'}),
  /원본 버전/);
console.log('PASS '+Object.keys(index.facilities).length+' facilities, '+counted+
  ' provideBaseFunc links, research and item construction paths, build vs start, state-only and version guards');
