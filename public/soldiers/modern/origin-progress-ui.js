// Source-specific, deliberately non-certifying soldier progression comparison.
// This view lives inside the existing modern soldier atlas; it does not
// reinterpret old 29-body conditional maxima as final per-person results.
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
    s.finalStatRoutesVerified!==0||s.saveVerified!==0||s.chronologicalPathsVerified!==0)
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
    if(seen.has(row.id)||!candidates.has(row.soldierType)||!VERIFY.includes(row.proof?.status))
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
        row.naturalGrowthCanIncrease.some(k=>!report.stats.includes(k)))
        throw new Error("출생처별 자연 성장 상계 누락: "+row.id);
    }else if(row.kind==="TYPE_CHANGE_WITH_UNRESOLVED_PARENT"){
      const t=transformations.get(row.sourceId);
      if(!t||t.producedSoldierType!==row.soldierType||
        !t.allowedSoldierTypes.includes(row.parentSoldierType)||
        row.prerequisites.reset!==(t.reset===true)||
        row.proof.resetPreviousHistory!==(t.reset===true)||
        row.birth!==null||row.naturalGrowthUpper!==null||
        row.initialHistory!==null||row.bornPermanentBonus!==null||
        row.proof.unresolvedParent!==true)
        throw new Error("변신 출생 경로 / reset 초기화 불일치: "+row.id);
    }else throw new Error("출생 형식 알 수 없음: "+row.id);
  }
  for(const p of data.profiles)if(!seen.has(p.id))throw new Error("출생처 누락: "+p.id);
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
    '<p>'+esc(row.naturalGrowthAssumption)+'</p>':
    '<p><strong>출발 병종:</strong> '+linkableId(row.parentSoldierType)+
    ' · <strong>원본 병종 변경:</strong> '+linkableId(row.sourceId)+'</p>'+
    '<p><strong>최초 출생 상태가 비어 있는 이유:</strong> 병종 변경 이전의 특정 개인 획득처, 능력치, 훈장, 성장 및 변신 이력의 완전한 선후관계가 아직 재생되지 않았습니다.</p>'+
    '<p><strong>변신 이력 초기화:</strong> '+
    (row.prerequisites.reset?'<strong>reset: true · 이전 이력을 자동 상속하면 안 됨</strong>':
      'reset: false · 이전 이력을 유지할 수 있으나 실제 출발 개인을 확인해야 함')+'</p>'+
    '<p><strong>알려진 직접 출발 프로필:</strong> '+
      idItems(row.parentAcquisitionProfiles)+'</p>';
  html+='<section class="maxima-source-evidence"><h4>획득 조건 및 증명에 남은 작업</h4>'+
    '<p>필요 연구: '+idItems(row.prerequisites.research)+
    ' · 기지 기능: '+idItems(row.prerequisites.facilities)+'</p>'+
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
      "개 · 획득 경로별 실행 검증 0개 · 최종 능력치 확정 0개";
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
