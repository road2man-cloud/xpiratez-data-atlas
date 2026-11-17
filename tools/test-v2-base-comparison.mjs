import assert from 'node:assert/strict';
import {test} from 'node:test';
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import {createManufacturingPlanner} from '../public/manufacture-v2/planner/planner-core.mjs';
import {compareV2ManufacturingBases} from '../public/manufacture-v2/planner/base-comparison-core.mjs';

const makeFixture = () => {
  const meta=kind=>({schema:'xpiratez-v2-mod-'+kind+'/v1',
    sourceVersion:'v.o2',sourceManifestSha256:'fixture-v.o2',itemIndexSha256:'fixture-items'});
  const recipe=(id,fields)=>({id,koName:id,fields,sourceFiles:['Fixture.rul'],
    links:{unlockedByResearch:[]}});
  return createManufacturingPlanner({
    items:{meta:meta('items'),items:['A','B'].map(id=>({id,koName:id,fields:{}}))},
    research:{meta:meta('research'),entries:[{id:'R1',koName:'R1',fields:{dependencies:[]}}]},
    manufacture:{meta:meta('manufacture'),entries:[
      recipe('ROOT',{cost:9,time:3,requiredItems:{A:5},requiresBaseFunc:['SHOP'],
        requires:['R1']}),
      recipe('MAKE_A',{cost:2,time:1,requiredItems:{B:1},producedItems:{A:4}})
    ]}
  });
};
const facilities={
  meta:{schema:'xpiratez-v2-mod-facilities/v1',sourceVersion:'v.o2'},
  facilities:[{id:'FACTORY',fields:{provideBaseFunc:['SHOP']}}]
};
const base=(name,items,facilitiesInstances=[],present=true)=>({
  name,items:{...items},facilities:facilitiesInstances,
  facilitiesPresent:present,productions:[]
});
const bases=[
  base('Base Alpha',{A:2},[{type:'FACTORY',buildTime:0}]),
  base('Base Beta',{A:5},[{type:'FACTORY',buildTime:5}]),
  base('Base Gamma',{A:8},[],false)
];
const settings={recipeId:'ROOT',batches:1,maxDepth:0,
  saveDiscoveredResearchIds:['R1']};

test('compares independently per base and never pools inventory across bases',()=>{
  const planner=makeFixture();
  const before=structuredClone(bases);
  const r=compareV2ManufacturingBases(planner,facilities,bases,settings);
  assert.deepEqual(bases,before);
  assert.equal(r.results.length,3);
  assert.equal(r.results[0].externalUnits,3);
  assert.equal(r.results[1].externalUnits,0);
  assert.equal(r.results[2].externalUnits,0);
  assert.deepEqual(r.sortedByMaterialShortage,[1,2,0]);
  assert.equal(r.minimumObservedExternalUnits,0);
  assert.deepEqual(r.shortageMatrix.map(x=>({id:x.id,byBase:x.byBase,spread:x.spread})),
    [{id:'A',byBase:[3,0,0],spread:3}]);
  assert.deepEqual(r.shortageMatrix[0].basesWithoutShortage,[1,2]);
  assert(r.results.every(row=>row.sourceScope==='one-base-only'));
});
test('a facility under construction is not a completed function and missing roster stays unknown',()=>{
  const r=compareV2ManufacturingBases(makeFixture(),facilities,bases,settings);
  assert.deepEqual(r.results[0].missingFunctions,[]);
  assert.deepEqual(r.results[1].missingFunctions,['SHOP']);
  assert.deepEqual(r.results[1].functionsUnderConstruction,['SHOP']);
  assert.equal(r.results[1].facilityEvidenceState,'saved-facilities');
  assert.equal(r.results[2].facilityEvidenceState,'unknown');
  assert.deepEqual(r.results[2].missingFunctions,[]);
});
test('preserves discovered-research context without claiming game availability',()=>{
  const planner=makeFixture();
  const r=compareV2ManufacturingBases(planner,facilities,bases,
    {...settings,saveDiscoveredResearchIds:[]});
  assert.deepEqual(r.results[0].unmatchedResearch,['R1']);
  assert.equal(r.results[0].researchEvidenceState,'saved-discovered');
  const noResearch=compareV2ManufacturingBases(planner,facilities,bases,
    {...settings,saveDiscoveredResearchIds:undefined});
  assert.equal(noResearch.results[0].researchEvidenceState,'unknown');
  assert.deepEqual(noResearch.results[0].unmatchedResearch,[]);
});
test('supports nested manufacturing and reports per-base changed manufacturing cost',()=>{
  const planner=makeFixture();
  const r=compareV2ManufacturingBases(planner,facilities,bases,
    {...settings,maxDepth:2});
  assert(r.results[0].manufacturingCost>r.results[1].manufacturingCost);
  assert(r.results[0].usedRecipes.includes('MAKE_A'));
  assert(!r.results[1].usedRecipes.includes('MAKE_A'));
  assert.equal(r.results[0].externalKinds,1); // B: 1
});
test('rejects unverified 1.1 IDs and invalid base or batch inputs',()=>{
  const planner=makeFixture();
  assert.throws(()=>compareV2ManufacturingBases(planner,facilities,
    [base('Legacy',{STR_OLD_ITEM:10})],settings),/2.1/);
  assert.throws(()=>compareV2ManufacturingBases(planner,facilities,[],settings),/1~32/);
  assert.throws(()=>compareV2ManufacturingBases(planner,facilities,
    [base('Invalid',{A:10000001})],settings),/범위/);
  assert.throws(()=>compareV2ManufacturingBases(planner,facilities,bases,
    {...settings,batches:0}),/1~100/);
  assert.throws(()=>compareV2ManufacturingBases(planner,{meta:{sourceVersion:'v.o1.1.1'}},bases,settings),/2.1/);
});
test('the actual v.o2 indexes support base comparison without legacy data',()=>{
  const folder=fileURLToPath(new URL('../public/data/',import.meta.url));
  const load=name=>JSON.parse(fs.readFileSync(folder+name+'-v2-index.json','utf8'));
  const planner=createManufacturingPlanner({
    manufacture:load('manufacture'),items:load('items'),research:load('research')
  });
  const index=load('facilities');
  const snapshots=[
    base('Saved Base 1',{STR_CHEMICALS:40},[],true),
    base('Saved Base 2',{STR_CHEMICALS:2},[],true)
  ];
  const report=compareV2ManufacturingBases(planner,index,snapshots,{
    recipeId:'STR_3RL_HE_XXX',batches:1,maxDepth:0
  });
  assert.equal(report.sourceVersion,'v.o2');
  assert.equal(report.results.length,2);
  assert.equal(report.results[0].externalUnits<report.results[1].externalUnits,true);
});
