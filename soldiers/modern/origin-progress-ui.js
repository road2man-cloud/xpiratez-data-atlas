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
    oldMaxima.rows?.length!==29)
    throw new Error("11개 능력치 또는 병종 집계 범위 불일치");
  const candidates=new Map(oldMaxima.rows.map(x=>[x.id,x]));
  const original=new Map(data.profiles.map(p=>[p.id,p]));
  const transformations=new Map(data.transformations.map(t=>[t.id,t]));
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
    }else throw new Error("출생 형식 알 수 없음: "+row.id);
  }
  for(const p of data.profiles)if(!seen.has(p.id))throw new Error("출생처 누락: "+p.id);
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
function showDetails(row,stats,host){
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
  const eventEvidence=eventGate?'<p><strong>이벤트 실행 가드:</strong> 최초 월 '+
    (eventGate.firstMonth==null?'상한 없음':cell(eventGate.firstMonth))+
    ' · 마지막 월 '+(eventGate.lastMonth==null?'상한 없음':cell(eventGate.lastMonth))+
    ' · 실행 확률 지정 '+(eventGate.minExecutionOdds==null?'미상':cell(eventGate.minExecutionOdds)+'%')+
    ' (스케줄러/추첨 조건까지 만족해야 하며 발생 보장 아님)</p>'+
    '<p><strong>필수 트리거:</strong> '+idItems(eventGate.positiveTriggers)+
    ' · <strong>금지 트리거:</strong> '+idItems(eventGate.negativeTriggers)+'</p>':'';
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
    const statHead=stats.map(k=>'<th>'+esc(STAT_LABELS[k]||k)+'</th>').join("");
    table.querySelector("thead").innerHTML='<tr><th>획득처 / 출생 병종</th><th>형식</th>'+
      '<th>검증 상태</th><th>11종 합계</th>'+statHead+'</tr>';
    summary.textContent=report.summary.classes+"개 병종 · 실제 출생 프로필 "+
      verified.births+"개 · 병종 변경 출발유형 "+verified.transformBranches+
      "개 · 출생 시 후보 훈련 선보유 "+report.summary.birthProfilesWithAlreadyCompletedCandidate+
      "개 · 원본 직접 금지 이력 충돌 "+report.summary.birthProfilesWithDirectForbiddenCandidate+
      "개 · 실행 검증 0개 · 최종 능력치 확정 0개";
    const classNames=new Map(data.soldiers.map(x=>[x.id,x.koName]));
    type.innerHTML='<option value="">전체 병종 (29종)</option>'+
      report.classes.map(x=>'<option value="'+esc(x.soldierType)+'">'+
        esc(classNames.get(x.soldierType)||x.soldierType)+'</option>').join("");
    function render(){
      const term=query.value.trim().toLocaleLowerCase("ko");
      const rows=report.rows.filter(r=>(!type.value||r.soldierType===type.value)&&
        (!term||(r.id+" "+r.soldierName+" "+r.sourceName+" "+
          (r.parentSoldierType||"")).toLocaleLowerCase("ko").includes(term)));
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
          '<small class="id">'+esc(label)+'</small></td>'+
          '<td>'+(total==null?"—":cell(total))+'</td>'+
          stats.map(k=>'<td class="maxima-stat">'+(value?cell(value[k]):"—")+'</td>').join("")+
          '</tr>';
      }).join("")||'<tr><td colspan="15">해당하는 획득 프로필 없음</td></tr>';
      status.textContent=rows.length+"/"+verified.rows+
        "개 획득 분기 표시 · 숫자는 선택한 출생값/조건부 성장 상계이며 확정 최종값이 아닙니다.";
      detail.hidden=true;detail.innerHTML="";
    }
    [type,metric].forEach(el=>el.addEventListener("change",render));
    query.addEventListener("input",render);
    table.querySelector("tbody").addEventListener("click",event=>{
      const b=event.target.closest("button[data-origin-id]");
      if(!b)return;
      const row=report.rows.find(r=>r.id===b.dataset.originId);
      if(row)showDetails(row,stats,detail);
    });
    render();
  }catch(error){
    status.textContent="획득처별 자료 검사 실패: "+error.message+
      " · 검증되지 않은 과거 병종 최대치를 대체 수치로 표시하지 않습니다.";
    console.error("Origin progression validation",error);
  }
}
