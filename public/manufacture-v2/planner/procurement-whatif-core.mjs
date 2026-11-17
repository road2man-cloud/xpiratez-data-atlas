// What-if additions are virtual units acquired *before* additional-production
// scenarios start. No game save, browser storage or original inventory mutation.
import { simulateManufacturingQueue, buildProcurementChecklist } from './queue-core.mjs';

const isRecord = value => value !== null && typeof value === 'object' &&
  !Array.isArray(value);
const LIMIT = 10000000;
const shortageMap = list => new Map(list.map(row => [row.id, row.quantity]));
const sumQty = rows => rows.reduce((sum,row) => sum+row.quantity,0);

export function compareProcurementAcquisitions(
  planner, settings, context = {}, additions = {}, baselineReport = null
) {
  if (!isRecord(settings) || !isRecord(settings.inventory) || !isRecord(additions))
    throw new Error('기초 재고와 가상 확보량은 아이템별 수량 객체여야 합니다.');
  if (Object.keys(additions).length > 5000)
    throw new Error('가상 확보는 최대 5,000종까지 가능합니다.');
  const before = baselineReport ??
    simulateManufacturingQueue(planner,settings,context);
  if (before.schema !== 'xpiratez-v2-manufacture-next-batch-scenario/v1')
    throw new Error('2.1 제조 큐 결과가 아닙니다.');

  const inventory = { ...settings.inventory };
  const ordered = [];
  for(const [id,quantity] of Object.entries(additions)) {
    if (!planner.itemMap.has(id))
      throw new Error('2.1 아이템 목록에 없는 가상 확보 재료: ' + id);
    if (!Number.isSafeInteger(quantity) || quantity < 0 || quantity > LIMIT)
      throw new Error('가상 확보 수량은 0~10,000,000 사이의 정수여야 합니다: ' + id);
    const current = inventory[id] ?? 0;
    if (!Number.isSafeInteger(current) || current < 0 ||
      current > LIMIT || current + quantity > LIMIT)
      throw new Error('기존 재고와 가상 확보량의 합계가 제한을 초과합니다: ' + id);
    if (!quantity) continue;
    inventory[id] = current + quantity;
    const buy = planner.itemMap.get(id)?.fields?.costBuy;
    const unit = typeof buy === 'number' && Number.isFinite(buy) && buy >= 0
      ? buy : null;
    const subtotal = unit === null ? null : unit * quantity;
    ordered.push({
      id, name:planner.name(id), quantity,
      referenceUnitBuy:unit,
      referenceBuySubtotal:Number.isFinite(subtotal)?subtotal:null
    });
  }
  if(Object.keys(inventory).length>5000)
    throw new Error('시나리오의 전체 재고가 5,000종을 초과합니다.');
  const after = simulateManufacturingQueue(planner,{
    ...settings, inventory
  },context);
  const beforeList = buildProcurementChecklist(planner,before);
  const afterList = buildProcurementChecklist(planner,after);
  const beforeMap = shortageMap(before.external),afterMap=shortageMap(after.external);
  const allIds = new Set([...beforeMap.keys(),...afterMap.keys(),
    ...ordered.map(x=>x.id)]);
  const differences = [...allIds].map(id=>{
    const original = beforeMap.get(id)||0;
    const simulated = afterMap.get(id)||0;
    const input = ordered.find(x=>x.id===id)?.quantity||0;
    return {
      id,name:planner.name(id),added:input,
      before:original,after:simulated,
      shortageReduction:original-simulated
    };
  }).filter(x=>x.added || x.before!==x.after).sort((a,b)=>
    b.shortageReduction-a.shortageReduction ||
    b.added-a.added || a.id.localeCompare(b.id,'en'));
  const jobChanges = before.jobs.map((job,i)=>{
    const changed = after.jobs[i];
    if (!changed || changed.key !== job.key)
      throw new Error('가상 확보 비교 중 제조 주문 순서가 일치하지 않습니다.');
    return {
      key:job.key,position:i+1,
      recipeId:job.recipeId,name:job.name,
      beforeExternalKinds:job.external.length,
      afterExternalKinds:changed.external.length,
      beforeExternalUnits:sumQty(job.external),
      afterExternalUnits:sumQty(changed.external),
      beforeFutureOutputsBlocked:job.futureOutputsBlocked,
      afterFutureOutputsBlocked:changed.futureOutputsBlocked,
      remainingMissingFacilityFunctions:changed.missingFacilityFunctions,
      remainingNotDiscovered:changed.researchAbsentFromDiscovered,
      remainingCalculationFlags:changed.flags
    };
  });
  const priced = ordered.filter(x=>x.referenceBuySubtotal!==null);
  const referenceSubtotal = priced.reduce((acc,x)=>acc+x.referenceBuySubtotal,0);
  return {
    schema:'xpiratez-v2-procurement-whatif/v1',
    additions:ordered.sort((a,b)=>a.id.localeCompare(b.id,'en')),
    acquisitionReference:{
      knownReferenceSubtotal:referenceSubtotal,
      pricedKinds:priced.length,
      totalKinds:ordered.length,
      fullReference:priced.length===ordered.length?referenceSubtotal:null
    },
    before,after,
    summary:{
      beforeExternalKinds:before.external.length,
      afterExternalKinds:after.external.length,
      beforeExternalUnits:sumQty(before.external),
      afterExternalUnits:sumQty(after.external),
      beforeDeclaredManufactureCost:before.totals.manufactureCost,
      afterDeclaredManufactureCost:after.totals.manufactureCost,
      beforeDeclaredWork:before.totals.manufactureTime,
      afterDeclaredWork:after.totals.manufactureTime,
      jobsWithNoExternalMaterialsBefore:
        jobChanges.filter(x=>x.beforeExternalKinds===0).length,
      jobsWithNoExternalMaterialsAfter:
        jobChanges.filter(x=>x.afterExternalKinds===0).length
    },
    differences,jobChanges,
    beforeChecklist:beforeList,afterChecklist:afterList,
    note:'게임 세이브를 수정하지 않는 가상 재고 확보 시나리오입니다. 추가 재료가 실제로 구매·생산 가능한지 확인하지 않습니다. 부족 재료가 0이 되어도 시설·연구·이벤트 등 모든 조건이 충족된다는 뜻은 아닙니다. 계산된 제조비와 구매 참고가는 별개의 값입니다.'
  };
}
