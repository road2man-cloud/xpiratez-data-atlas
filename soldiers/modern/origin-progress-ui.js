// Source-specific, deliberately non-certifying soldier progression comparison.
// This view lives inside the existing modern soldier atlas; it does not
// reinterpret old 29-body conditional maxima as final per-person results.
import {directResearchTransformLocks,permanentResearchTransformLocks}
  from "./research-training-locks.js";
const esc=s=>String(s??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const STAT_LABELS={tu:"행동력",stamina:"기력",health:"체력",bravery:"용기",
  reactions:"반응",firing:"사격",throwing:"투척",strength:"힘",
  psiStrength:"사이오닉 강도",psiSkill:"사이오닉 기술",melee:"근접"};
const TYPES={direct:"직접 모집",manufacture:"제조·특수 모집",
  event:"이벤트 출생",typeChange:"병종 변환"};
const VERIFY=["실행 경로 검증","조건부 실행 경로","불가능 판정","미검증"];
const sumStats=(values,keys)=>keys.reduce((s,k)=>s+Number(values?.[k]||0),0);
const cell=n=>Number.isFinite(Number(n))?Number(n).toLocaleString("ko-KR",{maximumFractionDigits:1}):"—";
const idItems=a=>(a||[]).length?a.map(x=>'<code>'+esc(typeof x==="string"?x:x.id)+
  (typeof x==="object"&&x.count!==1?" ×"+esc(x.count):"")+'</code>').join(" · "):"없음";
const linkableId=id=>'<code>'+esc(id)+'</code>';

// Re-play only the *structural* type-change history to reject forged origins.
// Not a campaign replay: we deliberately never certify the availability of
// research, items, stats, medals, RNG, healing or corpse recovery here.
function validateRootedAncestry(row,sourceMap,transforms){
  const a=row.candidateSourceAncestry;
  if(!a||a.id!==row.id||a.candidateCount!==a.candidates?.length||
    a.rootProfileIds?.length!==new Set(a.rootProfileIds).size)
    throw new Error("출발 획득처별 병종변경 계보 훼손: "+row.id);
  const allRoots=new Set(),unique=new Set();
  let direct=0,indirect=0,largest=0,resets=0,deathContinuity=0,sameBody=0;
  for(const candidate of a.candidates){
    const origin=sourceMap.get(candidate.rootProfileId);
    const steps=candidate.steps;
    if(!origin||!Array.isArray(steps)||steps.length<1||steps.length>7||
      candidate.rootSoldierType!==origin.soldierType||
      candidate.status!=="TYPE_CHANGE_GRAPH_ONLY_NOT_EXECUTED"||
      candidate.finalStats!==null||candidate.finalSum!==null||
      !candidate.proof||
      Object.values(candidate.proof).some(value=>value!==false))
      throw new Error("획득처 계보를 실행 확정으로 가장하거나 루트 오류: "+row.id);
    const sig=candidate.rootProfileId+"|"+steps.map(x=>x.transformationId).join(">");
    if(unique.has(sig))throw new Error("획득처 계보 중복: "+sig);
    unique.add(sig);
    let type=origin.soldierType,oldDeadOnly=false,needsDeathRecovery=false,seenReset=false;
    const history=new Set(Object.entries(origin.previousTransformations||{})
      .filter(([,n])=>Number(n)>0).map(([id])=>id));
    const used=new Set();
    for(const step of steps){
      const t=transforms.get(step.transformationId);
      const vitals=[
        t?.allowsLiveSoldiers?"live":null,
        t?.allowsWoundedSoldiers?"wounded":null,
        t?.allowsDeadSoldiers?"dead":null
      ].filter(Boolean);
      if(!t||!t.producedSoldierType||t.createsClone||t.producedItem||
        (t.requires||[]).includes("STR_UNAVAILABLE")||
        used.has(t.id)||!t.allowedSoldierTypes.includes(type)||
        (t.forbiddenSoldierTypes||[]).includes(type)||
        (t.requiredPreviousTransformations||[]).some(id=>!history.has(id))||
        (t.forbiddenPreviousTransformations||[]).some(id=>history.has(id))||
        step.fromType!==type||step.toType!==t.producedSoldierType||
        step.historyReset!==(t.reset===true)||
        step.corpseRecoveryRequired!==(t.needsCorpseRecovered===true)||
        !vitals.length||JSON.stringify(step.requiredVitals)!==JSON.stringify(vitals))
        throw new Error("2.1 변신 전/후 병종·이력·생존 게이트 불일치: "+sig);
      if(t.reset){history.clear();seenReset=true;}
      else for(const erased of t.removeTransformations||[])history.delete(erased);
      history.add(t.id);
      used.add(t.id);
      if(oldDeadOnly)needsDeathRecovery=true;
      if(vitals.length===1&&vitals[0]==="dead")oldDeadOnly=true;
      type=t.producedSoldierType;
    }
    const last=steps.at(-1);
    if(last.transformationId!==row.sourceId||
      last.fromType!==row.parentSoldierType||
      type!==row.soldierType||
      candidate.hasHistoryReset!==seenReset||
      candidate.vitalContinuityUnverified!==needsDeathRecovery||
      JSON.stringify(candidate.terminalHistory)!==
        JSON.stringify([...history].sort()))
      throw new Error("획득처별 계보 종착 병종·리셋 이력 불일치: "+sig);
    if(steps.length===1)direct++;else indirect++;
    if(seenReset)resets++;
    if(needsDeathRecovery)deathContinuity++;
    if(last.fromType===last.toType)sameBody++;
    largest=Math.max(largest,steps.length);
    allRoots.add(candidate.rootProfileId);
  }
  if(a.directRootCount!==direct||a.viaOtherBodyChangeCount!==indirect||
    a.maxDepth!==largest||
    JSON.stringify(a.rootProfileIds)!==JSON.stringify([...allRoots].sort())||
    (a.candidateCount===0&&!a.noRecordedPathMeaning))
    throw new Error("획득처별 계보 후보 집계 불일치: "+row.id);
  return {count:a.candidateCount,roots:allRoots,resets,deathContinuity,
    sameBody,maxDepth:largest};
}


export function validateOriginProgression(report,data,oldMaxima){
  if(report?.schemaVersion!==1||report.kind!=="SOLDIER_ACQUISITION_PROGRESSION")
    throw new Error("획득처별 성장 데이터 버전 불일치");
  const s=report.summary||{};
  if(s.classes!==29||s.originalSpawnProfiles!==data.profiles?.length||
    s.incomingTypeChangeRules!==data.transformations.filter(t=>t.producedSoldierType).length||
    s.indexedAcquisitionBranches!==report.rows?.length||
    s.incomingTypeChangeBranches!==report.rows.length-data.profiles.length||
    s.finalStatRoutesVerified!==0||s.saveVerified!==0||s.chronologicalPathsVerified!==0||
    s.manufacturingProfilesWithMaterials!==data.profiles.filter(p=>p.sourceType==="manufacture").length||
    s.eventOriginsWithTriggerEvidence!==data.profiles.filter(p=>p.sourceType==="event").length)
    throw new Error("획득처 인덱스 / 실행 인증 상태와 원본 불일치");
  if(report.stats?.length!==11||new Set(report.stats).size!==11||
    report.stats.includes("mana")||report.classes?.length!==29||
    oldMaxima.rows?.length!==29||report.sourceVersion!=="v.o2"||
    data.meta?.mod?.version!=="v.o2"||
    JSON.stringify(report.sourceHashes)!==JSON.stringify(data.meta?.source?.rules)||
    report.source.some(x=>/public\/data\/(?:manufacture|event)[-/]/.test(x)))
    throw new Error("11개 능력치/병종/2.1 단일 원본 범위 불일치");
  const candidates=new Map(oldMaxima.rows.map(x=>[x.id,x]));
  const original=new Map(data.profiles.map(p=>[p.id,p]));
  const transformations=new Map(data.transformations.map(t=>[t.id,t]));
  const ancestral=s.sourceRootedAncestry;
  if(ancestral?.originalSpawnProfiles!==data.profiles.length||
    ancestral.examinedBodyChangeRules!==data.transformations.filter(t=>
      t.producedSoldierType&&!t.createsClone&&!t.producedItem).length||
    ancestral.incomingEdges!==s.incomingTypeChangeBranches||
    ancestral.fullyExecutedCandidates!==0||
    ancestral.verifiedFinalStatCandidates!==0)
    throw new Error("출생처 기점 병종 변경 색인 또는 검증 상태 불일치");
  const cumulativeLineage={
    count:0,roots:new Set(),resets:0,deathContinuity:0,sameBody:0,maxDepth:0
  };
  const seen=new Set();
  for(const row of report.rows){
    if(seen.has(row.id)||!candidates.has(row.soldierType)||row.proof?.status!=="미검증")
      throw new Error("획득처 중복·병종 누락·검증상태 오류: "+row.id);
    seen.add(row.id);
    if(row.finalStats!==null||row.finalSum!==null||row.medalBonus!==null||
      row.additionalTransformationBonus!==null||row.proof.finalStatsVerified||
      row.proof.chronologicalReplay||row.proof.saveVerified||
      row.provisionalBodyBonusCandidate?.attributableToThisPerson!==false)
      throw new Error("증명되지 않은 병종별 후보를 획득처의 최종 능력치로 승격: "+row.id);
    if(row.provisionalBodyBonusCandidate.score!==candidates.get(row.soldierType).score)
      throw new Error("원본 조건부 후보와 연결 불일치: "+row.id);
    if(row.kind==="SOURCE_SPAWN"){
      const p=original.get(row.id);
      if(!p||p.soldierType!==row.soldierType||row.sourceId!==p.sourceId||
        report.stats.some(k=>row.birth?.min?.[k]!==p.effectiveStats?.min?.[k]||
          row.birth?.max?.[k]!==p.effectiveStats?.max?.[k]||
          row.birth?.avg?.[k]!==p.effectiveStats?.avg?.[k])||
        JSON.stringify(row.initialHistory)!==JSON.stringify(
          Object.entries(p.previousTransformations||{}).filter(([,n])=>Number(n)>0)
            .map(([id,count])=>({id,count:Number(count)})))||
        JSON.stringify(row.initialBonuses)!==JSON.stringify(
          Object.entries(p.traitCounts||{}).filter(([,n])=>Number(n)>0)
            .map(([id,count])=>({id,count:Number(count)}))) )
        throw new Error("실제 출생 초기 상태·이력·보너스가 원본 프로필과 다름: "+row.id);
      if(!row.naturalGrowthUpper?.physicalThenBattle||
        row.naturalGrowthCanIncrease.some(k=>!report.stats.includes(k))||
        !Array.isArray(row.sourceFiles)||!row.sourceFiles.length)
        throw new Error("출생처별 자연 성장 상계/원본 파일 누락: "+row.id);
      const requiredItems=row.prerequisites.items||{};
      if(row.acquisitionType==="manufacture"&&
        JSON.stringify(requiredItems)!==JSON.stringify(p.acquisitionRequiredItems||{}))
        throw new Error("2.1 원본 제조 requiredItems와 불일치: "+row.id);
      if(row.acquisitionType==="event"){
        const originRoutes=p.acquisitionEventScripts||[];
        const observed=row.prerequisites.event?.alternatives||[];
        if(observed.length!==originRoutes.length||
          row.prerequisites.event?.alternativeCount!==originRoutes.length||
          row.prerequisites.event?.ruleset!=="v.o2")
          throw new Error("2.1 이벤트 스크립트 대체 경로 누락: "+row.id);
        const fields={
          researchTriggers:["researchPositive","researchNegative"],
          itemTriggers:["itemPositive","itemNegative"],
          facilityTriggers:["facilityPositive","facilityNegative"],
          soldierTypeTriggers:["soldierTypePositive","soldierTypeNegative"],
          xcomBaseInRegionTriggers:["regionPositive","regionNegative"],
          xcomBaseInCountryTriggers:["countryPositive","countryNegative"],
          pactCountryTriggers:["pactPositive","pactNegative"]
        };
        for(let i=0;i<originRoutes.length;i++){
          const src=originRoutes[i],route=observed[i];
          if(route.script!==src.script||route.mode!==src.mode||
            route.firstMonth!==(src.firstMonth??null)||
            route.lastMonth!==(src.lastMonth??null)||
            route.executionOdds!==(src.executionOdds??null)||
            route.oneTime!==(src.mode==="oneTimeRandom"||
              src.mode==="oneTimeSequential"))
            throw new Error("이벤트 선택 스크립트 조건이 서로 다른 버전과 혼합됨: "+row.id);
          for(const [kind,[pos,neg]] of Object.entries(fields)){
            for(const [side,key] of [["positiveTriggers",pos],["negativeTriggers",neg]])
              for(const id of src[key]||[])
                if(!route[side]?.some(x=>x.kind===kind&&x.id===id))
                  throw new Error("2.1 이벤트 분기 트리거 누락: "+row.id+"/"+id);
          }
        }
        for(const side of ["positiveTriggers","negativeTriggers"]){
          const expected=observed[0]?.[side]?.filter(x=>observed.every(r=>
            r[side].some(y=>y.kind===x.kind&&y.id===x.id)))||[];
          if(JSON.stringify(row.prerequisites.event[side])!==JSON.stringify(expected))
            throw new Error("이벤트 대체 분기 공통 조건 왜곡: "+row.id+"/"+side);
        }
      }
      if(row.acquisitionType==="manufacture"&&
        (!Object.keys(requiredItems).length||
          Object.keys(requiredItems).some(id=>
            !(Number(requiredItems[id])>0)||!Object.hasOwn(row.prerequisites.itemSources||{},id))))
        throw new Error("제조 요구 실물/공급 출처 누락: "+row.id);
      if(row.acquisitionType==="event"&&(!row.prerequisites.event||
        !Array.isArray(row.prerequisites.event.positiveTriggers)||
        !Array.isArray(row.prerequisites.event.negativeTriggers)))
        throw new Error("이벤트 조건 원본 누락: "+row.id);
      if(row.id==="manufacture:STR_THEBAN_ASSAULT_CLONE"&&
        (requiredItems.STR_THEBAN_ASSAULT_CLONE_LICENSE!==1||
          !row.prerequisites.research.includes("STR_THEBAN_ASSAULT_CLONE_LICENSE")))
        throw new Error("돌격클론 면허 실물과 연구 선행조건은 별개입니다");
      if(row.id==="event:STR_CODEX_BONUS_G5"&&
        (!row.prerequisites.event.negativeTriggers.some(x=>
          x.kind==="researchTriggers"&&x.id==="STR_CAPTAIN_SAINT")||
          row.prerequisites.event.minExecutionOdds!==23))
        throw new Error("블러드하운드 획득 이벤트의 음성 가드 및 확률 누락");
      const audit=row.legacyCandidateBirthHistoryAudit;
      if(audit?.scope!=="UNCHANGED_BIRTH_HISTORY_ONLY"||
        audit.possibleHistoryResetOrRemovalNotEvaluated!==true)
        throw new Error("획득처별 출생 이력 진단 상태 누락: "+row.id);
      const old=candidates.get(row.soldierType);
      const prior=new Map(Object.entries(p.previousTransformations||{})
        .filter(([,n])=>Number(n)>0));
      const chosenOwned=old.transformations.filter(id=>prior.has(id));
      if(JSON.stringify(audit.alreadyCompleted)!==JSON.stringify(chosenOwned))
        throw new Error("출생 시 이미 받은 훈련 중복 감지 누락: "+row.id);
      const conflicts=[];
      const researchConflicts=[];
      for(const id of old.transformations){
        if(prior.has(id))continue;
        const t=transformations.get(id);
        const forbidden=(t.forbiddenPreviousTransformations||[])
          .filter(x=>prior.has(x));
        if(forbidden.length)conflicts.push({target:id,priorHistory:forbidden,
          source:"forbiddenPreviousTransformations"});
        const locks=[...directResearchTransformLocks(prior,id,data),
          ...permanentResearchTransformLocks(prior,id,data.researchRules||{})];
        if(locks.length)researchConflicts.push({target:id,
          details:[...new Set(locks)],source:"reciprocal-research-disables"});
      }
      if(JSON.stringify(audit.directHistoryConflicts)!==JSON.stringify(conflicts)||
        JSON.stringify(audit.researchHistoryConflicts)!==JSON.stringify(researchConflicts))
        throw new Error("원본 출생 이력 금지/연구 배제 증거 불일치: "+row.id);
    }else if(row.kind==="TYPE_CHANGE_WITH_UNRESOLVED_PARENT"){
      const t=transformations.get(row.sourceId);
      if(!t||t.producedSoldierType!==row.soldierType||
        !t.allowedSoldierTypes.includes(row.parentSoldierType)||
        row.prerequisites.reset!==(t.reset===true)||
        row.proof.resetPreviousHistory!==(t.reset===true)||
        row.birth!==null||row.naturalGrowthUpper!==null||
        row.initialHistory!==null||row.bornPermanentBonus!==null||
        row.legacyCandidateBirthHistoryAudit!==null||
        row.proof.unresolvedParent!==true)
        throw new Error("변신 출생 경로 / reset 초기화 불일치: "+row.id);
      const lineage=validateRootedAncestry(row,original,transformations);
      cumulativeLineage.count+=lineage.count;
      for(const id of lineage.roots)cumulativeLineage.roots.add(id);
      cumulativeLineage.resets+=lineage.resets;
      cumulativeLineage.deathContinuity+=lineage.deathContinuity;
      cumulativeLineage.sameBody+=lineage.sameBody;
      cumulativeLineage.maxDepth=Math.max(cumulativeLineage.maxDepth,lineage.maxDepth);
    }else throw new Error("출생 형식 알 수 없음: "+row.id);
  }
  for(const p of data.profiles)if(!seen.has(p.id))throw new Error("출생처 누락: "+p.id);
  if(ancestral.sourceAnchoredCandidates!==cumulativeLineage.count||
    ancestral.rootsWithCandidatePath!==cumulativeLineage.roots.size||
    ancestral.candidatesWithHistoryReset!==cumulativeLineage.resets||
    ancestral.candidatesRequiringUnverifiedPostDeathContinuity!==
      cumulativeLineage.deathContinuity||
    ancestral.candidatesWithSameBodyProducedType!==cumulativeLineage.sameBody||
    ancestral.longestBodyChangeChain!==cumulativeLineage.maxDepth)
    throw new Error("출생처 기점 다단계 변신 집계 오류");
  const birth=report.rows.filter(r=>r.kind==="SOURCE_SPAWN");
  const diag={
    birthProfilesWithAlreadyCompletedCandidate:birth.filter(r=>
      r.legacyCandidateBirthHistoryAudit.alreadyCompleted.length>0).length,
    candidateTransformationsAlreadyCompleted:birth.reduce((n,r)=>
      n+r.legacyCandidateBirthHistoryAudit.alreadyCompleted.length,0),
    birthProfilesWithDirectForbiddenCandidate:birth.filter(r=>
      r.legacyCandidateBirthHistoryAudit.directHistoryConflicts.length>0).length,
    directlyForbiddenCandidateTrainings:birth.reduce((n,r)=>
      n+r.legacyCandidateBirthHistoryAudit.directHistoryConflicts.length,0),
    birthProfilesWithResearchHistoryConflict:birth.filter(r=>
      r.legacyCandidateBirthHistoryAudit.researchHistoryConflicts.length>0).length
  };
  for(const [key,value] of Object.entries(diag))if(s[key]!==value)
    throw new Error("출생 이력 감사 요약 수치 불일치: "+key);
  const byClass=Object.groupBy(report.rows,r=>r.soldierType);
  for(const r of report.classes){
    if(!candidates.has(r.soldierType)||!byClass[r.soldierType]||
      r.acquisitionProfiles!==byClass[r.soldierType].length||
      r.verifiedOrigins!==0||r.verifiedMaximum!==null)
      throw new Error("병종별 집계가 검증 전 최대치를 게시: "+r.soldierType);
  }
  return {rows:report.rows.length,births:data.profiles.length,
    transformBranches:report.rows.length-data.profiles.length,verified:0};
}
function statTable(row,stats) {
  const bands=row.birth?[
    ["출생 최소",row.birth.min],
    ["출생 평균(기댓값)",row.birth.avg],
    ["출생 최대",row.birth.max],
    ["체육관 장기 상계 (조건부)",row.naturalGrowthUpper.physical],
    ["체육관 → 전투 장기 상계 (조건부)",row.naturalGrowthUpper.physicalThenBattle]
  ]:[];
  return '<div class="table-shell origin-detail-scroll"><table><thead><tr><th>단계</th>'+
    stats.map(k=>'<th>'+esc(STAT_LABELS[k]||k)+'</th>').join("")+
    '<th>11종 합계</th></tr></thead><tbody>'+bands.map(([name,values])=>
      '<tr><th>'+esc(name)+'</th>'+stats.map(k=>'<td>'+cell(values[k])+'</td>').join("")+
      '<td>'+cell(sumStats(values,stats))+'</td></tr>').join("")+
    '<tr><th>최종 실현 능력치</th><td colspan="12">미검증 · 숫자 표시 금지</td></tr></tbody></table></div>';
}
function sourceAncestryDetails(row,sourceNames){
  const a=row.candidateSourceAncestry;
  if(!a)return "";
  const empty='<p class="muted">이 제한된 병종변경 사슬 탐색에서는 최초 출생처로 거슬러 올라가는 경로를 찾지 못했습니다. '+
    '<strong>이 병종이 획득 불가능하다는 뜻이 아닙니다.</strong> 일반 훈련, 반복 변신 및 시간순 사건은 아직 누락되어 있습니다.</p>';
  const entries=a.candidates.map((c,i)=>{
    const sourceName=sourceNames.get(c.rootProfileId)||c.rootProfileId;
    const sequence=c.steps.map((s,j)=>
      (j===0?'<code>'+esc(s.fromType)+'</code> → ':'')+
      '<code>'+esc(s.transformationId)+'</code> → <code>'+esc(s.toType)+'</code>'+
      (s.historyReset?' <strong>(이력 초기화)</strong>':'')+
      (s.requiredVitals.includes('dead')?' <strong>(사망 상태 조건)</strong>':'')
    ).join(' · ');
    return '<li><strong>'+esc(sourceName)+'</strong> '+
      '<code>'+esc(c.rootProfileId)+'</code><p>'+sequence+'</p>'+
      '<p class="muted">최종 남는 변신 이력: '+idItems(c.terminalHistory)+
      (c.vitalContinuityUnverified?
        ' · 사망 후 후속 변신이 실제 가능하려면 생존 상태의 별도 재검증이 필요함':'')+
      ' · <strong>연구·시설·재료·훈장·능력치 미검증</strong></p></li>';
  }).join('');
  return '<h4>최초 획득처에서 연결되는 병종변경 사슬</h4>'+
    '<p>출생 프로필 '+cell(a.rootProfileIds.length)+'개에서 시작하는 '+
    '<strong>'+cell(a.candidateCount)+'개 구조 후보</strong> · 그중 최초 병종에서 바로 전환 '+
    cell(a.directRootCount)+'개, 다른 병종을 경유 '+cell(a.viaOtherBodyChangeCount)+
    '개 · 최대 '+cell(a.maxDepth)+'단계</p>'+
    '<p class="muted">출생 당시 변신 이력, 방향성 금지 규칙, 병종 변경의 reset 및 '+
    '한 규칙의 중복 사용 금지를 반영했습니다. 일반 훈련·연구·재료·전투 성장·훈장·사망/부활은 '+
    '실행하지 않은 탐색이므로 후보가 존재해도 실제로 가능한 최종 육성을 의미하지 않습니다. '+
    '탐색 범위 밖 경로를 불가능하다고 단정하지 않습니다.</p>'+
    (a.candidateCount?'<details class="origin-lineage-candidates"><summary>출생처별 구조 경로 '+
      cell(a.candidateCount)+'개 펼치기</summary><ol>'+entries+'</ol></details>':empty);
}
function showDetails(row,stats,host,sourceNames){
  const source=row.kind==="SOURCE_SPAWN";
  host.hidden=false;
  let html='<div class="maxima-detail-head"><h3>'+esc(row.soldierName)+
    ' · '+esc(row.sourceName)+'</h3><button id="originDetailClose" type="button">닫기</button></div>'+
    '<p>'+linkableId(row.id)+' · <strong>미검증</strong> · 병종별 조건부 영구 보너스 '+
    cell(row.provisionalBodyBonusCandidate.score)+
    '는 이 획득처가 달성 가능한 보너스로 인정하지 않습니다.</p>';
  html+=source?
    '<p>출생 ID '+linkableId(row.sourceId)+' · 출생 계급 '+cell(row.rank)+
    ' · 보너스를 중복 부여하지 않은 원본 출생 상태입니다.</p>'+
    statTable(row,stats)+
    '<p><strong>출생 시 변신 이력:</strong> '+idItems(row.initialHistory)+'</p>'+
    '<p><strong>출생 시 영구 보너스 항목:</strong> '+idItems(row.initialBonuses)+'</p>'+
    '<p><strong>출생 시 이미 적용된 능력치 보너스:</strong> '+
      stats.map(k=>esc(STAT_LABELS[k])+': '+cell(row.bornPermanentBonus[k])).join(" · ")+'</p>'+
    '<p><strong>이후 자연 성장 가능 능력치(상계 기준):</strong> '+
      (row.naturalGrowthCanIncrease.map(k=>esc(STAT_LABELS[k])).join(" · ")||"추가 상승 없음")+'</p>'+
    '<p>'+esc(row.naturalGrowthAssumption)+'</p>'+
    '<h4>기존 병종별 보너스 후보와 출생 이력 충돌 진단</h4>'+
    '<p><strong>출생 시 이미 받은 후보 훈련 (재시술 금지):</strong> '+
      idItems(row.legacyCandidateBirthHistoryAudit.alreadyCompleted)+'</p>'+
    '<p><strong>출생 이력으로 직접 차단되는 후보 훈련:</strong> '+
      (row.legacyCandidateBirthHistoryAudit.directHistoryConflicts.map(x=>
        linkableId(x.target)+' ← '+idItems(x.priorHistory)).join(' · ')||"검출되지 않음")+'</p>'+
    '<p><strong>양방향 연구 배제 충돌:</strong> '+
      (row.legacyCandidateBirthHistoryAudit.researchHistoryConflicts.map(x=>
        linkableId(x.target)+': '+esc(x.details.join(' / '))).join(' · ')||"검출되지 않음")+'</p>'+
    '<p class="muted">위 충돌은 출생 이력을 변경하지 않고 기존 후보의 해당 훈련을 바로 시술하는 경우에 한정됩니다. '+
      '중간 이력 삭제·병종 변환·리셋 경로를 모두 검사한 불가능 판정은 아닙니다.</p>':
    '<p><strong>출발 병종:</strong> '+linkableId(row.parentSoldierType)+
    ' · <strong>원본 병종 변경:</strong> '+linkableId(row.sourceId)+'</p>'+
    '<p><strong>최초 출생 상태가 비어 있는 이유:</strong> 병종 변경 이전의 특정 개인 획득처, 능력치, 훈장, 성장 및 변신 이력의 완전한 선후관계가 아직 재생되지 않았습니다.</p>'+
    '<p><strong>변신 이력 초기화:</strong> '+
    (row.prerequisites.reset?'<strong>reset: true · 이전 이력을 자동 상속하면 안 됨</strong>':
      'reset: false · 이전 이력을 유지할 수 있으나 실제 출발 개인을 확인해야 함')+'</p>'+
    '<p><strong>알려진 직접 출발 프로필:</strong> '+
      idItems(row.parentAcquisitionProfiles)+'</p>';
  if(!source)html+=sourceAncestryDetails(row,sourceNames);
  const requirements=row.prerequisites;
  const materialRows=Object.entries(requirements.items||{}).map(([id,n])=>{
    const provenance=requirements.itemSources?.[id];
    const events=(provenance?.eventGrants||[]).map(grant=>
      '<code>'+esc(grant.event)+'</code> ('+
      grant.grants.map(g=>esc(g.mode)+' ×'+cell(g.count)).join(', ')+
      ')').join(' · ');
    return '<li><code>'+esc(id)+'</code> ×'+cell(n)+
      (provenance?' · 구매가 '+(provenance.buyCost==null?'미확인':cell(provenance.buyCost)):
        ' · 공급처 원본 미색인')+
      (events?' · 이벤트 지급 후보: '+events:'')+'</li>';
  }).join("");
  const eventGate=requirements.event;
  const triggers=items=>(items||[]).length?items.map(x=>
    '<code>'+esc(x.kind)+': '+esc(x.id)+'</code>').join(' · '):'없음';
  const alternatives=(eventGate?.alternatives||[]).map((route,i)=>{
    const weighted=(route.monthWeights||[]).filter(w=>Number(w.weight)>0);
    return '<li><strong>대체 출처 '+(i+1)+': </strong><code>'+esc(route.script)+
      '</code> · '+esc(route.mode)+' · 최초 월 '+cell(route.firstMonth)+
      ' · 마지막 월 '+(route.lastMonth==null?'제한 없음':cell(route.lastMonth))+
      ' · 스크립트 실행 확률 '+cell(route.executionOdds)+'%'+
      ' · 일회성 분기 '+(route.oneTime?'예':'아니요')+
      '<p><strong>필수 조건:</strong> '+triggers(route.positiveTriggers)+
      ' · <strong>금지 조건:</strong> '+triggers(route.negativeTriggers)+'</p>'+
      (route.oneTimeEarlier?.length?
        '<p>일회성 선행 이벤트: '+idItems(route.oneTimeEarlier)+'</p>':'')+
      (weighted.length?'<p>양수 가중치 달: '+weighted.slice(0,12).map(x=>
        cell(x.month)+'월: '+cell(x.weight)+' / '+cell(x.totalWeight)).join(' · ')+
        (weighted.length>12?' 등 총 '+weighted.length+'개 월':'')+'</p>':'')+
      (Object.keys(route.otherConditions||{}).length?'<p>추가 스크립트 조건: '+
        Object.entries(route.otherConditions).map(([k,v])=>
          '<code>'+esc(k)+': '+esc(v)+'</code>').join(' · ')+'</p>':'')+'</li>';
  }).join('');
  const eventEvidence=eventGate?'<p><strong>2.1 원본 이벤트 출처:</strong> '+
    cell(eventGate.alternativeCount)+'개 스크립트 분기 · '+
    '각 분기는 별도의 시간·조건·추첨을 가지며 아래 조건을 모두 동시에 요구하지 않습니다. '+
    '게임 내 발생 및 생성 획득은 아직 미검증입니다.</p>'+
    '<p><strong>모든 대체 출처에 공통인 필수 조건:</strong> '+
      triggers(eventGate.positiveTriggers)+
      ' · <strong>공통 금지 조건:</strong> '+triggers(eventGate.negativeTriggers)+'</p>'+
    (alternatives?'<details><summary>대체 이벤트별 원본 스크립트 조건 '+
      eventGate.alternativeCount+'개 보기</summary><ol>'+alternatives+'</ol></details>':
      '<p>직접 생성 이벤트를 지급하는 스크립트 경로는 색인되지 않았습니다. 이벤트 발생 가능성을 추정하지 않습니다.</p>'):'';
  html+='<section class="maxima-source-evidence"><h4>획득 조건 및 증명에 남은 작업</h4>'+
    '<p>필요 연구: '+idItems(requirements.research)+
    ' · 기지 기능: '+idItems(requirements.facilities)+'</p>'+
    (materialRows?'<p><strong>실물 재료(연구 플래그와 별도):</strong></p><ul>'+
      materialRows+'</ul><p class="muted">열거된 공급처는 후보이며, 실제 지급/구매 및 같은 기지 보유가 증명된 것은 아닙니다.</p>':'')+
    eventEvidence+
    (source?
      '<p>획득 비용: '+(row.prerequisites.cost==null?"원본값 없음":cell(row.prerequisites.cost))+
      ' · 소요 시간: '+(row.prerequisites.time==null?"원본값 없음":cell(row.prerequisites.time))+
      ' · 생성 수: '+cell(row.prerequisites.spawnedPersons)+'</p>':
      '<p>요구 계급: '+cell(row.prerequisites.minRank)+
      ' · 필요 아이템: '+(Object.entries(row.prerequisites.items||{}).map(([k,v])=>
        linkableId(k)+' ×'+cell(v)).join(" · ")||"없음")+
      ' · 선행 이력: '+idItems(row.prerequisites.priorHistory)+
      ' · 금지 이력: '+idItems(row.prerequisites.forbiddenHistory)+'</p>')+
    '<p><strong>훈장·변신 최적화:</strong> 시간순 획득 및 실제 재생 미검증. '+
      '확정 11종 최종 능력치와 합계는 아직 산출하지 않았습니다.</p></section>';
  host.innerHTML=html;
  host.querySelector("#originDetailClose").addEventListener("click",()=>{
    host.hidden=true;host.innerHTML="";
  });
}
export async function initOriginProgression(data){
  const section=document.querySelector("#originMaxima");
  if(!section)return;
  const status=section.querySelector("#originStatus");
  try{
    const [originResponse,oldResponse]=await Promise.all([
      fetch("../../data/soldier-acquisition-progression-20261102.json?audit=origin-20261102",{cache:"no-store"}),
      fetch("../../data/soldier-research-maxima-20261101.json?audit=origin-20261102",{cache:"no-store"})
    ]);
    if(!originResponse.ok||!oldResponse.ok)throw new Error("획득처 자료 응답 오류");
    const [report,old]=await Promise.all([originResponse.json(),oldResponse.json()]);
    const verified=validateOriginProgression(report,data,old);
    const type=section.querySelector("#originType"),query=section.querySelector("#originSearch"),
      metric=section.querySelector("#originMetric"),table=section.querySelector("#originTable"),
      detail=section.querySelector("#originDetails"),summary=section.querySelector("#originSummary");
    const stats=report.stats;
    const sourceNames=new Map(report.rows.filter(r=>r.kind==="SOURCE_SPAWN")
      .map(r=>[r.id,r.sourceName]));
    const statHead=stats.map(k=>'<th>'+esc(STAT_LABELS[k]||k)+'</th>').join("");
    table.querySelector("thead").innerHTML='<tr><th>획득처 / 출생 병종</th><th>형식</th>'+
      '<th>검증 상태</th><th>11종 합계</th>'+statHead+'</tr>';
    summary.textContent=report.summary.classes+"개 병종 · 실제 출생 프로필 "+
      verified.births+"개 · 병종 변경 출발유형 "+verified.transformBranches+
      "개 · 출생 이력 선보유 "+report.summary.birthProfilesWithAlreadyCompletedCandidate+
      "개 · 직접 금지 이력 충돌 "+report.summary.birthProfilesWithDirectForbiddenCandidate+
      "개 · 출생처 기점 구조 사슬 "+report.summary.sourceRootedAncestry.sourceAnchoredCandidates+
      "개(최대 "+report.summary.sourceRootedAncestry.longestBodyChangeChain+
      "단계, 미실행) · 실행 검증 0개 · 최종 능력치 확정 0개";
    const classNames=new Map(data.soldiers.map(x=>[x.id,x.koName]));
    type.innerHTML='<option value="">전체 병종 (29종)</option>'+
      report.classes.map(x=>'<option value="'+esc(x.soldierType)+'">'+
        esc(classNames.get(x.soldierType)||x.soldierType)+'</option>').join("");
    function render(){
      const rawTerm=query.value.trim().toLocaleLowerCase("ko");
      const rootMode=rawTerm.startsWith("root:");
      const term=(rootMode?rawTerm.slice(5):rawTerm).trim();
      const matchedRoots=rootMode?new Set([...sourceNames].filter(([id,name])=>
        (id+" "+name).toLocaleLowerCase("ko").includes(term)).map(([id])=>id)):null;
      const rows=report.rows.filter(r=>(!type.value||r.soldierType===type.value)&&
        (rootMode?
          (r.kind==="SOURCE_SPAWN"?matchedRoots.has(r.id):
            r.candidateSourceAncestry?.rootProfileIds.some(id=>matchedRoots.has(id))):
          (!term||(r.id+" "+r.soldierName+" "+r.sourceName+" "+
            (r.parentSoldierType||"")).toLocaleLowerCase("ko").includes(term))));
      table.querySelector("tbody").innerHTML=rows.map(row=>{
        const value=metric.value==="verified"?row.finalStats:
          metric.value==="growth"?row.naturalGrowthUpper?.physicalThenBattle:
          row.birth?.[metric.value]||null;
        const total=value?sumStats(value,stats):null;
        const label=value?metric.value==="growth"?"조건부 성장 상계":"출생 원본 범위":"—";
        return '<tr><td><button type="button" class="maxima-show" data-origin-id="'+
          esc(row.id)+'">'+esc(row.soldierName)+'</button><small class="id">'+
          esc(row.sourceName)+'</small><small class="id">'+esc(row.id)+'</small></td>'+
          '<td>'+esc(TYPES[row.acquisitionType]||row.acquisitionType)+'</td>'+
          '<td class="maxima-uncertain">미검증'+
          (row.legacyCandidateBirthHistoryAudit?.directHistoryConflicts?.length?
            ' · 출생 이력 경고 '+row.legacyCandidateBirthHistoryAudit.directHistoryConflicts.length+'건':'')+
          (row.prerequisites?.reset?' · 이력 초기화':'')+
          (row.candidateSourceAncestry?' · 출생처 추적 후보 '+
            row.candidateSourceAncestry.candidateCount+'건(미실행)':'')+
          '<small class="id">'+esc(label)+'</small></td>'+
          '<td>'+(total==null?"—":cell(total))+'</td>'+
          stats.map(k=>'<td class="maxima-stat">'+(value?cell(value[k]):"—")+'</td>').join("")+
          '</tr>';
      }).join("")||'<tr><td colspan="15">해당하는 획득 프로필 없음</td></tr>';
      status.textContent=rows.length+"/"+verified.rows+
        "개 획득 분기 표시"+(rootMode?" · 최초 획득처 "+matchedRoots.size+
        "개에서 연결된 구조 후보(실행 미검증)":"")+
        " · 숫자는 선택한 출생값/조건부 성장 상계이며 확정 최종값이 아닙니다.";
      detail.hidden=true;detail.innerHTML="";
    }
    [type,metric].forEach(el=>el.addEventListener("change",render));
    query.addEventListener("input",render);
    table.querySelector("tbody").addEventListener("click",event=>{
      const b=event.target.closest("button[data-origin-id]");
      if(!b)return;
      const row=report.rows.find(r=>r.id===b.dataset.originId);
      if(row)showDetails(row,stats,detail,sourceNames);
    });
    render();
  }catch(error){
    status.textContent="획득처별 자료 검사 실패: "+error.message+
      " · 검증되지 않은 과거 병종 최대치를 대체 수치로 표시하지 않습니다.";
    console.error("Origin progression validation",error);
  }
}
