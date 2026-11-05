import {evaluatePurchaseReadiness} from './purchase-readiness.js';

// This panel is a local scenario, never a claim of verified current-save data.
// No input is transmitted or stored in localStorage.
const blank=()=>({research:{},baseFunctions:{},countryPacts:{},
  storeVisibleByItem:{},purchasedThisMonthByItem:{},freeContainmentByType:{},
  checkoutPriceByItem:{},funds:null,requestedQuantity:1,freeStoreSpace:null});
let scenario=blank();
let activeItem=null;
let stayOpen=false;
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({
  '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
}[c]));
const fmt=value=>Number(value).toLocaleString('ko-KR');
const options=value=>[
  ['unknown','아직 확인 안 함'],['yes','예 · 직접 확인'],['no','아니요 · 직접 확인']
].map(([id,label])=>'<option value="'+id+'"'+(id===value?' selected':'')+'>'+
  esc(label)+'</option>').join('');
const triInput=(kind,id,label,note)=>{
  const value=scenario[kind]?.[id]||'unknown';
  return '<label class="purchase-check-field"><span><b>'+esc(label)+
    '</b><small>'+esc(note)+'</small></span><select data-purchase-state="'+
    esc(kind)+'" data-purchase-id="'+esc(id)+'" aria-label="'+esc(label)+'">'+
    options(value)+'</select></label>';
};
const numberInput=(field,label,value,note,id='',minimum='0',step='1')=>
  '<label class="purchase-check-field"><span><b>'+esc(label)+
  '</b><small>'+esc(note)+'</small></span><input type="number" min="'+esc(minimum)+
  '" step="'+esc(step)+'" inputmode="numeric" placeholder="모르면 비워두세요" aria-label="'+
  esc(label)+'" data-purchase-number="'+esc(field)+'" data-purchase-id="'+esc(id)+
  '" value="'+esc(value==null?'':value)+'"></label>';
const statusNames={pass:'충족(입력)',blocked:'미충족(입력)',unknown:'미확인'};
const issueTitles={
  research:'연구 완료 여부를 확인하세요',
  'base-function':'구매 기지의 시설 기능을 확인하세요',
  'country-pact':'해당 국가의 Pact 상태를 확인하세요',
  listing:'구매 메뉴에 상품이 표시되는지 확인하세요',
  monthly:'이번 달 남은 구매 가능 수량을 확인하세요',
  storage:'선택한 기지의 남은 창고 공간을 확인하세요',
  containment:'포로 수용 공간을 확인하세요',
  funds:'실제 상점 단가와 현재 자금을 확인하세요',
  quantity:'이번에 구매할 수량을 입력하세요'
};
const step=(number,title,hint,children)=>
  '<fieldset class="purchase-check-step"><legend><span class="purchase-step-number">'+
  number+'</span> '+esc(title)+'</legend><p class="purchase-step-hint">'+esc(hint)+'</p>'+
  (children||'<p class="purchase-check-none">이 항목에 명시된 추가 조건이 없습니다.</p>')+
  '</fieldset>';

