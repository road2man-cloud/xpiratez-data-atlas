// Research-exclusivity-constrained maximum soldier bonuses.
// Read-only audit view on the EXISTING 2.1 soldiers page. Never promote a
// conditional research/loot/RNG candidate to a save-proven final stat.
export const MAXIMA_STATS=["tu","stamina","health","bravery","reactions","firing",
  "throwing","strength","psiStrength","psiSkill","melee"];
const esc=s=>String(s).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const num=n=>Number(n||0);
const fmt=n=>(num(n)>0?"+":"")+num(n).toLocaleString("ko-KR");
const byId=(xs,id)=>xs.find(x=>x.id===id);

export function validateResearchMaxima(report,data){
  if(report?.schemaVersion!==1||!Array.isArray(report.rows)||report.rows.length!==29)
    throw new Error("병종 최대치 감사 자료의 개수/스키마 불일치");
  if(report.audit?.disables!==441||report.audit?.transformations!==83)
    throw new Error("원본 연구 상호배제 감사 범위가 바뀜");
  if(data?.soldiers?.length!==29||data?.transformations?.length!==83)
    throw new Error("현재 2.1 병종/변신 규칙과 감사 자료의 기준이 다름");
  const ids=new Set();
  for(const r of report.rows){
    if(ids.has(r.id)||!byId(data.soldiers,r.id))throw new Error("존재하지 않거나 중복된 병종: "+r.id);
    ids.add(r.id);
    if(r.solverStatus!==0||!Number.isFinite(r.score))
      throw new Error("최적화 완료 상태가 아닌 병종: "+r.id);
    if(MAXIMA_STATS.some(k=>!Number.isFinite(r.bonus?.[k])))
      throw new Error("능력치 11종 누락: "+r.id);
    const sum=MAXIMA_STATS.reduce((s,k)=>s+r.bonus[k],0);
    if(sum!==r.score)throw new Error("능력치 합계와 최대 후보 불일치: "+r.id);
    const used=new Set();
    for(const id of r.transformations||[]){
      const t=byId(data.transformations,id);
      if(!t||used.has(id)||!t.allowedSoldierTypes?.includes(r.id)||
        t.reset===true||t.producedSoldierType)
        throw new Error("선택된 변신 원본/병종 조건 불일치: "+r.id+"/"+id);
      used.add(id);
    }
  }
  return {classes:ids.size,transformations:data.transformations.length,
    researchRules:Object.keys(data.researchRules||{}).length,
    sourceExclusions:report.audit.disables};
}

export function maximaTableRows(report,data,mode="capPlusBonus",filter=""){
  const query=filter.trim().toLocaleLowerCase("ko-KR");
  return report.rows.filter(r=>{
    const s=byId(data.soldiers,r.id);
    return !query||(r.id+" "+s.koName+" "+s.enName).toLocaleLowerCase("ko-KR").includes(query);
  }).map((r,i)=>{
    const soldier=byId(data.soldiers,r.id);
    const values=Object.fromEntries(MAXIMA_STATS.map(k=>[k,
      mode==="bonus"?r.bonus[k]:num(soldier.statCaps?.[k])+r.bonus[k]]));
    return {id:r.id,name:soldier.koName,rank:i+1,score:r.score,values,
      uncertainRoots:r.unreachableResearchRoots?.length||0,
      transformCount:r.transformations.length};
  });
}

