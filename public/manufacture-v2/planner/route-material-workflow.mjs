// Read-only action guide for a SINGLE edited-route manufacturing scenario.
// Groups external-material assumptions by grounded v.o2 planner reasons,
// and lists expanded recipe occurrences in dependency-first order.
// This is not an engine execution schedule or a claim that resources can
// be purchased, acquired or manufactured.
const SCHEMA='xpiratez-v2-route-aware-cascade/v1';
const LEDGER_SCHEMA='xpiratez-v2-route-acquisition-ledger/v1';
const SOURCE_INFO={
  'user-external':{
    id:'explicit-external',label:'직접 외부 조달 선택',
    action:'선택한 외부 확보 경로의 실제 획득 방법 확인'
  },
  'choice-required':{
    id:'choice-needed',label:'복수 제조 경로 선택 필요',
    action:'재료의 하위 제조식을 직접 선택하거나 외부 조달 선택'
  },
  'invalid-choice':{
    id:'route-invalid',label:'선택한 제조 경로 불일치',
    action:'제조 경로 선택을 현재 규칙에 맞게 수정'
  },
  'cycle':{
    id:'route-stalled',label:'제조식 순환',
    action:'순환되는 제조식을 다른 경로로 처리'
  },
  'node-budget':{
    id:'route-stalled',label:'제조 계산 확장 상한',
    action:'제조 확장 범위를 줄이고 누락된 경로 확인'
  },
  'unsafe-batches':{
    id:'route-stalled',label:'제조 수량 상한',
    action:'필요 생산 횟수의 계산 가능 범위 확인'
  },
  'unsatisfied-output':{
    id:'route-stalled',label:'제조 산출 부족',
    action:'원본 산출 수량과 부산물 사용 결과 확인'
  },
  'depth-limit':{
    id:'depth-limit',label:'하위 제조 단계 제한',
    action:'더 깊은 하위 제조 경로 또는 외부 확보 방법 확인'
  },
  'unsupported-output':{
    id:'unverified-output',label:'제조 산출 규칙 미검증',
    action:'규칙의 명시 산출물·확률적 산출 조건 확인'
  },
  'external':{
    id:'no-producer',label:'명시 제조식 없이 외부 필요',
    action:'실제 조달·전리품·이벤트 경로가 존재하는지 확인'
  }
};
const priority=[
  'route-invalid','route-stalled','choice-needed','depth-limit',
  'unverified-output','explicit-external','no-producer','unverified'
];
const reasonPriority=[
  'invalid-choice','cycle','node-budget','unsafe-batches',
  'unsatisfied-output','choice-required','depth-limit',
  'unsupported-output','user-external','external'
];
const groupLabels={
  'route-invalid':'선택한 경로 오류',
  'route-stalled':'제조 계산 중단/제약',
  'choice-needed':'복수 제조 경로 선택',
  'depth-limit':'제조 확장 깊이 제한',
  'unverified-output':'제조 산출 근거 미확인',
  'explicit-external':'사용자 지정 외부 조달',
  'no-producer':'명시 제조식 없이 외부 필요',
  unverified:'추가 조달 근거 확인'
};
const safeString=x=>typeof x==='string' && x.length>0;
const asArray=x=>Array.isArray(x)?x:[];
const sortStrings=(a,b)=>a.localeCompare(b,'en');
const isCount=x=>Number.isSafeInteger(x)&&x>=0;
const normReason=r=>safeString(r)?r:'unknown';
const idCompare=(a,b)=>sortStrings(a.id,b.id);

