import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeRouteReadiness, compareRouteEvidence }
  from '../public/manufacture-v2/planner/candidate-route-evidence.mjs';

const recipeMap=new Map([
  ['STR_ROOT',{id:'STR_ROOT',koName:'원본',fields:{
    requiresBaseFunc:['WORKS'],requires:['STR_R_A']},
    links:{unlockedByResearch:['STR_R_B']}}],
  ['STR_SUB',{id:'STR_SUB',koName:'하위 제조',fields:{
    requiresBaseFunc:['ALKO','SHOP'],requires:['STR_R_C']},links:{}}],
  ['STR_EMPTY',{id:'STR_EMPTY',koName:'직접 제조',fields:{},links:{}}]
]);
const researchMap=new Map([
  ['STR_R_A',{}],['STR_R_B',{}],['STR_R_C',{}],['STR_DEP',{}]
]);
const facilitiesIndex={facilities:[
  {id:'STR_FORGE',fields:{provideBaseFunc:['WORKS','SHOP']}},
  {id:'STR_STILL',fields:{provideBaseFunc:['ALKO']}}
]};
const selectedBase={
  facilitiesPresent:true,
  facilities:[{type:'STR_FORGE'},{type:'STR_STILL',buildTime:3}]
};
const recipeNode=id=>({kind:'recipe',id,inputs:[]});
const plan=(ids=['STR_ROOT'],{
  discovered=true,extras=[],unresolved=[],found=['STR_R_A']
}={})=>({
  rootRecipeId:'STR_ROOT',
  tree:{...recipeNode(ids[0]),inputs:ids.slice(1).map(id=>({
    kind:'item',id:'STR_PART',children:[recipeNode(id)]
  }))},
  research:{
    ids:[{id:'STR_R_A',name:'A'},{id:'STR_R_B',name:'B'},
      ...extras.map(id=>({id,name:id}))].map(row=>({
        ...row,...(discovered?{inSaveDiscovered:found.includes(row.id)}:{})
      })),
    unresolved,
    ...(discovered?{saveEvidence:{source:'saved discovered'}}:{})
  },
  flags:[]
});
const ctx={recipeMap,researchMap,baseOperations:selectedBase,facilitiesIndex};

test('completed/pending functions and discovered research are distinct evidence states',()=>{
  const p=plan(['STR_ROOT','STR_SUB'],{
    extras:['STR_R_C','STR_DEP'],found:['STR_R_A','STR_R_C'],
    unresolved:['STR_BAD']
  });
  const result=summarizeRouteReadiness(p,ctx);
  assert.deepEqual(result.recipeIds,['STR_ROOT','STR_SUB']);
  assert.equal(result.facilityCounts.confirmed,2);
  assert.equal(result.facilityCounts.pending,1);
  assert.equal(result.facilityCounts.unverified,0);
  assert.equal(result.facilityEvidenceSource,'saved-single-base');
  assert.equal(result.researchCounts.confirmed,2);
  assert.equal(result.researchCounts.notInDiscovered,2);
  assert.equal(result.researchCounts.unresolved,1);
  assert(result.facilities.some(x=>x.recipeId==='STR_SUB' &&
    x.functionId==='ALKO'&&x.status==='pending'));
  assert(result.actions.some(x=>x.requirementId==='STR_R_B' &&
    x.status==='notInDiscovered'));
  assert(result.actions.some(x=>x.requirementId==='STR_BAD' &&
    x.status==='unknown-reference'));
  assert(result.directResearch.some(x=>x.recipeId==='STR_ROOT' &&
    x.researchId==='STR_R_B'));
});

test('unknown facility types keep missing observations unverified',()=>{
  const p=plan(['STR_ROOT','STR_SUB']);
  const hasUnknown={facilitiesPresent:true,facilities:[{type:'STR_UNINDEXED'}]};
  const result=summarizeRouteReadiness(p,{...ctx,baseOperations:hasUnknown});
  assert.equal(result.facilityCounts.unverified,3);
  assert.equal(result.facilityCounts.notObserved,0);
  assert.deepEqual(result.unrecognizedFacilityIds,['STR_UNINDEXED']);
});

test('known complete roster can label absent provision as not observed, not impossible',()=>{
  const p=plan(['STR_SUB']);
  const result=summarizeRouteReadiness(p,{...ctx,baseOperations:{
    facilitiesPresent:true,facilities:[{type:'STR_FORGE'}]
  }});
  assert.equal(result.facilityCounts.confirmed,1);
  assert.equal(result.facilityCounts.notObserved,1);
  assert(result.caveat.includes('제조 불가능을 확정하지 않습니다'));
});

test('without selected base or discovered list every dependency remains unverified',()=>{
  const result=summarizeRouteReadiness(plan(['STR_ROOT'],{discovered:false}),
    {...ctx,baseOperations:null});
  assert.equal(result.facilityCounts.unverified,1);
  assert.equal(result.facilityEvidenceSource,'no-single-base-selected');
  assert.equal(result.researchCounts.unverified,2);
  assert.equal(result.researchCounts.notInDiscovered,0);
});

test('tracks newly introduced or eliminated producer requirements by scenario',()=>{
  const base=summarizeRouteReadiness(plan(['STR_ROOT']),ctx);
  const expanded=summarizeRouteReadiness(plan(['STR_ROOT','STR_SUB'],{
    extras:['STR_R_C']
  }),ctx);
  const delta=compareRouteEvidence(base,expanded);
  assert.deepEqual(delta.recipes.added,['STR_SUB']);
  assert.deepEqual(delta.facilityRequirements.added,
    ['STR_SUB::ALKO','STR_SUB::SHOP']);
  assert.deepEqual(delta.directResearchReferences.added,['STR_SUB::STR_R_C']);
  assert.deepEqual(delta.researchClosure.added,['STR_R_C']);
  const reversed=compareRouteEvidence(expanded,base);
  assert.deepEqual(reversed.facilityRequirements.removed,
    ['STR_SUB::ALKO','STR_SUB::SHOP']);
});
