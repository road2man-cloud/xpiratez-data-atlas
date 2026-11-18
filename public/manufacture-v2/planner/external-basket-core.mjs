// Single-recipe hypothetical stock basket. Never mutates an imported save,
// a planner's starting stock, or the previous calculated plan.
const LIMIT_PER_ITEM = 10000000;
const LIMIT_KINDS = 5000;

export function prepareExternalBasket({
  external, inventory, selectedIds, itemIds, requestedQuantities
}) {
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
    const hasQuantity = requestedQuantities instanceof Map
      ? requestedQuantities.has(id) : requestedQuantities &&
        Object.hasOwn(requestedQuantities, id);
    const quantity = hasQuantity ? (requestedQuantities instanceof Map
      ? requestedQuantities.get(id) : requestedQuantities[id]) : row.quantity;
    if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > row.quantity)
      throw new Error('가상 확보 수량은 1부터 현재 부족량 사이의 정수여야 합니다: ' + id);
    const target = previous + quantity;
    if (!Number.isSafeInteger(target) || target > LIMIT_PER_ITEM)
      throw new Error('해당 재료의 가상 재고가 10,000,000개를 초과합니다: ' + id);
    nextInventory[id] = target;
    additions.push({
      id, name: row.name || id, quantity, shortage: row.quantity, previous, target
    });
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

const totalUnits = plan => plan.external.reduce((sum, row) => sum + row.quantity, 0);

function baselineSignature(plan) {
  return JSON.stringify({
    rootRecipeId: plan.rootRecipeId,
    external: plan.external.map(row => [row.id, row.quantity])
      .sort(([a], [b]) => a.localeCompare(b)),
    cost: plan.totals.declaredCost,
    time: plan.totals.declaredTime,
    flags: [...plan.flags].sort()
  });
}

export function compareExternalBasket(before, after, basket) {
  if (!before?.external || !after?.external || !basket?.additions ||
      before.rootRecipeId !== after.rootRecipeId)
    throw new Error('동일 제조식의 가정 전후 계산 결과가 필요합니다.');
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
  return {
    schema: 'xpiratez-v2-single-recipe-acquisition-basket/v1',
    sourceVersion: 'v.o2',
    rootRecipeId: before.rootRecipeId,
    baselineSignature: baselineSignature(before),
    acquiredHypothetically: basket.additions.map(row => ({ ...row })),
    initialShortage: { kinds: before.external.length, units: totalUnits(before) },
    hypotheticalShortage: { kinds: after.external.length, units: totalUnits(after) },
    hypotheticalExternal: after.external.map(row => ({
      id: row.id, name: row.name, quantity: row.quantity
    })),
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

const routeSignature = scenario => JSON.stringify(
  Object.entries(scenario?.routeChoices||{})
    .sort(([left],[right])=>left.localeCompare(right,'en'))
);
export function compatibleExternalBasketBaselines(a,b) {
  return a?.schema==='xpiratez-v2-single-recipe-acquisition-basket/v1' &&
    b?.schema===a.schema && a.sourceVersion==='v.o2' &&
    b.sourceVersion==='v.o2' && !!a.baselineSignature &&
    a.baselineSignature===b.baselineSignature &&
    a.rootRecipeId===b.rootRecipeId &&
    routeSignature(a)===routeSignature(b);
}

export function compareExternalBasketScenarios(a, b) {
  if (!compatibleExternalBasketBaselines(a,b) ||
      !Array.isArray(a.hypotheticalExternal) ||
      !Array.isArray(b.hypotheticalExternal))
    throw new Error('같은 제조 목표·기초 재고·제조 경로로 저장한 A/B 결과만 비교할 수 있습니다.');
  const left = new Map(a.hypotheticalExternal.map(row => [row.id, row]));
  const right = new Map(b.hypotheticalExternal.map(row => [row.id, row]));
  const rows = [...new Set([...left.keys(), ...right.keys()])]
    .map(id => ({
      id,
      name: left.get(id)?.name || right.get(id)?.name || id,
      aShortage: left.get(id)?.quantity || 0,
      bShortage: right.get(id)?.quantity || 0
    }))
    .filter(row => row.aShortage || row.bShortage)
    .map(row => ({ ...row, differenceBMinusA: row.bShortage - row.aShortage }))
    .sort((x, y) => x.name.localeCompare(y.name, 'ko'));
  const summary = scenario => ({
    acquiredKinds: scenario.acquiredHypothetically.length,
    acquiredUnits: scenario.acquiredHypothetically.reduce((s, x) => s + x.quantity, 0),
    shortageKinds: scenario.hypotheticalShortage.kinds,
    shortageUnits: scenario.hypotheticalShortage.units,
    declaredCost: scenario.afterDeclaredCost,
    declaredTime: scenario.afterDeclaredTime,
    flags: [...scenario.hypotheticalFlags]
  });
  return {
    schema: 'xpiratez-v2-single-recipe-acquisition-scenarios/v1',
    sourceVersion: 'v.o2',
    rootRecipeId: a.rootRecipeId,
    scenarioA: summary(a),
    scenarioB: summary(b),
    differenceBMinusA: {
      shortageUnits: b.hypotheticalShortage.units - a.hypotheticalShortage.units,
      declaredCost: Number.isFinite(a.afterDeclaredCost) &&
        Number.isFinite(b.afterDeclaredCost)
          ? b.afterDeclaredCost - a.afterDeclaredCost : null,
      declaredTime: Number.isFinite(a.afterDeclaredTime) &&
        Number.isFinite(b.afterDeclaredTime)
          ? b.afterDeclaredTime - a.afterDeclaredTime : null
    },
    acquiredHypotheticallyA: a.acquiredHypothetically.map(x => ({ ...x })),
    acquiredHypotheticallyB: b.acquiredHypothetically.map(x => ({ ...x })),
    materials: rows,
    caveat: 'A/B 시나리오는 동일 기초 재고에 대한 독립 가정입니다. 부족 재료 총량의 차이로 최적 조달, 비용 또는 실제 제조 가능성을 판단할 수 없습니다.'
  };
}
