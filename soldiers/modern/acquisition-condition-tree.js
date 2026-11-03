// Conditional provenance from campaign start. NOT proof of campaign feasibility.
const arr=x=>Array.isArray(x)?x:[];
const uniq=x=>[...new Set(x.filter(Boolean))];
const leaf=(kind,id,note)=>({kind,id,note,children:[]});
const group=(kind,id,children,note='')=>({kind,id,children,note});
export function buildAcquisitionTree(p,d,{maxDepth=6,maxNodes=350}={}){
  let visited=0,truncated=false;
  const rules=d.researchRules||{};
  const go=(kind,id,stack=[],depth=0)=>{
    const key=kind+':'+id;
    if(stack.includes(key))return leaf('cycle',id,'이전 노드 반복 · 순환 중단');
    if(depth>=maxDepth||visited++>=maxNodes){truncated=true;return {...leaf('limit',id,'다음 단계 확인을 눌러 상위 연구·아이템을 계속 추적'),traceKind:kind};}
    const trail=[...stack,key];
    const research=x=>go('research',x,trail,depth+1);
    const item=x=>go('item',x,trail,depth+1);
    const conditions=(s)=>[
      ...arr(s.researchPositive).map(research),
      ...arr(s.researchNegative).map(x=>leaf('forbidden-research',x,'완료하면 차단')),
      ...arr(s.itemPositive).map(item),
      ...arr(s.itemNegative).map(x=>leaf('forbidden-item',x,'보유하면 차단')),
      ...['facilityPositive','facilityNegative','countryPositive','countryNegative',
        'regionPositive','regionNegative','soldierTypePositive','soldierTypeNegative',
        'pactPositive','pactNegative'].flatMap(k=>arr(s[k]).map(x=>leaf(k,x,k.endsWith('Negative')?'없어야 함':'필요 조건'))),
      ...Object.entries(s.otherConditions||{}).map(([k,v])=>leaf('other',k,JSON.stringify(v))),
      ...(s.firstMonth!=null||s.lastMonth!=null?[leaf('month',String(s.firstMonth??0),'가능 시점 '+(s.firstMonth??0)+'개월 ~ '+(s.lastMonth??'제한 없음')+'개월')]:[]),
      ...(s.executionOdds!=null?[leaf('chance',s.script,'스크립트 실행 판정 '+s.executionOdds+'%, 실제 지급 미확정')]:[]),
      ...(s.mode==='weighted'?[leaf('chance',s.script,'이벤트 가중 추첨 · 월별 확률 별도')]:[]),
      ...arr(s.oneTimeEarlier).map(x=>leaf('event',x,'선행 이벤트'))
    ];
    const scripts=(sources,prefix)=>group('or',prefix,arr(sources).length?arr(sources).map(s=>
      group('and',s.script,conditions(s),'해당 스크립트의 모든 조건')):[leaf('unknown',prefix,'스크립트 색인 없음')],'스크립트 대안 OR');
    if(kind==='research'){
      const r=rules[id];if(!r)return leaf('unknown-research',id,'연구 원본 없음');
      if(id==='STR_UNAVAILABLE')return leaf('unavailable',id,'일반 캠페인 접근 불가');
      const fixed=[...arr(r.requires).map(research),...arr(r.requiresBaseFunc).map(x=>leaf('facility',x,'기지 기능 필요'))];
      if(r.needItem)fixed.push(item(r.neededItem||id));
      const alternatives=[
        group('and','LAB:'+id,[...(arr(r.dependencies).length?[group('or','DEPENDENCIES:'+id,arr(r.dependencies).map(research),'원본 dependencies: 여러 조건 중 한 개 충족')]:[]),leaf(Number(r.cost)>0?'lab':'auto',id,Number(r.cost)>0?'연구량 '+r.cost+' · 연구실 접근 조건부':'비용 0 자동 처리 원천 미검증')],'일반 연구/자동 처리')
      ];
      for(const [src,source] of Object.entries(rules)){
        if(arr(source.unlocks).includes(id))alternatives.push(group('and','UNLOCK:'+src,[research(src)],'직접 해금 후보 · 무조건 필요 조건 유지'));
        if(arr(source.getOneFree).includes(id))alternatives.push(group('and','FREE:'+src,[research(src),leaf('chance',id,'무료 연구 추첨/선택')],'무료 지급 후보'));
        for(const [guard,list] of Object.entries(source.getOneFreeProtected||{}))
          if(arr(list).includes(id))alternatives.push(group('and','FREE:'+src+':'+guard,[research(src),research(guard),leaf('chance',id,'보호 무료 연구 선택')],'조건부 무료 지급'));
        if(source.lookup===id)alternatives.push(group('and','LOOKUP:'+src,[research(src)],'연결 연구'));
      }
      for(const e of arr(d.eventResearchSources?.[id]))alternatives.push(scripts(e.scripts,'EVENT:'+e.event));
      for(const m of arr(d.missionResearchSources?.[id])){
        const variants=scripts(m.scripts,'MISSION:'+m.deployment);
        for(const s of variants.children){
          if(m.startingCondition)s.children.push(leaf('mission-start-condition',m.startingCondition,'임무 고유 시작 조건 · 원본 ID, 추가 조건 검증 필요'));
          s.children.push(leaf('mission-win',m.deployment,'임무 생성·승리 후 연구 지급, 실전 검증 필요'));
        }
        alternatives.push(variants);
      }
      const blockers=Object.keys(rules).filter(x=>arr(rules[x].disables).includes(id));
      return group('research',id,[...fixed,group('or','RESEARCH_ROUTE:'+id,alternatives,'연구 확보 대안 OR')],blockers.length?'차단 선택: '+blockers.join(', '):'연구 공급/조건');
    }
    if(kind==='item'){
      const s=d.itemSupply?.[id];if(!s)return leaf('unknown-item',id,'물품 공급처 미색인');
      const alternatives=[];
      if(Number(s.buyCost)>0)alternatives.push(group('and','BUY:'+id,[...uniq([...arr(s.buyRequires),...arr(s.buyRequirements)]).map(research),leaf('funds',id,'구매가 '+s.buyCost+' · 상점 입고 미확인')],'구매'));
      for(const m of arr(s.manufacture))alternatives.push(group('and','MAKE:'+m.id,[...arr(m.requires).map(research),...Object.keys(m.requiredItems||{}).map(item),...arr(m.requiresBaseFunc).map(x=>leaf('facility',x,'제조 시설'))],'제조 · 산출량 '+m.quantity+' · 비용 '+m.cost));
      for(const e of arr(s.eventGrants)){
        const variants=scripts(e.scriptRoutes,'EVENT:'+e.event);
        for(const v of variants.children)v.children.push(leaf('event-reward',e.event,'보상 물품 '+arr(e.grants).map(g=>g.count||'추첨').join(', ')+'개 · 획득 미검증'));
        alternatives.push(variants);
      }
      for(const r of arr(s.researchGrants))alternatives.push(group('and','RESEARCH_ITEM:'+r.research,[research(r.research)],'연구 완료 시 '+r.count+'개 지급'));
      for(const r of arr(s.randomManufacture))alternatives.push(group('and','RANDOM:'+r.id,[...arr(r.requires).map(research),...Object.keys(r.requiredItems||{}).map(item),leaf('chance',r.id,'무작위 제조 '+r.weight+'/'+r.weightTotal)],'무작위 제조'));
      if(s.mapLoot?.sourceCount)alternatives.push(leaf('map',id,'지도 배치 '+s.mapLoot.sourceCount+'종 · 임무 출현·회수 조건 미조사'));
      return group('item',id,[group('or','ITEM_ROUTE:'+id,alternatives.length?alternatives:[leaf('unknown',id,'공급 원본 미확보')],'물품 대체 공급 경로')],'실물 획득 필요');
    }
    return leaf('unknown',id,'미지원 링크');
  };
  const common=[
    leaf('start','CAMPAIGN_START','게임 시작 · 연구 완료 0개'),
    ...Object.entries(p.acquisitionRequiredItems||{}).map(([id,n])=>group('and','MATERIAL:'+id,[go('item',id)],'출생 때 '+n+'개 실물 필요')),
    ...arr(p.requires).map(x=>go('research',x)),
    ...arr(p.requiresBaseFunc).map(x=>leaf('facility',x,'출생 기지 기능 필요'))
  ];
  if(p.sourceType==='event'){
    const ev=scriptsForBirth(p,go);
    common.push(ev);
  }
  if(p.cost)common.push(leaf('funds',p.id,'출생 비용 '+p.cost));
  return {profileId:p.id,root:group('and','BIRTH:'+p.id,common,'모두 필요 AND · 각 대안은 OR'),truncated,nodes:visited};
}
function scriptsForBirth(p,go){
  const scripts=arr(p.acquisitionEventScripts);
  return group('or','BIRTH_EVENT:'+p.sourceId,scripts.length?scripts.map(s=>group('and',s.script,[
    ...arr(s.researchPositive).map(x=>go('research',x)),
    ...arr(s.researchNegative).map(x=>leaf('forbidden-research',x,'완료 시 차단')),
    ...arr(s.itemPositive).map(x=>go('item',x)),
    ...arr(s.facilityPositive).map(x=>leaf('facility',x,'시설 필요')),
    ...arr(s.countryPositive).map(x=>leaf('country',x,'국가 조건')),
    ...arr(s.soldierTypePositive).map(x=>leaf('soldier',x,'병종 필요')),
    leaf('month',s.script,'시기 '+(s.firstMonth??0)+'~'+(s.lastMonth??'제한 없음')+'개월'),
    leaf('chance',s.script,'이벤트 스크립트 판정 '+(s.executionOdds??100)+'%')
  ],'출생 이벤트 스크립트')):[leaf('unknown-event',p.sourceId,'이벤트 스크립트 확인 필요')],'출생 이벤트 대체 경로');
}
export function buildAcquisitionSubtree(kind,id,data){
  if(kind!=='research'&&kind!=='item')throw Error('Unsupported condition continuation: '+kind);
  const p={id:'TRACE:'+kind+':'+id,requires:kind==='research'?[id]:[],
    acquisitionRequiredItems:kind==='item'?{[id]:1}:{},requiresBaseFunc:[],sourceType:'direct',cost:0};
  return buildAcquisitionTree(p,data);
}
export function renderAcquisitionTree(tree,{name=x=>x,esc=x=>String(x??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]))}={}){
  function render(n,depth=0){
    const heading=n.kind==='and'?'모두 필요 (AND)':n.kind==='or'?'대체 경로 (OR)':name(n.id);
    const title='<b>'+esc(heading)+'</b>'+(n.kind==='and'||n.kind==='or'?'':' <small>'+esc(n.id)+'</small>');
    if(!n.children.length)return '<li class="origin-tree-leaf" data-condition-kind="'+esc(n.kind)+'">'+title+' <small>'+esc(n.note)+'</small>'+(n.kind==='limit'?'<button type="button" data-trace-kind="'+esc(n.traceKind)+'" data-trace-id="'+esc(n.id)+'">다음 선행 조건 펼치기</button>':'')+'</li>';
    return '<li data-condition-kind="'+esc(n.kind)+'"><details class="origin-tree-branch"'+(depth<4?' open':'')+'><summary>'+title+' <small>'+n.children.length+'개</small></summary><p class="fine">'+esc(n.note)+'</p><ul>'+n.children.map(c=>render(c,depth+1)).join('')+'</ul></details></li>';
  }
  return '<section class="origin-complete-tree" data-complete-profile="'+esc(tree.profileId)+'"><h4>게임 시작 → 출생 전체 조건 트리</h4><p class="fine">연구·표본·아이템·이벤트·임무 승리·월/시설/분기 조건을 역추적합니다. AND와 OR를 구분하며, 실제 이벤트 발생·자금·아이템 획득·최종 실행 가능성을 확정하지 않습니다.</p>'+(tree.truncated?'<p class="origin-tree-warning">탐색 상한 도달: 접힌 경로를 불가능으로 판정하지 않습니다.</p>':'')+'<ul class="origin-tree-root">'+render(tree.root)+'</ul></section>';
}