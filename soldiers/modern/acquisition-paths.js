// Source-first original acquisition paths for all 72 X-Piratez v.o2 birth
// profiles. This module only renders indexed purchase, mission, event and
// manufacture alternatives. No event, item or research is silently granted.
const arr=x=>Array.isArray(x)?x:[];
export function acquisitionPaths(profile,data){
  if(!profile||!data)return null;
  const requiredItems=Object.entries(profile.acquisitionRequiredItems||{}).map(([id,quantity])=>({
    id,quantity,supply:data.itemSupply?.[id]||null
  }));
  const requiredResearch=arr(profile.requires).map(id=>({
    id,rule:data.researchRules?.[id]||null,
    events:arr(data.eventResearchSources?.[id])
  }));
  const all=arr(data.profiles);
  const history=Object.keys(profile.previousTransformations||{}).filter(id=>
    Number(profile.previousTransformations[id])>0);
  const matchingHistory=all.filter(p=>p.id!==profile.id&&history.some(id=>
    Number(p.previousTransformations?.[id]||0)>0));
  const sameBody=all.filter(p=>p.id!==profile.id&&p.soldierType===profile.soldierType&&
    !matchingHistory.some(other=>other.id===p.id));
  const evidenceByMethod={
    direct:profile.cost>0?'직접 고용':'직접 고용 조건 원본',
    manufacture:'제조를 통한 병사 생성',
    event:'이벤트를 통한 병사 생성'
  };
  return {
    id:profile.id,method:profile.sourceType,methodName:evidenceByMethod[profile.sourceType]||profile.sourceType,
    soldierType:profile.soldierType,soldierName:profile.soldierKoName,
    sourceId:profile.sourceId,sourceName:profile.sourceKoName,
    cost:profile.cost,time:profile.time,count:profile.spawnedPersons,
    functions:arr(profile.requiresBaseFunc),requiredResearch,requiredItems,
    eventScripts:arr(profile.acquisitionEventScripts),matchingHistory,sameBody,history
  };
}
export function renderAcquisitionPaths(profile,data,ui={}){
  const esc=ui.esc||((x)=>String(x??'').replace(/[&<>"']/g,c=>
    ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])));
  const fmt=ui.fmt||(x=>x==null?'—':Number(x).toLocaleString('ko-KR'));
  const name=ui.name||(x=>x);
  const info=acquisitionPaths(profile,data);if(!info)return '';
  const originNames={
    STR_THEBAN_ASSAULT_CLONE_LICENSE:'돌격 클론 면허',
    STR_START_COUNTRY_EGYPT_EVENT:'이집트 시작 이벤트',
    STR_REVOLUTIONARY_SPEECH_THEBES:'테베 혁명 연설'
  };
  const text=id=>esc(originNames[id]||name(id));
  const ref=id=>data.researchRules?.[id]?
    '<button type="button" class="research-node" data-research-node="'+esc(id)+'">'+text(id)+'</button>':
    text(id);
  const tokens=(a)=>arr(a).map(ref).join(' · ');
  const list=(values)=>arr(values).map(x=>'<li>'+x+'</li>').join('');
  function scriptConditions(s){
    const parts=[];
    if(s.firstMonth!=null||s.lastMonth!=null)
      parts.push('발생 기간: '+fmt(s.firstMonth??0)+'개월부터'+
        (s.lastMonth!=null?' '+fmt(s.lastMonth)+'개월까지':' 제한 없음'));
    if(s.executionOdds!=null)parts.push('스크립트 실행 판정: '+fmt(s.executionOdds)+'% (결과 확정 아님)');
    if(s.mode==='weighted'&&arr(s.monthWeights).length)
      parts.push('이벤트 선택 가중치: '+arr(s.monthWeights).map(w=>
        fmt(w.month)+'개월부터 '+fmt(w.weight)+' / '+fmt(w.totalWeight)).join('; ')+
        ' (확률로 단정하지 않음)');
    if(s.mode==='oneTimeRandom')parts.push('일회성 무작위 이벤트 후보');
    if(arr(s.oneTimeEarlier).length)
      parts.push('실제로 먼저 발생해야 하는 이벤트: '+arr(s.oneTimeEarlier).map(text).join(' → '));
    for(const [key,label,render] of [
      ['researchPositive','필요 연구',tokens],['researchNegative','완료되면 차단되는 연구',tokens],
      ['itemPositive','필요 물품',tokens],['itemNegative','금지 물품',tokens],
      ['facilityPositive','필요 시설',tokens],['facilityNegative','금지 시설',tokens],
      ['countryPositive','필요 기지 국가',tokens],['countryNegative','금지 기지 국가',tokens],
      ['regionPositive','필요 기지 지역',tokens],['regionNegative','금지 기지 지역',tokens],
      ['soldierTypePositive','필요 병종',tokens],['soldierTypeNegative','금지 병종',tokens],
      ['pactPositive','필요 협정',tokens],['pactNegative','금지 협정',tokens]]){
      if(arr(s[key]).length)parts.push(label+': '+render(s[key]));
    }
    const o=s.otherConditions||{};
    for(const [k,label] of [
      ['minFunds','최소 자금'],['maxFunds','최대 자금'],
      ['minScore','최소 평가'],['maxScore','최대 평가'],
      ['minDifficulty','최소 난이도'],['maxDifficulty','최대 난이도'],
      ['counterMin','최소 이벤트 카운터'],['counterMax','최대 이벤트 카운터']
    ])if(o[k]!=null)parts.push(label+': '+fmt(o[k]));
    return '<div class="origin-condition-overview">'+
      '<p class="fine">이 발생 방법의 조건은 모두 함께 적용됩니다. 다른 방법의 조건은 합치지 않습니다.</p>'+
      (parts.length?'<ul class="origin-source-gates">'+list(parts)+'</ul>':
        '<p class="fine">원본에 추가 발생 조건이 기록되지 않았습니다. 이벤트 발생을 보장하지는 않습니다.</p>')+
      '</div>';
  }
  function renderScriptAlternatives(scripts){
    if(!arr(scripts).length)return '<p class="fine">실제 발생 스크립트의 조건을 아직 색인하지 못했습니다. 획득 확정 아님.</p>';
    return '<p class="fine">'+scripts.length+'개 발생 방법 중 하나를 충족하면 해당 이벤트의 발생 후보가 됩니다. 각 방법 내부의 필요·금지 조건은 모두 적용되며, 조건 충족만으로 보상은 확정되지 않습니다.</p>'+
      '<div class="origin-script-options">'+scripts.map((s,i)=>{
        const time=s.firstMonth!=null||s.lastMonth!=null?
          ' · '+fmt(s.firstMonth??0)+'~'+(s.lastMonth==null?'제한 없음':fmt(s.lastMonth))+'개월':'';
        const count=arr(s.researchPositive).length+arr(s.itemPositive).length+
          arr(s.facilityPositive).length+arr(s.countryPositive).length+
          arr(s.regionPositive).length+arr(s.soldierTypePositive).length+
          arr(s.pactPositive).length;
        const blocked=['researchNegative','itemNegative','facilityNegative','countryNegative',
          'regionNegative','soldierTypeNegative','pactNegative'].some(k=>arr(s[k]).length);
        return '<details class="origin-script" data-script="'+esc(s.script)+'">'+
          '<summary><span class="origin-script-title">방법 '+fmt(i+1)+time+'</span>'+
          '<span class="origin-script-meta">필수 조건 '+fmt(count)+'종'+
          (blocked?' · 차단 조건 있음':'')+(s.executionOdds!=null?' · 실행 판정 '+fmt(s.executionOdds)+'%':'')+
          '</span></summary>'+scriptConditions(s)+
          '<p class="origin-script-evidence">원본 발생 규칙: <code>'+esc(s.script)+'</code></p></details>';
      }).join('')+'</div>';
  }
  function supplyHtml(item){
    const s=item.supply;
    const options=[];
    if(s&&Number(s.buyCost)>0){
      const gates=[...arr(s.buyRequires),...arr(s.buyRequirements)];
      options.push('<div class="origin-route" data-route-kind="buy"><strong>구매: '+fmt(s.buyCost)+' / 1개</strong>'+
        '<p class="fine">원본 물품 구매 가격입니다. 판매처 이름을 임의로 지정하지 않습니다.'+
        (gates.length?' 구매 조건 '+gates.map(ref).join(' · '):' 별도 구매 연구 조건 없음')+
        '</p></div>');
    }
    for(const ev of arr(s?.eventGrants)){
      const quantity=arr(ev.grants).map(g=>
        g.mode==='every'||g.mode==='everyMulti'?fmt(g.count)+'개 고정':
        g.mode==='randomOneOf'?'무작위 후보 '+fmt(g.choices)+'개 중 선택':
        g.mode==='weighted'?'가중치 '+fmt(g.weight):
        g.mode==='randomMulti'?'무작위 묶음 '+fmt(g.count)+'개':'조건부').join(' + ');
      const grants=arr(ev.directResearchAwards);
      options.push('<details class="origin-route source-event" data-route-kind="event" data-event="'+esc(ev.event)+'"><summary>'+
        '<strong>이벤트: '+text(ev.event)+'</strong> — '+esc(quantity)+'</summary>'+
        '<p>물품 지급: '+ref(item.id)+'. 이벤트 발생 및 선택은 조건부입니다.</p>'+
        (grants.length?'<p>같은 이벤트의 연구 직접 지급: '+tokens(grants)+
          ' (물품 연구와 중복 수행하지 않음)</p>':'')+
        renderScriptAlternatives(ev.scriptRoutes||[])+'</details>');
    }
    for(const m of arr(s?.manufacture))options.push('<div class="origin-route" data-route-kind="manufacture">'+
      '<strong>물품 제조: '+text(m.id)+' ×'+fmt(m.quantity)+'</strong>'+
      '<p>필요 연구: '+(arr(m.requires).length?tokens(m.requires):'없음')+
      (Object.keys(m.requiredItems||{}).length?' · 원료: '+
        Object.entries(m.requiredItems).map(([id,n])=>ref(id)+' ×'+fmt(n)).join(' · '):'')+
      ' · 제조비 '+fmt(m.cost)+'</p></div>');
    for(const m of arr(s?.randomManufacture))options.push('<div class="origin-route" data-route-kind="random-manufacture">'+
      '무작위 물품 제조 '+text(m.id)+' — 선택 가중치 '+fmt(m.weight)+'/'+fmt(m.weightTotal)+
      ', 지급 '+fmt(m.count)+'개 (결과 확정 아님)</div>');
    for(const m of arr(s?.researchGrants))options.push('<div class="origin-route" data-route-kind="research-grant">'+
      '연구 완료 지급: '+ref(m.research)+' → '+fmt(m.count)+'개</div>');
    if(s?.mapLoot?.sourceCount)options.push('<div class="origin-route" data-route-kind="map">'+
      '지도 배치 근거 '+fmt(s.mapLoot.sourceCount)+'건'+
      (s.mapLoot.possiblyTruncated?' (색인 생략 가능성 있음)':'')+
      '; 임무 생성·지도 선택·회수는 별도 검증 필요</div>');
    const supplied=options.length?options.join(''):'<p class="fine">색인된 획득 경로 없음. 게임에서 불가능하다는 증명은 아닙니다.</p>';
    return '<details class="origin-material" data-required-item="'+esc(item.id)+'">'+
      '<summary>'+ref(item.id)+' ×'+fmt(item.quantity)+' · 확인된 물품 공급 경로 '+options.length+'종</summary>'+
      '<div class="origin-route-list">'+supplied+'</div></details>';
  }
  const research=info.requiredResearch.length?info.requiredResearch.map(x=>{
    const r=x.rule;
    if(!r)return '<li>'+ref(x.id)+' — 연구 규칙 없음 (미해결)</li>';
    const direct=arr(x.events).map(e=>text(e.event)).join(' / ');
    const deps=arr(r.dependencies);
    return '<li class="origin-research-gate" data-required-research="'+esc(x.id)+'">'+
      '<strong>'+ref(x.id)+'</strong> · 연구 비용 '+fmt(r.cost)+
      (deps.length?' · 기본 연구 조건 '+tokens(deps):' · 직접 선행 연구 없음')+
      (arr(r.requires).length?' · 자동 연구 조건 '+tokens(r.requires):'')+
      (arr(r.requiresBaseFunc).length?' · 기지 기능 '+tokens(r.requiresBaseFunc):'')+
      (r.needItem?' · 연구 표본 '+ref(r.neededItem||x.id)+
        (r.destroyItem?' (연구 시 소모)':' (연구 시 비소모)'):'')+
      (direct?'<p class="fine">대체 이벤트 연구 지급: '+esc(direct)+
        '. 이벤트 자체의 발생 조건은 해당 물품 공급 경로에서 확인하세요.</p>':'')+
      '</li>';
  }).join(''):'<li>출생 자체에 직접 지정된 필요 연구 없음</li>';
  const sub=info.method==='manufacture'?'제조':info.method==='event'?'이벤트 출생':'직접 고용';
  const base='<div class="origin-acquisition-head"><p><strong>최초 생성 방식: '+esc(info.methodName)+'</strong> · '+
    esc(info.soldierName||name(info.soldierType))+' '+fmt(info.count)+'명</p>'+
    '<p>등록된 출생처: '+esc(info.sourceName||name(info.sourceId))+
    ' <small class="id">('+esc(info.sourceId)+')</small> · '+sub+' 비용 '+
    fmt(info.cost)+(info.time!=null?' · 시간 '+fmt(info.time):'')+'</p></div>';
  const req='<h4>출생 전 필요한 연구 경로</h4><ul class="origin-research-gates">'+research+'</ul>'+
    (info.functions.length?'<p>필수 기지 기능: '+tokens(info.functions)+'</p>':'');
  const items='<h4>필요 물품 및 각각의 획득 방법</h4>'+
    (info.requiredItems.length?info.requiredItems.map(supplyHtml).join(''):
      '<p class="fine">이 출생처에는 원본상 별도 제조 재료가 지정되지 않았습니다.</p>');
  const event=info.method==='event'?'<h4>최초 출생 이벤트의 대체 발생 조건</h4>'+
    renderScriptAlternatives(info.eventScripts):'';
  const other=info.matchingHistory.length||info.sameBody.length?'<details class="origin-related">'+
    '<summary>같은 출생 이력 또는 동일 최초 병종의 다른 출생처 ('+
      fmt(info.matchingHistory.length+info.sameBody.length)+'개)</summary>'+
    (info.matchingHistory.length?'<h4>공통 출생 이력 보유 (서로 다른 출생 프로필)</h4>'+
      info.matchingHistory.map(p=>'<p><button type="button" data-open-origin="'+esc(p.id)+'">'+
        esc(p.sourceKoName)+'</button> · '+text(p.soldierType)+
        ' · 공통 이력 '+info.history.filter(id=>Number(p.previousTransformations?.[id]||0)>0).map(text).join(', ')+'</p>').join(''):'')+
    (info.sameBody.length?'<h4>같은 최초 병종 · 출생 이력/초기 능력치가 다를 수 있음</h4>'+
      info.sameBody.map(p=>'<p><button type="button" data-open-origin="'+esc(p.id)+'">'+
        esc(p.sourceKoName)+'</button> · '+text(p.soldierType)+'</p>').join(''):'')+
    '<p class="fine">출생처가 다르면 한 병사의 출생 특성이나 보너스를 합쳐 계산하지 않습니다.</p></details>':'';
  return '<section class="origin-acquisition" data-acquisition-profile="'+esc(info.id)+'">'+
    '<h3>최초 출생·획득 경로와 대체 공급처</h3>'+base+req+items+event+other+
    '<p class="fine">구매·임무·이벤트·제조 가능성은 원본 색인입니다. 실제 발생과 재료 확보를 보장하지 않으며, 연구/획득 순서가 검증된 성장 경로와 구분합니다.</p></section>';
}
