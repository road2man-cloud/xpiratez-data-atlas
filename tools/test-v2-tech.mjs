import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { mergeNamedSections, makeRows, attachLinks } from './build-v2-tech.mjs';

const load = name => JSON.parse(fs.readFileSync(fileURLToPath(new URL('../public/data/'+name+'-v2-index.json',import.meta.url)),'utf8'));
const research=load('research'), manufacture=load('manufacture');
const items=load('items');
const manifestBytes=fs.readFileSync(fileURLToPath(new URL('../public/ruleset/manifest.json',import.meta.url)));
const digest=x=>createHash('sha256').update(x).digest('hex');

test('v.o2 research and manufacture metadata is derived from the same verified source as items',()=>{
  const expected=digest(manifestBytes);
  for(const [name,d,min] of [['research',research,4000],['manufacture',manufacture,2000]]) {
    assert.equal(d.meta.sourceVersion,'v.o2');
    assert.equal(d.meta.sourceManifestSha256,expected);
    assert.equal(d.meta.itemIndexSha256,digest(fs.readFileSync(fileURLToPath(new URL('../public/data/items-v2-index.json',import.meta.url)))));
    assert(d.meta.count>=min, name+' count');
    assert.equal(d.entries.length,d.meta.count);
    assert.equal(new Set(d.entries.map(x=>x.id)).size,d.entries.length);
    assert(d.entries.every(x=>x.sourceFiles?.length && x.fields && x.links),name+' provenance');
  }
});
test('research and manufacture use only the matching 2.1 item IDs',()=>{
  const ids=new Set(items.items.map(x=>x.id));
  const researchIds=new Set(research.entries.map(x=>x.id));
  const manufactureIds=new Set(manufacture.entries.map(x=>x.id));
  for(const m of manufacture.entries) {
    assert(m.links.requiredItems.every(id=>ids.has(id)),m.id+' item input');
    assert(m.links.producedItems.every(id=>ids.has(id)),m.id+' item output');
    assert(m.links.prerequisiteResearch.every(id=>researchIds.has(id)),m.id+' research');
    assert(m.links.unlockedByResearch.every(id=>researchIds.has(id)),m.id+' research grant');
  }
  for(const r of research.entries) {
    assert(r.links.prerequisiteResearch.every(id=>researchIds.has(id)),r.id+' prerequisite');
    assert(r.links.manufactureUnlocked.every(id=>manufactureIds.has(id)),r.id+' manufacturer');
  }
});
test('merging honors overrides, nested fields and delete directives',()=>{
  const records=[
    {file:'A.rul',docs:[{research:[{name:'STR_R1',cost:50,requires:['A'],flags:{a:1}},{name:'STR_DROP',cost:10}],manufacture:[{name:'STR_M1',requiredItems:{STR_WOOD:3},cost:10}]}]},
    {file:'B.rul',docs:[{research:[{name:'STR_R1',cost:60,flags:{b:2}},{delete:'STR_DROP'}],manufacture:[{name:'STR_M1',requiredItems:{STR_IRON:2},cost:20}]}]}
  ];
  const r=mergeNamedSections(records,'research');
  const m=mergeNamedSections(records,'manufacture');
  assert.deepEqual([...r.values.keys()],['STR_R1']);
  assert.deepEqual(r.values.get('STR_R1').flags,{a:1,b:2});
  assert.equal(r.values.get('STR_R1').cost,60);
  assert.equal(r.deletionEntries,1);
  assert.deepEqual(m.values.get('STR_M1').requiredItems,{STR_WOOD:3,STR_IRON:2});
  assert.deepEqual(makeRows(r,'research',{STR_R1:'실험'},{} )[0].sourceFiles,['A.rul','B.rul']);
});
test('strict direct ID linking does not invent unknown items or implied research',()=>{
  const r={values:new Map([['STR_R1',{name:'STR_R1',unlocks:['STR_M1','STR_UNKNOWN'],dependencies:['STR_UNKNOWN_R']}]]),provenance:new Map([['STR_R1',['A.rul']]])};
  const m={values:new Map([['STR_M1',{name:'STR_M1',requires:['STR_R1','STR_UNLISTED'],requiredItems:{STR_WOOD:2,STR_GHOST:1}}]]),provenance:new Map([['STR_M1',['A.rul']]])};
  const research=makeRows(r,'research',{},{}),manufacture=makeRows(m,'manufacture',{},{});
  attachLinks(research,manufacture,[{id:'STR_WOOD'}]);
  assert.deepEqual(manufacture[0].links.requiredItems,['STR_WOOD']);
  assert.deepEqual(manufacture[0].links.unresolvedItemRefs,['STR_GHOST']);
  assert.deepEqual(manufacture[0].links.prerequisiteResearch,['STR_R1']);
  assert.deepEqual(research[0].links.prerequisiteResearch,[]);
  assert.deepEqual(research[0].links.manufactureUnlocked,['STR_M1']);
});
