// Read-only cross-revision review priority and current dependency comparison.
// Priority is an inspection order, NEVER proof of in-game manufacturing readiness.
import {summarizeRouteHistoryImpact} from './route-history-impact.mjs';

const BOARD='xpiratez-v2-route-action-board/v1';
const FLOW='xpiratez-v2-route-material-workflow/v1';
const LEDGER='xpiratez-v2-route-acquisition-ledger/v1';
const RESULT='xpiratez-v2-route-history-priority/v1';
const compare=(a,b)=>a.localeCompare(b,'en');
const key=x=>typeof x==='string'&&x.length>0;
const unique=xs=>[...new Set(xs)].sort(compare);

export function buildRouteHistoryPriority({history,board,workflow,ledger,reviewed=[]}){
  const archive=summarizeRouteHistoryImpact(history);
  if(board?.schema!==BOARD||workflow?.schema!==FLOW||
     board.sourceVersion!=='v.o2'||workflow.sourceVersion!=='v.o2'||
     archive.rootRecipeId!==board.rootRecipeId||
     archive.rootRecipeId!==workflow.rootRecipeId||
     !Array.isArray(board.tasks)||board.tasks.length>6500||
     !Array.isArray(workflow.recipeSequenceAfter)||
     (ledger&&(ledger.schema!==LEDGER||ledger.sourceVersion!=='v.o2'||
       ledger.rootRecipeId!==archive.rootRecipeId||!Array.isArray(ledger.materials))))
    throw new Error('동일한 v.o2 제조 목표의 누적 기록·작업표·제조 순서가 필요합니다.');
  const checked=reviewed instanceof Set?reviewed:new Set(reviewed);
  const tasks=new Map();
  for(const row of board.tasks){
    if(!key(row?.id)||tasks.has(row.id)||!['recipe','material','condition'].includes(row.type)||
       !key(row.requirementId)||!Array.isArray(row.dependsOn))
      throw new Error('현재 제조 작업표의 ID 또는 선행 관계가 올바르지 않습니다.');
    tasks.set(row.id,row);
  }
  if([...checked].some(id=>!tasks.has(id)))
    throw new Error('현재 제조 작업표가 아닌 검토 표시를 사용할 수 없습니다.');
  const steps=new Map();
  for(const row of workflow.recipeSequenceAfter){
    if(!Number.isSafeInteger(row?.position)||row.position<1||
       !key(row.recipeId)||steps.has(row.position)||
       !Array.isArray(row.inputMaterials)||!Array.isArray(row.prerequisiteResearch))
      throw new Error('현재 제조 순서의 제조식 참조가 올바르지 않습니다.');
    steps.set(row.position,row);
  }
  const stock=new Map((ledger?.materials||[]).map(row=>[row.id,row]));
  const byRecipe=new Map(),conditionsByRecipe=new Map(),conditionsByRequirement=new Map();
  for(const row of board.tasks){
    if(row.type==='recipe'){
      const list=byRecipe.get(row.requirementId)||[];
      list.push(row);byRecipe.set(row.requirementId,list);
    }else if(row.type==='condition'){
      const requirements=conditionsByRequirement.get(row.requirementId)||[];
      requirements.push(row);
      conditionsByRequirement.set(row.requirementId,requirements);
      for(const recipeId of new Set(row.relatedRecipeIds||[])){
        const linked=conditionsByRecipe.get(recipeId)||[];
        linked.push(row);conditionsByRecipe.set(recipeId,linked);
      }
    }
  }
  const past=new Map();
  for(const entry of history.entries){
    for(const recipeId of unique(entry.affectedRecipeIds||[])){
      if(!past.has(recipeId))past.set(recipeId,{materials:new Map(),conditions:new Map()});
      const map=entry.type==='material'?past.get(recipeId).materials:
        entry.type==='condition'?past.get(recipeId).conditions:null;
      if(map&&(!map.has(entry.requirementId)||
        entry.revision>=map.get(entry.requirementId).revision)){
        map.set(entry.requirementId,{
          revision:entry.revision,quantity:entry.quantity,
          sourceStatus:entry.sourceStatus,oldId:entry.oldId
        });
      }
    }
  }
  const recipes=archive.recipes.map(h=>{
    const own=byRecipe.get(h.recipeId)||[];
    const materials=new Map(),conditions=new Map(),dependencies=new Set();
    const addMaterial=(id,kind=null,quantity=null)=>{
      if(!key(id))return;
      const row=tasks.get('material::'+id);
      const record=materials.get(id)||{
        id,label:row?.label||stock.get(id)?.name||id,
        currentTaskIds:[],inputStatuses:new Set(),directQuantities:new Set()
      };
      if(row&&!record.currentTaskIds.includes(row.id))record.currentTaskIds.push(row.id);
      if(kind)record.inputStatuses.add(kind);
      if(Number.isSafeInteger(quantity)&&quantity>=0)record.directQuantities.add(quantity);
      materials.set(id,record);
    };
    const addCondition=(id,row=null)=>{
      if(!key(id))return;
      const record=conditions.get(id)||{
        id,label:row?.label||id,currentTaskIds:new Set(),
        statuses:new Set()
      };
      if(row){
        record.currentTaskIds.add(row.id);record.statuses.add(row.sourceStatus);
        dependencies.add(row.id);
      }
      conditions.set(id,record);
    };
    for(const row of own){
      const seen=new Set(),stack=[row.id];
      while(stack.length){
        const id=stack.pop();
        if(seen.has(id))continue;
        seen.add(id);
        const found=tasks.get(id);
        if(!found)throw new Error('현재 제조 작업표의 선행 작업이 없습니다: '+id);
        if(id!==row.id)dependencies.add(id);
        if(found.type==='material')addMaterial(found.requirementId);
        if(found.type==='condition')addCondition(found.requirementId,found);
        for(const parentId of found.dependsOn)stack.push(parentId);
      }
      const position=Number(row.id.replace(/^recipe::/,''));
      const step=steps.get(position);
      if(step&&step.recipeId===row.requirementId){
        for(const input of step.inputMaterials)
          addMaterial(input.id,input.status,input.quantity);
        for(const researchId of step.prerequisiteResearch){
          const existing=conditionsByRequirement.get(researchId)||[];
          if(existing.length)for(const condition of existing)addCondition(researchId,condition);
          else addCondition(researchId);
        }
      }
    }
    for(const condition of conditionsByRecipe.get(h.recipeId)||[])
      addCondition(condition.requirementId,condition);
    const prior=past.get(h.recipeId)||{materials:new Map(),conditions:new Map()};
    const currentMaterials=[...materials.values()].map(row=>{
      const material=tasks.get('material::'+row.id);
      const stockRow=stock.get(row.id);
      const dependsOnMaterial=material&&dependencies.has(material.id);
      return {
        id:row.id,label:row.label,taskId:material?.id||null,
        reviewed:dependsOnMaterial?checked.has(material.id):null,
        sourceStatus:material?.sourceStatus||null,
        inputStatuses:unique([...row.inputStatuses]),
        directQuantities:[...row.directQuantities].sort((a,b)=>a-b),
        startingInventory:stockRow?.startingInventory??null,
        hypotheticalAcquisition:stockRow?.totalAcquisition??null,
        remainingShortage:stockRow?.remainingShortage??null,
        seenBefore:prior.materials.has(row.id),
        previousQuantity:prior.materials.get(row.id)?.quantity??null,
        previousSourceStatus:prior.materials.get(row.id)?.sourceStatus||null
      };
    }).sort((a,b)=>compare(a.id,b.id));
    const currentConditions=[...conditions.values()].map(row=>({
      id:row.id,label:row.label,
      taskIds:unique([...row.currentTaskIds]),
      statuses:unique([...row.statuses]),
      unreviewedTaskIds:unique([...row.currentTaskIds].filter(id=>!checked.has(id))),
      seenBefore:prior.conditions.has(row.id),
      previousSourceStatus:prior.conditions.get(row.id)?.sourceStatus||null
    })).sort((a,b)=>compare(a.id,b.id));
    const currentMaterialIds=new Set(currentMaterials.map(x=>x.id));
    const currentConditionIds=new Set(currentConditions.map(x=>x.id));
    const pendingMaterialCount=currentMaterials.filter(x=>x.taskId&&!x.reviewed).length;
    const pendingConditionCount=currentConditions.filter(x=>x.unreviewedTaskIds.length).length;
    const pendingRelatedTaskCount=dependencies.size?
      [...dependencies].filter(id=>!checked.has(id)).length:0;
    const repeated=h.revisionCount>=2;
    const priority=own.length===0?'historical':
      ((repeated&&pendingRelatedTaskCount>0)||h.revisionCount>=3)?'high':
      (repeated||pendingRelatedTaskCount>0)?'medium':'reference';
    return {
      recipeId:h.recipeId,priority,revisionCount:h.revisionCount,
      revisions:[...h.revisions],latestRevision:h.latestRevision,
      previousExcludedEntries:h.entries,previousNotes:h.notes,
      currentRecipeTaskIds:own.map(x=>x.id),
      currentRecipeCount:own.length,
      currentRecipeReviewed:own.filter(x=>checked.has(x.id)).length,
      pendingRelatedTaskCount,pendingMaterialCount,pendingConditionCount,
      historicalMaterialIds:[...prior.materials.keys()].sort(compare),
      historicalConditionIds:[...prior.conditions.keys()].sort(compare),
      currentMaterials,currentConditions,
      previousOnlyMaterialIds:[...prior.materials.keys()].filter(x=>!currentMaterialIds.has(x)).sort(compare),
      previousOnlyConditionIds:[...prior.conditions.keys()].filter(x=>!currentConditionIds.has(x)).sort(compare),
      previousOnlyMaterials:[...prior.materials].filter(([id])=>!currentMaterialIds.has(id))
        .map(([id,old])=>({id,previousQuantity:old.quantity,
          previousSourceStatus:old.sourceStatus,latestRevision:old.revision})).sort((a,b)=>compare(a.id,b.id)),
      previousOnlyConditions:[...prior.conditions].filter(([id])=>!currentConditionIds.has(id))
        .map(([id,old])=>({id,previousSourceStatus:old.sourceStatus,
          latestRevision:old.revision})).sort((a,b)=>compare(a.id,b.id)),
      currentOnlyMaterialIds:currentMaterials.filter(x=>!x.seenBefore).map(x=>x.id),
      currentOnlyConditionIds:currentConditions.filter(x=>!x.seenBefore).map(x=>x.id),
      caveat:'현재의 ID 관련성은 검토 참고이며 과거 제조식과 같은 조건 또는 실제 해금·획득을 보장하지 않습니다.'
    };
  });
  const order={high:0,medium:1,reference:2,historical:3};
  recipes.sort((a,b)=>order[a.priority]-order[b.priority]||
    b.revisionCount-a.revisionCount||
    b.pendingRelatedTaskCount-a.pendingRelatedTaskCount||
    b.previousExcludedEntries-a.previousExcludedEntries||
    b.latestRevision-a.latestRevision||compare(a.recipeId,b.recipeId));
  return {
    schema:RESULT,sourceVersion:'v.o2',rootRecipeId:archive.rootRecipeId,
    summary:{
      recipes:recipes.length,
      high:recipes.filter(x=>x.priority==='high').length,
      medium:recipes.filter(x=>x.priority==='medium').length,
      reference:recipes.filter(x=>x.priority==='reference').length,
      historical:recipes.filter(x=>x.priority==='historical').length
    },
    recipes,
    priorityRule:'현재 해당 제조식 존재 + 복수 변경 차수 및 미검토 선행 작업, 또는 3회 이상 변경이면 최우선. 반복 변경이나 미검토 선행 작업이 있으면 다음. 현재 없는 제조식은 참고로 분리.',
    caveat:'모든 우선순위는 사용자 검토 편의를 위한 참고 순서입니다. 실제 제조 가능 여부, 재료 구매 가능성, 연구·시설 충족 여부를 증명하지 않습니다.'
  };
}