function linkResearch(id){
  // The legacy research page uses X-Piratez 1.1.1, not the 2.1 ruleset.
  // Keep current-version research IDs local instead of linking to stale rules.
  return "<code>"+esc(id)+"</code>";
}
export function validateResearchTriage(triage,report){
  if(triage?.schemaVersion!==1||triage.kind!=="XPIRATEZ_RESEARCH_ROUTE_TRIAGE"||
    triage.rows?.length!==report.rows.length||triage.summary?.classes!==29)
    throw new Error("연구 경로 감사 자료의 범위가 일치하지 않습니다");
  const byClass=new Map(triage.rows.map(x=>[x.id,x]));
  if(byClass.size!==29)throw new Error("경로 감사의 병종 중복");
  for(const row of report.rows){
    const r=byClass.get(row.id);
    if(!r||r.score!==row.score||r.proofStatus!=="UNPROVEN"||
      r.fullResearchChronologyExecuted!==false||r.saveExecuted!==false||
      Object.keys(r.branchChoice||{}).length!==6||
      r.historyConstraintsSatisfied!==true||
      r.historyOrder?.length!==row.transformations.length||
      new Set(r.historyOrder).size!==row.transformations.length||
      r.historyOrder.some(id=>!row.transformations.includes(id)))
      throw new Error("인증상태·연구 분기·변신 이력 순서가 일치하지 않는 병종: "+row.id);
  }
  if(triage.summary.saveVerified!==0||triage.summary.chronologyExecuted!==0)
    throw new Error("세이브 및 연구 순서 증명 없는 인증을 허용하지 않습니다");
  return byClass;
}
export function validateStatGateAudit(gates,report){
  if(gates?.schemaVersion!==1||
    gates.kind!=="SOLDIER_MAXIMA_NECESSARY_STAT_GATES"||
    gates.rows?.length!==report.rows.length||
    gates.summary?.classes!==29)throw new Error("능력치 최소조건 감사 자료 불일치");
  const map=new Map(gates.rows.map(x=>[x.id,x]));
  if(map.size!==29)throw new Error("능력치 감사 병종 중복");
  for(const row of report.rows){
    const gate=map.get(row.id);
    if(!gate||gate.score!==row.score||
      gate.noSelectedOnlyDeficitDetected!==!gate.deficits.length||
      gate.selectionNeedsExternalStatSource!==!!gate.deficits.length)
      throw new Error("조건부 최대 후보와 능력치 검사 불일치: "+row.id);
    for(const x of gate.deficits){
      if(!row.transformations.includes(x.training)||x.shortfall<=0||
        x.ceiling+x.shortfall!==x.required||
        x.proof!=="ZERO_PERCENT_AND_ALL_SELECTED_FIXED_GAINS_INCLUDED")
        throw new Error("근거 없는 능력치 부족 주장: "+row.id);
    }
  }
  if(gates.summary.externallyDependent!==4||
    gates.summary.deficits!==4)throw new Error("원본 스탯 부족 감사 범위가 달라졌습니다");
  return map;
}
export function validateStatGateResolutions(resolutions,gates,report){
  if(resolutions?.schemaVersion!==1||
    resolutions.kind!=="SOLDIER_MAXIMA_STAT_GATE_SOURCE_RESOLUTIONS"||
    resolutions.summary?.classesAudited!==29||
    resolutions.summary?.selectedOnlyDeficitClasses!==4||
    resolutions.summary?.eventBornBypassCases!==1||
    resolutions.summary?.confirmedCompleteAcquisitionRoutes!==0)
    throw new Error("보정 수단 획득 출처 감사 자료가 유효하지 않습니다");
  const matches=new Map(resolutions.rows.map(r=>[r.id,r]));
  if(matches.size!==4)throw new Error("보정 출처의 병종 수 불일치");
  for(const g of gates.rows){
    if(!g.deficits.length)continue;
    const r=matches.get(g.id),candidate=report.rows.find(row=>row.id===g.id);
    if(!r||!candidate||r.score!==candidate.score||
      r.shortfall!==g.deficits[0].shortfall||
      r.required!==g.deficits[0].required||
      r.key!==g.deficits[0].key||
      !r.directAttempt.minStatBlocked||
      r.directAttempt.observed!==g.deficits[0].ceiling)
      throw new Error("원본 최소 능력치 및 보정 출처 불일치: "+g.id);
    if(r.minimalSingleMedalCandidate &&
      (r.hypotheticalMedalClearsGate?.minStatBlocked!==false||
      r.hypotheticalMedalClearsGate.observed<r.required))
      throw new Error("훈장이 최소 조건을 해소한다는 근거 부족: "+g.id);
  }
  const hound=matches.get("STR_SOLDIER_BLOODOGE");
  if(hound?.sourceBornAlternatives?.length!==1||
    hound.sourceBornAlternatives[0].event!=="STR_CODEX_BONUS_G5"||
    hound.postEventReplay?.status!=="ASSUMPTION_SEEDED_POST_EVENT_CONTINUATION"||
    hound.postEventReplay.postEventTotalPermanentBonus!==hound.score)
    throw new Error("블러드하운드 이벤트 출생 이력 검증 누락");
  const synth=matches.get("STR_SOLDIER_SYNTH");
  if(synth?.optimisticMinDistinctMedals!==11||
    synth.absoluteAllMedalUpperBound!==52)
    throw new Error("신스 훈장 낙관 상한 비교 불일치");
  return matches;
}
const STAT_LABELS={tu:"행동력",stamina:"기력",health:"체력",
  bravery:"용기",reactions:"반응",firing:"사격",throwing:"투척",
  strength:"힘",psiStrength:"사이오닉 강도",psiSkill:"사이오닉 기술",melee:"근접"};
