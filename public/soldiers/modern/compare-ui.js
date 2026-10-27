import {compareSoldierFutureRoutes} from "./comparison.js";
const esc=x=>String(x??"").replace(/[&<>"']/g,s=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[s]));
export function initFutureComparison(data){
  const result=compareSoldierFutureRoutes(data);
  const check=document.querySelector("#futureDifferentOnly");
  const summary=document.querySelector("#futureCompareSummary");
  const tbody=document.querySelector("#futureCompareTable tbody");
  if(!check||!summary||!tbody)return;
  summary.innerHTML=[
    "일반 갈: 확정 제외 "+result.gal.excluded+"개 / 나머지 후보 "+result.gal.candidates+"개",
    "반 슈퍼변이체 농부: 확정 제외 "+result.half.excluded+"개 / 나머지 후보 "+result.half.candidates+"개",
    "판정 유형이 서로 다른 변신 "+result.different+"개"
  ].map(t=>'<strong>'+esc(t)+'</strong>').join("");
  function cell(report){
    return '<span class="tag">'+esc(report.label)+'</span><small>'+esc(report.reason)+'</small>';
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
        '<td>'+esc(causes.join(" · ")||"양쪽 동일")+'</td></tr>';
    }).join("");
    if(!rows.length)tbody.innerHTML='<tr><td colspan="4">표시할 차이가 없습니다.</td></tr>';
  }
  check.onchange=render;
  render();
  return result;
}
