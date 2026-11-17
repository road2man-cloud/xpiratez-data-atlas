// Hypothetical *additional* manufacturing rounds, never a reconstruction of
// the save's unfinished work. The saved 'spent' / 'amount' fields are not
// interpreted as remaining rounds, costs, or inventory already committed.
import { facilityReadiness } from './save-operations-core.mjs';

const validCount = value => Number.isSafeInteger(value) && value >= 1 && value <= 100;
const record = x => x && typeof x === 'object' && !Array.isArray(x);
const safeStock = amount => Number.isSafeInteger(amount) && amount >= 0 && amount <= 10000000;
const sumMap = (map,id,amount) => map.set(id,(map.get(id)||0)+amount);
const sorted = entries => entries.sort((a,b)=>a.id.localeCompare(b.id,'en'));
const toObject = map => Object.fromEntries([...map].filter(([,n])=>n>0));
const ensureBalance = (map,id,n) => {
  const value=(map.get(id)||0)+n;
  if(!safeStock(value))throw new Error('가상 제조 재고 한도 초과: '+id);
  if(value)map.set(id,value); else map.delete(id);
};


/**
 * Side-by-side *independent* scenarios for the same saved-order selection:
 * target recipe first vs target recipe last. Never mutate inventory, jobs,
 * or the selected local save. Differences are hypothetical shortage deltas.
 */
export function compareManufacturingQueueOrders(planner, settings={}, context={}, targetKey) {
  if (!Array.isArray(settings.jobs) || typeof targetKey!=='string')
    throw new Error('비교할 신규 주문과 가상 작업 목록이 필요합니다.');
  const targetJobs=settings.jobs.filter(job=>job.key===targetKey);
  if (targetJobs.length!==1)throw new Error('신규 제조 주문을 정확히 하나 선택해야 합니다.');
  const other=settings.jobs.filter(job=>job.key!==targetKey);
  const before=simulateManufacturingQueue(planner,{
    ...settings,jobs:[targetJobs[0],...other]
  },context);
  const after=simulateManufacturingQueue(planner,{
    ...settings,jobs:[...other,targetJobs[0]]
  },context);
  const all=new Set([...before.external.map(x=>x.id),...after.external.map(x=>x.id)]);
  const shortage=id=>({first:before.external.find(x=>x.id===id)?.quantity||0,
    last:after.external.find(x=>x.id===id)?.quantity||0});
  const differences=[...all].map(id=>{
    const values=shortage(id);
    return {id,name:planner.name(id),newFirst:values.first,newLast:values.last,
      lastMinusFirst:values.last-values.first};
  }).filter(x=>x.newFirst!==x.newLast).sort((a,b)=>
    Math.abs(b.lastMinusFirst)-Math.abs(a.lastMinusFirst) || a.id.localeCompare(b.id,'en'));
  return {
    schema:'xpiratez-v2-manufacture-queue-order-comparison/v1',
    targetKey,newFirst:before,newLast:after,differences,
    note:'두 순서는 동일한 시작 재고와 제조식 선택을 각각 독립적으로 가정 계산합니다. 외부 조달 부족량이 적다는 사실은 모든 시설/연구 조건을 충족하거나 글로벌 최저 비용이라는 뜻이 아닙니다.'
  };
}