function groundedMaterialInfo(reasons){
  const known=[...new Set(reasons.map(normReason))];
  const reason=reasonPriority.find(key=>known.includes(key));
  return reason?{
    ...SOURCE_INFO[reason],reasonIds:known.sort(sortStrings)
  }:{
    id:'unverified',label:'조달 근거 추가 확인',
    action:'현재 확장된 제조 경로에서 재료의 실제 확보 방법 확인',
    reasonIds:known.sort(sortStrings)
  };
}
function recipeOrder(plan) {
  if(!plan?.tree || plan.tree.kind!=='recipe')
    throw new Error('제조식 의존관계 트리를 확인할 수 없습니다.');
  const steps=[];
  let nodes=0;
  const visit=(recipe,depth,viaItem)=>{
    if(!recipe || recipe.kind!=='recipe' || !safeString(recipe.id) ||
      !Number.isSafeInteger(recipe.count)||recipe.count<1 ||depth>6)
      throw new Error('제조 순서에 잘못된 제조식 노드가 있습니다.');
    if(++nodes>500)throw new Error('제조 순서 표시 상한 500개를 초과했습니다.');
    const children=[];
    const inputs=[];
    for(const material of asArray(recipe.inputs)){
      if(material.kind!=='item' && material.kind!=='unresolved')continue;
      inputs.push({
        id:material.id,name:material.name||material.id,
        quantity:Number.isSafeInteger(material.quantity)?material.quantity:null,
        status:material.status||'unresolved',
        inventoryUsed:Number.isSafeInteger(material.inventoryUsed)?
          material.inventoryUsed:null,
        surplusUsed:Number.isSafeInteger(material.surplusUsed)?
          material.surplusUsed:null
      });
      for(const child of asArray(material.children)){
        if(child.kind!=='recipe')continue;
        children.push(visit(child,depth+1,material.id));
      }
    }
    const position=steps.length+1;
    steps.push({
      position,recipeId:recipe.id,recipeName:recipe.name||recipe.id,
      batches:recipe.count,depth,viaItem:viaItem||null,
      declaredCost:typeof recipe.cost==='number'&&Number.isFinite(recipe.cost)?
        recipe.cost:null,
      declaredTime:typeof recipe.time==='number'&&Number.isFinite(recipe.time)?
        recipe.time:null,
      prerequisiteResearch:asArray(recipe.prerequisites).filter(safeString),
      inputMaterials:inputs,prerequisiteStepNumbers:children,
      orderingRule:'expanded-child-before-parent'
    });
    return position;
  };
  visit(plan.tree,0,null);
  return steps;
}
function recipeCounts(steps){
  const totals=new Map();
  for(const row of steps){
    const previous=totals.get(row.recipeId)||{
      recipeId:row.recipeId,name:row.recipeName,occurrences:0,batches:0
    };
    previous.occurrences++;
    previous.batches+=row.batches;
    totals.set(row.recipeId,previous);
  }
  return totals;
}
export function buildRouteMaterialWorkflow({report,routeBaseline,finalPlan}){
  const ledger=report?.acquisitionLedger;
  if(report?.schema!==SCHEMA || ledger?.schema!==LEDGER_SCHEMA ||
    report.rootRecipeId!==ledger.rootRecipeId ||
    routeBaseline?.rootRecipeId!==report.rootRecipeId ||
    finalPlan?.rootRecipeId!==report.rootRecipeId ||
    !Array.isArray(routeBaseline.external)||!Array.isArray(finalPlan.external))
    throw new Error('같은 제조 목표의 조달 원장과 제조 경로가 필요합니다.');
  const evidence=new Map();
  const introduce=(rows,stage)=>{
    for(const row of rows){
      if(!safeString(row.id))continue;
      const known=evidence.get(row.id)||{
        firstObservedStage:stage,reasons:new Set()
      };
      for(const reason of asArray(row.reasons))
        known.reasons.add(normReason(reason));
      evidence.set(row.id,known);
    }
  };
  introduce(routeBaseline.external,0);
  for(const [i,history] of report.history.entries()){
    introduce(history.shortageBeforeDetails||[],i+1);
    introduce(history.newlyExposed||[],i+1);
  }
  introduce(finalPlan.external,report.history.length+1);
  const materialRows=ledger.materials.map(row=>{
    const fact=evidence.get(row.id);
    const info=groundedMaterialInfo([...(fact?.reasons||[])]);
    const origin=row.initialAcquisition>0?'initial-selected':
      row.rounds.some(x=>x>0)?'later-round':
      'unresolved-only';
    return {
      id:row.id,name:row.name,
      origin,firstObservedStage:fact?.firstObservedStage??null,
      categoryId:info.id,categoryLabel:info.label,
      reasonIds:info.reasonIds,action:info.action,
      startingInventory:row.startingInventory,
      initialAcquisition:row.initialAcquisition,
      additionalAcquisition:row.totalAcquisition-row.initialAcquisition,
      totalAcquisition:row.totalAcquisition,
      hypotheticalStockTarget:row.hypotheticalStockTarget,
      remainingShortage:row.remainingShortage,
      referenceUnitBuy:row.referenceUnitBuy,
      referenceSubtotal:row.referenceSubtotal,
      availability:'unverified'
    };
  });
  const groups=priority.map(id=>{
    const entries=materialRows.filter(x=>x.categoryId===id);
    const info=entries[0];
    return {
      id,label:groupLabels[id],
      kinds:entries.length,
      acquiredUnits:entries.reduce((n,x)=>n+x.totalAcquisition,0),
      remainingUnits:entries.reduce((n,x)=>n+x.remainingShortage,0)
    };
  }).filter(x=>x.kinds>0);
  const originalSteps=recipeOrder(routeBaseline);
  const afterSteps=recipeOrder(finalPlan);
  const originalCounts=recipeCounts(originalSteps);
  const newCounts=recipeCounts(afterSteps);
  const recipeChanges=[...new Set([...originalCounts.keys(),...newCounts.keys()])]
    .sort(sortStrings).map(id=>{
      const a=originalCounts.get(id),b=newCounts.get(id);
      return {
        recipeId:id,name:b?.name||a?.name||id,
        beforeOccurrences:a?.occurrences||0,
        afterOccurrences:b?.occurrences||0,
        beforeBatches:a?.batches||0,
        afterBatches:b?.batches||0
      };
    }).filter(x=>x.beforeBatches!==x.afterBatches ||
      x.beforeOccurrences!==x.afterOccurrences);
  const used=finalPlan.inventory?.consumed||{};
  const stockConsumption=Object.entries(used)
    .filter(([id,n])=>safeString(id)&&isCount(n)&&n>0)
    .map(([id,quantity])=>({
      id,name:materialRows.find(x=>x.id===id)?.name||id,
      quantityFromPlannedStock:quantity,
      caveat:'기존 재고와 가상 추가 재고를 구별하지 않는 계획상 차감량'
    })).sort(idCompare);
  return {
    schema:'xpiratez-v2-route-material-workflow/v1',
    sourceVersion:'v.o2',rootRecipeId:report.rootRecipeId,
    procurementGroups:groups,materials:materialRows,
    recipeSequenceBefore:originalSteps,recipeSequenceAfter:afterSteps,
    recipeChanges,stockConsumption,
    summary:{
      materialKinds:materialRows.length,groups:groups.length,
      hypotheticalAcquisitionUnits:ledger.summary.totalAcquiredUnits,
      remainingShortageUnits:ledger.summary.remainingShortageUnits,
      plannedRecipeOccurrences:afterSteps.length,
      originalRecipeOccurrences:originalSteps.length,
      changedRecipeKinds:recipeChanges.length,
      modelStockConsumptionKinds:stockConsumption.length
    },
    caveat:'조달 분류는 규칙의 external reasons만 반영하고, 확보 가능 여부는 모두 미검증입니다. 제조식 순서는 확장된 트리의 자식→부모 의존관계만 표시하며 실제 엔진의 일정·시설·연구·시간 순서는 아닙니다. 계획상 재고 차감은 기존 재고와 가상 확보분을 구별할 수 없습니다.'
  };
}

