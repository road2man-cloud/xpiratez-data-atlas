// Conservative evidence overlay for independent v.o2 route workbench plans.
// These are observations of saved base instances and research 'discovered',
// NOT a determination of engine unlocks or manufacturing readiness.
import { facilityReadiness } from './save-operations-core.mjs';

const strings = value => typeof value==='string' ? [value] :
  Array.isArray(value) ? value.filter(x=>typeof x==='string') : [];
const unique = values=>[...new Set(values)].sort((a,b)=>a.localeCompare(b,'en'));
const emptyCounts = () => ({confirmed:0,pending:0,notObserved:0,unverified:0});
function treeRecipes(tree) {
  const results=new Set();
  const visit=(node)=>{
    if(!node || node.kind!=='recipe')return;
    results.add(node.id);
    for(const item of node.inputs||[])
      for(const child of item.children||[])visit(child);
  };
  visit(tree);
  return unique([...results]);
}
function observationStatus(need, info, canInspect) {
  if(!canInspect)return 'unverified';
  if(info.provided.includes(need))return 'confirmed';
  if(info.pending.includes(need))return 'pending';
  // Unknown saved facility types could supply functions absent from the
  // v.o2 index. Do not declare them definitely missing.
  if(info.unrecognizedFacilities.length)return 'unverified';
  return 'notObserved';
}
function tally(entries, counts) {
  for(const row of entries)counts[row.status]++;
  return counts;
}
export function summarizeRouteReadiness(plan, {
  recipeMap, researchMap, baseOperations=null, facilitiesIndex=null
}={}) {
  if(!plan || !plan.tree || !(recipeMap instanceof Map) ||
      !(researchMap instanceof Map))
    throw new Error('제조 계획과 2.1 연구·제조식 인덱스가 필요합니다.');
  const recipeIds=treeRecipes(plan.tree);
  const sourceAvailable=baseOperations!==null &&
    baseOperations.facilitiesPresent===true &&
    Array.isArray(facilitiesIndex?.facilities);
  const baseEvidenceSource=sourceAvailable?'saved-single-base':
    baseOperations===null?'no-single-base-selected':
    baseOperations.facilitiesPresent!==true?'save-facilities-not-provided':
    'facility-index-unavailable';
  const facilities=[], directResearch=[];
  const unknownFacilityIds=new Set();
  for(const id of recipeIds) {
    const recipe=recipeMap.get(id);
    if(!recipe)throw new Error('계산된 제조식이 2.1 제조 목록에 없습니다: '+id);
    const required=unique(strings(recipe.fields?.requiresBaseFunc));
    const statusInfo=facilityReadiness(baseOperations,facilitiesIndex,recipe);
    for(const id of statusInfo.unrecognizedFacilities)unknownFacilityIds.add(id);
    for(const fn of required) {
      facilities.push({
        recipeId:id,recipeName:recipe.koName||recipe.enName||id,
        functionId:fn,status:observationStatus(fn,statusInfo,sourceAvailable)
      });
    }
    const refs=unique([
      ...strings(recipe.fields?.requires),
      ...strings(recipe.links?.unlockedByResearch)
    ]);
    for(const ref of refs)directResearch.push({
      recipeId:id,recipeName:recipe.koName||recipe.enName||id,
      researchId:ref,
      status:researchMap.has(ref)?'declared-reference':'unknown-reference'
    });
  }
  const discoveredKnown=!!plan.research?.saveEvidence;
  const confirmedResearch=(plan.research?.ids||[]).map(row=>({
    id:row.id,name:row.name||row.id,
    status:discoveredKnown?(row.inSaveDiscovered?'confirmed':'notInDiscovered'):
      'unverified'
  }));
  const unresolvedResearch=unique(plan.research?.unresolved||[])
    .map(id=>({id,status:'unknown-reference'}));
  const facilityCounts=tally(facilities,emptyCounts());
  const researchCounts={
    confirmed:confirmedResearch.filter(x=>x.status==='confirmed').length,
    notInDiscovered:confirmedResearch.filter(x=>x.status==='notInDiscovered').length,
    unverified:confirmedResearch.filter(x=>x.status==='unverified').length,
    unresolved:unresolvedResearch.length
  };
  const priorities=[];
  for(const fn of facilities) {
    if(fn.status==='confirmed')continue;
    priorities.push({
      category:'facility',status:fn.status,recipeId:fn.recipeId,
      requirementId:fn.functionId,
      action:fn.status==='pending'?'건설 중 시설의 완공 여부 확인':
        fn.status==='notObserved'?'선택 기지에 기능 제공 시설이 있는지 확인':
        '완공 시설 및 규칙 제공 기능 근거 확인'
    });
  }
  for(const row of confirmedResearch) {
    if(row.status==='confirmed')continue;
    priorities.push({
      category:'research',status:row.status,requirementId:row.id,
      action:row.status==='notInDiscovered'?
        '세이브 discovered 목록에 없으므로 연구 및 해금 조건 확인':
        '세이브 discovered 연구 목록을 연결하여 대조'
    });
  }
  for(const row of unresolvedResearch)priorities.push({
    category:'research',status:'unknown-reference',requirementId:row.id,
    action:'규칙 참조 ID가 연구 인덱스에 있는지 확인'
  });
  return {
    schema:'xpiratez-v2-route-evidence/v1',
    recipeIds,
    facilityEvidenceSource:baseEvidenceSource,
    researchEvidenceSource:discoveredKnown?'saved-discovered':'no-discovered-data',
    facilities,facilityCounts,
    directResearch,
    research:confirmedResearch,researchCounts,
    unresolvedResearch,
    unrecognizedFacilityIds:unique([...unknownFacilityIds]),
    actions:priorities,
    caveat:'저장된 시설 및 discovered ID와 v.o2 명시 규칙만 대조합니다. 목록에 없다는 사실로 해금 실패 또는 제조 불가능을 확정하지 않습니다. 이벤트, 조건식 AND/OR, 인력 및 작업장 상태는 평가하지 않습니다.'
  };
}
export function compareRouteEvidence(left,right){
  if(left?.schema!=='xpiratez-v2-route-evidence/v1' ||
      right?.schema!==left.schema)
    throw new Error('같은 출처의 제조 증거 요약이 필요합니다.');
  const difference=(a,b)=>{
    const aSet=new Set(a),bSet=new Set(b);
    return {added:unique([...bSet].filter(x=>!aSet.has(x))),
      removed:unique([...aSet].filter(x=>!bSet.has(x)))};
  };
  return {
    recipes:difference(left.recipeIds,right.recipeIds),
    facilityRequirements:difference(
      left.facilities.map(row=>row.recipeId+'::'+row.functionId),
      right.facilities.map(row=>row.recipeId+'::'+row.functionId)),
    directResearchReferences:difference(
      left.directResearch.map(row=>row.recipeId+'::'+row.researchId),
      right.directResearch.map(row=>row.recipeId+'::'+row.researchId)),
    researchClosure:difference(
      [...left.research.map(row=>row.id),...left.unresolvedResearch.map(row=>row.id)],
      [...right.research.map(row=>row.id),...right.unresolvedResearch.map(row=>row.id)])
  };
}
