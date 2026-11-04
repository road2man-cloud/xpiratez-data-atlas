// Legacy (v.o1.1.1) facility construction paths shared by item and research
// acquisition adapters. A provider is NOT necessarily a buildable facility;
// starts, construction, damage-only states and an unverified base are distinct.
const list=x=>Array.isArray(x)?x:[];
const fmt=x=>Number(x).toLocaleString('ko-KR');
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({
  '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
}[c]));
const make=(kind,id,extra={})=>({kind,id,children:[],...extra});
const gate=(kind,id,note)=>make(kind,id,{note,sourceKind:'facility-gate'});

export function createLegacyFacilityTechAdapter(source,meta){
  if(source?.meta?.schemaVersion!==1||
    source.meta.sourceVersion!==meta?.sourceVersion||
    source.meta.sourceMetadataSha256!==meta?.sourceMetadataSha256||
    source.meta.requiredEngine!==meta?.requiredEngine)
    throw Error('시설 획득 규칙의 원본 버전·메타데이터가 아이템/연구와 다릅니다');
  const facilities=source.facilities,functions=source.functions;
  const name=id=>facilities[id]?.name||id;
  const owns=n=>Boolean(n&&(
    n.kind==='facility-function'||n.kind==='facility-type'||
    ['facility-providers','facility-build','facility-start','facility-gate'].includes(n.sourceKind)));
  function expand(n){
    if(n.kind==='facility-function'){
      const ids=list(functions[n.id]);
      return {node:n,relation:'chain',children:ids.length?[
        make('or','FACILITY_PROVIDERS:'+n.id,{sourceKind:'facility-providers',func:n.id})
      ]:[gate('warning','FACILITY_NO_PROVIDER:'+n.id,
        '원본에 이 기지 기능을 제공하는 시설이 없음 · 불가능 판정 아닌 미색인')]};
    }
    if(n.sourceKind==='facility-providers'){
      const ids=list(functions[n.func]);
      return {node:n,relation:'or',children:ids.map(id=>make('facility-type',id))};
    }
    if(n.kind==='facility-type'){
      const f=facilities[n.id];
      if(!f)return {node:n,relation:'chain',children:[gate('warning','FACILITY_UNINDEXED:'+n.id,
        '시설 원본 규칙 없음 · 건설 경로 미검증')]};
      const routes=[];
      if(f.startingCount>0)routes.push(make('and','FACILITY_START:'+n.id,
        {sourceKind:'facility-start',facility:n.id}));
      if(f.available&&!f.stateOnly)routes.push(make('and','FACILITY_BUILD:'+n.id,
        {sourceKind:'facility-build',facility:n.id}));
      if(!routes.length)routes.push(gate('warning','FACILITY_UNBUILDABLE:'+n.id,
        '현재 원본에서 시작 기지 배치 또는 일반 건설 경로가 확인되지 않음 · 시나리오/특수 지급은 별도 조사'));
      return {node:n,relation:routes.length>1?'or':'chain',children:routes};
    }
    if(n.sourceKind==='facility-start'){
      const f=facilities[n.facility];
      return {node:n,relation:'and',children:[gate('condition','FACILITY_START_COUNT:'+n.facility,
        '원본 시작 기지 배치 '+fmt(f.startingCount)+'개 · 어떤 기지/시작 조건에서 실제 보유하는지는 미검증'),
        gate('warning','FACILITY_START_STATE:'+n.facility,
          '현재 세이브에서 시작 시설이 남아 있는지 확인 필요 · 건설 완료로 대체 판정 금지')]};
    }
    if(n.sourceKind==='facility-build'){
      const f=facilities[n.facility];
      const requirements=[
        ...list(f.requires).map(id=>make('research',id)),
        ...list(f.requiresBaseFunc).map(id=>make('facility-function',id)),
        ...list(f.buildItems).map(x=>make('item',x.id,{qty:x.qty,
          note:'시설 건설에 실물 '+fmt(x.qty)+'개 투입 필요'})),
        gate('funds','FACILITY_COST:'+n.facility,
          f.buildCost==null?'원본 건설비 미기록 · 무료 건설 확정 아님':
            '건설 자금 '+fmt(f.buildCost)+' · 실제 보유 자금/건설 가능 여부 미검증'),
        gate('condition','FACILITY_BUILD_TIME:'+n.facility,
          f.buildTime==null?'원본 건설 시간 미기록 · 완공 시점 미검증':
            '건설 기간 '+fmt(f.buildTime)+'일 · 완공 이후에 기지 기능 충족'),
        gate('condition','FACILITY_COMPLETE:'+n.facility,
          '해당 기지에서 실제 건설·완공 후 기능 제공 · 다른 기지 시설로 원격 충족하지 않음')
      ];
      if(Number(f.maxAllowedPerBase)>0)requirements.push(gate('condition',
        'FACILITY_MAX:'+n.facility,'기지당 최대 '+fmt(f.maxAllowedPerBase)+'개 설치 제한'));
      if(list(f.buildOverFacilities).length)requirements.push(gate('warning',
        'FACILITY_REPLACE:'+n.facility,'기존 시설 위에 건설 가능한 별도 옵션 '+
          f.buildOverFacilities.join(', ')+' · 이를 무조건 필수 건설 재료로 간주하지 않음'));
      return {node:n,relation:'and',children:requirements};
    }
    return {node:n,relation:'chain',children:[]};
  }
  function describe(n){
    const f=facilities[n.id]||facilities[n.facility];
    if(n.kind==='facility-function')return {label:'기지 기능 '+n.id,category:'facility',
      badge:'기지 기능',detail:'기능 제공 시설 '+list(functions[n.id]).length+
        '종 · 해당 기지에 존재/완공해야 충족'};
    if(n.sourceKind==='facility-providers')return {label:'기지 기능 제공 시설 선택',
      category:'or',badge:'시설 중 하나',detail:'원본 provideBaseFunc 제공 시설 '+
        list(functions[n.func]).length+'종 · 건설 가능성은 각 시설별 확인'};
    if(n.kind==='facility-type')return {label:name(n.id),category:'facility',badge:'시설 후보',
      detail:'시작 배치 '+(f?.startingCount||0)+' · 일반 건설 '+
        (f?.available&&!f?.stateOnly?'원본 가용':'확인되지 않음')+
        (f?.stateOnly?' · 손상/상태 전용':'')};
    if(n.sourceKind==='facility-build')return {label:'시설 건설 · '+name(n.facility),
      category:'facility',badge:'건설 경로',detail:'해금 연구·기지 기능·실물 재료·자금·시간 모두 필요'};
    if(n.sourceKind==='facility-start')return {label:'시작 기지 배치 · '+name(n.facility),
      category:'start',badge:'시작 조건',detail:'원본 시작 배치 수치만 확인 · 현재 게임 시작 선택/세이브 실현성 미확정'};
    return {label:n.kind==='funds'?'건설 비용':n.kind==='warning'?'추가 확인 필요':
      n.kind==='item'?'건설 재료':n.kind==='research'?'건설 해금 연구':'시설 건설 조건',
      category:n.kind==='funds'?'funds':n.kind==='warning'?'warning':'condition',
      badge:n.kind==='warning'?'미검증':'필수 조건',detail:n.note||''};
  }
  function renderEvidence(n){
    const id=n.facility||n.func||n.id;
    const f=facilities[id];
    return '<div class="tech-adapter-proof"><p><b>기지 시설 원본 증거</b> · '+
      esc(source.meta.sourceVersion)+' / '+esc(id)+'</p><p><a href="../facilities/#facility='+
      encodeURIComponent(id)+'">시설 DB 원본에서 확인</a></p><pre>'+
      esc(JSON.stringify(f||{baseFunction:id,providers:functions[id]||[]},null,2))+'</pre></div>';
  }
  function linkForNode(n){
    if(n.kind==='facility-type')return {href:'../facilities/#facility='+
      encodeURIComponent(n.id),label:'시설 DB에서 건설·원본 상세 확인'};
    return null;
  }
  return {owns,expand,describe,renderEvidence,linkForNode};
}
