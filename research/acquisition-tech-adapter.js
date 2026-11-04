// Source-version-isolated acquisition graph adapter for the legacy Research DB.
// The presentation engine is shared with Soldiers; the rules are NOT.
// All positive/negative gates originate in public/items/data/research-chunks.
const list=x=>Array.isArray(x)?x:[];
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({
  '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
}[c]));
const node=(kind,id,topicId=id,note='')=>({kind,id,topicId,note,children:[]});
const group=(kind,prefix,id,note='')=>node(kind,prefix+':'+id,id,note);

export function createLegacyResearchTechAdapter(index,goalId){
  if(index?.meta?.schemaVersion!==1||!index?.topics?.[goalId])
    throw Error('연구 원본 버전 또는 선택한 연구 ID가 없습니다: '+goalId);
  const rules=index.topics,unlock=new Map(),free=new Map(),blockedBy=new Map();
  const add=(map,id,value)=>{const xs=map.get(id)||[];xs.push(value);map.set(id,xs)};
  for(const [source,t] of Object.entries(rules)){
    for(const target of list(t.unlocks))add(unlock,target,{source});
    for(const target of list(t.getOneFree))add(free,target,{source,guard:null});
    for(const [guard,ids] of Object.entries(t.getOneFreeProtected||{}))
      for(const target of list(ids))add(free,target,{source,guard});
    for(const target of list(t.disables))add(blockedBy,target,source);
  }
  const label=id=>rules[id]?.name||id;
  const term=(id,n)=>label(id)+(n?' · '+n:'');
  const research=(id,from)=>node('research',id,from||id);
  // Unlocks from a topic that disables either the goal or itself are not
  // stable alternatives. Keep them in source evidence, not in the OR menu.
  const unsafe=x=>{
    const exclusions=list(rules[x.source]?.disables);
    return exclusions.includes(x.target)||exclusions.includes(x.source);
  };
  const goodUnlock=id=>list(unlock.get(id)).filter(x=>!unsafe({...x,target:id}));
  const badUnlock=id=>list(unlock.get(id)).filter(x=>unsafe({...x,target:id}));
  function expand(n){
    const t=rules[n.id],id=n.topicId||n.id;
    if(n.kind==='research'){
      if(!t)return {node:n,relation:'chain',children:[
        node('unindexed-research',n.id,id,'원본에 이 연구 ID가 없습니다. 경로를 완성한 것으로 취급할 수 없습니다.')
      ]};
      const methods=[group('and','LAB',id,'원본 연구실·연구 플래그 실행 경로')];
      for(const {source,guard} of list(free.get(id))){
        const item=group('and','FREE',id+':'+source+(guard?':'+guard:''),'무료 연구 후보 · 실제 지급/확률 미확정');
        item.topicId=id;
        item.source=source;item.guard=guard;
        methods.push(item);
      }
      return {node:n,relation:methods.length>1?'or':'chain',children:methods};
    }
    if(n.kind==='and'&&n.id.startsWith('LAB:')){
      const r=rules[id];if(!r)return {node:n,relation:'chain',children:[]};
      const gates=[
        ...list(r.requires).map(x=>research(x)),
        ...list(r.requiresBaseFunc).map(x=>node('facility-function',x,id,
          '연구실에서 필요한 기지 기능 · 제공 시설의 해금은 별도로 확인')),
        ...(r.needItem?[node('item',r.neededItem||id,id,
          r.destroyItem?'연구 표본 소모 · 실제 수량과 획득 경로는 별도 확인':
            '연구 표본 필요 · 실물 보유 여부 및 획득 경로 별도 확인')]:[])
      ];
      if(list(r.dependencies).length||list(unlock.get(id)).length)
        gates.push(group('or','ACCESS',id,
          'dependencies 전체 충족 또는 안전한 unlocks 출처 중 하나. requires는 별도 필수'));
      for(const source of list(blockedBy.get(id))){
        // Do not present a directional disable as a compulsory positive research.
        // This negative gate warns that current completion state can close the route.
        gates.push(node('forbidden-research',source,id,
          term(source,'완료하면 목표를 disables. 재활성화·실제 시간순 이력은 별도 확인')));
      }
      gates.push(node('research-cost',id,id,r.cost==null?
        '원본에 연구량이 없습니다. 이벤트/임무 상태 플래그일 가능성을 검증해야 합니다.':
        Number(r.cost)===0?'연구량 0 · 자동 처리/실행 시점 별도 확인':
          '원본 연구량 '+Number(r.cost).toLocaleString('ko-KR')+' · 실제 수행 및 접근은 확정 아님'));
      return {node:n,relation:'and',children:gates};
    }
    if(n.kind==='or'&&n.id.startsWith('ACCESS:')){
      const r=rules[id];if(!r)return {node:n,relation:'chain',children:[]};
      const methods=[];
      if(list(r.dependencies).length)methods.push(group('and','DEPENDENCIES',id,
        '원본 dependencies 전체를 완료 (AND)'));
      else methods.push(node('baseline-access',id,id,'일반 dependencies 없음 · 즉시 연구 가능하다는 뜻은 아님'));
      for(const entry of goodUnlock(id)){
        const m=group('and','UNLOCK',id+':'+entry.source,
          '이 출처 완료로 dependencies 우회 · requires/표본/시설은 계속 필요');
        m.topicId=id;m.source=entry.source;methods.push(m);
      }
      return {node:n,relation:methods.length>1?'or':'chain',children:methods};
    }
    if(n.kind==='and'&&n.id.startsWith('DEPENDENCIES:')){
      return {node:n,relation:'and',children:list(rules[id]?.dependencies).map(x=>research(x))};
    }
    if(n.kind==='and'&&n.id.startsWith('UNLOCK:')){
      return {node:n,relation:'and',children:[research(n.source)]};
    }
    if(n.kind==='and'&&n.id.startsWith('FREE:')){
      const children=[research(n.source)];
      if(n.guard)children.push(research(n.guard));
      children.push(node('random-free',n.source,id,
        'getOneFree 또는 보호된 무료 지급 후보 · 획득 보장 및 확률 자료 없음'));
      return {node:n,relation:'and',children};
    }
    return {node:n,relation:'chain',children:[]};
  }
  function describe(n){
    const t=rules[n.id],id=n.topicId||n.id,kind=n.kind;
    if(kind==='research'){
      return {label:label(n.id),category:'research',badge:'연구',
        detail:t?(t.cost==null?'연구량 미지정 · 별도 조건 확인':'원본 연구량 '+t.cost)+
        (blockedBy.get(n.id)?.length?' · 차단 출처 '+blockedBy.get(n.id).length+'개':''):
          '연구 원본 미색인 · 검증 필요'};
    }
    if(kind==='and'&&n.id.startsWith('LAB:'))
      return {label:'원본 연구/플래그 완료 경로',category:'and',badge:'모두 필요',
        detail:'requires·표본·시설과 연구 선행을 함께 확인 · 실제 실현은 미확정'};
    if(kind==='and'&&n.id.startsWith('DEPENDENCIES:'))
      return {label:'명목 선행 연구 모두 완료',category:'and',badge:'AND',
        detail:'원본 dependencies '+list(rules[id]?.dependencies).length+'개 전부 필요 · 단, 명시적 unlocks 우회 가능'};
    if(kind==='or'&&n.id.startsWith('ACCESS:'))
      return {label:'선행 연구 또는 직접 해금',category:'or',badge:'하나 선택',
        detail:'일반 dependencies를 모두 충족하거나 별도 unlocks로 우회 (requires 우회 불가)'+
          (badUnlock(id).length?' · 자기 충돌 해금 '+badUnlock(id).length+'개는 제외':'')};
    if(kind==='and'&&n.id.startsWith('UNLOCK:'))
      return {label:'직접 해금: '+label(n.source),category:'research',badge:'우회 후보',
        detail:'해당 연구의 unlocks 효과 · 목표 연구 완료를 의미하지 않음'};
    if(kind==='and'&&n.id.startsWith('FREE:'))
      return {label:'무료 지급 후보: '+label(n.source),category:'random',badge:'추첨',
        detail:(n.guard?'보호 조건 '+label(n.guard)+' 필요 · ':'')+
          'getOneFree는 후보 중 지급 · 실제 획득 보장 아님'};
    if(kind==='baseline-access')return {label:'일반 선행 연구 없음',category:'start',badge:'기준',
      detail:'원본 dependencies가 비어 있음 · 실물·기지·이벤트는 별도'};
    if(kind==='research-cost')return {label:rules[id]?.cost==null?'연구량 미지정':'연구 수행',
      category:rules[id]?.cost==null?'warning':'condition',badge:'원본 연구량',detail:n.note};
    if(kind==='item')return {label:'연구 표본: '+label(n.id),category:'item',badge:'실물 확인',detail:n.note};
    if(kind==='facility-function')return {label:'기지 기능: '+n.id,category:'facility',badge:'시설 조건',detail:n.note};
    if(kind==='forbidden-research')return {label:'완료 시 차단: '+label(n.id),
      category:'blocked',badge:'금지 조건',detail:n.note};
    if(kind==='random-free')return {label:'무료 연구 추첨 결과',category:'random',
      badge:'확률 미확인',detail:n.note};
    return {label:label(n.id),category:'warning',badge:'검증 필요',detail:n.note};
  }
  function renderEvidence(selected){
    const id=selected?.topicId||selected?.id||goalId,t=rules[id];
    if(!t)return '<p>해당 원본 연구 ID를 찾을 수 없습니다: <code>'+esc(id)+'</code></p>';
    const source={
      id:t.id,dependencies:t.dependencies,requires:t.requires,requiresBaseFunc:t.requiresBaseFunc,
      needItem:t.needItem,neededItem:t.neededItem,destroyItem:t.destroyItem,cost:t.cost,
      unlocks:t.unlocks,getOneFree:t.getOneFree,getOneFreeProtected:t.getOneFreeProtected,
      lookup:t.lookup,disables:t.disables,disabledBy:list(blockedBy.get(id)),
      unsafeUnlockSources:badUnlock(id).map(x=>x.source),
      reenables:t.reenables,sourceFiles:t.sourceFiles
    };
    return '<div class="tech-adapter-proof"><p><b>'+esc(label(id))+'</b> · X-Piratez '+
      esc(index.meta.sourceVersion)+' / OXCE '+esc(index.meta.requiredEngine)+
      ' 원본 · ID <code>'+esc(id)+'</code></p>'+
      '<p>이 표는 기존 연구 룰의 직접 필드입니다. 직접 지급 이벤트·임무와 실제 캠페인 시간순 실현성은 별도 검증 대상입니다.</p>'+
      '<pre>'+esc(JSON.stringify(source,null,2))+'</pre></div>';
  }
  const linkForNode=n=>n?.kind==='item'&&n.id?
    {href:'../items/#item='+encodeURIComponent(n.id),label:'아이템 DB에서 실물 공급 경로 확인'}:null;
  return {root:research(goalId),expand,describe,renderEvidence,linkForNode,
    notice:'이 연구 경로는 X-Piratez '+index.meta.sourceVersion+
      ' / OXCE '+index.meta.requiredEngine+' 원본입니다. 2.1 병종 DB와 조건을 합치지 않습니다. 이벤트·임무 직접 지급은 일부 미색인.'};
}
