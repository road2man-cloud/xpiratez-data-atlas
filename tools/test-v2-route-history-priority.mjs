import test from 'node:test';
import assert from 'node:assert/strict';
import {buildRouteActionBoard} from '../public/manufacture-v2/planner/route-action-board.mjs';
import {buildRouteHistoryPriority,routeHistoryPriorityCsvRows,routeHistoryPriorityDetailsCsvRows}
  from '../public/manufacture-v2/planner/route-history-priority.mjs';

const root='STR_FACTORY';
const workflow={
  schema:'xpiratez-v2-route-material-workflow/v1',
  sourceVersion:'v.o2',rootRecipeId:root,
  materials:[{id:'STR_ORE',name:'광석',totalAcquisition:4,remainingShortage:1,
    categoryLabel:'실제 조달 미검증',action:'광석 확보 점검'}],
  recipeSequenceAfter:[
    {position:1,recipeId:'STR_SUB',recipeName:'하위 제조',batches:2,
      prerequisiteStepNumbers:[],prerequisiteResearch:['STR_R1'],
      inputMaterials:[{id:'STR_ORE',name:'광석',quantity:4,status:'stock-covered'}]},
    {position:2,recipeId:root,recipeName:'상위 제조',batches:1,
      prerequisiteStepNumbers:[1],prerequisiteResearch:[],
      inputMaterials:[{id:'STR_OUTPUT',quantity:1,status:'manufactured'}]}
  ]
};
const checklist={
  schema:'xpiratez-v2-single-goal-readiness-checklist/v1',
  sourceVersion:'v.o2',rootRecipeId:root,tasks:[
    {category:'facility',key:'facility::WORKS',requirementId:'WORKS',
      recipeIds:['STR_SUB'],title:'작업 시설',status:'pending'},
    {category:'research',key:'research::STR_R1',requirementId:'STR_R1',
      title:'기술 조사',status:'unverified'}
  ]
};
const board=buildRouteActionBoard({workflow,finalChecklist:checklist});
const ledger={
  schema:'xpiratez-v2-route-acquisition-ledger/v1',sourceVersion:'v.o2',
  rootRecipeId:root,
  materials:[{id:'STR_ORE',name:'광석',startingInventory:3,totalAcquisition:4,remainingShortage:1}]
};
const history={
  schema:'xpiratez-v2-route-review-history/v1',sourceVersion:'v.o2',
  rootRecipeId:root,
  events:[{revision:1},{revision:2},{revision:3}],
  entries:[
    {revision:1,oldId:'material::STR_ORE',type:'material',requirementId:'STR_ORE',
      quantity:4,sourceStatus:'hypothetical-acquisition',
      note:'이전 재고 확인',reviewed:true,
      affectedRecipeIds:['STR_SUB',root]},
    {revision:2,oldId:'condition::WORKS',type:'condition',requirementId:'WORKS',
      quantity:null,sourceStatus:'pending',note:'',reviewed:true,
      affectedRecipeIds:['STR_SUB']},
    {revision:2,oldId:'material::STR_DISAPPEARED',type:'material',
      requirementId:'STR_DISAPPEARED',quantity:2,sourceStatus:'simulated-shortage',
      note:'예전 재료',reviewed:false,affectedRecipeIds:['STR_SUB']},
    {revision:3,oldId:'recipe::7',type:'recipe',requirementId:'STR_LOST',
      quantity:1,sourceStatus:'simulated-recipe',note:'구형 경로',
      reviewed:false,affectedRecipeIds:['STR_LOST']}
  ]
};

