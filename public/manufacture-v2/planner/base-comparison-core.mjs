// Compare the same hypothetical manufacturing target at each SAVED base.
// No transfers, no shared stock, no guessing engine facility defaults.
// Only v.o2 catalogue entries are admissible.
import { facilityReadiness } from './save-operations-core.mjs';

const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const MAX_BASES = 32, MAX_KINDS = 5000, MAX_UNITS = 10000000;
const positiveInt = value => Number.isSafeInteger(value) && value > 0;
const stableSorted = items => [...new Set(items)].sort((a,b)=>a.localeCompare(b,'en'));
const count = rows => rows.reduce((sum,row)=>sum+row.quantity,0);
function recipeIds(tree) {
  const ids = new Set();
  const visit = node => {
    if (!node || node.kind !== 'recipe') return;
    ids.add(node.id);
    for(const input of node.inputs || []) for(const child of input.children || []) visit(child);
  };
  visit(tree);
  return stableSorted([...ids]);
}
function validatedBaseInventory(planner,base,index) {
  if (!base || !isRecord(base.items) || !Array.isArray(base.facilities))
    throw new Error((index+1)+'번 기지의 저장 재고·시설 자료가 유효하지 않습니다.');
  const ids=Object.keys(base.items);
  if(ids.length>MAX_KINDS)throw new Error('기지 저장 재고 종류가 '+MAX_KINDS+'종을 초과합니다.');
  const inventory={};
  for(const id of ids) {
    const quantity=base.items[id];
    if(!planner.itemMap.has(id)) throw new Error('2.1 아이템이 아닌 기지 재고: '+id);
    if(!Number.isSafeInteger(quantity)||quantity<0||quantity>MAX_UNITS)
      throw new Error('세이브 재고 수량이 허용 범위를 벗어났습니다: '+id);
    if(quantity) inventory[id]=quantity;
  }
  return inventory;
}

