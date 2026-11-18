// Convert an explored single-goal candidate into a safe, user-controlled
// stock-editing draft. No mutation of planner inventory, save, or scenario.
import { prepareExternalBasket } from './external-basket-core.mjs';

export function prepareCandidateHandoff({ candidate, rootRecipeId, external, inventory, itemIds }) {
  if (!candidate || !Array.isArray(candidate.additions) ||
      candidate.report?.sourceVersion !== 'v.o2' ||
      candidate.report?.rootRecipeId !== rootRecipeId ||
      !Array.isArray(external) || !inventory || typeof inventory !== 'object')
    throw new Error('현재 제조 목표에서 계산된 조달 후보만 가져올 수 있습니다.');
  if (!candidate.additions.length)
    throw new Error('확보할 재료가 없는 조달 후보입니다.');
  const ids=[], requestedQuantities=new Map();
  for (const item of candidate.additions) {
    if (typeof item?.id !== 'string' || requestedQuantities.has(item.id))
      throw new Error('조달 후보에 중복되거나 잘못된 아이템 ID가 있습니다.');
    ids.push(item.id);
    requestedQuantities.set(item.id,item.quantity);
  }
  const basket=prepareExternalBasket({
    external, inventory, selectedIds:ids, requestedQuantities, itemIds
  });
  return {
    selectedIds:new Set(ids),
    requestedQuantities,
    additions:basket.additions.map(row=>({...row})),
    stockText:basket.additions.map(row=>row.id+'='+row.target).join('\n'),
    selectedKinds:basket.selectedKinds,
    selectedUnits:basket.selectedUnits
  };
}
