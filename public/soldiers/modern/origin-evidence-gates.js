// Read-only evidence classification for the EXISTING X-Piratez 2.1 atlas.
//
// A recorded rule, a structural ancestry, and a numerical projection are
// three DIFFERENT strengths of evidence. None of those is a replayed,
// achievable maximum. Keep the distinction explicit and source-specific.
const STAT_IDS=["tu","stamina","health","bravery","reactions","firing",
  "throwing","strength","psiStrength","psiSkill","melee"];
const arr=x=>Array.isArray(x)?x:[];
const missing=(id,title,reason)=>({id,title,level:"UNPROVEN",reason});
const indexed=(id,title,reason)=>({id,title,level:"RULE_INDEXED",reason});
const conditional=(id,title,reason)=>({id,title,level:"STRUCTURAL_MODEL",reason});
export const ORIGIN_EVIDENCE_LEVELS=Object.freeze({
  RULE_INDEXED:"원본 대조 완료",
  STRUCTURAL_MODEL:"구조 계산 · 실행 미검증",
  UNPROVEN:"미검증"
});
export function auditOriginPublication(row,report,data){
  if(!row||!report||!data||row.proof?.status!=="미검증"||
    row.proof?.ruleSourceIndexed!==true||!Array.isArray(row.sourceFiles)||
    row.sourceFiles.length===0||row.finalStats!==null||
    row.finalSum!==null||row.proof?.finalStatsVerified!==false||
    row.proof?.chronologicalReplay!==false||row.proof?.saveVerified!==false||
    data.meta?.mod?.version!=="v.o2"||report.sourceVersion!=="v.o2"||
    JSON.stringify(report.sourceHashes)!==
      JSON.stringify(data.meta?.source?.rules))
    throw new Error("원본 획득·최종 수치 증명 상태가 일치하지 않습니다");
  const birth=row.kind==="SOURCE_SPAWN";
  const source=birth?data.profiles?.find(p=>p.id===row.id):
    data.transformations?.find(t=>t.id===row.sourceId);
  if(!source||row.soldierType!==(birth?source.soldierType:source.producedSoldierType)||
    JSON.stringify(row.sourceFiles)!==JSON.stringify(source.sourceFiles))
    throw new Error("획득처·변신 원본 파일 또는 행 ID의 병종 관계 불일치: "+row.id);
  const cap=birth?row.birthStatCapSnapshot:
    row.candidateSourceAncestry?.candidates?.[0]?.conditionalBodyStatCapTimeline?.terminalCapSnapshot;
  if(cap)for(const key of ["rawGrowthCaps","physicalTrainingCaps",
    "effectiveCapReference","uniquePermanentBonus"]){
    const value=cap[key]||(key==="uniquePermanentBonus"?
      cap.birthPermanentBonus:null);
    if(!value||STAT_IDS.some(stat=>!Number.isFinite(Number(value[stat]))))
      throw new Error("조건부 현재 능력치·하드캡의 자료가 11개 능력치 전체에 존재하지 않습니다");
  }
  const conflicts=birth?arr(row.legacyCandidateBirthHistoryAudit?.directHistoryConflicts):[];
  const event=arr(row.prerequisites?.event?.alternatives);
  const rooted=birth?0:Number(row.candidateSourceAncestry?.candidateCount||0);
  const reasons=[
    indexed("source","출생·획득 규칙",
      birth?"2.1 원본에서 별개로 생성되는 출생 상태와 변신 이력 색인":
        "2.1 원본 병종 변경 규칙 색인; 변신 직전의 실제 대원은 미확정"),
    birth?
      indexed("birth","최초 능력치·출생 이력",
        "최초 병사의 생성 범위·출생 계급·기존 SoldierBonus를 독립적으로 대조"):
      conditional("birth","최초 출생처 연결",
        rooted?"서로 다른 출생처에서 이어지는 "+rooted+"개 구조 사슬을 색인":
          "제한된 변신 사슬 검색에서 출생 근원을 찾지 못함. 불가능 증명은 아님"),
    cap?
      conditional("cap","현재 능력치·하드캡 산술",
        "11종 원시 현재 능력치 범위, 원시 statCaps, 체력훈련캡 및 SoldierBonus 참조 상한을 분리; 실제 획득을 증명하지 않음"):
      missing("cap","현재 능력치·하드캡 산술",
        "제한된 변신 사슬 검색에서 출발 개인을 찾지 못해 조건부 수치조차 산출하지 않음"),
    missing("research","연구 완료의 시간순 재생",
      "requires·dependencies·disables·무료 연구·자동 연구·이벤트 연구 지급의 시점별 충돌을 전부 통과하지 않음"),
    missing("acquisition","실제 획득과 자원",
      birth?"최초 획득을 위한 실제 재료·시설·자금·시점·확률의 사용 내역 미입증":
        "개별 부모 대원과 모든 중간 시술의 실물 재료·시설·자금·시점 미입증"),
    missing("training","전체 훈련 조합·자격",
      "한 가지 추가 훈련과 필수 선행만 구조 탐색. 여러 훈련의 배제, 계급, 현재 능력치, 건강·사망 조건을 끝까지 재생하지 않음"),
    missing("medals","훈장 획득·단계·중복",
      "실제 획득 가능한 훈장 및 단계와 장비별 중첩 여부가 입증되지 않음"),
    missing("growth","전투·체력훈련 성장",
      "전투 경험치 및 체육관·상한 도달 기회와 RNG 순서를 실제로 재생하지 않음"),
    missing("save","OXCE 실측 교차검증",
      "같은 출생 배경의 병사를 최종 상태까지 게임에서 재현한 세이브 증거 없음"),
    missing("maximum","전역 최적성",
      "다른 획득처·연구 분기·훈련 순서가 더 높은 능력치를 만들 수 없음을 증명하지 못함")
  ];
  const indexCount=reasons.filter(p=>p.level==="RULE_INDEXED").length;
  const structuralCount=reasons.filter(p=>p.level==="STRUCTURAL_MODEL").length;
  const incomplete=reasons.filter(p=>p.level==="UNPROVEN").length;
  if(reasons.length!==10||incomplete!==(cap?7:8))
    throw new Error("검증 관문 수가 예상 범위를 벗어났습니다");
  return {
    originId:row.id,soldierType:row.soldierType,
    finalStatus:"UNVERIFIED",finalStatSum:null,finalStats:null,
    ruleIndexedCount:indexCount,structuralOnlyCount:structuralCount,
    unresolvedRequirementCount:incomplete,
    checklist:reasons,
    proofStatus:"미검증",
    actualSaveWitness:false,optimalityProven:false,
    directHistoryConflictCount:conflicts.length,
    directHistoryConflictIds:conflicts.map(x=>x.target),
    eventAlternativeCount:event.length,
    eventGuaranteed:false,
    sourcePaths:row.sourceFiles,
    conditionNotes:[
      ...(conflicts.length?[conflicts.length+"개 훈련은 출생 직후 이력을 유지한 직접 시도에서 차단됨. 우회 경로 전체가 불가능하다는 뜻은 아님"]:[]),
      ...(event.length?["대체 이벤트 "+event.length+"개는 서로 독립된 발생 조건·추첨이며 모두 발생한다고 가정하지 않음"]:[]),
      ...(!birth&&!rooted?["이 제한된 연결 그래프에서 출생처 미발견. 실제 획득 불가능 판정 아님"]:[])
    ]
  };
}
export function verifyOriginPublicationAggregate(report,data){
  const rows=arr(report?.rows);
  if(rows.length!==112||data?.profiles?.length!==72||data?.soldiers?.length!==29)
    throw new Error("출생처 전수 범위가 2.1 원본과 불일치합니다");
  let sources=0,bodyBranches=0,conflicted=0,event=0,unlinked=0;
  for(const row of rows){
    const result=auditOriginPublication(row,report,data);
    if(result.finalStatus!=="UNVERIFIED"||result.finalStats!==null||
      result.finalStatSum!==null||![7,8].includes(result.unresolvedRequirementCount))
      throw new Error("검증되지 않은 출생처 결과가 최댓값으로 게시됨: "+row.id);
    sources+=row.kind==="SOURCE_SPAWN"?1:0;
    bodyBranches+=row.kind==="TYPE_CHANGE_WITH_UNRESOLVED_PARENT"?1:0;
    if(result.directHistoryConflictCount)conflicted++;
    if(result.eventAlternativeCount)event++;
    if(row.kind!=="SOURCE_SPAWN"&&
      row.candidateSourceAncestry.candidateCount===0)unlinked++;
  }
  if(sources!==72||bodyBranches!==40)
    throw new Error("출생처와 병종 변경 그래프 수가 누락되거나 중복됨");
  return {total:rows.length,sourceProfiles:sources,bodyBranches,
    directlyConflictedSources:conflicted,eventSourceProfiles:event,
    unlinkedTypeChangeBranches:unlinked,
    verifiedFinalRoutes:0,provenImpossibleRoutes:0,unverifiedFinalRoutes:rows.length,
    status:"RULESET_INDEXED_BUT_FINAL_MAXIMA_UNVERIFIED"};
}
