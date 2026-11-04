// Exact X-Piratez v.o2 start-choice evidence. This is a source audit, not
// a campaign planner or an assertion that every material supply route is valid.
const arr=x=>Array.isArray(x)?x:[];
const STAGE_SOURCES=[
  ['기본 성격', 'STR_CAPTAIN_PERSONALITY_TEST',5],
  ['직업 선택', 'STR_CAPTAIN_PUSSY_UP',5],
  ['무직 혼합형', 'STR_CAPTAIN_UNCLASSED',7],
  ['Pure 최종 선택', 'STR_CAPTAIN_PURE',5]
];
const optionsCache=new WeakMap();
export function captainChoiceStages(researchRules){
  if(optionsCache.has(researchRules))return optionsCache.get(researchRules);
  const stages=STAGE_SOURCES.map(([label,source,expected])=>{
    const options=Object.entries(researchRules).filter(([id,r])=>
      id.startsWith('STR_CAPTAIN_')&&arr(r.dependencies).includes(source)&&
      Number(r.cost)>0).map(([id])=>id).sort();
    const reciprocal=options.length===expected&&options.every((id,i)=>
      options.every((other,j)=>i===j||arr(researchRules[id]?.disables).includes(other)&&
        arr(researchRules[other]?.disables).includes(id)));
    return {label,source,expected,options,reciprocal};
  });
  optionsCache.set(researchRules,stages);
  return stages;
}
export function initialCaptainChoices(researchRules){return captainChoiceStages(researchRules)[0];}
export function auditInitialChoiceEvidence(profile,data,candidate=null){
  const stages=captainChoiceStages(data.researchRules);
  const stage=stages[0];
  const known=new Set(stages.flatMap(s=>s.options)),refs=[];
  const append=(kind,source,script,item,positive=[],negative=[])=>{
    const pos=arr(positive).filter(id=>known.has(id)),neg=arr(negative).filter(id=>known.has(id));
    if(pos.length||neg.length)refs.push({kind,source,script:script||null,
      item:item||null,required:pos,forbidden:neg});
  };
  append('birth-research',profile.id,null,null,profile.requires||[],[]);
  for(const s of arr(profile.acquisitionEventScripts))
    append('birth-event',profile.sourceId,s.script,null,s.researchPositive,s.researchNegative);
  for(const [item] of Object.entries(profile.acquisitionRequiredItems||{})){
    const supply=data.itemSupply?.[item];
    if(!supply)continue;
    for(const e of arr(supply.eventGrants))for(const s of arr(e.scriptRoutes))
      append('item-event',e.event,s.script,item,s.researchPositive,s.researchNegative);
    for(const m of arr(supply.manufacture))
      append('item-manufacture',m.id,null,item,m.requires,[]);
    for(const m of arr(supply.randomManufacture))
      append('item-random-manufacture',m.id,null,item,m.requires,[]);
  }
  const unique=[...new Map(refs.map(x=>[
    [x.kind,x.source,x.script,x.item,x.required.join(','),x.forbidden.join(',')].join('|'),x
  ])).values()];
  const selections=[...known].filter(id=>arr(candidate?.steps).some(s=>
    (s.type==='research'||s.type==='eventResearch'||s.type==='freeResearch')&&
    (s.id===id||s.research===id)));
  return {profileId:profile.id,stage,stages,selections,sourceReferences:unique,
    scope:'ONLY_DIRECT_VO2_RESEARCH_AND_ACQUISITION_SUPPLY_GUARDS'};
}
export function renderInitialChoiceEvidence(report,ui={}){
  const name=ui.name||((id)=>id);
  const esc=ui.esc||((v)=>String(v??'').replace(/[&<>"']/g,c=>
    ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])));
  const idLabel=id=>'<strong>'+esc(name(id))+'</strong> <small>'+esc(id)+'</small>';
  const names=ids=>ids.map(id=>'<button type="button" data-research-node="'+esc(id)+
    '">'+esc(name(id))+'</button>').join(' ');
  const stages=report.stages||[report.stage];
  const stage=stages[0];
  const sources=report.sourceReferences;
  const sourceLabel={
    'birth-research':'출생 자체가 요구하는 연구',
    'birth-event':'출생 이벤트의 발생 조건',
    'item-event':'출생 재료를 주는 이벤트',
    'item-manufacture':'출생 재료의 제조 조건',
    'item-random-manufacture':'출생 재료의 무작위 제조'
  };
  const entries=sources.map((x,i)=>'<li class="origin-choice-source" data-start-choice-path="'+
    esc(x.kind)+'"><details'+(i<2?' open':'')+'><summary>'+
    esc(sourceLabel[x.kind]||x.kind)+' · '+esc(name(x.source))+
    (x.item?' → '+esc(name(x.item)):'')+(x.script?' / '+esc(x.script):'')+
    '</summary><p>'+(x.required.length?'반드시 선택되어 있어야 함: '+names(x.required):
      '해당 선택을 직접 요구하지 않음')+'</p>'+
    (x.forbidden.length?'<p>선택되어 있으면 이 경로 차단: '+names(x.forbidden)+'</p>':'')+
    '<p class="fine">이 조건은 해당 출생/공급 스크립트에만 적용됩니다. 다른 공급처에 그대로 적용되지 않습니다.</p>'+
    '</details></li>').join('');
  return '<section class="origin-start-choice-evidence" data-start-choice-profile="'+
    esc(report.profileId)+'"><details><summary>선장 선택 4단계와 출생 경로의 직접 연결 · '+
    sources.length+'개 공급·출생 스크립트</summary>'+
    '<p class="fine">게임 초반의 성격 연구 선택을 원본 v.o2에서 확인합니다. 연구 ID만 같다는 이유로 서로 다른 이벤트/아이템 경로의 필수 조건을 합치지 않습니다. 나열된 조건은 실제 획득·실전 성장을 보장하지 않습니다.</p>'+
    '<p>시작 이후 연결되는 선장 선택 단계: '+stages.length+'개 · 직접 배제 관계로 확인된 선택지 '+
    stages.reduce((n,s)=>n+s.options.length,0)+'개. 이후 단계는 선행 연구를 완료해야 나타나며 모든 단계가 한 캠페인에서 동시에 열리는 것은 아닙니다.</p>'+
    stages.map((group,i)=>'<details class="origin-choice-stage"'+(i===0?' open':'')+'><summary>'+esc(group.label)+
      ' · '+group.options.length+'개 선택'+(group.reciprocal?' · 원본 양방향 배제 확인':' · 배제 검증 필요')+'</summary><p class="fine">'+
      '이 단계의 개방 연구: '+idLabel(group.source)+'. 실제 도달 조건은 각 선택의 연구 경로에서 확인합니다.</p>'+
      '<div class="origin-start-choice-options">'+group.options.map(id=>
      '<div class="origin-start-choice-option" data-start-choice="'+esc(id)+'">'+idLabel(id)+
      '<button type="button" data-trace-research-root="'+esc(id)+
      '">이 선택의 선행 연구</button></div>').join('')+
    '</div></details>').join('')+'<p class="fine">현재 표시된 잠정 성장 후보에서 확인한 선장 선택 연구: '+
    (report.selections.length?names(report.selections):'확인되지 않음')+
    '. 이는 전체 가능한 시작 선택의 최종 순위가 아닙니다.</p>'+
    '<h4>이 출생 방법과 재료 공급처에서 직접 요구/차단하는 선장 선택</h4>'+
    (sources.length?'<ol class="origin-start-source-list">'+entries+'</ol>':
      '<p class="fine">직접 출생·재료 지급 이벤트에서는 이 22개 선장 선택 연구를 요구하거나 차단하는 조건이 발견되지 않았습니다. 간접 연구·변신·시설 조건을 배제한 결과는 아닙니다.</p>')+
    '</details></section>';
}
