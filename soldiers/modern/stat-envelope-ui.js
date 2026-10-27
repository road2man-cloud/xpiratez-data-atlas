import {effectiveEnvelope} from "./stat-envelope.js";
import {STAT_KEYS} from "./eligibility.js";
const esc=x=>String(x??"").replace(/[&<>"']/g,ch=>({
  "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
}[ch]));
const val=x=>Number(x).toLocaleString("ko-KR",{maximumFractionDigits:1});
const range=(lo,hi)=>lo===hi?val(lo):val(lo)+" ~ "+val(hi);
export function renderStatEnvelope(root,bounds,state,data,stepIds=[],options={}){
  if(!root)return;
  if(bounds?.kind!=="ready"){
    root.textContent="능력치 범위를 확정할 수 없습니다: "+
      (bounds?.reason||"초기 능력치 규칙/세이브 정보가 없습니다.");
    return;
  }
  const withGear=effectiveEnvelope(bounds,state,data,options);
  const effective=withGear.kind==="ready";
  const exact=STAT_KEYS.every(k=>bounds.low[k]===bounds.high[k]);
  const title=stepIds.length?stepIds.length+"단계 변신을 순서대로 반영한 범위":
    "변신 전 초기 생성 범위";
  root.innerHTML='<p class="muted"><strong>'+esc(title)+'</strong> · '+
    esc(bounds.source)+' · '+(exact?"현재 계산 범위가 단일값":"무작위 시작값·변신 변화로 숫자에 범위가 존재")+
    (bounds.randomSteps.length?" · 무작위 변화: "+esc(bounds.randomSteps.join(", ")):"")+
    '</p><div class="table-shell"><table class="stat-envelope-table">'+
    '<thead><tr><th>능력치</th><th>변신 후 원시 능력치 범위</th>'+
    '<th>착용 장비 1벌·현재 특성 포함 (조건부)</th></tr></thead><tbody>'+
    STAT_KEYS.map(k=>'<tr><th scope="row">'+esc(data.statLabels?.[k]||k)+'</th>'+
      '<td data-stat="'+esc(k)+'">'+range(bounds.low[k],bounds.high[k])+'</td>'+
      '<td data-equipped-stat="'+esc(k)+'">'+(effective?
        range(withGear.low[k],withGear.high[k]):"장비 증거 미확인")+'</td></tr>').join("")+
    '</tbody></table></div><p class="muted">'+
    (effective?"기준 방어구: "+esc(withGear.armorId||"기본값/장비 없음")+
      " · 특성 중복 합산 없음 · 장비 획득·착용 가능성의 미래 검증은 별도 필요. ":"장비/특성 적용 범위를 계산하지 않았습니다: "+
        esc(withGear.reason||"장비 보정 근거 누락")+". ")+
    '최소·최대는 <strong>모든 실제 결과를 포함하도록 넓게 계산한 경계</strong>이며, '+
    '동일 대원에게 동시에 달성 가능한 최종 조합이나 미래 최대 성장 능력치를 뜻하지 않습니다. '+
    '미확인 연구·훈장·성장·장비 획득·미래 RNG는 최종 수치로 확정하지 않습니다.</p>';
}
