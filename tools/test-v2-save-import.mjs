import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { parsePiratezV2Save, selectSaveInventory } from '../public/manufacture-v2/planner/save-import-core.mjs';
import { createManufacturingPlanner } from '../public/manufacture-v2/planner/planner-core.mjs';

const header = (mod = 'piratez ver: v.o2', version = 'Extended 8.7.1') =>
  'name: test\nversion: ' + version +
  '\nengine: Extended\nbuild: "fixture"\nmods:\n  - \'' + mod + '\'\n---\n';
const fixture = header() + `difficulty: 2
bases:
  - lon: 0.01
    lat: 0.02
    name: First Base
    crafts:
      - type: STR_CRAFT
        items:
          STR_CHEMICALS: 9999
    items:
      STR_CHEMICALS: 12
      STR_SCRAP_METAL: 40
      STR_FROM_EXTRA_MOD: 6
  - lon: 0.3
    lat: 0.4
    name: 'Second Base'
    items:
      STR_CHEMICALS: 8
      STR_TEST_PART: 2
  - lon: 0.2
    lat: 0.3
    name: Empty Base
    items: {}
discovered:
  - STR_R1
  - STR_R2
  - STR_UNKNOWN_RESEARCH
researchDiary:
  - name: STR_FAKE
`;
const itemIds = new Set(['STR_CHEMICALS','STR_SCRAP_METAL','STR_TEST_PART']);
const researchIds = new Set(['STR_R1','STR_R2']);
const parse = source => parsePiratezV2Save(source, { itemIds, researchIds });

test('fixture selects only matching version and catalogued base stores, never craft contents', () => {
  const p = parse(fixture);
  assert.equal(p.bases.length,3);
  assert.equal(p.bases[0].name,'First Base');
  assert.equal(p.bases[0].items.STR_CHEMICALS,12);
  assert.equal(p.bases[0].items.STR_SCRAP_METAL,40);
  assert.equal(p.bases[0].excludedKinds,1);
  assert.equal(p.discovered.length,2);
  assert.deepEqual(p.discovered,['STR_R1','STR_R2']);
  assert.equal(p.excludedResearchCount,1);
  assert.deepEqual({ ...selectSaveInventory(p,'0') }, {STR_CHEMICALS:12,STR_SCRAP_METAL:40});
  assert.deepEqual({ ...selectSaveInventory(p,'1') }, {STR_CHEMICALS:8,STR_TEST_PART:2});
  assert.deepEqual({ ...selectSaveInventory(p,'2') }, {});
  assert.deepEqual({ ...selectSaveInventory(p,'all') }, {
    STR_CHEMICALS:20,STR_SCRAP_METAL:40,STR_TEST_PART:2
  });
  assert.throws(()=>selectSaveInventory(p,'9'),/존재하지 않는 기지/);
});
test('rejects old 1.1 saves, mismatched OXCE engine and non-save text',()=>{
  assert.throws(()=>parse(header('piratez ver: v.o1.1.1')+'bases: []'),/조합/);
  assert.throws(()=>parse(header('piratez ver: v.o2','Extended 8.6.0')+'bases: []'),/조합/);
  assert.throws(()=>parse('not a save'),/경계/);
  assert.throws(()=>parse(''),/텍스트/);
});
test('rejects malformed inventories instead of silently inventing amounts',()=>{
  assert.throws(()=>parse(fixture.replace('STR_CHEMICALS: 12','STR_CHEMICALS: -3')),/형식/);
  assert.throws(()=>parse(fixture.replace('STR_CHEMICALS: 12','STR_CHEMICALS: 10000001')),/범위/);
  assert.throws(()=>parse(fixture.replace('STR_CHEMICALS: 12','STR_CHEMICALS: {wrong: 1}')),/형식/);
  assert.throws(()=>parse(fixture.replace('STR_CHEMICALS: 12','STR_CHEMICALS: 12\n      STR_CHEMICALS: 3')),/중복된/);
  assert.throws(()=>parse(fixture.replace('    items:\n      STR_CHEMICALS: 8','    stockpile: {}')),/저장구역/);
});
test('other mod warnings and duplicate mod-catalog references never leak unknown item IDs into planner',()=>{
  const p=parse(fixture.replace('---\ndifficulty','  - \'otherVisibility ver: 2.0\'\n---\ndifficulty'));
  assert.equal(p.additionalMods.length,1);
  assert(p.warnings.some(x=>x.includes('다른 모드')));
  assert(!Object.hasOwn(selectSaveInventory(p,'all'),'STR_FROM_EXTRA_MOD'));
});
test('imported discovered IDs annotate only known v.o2 research entries',()=>{
  const p=parse(fixture);
  assert(p.discovered.every(x=>researchIds.has(x)));
  assert(!p.discovered.includes('STR_UNKNOWN_RESEARCH'));
});

// Opt-in local-only real-game compatibility cross-check.
// No save file is copied into this repository, published, or logged.
if (process.env.XPIRATEZ_V2_SAVE) {
  const require = createRequire(import.meta.url);
  const yaml = require('js-yaml');
  const index = fileURLToPath(new URL('../public/data/', import.meta.url));
  const actualItemIds = new Set(JSON.parse(fs.readFileSync(index+'items-v2-index.json','utf8')).items.map(x=>x.id));
  const actualResearchIds = new Set(JSON.parse(fs.readFileSync(index+'research-v2-index.json','utf8')).entries.map(x=>x.id));
  test('local v.o2 save parser matches authoritative YAML base stores and discovered IDs',()=>{
    const raw=fs.readFileSync(process.env.XPIRATEZ_V2_SAVE,'utf8');
    const preview=parsePiratezV2Save(raw,{itemIds:actualItemIds,researchIds:actualResearchIds});
    const docs=[];
    yaml.loadAll(raw,doc=>docs.push(doc),{json:true});
    assert.equal(docs.length,2);
    assert.equal(preview.bases.length,docs[1].bases.length);
    docs[1].bases.forEach((base,index)=>{
      const relevant=Object.fromEntries(Object.entries(base.items||{}).filter(([id,count])=>
        actualItemIds.has(id)&&Number.isSafeInteger(count)&&count>0));
      assert.deepEqual({...preview.bases[index].items},relevant);
    });
    const expectedDiscovered=[...new Set(docs[1].discovered.filter(id=>actualResearchIds.has(id)))].sort((a,b)=>a.localeCompare(b,'en'));
    assert.deepEqual(preview.discovered,expectedDiscovered);
    assert(Object.keys(selectSaveInventory(preview,'all')).length>0);
    const manufacture=JSON.parse(fs.readFileSync(index+'manufacture-v2-index.json','utf8'));
    const research=JSON.parse(fs.readFileSync(index+'research-v2-index.json','utf8'));
    const items=JSON.parse(fs.readFileSync(index+'items-v2-index.json','utf8'));
    const planner=createManufacturingPlanner({manufacture,research,items});
    const plan=planner.plan('STR_3RL_HE_XXX',{
      batches:3,maxDepth:2,inventory:selectSaveInventory(preview,'all'),
      saveDiscoveredResearchIds:preview.discovered
    });
    assert.equal(plan.rootRecipeId,'STR_3RL_HE_XXX');
    assert(plan.research.saveEvidence);
    assert(plan.inventory && plan.consolidated);
    assert(Object.keys(plan.inventory.supplied).length>0);
  });
}
