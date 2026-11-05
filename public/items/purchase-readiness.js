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
    const id=item.requiresBuyCountry,value=tri(snapshot.alliedCountries,id);
    add('country',id,'구매 국가 조건 '+id,
      value==='yes'?'pass':value==='no'?'blocked':'unknown',
      '기준 국가와 협정 상태를 실제 게임에서 확인');
  }
  const listing=tri(snapshot.storeVisibleByItem,item.id);
  add('listing',item.id,'구매 메뉴에 상품 표시',
    listing==='yes'?'pass':listing==='no'?'blocked':'unknown',
    '사용자가 직접 확인한 구매 메뉴 관찰 · 원본 엔진/상점의 독립 검증과 다름');
  if(item.monthlyBuyLimit!=null&&item.monthlyBuyLimit>0){
    const used=quantity(snapshot.purchasedThisMonthByItem?.[item.id]);
    add('monthly',item.id,'월 구매 한도 '+fmt(item.monthlyBuyLimit)+'개',
      used==null?'unknown':used>=item.monthlyBuyLimit?'blocked':'pass',
      used==null?'이번 달 구매한 수량 미입력':
        '이번 달 '+fmt(used)+'개 구매 · 남은 구매 가능 수량 '+fmt(Math.max(0,item.monthlyBuyLimit-used))+'개');
  }
  const funds=money(snapshot.funds);
  const observed=money(snapshot.checkoutPriceByItem?.[item.id]);
  // The engine can adjust the displayed price per base/save. Comparing only
  // costBuy to funds cannot prove affordability, in either direction.
  const affordable=funds==null||observed==null?'unknown':
    funds>=observed?'pass':'blocked';
  add('funds',item.id,'현재 자금과 실제 표시가',
    affordable,
    '원본 기본가 '+fmt(item.costBuy)+
    (funds==null?' · 현재 자금 미입력':' · 입력한 현재 자금 '+fmt(funds))+
    (observed==null?' · 실제 구매 메뉴 표시가 미입력(기본가로 결제 판정 금지)':
      ' · 사용자가 확인한 표시가 '+fmt(observed)));
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
    basePrice:item.costBuy,priceIsAdjusted:observed!=null,
    exactEngineBuildVerified:false,sourceVerifiedStoreListing:false,
    sourceVersion:'v.o1.1.1',requiredEngine:'8.6'};
}
