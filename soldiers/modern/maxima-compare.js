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
function renderDetails(report,data,id){
  const r=report.rows.find(x=>x.id===id);
  const box=document.querySelector("#maximaDetails");
  if(!r){box.hidden=true;box.innerHTML="";return}
  const soldier=byId(data.soldiers,r.id);
  const rows=(r.transformations||[]).map(tid=>{
    const t=byId(data.transformations,tid);
    const roots=t?.requires||[];
    return '<tr><td>'+esc(t?.koName||tid)+'<small class="id">'+esc(tid)+'</small></td><td>'+
      roots.map(linkResearch).join(" · ")+'</td></tr>';
  }).join("");
  const unresolved=(r.unreachableResearchRoots||[]).map(x=>
    '<li>'+esc(Array.isArray(x)?x[0]:x.name||String(x))+
    ' · 정적 연구 그래프만으로 순서가 확인되지 않은 선행연구: '+
    (Array.isArray(x)?x[1]:x.missing||[]).map(linkResearch).join(", ")+'</li>').join("");
  box.hidden=false;
  box.innerHTML='<div class="maxima-detail-head"><h3>'+esc(soldier.koName)+
    ' · 영구 보너스 '+fmt(r.score)+'</h3><button id="maximaDetailClose" type="button">닫기</button></div>'+
    '<p>연구·변신의 정적 배타성 제약을 적용한 <strong>조건부 최적 조합</strong>입니다. '+
    '세이브의 재료·훈장·시설·임무·무료 연구 난수가 모두 충족됐다는 증명이 아닙니다.</p>'+
    (unresolved?'<div class="maxima-unverified"><strong>연구 시간순 추가 검증 필요 ('+
       (r.unreachableResearchRoots?.length||0)+'건)</strong><ul>'+unresolved+'</ul></div>':
       '<p class="muted">정적 연구 그래프에 표시된 미도달 직접 연구 목표는 없습니다. 실제 연구 완료의 증명은 아닙니다.</p>')+
    '<div class="maxima-route-table"><table><thead><tr><th>선택 훈련 ('+
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
    const response=await fetch("../../data/soldier-research-maxima-20261101.json");
    if(!response.ok)throw new Error("감사 자료 HTTP "+response.status);
    const report=await response.json();
    const check=validateResearchMaxima(report,data);
    const mode=document.querySelector("#maximaStatMode");
    const search=document.querySelector("#maximaSearch");
    const out=document.querySelector("#maximaTable");
    const status=document.querySelector("#maximaStatus");
    const audit=document.querySelector("#maximaAudit");
    audit.textContent=check.classes+"종 병종 · 변신 "+check.transformations+
      "종 · 설치 규칙 직접 연구 배제 "+check.sourceExclusions+
      "건 · 사이트 병합 연구 "+check.researchRules+"종";
    const columns=MAXIMA_STATS.map(k=>'<th scope="col">'+
      esc(data.statLabels?.[k]||k)+'</th>').join("");
    function render(){
      const rows=maximaTableRows(report,data,mode.value,search.value);
      out.querySelector("thead").innerHTML='<tr><th scope="col">병종 / 후보</th>'+
        '<th scope="col">마나 제외<br>영구 보너스 합</th>'+
        '<th scope="col">연구 증명 상태</th>'+columns+'</tr>';
      out.querySelector("tbody").innerHTML=rows.map(r=>{
        const src=report.rows.find(x=>x.id===r.id);
        const proof=r.uncertainRoots?'시간순 연구 미증명 '+r.uncertainRoots+'건':'시술 조건 미증명';
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
        " · 모든 행은 조건부 후보";
    }
    mode.addEventListener("change",render);
    search.addEventListener("input",render);
    out.querySelector("tbody").addEventListener("click",e=>{
      const btn=e.target.closest("button[data-maxima-type]");
      if(btn)renderDetails(report,data,btn.dataset.maximaType);
    });
    render();
  }catch(error){
    document.querySelector("#maximaStatus").textContent=
      "최대치 표 검증 실패: "+error.message+" · 오래된/다른 버전 계산을 대신 보여주지 않습니다.";
    console.error("Research maxima validation",error);
  }
}