export function compareV2ManufacturingBases(planner, facilitiesIndex, bases, settings={}) {
  if (!Array.isArray(bases) || !bases.length || bases.length>MAX_BASES)
    throw new Error('비교할 기지는 1~32개여야 합니다.');
  if (!facilitiesIndex || facilitiesIndex.meta?.schema!=='xpiratez-v2-mod-facilities/v1' ||
      facilitiesIndex.meta?.sourceVersion!=='v.o2')
    throw new Error('2.1 시설 규칙 인덱스가 필요합니다.');
  const {recipeId,batches=1,maxDepth=2,choices={},assumeImplicit=false,
    saveDiscoveredResearchIds} = settings;
  if (!planner.recipeMap.has(recipeId)) throw new Error('2.1 제조식을 선택해야 합니다.');
  if (!positiveInt(batches)||batches>100) throw new Error('제조 횟수는 1~100이어야 합니다.');
  if (!Number.isSafeInteger(maxDepth)||maxDepth<0||maxDepth>6)
    throw new Error('제조 단계는 0~6이어야 합니다.');
  if (saveDiscoveredResearchIds!==undefined &&
    (!Array.isArray(saveDiscoveredResearchIds) ||
     saveDiscoveredResearchIds.length>120000))
    throw new Error('세이브 발견 연구 목록이 유효하지 않습니다.');

  const rows=bases.map((base,index)=>{
    const inventory=validatedBaseInventory(planner,base,index);
    const plan=planner.plan(recipeId,{
      batches,maxDepth,choices,assumeImplicit,inventory,
      ...(saveDiscoveredResearchIds!==undefined?{saveDiscoveredResearchIds}:{})
    });
    const activeRecipes=recipeIds(plan.tree);
    const required=new Set(), missing=new Set(), pending=new Set(),
      unrecognized=new Set(), recipeEvidence=[];
    if (base.facilitiesPresent===true) for(const id of activeRecipes){
      const facility=facilityReadiness(base,facilitiesIndex,planner.recipeMap.get(id));
      for(const fn of facility.required)required.add(fn);
      for(const fn of facility.missing)missing.add(fn);
      for(const fn of facility.pending)pending.add(fn);
      for(const name of facility.unrecognizedFacilities)unrecognized.add(name);
      recipeEvidence.push({
        id,required:facility.required,missing:facility.missing,
        underConstruction:facility.required.filter(fn=>facility.pending.includes(fn))
      });
    }
    const research=plan.research.saveEvidence;
    const unconfirmed=research?plan.research.ids.filter(x=>x.inSaveDiscovered===false)
      .map(x=>x.id):[];
    const flags=plan.flags;
    return {
      index,name:typeof base.name==='string'?base.name:'기지 '+(index+1),
      inventoryKinds:Object.keys(inventory).length,
      facilitiesCount:base.facilities.length,ordersInSave:base.productions?.length??0,
      sourceScope:'one-base-only',
      externalKinds:plan.external.length,
      externalUnits:count(plan.external),
      external:plan.external.map(({id,name,quantity,reasons})=>({id,name,quantity,reasons})),
      manufacturingCost:plan.totals.declaredCost,
      manufacturingTime:plan.totals.declaredTime,
      manufacturingBatches:plan.totals.batches,
      existingStockConsumed:plan.inventory.consumed,
      requiredFunctions:stableSorted([...required]),
      missingFunctions:stableSorted([...missing]),
      functionsUnderConstruction:stableSorted([...pending].filter(x=>required.has(x))),
      unrecognizedFacilities:stableSorted([...unrecognized]),
      facilityEvidenceState:base.facilitiesPresent===true?'saved-facilities':'unknown',
      researchEvidenceState:research?'saved-discovered':'unknown',
      unmatchedResearch:stableSorted(unconfirmed),
      unresolvedResearch:plan.research.unresolved,
      ruleFlags:flags,
      usedRecipes:activeRecipes,
      recipeEvidence,
      caveat:'세이브에 이미 진행 중인 제조 주문의 예약 재료나 물류를 차감하지 않은 추가 생산 가정입니다.'
    };
  });
  const sortedByMaterialShortage=rows.map(x=>x.index).sort((a,b)=>{
    const x=rows[a],y=rows[b];
    return x.externalUnits-y.externalUnits||x.externalKinds-y.externalKinds||a-b;
  });
  const observedMinimumUnits=Math.min(...rows.map(x=>x.externalUnits));
  // A per-material shortage matrix: quantities remain isolated per base.
  // Missing entries are 0 for that independent base, never a transfer.
  const crossBaseItems=new Map();
  for(const row of rows) for(const item of row.external){
    const previous=crossBaseItems.get(item.id)||{
      id:item.id,name:item.name,byBase:Array(rows.length).fill(0)
    };
    previous.byBase[row.index]=item.quantity;
    crossBaseItems.set(item.id,previous);
  }
  const shortageMatrix=[...crossBaseItems.values()].map(item=>{
    const minimum=Math.min(...item.byBase),maximum=Math.max(...item.byBase);
    return {
      ...item,minimum,maximum,spread:maximum-minimum,
      basesWithoutShortage:item.byBase.flatMap((n,index)=>n===0?[index]:[]),
      basesWithShortage:item.byBase.flatMap((n,index)=>n>0?[index]:[])
    };
  }).sort((a,b)=>b.spread-a.spread || b.maximum-a.maximum ||
    a.id.localeCompare(b.id,'en'));
  return {
    schema:'xpiratez-v2-independent-base-manufacturing/v1',sourceVersion:'v.o2',
    recipeId,recipeName:planner.name(recipeId),batches,maxDepth,
    results:rows,sortedByMaterialShortage,shortageMatrix,
    minimumObservedExternalUnits:observedMinimumUnits,
    caution:'모든 기지의 재고를 별도로 사용한 독립 계산입니다. 최저 부족량은 해당 제조식과 현재 설정에서 계산한 재료 부족만 비교한 것으로, 최적 제조 기지 선정이나 실제 생산 가능성을 의미하지 않습니다. 시설 기능·연구·이벤트·기존 작업 예약 재고·수송 가능성은 별도 조건입니다.'
  };
}
