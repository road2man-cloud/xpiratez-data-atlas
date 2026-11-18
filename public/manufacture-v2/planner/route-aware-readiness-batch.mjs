// Route-aware single-goal procurement: route edits determine which
// materials are currently missing, and only those materials may be acquired.
// Main stock, imported saves and main planner choices are immutable.
import { calculateReadinessBatch } from './readiness-acquisition-batch.mjs';
import { compareManufacturingChecklists } from './manufacturing-readiness-checklist.mjs';

const PLAN_SCHEMA='xpiratez-v2-manufacture-plan/v1';
const LIST_SCHEMA='xpiratez-v2-single-goal-readiness-checklist/v1';
const uniqueSorted = rows=>rows.map(row=>[row.id,row.quantity])
  .sort((a,b)=>a[0].localeCompare(b[0],'en'));
const signature = p => JSON.stringify([
  p.rootRecipeId,uniqueSorted(p.external||[]),
  p.totals?.declaredCost,p.totals?.declaredTime,
  [...(p.flags||[])].sort()
]);
const summarize = plan=>({
  shortageKinds:plan.external.length,
  shortageUnits:plan.external.reduce((sum,row)=>sum+row.quantity,0),
  declaredCost:plan.totals.declaredCost,
  declaredTime:plan.totals.declaredTime,
  flags:[...plan.flags]
});

export function calculateRouteAwareReadinessBatch({
  planner,originalPlan,originalChecklist,routeBaseline,routeChecklist,
  inventory,choices,selectedIds,requestedQuantities,batches,maxDepth,
  assumeImplicit=false,saveDiscoveredResearchIds=null,evidenceForPlan
}) {
  if(!planner?.plan || !planner?.itemMap || !planner?.listProducers ||
    originalPlan?.schema!==PLAN_SCHEMA || routeBaseline?.schema!==PLAN_SCHEMA ||
    routeChecklist?.schema!==LIST_SCHEMA || originalChecklist?.schema!==LIST_SCHEMA ||
    originalPlan.rootRecipeId!==routeBaseline.rootRecipeId ||
    routeChecklist.rootRecipeId!==routeBaseline.rootRecipeId ||
    originalChecklist.rootRecipeId!==originalPlan.rootRecipeId ||
    !inventory || typeof inventory!=='object' ||
    !choices || typeof choices!=='object' || Array.isArray(choices) ||
    typeof evidenceForPlan!=='function')
    throw new Error('같은 v.o2 제조 목표의 원안·경로 편집·조건 근거가 필요합니다.');
  const verifiedChoices={};
  for(const [itemId,recipeId] of Object.entries(choices)){
    if(!planner.itemMap.has(itemId) || typeof recipeId!=='string' ||
      (recipeId!=='external' &&
        !planner.listProducers(itemId,assumeImplicit)
          .some(row=>row.recipeId===recipeId)))
      throw new Error('현재 제조 경로와 맞지 않는 선택: '+itemId);
    verifiedChoices[itemId]=recipeId;
  }
  const options={
    batches,maxDepth,assumeImplicit,choices:verifiedChoices,
    ...(saveDiscoveredResearchIds!==null?
      {saveDiscoveredResearchIds}:{})
  };
  const planWithInventory = stock=>planner.plan(routeBaseline.rootRecipeId,{
    ...options,inventory:{...stock}
  });
  const checkedBaseline=planWithInventory(inventory);
  if(checkedBaseline?.schema!==PLAN_SCHEMA ||
    signature(checkedBaseline)!==signature(routeBaseline))
    throw new Error('경로 변경 후 재료 목록이 달라졌습니다. 작업대를 먼저 다시 계산하세요.');
  const scenario=calculateReadinessBatch({
    checklist:routeChecklist,plan:checkedBaseline,inventory,
    itemIds:planner.itemMap,selectedIds,requestedQuantities,
    planWithInventory,evidenceForPlan
  });
  const routeOnlyChanges=compareManufacturingChecklists(
    originalChecklist,routeChecklist);
  const batchReport=scenario.report;
  const result={
    schema:'xpiratez-v2-route-aware-readiness-batch/v1',
    sourceVersion:'v.o2',
    rootRecipeId:routeBaseline.rootRecipeId,
    routeChoices:{...verifiedChoices},
    original:summarize(originalPlan),
    routeOnly:summarize(checkedBaseline),
    routeAndAcquisition:summarize(scenario.after),
    routeOnlyChanges,
    acquisitionChanges:{
      added:batchReport.newlyRequired,
      removed:batchReport.noLongerListed,
      changed:batchReport.changedTasks
    },
    acquiredHypothetically:batchReport.acquiredHypothetically,
    stockDraft:batchReport.stockDraft,
    hypotheticalScenario:{
      ...batchReport.hypotheticalScenario,
      routeChoices:{...verifiedChoices}
    },
    originalChecklist,
    editedRouteChecklist:routeChecklist,
    finalChecklist:batchReport.checklistAfter,
    caveat:'편집한 제조 경로에서 부족한 재료만 선택한 독립 가상 계산입니다. 원안 후보의 확보 가정과 중복 합산하지 않고, 실제 재고·세이브·본 계산기의 경로는 바꾸지 않습니다.'
  };
  return {report:result,after:scenario.after,basket:scenario.basket};
}