export function mountPurchaseReadinessPanel(host,{item,research,index}){
  if(!host)return;
  if(!item?.costBuy){host.replaceChildren();return;}
  // A different item may be opened via the same-page hash route; don't
  // obscure its main horizontal graph just because another panel was open.
  if(activeItem!==item.id){activeItem=item.id;stayOpen=false;}
  const researchIds=[...new Set([...(item.requires||[]),...(item.requiresBuy||[])])];
  const researchFields=researchIds.map(id=>{
    const fields=[
      (item.requires||[]).includes(id)?'일반 해금 연구':null,
      (item.requiresBuy||[]).includes(id)?'구매 전용 연구':null
    ].filter(Boolean).join(' + ');
    return triInput('research',id,research.topics[id]?.name||id,
      fields+' · 원본 연구 ID는 그래프에서 확인');
  }).join('');
  const baseFields=[...new Set(item.requiresBuyBaseFunc||[])].map(id=>{
    const facilities=(index.facilities?.functions?.[id]||[]).map(type=>
      index.facilities?.facilities?.[type]?.name||type);
    return triInput('baseFunctions',id,
      facilities.length?'기지 기능 · '+facilities.join(' / '):'기지 기능 · '+id,
      '현재 구매할 기지에 기능이 있어야 함 · '+id);
  }).join('');
  const countryFields=item.requiresBuyCountry?triInput('countryPacts',
    item.requiresBuyCountry,'국가 Pact 상태 · '+item.requiresBuyCountry,
    'Pact 있음 → 구매 차단 · Pact 없음 → 조건 통과'):'';
  const request=numberInput('requestedQuantity','이번에 구매할 수량',
    scenario.requestedQuantity,'구매 수량에 따라 월 한도·창고·총액이 달라집니다.','','1');
  const listing=triInput('storeVisibleByItem',item.id,
    '게임 구매 메뉴에 이 상품이 보이나요?',
    '직접 확인한 게임 화면만 입력하세요. 자동으로 상점 재고를 조회하지 않습니다.');
  const month=item.monthlyBuyLimit!=null?numberInput('purchasedThisMonthByItem',
    '이번 달 이미 구매한 수량',scenario.purchasedThisMonthByItem[item.id],
    '월 최대 '+fmt(item.monthlyBuyLimit)+'개 · 현재 구매 이력을 직접 확인',item.id):'';
  const funds=numberInput('funds','현재 보유 자금',scenario.funds,
    '모르면 비워두세요. 구매 기본가만으로 자금 부족을 확정하지 않습니다.');
  const checkout=numberInput('checkoutPriceByItem','게임 구매 메뉴의 1개 표시가',
    scenario.checkoutPriceByItem[item.id],
    '원본 기본가 '+fmt(item.costBuy)+' · 실제 결제가와 다를 수 있습니다.',item.id);
  const storage=Number(item.storageSize)>0?numberInput('freeStoreSpace',
    '구매 기지의 남은 창고 공간',scenario.freeStoreSpace,
    '아이템 1개당 점유 '+fmt(item.storageSize)+' · 운송 중 물품도 별도 고려',
    '','0','any'):'';
  const containment=item.liveAlien?numberInput('freeContainmentByType',
    '남은 포로 수용 공간 ('+fmt(item.prisonType||0)+'형)',
    scenario.freeContainmentByType[item.prisonType||0],
    '생체 포로는 해당 유형의 수용 공간도 필요합니다.',String(item.prisonType||0)):'';
  host.innerHTML='<details class="purchase-readiness-panel"'+(stayOpen?' open':'')+'>'+
    '<summary><span class="purchase-check-summary-title"><strong>지금 구매할 수 있나요?</strong>'+
    '<small>① 해금 조건 → ② 상점·수량 → ③ 자금·공간 · 직접 입력</small></span>'+
    '<span class="purchase-check-summary-state" aria-live="polite">확인 전</span></summary>'+
    '<div class="purchase-check-body">'+
    '<p class="purchase-check-intro">현재 세이브를 자동으로 읽지는 않습니다. <strong>게임에서 확인한 것만</strong> 입력하면 충족·차단·미확인 조건을 구분합니다. 입력값은 서버로 보내거나 저장하지 않습니다.</p>'+
    '<div class="purchase-check-result" role="status" aria-live="polite"></div>'+
    '<div class="purchase-check-form">'+
    step('1','연구와 기지 조건','왼쪽 테크뷰어에서 해금 경로를 더 추적할 수 있습니다.',
      researchFields+baseFields+countryFields)+
    step('2','상점과 구매 수량','실제 구매 메뉴를 확인해야 구매 가능성을 좁힐 수 있습니다.',
      listing+request+month)+
    step('3','비용과 보관 공간','가격과 공간은 실제 구매할 기지를 기준으로 입력하세요.',
      checkout+funds+storage+containment)+
    '</div>'+
    '<div class="purchase-check-footer"><button type="button" class="purchase-check-reset">'+
      '입력 초기화</button><span>다른 구매 예약·운송 중 물품, 엔진 예외는 별도 확인 필요</span></div>'+
    '</div></details>';
  const panel=host.querySelector('.purchase-readiness-panel');
  const result=panel.querySelector('.purchase-check-result');
  const summaryState=panel.querySelector('.purchase-check-summary-state');
  let fullProof=false;
  const render=()=>{
    const report=evaluatePurchaseReadiness(item,scenario);
    const headline=report.status==='blocked'?'현재 입력에서 막힌 구매 조건':
      report.status==='conditional'?'입력상 조건 충족 · 구매 완료 미검증':'현재 구매 가능 여부 미확인';
    const issues=report.gates.filter(g=>g.status==='blocked').concat(
      report.gates.filter(g=>g.status==='unknown'));
    const visible=issues.slice(0,3);
    const label=report.status==='blocked'?'차단 '+report.counts.blocked+'개':
      report.status==='conditional'?'입력 조건 충족':'확인 필요 '+report.counts.unknown+'개';
    panel.dataset.purchaseStatus=report.status;
    summaryState.textContent=label;
    const spotlight=visible.length?'<ol class="purchase-check-priorities">'+
      visible.map(g=>'<li class="purchase-priority purchase-priority--'+esc(g.status)+'">'+
      '<span class="purchase-priority-status">'+esc(statusNames[g.status])+'</span>'+
      '<div><strong>'+esc(g.kind==='research'?(research.topics[g.id]?.name||g.id):
        issueTitles[g.kind]||g.label)+'</strong>'+
      '<small>'+esc(g.note)+'</small></div></li>').join('')+
      '</ol>':
      '<p class="purchase-check-clear">입력한 필수 조건을 모두 충족했습니다. 실제 주문·입고를 완료했다는 뜻은 아닙니다.</p>';
    const remaining=issues.length-visible.length;
    const source='<div class="purchase-check-proof"'+(fullProof?'':' hidden')+'>'+
      '<ul>'+report.gates.map(g=>
      '<li><strong>'+esc(statusNames[g.status])+'</strong> · '+
      esc(g.kind==='research'?(research.topics[g.id]?.name||g.id):g.label)+
      '<small>'+esc(g.note)+'</small></li>').join('')+'</ul>'+
      '<p>이 목록은 입력 시나리오의 판정 근거입니다. 원본 ID와 게임 규칙은 아래 좌우 테크뷰어의 원본 상세에서 확인할 수 있습니다.</p></div>';
    result.innerHTML='<div class="purchase-check-result-head"><h3>'+esc(headline)+'</h3>'+
      '<span class="purchase-check-count">충족 '+report.counts.pass+' · 미충족 '+
        report.counts.blocked+' · 미확인 '+report.counts.unknown+'</span></div>'+
      '<p>'+esc(report.summary)+'</p>'+
      '<h4>'+(visible.length?'먼저 확인할 조건':'다음 판단')+'</h4>'+spotlight+
      (remaining?'<p class="purchase-check-remaining">추가 확인 항목 '+remaining+'개는 아래 전체 근거에 있습니다.</p>':'')+
      '<button type="button" class="purchase-proof-toggle" aria-expanded="'+fullProof+
      '">'+(fullProof?'전체 근거 접기':'모든 조건·근거 '+report.gates.length+'개 보기')+'</button>'+source;
  };
  panel.addEventListener('toggle',()=>{stayOpen=panel.open});
  result.addEventListener('click',event=>{
    if(!event.target.closest('.purchase-proof-toggle'))return;
    fullProof=!fullProof;render();
  });
  panel.addEventListener('change',event=>{
    const target=event.target;
    if(!target.matches('select[data-purchase-state],input[data-purchase-number]'))return;
    const kind=target.dataset.purchaseState;
    const number=target.dataset.purchaseNumber;
    const id=target.dataset.purchaseId;
    if(kind)scenario[kind][id]=target.value;
    else if(number==='funds'||number==='requestedQuantity'||number==='freeStoreSpace')
      scenario[number]=target.value===''?null:Number(target.value);
    else scenario[number][id]=target.value===''?null:Number(target.value);
    render();
  });
  panel.querySelector('.purchase-check-reset').addEventListener('click',()=>{
    scenario=blank();stayOpen=true;
    mountPurchaseReadinessPanel(host,{item,research,index});
  });
  render();
}
