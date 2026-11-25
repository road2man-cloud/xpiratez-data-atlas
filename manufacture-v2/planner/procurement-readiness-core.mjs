// Evidence matrix for a hypothetical X-Piratez v.o2 manufacturing queue.
// Not a factory-availability oracle: separate observed save holdings from
// virtual acquisitions and keep research/facility checks explicitly partial.
const nonnegativeInt = n => Number.isSafeInteger(n) && n >= 0;
const list = value => Array.isArray(value) ? value : [];
const n = value => nonnegativeInt(value) ? value : 0;
const GROUPED_RULE_FLAGS = new Set([
  'invalid-quantity','unsupported-requiredItems','untracked-or-invalid-output',
  'cycle','node-budget','unsatisfied-output','unsafe-batches','invalid-choice',
  'assumed-yield','unverified-outputs','ambiguous-producer','unresolved-research',
  'research-cycle','depth-limit'
]);
const LIMIT = 10000000;
const uniqueSorted = values => [...new Set(values)].sort((a,b)=>a.localeCompare(b,'en'));

export function buildProcurementReadiness(planner, comparison, settings = {}, context = {}) {
  if (comparison?.schema !== 'xpiratez-v2-procurement-whatif/v1' ||
      comparison.after?.schema !== 'xpiratez-v2-manufacture-next-batch-scenario/v1' ||
      !Array.isArray(comparison.after.jobs) ||
      !Array.isArray(comparison.additions) ||
      !settings || typeof settings.inventory !== 'object' ||
      Array.isArray(settings.inventory) || !settings.inventory) {
    throw new Error('2.1 가상 조달 비교 결과와 기초 재고가 필요합니다.');
  }
  const assumed = new Map();
  for(const row of comparison.additions) {
    if (!planner.itemMap.has(row.id) || !nonnegativeInt(row.quantity) ||
        row.quantity > LIMIT || assumed.has(row.id))
      throw new Error('가상 확보 출처 정보가 올바르지 않습니다.');
    assumed.set(row.id,row.quantity);
  }
  const after = comparison.after;
  const base = context.base && context.base.facilitiesPresent === true
    && Array.isArray(context.base.facilities) && context.facilitiesIndex
    ? context.base : null;
  const checkedResearch = Array.isArray(settings.saveDiscoveredResearchIds);
  const supplies = [];
  const materialIds = uniqueSorted([
    ...Object.keys(settings.inventory),
    ...assumed.keys(),
    ...Object.keys(after.inventory?.usedStarting||{})
  ]);
  for(const id of materialIds) {
    if(!planner.itemMap.has(id))throw new Error('2.1 목록에 없는 재고 ID입니다: '+id);
    const original=n(settings.inventory[id]);
    const added=assumed.get(id)||0;
    const used=n(after.inventory?.usedStarting?.[id]);
    if(original+added>LIMIT || used>original+added)
      throw new Error('가상 출처 장부 수량이 일치하지 않습니다: '+id);
    if(!original && !added && !used)continue;
    // The queue engine merges initial holdings with hypothetical additions.
    // The two sources are not traceable by consumption order. Represent the
    // mathematically possible bounds instead of inventing an allocation.
    const minimumAssumedUsed=Math.max(0,used-original);
    const maximumAssumedUsed=Math.min(used,added);
    const remainingCombined=original+added-used;
    supplies.push({
      id,name:planner.name(id),baseInput:original,virtualAdded:added,
      combinedStarting:original+added,usedCombined:used,
      possibleVirtualUsedMin:minimumAssumedUsed,
      possibleVirtualUsedMax:maximumAssumedUsed,
      remainingCombined,
      attribution:minimumAssumedUsed===maximumAssumedUsed
        ? 'fixed-by-totals' : 'ambiguous-within-bounds'
    });
  }
  const jobs = after.jobs.map((job,index)=>{
    const external=list(job.external);
    const materialShortageUnits=external.reduce((sum,row)=>sum+n(row.quantity),0);
    const missingFunctions=uniqueSorted(list(job.missingFacilityFunctions));
    const unmatchedResearch=uniqueSorted(list(job.researchAbsentFromDiscovered));
    const facilityEvidence=list(job.facilityEvidence);
    const declaredRequiredFunctions=uniqueSorted(facilityEvidence.flatMap(x=>list(x.needed)));
    const declaredResearchIds=list(job.nestedPlan?.research?.ids);
    const flags=uniqueSorted(list(job.flags));
    const blockingFlags=flags.filter(x=>GROUPED_RULE_FLAGS.has(x));
    const informationalFlags=flags.filter(x=>!GROUPED_RULE_FLAGS.has(x));
    const materialState=external.length?'external-shortage':'clear-in-hypothesis';
    const facilityState=!base?'not-checked':
      missingFunctions.length?'declared-missing':
      declaredRequiredFunctions.length?'declared-covered':'no-declared-functions';
    const researchState=!checkedResearch?'not-checked':
      unmatchedResearch.length?'not-in-discovered':
      declaredResearchIds.length?'present-in-discovered':'no-declared-research';
    const otherState=blockingFlags.length?'declared-rule-warning':'not-proven';
    const obstacles=[
      ...(materialShortageUnits?[{type:'materials',detail:'외부 부족 '+external.length+'종 / '+materialShortageUnits+'개'}]:[]),
      ...(missingFunctions.length?[{type:'facility',detail:'미확인/부족 기능 '+missingFunctions.join(', ')}]:[]),
      ...(unmatchedResearch.length?[{type:'research',detail:'discovered에 없는 연구 '+unmatchedResearch.length+'개'}]:[]),
      ...(blockingFlags.length?[{type:'rule',detail:'규칙상의 미해결 '+blockingFlags.join(', ')}]:[])
    ];
    const firstAction=obstacles[0]||{
      type:'unknown',detail:'명시 조건 외의 엔진·이벤트·추가 모드 제약은 확인하지 못했습니다.'
    };
    return {
      key:job.key,position:index+1,recipeId:job.recipeId,name:job.name,
      materialState,facilityState,researchState,otherState,
      materialShortageUnits,materialShortageKinds:external.length,
      missingMaterialIds:external.map(x=>x.id),missingFunctions,
      researchNotDiscovered:unmatchedResearch,declaredRequiredFunctions,
      declaredResearchIds:declaredResearchIds.map(x=>x.id),
      blockingFlags,informationalFlags,firstAction,obstacles,
      futureOutputsCredited:!job.futureOutputsBlocked,
      conclusion:'실제 게임 제조 가능성 미판정'
    };
  });
  return {
    schema:'xpiratez-v2-manufacture-evidence-matrix/v1',
    sourceVersion:'v.o2',
    jobs,supplies,
    summary:{
      jobs:jobs.length,
      materialShortageJobs:jobs.filter(j=>j.materialState==='external-shortage').length,
      missingFacilityJobs:jobs.filter(j=>j.facilityState==='declared-missing').length,
      notDiscoveredResearchJobs:jobs.filter(j=>j.researchState==='not-in-discovered').length,
      noEvidenceFacilityJobs:jobs.filter(j=>j.facilityState==='not-checked').length,
      noEvidenceResearchJobs:jobs.filter(j=>j.researchState==='not-checked').length,
      ruleWarningJobs:jobs.filter(j=>j.otherState==='declared-rule-warning').length,
      hypotheticalUnits: supplies.reduce((sum,x)=>sum+x.virtualAdded,0)
    },
    caveat:'기초 재고에는 사용자가 수동 수정한 입력이 포함될 수 있습니다. 추가 수량은 가정값이며 실제 확보 물자가 아닙니다. 기초·가상 수량이 병합된 뒤 사용되므로 실제 소비 출처는 계산되지 않습니다. 위 범위만 수학적으로 구할 수 있습니다. 명시된 연구·시설 조건을 충족해도 전체 게임에서 제조할 수 있다고 확정하지 않습니다.'
  };
}
