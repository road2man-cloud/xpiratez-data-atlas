// Single-recipe hypothetical stock basket. Never mutates an imported save,
// a planner's starting stock, or the previous calculated plan.
const LIMIT_PER_ITEM = 10000000;
const LIMIT_KINDS = 5000;

export function prepareExternalBasket({ external, inventory, selectedIds, itemIds }) {
  if (!Array.isArray(external) || !inventory || typeof inventory !== 'object' ||
      !itemIds || typeof itemIds.has !== 'function')
    throw new Error('현재 제조 계획과 아이템 목록을 확인할 수 없습니다.');
  const selected = new Set(selectedIds || []);
  if (!selected.size) throw new Error('가상 확보할 부족 재료를 하나 이상 선택하세요.');
  const rows = new Map();
  for (const entry of external) {
    if (typeof entry?.id === 'string' && rows.has(entry.id))
      throw new Error('현재 계획에 중복 부족 재료가 있습니다: ' + entry.id);
    if (typeof entry?.id === 'string') rows.set(entry.id, entry);
  }
  const nextInventory = { ...inventory }, additions = [];
  for (const id of selected) {
    const row = rows.get(id);
    if (!row || !itemIds.has(id))
      throw new Error('현재 2.1 제조 계획에서 확보할 수 없는 재료: ' + id);
    const previous = Object.hasOwn(inventory, id) ? inventory[id] : 0;
    if (!Number.isSafeInteger(previous) || previous < 0 || previous > LIMIT_PER_ITEM ||
        !Number.isSafeInteger(row.quantity) || row.quantity <= 0)
      throw new Error('원본 재고 또는 부족 수량이 올바르지 않습니다: ' + id);
    const quantity = row.quantity, target = previous + quantity;
    if (!Number.isSafeInteger(target) || target > LIMIT_PER_ITEM)
      throw new Error('해당 재료의 가상 재고가 10,000,000개를 초과합니다: ' + id);
    nextInventory[id] = target;
    additions.push({ id, name: row.name || id, quantity, previous, target });
  }
  if (Object.keys(nextInventory).filter(id => nextInventory[id] > 0).length > LIMIT_KINDS)
    throw new Error('가상 재고의 아이템 종류가 5,000종을 초과합니다.');
  additions.sort((a, b) => a.id.localeCompare(b.id));
  return {
    inventory: nextInventory,
    additions,
    selectedKinds: additions.length,
    selectedUnits: additions.reduce((sum, row) => sum + row.quantity, 0)
  };
}

export function compareExternalBasket(before, after, basket) {
  if (!before?.external || !after?.external || !basket?.additions)
    throw new Error('가정 전후의 제조 계산 결과가 필요합니다.');
  const original = new Map(before.external.map(row => [row.id, row]));
  const hypothetical = new Map(after.external.map(row => [row.id, row]));
  const changes = [...new Set([...original.keys(), ...hypothetical.keys()])]
    .map(id => ({
      id,
      name: original.get(id)?.name || hypothetical.get(id)?.name || id,
      before: original.get(id)?.quantity || 0,
      after: hypothetical.get(id)?.quantity || 0
    }))
    .filter(x => x.before !== x.after)
    .sort((a, b) => a.name.localeCompare(b.name, 'ko'));
  const unitCount = plan => plan.external.reduce((sum, row) => sum + row.quantity, 0);
  return {
    schema: 'xpiratez-v2-single-recipe-acquisition-basket/v1',
    sourceVersion: 'v.o2',
    rootRecipeId: before.rootRecipeId,
    acquiredHypothetically: basket.additions.map(row => ({ ...row })),
    initialShortage: { kinds: before.external.length, units: unitCount(before) },
    hypotheticalShortage: { kinds: after.external.length, units: unitCount(after) },
    beforeDeclaredCost: before.totals.declaredCost,
    afterDeclaredCost: after.totals.declaredCost,
    beforeDeclaredTime: before.totals.declaredTime,
    afterDeclaredTime: after.totals.declaredTime,
    initialFlags: [...before.flags],
    hypotheticalFlags: [...after.flags],
    changes,
    caveat: '재고 추가를 가정한 독립적인 재계산입니다. 재고·세이브·게임 상태를 변경하지 않으며 구매, 연구, 시설 또는 제조 가능성을 보장하지 않습니다.'
  };
}