export function routeMaterialWorkflowCsvRows(workflow){
  if(workflow?.schema!=='xpiratez-v2-route-material-workflow/v1' ||
    !Array.isArray(workflow.materials)||!Array.isArray(workflow.recipeSequenceAfter))
    throw new Error('경로별 조달·제조 순서가 유효하지 않습니다.');
  const header=['종류','순서','아이템/제조식 ID','이름','조달 사유',
    '확인할 작업','현재 재고','가상 추가 확보','남은 부족','제조 횟수',
    '하위 제조식 선행 순서','명시 제조비','명시 작업량','참고 사항'];
  const rows=[header];
  for(const row of workflow.materials)rows.push([
    '재료',row.firstObservedStage??'',row.id,row.name,
    row.categoryLabel,row.action,row.startingInventory,row.totalAcquisition,
    row.remainingShortage,'','','','','구매 가능성 미확인'
  ]);
  for(const step of workflow.recipeSequenceAfter)rows.push([
    '제조식',step.position,step.recipeId,step.recipeName,'하위 제조식 우선',
    '선행 제조식·재료·연구·시설 확인','','','',
    step.batches,step.prerequisiteStepNumbers.join('; '),
    step.declaredCost,step.declaredTime,
    '게임 실행 순서 미검증'
  ]);
  return rows;
}
