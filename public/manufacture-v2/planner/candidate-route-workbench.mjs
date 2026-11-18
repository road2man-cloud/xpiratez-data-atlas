// Independent "candidate + producer route" workbench for a single v.o2
// recipe. All planning runs against copies of the input inventory.
// The original game save, live inventory and main producer choices remain
// untouched; applying a producer route is a separate explicit UI action.
import { prepareExternalBasket, compareExternalBasket } from './external-basket-core.mjs';
import { prepareCandidateHandoff } from './external-candidate-handoff.mjs';
import { summarizeRouteReadiness, compareRouteEvidence } from './candidate-route-evidence.mjs';
import { buildManufacturingReadinessChecklist, compareManufacturingChecklists } from './manufacturing-readiness-checklist.mjs';

const optionsFor = (planner, id, assumeImplicit) =>
  planner.listProducers(id, assumeImplicit).map(x=>x.recipeId);

export function calculateRouteWorkbench({
  planner, candidate, currentPlan, inventory, choices, requestedQuantities,
  selectedIds, batches, maxDepth, assumeImplicit=false, saveDiscoveredResearchIds=null,
  baseOperations=null, facilitiesIndex=null
}) {
  if (!planner?.plan || !planner?.itemMap || !planner?.listProducers ||
      !currentPlan?.rootRecipeId || currentPlan.sourceVersion==='v.o1.1.1' ||
      !inventory || typeof inventory!=='object')
    throw new Error('2.1 단일 제조식의 계산기와 현재 계획이 필요합니다.');
  const initial = prepareCandidateHandoff({
    candidate, rootRecipeId:currentPlan.rootRecipeId,
    external:currentPlan.external,inventory,itemIds:planner.itemMap
  });
  // Reject stale or unrelated selections rather than silently replacing
  // the candidate's original purpose with a different plan.
  const selected = selectedIds===undefined?initial.selectedIds:new Set(selectedIds);
  const amounts = requestedQuantities===undefined
    ? initial.requestedQuantities : requestedQuantities;
  const basket=prepareExternalBasket({
    external:currentPlan.external, inventory, itemIds:planner.itemMap,
    selectedIds:selected, requestedQuantities:amounts
  });
  if (!choices || typeof choices!=='object' || Array.isArray(choices))
    throw new Error('하위 제조 경로 선택 정보가 올바르지 않습니다.');
  const verifiedChoices = {};
  for(const [id,recipeId] of Object.entries(choices)) {
    if (!planner.itemMap.has(id) || typeof recipeId!=='string' ||
        (recipeId!=='external' && !optionsFor(planner,id,assumeImplicit).includes(recipeId)))
      throw new Error('선택할 수 없는 제조 경로: '+id+' / '+String(recipeId));
    verifiedChoices[id]=recipeId;
  }
  const common = {
    batches,maxDepth,assumeImplicit,choices:verifiedChoices,
    ...(saveDiscoveredResearchIds!==null?
      {saveDiscoveredResearchIds}: {})
  };
  const before=planner.plan(currentPlan.rootRecipeId,{
    ...common,inventory:{...inventory}
  });
  const after=planner.plan(currentPlan.rootRecipeId,{
    ...common,inventory:basket.inventory
  });
  const comparison=compareExternalBasket(before,after,basket);
  const evidenceContext={
    recipeMap:planner.recipeMap, researchMap:planner.researchMap,
    baseOperations,facilitiesIndex
  };
  const sourceEvidence=summarizeRouteReadiness(currentPlan,evidenceContext);
  const editedEvidence=summarizeRouteReadiness(before,evidenceContext);
  const acquiredEvidence=summarizeRouteReadiness(after,evidenceContext);
  const originalChecklist=buildManufacturingReadinessChecklist(currentPlan,sourceEvidence);
  const editedChecklist=buildManufacturingReadinessChecklist(before,editedEvidence);
  const acquiredChecklist=buildManufacturingReadinessChecklist(after,acquiredEvidence);
  const summarize=plan=>({
    shortageKinds:plan.external.length,
    shortageUnits:plan.external.reduce((sum,row)=>sum+row.quantity,0),
    declaredCost:plan.totals.declaredCost,
    declaredTime:plan.totals.declaredTime,
    flags:[...plan.flags]
  });
  const report={
    schema:'xpiratez-v2-route-workbench/v1',
    sourceVersion:'v.o2',
    rootRecipeId:currentPlan.rootRecipeId,
    sourceChoices:{...verifiedChoices},
    additions:basket.additions.map(row=>({...row})),
    activePlan:summarize(currentPlan),
    editedRouteBeforeAcquisition:summarize(before),
    editedRouteAfterAcquisition:summarize(after),
    shortageChanges:comparison.changes.map(row=>({...row})),
    evidence:{
      original:sourceEvidence,
      editedRoute:editedEvidence,
      withAcquisition:acquiredEvidence
    },
    evidenceChanges:{
      routeOnly:compareRouteEvidence(sourceEvidence,editedEvidence),
      acquisitionOnly:compareRouteEvidence(editedEvidence,acquiredEvidence)
    },
    checklists:{
      original:originalChecklist,
      editedRoute:editedChecklist,
      withAcquisition:acquiredChecklist
    },
    checklistChanges:{
      routeOnly:compareManufacturingChecklists(originalChecklist,editedChecklist),
      acquisitionOnly:compareManufacturingChecklists(editedChecklist,acquiredChecklist)
    },
    scenarioReport:{
      ...comparison,
      routeChoices:{...verifiedChoices},
      evidence:acquiredEvidence,
      checklist:acquiredChecklist
    },
    stockDraft:basket.additions.map(row=>row.id+'='+row.target).join('\n'),
    caveat:'세 결과는 같은 제조 목표의 독립 계산입니다. 하위 제조 경로의 변경과 가상 재료 확보가 서로 다른 영향을 낼 수 있으며, 실제 게임 세이브·재고는 수정하지 않습니다. 시설·연구·시장·이벤트 실행 조건은 별도입니다.'
  };
  return {report,routeBaseline:before,acquisitionPlan:after,basket};
}
