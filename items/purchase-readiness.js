// Conservative purchase-readiness evaluation for X-Piratez v.o1.1.1 / OXCE 8.6.
//
// A price and the observed OXCE itemFilter are evidence of a rules-based
// PURCHASE CANDIDATE, not proof that a particular save has a sale listing.
// Snapshot values are supplied explicitly by the player; missing data is
// UNKNOWN rather than false. Nothing is transmitted or persisted by this module.
const tri=(record,id)=>{
  const value=record&&Object.prototype.hasOwnProperty.call(record,id)?record[id]:null;
  return value==='yes'||value==='no'?value:'unknown';
};
const quantity=value=>{
  if(value==null||value==='')return null;
  const number=Number(value);
  return Number.isSafeInteger(number)&&number>=0?number:null;
};
const money=value=>{
  if(value==null||value==='')return null;
  const number=Number(value);
  return Number.isFinite(number)&&number>=0?number:null;
};
const fmt=value=>Number(value).toLocaleString('ko-KR');
const researchIds=item=>[...new Set([...(item.requires||[]),...(item.requiresBuy||[])])];

export function evaluatePurchaseReadiness(item,snapshot={}){
  if(!item||!(Number(item.costBuy)>0)){
    return {status:'not-indexed',gates:[],counts:{pass:0,blocked:0,unknown:0},
      summary:'원본에 양수 구매가가 없으므로 이 구매 방식은 평가 대상이 아닙니다.'};
  }
  const gates=[],add=(kind,id,label,status,note='')=>{
    gates.push({kind,id,label,status,note});
  };
  // Existing callers default to one item. Explicit invalid/zero requests
  // are UNKNOWN, never silently treated as buying a single unit.
  const requested=snapshot.requestedQuantity===undefined?1:quantity(snapshot.requestedQuantity);
  const validRequested=requested!=null&&requested>=1;
  add('quantity',item.id,'이번에 구매할 수량',validRequested?'pass':'unknown',
    validRequested?'요청한 구매 수량 '+fmt(requested)+'개':'양의 정수 구매 수량이 필요함');
  for(const id of researchIds(item)){
    const fields=[
      ...(item.requires||[]).includes(id)?['requires']:[],
      ...(item.requiresBuy||[]).includes(id)?['requiresBuy']:[]
    ];
    const value=tri(snapshot.research,id);
    add('research',id,'필수 연구 '+id,value==='yes'?'pass':value==='no'?'blocked':'unknown',
      '원본 '+fields.join(' + ')+' · 명시적으로 완료 여부를 입력해야 판정 가능');
  }
  for(const id of [...new Set(item.requiresBuyBaseFunc||[])]){
    const value=tri(snapshot.baseFunctions,id);
    add('base-function',id,'구매용 기지 기능 '+id,
      value==='yes'?'pass':value==='no'?'blocked':'unknown',
      '선택한 현재 기지에 이 기능이 실제로 제공되는지 확인');
  }
  if(item.requiresBuyCountry){
    // PurchaseState::requiredCountryAllied returns FALSE when a matching
    // country has getPact()==true. A Pact is a *blocker*, not an ally gate.
    const id=item.requiresBuyCountry,pact=tri(snapshot.countryPacts,id);
    add('country-pact',id,'국가 '+id+'의 Pact 차단 조건',
      pact==='yes'?'blocked':pact==='no'?'pass':'unknown',
      '해당 국가가 Pact 상태이면 구매 메뉴에서 제외 · 게임의 Pact 여부 직접 확인 필요');
  }
  const listing=tri(snapshot.storeVisibleByItem,item.id);
  add('listing',item.id,'구매 메뉴에 상품 표시',
    listing==='yes'?'pass':listing==='no'?'blocked':'unknown',
    '사용자가 직접 확인한 구매 메뉴 관찰 · 원본 엔진/상점의 독립 검증과 다름');
  if(item.monthlyBuyLimit!=null&&item.monthlyBuyLimit>0){
    const used=quantity(snapshot.purchasedThisMonthByItem?.[item.id]);
    const remaining=used==null?null:Math.max(0,item.monthlyBuyLimit-used);
    add('monthly',item.id,'월 구매 한도 '+fmt(item.monthlyBuyLimit)+'개',
      remaining==null||!validRequested?'unknown':remaining<requested?'blocked':'pass',
      remaining==null?'이번 달 구매한 수량 미입력':
        '이번 달 '+fmt(used)+'개 구매 · 남은 '+fmt(remaining)+'개 · 이번 요청 '+
        (validRequested?fmt(requested)+'개':'수량 미확인'));
  }
  // PurchaseState also applies per-base stores and, for liveAlien items,
  // prisonType containment capacity limits when selecting quantities.
  const size=Number(item.storageSize);
  if(item.storageSize!=null&&Number.isFinite(size)&&size>0){
    const free=money(snapshot.freeStoreSpace);
    const needed=validRequested?size*requested:null;
    let result='unknown';
    if(free!=null&&needed!=null&&Number.isFinite(needed)){
      // The referenced engine's bulk-purchase check uses a +0.05 space
      // tolerance; leave borderline cases UNKNOWN instead of a false block.
      if(free>=needed)result='pass';
      else if(free+0.05<needed)result='blocked';
    }
    add('storage',item.id,'선택 기지 창고 공간',result,
      '1개당 점유 '+fmt(size)+' · 요청 필요 '+(needed==null?'미확인':fmt(needed))+
      ' · 입력한 여유 '+(free==null?'미확인':fmt(free))+
      ' · 다른 구매 예약분/도착 예정분 차감 여부도 확인');
  }
  if(item.liveAlien){
    const prison=item.prisonType??0,free=quantity(snapshot.freeContainmentByType?.[prison]);
    add('containment',String(prison),'생체 포로 수용 공간 '+prison,
      free==null||!validRequested?'unknown':free<requested?'blocked':'pass',
      '해당 수용 유형의 기지 잔여 수용량 '+(free==null?'미입력':fmt(free))+
      ' · 구매 요청 '+(validRequested?fmt(requested):'미확인')+'명');
  }
  const funds=money(snapshot.funds);
  const observed=money(snapshot.checkoutPriceByItem?.[item.id]);
  // The engine can adjust the displayed price per base/save. Comparing only
  // costBuy to funds cannot prove affordability, in either direction.
  const total=validRequested&&observed!=null?observed*requested:null;
  const affordable=funds==null||total==null||!Number.isSafeInteger(total)?'unknown':
    funds>=total?'pass':'blocked';
  add('funds',item.id,'현재 자금과 요청 수량의 총 결제액',
    affordable,
    '원본 기본가 '+fmt(item.costBuy)+
    (funds==null?' · 현재 자금 미입력':' · 입력한 현재 자금 '+fmt(funds))+
    (observed==null?' · 실제 구매 메뉴 표시가 미입력(기본가로 결제 판정 금지)':
      ' · 직접 확인한 1개 표시가 '+fmt(observed)+
      (total!=null&&Number.isSafeInteger(total)?' · '+fmt(requested)+'개 합계 '+fmt(total):
        ' · 요청 수량 또는 총액 확인 필요')));
  const counts={pass:gates.filter(x=>x.status==='pass').length,
    blocked:gates.filter(x=>x.status==='blocked').length,
    unknown:gates.filter(x=>x.status==='unknown').length};
  const status=counts.blocked?'blocked':counts.unknown?'unverified':'conditional';
  const summaries={
    blocked:'입력한 현재 상태에서는 구매 조건 중 충족되지 않은 항목이 있습니다.',
    unverified:'확인되지 않은 조건이 있어 현재 구매 가능 여부를 판정할 수 없습니다.',
    conditional:'입력한 구매 조건은 모두 충족했습니다. 실제 구매 완료·재고는 여전히 검증되지 않았습니다.'
  };
  return {status,gates,counts,summary:summaries[status],
    requestedQuantity:validRequested?requested:null,totalPrice:total!=null&&Number.isSafeInteger(total)?total:null,
    basePrice:item.costBuy,priceIsAdjusted:observed!=null,
    exactEngineBuildVerified:false,sourceVerifiedStoreListing:false,
    sourceVersion:'v.o1.1.1',requiredEngine:'8.6'};
}
