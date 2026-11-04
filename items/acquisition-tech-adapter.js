// Legacy item acquisition paths use only v.o1.1.1 item/usage/recipe sources.
// Research prerequisites are delegated to the already-versioned research
// adapter, so no v.o2 preconditions are ever inserted by visualization.
import {createLegacyResearchTechAdapter} from '../research/acquisition-tech-adapter.js';
import {createLegacyFacilityTechAdapter} from '../facilities/legacy-acquisition-tech.js';

const list=x=>Array.isArray(x)?x:[];
const fmt=n=>Number(n).toLocaleString('ko-KR');
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({
  '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
}[c]));
const make=(kind,id,props={})=>({kind,id,children:[],...props});
const amount=(share)=>typeof share==='number'&&Number.isFinite(share)?
  (share*100).toFixed(3).replace(/0+$/,'').replace(/\.$/,'')+'%':'미확인';
const modeLabel={fixed:'고정 산출',random:'랜덤 제조 후보',
  'random-list':'랜덤 단일 후보','random-bundle':'랜덤 묶음 후보'};

// A research goal can use the exact same cross-domain graph as an item goal.
// This lets a laboratory specimen recurse into its genuine item supply routes
// without switching pages or joining modern 2.1 rules into legacy 1.1.1.
export function createLegacyResearchAndItemTechAdapter(items,research,goalId){
  if(!research?.topics?.[goalId])throw Error('연구 원본에 없는 목표 ID: '+goalId);
  const fallback=Object.keys(items?.items||{})[0];
  if(!fallback)throw Error('연결할 아이템 획득 인덱스가 없습니다');
  const adapter=createLegacyItemTechAdapter(items,research,fallback);
  return {...adapter,root:{kind:'research',id:goalId,children:[]},
    notice:'X-Piratez '+research.meta.sourceVersion+
      ' 연구 ↔ 실물 아이템 ↔ 제조 ↔ 시설 통합 선행 경로입니다. 2.1 병종 DB와 원본 규칙을 혼합하지 않습니다. 실제 상점 재고·이벤트·임무 발생과 현재 세이브 조건은 별도 검증합니다.'};
}