const BRANCH_LABELS={captain:"선장",path:"세력",cause:"대의",queen:"여왕",codex:"코덱스",god:"신"};
function renderDetails(report,data,id,triageById,statGateById,sourceById){
  const r=report.rows.find(x=>x.id===id);
  const box=document.querySelector("#maximaDetails");
  if(!r){box.hidden=true;box.innerHTML="";return}
  const soldier=byId(data.soldiers,r.id);
  const triage=triageById.get(r.id);
  const gate=statGateById.get(r.id);
  const source=sourceById.get(r.id)||null;
  const rows=(triage.historyOrder||[]).map((tid,index)=>{
    const t=byId(data.transformations,tid);
    const roots=t?.requires||[];
    return '<tr><td>'+(index+1)+'. '+esc(t?.koName||tid)+'<small class="id">'+esc(tid)+'</small></td><td>'+
      roots.map(linkResearch).join(" · ")+'</td></tr>';
  }).join("");
  const unresolved=(r.unreachableResearchRoots||[]).map(x=>
    '<li>'+esc(Array.isArray(x)?x[0]:x.name||String(x))+
    ' · 정적 연구 그래프만으로 순서가 확인되지 않은 선행연구: '+
    (Array.isArray(x)?x[1]:x.missing||[]).map(linkResearch).join(", ")+'</li>').join("");
  const sources=(triage.eventGrantGoals||[]).map(e=>'<li>'+
    linkResearch(e.id)+' · '+e.events.map(x=>'<code>'+esc(x)+'</code>').join(', ')+
    ' · 이벤트 실행/보상 미증명</li>').join("");
  const choices=Object.entries(triage.branchChoice||{}).map(([group,value])=>
    '<li><strong>'+esc(BRANCH_LABELS[group]||group)+':</strong> '+
    linkResearch(value)+(triage.forcedBySource?.[group]===value?
      ' (필수 획득 출처 반영)':' (충돌이 확인되지 않은 선택 가정)')+'</li>').join("");
  const proof='<section class="maxima-source-evidence">'+
    '<h4>연구 선행·이벤트 출처 감사 (미인증)</h4>'+
    '<p><strong>전체 경로 인증: 0회.</strong> '+triage.rootGoals+
    '개 직접 연구 목표에서 '+triage.nominalPrerequisiteNodes+
    '개의 명목 선행연구를 조사했습니다. 주요 6개 연구 선택 분기에서 '+
    '알려진 배타성 충돌 없는 조합이 있지만, 연구실 실제 진행·무료 보상·이벤트 추첨·재료·훈장은 미인증입니다.</p>'+
    '<p>명목 정렬에서 빠진 연구 목표: '+triage.nominalUnscheduledGoals.length+
    '개. 0개여도 실제 연구 완료 증거가 아닙니다.</p>'+
    '<h5>양립 가능한 연구 분기 조합 (가정)</h5><ul>'+choices+'</ul>'+
    (sources?'<h5>직접 연구 목표의 이벤트 지급 출처</h5><ul>'+sources+'</ul>':
      '<p class="muted">직접 목표에 이벤트 지급이 색인되지 않았더라도 간접 연구에 이벤트가 필요할 수 있습니다.</p>')+
    '</section>';
  const statRisks=gate.deficits.map(x=>{
    const t=byId(data.transformations,x.training);
    return '<li>'+esc(t?.koName||x.training)+' ('+linkResearch(x.training)+
      ') : <strong>'+esc(STAT_LABELS[x.key]||x.key)+' 최소 '+x.required+
      '</strong> / 선택 훈련만으로 가능한 넉넉한 상한 '+x.ceiling+
      ' / 추가 보정 최소 <strong>'+x.shortfall+'</strong></li>';
  }).join("");
  const statNote=statRisks?
    '<section class="maxima-unverified"><h4>'+(
      source?.sourceBornAlternatives?.length?
        '일반 직접 시술의 최소 능력치 미달 (이벤트 출생 예외 있음)':
        '추가 능력치 상승 수단 필요'
    )+' ('+gate.deficits.length+'건)</h4><p>현재 표의 선택된 변신을 모두 유리한 순서로 고려하고 시작 능력치를 병종 하드캡까지 높여도 '+
    '일반적인 직접 시술에는 이 능력치가 부족합니다. '+
    (source?.sourceBornAlternatives?.length?
      '다만 아래의 원본 이벤트에서 해당 훈련 이력과 보너스를 미리 받은 새 대원을 획득하는 별도의 경로가 존재합니다. ':
      '실제 훈장·선행 강화 등으로 이 부족분을 채웠다는 실전 증거는 아직 없습니다. ')+
    '해당 영구 보너스가 자동으로 달성된다는 뜻은 아닙니다.</p><ul>'+statRisks+
    '</ul></section>':
    '<p class="muted">선택된 변신 목록에서 추가 능력치 부족이 정적으로 검출되지는 않았습니다. '+
    '실제 순서·훈장·RNG 요구조건을 전부 통과했다는 의미는 아닙니다.</p>';
  const sourceMedal=source?.minimalSingleMedalCandidate;
  const sourceBorn=source?.sourceBornAlternatives?.[0];
  const medals=source?.optimisticMedalTopCombination||[];
  const sourceNote=source?
    '<section class="maxima-source-evidence"><h4>부족 조건의 원본 출처 대안 (실전 미검증)</h4>'+
    (sourceMedal?'<p><strong>훈장 가정:</strong> '+
      esc(sourceMedal.name)+' '+sourceMedal.level+'단계 ('+linkResearch(sourceMedal.id)+
      ')는 '+esc(STAT_LABELS[source.key]||source.key)+' +'+sourceMedal.increase+
      '를 부여합니다. '+sourceMedal.criterion.map(c=>
        '<code>'+esc(c.kind)+' ≥ '+esc(c.threshold)+'</code>').join(', ')+
      ' 조건이며, 실제 병종이 시술 전에 훈장을 얻었다는 증명은 아닙니다.</p>':'')+
    (sourceBorn?'<p><strong>이벤트 출생 예외:</strong> '+
      esc(sourceBorn.eventKoName)+' ('+linkResearch(sourceBorn.event)+
      ')는 '+linkResearch(sourceBorn.awardedHistory)+' 이력과 '+
      linkResearch(sourceBorn.awardedBonus)+' 보너스를 가진 병사를 직접 생성합니다. '+
      '일반 병사의 붉은 영웅 훈련 시술과 다르므로 힘 80 자격 관문을 소급 적용하지 않습니다.</p>'+
      '<p>이벤트 발생 조건: '+sourceBorn.requiredPositiveTriggers.map(x=>
        linkResearch(x.id)+' 필요').join(', ')+
      '; '+sourceBorn.requiredNegativeTriggers.map(x=>
        linkResearch(x.id)+' 미완료').join(', ')+
      '. 실행 확률 지정값 '+sourceBorn.minExecutionOdds+
      '%(조건 만족 후의 추첨값, 발생 보장 아님).</p>'+
      '<p><strong>시술 후속 재생 검사:</strong> 원본 이벤트 출생 개체에 '+
      '연구·재료·시설·자금이 이미 있다고 가정하면, '+
      source.postEventReplay.modeledSteps.map(s=>linkResearch(s.transform)).join(' → ')+
      ' 두 시술은 OXCE 기반 판정기를 순서대로 통과하며 보너스 합계 '+
      fmt(source.postEventReplay.postEventTotalPermanentBonus)+
      '입니다. 이벤트 획득과 재료 조달부터 재생한 실제 세이브 증명은 아닙니다.</p>':'')+
    (source.optimisticMinDistinctMedals>1?
      '<p><strong>훈장 다종 필요:</strong> 이 능력치에 양수 보너스를 주는 모든 훈장 '+
      source.medalSourcesWithPositiveBonus+'종의 최고 단계 증가분 합은 +'+
      source.absoluteAllMedalUpperBound+'입니다. 필요한 +'+source.shortfall+
      '를 채우려면 이론적으로 최소 '+source.optimisticMinDistinctMedals+
      '종의 서로 다른 훈장을 필요로 합니다. 이 값은 각 훈장을 원하는 만큼 얻을 수 있다고 가정한 '+
      '<strong>낙관적 하한</strong>이며, 실제 획득 가능성을 증명하지 않습니다.</p>'+
      '<details><summary>낙관적 최소 훈장 조합의 최대 단계 보기</summary><ol>'+
      medals.map(x=>'<li>'+esc(x.koName)+' ('+linkResearch(x.id)+
        ') '+x.maxAtLevel+'단계, 최대 +'+x.max+'</li>').join('')+'</ol></details>':'')+
    '</section>':'';
  box.hidden=false;
  box.innerHTML='<div class="maxima-detail-head"><h3>'+esc(soldier.koName)+
    ' · 영구 보너스 '+fmt(r.score)+'</h3><button id="maximaDetailClose" type="button">닫기</button></div>'+
    '<p>연구·변신의 정적 배타성 제약을 적용한 <strong>조건부 최적 조합</strong>입니다. '+
    '선장 분기 충돌을 포함한 알려진 배제는 제외했지만 세이브의 재료·훈장·시설·임무·무료 연구 난수가 모두 충족됐다는 증명이 아닙니다.</p>'+
    (unresolved?'<details class="maxima-unverified"><summary>기존 단순 최적화기의 우회 해금 미해결 표시 ('+
       (r.unreachableResearchRoots?.length||0)+'건)</summary><p>이 항목은 연구 불가능 판정이 아닙니다. 위의 출처 감사는 대체 해금·조건부 연구 지급을 포함해 명목상 선행연구를 정렬했습니다. 실제 연구 실행은 여전히 미인증입니다.</p><ul>'+
       unresolved+'</ul></details>':'')+
    proof+statNote+sourceNote+
    '<p class="muted">아래 변신은 필수·금지 이력에 위배되지 않게 정렬한 순서입니다. '+
    '연구 완료 시점·능력치 최소 조건·재료 보유를 확인한 실행 순서는 아닙니다.</p>'+
    '<div class="maxima-route-table"><table><thead><tr><th>이력 제약 통과 순서 ('+
     r.transformations.length+'개)</th><th>직접 필요한 연구</th></tr></thead><tbody>'+
     rows+'</tbody></table></div>'+
    '<p class="muted">각 병종의 최대 후보는 서로 다른 연구 분기에서 산출됩니다. '+
    '여러 병종의 보너스 또는 상호배타적인 훈련을 다시 합산하지 마세요. '+
    '<a href="../../trainings/">훈련·상호배제 조합기</a>에서 순서를 검토할 수 있습니다.</p>';
  box.querySelector("#maximaDetailClose").addEventListener("click",()=>{box.hidden=true;box.innerHTML=""});
}

