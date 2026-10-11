// Captain advantage atlas from effective research, training and event rules.
// Never turn a listed unlock/event script into a guaranteed reward.
(() => {
  "use strict";
  const esc=value=>String(value??"").replace(/[&<>"']/g,c=>({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  }[c]));
  const names=id=>({STR_CAPTAINS_11:"선장의 11",STR_ROGUE_CLONE:"외톨이 클론",
    STR_ORTHODOX_MAGE_DAMSEL:"정통파 마법사 영애"})[id]||id;
  const researchLink=id=>'../research/#research='+encodeURIComponent(id);
  const eventLink=id=>'../events/#event='+encodeURIComponent(id);
  const itemLink=id=>'../items/#item='+encodeURIComponent(id);
  function eventTitle(e){
    if(e.id==="STR_CAPTAINS_11")return "선장의 11 · Captain’s 11";
    if(e.name==="똑 똑"&&e.id.startsWith("STR_KNOCK_KNOCK_")){
      const award=e.reward?.guaranteedItems?.[0]?.name||e.reward?.research?.[0]?.name;
      return "똑 똑 · "+(award||e.id.replace("STR_KNOCK_KNOCK_",""));
    }
    return e.name;
  }
  let catalog=null,loadError=null;
  const byRow=new Map(),chunkCache=new Map();
  const perRow=id=>byRow.get(id)||null;
  const statusText=document.querySelector("#captainBenefitsStatus");

  function searchText(id){
    const row=perRow(id);
    if(!row)return "";
    return [row.choiceId,...row.unlocks.map(x=>x.id+" "+x.name),
      ...row.featured.map(x=>x.id+" "+x.name),row.eventSearch||"",
      row.commonKnockKnock?.eligible?"일반 똑 똑 똑똑 똑똑이 knock knock 공통 방문":"",
      id==="thief"?"캡틴스11 captains eleven 선장11 선장의 11 비밀 속임수":""]
      .join(" ").toLowerCase();
  }
  function benefitShort(row) {
    if(row.rowId==="thief")return{main:"선장의 11 · 토큰 ×11",tag:"도둑 전용 · 조건 충족 뒤 이벤트 1회"};
    if(row.rowId==="priest")return{main:"건강미 훈련 · 벙커",tag:"사제 분기의 핵심 강화 · 연구/시설 조건 별도"};
    const direct=row.featured.find(x=>x.route==="selected-branch"&&(x.researchCount||x.itemCount||x.funds>0));
    if(direct)return{main:featuredName(direct),tag:"선장 선택이 조건인 이벤트 · 다른 조건 확인"};
    const indirect=row.featured.find(x=>x.route==="subsequent-unlock"&&(x.researchCount||x.itemCount||x.funds>0))||row.featured[0];
    if(indirect)return{main:featuredName(indirect),tag:indirect.route==="selected-branch"?
      "선장 조건 이벤트 · 결과는 별도 확인":"후속 플래그/이벤트 조건부 · 즉시 지급 아님"};
    const first=row.unlocks.find(x=>x.status==="candidate");
    if(first)return{main:first.name,tag:"연구 해금 경로 후보 · 자동 완료 아님"};
    return{main:"다음 단계 선택·장기 이벤트",tag:"직접 지급보다 후속 분기 해금이 중심"};
  }
  function featuredName(e){
    if(e.name==="똑 똑"&&e.id.startsWith("STR_KNOCK_KNOCK_"))
      return e.id==="STR_KNOCK_KNOCK_ROGUE_CLONE"
        ?"똑 똑 · 외톨이 클론 (DumbLazy 조건)"
        :e.id==="STR_KNOCK_KNOCK_ORTHODOX_MAGE_DAMSEL"
          ?"똑 똑 · 붉은 새벽단 기적술사 (별도 조건)"
          :"똑 똑 · "+e.id.replace("STR_KNOCK_KNOCK_","");
    return e.name;
  }
  function sharedVisitorBadge(row){
    const common=row.commonKnockKnock;
    if(!common)return '<div class="benefit-visitor-primary benefit-visitor-unknown">공통 방문 이벤트 자료 미확인</div>';
    const eligible=common.eligible===true;
    const cloned=eligible&&row.unlocks?.some(x=>x.id==="STR_CAPTAIN_DUMBLAZY"&&x.status!=="disabled")&&
      row.eventSearch?.includes("STR_KNOCK_KNOCK_ROGUE_CLONE");
    const mage=eligible&&row.unlocks?.some(x=>x.id==="STR_CAPTAIN_JACKLAZY"&&x.status!=="disabled")&&
      row.eventSearch?.includes("STR_KNOCK_KNOCK_ORTHODOX_MAGE_DAMSEL");
    return '<div class="benefit-visitor-primary '+(eligible?'benefit-visitor-yes':'benefit-visitor-no')+
      '" data-common-knock="'+(eligible?'eligible':'blocked')+'">'+
      '<strong>똑 똑(똑똑이) 방문</strong><b>'+
      (eligible?'조건부 가능 · 공통 '+common.outcomeCount+'종':'일반형 차단 · Soreass')+'</b>'+
      (cloned?'<small>추가: DumbLazy 연구 완료 후 외톨이 클론 추첨 후보</small>':'')+
      (mage?'<small>추가: JackLazy 경로의 기적술사 추첨 후보</small>':'')+
      '</div>';
  }
  function matrixCell(r) {
    const row=perRow(r.id);
    if(!row)return'<span class="muted">보상 자료 로딩 중</span>';
    const headline=benefitShort(row);
    return '<span class="benefit-main">'+esc(headline.main)+'</span>'+
      '<small class="benefit-conditional">'+esc(headline.tag)+'</small>'+
      sharedVisitorBadge(row)+
      '<small class="benefit-count">원본 명시 해금 '+row.unlocks.length+
      '개 · 직접 이벤트 '+row.categories.directEvents+
      '곳 · 후속 후보 '+row.categories.downstreamEvents+'곳</small>';
  }
  function renderStageCardBadges(){
    for(const card of document.querySelectorAll(".captain-branch-perks[data-benefit-choice]")){
      const id=card.dataset.benefitChoice,row=perRow(id);
      if(!row)continue;
      const headline=benefitShort(row);
      const highlight=id==="thief"?
        '<a href="../trainings/?training=STR_CAPTAINS_11">Captain’s 11 훈련 상세</a> · '+
        '<a href="../events/#event=STR_CAPTAINS_11">지급 이벤트</a>':'';
      card.innerHTML='<b>분기 고유 보상·후속 이점</b><strong>'+esc(headline.main)+'</strong>'+
        '<small>'+esc(headline.tag)+'</small>'+sharedVisitorBadge(row)+
        '<span>연구 해금 후보 '+row.unlocks.length+'개 · 관련 이벤트 '+row.categories.directEvents+
        ' 직접 / '+row.categories.downstreamEvents+' 후속 · 자세한 사항은 위 비교표의 선장 행을 선택</span>'+
        (highlight?'<small>'+highlight+'</small>':'');
    }
  }
  function effectLinks(entries,kind,max=8) {
    const xs=entries.slice(0,max).map(x=>'<a href="'+
      (kind==="research"?researchLink(x.id):itemLink(x.id))+
      '" title="'+esc(x.id)+'">'+esc(x.name||x.id)+
      (x.qty!=null?' ×'+esc(x.qty):"")+'</a>');
    return xs.join(" · ")+(entries.length>max?' 외 '+(entries.length-max)+'개':'');
  }
  function eventRewards(e) {
    const r=e.reward,parts=[];
    if(r.researchTotal)parts.push('<b>연구/진행 플래그</b> '+effectLinks(r.research,"research",5)+
      (r.researchTotal>r.research.length?' 외 '+(r.researchTotal-r.research.length)+'개':''));
    if(r.guaranteedTotal)parts.push('<b>확정 아이템</b> '+effectLinks(r.guaranteedItems,"items",5)+
      (r.guaranteedTotal>r.guaranteedItems.length?' 외 '+(r.guaranteedTotal-r.guaranteedItems.length)+'개':''));
    if(r.randomTotal)parts.push('<b>무작위 아이템 후보</b> '+effectLinks(r.randomItems,"items",3)+
      (r.randomTotal>r.randomItems.length?' 외 '+(r.randomTotal-r.randomItems.length)+'개':''));
    if(r.randomBundleTotal)parts.push('<b>무작위 묶음 보상</b> '+r.randomBundleTotal+'종 (이벤트 DB에서 전체 확인)');
    if(r.funds)parts.push('<b>자금</b> '+(r.funds>0?"+":"")+"$"+r.funds.toLocaleString());
    if(r.points)parts.push('<b>점수</b> '+(r.points>0?"+":"")+r.points);
    if(r.spawnedPersonType||r.spawnedPersons||r.spawnedSoldier){
      const spawned=r.spawnedPersonType||r.spawnedSoldier||r.spawnedPersons;
      parts.push('<b>병사/인물 생성</b> '+(typeof spawned==='string'?esc(spawned):'이벤트 DB에서 종류·수량 확인'));
    }
    return parts.length?parts.join(' · '):'<span class="muted">직접 표시할 지급품 없음 · 이벤트 DB에서 전체 효과·위험 확인</span>';
  }
  function eventPath(p,branch){
    const from=p.mode==="selected-branch"?"선장 선택 조건":"후속 해금 플래그를 추가로 완료한 경우";
    const req=p.required.map(x=>'<a href="'+researchLink(x)+'">'+esc(x)+'</a>').join(" + ");
    const no=p.forbidden.length?'<span class="branch-gate-not">미보유 '+esc(p.forbidden.join(", "))+'</span>':"";
    const odds=p.conditions.executionOdds!=null?' · 실행 판정 '+esc(p.conditions.executionOdds)+'%':'';
    const weights=p.eventWeights.map(x=>String(x.weight)+"/"+String(x.totalWeight)).join(", ");
    const weight=weights?' · 선택 가중치 '+esc(weights):"";
    const firstMonth=p.conditions.firstMonth!=null?' · '+esc(p.conditions.firstMonth)+'월 이후':"";
    const itemReq=p.requiredItems.length?' · 아이템 조건 '+esc(p.requiredItems.map(x=>x.id+":"+(x.value?"보유":"미보유")).join(", ")):"";
    const other=p.otherTriggerKinds.length?' · 기타 조건 '+esc(p.otherTriggerKinds.join(", ")):"";
    return '<li><b>'+esc(from)+'</b> · 원본 script <code>'+esc(p.id)+'</code>'+
      '<div>필요 연구: '+(req||"없음")+' '+no+'</div>'+
      '<small>조건부 '+(p.oneTimeRandom||p.oneTimeSequential?"일회성 ":"")+
      esc(odds+weight+firstMonth+itemReq+other)+
      ' · 서로 다른 확률을 단순 곱해 월 획득률로 간주하지 않음</small></li>';
  }
  function eventCard(e){
    const hasDirect=e.paths.some(p=>p.mode==="selected-branch");
    return '<article class="captain-event-item" data-benefit-event="'+esc(e.id)+'">'+
      '<div class="captain-event-title"><b>'+esc(eventTitle(e))+'</b><span>'+
      (hasDirect?"선장 직접 조건":"후속 해금 후 조건부")+'</span></div>'+
      '<p class="captain-event-reward">'+eventRewards(e)+'</p>'+
      '<details><summary>실제 이벤트 선행·배제·확률 ('+e.paths.length+'개 스크립트)</summary>'+
      '<ul>'+e.paths.map(p=>eventPath(p)).join("")+'</ul></details>'+
      '<a class="captain-event-source" href="'+eventLink(e.id)+'">이벤트 DB에서 결과·스크립트·전체 지급품 확인 →</a>'+
      '</article>';
  }
  function captainsElevenMarkup(row){
    if(row.rowId!=="thief")return"";
    const t=catalog?.special?.captainsElevenTraining;
    if(!t)return'<p>선장의 11 훈련 데이터가 제공되지 않았습니다.</p>';
    const b=t.soldierBonus;
    const skills=[["TU",b.tu],["기력",b.stamina],["용기",b.bravery],
      ["반응",b.reactions],["사격",b.firing],["투척",b.throwing],["근접",b.melee],["Mana",b.mana]];
    return '<article class="captain-key-reward"><h4>대표 보상 · Captain’s 11 / 선장의 11</h4>'+
      '<p><strong>도둑 계급 전용 이벤트</strong>: 도둑 선장 + 선장의 일지 #1 + 등급: 악당(선장 계급 2) + 도박사 트로피 + 현상금 사냥꾼 C 배지. 모두 충족하고 아직 Captain’s 11을 받지 않은 상태에서 이벤트가 연구 플래그와 <b>토큰 11개</b>, 점수 +25를 지급합니다. 조건 충족 즉시 자동 지급되는 훈련은 아닙니다.</p>'+
      '<p><b>병사 1명 훈련 비용:</b> $'+Number(t.cost).toLocaleString()+
      ' · '+Number(t.time).toLocaleString()+'시간 · '+t.requiredItems.map(x=>esc(x.name)+
        " ×"+x.qty).join(" · ")+' · 대상 병종 '+t.eligibleSoldierTypes+'종 (병종·부상 등 추가 제한).</p>'+
      '<p><b>별도 SoldierBonus 능력치:</b> '+skills.filter(([,n])=>n!==0).map(([k,n])=>k+(n>0?"+":"")+n).join(" · ")+
      '. 기력 회복 +'+(b.recovery?.energy?.flatOne||0)+
      ', 기절 회복 +'+(b.recovery?.stun?.flatOne||0)+
      '. 일반 훈련 증가와 SoldierBonus를 구분해 평가해야 합니다.</p>'+
      '<p>토큰 11개는 <b>추가 공급이 없다는 가정 아래 최대 11회분</b>이며, 11명이 즉시 생성되는 보상이 아닙니다.</p>'+
      '<p><a href="../trainings/?training=STR_CAPTAINS_11">병사훈련 DB에서 효과·상한·재료 확인</a> · '+
      '<a href="../events/#event=STR_CAPTAINS_11">지급 이벤트 원본 보기</a></p></article>';
  }
  function commonVisitorMarkup(row,detail){
    const common=catalog?.special?.commonKnockKnock;
    if(!common)return'<p class="risk-note">공통 방문 이벤트 검증 색인이 제공되지 않았습니다.</p>';
    const available=row.commonKnockKnock?.eligible===true;
    const sources=common.scripts.map(s=>'<code>'+esc(s.id)+'</code>').join(', ');
    const exclusions=common.excludedResearch.map(id=>
      '<a href="'+researchLink(id)+'">'+esc(id)+'</a>').join(' + ');
    const first=common.scripts.map(s=>s.conditions?.firstMonth)
      .filter(v=>v!==undefined);
    const odds=common.scripts.map(s=>s.conditions?.executionOdds)
      .filter(v=>v!==undefined);
    const specialized=(detail.events||[]).filter(e=>/^STR_KNOCK_KNOCK_/.test(e.id));
    return '<section class="captain-common-visitor" data-common-visitor="'+
      (available?'eligible':'excluded')+'"><h4>공통 똑 똑(Knock Knock) 방문 · 선장 고유 보상과 별개</h4>'+
      '<p><strong>'+ (available?'일반 방문 가능 후보':'이 분기는 일반 방문 차단')+
      '</strong> · 원본 일반 방문 스크립트의 조건은 <b>'+exclusions+
      ' 미보유</b>입니다. 사제/도둑 계급 자체는 금지조건에 없습니다.</p>'+
      '<p>기본 스크립트: '+sources+
      ' · firstMonth '+esc([...new Set(first)].join(', '))+
      ' · executionOdds '+esc([...new Set(odds)].join(', '))+
      '. <b>이 값은 방문의 월간 확정 확률이 아닙니다.</b> 이벤트별 선택 가중치와 다른 게임 조건은 별개입니다.</p>'+
      (available?'<p>선장 선택만으로 이벤트가 반드시 발생하지는 않습니다.</p>':
        '<p>단, Soreass 전용 방문 이벤트 등 별도 스크립트는 이 공통 차단과 구분합니다.</p>')+
      '<details><summary>공통 방문 결과 후보 '+common.outcomes.length+
      '종 전체 · 원본 이벤트 보기</summary><div class="captain-shared-event-links">'+
      common.outcomes.map(x=>'<a href="'+eventLink(x.id)+'" title="'+esc(x.id)+'">'+
        esc(x.name)+' ('+esc(x.id)+')</a>').join(' · ')+
      '</div></details>'+
      '<p>이 분기에 연결된 추가 특수 똑 똑 결과: '+
      (specialized.length?specialized.slice(0,7).map(e=>
        '<a href="'+eventLink(e.id)+'">'+esc(e.id)+'</a>').join(' · ')+
        (specialized.length>7?' 외 '+(specialized.length-7)+'종':''):
        '별도 추가 플래그의 지급 여부 확인 필요')+
      '. 추가 특수 방문은 DumbLazy·JackLazy·Saint 등 각자의 연구·배제 조건을 충족해야 합니다.</p>'+
      '</section>';
  }
  function itemGroup(label,entries,max=12){
    if(!entries.length)return'<p class="muted">이 단계 선택의 명시적 해당 항목 없음</p>';
    return '<div class="captain-research-links">'+entries.slice(0,max).map(x=>
      '<a href="'+researchLink(x.id)+'" title="'+esc(x.id)+'">'+esc(x.name||x.id)+
      (x.status==="disabled"?' (이 단계에서 배제)':'')+'</a>').join(" · ")+
      (entries.length>max?' · 외 '+(entries.length-max)+'개':'')+'</div>';
  }
  function renderChunks(row,detail){
    const host=document.querySelector('#captainBenefitDetail[data-branch="'+row.rowId+'"]');
    if(!host)return;
    const events=detail.events||[];
    const direct=events.filter(e=>e.paths.some(p=>p.mode==="selected-branch"));
    const followup=events.filter(e=>!e.paths.some(p=>p.mode==="selected-branch"));
    const disabled=row.directDisables;
    host.innerHTML='<h3>선장 고유 혜택 · 정확한 지급·해금·상호배제</h3>'+
      '<p class="captain-benefit-explain">원본 4,612개 연구와 792개 이벤트의 조건을 대조했습니다. <b>연구 unlocks는 선행 우회/진입 후보이지 연구 자동 완료가 아니며</b>, 이벤트는 다른 선행·추첨·시기·자원 조건을 충족해야 합니다. 목록의 존재만으로 해당 세이브에서 발생이 보장되지 않습니다.</p>'+
      captainsElevenMarkup(row)+commonVisitorMarkup(row,detail)+
      '<details class="captain-benefit-group" open><summary>이 선택이 직접 조건인 이벤트 <b>'+direct.length+'개</b></summary>'+
      '<div class="captain-event-list">'+(direct.length?direct.map(eventCard).join(""):'<p>직접 조건인 이벤트 없음 · 다음 단계 또는 연구 해금 경로 확인</p>')+'</div></details>'+
      '<details class="captain-benefit-group"><summary>후속 명시 해금 뒤 조건부 이벤트 <b>'+followup.length+'개</b> (전체 목록)</summary>'+
      '<p class="muted">이 선택의 unlocks에 이름이 있다는 이유만으로 현재 완료 상태라고 가정하지 않습니다. 이벤트 연구 선행을 각각 확인하세요.</p>'+
      '<div class="captain-event-list">'+(followup.length?followup.map(eventCard).join(""):'<p>등록된 후속 이벤트 후보 없음</p>')+'</div></details>'+
      '<details class="captain-benefit-group"><summary>이 선택에서 unlocks로 지정한 연구 <b>'+row.unlocks.length+'개</b> (자동 지급 아님)</summary>'+
      itemGroup("unlocks",row.unlocks,50)+
      (row.branchStatus==="self-disabled-final-flag"?
        '<p class="risk-note">주의: 이 선택 연구가 자신을 disables하는 상태이므로, 완료 이력만으로 지속적인 unlocks 출처가 된다고 보장할 수 없습니다. 연구 DB와 현재 세이브 상태를 확인하세요.</p>':"")+
      '</details>'+
      '<details class="captain-benefit-group"><summary>원본 직접 disables <b>'+disabled.length+'개</b> · 방향성 확인</summary>'+
      itemGroup("disables",disabled,100)+
      '<p class="muted">A → B 차단을 B → A로 자동 대칭 처리하지 않습니다. 위 목록은 선택 연구 자체의 직접 차단이며, 이전 단계의 차단과 추가 이벤트·연구 조건은 별도입니다.</p></details>';
  }
  async function renderDetail(id){
    const host=document.querySelector('#captainBenefitDetail[data-branch="'+id+'"]');
    if(!host)return;
    try{
      await ready;
      const row=perRow(id);
      if(!row)throw Error("등록되지 않은 선장 분기");
      if(!chunkCache.has(id))chunkCache.set(id,fetch("../data/captain-benefits/"+encodeURIComponent(id)+".json")
        .then(async response=>{
          if(!response.ok)throw Error("이벤트 상세 HTTP "+response.status);
          const data=await response.json();
          if(data.schemaVersion!==1||data.rowId!==id||data.choiceId!==row.choiceId||
             data.events.length!==row.categories.eventTotal)
            throw Error("원본 후속 이벤트 증거 파일 불일치: "+id);
          return data;
        }));
      const detail=await chunkCache.get(id);
      if(document.querySelector('#captainBenefitDetail[data-branch="'+id+'"]'))renderChunks(row,detail);
    }catch(e){const current=document.querySelector('#captainBenefitDetail[data-branch="'+id+'"]');
      if(current)current.innerHTML='<p class="risk-note">분기 보상 증거를 읽지 못했습니다: '+esc(e.message)+
        '. 조건을 추정해 표시하지 않습니다.</p>'; }
  }
  async function init(){
    const response=await fetch("../data/captain-benefits-index.json");
    if(!response.ok)throw Error("전용 보상 데이터 HTTP "+response.status);
    const data=await response.json();
    if(data.schemaVersion!==1||data.meta.captains!==22||data.rows.length!==22||
      data.special?.commonKnockKnock?.scripts.length!==3||
      !data.rows.some(r=>r.rowId==="thief"&&r.featured.some(e=>e.id==="STR_CAPTAINS_11")))
      throw Error("Captain’s 11 또는 선장 보상 색인 불일치");
    catalog=data;
    for(const entry of data.rows){
      if(!Number.isInteger(entry.categories.eventTotal))throw Error("후속 이벤트 총수 누락: "+entry.rowId);
      byRow.set(entry.rowId,entry);
    }
    // The atlas loads separately so the first comparison UI stays responsive.
    rowMarkup.clear();renderRows();renderStageCardBadges();
    if(statusText)statusText.textContent='22개 선택지 원본 근거 검증 · 직접 이벤트와 후속 조건부 후보를 구분 표시';
  }
  const ready=init().catch(e=>{
    loadError=e;
    if(statusText){statusText.textContent='전용 보상 데이터 오류: '+e.message;statusText.classList.add("risk-note");}
    rowMarkup.clear();renderRows();
    throw e;
  });
  // Never leave a rejected network promise unhandled in a normal page.
  ready.catch(()=>{});
  window.CaptainBenefits={matrixCell,searchText,renderDetail,ready};
})();