export function routeHistoryPriorityCsvRows(report){
  if(report?.schema!==RESULT||report.sourceVersion!=='v.o2'||!Array.isArray(report.recipes))
    throw new Error('내보낼 우선 검토 분석이 올바르지 않습니다.');
  return [
    ['제조식 ID','우선순위','변경 차수 수','변경 차수 목록','과거 제외 기록',
      '현재 제조식 노드','현재 미검토 선행 작업','미검토 재료','미검토 조건',
      '과거 관련 재료','현재 관련 재료','과거에만 있는 재료',
      '과거 관련 조건','현재 관련 조건','과거에만 있는 조건'],
    ...report.recipes.map(x=>[
      x.recipeId,x.priority,x.revisionCount,x.revisions.join('; '),
      x.previousExcludedEntries,x.currentRecipeCount,x.pendingRelatedTaskCount,
      x.pendingMaterialCount,x.pendingConditionCount,
      x.historicalMaterialIds.join('; '),x.currentMaterials.map(m=>m.id).join('; '),
      x.previousOnlyMaterialIds.join('; '),
      x.historicalConditionIds.join('; '),x.currentConditions.map(c=>c.id).join('; '),
      x.previousOnlyConditionIds.join('; ')
    ])
  ];
}
export function routeHistoryPriorityDetailsCsvRows(report){
  if(report?.schema!==RESULT||report.sourceVersion!=='v.o2'||!Array.isArray(report.recipes))
    throw new Error('내보낼 우선 검토 분석이 올바르지 않습니다.');
  const rows=[['제조식 ID','종류','ID','현재 이름','현재 작업 ID','현재 검토 표시',
    '현재 상태 근거','입력 상태','입력 직접 수량','현재 입력 재고',
    '가상 확보 수량','남은 부족','과거 동일 ID 참조','과거 수량','과거 근거 상태']];
  for(const recipe of report.recipes){
    for(const item of recipe.currentMaterials)rows.push([
      recipe.recipeId,'material',item.id,item.label,item.taskId||'',
      item.reviewed===null?'참조만':item.reviewed?'검토됨':'미검토',
      item.sourceStatus||'',item.inputStatuses.join('; '),
      item.directQuantities.join('; '),item.startingInventory,
      item.hypotheticalAcquisition,item.remainingShortage,
      item.seenBefore?'예':'아니요',item.previousQuantity,item.previousSourceStatus||''
    ]);
    for(const item of recipe.currentConditions)rows.push([
      recipe.recipeId,'condition',item.id,item.label,item.taskIds.join('; '),
      !item.taskIds.length?'참조만':item.unreviewedTaskIds.length?'미검토':'검토됨',
      item.statuses.join('; '),'','',null,null,null,
      item.seenBefore?'예':'아니요',null,item.previousSourceStatus||''
    ]);
    for(const item of recipe.previousOnlyMaterials)rows.push([
      recipe.recipeId,'previous-only-material',item.id,'','','','','','',
      null,null,null,'과거에만 있음',item.previousQuantity,item.previousSourceStatus
    ]);
    for(const item of recipe.previousOnlyConditions)rows.push([
      recipe.recipeId,'previous-only-condition',item.id,'','','','','','',
      null,null,null,'과거에만 있음',null,item.previousSourceStatus
    ]);
  }
  return rows;
}
