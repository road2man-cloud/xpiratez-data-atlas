// X-Piratez v.o2 manufacturing bill-of-materials planner.
// All calculations describe declared rule fields; no implicit engine defaults or legacy data.
const record = x => x !== null && typeof x === 'object' && !Array.isArray(x);
const positiveInt = x => Number.isSafeInteger(x) && x > 0;
const nonnegative = x => typeof x === 'number' && Number.isFinite(x) && x >= 0;
const list = x => Array.isArray(x) ? x.filter(y => typeof y === 'string') :
  typeof x === 'string' ? [x] : [];
const sortedIds = array => [...new Set(array)].sort((a, b) => a.localeCompare(b, 'en'));

export function createManufacturingPlanner({ manufacture, research, items }) {
  if (manufacture?.meta?.schema !== 'xpiratez-v2-mod-manufacture/v1' ||
      research?.meta?.schema !== 'xpiratez-v2-mod-research/v1' ||
      items?.meta?.schema !== 'xpiratez-v2-mod-items/v1' ||
      ![manufacture, research, items].every(x => x.meta.sourceVersion === 'v.o2')) {
    throw new Error('X-Piratez 2.1 전용 데이터만 사용할 수 있습니다.');
  }
  const reference = items.meta.sourceManifestSha256;
  if (!reference ||
    manufacture.meta.sourceManifestSha256 !== reference ||
    research.meta.sourceManifestSha256 !== reference ||
    manufacture.meta.itemIndexSha256 !== research.meta.itemIndexSha256) {
    throw new Error('연구·제조·아이템 데이터의 규칙 출처가 서로 다릅니다.');
  }
  const recipeMap = new Map(manufacture.entries.map(row => [row.id, row]));
  const researchMap = new Map(research.entries.map(row => [row.id, row]));
  const itemMap = new Map(items.items.map(row => [row.id, row]));
  const producers = new Map();
  for (const recipe of manufacture.entries) {
    const fields = recipe.fields || {};
    const randomOutput = !!fields.multipleRandomProducts ||
      !!fields.randomProducedItems;
    const explicit = record(fields.producedItems);
    if (explicit) {
      for (const [itemId, yieldCount] of Object.entries(fields.producedItems)) {
        if (!positiveInt(yieldCount) || !itemMap.has(itemId)) continue;
        const candidates = producers.get(itemId) || [];
        candidates.push({
          recipeId: recipe.id, itemId, yieldCount, explicit: true,
          randomOutput, assumedYield: false
        });
        producers.set(itemId, candidates);
      }
    } else if (itemMap.has(recipe.id) && !fields.producedItem &&
               !fields.randomProducedItems) {
      // The old atlas used a recipe-ID = item-ID shortcut. This is only
      // a separately enabled assumption, never an exact recorded output.
      const candidates = producers.get(recipe.id) || [];
      candidates.push({
        recipeId: recipe.id, itemId: recipe.id, yieldCount: 1,
        explicit: false, randomOutput, assumedYield: true
      });
      producers.set(recipe.id, candidates);
    }
  }
  for (const options of producers.values())
    options.sort((a, b) => a.recipeId.localeCompare(b.recipeId, 'en'));

  const name = id => {
    const row = itemMap.get(id) || recipeMap.get(id) || researchMap.get(id);
    return row?.koName || row?.enName || id;
  };
  const available = (id, assumeImplicit) =>
    (producers.get(id) || []).filter(p =>
      !p.randomOutput && (p.explicit || assumeImplicit));
  const listProducers = (id, assumeImplicit = false) =>
    available(id, assumeImplicit).map(p => {
      const fields = recipeMap.get(p.recipeId)?.fields || {};
      return { ...p, name: name(p.recipeId),
        costPerBatch: nonnegative(fields.cost) ? fields.cost : null,
        timePerBatch: nonnegative(fields.time) ? fields.time : null,
        inputKinds: record(fields.requiredItems) ? Object.keys(fields.requiredItems).length : null,
        researchKinds: list(fields.requires).length,
        baseFunctions: list(fields.requiresBaseFunc)
      };
    });

  function researchClosure(recipeIds) {
    const visited = new Set(), active = new Set(), missing = new Set(), cycles = [];
    const walk = (id, route) => {
      if (!researchMap.has(id)) { missing.add(id); return; }
      if (active.has(id)) { cycles.push([...route, id]); return; }
      if (visited.has(id)) return;
      active.add(id);visited.add(id);
      const row = researchMap.get(id);
      // These are declared dependencies, not proof of AND semantics or unlockability.
      for (const dep of list(row.fields?.dependencies)) walk(dep, [...route, id]);
      active.delete(id);
    };
    for (const id of recipeIds) {
      const recipe = recipeMap.get(id);
      if (!recipe) continue;
      for (const ref of list(recipe.fields?.requires)) walk(ref, []);
      for (const ref of recipe.links?.unlockedByResearch || []) walk(ref, []);
    }
    const all = sortedIds([...visited]);
    return {
      ids: all.map(id => ({
        id, name: name(id),
        declaredCost: nonnegative(researchMap.get(id).fields?.cost)
          ? researchMap.get(id).fields.cost : null
      })),
      unresolved: sortedIds([...missing]),
      cycles
    };
  }

  function plan(recipeId, settings = {}) {
    const root = recipeMap.get(recipeId);
    if (!root) throw new Error('존재하지 않는 2.1 제조식: ' + recipeId);
    const batches = settings.batches ?? 1;
    const maxDepth = settings.maxDepth ?? 3;
    if (!positiveInt(batches) || batches > 100) throw new Error('제조 횟수는 1~100이어야 합니다.');
    if (!Number.isSafeInteger(maxDepth) || maxDepth < 0 || maxDepth > 6)
      throw new Error('제조 단계는 0~6이어야 합니다.');
    const assumeImplicit = settings.assumeImplicit === true;
    const choices = record(settings.choices) ? settings.choices : {};
    if (settings.inventory !== undefined && !record(settings.inventory))
      throw new Error('보유 재고는 아이템 ID별 수량 객체여야 합니다.');
    const initialInventory = record(settings.inventory) ? settings.inventory : {};
    if (Object.keys(initialInventory).length > 5000)
      throw new Error('재고는 최대 5,000종까지 입력할 수 있습니다.');
    const owned = new Map(), surplus = new Map(), ledger = new Map();
    for (const [id, count] of Object.entries(initialInventory)) {
      if (!itemMap.has(id)) throw new Error('2.1 아이템 ID가 아닙니다: ' + id);
      if (!Number.isSafeInteger(count) || count < 0 || count > 10000000)
        throw new Error('재고 수량은 0~10,000,000 사이의 정수여야 합니다: ' + id);
      if (count) owned.set(id, count);
    }
    const totals = { declaredCost: 0, declaredTime: 0, batches: 0 };
    const flags = new Set(), recipesUsed = new Set(), external = new Map();
    const decisions = new Map();
    const notices = [];
    let expandedNodes = 0;
    const maxExpandedNodes = 500;
    const addFlag = x => flags.add(x);
    const addExternal = (id, quantity, reason) => {
      const prev = external.get(id) || { id, name: name(id), quantity: 0, reasons: new Set() };
      prev.quantity += quantity; prev.reasons.add(reason); external.set(id, prev);
      demandRow(id).external += quantity;
    };
    const demandRow = id => {
      if (!ledger.has(id)) ledger.set(id, {
        id, name: name(id), demand: 0, initialUsed: 0,
        surplusUsed: 0, produced: 0, external: 0
      });
      return ledger.get(id);
    };
    const takeStock = (id, quantity) => {
      const row = demandRow(id);
      const availableInitial = owned.get(id) || 0;
      const fromInitial = Math.min(quantity, availableInitial);
      if (fromInitial) { owned.set(id, availableInitial - fromInitial); row.initialUsed += fromInitial; }
      const remaining = quantity - fromInitial;
      const availableSurplus = surplus.get(id) || 0;
      const fromSurplus = Math.min(remaining, availableSurplus);
      if (fromSurplus) { surplus.set(id, availableSurplus - fromSurplus); row.surplusUsed += fromSurplus; }
      return { fromInitial, fromSurplus, missing: remaining - fromSurplus };
    };
    const addProduced = (id, quantity) => {
      if (!Number.isSafeInteger(quantity) || quantity <= 0) return;
      surplus.set(id, (surplus.get(id) || 0) + quantity);
      demandRow(id).produced += quantity;
    };
    const otherOptions = (itemId) => (producers.get(itemId) || [])
      .filter(p => p.randomOutput || p.assumedYield)
      .map(p => ({ ...p, name: name(p.recipeId) }));
    function expand(row, count, depth, lineage, viaItem = null, yieldCount = null) {
      expandedNodes++;
      const f = row.fields || {};
      const node = {
        kind: 'recipe', id: row.id, name: name(row.id), count, depth,
        viaItem, yieldCount, cost: null, time: null,
        inputs: [], prerequisites: list(f.requires),
        sourceFiles: row.sourceFiles || []
      };
      recipesUsed.add(row.id);
      totals.batches += count;
      if (nonnegative(f.cost)) {
        node.cost = f.cost * count; totals.declaredCost += node.cost;
      } else { addFlag('unspecified-cost'); notices.push(row.id + ': cost 미선언'); }
      if (nonnegative(f.time)) {
        node.time = f.time * count; totals.declaredTime += node.time;
      } else { addFlag('unspecified-time'); notices.push(row.id + ': time 미선언'); }
      if (!record(f.requiredItems)) {
        if (f.requiredItems !== undefined) {
          addFlag('unsupported-requiredItems');
          notices.push(row.id + ': requiredItems가 숫자 맵이 아닙니다.');
        }
        return node;
      }
      const required = Object.entries(f.requiredItems);
      const siblingIds = new Set(required.map(([id]) => id));
      // Favor recipes that make useful co-products for sibling requirements.
      // This is a deterministic heuristic, not a global optimal production schedule.
      const coProductScore = id => {
        const options = available(id, assumeImplicit);
        const selected = choices[id];
        const producer = typeof selected === 'string'
          ? options.find(p => p.recipeId === selected)
          : options.length === 1 ? options[0] : null;
        if (!producer) return 0;
        const declared = recipeMap.get(producer.recipeId)?.fields?.producedItems;
        return record(declared)
          ? Object.keys(declared).filter(out => out !== id && siblingIds.has(out)).length : 0;
      };
      required.sort(([a],[b]) => coProductScore(b) - coProductScore(a) || a.localeCompare(b, 'en'));
      for (const [id, perBatch] of required) {
        if (!positiveInt(perBatch) || !Number.isSafeInteger(perBatch * count)) {
          node.inputs.push({ kind: 'unresolved', id, name: name(id), quantity: null,
            reason: '재료 수량을 계산할 수 없습니다.' });
          addFlag('invalid-quantity'); continue;
        }
        const quantity = perBatch * count;
        const valid = available(id, assumeImplicit);
        const all = producers.get(id) || [];
        const selected = Object.hasOwn(choices, id) ? choices[id] : undefined;
        const rowLedger = demandRow(id);
        rowLedger.demand += quantity;
        const usedStock = takeStock(id, quantity);
        const deficit = usedStock.missing;
        const itemNode = { kind: 'item', id, name: name(id), quantity,
          inventoryUsed: usedStock.fromInitial, surplusUsed: usedStock.fromSurplus,
          deficit, producerCount: valid.length,
          alternatives: all.length, status: '', children: [], yieldCount: null,
          recipeId: null, neededBatches: null, assumed: false, extra: 0 };
        node.inputs.push(itemNode);
        if (deficit === 0) { itemNode.status = 'stock-covered'; continue; }
        const blocked = otherOptions(id);
        if (blocked.length && valid.length === 0) addFlag('unverified-outputs');
        if (depth >= maxDepth) {
          itemNode.status = 'depth-limit'; addFlag('depth-limit');
          addExternal(id, deficit, 'depth-limit'); continue;
        }
        if (selected === 'external') {
          itemNode.status = 'external-choice'; addExternal(id, deficit, 'user-external'); continue;
        }
        if (!valid.length) {
          itemNode.status = all.length ? 'unsupported-output' : 'external';
          addExternal(id, deficit, itemNode.status); continue;
        }
        let selectedProducer;
        if (typeof selected === 'string') {
          selectedProducer = valid.find(candidate => candidate.recipeId === selected);
          if (!selectedProducer) {
            itemNode.status = 'invalid-choice';
            addFlag('invalid-choice'); addExternal(id, deficit, 'invalid-choice');
            continue;
          }
        } else if (valid.length === 1) {
          selectedProducer = valid[0];
        } else {
          itemNode.status = 'choice-required';
          decisions.set(id, {
            id, name: name(id), quantity: deficit,
            candidates: valid.map(candidate => ({
              recipeId: candidate.recipeId,
              recipeName: name(candidate.recipeId),
              yieldCount: candidate.yieldCount,
              assumed: candidate.assumedYield
            }))
          });
          addFlag('ambiguous-producer'); addExternal(id, deficit, 'choice-required');
          continue;
        }
        itemNode.yieldCount = selectedProducer.yieldCount;
        itemNode.recipeId = selectedProducer.recipeId;
        itemNode.assumed = selectedProducer.assumedYield;
        if (itemNode.assumed) {
          addFlag('assumed-yield');
          notices.push(id + ': 제조식 이름 일치로 1개/회 산출을 가정했습니다.');
        }
        const needCount = Math.ceil(deficit / selectedProducer.yieldCount);
        if (!Number.isSafeInteger(needCount) || needCount > 1000000) {
          itemNode.status = 'unsafe-batches'; addFlag('unsafe-batches');
          addExternal(id, deficit, 'unsafe-batches');continue;
        }
        itemNode.neededBatches = needCount;
        itemNode.extra = needCount * selectedProducer.yieldCount - deficit;
        if (expandedNodes >= maxExpandedNodes) {
          itemNode.status = 'node-budget'; addFlag('node-budget');
          addExternal(id, deficit, 'node-budget');
          continue;
        }
        if (lineage.includes(selectedProducer.recipeId)) {
          itemNode.status = 'cycle'; addFlag('cycle');
          addExternal(id, deficit, 'cycle');
          notices.push('제조식 순환: ' + [...lineage, selectedProducer.recipeId].join(' → '));
          continue;
        }
        itemNode.status = 'manufactured';
        itemNode.children.push(expand(recipeMap.get(selectedProducer.recipeId), needCount,
          depth + 1, [...lineage, selectedProducer.recipeId], id, selectedProducer.yieldCount));
        // Production occurs after its ingredients have been accounted for.
        // Co-products and rounding surplus enter one shared stock ledger so
        // later branches can reuse them without creating another batch.
        const outputFields = recipeMap.get(selectedProducer.recipeId).fields || {};
        const outputs = selectedProducer.explicit && record(outputFields.producedItems)
          ? outputFields.producedItems : { [id]: selectedProducer.yieldCount };
        for (const [outputId, perBatchOutput] of Object.entries(outputs)) {
          const producedCount = perBatchOutput * needCount;
          if (!itemMap.has(outputId) || !positiveInt(perBatchOutput) ||
              !Number.isSafeInteger(producedCount)) {
            addFlag('untracked-or-invalid-output');
            notices.push(selectedProducer.recipeId + ': 산출물을 재고로 계산하지 않음: ' + outputId);
            continue;
          }
          addProduced(outputId, producedCount);
        }
        const satisfied = takeStock(id, deficit);
        if (satisfied.missing) {
          itemNode.status = 'unsatisfied-output'; addFlag('unsatisfied-output');
          addExternal(id, satisfied.missing, 'unsatisfied-output');
        }
        itemNode.surplusUsed += satisfied.fromSurplus;
        itemNode.inventoryUsed += satisfied.fromInitial;
      }
      return node;
    }
    const tree = expand(root, batches, 0, [root.id]);
    const research = researchClosure(recipesUsed);
    if (settings.saveDiscoveredResearchIds !== undefined) {
      if (!Array.isArray(settings.saveDiscoveredResearchIds) ||
          settings.saveDiscoveredResearchIds.length > 120000 ||
          settings.saveDiscoveredResearchIds.some(id => typeof id !== 'string' || !researchMap.has(id)))
        throw new Error('세이브의 2.1 discovered 연구 ID 목록이 유효하지 않습니다.');
      const discovered = new Set(settings.saveDiscoveredResearchIds);
      research.saveEvidence = {
        source: 'OXCE discovered list from locally selected v.o2 save',
        confirmed: 0, absent: 0
      };
      research.ids = research.ids.map(entry => {
        const found = discovered.has(entry.id);
        if (found) research.saveEvidence.confirmed++;
        else research.saveEvidence.absent++;
        return { ...entry, inSaveDiscovered: found };
      });
    }
    if (research.unresolved.length) addFlag('unresolved-research');
    if (research.cycles.length) addFlag('research-cycle');
    const costs = [...external.values()].map(entry => {
      const buy = itemMap.get(entry.id)?.fields?.costBuy;
      return {
        id: entry.id, name: entry.name, quantity: entry.quantity,
        reasons: [...entry.reasons].sort(),
        listedUnitBuy: nonnegative(buy) ? buy : null,
        listedBuySubtotal: nonnegative(buy) ? buy * entry.quantity : null
      };
    }).sort((a, b) => a.name.localeCompare(b.name, 'ko'));
    const knownBuySubtotal = costs.reduce((sum, e) => sum + (e.listedBuySubtotal ?? 0), 0);
    const pricedCount = costs.filter(e => e.listedBuySubtotal !== null).length;
    return {
      schema: 'xpiratez-v2-manufacture-plan/v1',
      rootRecipeId: recipeId, rootName: name(recipeId), requestedBatches: batches,
      maxDepth, assumeImplicit,
      tree, totals, research,
      external: costs, selections: [...decisions.values()],
      // Remaining manufactured stock includes explicit co-products and
      // surplus across all branches, rather than summing isolated overruns.
      extraOutputs: [...surplus].filter(([,quantity]) => quantity > 0)
        .map(([id, quantity]) => ({ id, name: name(id), quantity }))
        .sort((a,b) => a.name.localeCompare(b.name, 'ko')),
      inventory: {
        supplied: Object.fromEntries(Object.entries(initialInventory).filter(([,quantity]) => quantity > 0)),
        remaining: Object.fromEntries([...owned].filter(([,quantity]) => quantity > 0)),
        consumed: Object.fromEntries([...ledger].filter(([,r]) => r.initialUsed > 0)
          .map(([id,r]) => [id,r.initialUsed]))
      },
      consolidated: [...ledger].map(([id,r]) => ({
        ...r, remainingInventory: owned.get(id) || 0,
        remainingProduced: surplus.get(id) || 0,
        listedUnitBuy: nonnegative(itemMap.get(id)?.fields?.costBuy)
          ? itemMap.get(id).fields.costBuy : null
      })).sort((a,b) => a.name.localeCompare(b.name, 'ko')),
      priceReference: { knownBuySubtotal, pricedCount, totalCount: costs.length,
        declaredPlusFullyPricedReference: pricedCount === costs.length &&
          !flags.has('unspecified-cost') ? knownBuySubtotal + totals.declaredCost : null,
        caveat: '재고 차감 후 외부 조달에 남은 항목의 구매가 참고값입니다. 구매 가능 여부나 실제 총비용을 보증하지 않습니다.' },
      flags: [...flags].sort(), notices
    };
  }
  function compareAlternatives(rootRecipeId, itemId, settings = {}) {
    if (!recipeMap.has(rootRecipeId)) throw new Error('알 수 없는 제조식: ' + rootRecipeId);
    if (!itemMap.has(itemId)) throw new Error('알 수 없는 2.1 재료 ID: ' + itemId);
    const assumeImplicit = settings.assumeImplicit === true;
    const choices = record(settings.choices) ? settings.choices : {};
    const all = listProducers(itemId, assumeImplicit);
    const limit = settings.limit ?? 12;
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 20)
      throw new Error('경로 비교 최대 수는 1~20이어야 합니다.');
    // Direct recipe cost/yield only chooses a manageable display subset.
    // It is not a global optimum or a cost ranking.
    all.sort((a,b) => {
      const pa = a.costPerBatch === null ? Infinity : a.costPerBatch / a.yieldCount;
      const pb = b.costPerBatch === null ? Infinity : b.costPerBatch / b.yieldCount;
      return pa - pb || a.recipeId.localeCompare(b.recipeId, 'en');
    });
    const candidates = all.slice(0, limit);
    const chosen = all.find(x => x.recipeId === choices[itemId]);
    if (chosen && !candidates.some(x => x.recipeId === chosen.recipeId))
      candidates[candidates.length - 1] = chosen;
    const rows = candidates.map(candidate => {
      // Each scenario owns fresh stock and surplus maps. One alternative
      // cannot consume another alternative's generated output or initial stock.
      const result = plan(rootRecipeId, {
        ...settings, choices: { ...choices, [itemId]: candidate.recipeId }
      });
      return {
        ...candidate,
        declaredManufactureCost: result.totals.declaredCost,
        declaredManufactureTime: result.totals.declaredTime,
        manufacturedBatches: result.totals.batches,
        externalKinds: result.external.length,
        unpricedExternalKinds: result.priceReference.totalCount - result.priceReference.pricedCount,
        knownExternalBuyReference: result.priceReference.knownBuySubtotal,
        declaredPlusFullyPricedReference: result.priceReference.declaredPlusFullyPricedReference,
        flags: result.flags,
        remainingStock: result.inventory.remaining,
        surplus: result.extraOutputs
      };
    });
    return {
      rootRecipeId, itemId, itemName: name(itemId),
      totalCandidates: all.length, displayedCandidates: rows.length,
      truncated: all.length > rows.length,
      scenarios: rows,
      caveat: '각 후보를 동일한 시작 재고와 선택 조건으로 독립 계산합니다. 모든 후보를 비교한 결과가 아니며, 실제 획득·연구·구매 가능성과 최저 비용을 보증하지 않습니다.'
    };
  }
  return { plan, compareAlternatives, recipeMap, researchMap, itemMap, listProducers, name };
}
