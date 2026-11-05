import {evaluatePurchaseReadiness} from './purchase-readiness.js';

// Ephemeral, in-memory scenario only. Never upload, save in localStorage, or
// infer unselected research from an incomplete game save.
const blank=()=>({research:{},baseFunctions:{},alliedCountries:{},
  storeVisibleByItem:{},purchasedThisMonthByItem:{},
  checkoutPriceByItem:{},funds:null});
let scenario=blank();
let stayOpen=false;
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({
  '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
}[c]));
const fmt=value=>Number(value).toLocaleString('ko-KR');
const options=value=>
  [['unknown','미확인'],['yes','예 · 직접 확인'],['no','아니요 · 직접 확인']]
    .map(([id,label])=>'<option value="'+id+'"'+(id===value?' selected':'')+'>'+
      esc(label)+'</option>').join('');
const triInput=(kind,id,label,note)=>{
  const value=scenario[kind]?.[id]||'unknown';
  return '<label class="purchase-check-field"><span><b>'+esc(label)+
    '</b><small>'+esc(note)+'</small></span><select data-purchase-state="'+
    esc(kind)+'" data-purchase-id="'+esc(id)+'" aria-label="'+esc(label)+'">'+
    options(value)+'</select></label>';
};
const moneyInput=(field,label,value,note,id='')=>
  '<label class="purchase-check-field"><span><b>'+esc(label)+
  '</b><small>'+esc(note)+'</small></span><input type="number" min="0" step="1" '+
  'inputmode="numeric" placeholder="미입력" aria-label="'+esc(label)+
  '" data-purchase-number="'+esc(field)+'" data-purchase-id="'+esc(id)+
  '" value="'+esc(value==null?'':value)+'"></label>';

export function mountPurchaseReadinessPanel(host,{item,research,index}){
  if(!host)return;
  if(!item?.costBuy){
    host.replaceChildren();
    return;
  }
  const researchIds=[...new Set([...(item.requires||[]),...(item.requiresBuy||[])])];
  const researchFields=researchIds.map(id=>{
    const fields=[
      (item.requires||[]).includes(id)?'일반 연구 requires':null,
      (item.requiresBuy||[]).includes(id)?'구매 전용 requiresBuy':null
    ].filter(Boolean).join(' + ');
    return triInput('research',id,research.topics[id]?.name||id,fields+' · '+id);
  }).join('');
  const baseFields=[...new Set(item.requiresBuyBaseFunc||[])].map(id=>{
    const facilities=(index.facilities?.functions?.[id]||[]).map(type=>
      index.facilities?.facilities?.[type]?.name||type);
    return triInput('baseFunctions',id,'기지 기능 '+id,
      '현재 구매 기지에서 제공 필요'+(facilities.length?' · 시설 후보: '+facilities.join(', '):''));
  }).join('');
  const countryFields=item.requiresBuyCountry?triInput('alliedCountries',
    item.requiresBuyCountry,'국가 협정 '+item.requiresBuyCountry,'현재 국가 협정/우호 상태 확인'):'';
  const month=item.monthlyBuyLimit!=null?moneyInput('purchasedThisMonthByItem',
    '이번 달 이미 구매한 수량',
    scenario.purchasedThisMonthByItem[item.id],
    '원본 월 상한 '+fmt(item.monthlyBuyLimit)+'개 · 현재 달의 구매 기록',item.id):'';
  const listing=triInput('storeVisibleByItem',item.id,'현재 구매 메뉴에서 상품이 보임',
    '실제 게임 화면 관찰만 입력 · 이 입력은 원본 판매 출처 검증이 아님');
  const funds=moneyInput('funds','현재 보유 자금',scenario.funds,
    '기준 기지의 자금 상태 · 기본가와 최종 결제가가 다를 수 있음');
  const checkout=moneyInput('checkoutPriceByItem','게임에서 확인한 실제 구매 단가',
    scenario.checkoutPriceByItem[item.id],
    '미입력 시 기본가 '+fmt(item.costBuy)+'만으로 구매 가능 판정하지 않음',item.id);
  host.innerHTML='<details class="purchase-readiness-panel"'+(stayOpen?' open':'')+'>'+
    '<summary><strong>현재 게임 상태로 구매 조건 점검</strong>'+
    '<span>연구·시설·월 한도·자금 직접 입력 · 자동 세이브 연동 아님</span></summary>'+
    '<div class="purchase-check-body">'+
    '<p>원본의 구매 조건과 <b>직접 확인한 게임 상태</b>를 비교합니다. 아무것도 입력하지 않은 항목은 미확인입니다. 입력값은 이 페이지를 떠나면 사라지며 서버로 전송되지 않습니다.</p>'+
    (researchFields?'<fieldset><legend>필수 연구 완료 상태</legend>'+researchFields+'</fieldset>':'')+
    (baseFields||countryFields?'<fieldset><legend>기지·국가 조건</legend>'+baseFields+countryFields+'</fieldset>':'')+
    '<fieldset><legend>구매 화면·수량·가격</legend>'+listing+month+funds+checkout+'</fieldset>'+
    '<div class="purchase-check-result" role="status" aria-live="polite"></div>'+
    '<button type="button" class="purchase-check-reset">입력한 상태 모두 초기화</button>'+
    '<p class="purchase-check-caveat">입력한 값과 공개 엔진의 구매 필터로 계산한 조건부 판정입니다. 정확한 OXCE 8.6 실행, 상점 목록, 실제 구매 완료는 자동 확인하지 않습니다.</p>'+
    '</div></details>';
  const panel=host.querySelector('.purchase-readiness-panel');
  const result=panel.querySelector('.purchase-check-result');
  const render=()=>{
    const report=evaluatePurchaseReadiness(item,scenario);
    const headline=report.status==='blocked'?'현재 입력에서 막힌 구매 조건':
      report.status==='conditional'?'입력상 조건 충족 · 구매 완료 미검증':'현재 구매 가능 여부 미확인';
    const statuses={pass:'충족(입력)',blocked:'미충족(입력)',unknown:'미확인'};
    result.innerHTML='<h3>'+esc(headline)+'</h3><p>'+esc(report.summary)+'</p>'+
      '<p class="purchase-check-count">충족 '+report.counts.pass+' · 미충족 '+
      report.counts.blocked+' · 미확인 '+report.counts.unknown+'</p>'+
      '<ul>'+report.gates.map(g=>{
        const label=g.kind==='research'?(research.topics[g.id]?.name||g.id):g.label;
        return '<li><b>'+esc(statuses[g.status])+'</b> · '+esc(label)+
          ' <small>'+esc(g.note)+'</small></li>';
      }).join('')+'</ul>';
  };
  panel.addEventListener('toggle',()=>{stayOpen=panel.open});
  panel.addEventListener('change',event=>{
    const target=event.target;
    if(!target.matches('select[data-purchase-state],input[data-purchase-number]'))return;
    const kind=target.dataset.purchaseState;
    const number=target.dataset.purchaseNumber;
    const id=target.dataset.purchaseId;
    if(kind)scenario[kind][id]=target.value;
    else if(number==='funds')scenario.funds=target.value===''?null:Number(target.value);
    else scenario[number][id]=target.value===''?null:Number(target.value);
    render();
  });
  panel.querySelector('.purchase-check-reset').addEventListener('click',()=>{
    scenario=blank();stayOpen=true;
    mountPurchaseReadinessPanel(host,{item,research,index});
  });
  render();
}