test('prioritizes repeated changed recipe with pending prerequisites and retains separate historical-only recipe',()=>{
  const saved=JSON.stringify({history,workflow,board,ledger});
  const data=buildRouteHistoryPriority({
    history,board,workflow,ledger,reviewed:new Set(['condition::research::STR_R1'])
  });
  assert.equal(data.schema,'xpiratez-v2-route-history-priority/v1');
  assert.deepEqual(data.recipes.map(x=>x.recipeId),['STR_SUB',root,'STR_LOST']);
  assert.deepEqual(data.recipes.map(x=>x.priority),['high','medium','historical']);
  assert.equal(data.summary.high,1);
  assert.equal(data.summary.historical,1);
  const sub=data.recipes[0];
  assert.deepEqual(sub.revisions,[1,2]);
  assert.equal(sub.pendingMaterialCount,1);
  assert.equal(sub.pendingConditionCount,1);
  assert.equal(sub.pendingRelatedTaskCount,2);
  assert.deepEqual(sub.previousOnlyMaterialIds,['STR_DISAPPEARED']);
  assert.deepEqual(sub.previousOnlyMaterials,[{
    id:'STR_DISAPPEARED',previousQuantity:2,
    previousSourceStatus:'simulated-shortage',latestRevision:2
  }]);
  assert.deepEqual(sub.currentOnlyConditionIds,['STR_R1']);
  const ore=sub.currentMaterials.find(x=>x.id==='STR_ORE');
  assert.equal(ore.previousQuantity,4);
  assert.equal(ore.startingInventory,3);
  assert.equal(ore.hypotheticalAcquisition,4);
  assert.equal(ore.remainingShortage,1);
  assert.equal(ore.reviewed,false);
  assert.deepEqual(ore.inputStatuses,['stock-covered']);
  const tech=sub.currentConditions.find(x=>x.id==='STR_R1');
  assert.deepEqual(tech.unreviewedTaskIds,[]);
  assert.equal(data.recipes[2].currentRecipeCount,0);
  assert.equal(JSON.stringify({history,workflow,board,ledger}),saved);
});

test('present but manufactured item is a reference, not an invented blocking material',()=>{
  const data=buildRouteHistoryPriority({history,board,workflow,ledger});
  const parent=data.recipes.find(x=>x.recipeId===root);
  assert(parent.currentMaterials.some(x=>x.id==='STR_OUTPUT'&&x.taskId===null&&
    x.inputStatuses.includes('manufactured')));
  assert.equal(parent.pendingMaterialCount,1);
  assert(parent.pendingRelatedTaskCount>parent.pendingMaterialCount);
  assert.deepEqual(parent.currentOnlyMaterialIds,['STR_OUTPUT']);
  assert.equal(routeHistoryPriorityCsvRows(data).length,4);
  const details=routeHistoryPriorityDetailsCsvRows(data);
  assert(details.some(x=>x[0]==='STR_SUB'&&x[1]==='previous-only-material'&&
    x[2]==='STR_DISAPPEARED'&&x[13]===2&&x[14]==='simulated-shortage'));
  assert(details.some(x=>x[0]==='STR_SUB'&&x[1]==='material'&&
    x[2]==='STR_ORE'&&x[11]===1));
});

test('removing unreviewed checklist obligations lowers review rank without altering past archive',()=>{
  const reviewed=new Set(board.tasks.map(x=>x.id));
  const data=buildRouteHistoryPriority({history,board,workflow,reviewed});
  const sub=data.recipes.find(x=>x.recipeId==='STR_SUB');
  const parent=data.recipes.find(x=>x.recipeId===root);
  assert.equal(sub.priority,'medium');
  assert.equal(parent.priority,'reference');
  assert.equal(sub.pendingRelatedTaskCount,0);
  assert.equal(sub.pendingConditionCount,0);
  assert.equal(sub.currentMaterials.find(x=>x.id==='STR_ORE').startingInventory,null);
});

test('refuses mixed goal, legacy version and bad task references',()=>{
  assert.throws(()=>buildRouteHistoryPriority({
    history,board:{...board,rootRecipeId:'WRONG'},workflow
  }),/동일한 v.o2/);
  assert.throws(()=>buildRouteHistoryPriority({
    history:{...history,sourceVersion:'v.o1'},board,workflow
  }),/v.o2/);
  assert.throws(()=>buildRouteHistoryPriority({
    history,board,workflow,reviewed:['not-in-board']
  }),/현재 제조 작업표/);
  const corrupted={...board,tasks:board.tasks.map(x=>x.id==='recipe::2'?
    {...x,dependsOn:['missing-id']}:x)};
  assert.throws(()=>buildRouteHistoryPriority({history,board:corrupted,workflow}),
    /선행 작업이 없습니다/);
  assert.throws(()=>routeHistoryPriorityCsvRows({schema:'broken'}),/올바르지/);
  assert.throws(()=>routeHistoryPriorityDetailsCsvRows({schema:'broken'}),/올바르지/);
});
