import {compareSoldierFutureRoutes,assessCampaignResearch} from "./comparison.js";
const esc=x=>String(x??"").replace(/[&<>"']/g,s=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[s]));
export function initFutureComparison(data){
  const result=compareSoldierFutureRoutes(data);
  const check=document.querySelector("#futureDifferentOnly");
  const summary=document.querySelector("#futureCompareSummary");
  const researchNotice=document.querySelector("#futureCompareResearch");
  const tbody=document.querySelector("#futureCompareTable tbody");
  if(!check||!summary||!tbody)return null;
  let evidence=new Map();
  summary.innerHTML=[
    "일반 갈: 확정 제외 "+result.gal.excluded+"개 / 나머지 후보 "+result.gal.candidates+"개",
    "반 슈퍼변이체 농부: 확정 제외 "+result.half.excluded+"개 / 나머지 후보 "+result.half.candidates+"개",
    "판정 유형이 서로 다른 변신 "+result.different+"개"
  ].map(t=>'<strong>'+esc(t)+'</strong>').join("");
  function cell(report){
    return '<span class="tag">'+esc(report.label)+'</span><small>'+esc(report.reason)+'</small>';
  }
  function researchCell(id){
    const current=evidence.get(id);
    if(!current)return '<span class="muted">세이브 미적용</span>';
    return '<span class="tag">'+esc(current.label)+'</span><small>'+esc(current.reason)+'</small>';
  }
  function render(){
    const rows=check.checked?result.rows.filter(x=>x.different):result.rows;
    tbody.innerHTML=rows.map(r=>{
      const causes=[];
      if(r.gal.kind!==r.half.kind){
        if(r.gal.kind==="excluded"||r.half.kind==="excluded")causes.push("확정 배제 조건 차이");
        else if(r.gal.kind==="history"||r.half.kind==="history")causes.push("초기 변신 이력");
        else causes.push("병종·선행/연구 조건");
      }
      return '<tr data-route-id="'+esc(r.id)+'">'+
        '<td><strong>'+esc(r.koName)+'</strong><small>'+esc(r.id)+'</small></td>'+
        '<td>'+cell(r.gal)+'</td><td>'+cell(r.half)+'</td>'+
        '<td>'+esc(causes.join(" · ")||"양쪽 동일")+'</td>'+
        '<td>'+researchCell(r.id)+'</td></tr>';
    }).join("");
    if(!rows.length)tbody.innerHTML='<tr><td colspan="5">표시할 차이가 없습니다.</td></tr>';
  }
  function setSave(save){
    evidence=new Map();
    if(save?.research){
      for(const t of data.transformations){
        evidence.set(t.id,assessCampaignResearch(data,save,t));
      }
      const relevant=result.rows.filter(x=>x.gal.kind!=="excluded"||x.half.kind!=="excluded");
      const counts={};
      for(const row of relevant){
        const kind=evidence.get(row.id)?.kind||"unverified";
        counts[kind]=(counts[kind]||0)+1;
      }
      researchNotice.textContent="현재 세이브 연구 상태 대조 · 두 병종 후보의 합집합 "+relevant.length+
        "개 중 요구 연구 완료 "+(counts.complete||0)+"개 · 직접 폐쇄 "+(counts.closed||0)+
        "개 · 명목 선행망 충돌 "+(counts.nominal||0)+"개 · 기타 미완료 "+((counts.pending||0)+(counts.event||0))+
        "개. 이 숫자는 연구 증거일 뿐 병사 변신의 실제 실행 자격이나 미래 획득 보장이 아닙니다.";
    }else{
      researchNotice.textContent="세이브를 불러오면 완료·폐쇄 연구와 이벤트 우회 가능성에 대한 근거를 자동 대조합니다. 파일은 서버에 보내지 않습니다.";
    }
    render();
  }
  check.onchange=render;
  render();
  return {result,setSave};
}
