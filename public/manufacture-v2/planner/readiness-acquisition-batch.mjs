// Hypothetical acquisition batch assembled directly from the single-goal
// readiness checklist. The selected shortage quantities are verified against
// the current plan before any recalculation. Never changes source inventory.
import { prepareExternalBasket, compareExternalBasket }
  from './external-basket-core.mjs';
import { buildManufacturingReadinessChecklist, compareManufacturingChecklists }
  from './manufacturing-readiness-checklist.mjs';

const CHECKLIST_SCHEMA='xpiratez-v2-single-goal-readiness-checklist/v1';
const PLAN_SCHEMA='xpiratez-v2-manufacture-plan/v1';
const units=plan=>plan.external.reduce((total,item)=>total+item.quantity,0);

export function prepareReadinessBatch({
  checklist,plan,inventory,itemIds,selectedIds,requestedQuantities
}) {
  if(checklist?.schema!==CHECKLIST_SCHEMA ||
    plan?.schema!==PLAN_SCHEMA || !plan.rootRecipeId ||
    checklist.rootRecipeId!==plan.rootRecipeId ||
    !Array.isArray(checklist.tasks) || !Array.isArray(plan.external))
    throw new Error('현재 제조 목표와 일치하는 체크리스트가 필요합니다.');
  const listed=new Map();
  for(const row of checklist.tasks){
    if(row.category!=='material')continue;
    if(listed.has(row.requirementId) || row.key!=='material::'+row.requirementId ||
      !Number.isSafeInteger(row.quantity) || row.quantity<=0)
      throw new Error('체크리스트 재료 정보가 잘못되었습니다.');
    listed.set(row.requirementId,row.quantity);
  }
  if(listed.size!==plan.external.length ||
    plan.external.some(row=>listed.get(row.id)!==row.quantity))
    throw new Error('제조 계획이 바뀌었습니다. 체크리스트를 다시 계산하세요.');
  const selection=[...new Set(selectedIds||[])];
  if(!selection.length)throw new Error('확보할 부족 재료를 선택하세요.');
  if(selection.some(id=>!listed.has(id)))
    throw new Error('현재 체크리스트에 없는 재료는 선택할 수 없습니다.');
  return prepareExternalBasket({
    external:plan.external,inventory,itemIds,selectedIds:selection,
    requestedQuantities
  });
}

export function calculateReadinessBatch({
  checklist,plan,inventory,itemIds,selectedIds,requestedQuantities,
  planWithInventory,evidenceForPlan
}) {
  if(typeof planWithInventory!=='function' || typeof evidenceForPlan!=='function')
    throw new Error('독립 제조 계획 및 조건 근거 계산 함수가 필요합니다.');
  const basket=prepareReadinessBatch({
    checklist,plan,inventory,itemIds,selectedIds,requestedQuantities
  });
  // planWithInventory must be a planner call accepting independent stock.
  const after=planWithInventory({...basket.inventory});
  if(after?.schema!==PLAN_SCHEMA || after.rootRecipeId!==plan.rootRecipeId)
    throw new Error('가상 재계산 결과가 현재 제조 목표와 일치하지 않습니다.');
  const evidence=evidenceForPlan(after);
  const afterChecklist=buildManufacturingReadinessChecklist(after,evidence);
  const changes=compareManufacturingChecklists(checklist,afterChecklist);
  const comparison=compareExternalBasket(plan,after,basket);
  comparison.evidence=evidence;
  comparison.checklist=afterChecklist;
  const baseMaterial=new Map(plan.external.map(row=>[row.id,row]));
  const acquired=basket.additions.map(row=>{
    const source=baseMaterial.get(row.id);
    const unit=source?.listedUnitBuy;
    const priced=Number.isFinite(unit) && unit>=0;
    const total=priced?unit*row.quantity:null;
    return {...row,
      listedUnitBuy:priced?unit:null,
      listedBuyReference:Number.isSafeInteger(total)?total:null
    };
  });
  const report={
    schema:'xpiratez-v2-readiness-acquisition-batch/v1',
    sourceVersion:'v.o2',
    rootRecipeId:plan.rootRecipeId,
    acquiredHypothetically:acquired,
    before:{
      shortageKinds:plan.external.length,shortageUnits:units(plan),
      tasks:checklist.totals.tasks
    },
    after:{
      shortageKinds:after.external.length,shortageUnits:units(after),
      tasks:afterChecklist.totals.tasks
    },
    newlyRequired:changes.added,
    noLongerListed:changes.removed,
    changedTasks:changes.changed,
    evidenceSource:afterChecklist.source,
    hypotheticalScenario:comparison,
    checklistAfter:afterChecklist,
    stockDraft:basket.additions.map(row=>row.id+'='+row.target).join('\n'),
    caveat:'이 목록은 가상 재고 확보에 따른 독립 계산입니다. 게임 세이브나 계산기 보유 재고가 변경되지 않았으며 체크리스트 제외는 실제 작업 완료나 제조 가능 판정이 아닙니다.'
  };
  return {report,basket,after,afterChecklist};
}
