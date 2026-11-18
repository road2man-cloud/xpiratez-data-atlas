// Additional bounded, hypothetical acquisition passes for one edited route.
// Each pass is recomputed against a COPY of the same manual stock and validated
// route options. New shortages are never merged with an unrelated candidate.
// Missing materials are not proof of market availability or manufacturing readiness.
import { calculateRouteAwareReadinessBatch } from './route-aware-readiness-batch.mjs';
import { compareExternalBasket } from './external-basket-core.mjs';
import { buildRouteAcquisitionLedger } from './route-acquisition-ledger.mjs';
import { buildManufacturingReadinessChecklist,
  compareManufacturingChecklists } from './manufacturing-readiness-checklist.mjs';

const MAX_ROUNDS=6;
const MAX_STOCK=10000000;
const MAX_ITEMS=5000;
const sumUnits=rows=>rows.reduce((sum,row)=>sum+row.quantity,0);
const copyRecord=object=>({...object});
const isObject=object=>object!==null && typeof object==='object' &&
  !Array.isArray(object);

export function expandRouteAwareReadinessBatch({
  planner,originalPlan,originalChecklist,routeBaseline,routeChecklist,
  inventory,choices,selectedIds,requestedQuantities,batches,maxDepth,
  assumeImplicit=false,saveDiscoveredResearchIds=null,evidenceForPlan,
  maxRounds=4
}) {
  if(!Number.isSafeInteger(maxRounds) || maxRounds<1 || maxRounds>MAX_ROUNDS)
    throw new Error('추가 부족 재료 반복 계산은 1~6단계까지만 가능합니다.');
  const initial=calculateRouteAwareReadinessBatch({
    planner,originalPlan,originalChecklist,routeBaseline,routeChecklist,
    inventory,choices,selectedIds,requestedQuantities,batches,maxDepth,
    assumeImplicit,saveDiscoveredResearchIds,evidenceForPlan
  });
  if(!isObject(inventory))throw new Error('원본 재고를 확인할 수 없습니다.');
  const base=copyRecord(inventory);
  // Start with precisely the user's explicit first-batch assumptions.
  const acquired=new Map(initial.basket.additions.map(x=>[x.id,x.quantity]));
  const history=[];
  const opts={
    batches,maxDepth,assumeImplicit,choices:copyRecord(choices),
    ...(saveDiscoveredResearchIds!==null?{saveDiscoveredResearchIds}:{})
  };
  let after=initial.after;
  let stopped='round-limit';
  for(let round=1;round<=maxRounds;round++){
    if(!after.external.length){stopped='no-unresolved-materials';break;}
    const next=new Map(acquired);
    const positiveKinds=new Set([
      ...Object.keys(base).filter(id=>base[id]>0),
      ...[...next].filter(([,quantity])=>quantity>0).map(([id])=>id)
    ]);
    const added=[];
    let rejectedKinds=0;
    for(const row of [...after.external].sort((a,b)=>a.id.localeCompare(b.id,'en'))){
      if(!planner.itemMap.has(row.id) ||
        !Number.isSafeInteger(row.quantity) || row.quantity<=0) {
        rejectedKinds++;continue;
      }
      const original=base[row.id]||0,previous=next.get(row.id)||0;
      if(!Number.isSafeInteger(original) || original<0 || original>MAX_STOCK ||
        !Number.isSafeInteger(previous) || previous<0 || previous>MAX_STOCK) {
        rejectedKinds++;continue;
      }
      if(original===0 && previous===0 && positiveKinds.size>=MAX_ITEMS){
        rejectedKinds++;continue;
      }
      const spare=MAX_STOCK-original-previous;
      if(spare<=0){rejectedKinds++;continue;}
      const quantity=Math.min(spare,row.quantity);
      if(quantity<=0)continue;
      next.set(row.id,previous+quantity);
      positiveKinds.add(row.id);
      added.push({id:row.id,name:row.name||planner.name(row.id),quantity,
        previouslyAcquired:previous,totalAcquired:previous+quantity,
        shortageBefore:row.quantity});
    }
    if(!added.length){
      stopped=rejectedKinds?'stock-or-item-limit':'no-progress';
      break;
    }
    const before=after.external.map(x=>({id:x.id,quantity:x.quantity}));
    const stock=copyRecord(base);
    for(const [id,quantity] of next)
      stock[id]=(stock[id]||0)+quantity;
    if(Object.keys(stock).filter(id=>stock[id]>0).length>MAX_ITEMS){
      stopped='item-limit';break;
    }
    // Run the whole edited recipe again with cumulative, not delta, stock.
    const recalculated=planner.plan(routeBaseline.rootRecipeId,{
      ...opts,inventory:stock
    });
    if(recalculated?.schema!=='xpiratez-v2-manufacture-plan/v1' ||
      recalculated.rootRecipeId!==routeBaseline.rootRecipeId)
      throw new Error('반복 계산에서 동일한 제조 목표를 유지할 수 없습니다.');
    history.push({
      round,
      shortageBefore:{kinds:before.length,units:sumUnits(before)},
      added,addedKinds:added.length,
      addedUnits:sumUnits(added),
      shortageAfter:{
        kinds:recalculated.external.length,units:sumUnits(recalculated.external)
      },
      newlyExposed:recalculated.external
        .filter(x=>!before.some(y=>y.id===x.id))
        .map(x=>({id:x.id,name:x.name,quantity:x.quantity}))
    });
    acquired.clear();
    for(const [id,quantity] of next)acquired.set(id,quantity);
    after=recalculated;
    if(!after.external.length){
      stopped='no-unresolved-materials';break;
    }
  }
  const starting=initial.report;
  const finalEvidence=evidenceForPlan(after);
  const finalChecklist=buildManufacturingReadinessChecklist(after,finalEvidence);
  const change=compareManufacturingChecklists(routeChecklist,finalChecklist);
  const initialById=new Map(initial.basket.additions.map(x=>[x.id,x.quantity]));
  const allAcquired=[...acquired].filter(([,quantity])=>quantity>0)
    .map(([id,quantity])=>{
      const unit=planner.itemMap.get(id)?.fields?.costBuy;
      const priced=typeof unit==='number' && Number.isFinite(unit)&&unit>=0;
      const reference=priced?unit*quantity:null;
      return {
        id,name:planner.name(id),quantity,
        previous:base[id]||0,target:(base[id]||0)+quantity,
        firstPass:initialById.get(id)||0,
        listedUnitBuy:priced?unit:null,
        listedBuyReference:Number.isFinite(reference)?reference:null
      };
    }).sort((a,b)=>a.id.localeCompare(b.id,'en'));
  const basketReport=compareExternalBasket(routeBaseline,after,{
    additions:allAcquired
  });
  basketReport.routeChoices=copyRecord(choices);
  basketReport.evidence=finalEvidence;
  basketReport.checklist=finalChecklist;
  const report={
    schema:'xpiratez-v2-route-aware-cascade/v1',
    sourceVersion:'v.o2',
    rootRecipeId:routeBaseline.rootRecipeId,
    routeChoices:copyRecord(choices),
    original:starting.original,
    routeOnly:starting.routeOnly,
    routeAndAcquisition:{
      shortageKinds:after.external.length,
      shortageUnits:sumUnits(after.external),
      declaredCost:after.totals.declaredCost,
      declaredTime:after.totals.declaredTime,
      flags:[...after.flags]
    },
    routeOnlyChanges:starting.routeOnlyChanges,
    acquisitionChanges:{
      added:change.added,removed:change.removed,changed:change.changed
    },
    acquiredHypothetically:allAcquired,
    initialAcquired:initial.report.acquiredHypothetically,
    additionalAcquired:allAcquired.filter(x=>x.quantity>x.firstPass)
      .map(x=>({...x,quantity:x.quantity-x.firstPass})),
    history,stopped,
    remainingExternal:after.external.map(x=>({
      id:x.id,name:x.name,quantity:x.quantity
    })),
    finalChecklist,
    editedRouteChecklist:routeChecklist,
    hypotheticalScenario:basketReport,
    stockDraft:allAcquired.map(x=>x.id+'='+x.target).join('\n'),
    caveat:'모든 재료는 가상 확보 가정이며 실제 구매·제조 가능성이나 시설·연구 조건 충족을 보장하지 않습니다. 각 반복 단계는 같은 원본 재고 및 편집 경로를 사용하며 게임 세이브를 변경하지 않습니다.'
  };
  report.acquisitionLedger=buildRouteAcquisitionLedger(report,base);
  return {report,after,initial,finalChecklist};
}
