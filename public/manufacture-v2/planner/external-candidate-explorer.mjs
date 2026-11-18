// Bounded exploration of hypothetical procurement combinations for ONE
// manufacturing goal. The caller supplies the existing planner; the source
// inventory and save remain immutable. Candidate ordering is descriptive,
// not a financial optimum or proof that the game can execute an order.
import { prepareExternalBasket, compareExternalBasket } from './external-basket-core.mjs';

export const MAX_EXPLORE_ITEMS = 6;
export const MAX_EXPLORE_CANDIDATES = 22;
const VALID_SORTS = new Set(['reduction', 'efficiency', 'remaining', 'acquired']);
const shortageUnits = report => report.hypotheticalShortage.units;

const compareText = (left, right) => left.localeCompare(right, 'en');
export function rankExternalCandidates(candidates, sortBy='reduction') {
  if (!Array.isArray(candidates) || !VALID_SORTS.has(sortBy))
    throw new Error('조달 조합 정렬 조건이 올바르지 않습니다.');
  const sorted = [...candidates];
  sorted.sort((a, b) => {
    if (sortBy === 'efficiency') {
      const diff = b.reductionPerAcquiredUnit - a.reductionPerAcquiredUnit;
      if (diff) return diff;
    } else if (sortBy === 'remaining') {
      const diff = a.shortageUnits - b.shortageUnits;
      if (diff) return diff;
      const kinds = a.shortageKinds - b.shortageKinds;
      if (kinds) return kinds;
    } else if (sortBy === 'acquired') {
      const diff = a.acquiredUnits - b.acquiredUnits;
      if (diff) return diff;
    }
    const improvement = b.reducedUnits - a.reducedUnits;
    if (improvement) return improvement;
    const kinds = b.reducedKinds - a.reducedKinds;
    if (kinds) return kinds;
    const acquired = a.acquiredUnits - b.acquiredUnits;
    if (acquired) return acquired;
    return compareText(a.key, b.key);
  });
  return sorted;
}

export function exploreExternalCandidates({
  before, inventory, itemIds, selectedIds, requestedQuantities, planWithInventory,
  summarizeEvidence=null
}) {
  if (!before?.external || !before?.rootRecipeId || typeof planWithInventory !== 'function' ||
      (summarizeEvidence!==null && typeof summarizeEvidence!=='function'))
    throw new Error('현재 제조 목표와 독립 계산기가 필요합니다.');
  // Validate all selected quantities before truncating to a bounded search.
  const whole = prepareExternalBasket({
    external:before.external, inventory, itemIds, selectedIds, requestedQuantities
  });
  const examined = [...whole.additions]
    .sort((a,b) => b.quantity-a.quantity || compareText(a.id,b.id))
    .slice(0, MAX_EXPLORE_ITEMS);
  const ids = examined.map(row => row.id);
  const quantities = new Map(examined.map(row => [row.id,row.quantity]));
  const sets = [];
  for (const id of ids) sets.push({type:'single', ids:[id]});
  for (let i=0; i<ids.length; i++)
    for (let j=i+1; j<ids.length; j++)
      sets.push({type:'pair', ids:[ids[i],ids[j]]});
  if (ids.length>=3) sets.push({type:'all',ids:[...ids]});
  if (sets.length>MAX_EXPLORE_CANDIDATES)
    throw new Error('조달 조합 계산 상한을 초과했습니다.');
  const candidates=[], failures=[];
  for (const entry of sets) {
    const sortedIds = [...entry.ids].sort(compareText);
    const key = JSON.stringify(sortedIds);
    try {
      const basket = prepareExternalBasket({
        external:before.external, inventory, itemIds,
        selectedIds:sortedIds, requestedQuantities:quantities
      });
      const after=planWithInventory(basket.inventory);
      const report=compareExternalBasket(before,after,basket);
      const evidence=summarizeEvidence?summarizeEvidence(after):null;
      const reducedUnits=report.initialShortage.units-shortageUnits(report);
      candidates.push({
        key, type:entry.type,
        acquiredKinds:basket.selectedKinds,
        acquiredUnits:basket.selectedUnits,
        reducedUnits,
        reducedKinds:report.initialShortage.kinds-report.hypotheticalShortage.kinds,
        reductionPerAcquiredUnit:reducedUnits/basket.selectedUnits,
        shortageUnits:shortageUnits(report),
        shortageKinds:report.hypotheticalShortage.kinds,
        declaredCost:report.afterDeclaredCost,
        declaredTime:report.afterDeclaredTime,
        flagsCount:report.hypotheticalFlags.length,
        additions:report.acquiredHypothetically.map(row=>({...row})),
        evidence,report
      });
    } catch (error) {
      failures.push({key, type:entry.type, error:error.message});
    }
  }
  return {
    schema:'xpiratez-v2-single-recipe-procurement-explorer/v1',
    sourceVersion:'v.o2',
    rootRecipeId:before.rootRecipeId,
    selectedTotal:whole.selectedKinds,
    examinedItems:ids.length,
    omittedItems:Math.max(0,whole.selectedKinds-ids.length),
    candidateCount:sets.length,
    successes:candidates.length,
    failures,
    candidates:rankExternalCandidates(candidates),
    ranking:'shortage-unit-reduction-desc; reduction-kinds-desc; acquired-units-asc',
    note:'선택한 최대 6종의 개별·2종·전체 조합만 제한적으로 계산합니다. 자재 종류가 다른 수량의 단순 합과 개당 개선률은 비용·최적 조달·게임 내 제조 가능성을 뜻하지 않습니다.'
  };
}