export async function initResearchMaxima(data){
  const host=document.querySelector("#researchMaxima");
  if(!host)return;
  try{
    const [maxResponse,triageResponse,gateResponse,sourceResponse]=await Promise.all([
      fetch("../../data/soldier-research-maxima-20261101.json?audit=acquisition-20261102",{cache:"no-store"}),
      fetch("../../data/soldier-research-triage-20261101.json?audit=acquisition-20261102",{cache:"no-store"}),
      fetch("../../data/soldier-stat-gate-audit-20261102.json?audit=acquisition-20261102",{cache:"no-store"}),
      fetch("../../data/soldier-stat-gate-resolutions-20261102.json?audit=acquisition-20261102",{cache:"no-store"})
    ]);
    if(!maxResponse.ok||!triageResponse.ok||!gateResponse.ok||!sourceResponse.ok)
      throw new Error("연구·능력치 자료 HTTP "+maxResponse.status+"/"+triageResponse.status+
        "/"+gateResponse.status+"/"+sourceResponse.status);
    const [report,triage,gates,resolutions]=await Promise.all([
      maxResponse.json(),triageResponse.json(),gateResponse.json(),sourceResponse.json()
    ]);
    const check=validateResearchMaxima(report,data);
    const triageById=validateResearchTriage(triage,report);
    const statGateById=validateStatGateAudit(gates,report);
    const sourceById=validateStatGateResolutions(resolutions,gates,report);
    const mode=document.querySelector("#maximaStatMode");
    const search=document.querySelector("#maximaSearch");
    const out=document.querySelector("#maximaTable");
    const status=document.querySelector("#maximaStatus");
    const audit=document.querySelector("#maximaAudit");
    const chronologicallyUnresolved=report.rows.filter(x=>(x.unreachableResearchRoots||[]).length).length;
    audit.textContent=check.classes+"종 병종 · 선행연구 출처 재검사 "+
      triage.summary.classes+"종 · 변신 "+check.transformations+
      "종 · 설치 규칙 직접 연구 배제 "+check.sourceExclusions+
      "건 · 사이트 병합 연구 "+check.researchRules+
      "종 · 세이브에서 최종 경로 입증 "+(report.audit.verifiedInSaveCount||0)+
      "/"+check.classes+"종 · 선택 훈련만으로 능력치 게이트 미달 "+
      gates.summary.externallyDependent+"종 (이벤트 출생 예외 "+
      resolutions.summary.eventBornBypassCases+"종) · 예전 최적화기 추가 진단 "+chronologicallyUnresolved+"종";
    const columns=MAXIMA_STATS.map(k=>'<th scope="col">'+
      esc(data.statLabels?.[k]||k)+'</th>').join("");
    function render(){
      const rows=maximaTableRows(report,data,mode.value,search.value);
      out.querySelector("thead").innerHTML='<tr><th scope="col">병종 / 후보</th>'+
        '<th scope="col">마나 제외<br>영구 보너스 합</th>'+
        '<th scope="col">연구 증명 상태</th>'+columns+'</tr>';
      out.querySelector("tbody").innerHTML=rows.map(r=>{
        const rootAudit=triageById.get(r.id);
        const gate=statGateById.get(r.id);
        const resolution=sourceById.get(r.id);
        const proof=(resolution?.sourceBornAlternatives?.length?
          '출생 이벤트로 시술 조건 우회 · 미인증':
          gate.selectionNeedsExternalStatSource?
            resolution?.minimalSingleMedalCandidate?
              '훈장 등 추가 보정 필요 · 미인증':
              '다수 훈장 등 보정 필요 · 미인증':
            '전체 경로 미인증')+
          (rootAudit.eventGrantGoalCount?' · 직접 연구 이벤트 '+
            rootAudit.eventGrantGoalCount+'건':'');
        return '<tr><td><button class="maxima-show" type="button" data-maxima-type="'+
          esc(r.id)+'">'+esc(r.name)+'</button><small class="id">'+esc(r.id)+'</small>'+
          '<small class="route">'+r.transformCount+'개 변신 · 자세히 보기</small></td>'+
          '<td class="maxima-score">'+fmt(r.score)+'</td><td class="maxima-uncertain">'+
          esc(proof)+'</td>'+MAXIMA_STATS.map(k=>'<td class="maxima-stat">'+
          (mode.value==="bonus"?fmt(r.values[k]):num(r.values[k]).toLocaleString("ko-KR"))+
          '</td>').join("")+'</tr>';
      }).join("")||'<tr><td colspan="14">해당 병종 없음</td></tr>';
      status.textContent=rows.length+"종 표시 · "+(mode.value==="bonus"?
        "변신으로 획득하는 영구 능력치 보너스":"기본 병종의 statCaps + 영구 변신 보너스 (기본 능력치 무작위 변화는 제외)")+
        " · 최적화 후보이며 실전 인증 0/"+check.classes+"종";
    }
    mode.addEventListener("change",render);
    search.addEventListener("input",render);
    out.querySelector("tbody").addEventListener("click",e=>{
      const btn=e.target.closest("button[data-maxima-type]");
      if(btn)renderDetails(report,data,btn.dataset.maximaType,triageById,statGateById,sourceById);
    });
    render();
  }catch(error){
    document.querySelector("#maximaStatus").textContent=
      "최대치 표 검증 실패: "+error.message+" · 오래된/다른 버전 계산을 대신 보여주지 않습니다.";
    console.error("Research maxima validation",error);
  }
}