export function simulateManufacturingQueue(planner, {
  jobs, inventory={}, maxDepth=2, choices={},
  assumeImplicit=false, saveDiscoveredResearchIds
}={}, {base=null,facilitiesIndex=null}={}) {
  if (!Array.isArray(jobs)||!jobs.length||jobs.length>32)
    throw new Error('모의 제조 주문은 1~32개여야 합니다.');
  if (!record(inventory)||Object.keys(inventory).length>5000)
    throw new Error('시작 재고 형식이 올바르지 않습니다.');
  if (!Number.isSafeInteger(maxDepth)||maxDepth<0||maxDepth>6)
    throw new Error('제조 단계는 0~6이어야 합니다.');
  const initial=new Map(), projected=new Map(), spentInitial=new Map(),
    spentProjected=new Map(), external=new Map(), totalDemand=new Map(),
    orderedRecipes=new Set(), totals={manufactureCost:0,manufactureTime:0,batches:0};
  for (const [id,n] of Object.entries(inventory)) {
    if (!planner.itemMap.has(id)||!safeStock(n))throw new Error('2.1 재고가 유효하지 않습니다: '+id);
    if(n)initial.set(id,n);
  }
  const seenIds=new Set();
  const reports=[];
  for(let index=0;index<jobs.length;index++) {
    const job=jobs[index];
    if (!job||typeof job.recipeId!=='string'||!planner.recipeMap.has(job.recipeId))
      throw new Error('모의 주문에 등록되지 않은 2.1 제조식이 있습니다.');
    if(!validCount(job.batches))throw new Error('모의 주문 횟수는 1~100이어야 합니다.');
    const identity=job.key??String(index);
    if(typeof identity!=='string'||seenIds.has(identity))
      throw new Error('모의 주문 키가 중복되거나 유효하지 않습니다.');
    seenIds.add(identity);
    const currentInventory=Object.create(null);
    for (const id of new Set([...initial.keys(),...projected.keys()])) {
      const total=(initial.get(id)||0)+(projected.get(id)||0);
      if(!safeStock(total))throw new Error('현재 가상 재고가 수량 한도를 초과합니다: '+id);
      if(total)currentInventory[id]=total;
    }
    const settings={
      batches:job.batches,maxDepth,choices,assumeImplicit,
      inventory:currentInventory,
      ...(saveDiscoveredResearchIds!==undefined ? {saveDiscoveredResearchIds}: {})
    };
    const step=planner.plan(job.recipeId,settings);
    totals.manufactureCost+=step.totals.declaredCost;
    totals.manufactureTime+=step.totals.declaredTime;
    totals.batches+=step.totals.batches;
    const consumed={starting:0,previouslyProduced:0};
    for(const [id,n] of Object.entries(step.inventory.consumed)){
      const starting=Math.min(n,initial.get(id)||0);
      const prev=n-starting;
      if (prev> (projected.get(id)||0))throw new Error('가상 재고 중복 사용: '+id);
      if(starting){ensureBalance(initial,id,-starting);sumMap(spentInitial,id,starting);}
      if(prev){ensureBalance(projected,id,-prev);sumMap(spentProjected,id,prev);}
      consumed.starting+=starting;consumed.previouslyProduced+=prev;
    }
    for(const x of step.consolidated)if(x.demand)sumMap(totalDemand,x.id,x.demand);
    for(const x of step.external)sumMap(external,x.id,x.quantity);
    const missingFacility=new Set();
    const missingResearch=new Set();
    const visited=new Set();
    const collectRecipe=node=>{
      if(node.kind!=='recipe')return;
      visited.add(node.id);orderedRecipes.add(node.id);
      for(const child of node.inputs||[])
        for(const dependent of child.children||[])collectRecipe(dependent);
    };
    collectRecipe(step.tree);
    const facilityEvidence=[];
    if(base&&facilitiesIndex)for(const id of visited){
      const analysis=facilityReadiness(base,facilitiesIndex,planner.recipeMap.get(id));
      facilityEvidence.push({id,needed:analysis.required,missing:analysis.missing});
      for(const fn of analysis.missing)missingFacility.add(fn);
    }
    for(const research of step.research.ids)
      if(research.inSaveDiscovered===false)missingResearch.add(research.id);
    const feasibleInputEvidence = step.external.length === 0 &&
      missingFacility.size === 0 && missingResearch.size === 0 &&
      !step.flags.some(x => ['invalid-quantity','unsupported-requiredItems','cycle',
        'unsafe-batches','node-budget','unsatisfied-output','ambiguous-producer',
        'unverified-outputs','assumed-yield'].includes(x));
    // Transfer only well-supported future output; missing facilities or
    // research evidence also block optimistic future stock reuse.
    if(feasibleInputEvidence)
      for(const x of step.extraOutputs)ensureBalance(projected,x.id,x.quantity);
    // The root recipe's explicitly declared, deterministic final outputs are
    // future hypothetical goods only, *not* items already in a save.
    const root=planner.recipeMap.get(job.recipeId);
    const rootFields=root.fields||{};
    const rootOutputItems=[];
    if(feasibleInputEvidence && record(rootFields.producedItems)&&!rootFields.randomProducedItems&&
      !rootFields.multipleRandomProducts) {
      for(const [id,perBatch] of Object.entries(rootFields.producedItems)) {
        const total=perBatch*job.batches;
        if(!planner.itemMap.has(id)||!Number.isSafeInteger(perBatch)||perBatch<=0||
          !safeStock(total))continue;
        ensureBalance(projected,id,total);
        rootOutputItems.push({id,name:planner.name(id),quantity:total});
      }
    }
    reports.push({
      key:identity,recipeId:job.recipeId,name:planner.name(job.recipeId),
      source:job.source==='saved'?'saved-order-hypothetical':'new-plan',
      savedOrderIndex:Number.isSafeInteger(job.savedOrderIndex)?job.savedOrderIndex:null,
      requestedBatches:job.batches,
      declaredCost:step.totals.declaredCost,declaredTime:step.totals.declaredTime,
      expandedBatches:step.totals.batches,
      startingStockUsed:consumed.starting,earlierPlannedStockUsed:consumed.previouslyProduced,
      external:step.external.map(x=>({id:x.id,name:x.name,quantity:x.quantity})),
      rootFutureOutputs:rootOutputItems,
      futureOutputsBlocked:!feasibleInputEvidence,
      researchAbsentFromDiscovered:[...missingResearch].sort(),
      missingFacilityFunctions:[...missingFacility].sort(),
      facilityEvidence,flags:step.flags,
      unpricedExternalKinds:step.priceReference.totalCount-step.priceReference.pricedCount,
      nestedPlan:step
    });
  }
  const materials=[...new Set([...initial.keys(),...projected.keys(),
    ...spentInitial.keys(),...spentProjected.keys(),...external.keys(),...totalDemand.keys()])]
    .map(id=>({
      id,name:planner.name(id),demand:totalDemand.get(id)||0,
      startingUsed:spentInitial.get(id)||0,
      earlierPlannedUsed:spentProjected.get(id)||0,
      externallyNeeded:external.get(id)||0,
      startingRemain:initial.get(id)||0,
      futureOutputRemain:projected.get(id)||0
    })).filter(x=>x.demand||x.startingUsed||x.earlierPlannedUsed||
      x.externallyNeeded||x.futureOutputRemain);
  return {
    schema:'xpiratez-v2-manufacture-next-batch-scenario/v1',
    scenarioType:'additional-production-only',
    jobs:reports,totals,
    materials:sorted(materials),
    external:sorted([...external].filter(([,amount])=>amount>0).map(([id,quantity])=>({
      id,name:planner.name(id),quantity
    }))),
    inventory:{
      remainingStarting:toObject(initial),futureUnspentOutputs:toObject(projected),
      usedStarting:toObject(spentInitial),usedFromEarlierHypothetical:toObject(spentProjected)
    },
    orderSequence:jobs.map(x=>x.key),
    caveat:'세이브에 이미 등록된 주문의 미완료 수량이나 기투입 재료를 재구성한 결과가 아닙니다. 선택한 주문의 추가 생산 1~100회와 신규 계획을 현재 재고에서 순서대로 가정 계산하며, 진행 주문의 원본 spent/amount/assigned를 차감하지 않습니다. 재료가 부족한 주문의 미확정 산출물은 다음 주문의 재고로 넘기지 않습니다. 시간은 명시된 작업량의 합이고 실제 완료 시각이 아닙니다.'
  };
}
