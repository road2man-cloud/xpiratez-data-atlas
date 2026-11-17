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
    const totals = { declaredCost: 0, declaredTime: 0, batches: 0 };
    const flags = new Set(), recipesUsed = new Set(), external = new Map();
    const decisions = new Map(), extraOutputs = new Map();
    const notices = [];
    let expandedNodes = 0;
    const maxExpandedNodes = 500;
    const addFlag = x => flags.add(x);
    const addExternal = (id, quantity, reason) => {
      const prev = external.get(id) || { id, name: name(id), quantity: 0, reasons: new Set() };
      prev.quantity += quantity; prev.reasons.add(reason); external.set(id, prev);
    };
    const uniqueOptions = new Map();
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
      for (const [id, perBatch] of Object.entries(f.requiredItems).sort(([a],[b]) => a.localeCompare(b, 'en'))) {
        if (!positiveInt(perBatch) || !Number.isSafeInteger(perBatch * count)) {
          node.inputs.push({ kind: 'unresolved', id, name: name(id), quantity: null,
            reason: '재료 수량을 계산할 수 없습니다.' });
          addFlag('invalid-quantity'); continue;
        }
        const quantity = perBatch * count;
        const valid = available(id, assumeImplicit);
        const all = producers.get(id) || [];
        const selected = Object.hasOwn(choices, id) ? choices[id] : undefined;
        const itemNode = { kind: 'item', id, name: name(id), quantity, producerCount: valid.length,
          alternatives: all.length, status: '', children: [], yieldCount: null,
          recipeId: null, neededBatches: null, assumed: false, extra: 0 };
        node.inputs.push(itemNode);
        const blocked = otherOptions(id);
        if (blocked.length && valid.length === 0) addFlag('unverified-outputs');
        if (depth >= maxDepth) {
          itemNode.status = 'depth-limit'; addFlag('depth-limit');
          addExternal(id, quantity, 'depth-limit'); continue;
        }
        if (selected === 'external') {
          itemNode.status = 'external-choice'; addExternal(id, quantity, 'user-external'); continue;
        }
        if (!valid.length) {
          itemNode.status = all.length ? 'unsupported-output' : 'external';
          addExternal(id, quantity, itemNode.status); continue;
        }
        let selectedProducer;
        if (typeof selected === 'string') {
          selectedProducer = valid.find(candidate => candidate.recipeId === selected);
          if (!selectedProducer) {
            itemNode.status = 'invalid-choice';
            addFlag('invalid-choice'); addExternal(id, quantity, 'invalid-choice');
            continue;
          }
        } else if (valid.length === 1) {
          selectedProducer = valid[0];
        } else {
          itemNode.status = 'choice-required';
          decisions.set(id, {
            id, name: name(id), quantity,
            candidates: valid.map(candidate => ({
              recipeId: candidate.recipeId,
              recipeName: name(candidate.recipeId),
              yieldCount: candidate.yieldCount,
              assumed: candidate.assumedYield
            }))
          });
          addFlag('ambiguous-producer'); addExternal(id, quantity, 'choice-required');
          continue;
        }
        itemNode.yieldCount = selectedProducer.yieldCount;
        itemNode.recipeId = selectedProducer.recipeId;
        itemNode.assumed = selectedProducer.assumedYield;
        if (itemNode.assumed) {
          addFlag('assumed-yield');
          notices.push(id + ': 제조식 이름 일치로 1개/회 산출을 가정했습니다.');
        }
        const needCount = Math.ceil(quantity / selectedProducer.yieldCount);
        if (!Number.isSafeInteger(needCount) || needCount > 1000000) {
          itemNode.status = 'unsafe-batches'; addFlag('unsafe-batches');
          addExternal(id, quantity, 'unsafe-batches');continue;
        }
        itemNode.neededBatches = needCount;
        itemNode.extra = needCount * selectedProducer.yieldCount - quantity;
        if (itemNode.extra) extraOutputs.set(id, (extraOutputs.get(id) || 0) + itemNode.extra);
        if (expandedNodes >= maxExpandedNodes) {
          itemNode.status = 'node-budget'; addFlag('node-budget');
          addExternal(id, quantity, 'node-budget');
          continue;
        }
        if (lineage.includes(selectedProducer.recipeId)) {
          itemNode.status = 'cycle'; addFlag('cycle');
          addExternal(id, quantity, 'cycle');
          notices.push('제조식 순환: ' + [...lineage, selectedProducer.recipeId].join(' → '));
          continue;
        }
        itemNode.status = 'manufactured';
        itemNode.children.push(expand(recipeMap.get(selectedProducer.recipeId), needCount,
          depth + 1, [...lineage, selectedProducer.recipeId], id, selectedProducer.yieldCount));
      }
      return node;
    }
    const tree = expand(root, batches, 0, [root.id]);
    const research = researchClosure(recipesUsed);
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
      extraOutputs: [...extraOutputs].map(([id, quantity]) => ({ id, name: name(id), quantity })),
      priceReference: { knownBuySubtotal, pricedCount, totalCount: costs.length,
        caveat: '기존 구매가 수치의 참고 합계일 뿐, 실제 구매 가능 여부나 총비용이 아닙니다.' },
      flags: [...flags].sort(), notices
    };
  }
  return { plan, recipeMap, researchMap, itemMap, listProducers, name };
}