export function createLegacyItemTechAdapter(index,research,goalId){
  if(index?.meta?.schemaVersion!==1||!index?.items?.[goalId])
    throw Error('아이템 획득 인덱스의 버전 또는 ID가 잘못되었습니다: '+goalId);
  if(research?.meta?.schemaVersion!==1||
      research.meta.sourceVersion!==index.meta.sourceVersion||
      research.meta.sourceMetadataSha256!==index.meta.sourceMetadataSha256)
    throw Error('아이템·연구 원본 버전 또는 메타데이터 해시가 일치하지 않습니다');
  const items=index.items,recipes=index.recipes,cache=new Map();
  const facilityAdapter=createLegacyFacilityTechAdapter(index.facilities,index.meta);
  const name=id=>items[id]?.name||research.topics[id]?.name||index.events?.[id]?.name||id;
  const researchAdapter=id=>{
    if(!cache.has(id))cache.set(id,createLegacyResearchTechAdapter(research,id));
    return cache.get(id);
  };
  const ingredient=(id,qty)=>make('item',id,{qty,note:'제조 투입 재료 · 1회 ×'+fmt(qty)+'개 실물 필요'});
  const researchNode=id=>make('research',id,{topicId:id});
  const gate=(kind,id,note)=>make(kind,id,{note});
  const makerNode=(item,edge,i)=>make('and','MAKE:'+item+':'+i,{sourceKind:'make',
    owner:item,recipe:edge.id,quantity:edge.qty,output:edge});
  const eventNode=(item,edge,i)=>make('and','EVENT:'+item+':'+i,{sourceKind:'event',
    owner:item,event:edge.id,quantity:edge.qty,reward:edge});
  function expand(n){
    if(facilityAdapter.owns(n))return facilityAdapter.expand(n);
    if(n.kind==='research')return researchAdapter(n.id).expand(n);
    if(n.kind==='item'){
      const item=items[n.id];
      if(!item)return {node:n,relation:'chain',children:[
        gate('warning','UNINDEXED:'+n.id,'아이템 획득 데이터가 없으며 완료로 인정할 수 없습니다')]};
      const methods=[];
      if(item.costBuy!=null)methods.push(make('and','BUY:'+n.id,{
        sourceKind:'buy',owner:n.id}));
      if(item.producers.length>6)methods.push(make('or','PRODUCERS:'+n.id,{
        sourceKind:'make-options',owner:n.id}));
      else for(const [i,edge] of list(item.producers).entries())methods.push(makerNode(n.id,edge,i));
      if(item.grants.length>3)methods.push(make('or','EVENTS:'+n.id,{
        sourceKind:'event-options',owner:n.id}));
      else for(const [i,edge] of list(item.grants).entries())methods.push(eventNode(n.id,edge,i));
      if(!methods.length)methods.push(make('warning','NO_SOURCE:'+n.id,{
        sourceKind:'unknown',owner:n.id,note:'이 인덱스에서 입증된 상점/제조/이벤트 경로 없음 · 전장 노획/미션/상점 조건은 미색인'}));
      return {node:n,relation:methods.length>1?'or':'chain',children:methods};
    }
    if(n.sourceKind==='make-options')return {node:n,relation:'or',
      children:list(items[n.owner]?.producers).map((edge,i)=>makerNode(n.owner,edge,i))};
    if(n.sourceKind==='event-options')return {node:n,relation:'or',
      children:list(items[n.owner]?.grants).map((edge,i)=>eventNode(n.owner,edge,i))};
    if(n.sourceKind==='buy'){
      const item=items[n.owner];
      const children=[...list(item.requiresBuy).map(researchNode),
        ...list(item.requiresBuyBaseFunc).map(id=>make('facility-function',id))];
      if(item.requiresBuyCountry)children.push(gate('condition','BUY_COUNTRY:'+n.owner,
        '구매 국가 조건 '+item.requiresBuyCountry+' · 실제 국가/진영 공급 여부 미검증'));
      if(item.transferTime!=null)children.push(gate('condition','DELIVERY:'+n.owner,
        '구매 후 수송 시간 원본 '+fmt(item.transferTime)+' · 물품 확보 시점과 별도'));
      if(item.monthlyBuyLimit!=null)children.push(gate('condition','BUY_MONTHLY:'+n.owner,
        '원본 월별 구매 상한 '+fmt(item.monthlyBuyLimit)+'개 · 이번 달 잔여 구매량은 현재 세이브에서 확인 필요'));
      children.push(gate('funds','PRICE:'+n.owner,
        '원본 구매가 '+fmt(item.costBuy)+' · 실제 자금 및 판매/보유 재고 미검증'));
      children.push(gate('warning','STOCK:'+n.owner,
        '판정: 가격만 존재 · 독립적인 상점 상품/재고/상점 해금 근거 미확인. 구매 확정 금지'));
      return {node:n,relation:'and',children};
    }
    if(n.sourceKind==='make'){
      const recipe=recipes[n.recipe];
      if(!recipe)return {node:n,relation:'chain',children:[
        gate('warning','MISSING_RECIPE:'+n.recipe,'원본 제조 조건이 확인되지 않음')]};
      const children=[
        ...list(recipe.directRequires).map(researchNode),
        ...list(recipe.requiresBaseFunc).map(x=>gate('facility-function',x,
          '제조식에서 요구하는 기지 기능 · 제공 시설 건설 경로는 별도 확인')),
        ...list(recipe.requiredItems).map(x=>ingredient(x.id,x.qty)),
        gate('funds','MANUFACTURE_COST:'+n.recipe,
          '제조 1회 비용 '+fmt(recipe.cost||0)+' · 작업량 '+fmt(recipe.time||0)+
          ' · 가동 인력 및 전체 실현성 별도 확인')
      ];
      if(n.output.kind==='random')
        children.push(gate('random','RANDOM_MAKE:'+n.recipe+':'+n.output.option,
          '제조 랜덤표 내부 선택 비중 '+amount(n.output.relativeShare)+
          ' · 제조 실행/재료 획득 확률이 아니며 지급 확정 아님'));
      return {node:n,relation:'and',children};
    }
    if(n.sourceKind==='event'){
      const e=n.reward,source=index.events?.[n.event];
      const children=[
        source?.scripts?.length?make('or','EVENT_TRIGGER:'+n.event,{
          sourceKind:'event-triggers',event:n.event}):
          gate('warning','EVENT_TRIGGER:'+n.event,
            '이 이벤트의 발생 스크립트를 확인하지 못함 · 발생 가능성 미검증'),
        gate('condition','EVENT_REWARD:'+n.event+':'+e.option,
          '이벤트 발생 조건에서 '+fmt(e.qty)+'개 지급 후보 · '+(modeLabel[e.kind]||e.kind))
      ];
      if(e.kind!=='fixed')children.push(gate('random','RANDOM_EVENT:'+n.event+':'+e.option,
        '이벤트 보상 목록 내부 비중 '+amount(e.relativeShare)+
        ' · 전체 캠페인 이벤트 발생/획득 확률이 아님'));
      return {node:n,relation:'and',children};
    }
    if(n.sourceKind==='event-triggers'){
      const scripts=list(index.events[n.event]?.scripts);
      return {node:n,relation:scripts.length>1?'or':'chain',children:scripts.map((s,i)=>
        make('and','EVENT_SCRIPT:'+n.event+':'+i,{sourceKind:'event-script',
          event:n.event,scriptIndex:i}))};
    }
    if(n.sourceKind==='event-script'){
      const s=index.events[n.event]?.scripts?.[n.scriptIndex];
      if(!s)return {node:n,relation:'chain',children:[gate('warning','SCRIPT_UNKNOWN:'+n.id,'발생 스크립트 확인 불가')]};
      const children=[];
      const conditionLabels={firstMonth:'발생 시작 월 (하한)',lastMonth:'발생 종료 월 (상한)',
        executionOdds:'스크립트 실행 판정',minScore:'필요 최소 평가점수',
        maxScore:'허용 최대 평가점수',minFunds:'필요 최소 자금',
        maxFunds:'허용 최대 자금',minDifficulty:'최소 난이도',
        maxDifficulty:'최대 난이도',minLoyalty:'최소 충성',maxLoyalty:'최대 충성',
        minReputation:'최소 평판',maxReputation:'최대 평판',
        minTacticalScore:'최소 전투 점수',maxTacticalScore:'최대 전투 점수'};
      for(const [key,value] of Object.entries(s.conditions||{}))
        children.push(gate(key==='executionOdds'?'random':'condition',
          'EV_COND:'+n.id+':'+key,
          (conditionLabels[key]||'기타 원본 조건 '+key)+' · '+fmt(value)+
          (key==='executionOdds'?'% · 이벤트 전체 발생률이나 보상 당첨률이 아님':
            key==='firstMonth'?'개월 차 이후 가능 · 마지막 월과는 별도':
            key==='lastMonth'?'개월 차까지 가능 · 이후에는 이 스크립트 차단':
              ' · 현재 세이브 조건 충족 여부 미검증')));
      const triggerLabels={researchTriggers:'연구 완료',facilityTriggers:'시설 보유',
        itemTriggers:'실물 아이템 보유',xcomBaseInRegionTriggers:'지역 내 기지',
        xcomBaseInCountryTriggers:'국가 내 기지'};
      for(const [key,entries] of Object.entries(s.triggerMaps||{})){
        for(const [i,t] of list(entries).entries()){
          if(key==='researchTriggers'&&t.value===true&&research.topics[t.id])
            children.push(researchNode(t.id));
          else if(key==='itemTriggers'&&t.value===true&&items[t.id])
            children.push(make('item',t.id,{note:'이벤트 발생을 위한 실물 아이템 · 해당 아이템 공급 경로를 역추적'}));
          else if(key==='facilityTriggers'&&t.value===true&&
            index.facilities?.facilities?.[t.id])
            children.push(make('facility-type',t.id,{note:'이벤트 발생 시 기지에 필요한 시설 · 건설·실제 보유 여부 별도 확인'}));
          else children.push(gate(t.value===false?'blocked':'condition',
            'EV_GATE:'+n.id+':'+key+':'+i,
            (triggerLabels[key]||key)+' · '+(t.koName||t.id)+
            ' · '+(t.value===false?'없어야 함 (존재·완료 시 차단)':'필요함')+
            ' · 현재 세이브 충족 여부 미검증 · 원본 '+t.id));
        }
      }
      for(const [i,weight] of list(s.eventWeights).entries()){
        const entry=list(weight.entries).find(x=>x.eventId===n.event);
        if(entry)children.push(gate('random','EV_WEIGHT:'+n.id+':'+i,
          '이벤트 후보 가중치 '+fmt(entry.weight)+'/'+fmt(weight.totalWeight)+
          ' · 해당 선택표 내부 상대 비중 '+amount(entry.relativeShare)+
          ' · 경쟁 후보 '+list(weight.entries).length+'종 · 실행 odds 및 전체 발생률과 별개'));
      }
      const once=s.oneTimeRandomEvents;
      const onceEntry=list(once?.entries).find(x=>x.eventId===n.event);
      if(onceEntry)children.push(gate('random','EV_ONCE:'+n.id,
        '1회성 이벤트 후보 '+fmt(onceEntry.weight)+'/'+fmt(once.totalWeight)+
        ' · 선택표 내부 상대 비중 '+amount(onceEntry.relativeShare)+
        ' · 경쟁 후보 '+Math.max(0,list(once.entries).length-1)+'종 · 실제 발생/재실행 여부 미검증'));
      else if(list(once?.entries).length)children.push(gate('warning','EV_ONCE_UNKNOWN:'+n.id,
        '1회성 이벤트 선택표가 있지만 이 목표의 후보를 확인하지 못함'));
      const sequence=list(s.oneTimeSequentialEvents);
      const position=sequence.indexOf(n.event);
      if(position>=0)children.push(gate('condition','EV_SEQUENCE:'+n.id,
        '1회성 순차 이벤트 '+fmt(position+1)+'/'+fmt(sequence.length)+'번째 · 앞선 '+fmt(position)+
        '개 이벤트의 발생 이력 필요 여부 별도 확인'));
      if(!children.length)children.push(gate('warning','EV_UNRESOLVED:'+n.id,'스크립트에 명시된 제한 조건 없음 · 실제 발생 확정 아님'));
      return {node:n,relation:'and',children};
    }
    if(n.topicId&&research.topics[n.topicId]&&
      ['and','or'].includes(n.kind)&&
      /^(LAB|FREE|ACCESS|DEPENDENCIES|UNLOCK):/.test(n.id))
      return researchAdapter(n.topicId).expand(n);
    return {node:n,relation:'chain',children:[]};
  }
  function describe(n){
    if(facilityAdapter.owns(n))return facilityAdapter.describe(n);
    if(n.kind==='research')return researchAdapter(n.id).describe(n);
    if(n.kind==='item')return {label:name(n.id)+(n.qty?' ×'+fmt(n.qty):''),
      category:'item',badge:n.qty?'투입 재료':'획득 목표',
      detail:n.note||'상점·제조·이벤트의 조건부 실물 획득 경로를 왼쪽으로 추적'};
    if(n.sourceKind==='make-options')return {label:'제조·개봉 획득 경로 '+fmt(items[n.owner].producers.length)+'건',
      category:'or',badge:'제조 방법 선택',detail:'원본 제조식별 재료·시설·연구·확률을 왼쪽으로 펼쳐 비교'};
    if(n.sourceKind==='event-options')return {label:'이벤트 보상 경로 '+fmt(items[n.owner].grants.length)+'건',
      category:'or',badge:'이벤트 선택',detail:'이벤트 발생 시 지급 경로 · 미발생/랜덤 보상은 별도 조건'};
    if(n.sourceKind==='buy')return {label:'상점 구매 후보 · '+name(n.owner),
      category:'funds',badge:'가격만 확인',
      detail:'원본 구매가 '+fmt(items[n.owner].costBuy)+' · 구매 연구 '+
        list(items[n.owner].requiresBuy).length+'개 · 구매용 기지 기능 '+
        list(items[n.owner].requiresBuyBaseFunc).length+'개'+
        (items[n.owner].monthlyBuyLimit!=null?' · 월 제한 '+fmt(items[n.owner].monthlyBuyLimit)+'개':'')+
        ' · 독립적인 상점 재고 미검증'};
    if(n.sourceKind==='make'){
      const r=recipes[n.recipe],edge=n.output;
      return {label:(r?.name||n.recipe)+' · '+name(n.owner),
        category:edge.kind==='random'?'random':'manufacture',
        badge:modeLabel[edge.kind]||'제조',
        detail:'1회 '+fmt(edge.qty)+'개 · 직접 연구 '+list(r?.directRequires).length+
          '개 · 투입 재료 '+list(r?.requiredItems).length+'종'+
          (edge.kind==='random'?' · 랜덤표 상대 비중 '+amount(edge.relativeShare):'')};
    }
    if(n.sourceKind==='event')return {label:'이벤트 '+name(n.event)+' → '+name(n.owner),
      category:'event',badge:modeLabel[n.reward.kind]||'이벤트 지급',
      detail:'보상 '+fmt(n.reward.qty)+'개 · 이벤트 자체 출현과 보상 지급은 별도 판정'};
    if(n.sourceKind==='event-triggers')return {label:'이벤트 발생 경로 '+list(index.events[n.event]?.scripts).length+'개',
      category:'or',badge:'스크립트 선택',detail:'각 스크립트의 연구·시설·월·실행 odds 조건을 별도로 검사 · 발생 확정 아님'};
    if(n.sourceKind==='event-script'){
      const s=index.events[n.event]?.scripts?.[n.scriptIndex];
      return {label:'발생 스크립트 '+(s?.id||n.scriptIndex),category:'event',
        badge:'조건부 발생',detail:'원본 조건 및 이벤트 후보 선택 가중치 추적 · 현재 세이브 실행 가능성 미검증'};
    }
    if(n.sourceKind==='unknown')return {label:'확인된 획득 경로 없음',
      category:'warning',badge:'미색인',detail:n.note};
    if(n.topicId&&research.topics[n.topicId]&&
      /^(LAB|FREE|ACCESS|DEPENDENCIES|UNLOCK):/.test(n.id))
      return researchAdapter(n.topicId).describe(n);
    if(n.kind==='random')return {label:'랜덤 결과 확인',category:'random',badge:'확정 아님',detail:n.note};
    if(n.kind==='blocked')return {label:'부재·미완료 조건',category:'blocked',
      badge:'존재하면 차단',detail:n.note};
    if(n.kind==='facility-function')return {label:'기지 기능 '+n.id,category:'facility',badge:'필수 시설',detail:n.note};
    if(n.kind==='funds')return {label:'자금·작업량',category:'funds',badge:'비용 조건',detail:n.note};
    if(n.kind==='warning')return {label:'추가 확인 필요',category:'warning',badge:'미검증',detail:n.note};
    if(n.kind==='event')return {label:'이벤트 발생 조건',category:'event',badge:'이벤트',detail:n.note};
    if(n.kind==='condition')return {label:'보상 수량',category:'condition',badge:'지급 조건',detail:n.note};
    return {label:n.id,category:'condition',badge:'조건',detail:n.note||''};
  }
  function renderEvidence(n){
    if(facilityAdapter.owns(n))return facilityAdapter.renderEvidence(n);
    const id=n?.owner||n?.id||goalId,item=items[id];
    if(n?.kind==='research'||n?.topicId&&research.topics[n.topicId]&&
      /^(LAB|FREE|ACCESS|DEPENDENCIES|UNLOCK):/.test(n.id))
      return researchAdapter(n.topicId||n.id).renderEvidence(n);
    if(n?.sourceKind==='buy')return '<div class="tech-adapter-proof"><p><b>원본 구매 후보 근거</b> · '+
      esc(n.owner)+'</p><p>구매 가격과 조건만 원본에서 확인했습니다. 실제 판매 목록·재고·판매 상점은 아직 검증되지 않았습니다.</p><pre>'+
      esc(JSON.stringify({costBuy:items[n.owner]?.costBuy,requiresBuy:items[n.owner]?.requiresBuy,
        requiresBuyBaseFunc:items[n.owner]?.requiresBuyBaseFunc,
        requiresBuyCountry:items[n.owner]?.requiresBuyCountry,
        monthlyBuyLimit:items[n.owner]?.monthlyBuyLimit,
        transferTime:items[n.owner]?.transferTime,
        purchaseEvidence:items[n.owner]?.purchaseEvidence,
        sourceFiles:items[n.owner]?.sourceFiles},null,2))+'</pre></div>';
    if(n?.sourceKind==='make')return '<div class="tech-adapter-proof"><p><b>원본 제조식</b> · '+
      esc(n.recipe)+' / 산출 대상 '+esc(n.owner)+'</p><p><a href="../manufacture/#recipe='+
      encodeURIComponent(n.recipe)+'">제조 DB에서 전체 제조식 보기</a></p><pre>'+
      esc(JSON.stringify({recipe:recipes[n.recipe],itemOutcome:n.output},null,2))+'</pre></div>';
    if(n?.sourceKind==='event-script'||n?.sourceKind==='event-triggers')return '<div class="tech-adapter-proof"><p><b>이벤트 발생 스크립트 근거</b> · '+esc(n.event)+'</p><pre>'+
      esc(JSON.stringify(n.sourceKind==='event-script'?index.events[n.event]?.scripts?.[n.scriptIndex]:
        index.events[n.event]?.scripts,null,2))+'</pre></div>';
    if(n?.sourceKind==='event')return '<div class="tech-adapter-proof"><p><b>이벤트 보상 근거</b> · '+
      esc(n.event)+' / 지급 대상 '+esc(n.owner)+'</p><p><a href="../events/#event='+
      encodeURIComponent(n.event)+'">이벤트 DB에서 발생 조건 별도 확인</a></p><pre>'+
      esc(JSON.stringify(n.reward,null,2))+'</pre></div>';
    return '<div class="tech-adapter-proof"><p><b>'+esc(name(id))+'</b> · X-Piratez '+
      esc(index.meta.sourceVersion)+' / OXCE '+esc(index.meta.requiredEngine)+'</p>'+
      '<p>원본 아이템 구매 가격 및 해금 연구, 제조·이벤트 산출 역참조. 전장 노획과 상점 실제 재고 및 이벤트 전체 발생 확률은 별도 확인.</p><pre>'+
      esc(JSON.stringify(item||items[goalId],null,2))+'</pre></div>';
  }
  const linkForNode=n=>facilityAdapter.linkForNode(n)||
    (n?.kind==='research'&&research.topics[n.id]?
    {href:'../research/#research='+encodeURIComponent(n.id),label:'연구 DB에서 전체 선행조건 확인'}:
    n?.kind==='item'&&n.id!==goalId&&items[n.id]?
      {href:'../items/#item='+encodeURIComponent(n.id),label:'이 재료의 아이템 DB 상세 열기'}:null);
  return {root:make('item',goalId),expand,describe,renderEvidence,linkForNode,
    notice:'X-Piratez '+index.meta.sourceVersion+' / OXCE '+
    index.meta.requiredEngine+' · 실물 아이템 획득 근거: 구매(가격만 확인/재고 미검증), 제조 산출, 이벤트 지급. '+
    '확률은 해당 랜덤표 내부 비중이며 이벤트 출현률이 아닙니다. 2.1 병종 DB와 조건을 합치지 않습니다.'};
}
