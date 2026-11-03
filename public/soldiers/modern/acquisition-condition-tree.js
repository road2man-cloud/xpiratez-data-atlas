// Source-provenanced, non-certifying acquisition condition explorer.
// All routes are alternatives unless explicitly under an AND node.
// Laboratory prerequisites do not automatically apply to event/mission grants.
const arr=x=>Array.isArray(x)?x:[];
const uniq=a=>[...new Set(a.filter(Boolean))];
const leaf=(kind,id,note='',extra={})=>({kind,id,note,children:[],...extra});
const group=(kind,id,children,note='')=>({kind,id,note,children});
const lookupCache=new WeakMap();
function lookups(data){
  const rules=data.researchRules||{};
  if(lookupCache.has(rules))return lookupCache.get(rules);
  const reverse=new Map(),facilitiesByFunction=new Map(),sourcesByBody=new Map();
  const add=(map,key,value)=>{const entries=map.get(key)||[];entries.push(value);map.set(key,entries);};
  for(const [source,r] of Object.entries(rules)){
    for(const id of arr(r.unlocks))add(reverse,id,{kind:'unlock',source});
    for(const id of arr(r.getOneFree))add(reverse,id,{kind:'free',source});
    for(const [guard,ids] of Object.entries(r.getOneFreeProtected||{}))
      for(const id of arr(ids))add(reverse,id,{kind:'free-protected',source,guard});
    if(r.lookup)add(reverse,r.lookup,{kind:'lookup',source});
  }
  for(const [id,facility] of Object.entries(data.baseFacilityFunctions||{}))
    for(const func of arr(facility.provides))add(facilitiesByFunction,func,id);
  for(const p of arr(data.profiles))add(sourcesByBody,p.soldierType,p);
  const result={reverse,facilitiesByFunction,sourcesByBody};
  lookupCache.set(rules,result);return result;
}
export function buildAcquisitionTree(profile,data,{maxDepth=3,maxNodes=32}={}){
  if(!profile||!data?.researchRules)throw Error('출생 원본 또는 연구 원본 누락');
  const rules=data.researchRules,{reverse,facilitiesByFunction,sourcesByBody}=lookups(data);
  let count=0,truncated=false;
  const bounded=(kind,id,trail,depth,create)=>{
    const key=kind+':'+id;
    if(trail.includes(key))return leaf('cycle',id,'같은 경로 내 재방문 · 중복/순환은 새 획득으로 인정하지 않음');
    if(depth>=maxDepth||count>=maxNodes){
      truncated=true;
      return leaf('limit',id,'다음 선행 조건에서 계속 추적 가능 · 검증 완료가 아님',{traceKind:kind});
    }
    count++;
    return create([...trail,key]);
  };
  const go=(kind,id,trail=[],depth=0)=>bounded(kind,id,trail,depth,next=>{
    const descend=(k,id)=>go(k,id,next,depth+1);
    const research=id=>descend('research',id);
    const item=id=>descend('item',id);
    const facility=id=>descend('facility-type',id);
    const baseFunction=id=>descend('facility-function',id);
    const soldier=id=>descend('soldier-body',id);
    const scriptConditions=(s)=>{
      const out=[];
      for(const id of arr(s.researchPositive))out.push(research(id));
      for(const id of arr(s.researchNegative))out.push(leaf('forbidden-research',id,'완료되어 있으면 이 이벤트/임무 경로 차단'));
      for(const id of arr(s.itemPositive))out.push(item(id));
      for(const id of arr(s.itemNegative))out.push(leaf('forbidden-item',id,'소지 시 경로 차단'));
      for(const id of arr(s.facilityPositive))out.push(facility(id));
      for(const id of arr(s.facilityNegative))out.push(leaf('forbidden-facility',id,'건설되어 있으면 경로 차단'));
      for(const id of arr(s.soldierTypePositive))out.push(soldier(id));
      for(const id of arr(s.soldierTypeNegative))out.push(leaf('forbidden-soldier',id,'보유하면 경로 차단'));
      for(const [key,yes,no] of [
        ['country','해당 국가에 기지 보유 / 시작 지역 선택','해당 국가 기지가 없어야 함'],
        ['region','해당 지역에 기지 보유','해당 지역 기지가 없어야 함'],
        ['pact','해당 국가와 협정 조건','해당 협정이 없어야 함']
      ]){
        for(const id of arr(s[key+'Positive']))out.push(leaf(key,id,yes));
        for(const id of arr(s[key+'Negative']))out.push(leaf('forbidden-'+key,id,no));
      }
      for(const [key,value] of Object.entries(s.otherConditions||{}))
        out.push(leaf(key,key,String(value)+(key==='minScore'?' 이상 평가점수':key==='maxScore'?' 이하 평가점수':
          key==='minFunds'?' 이상 보유 자금':key==='maxFunds'?' 이하 보유 자금':' · 기타 이벤트 조건')));
      if(s.firstMonth!=null||s.lastMonth!=null)
        out.push(leaf('month',s.script||id,'발생 가능 기간: '+String(s.firstMonth??0)+'개월부터 '+
          (s.lastMonth==null?'종료 제한 미기록':s.lastMonth+'개월까지')));
      if(s.executionOdds!=null)
        out.push(leaf('rng',s.script||id,'스크립트 실행 판정 '+s.executionOdds+'% · 개별 보상 확률이 아님'));
      if(s.mode==='weighted'||arr(s.monthWeights).length)
        out.push(leaf('weighted',s.script||id,'월별 이벤트/임무 후보 가중치 존재 · 확정 출현 아님'));
      if(s.mode==='oneTimeRandom')
        out.push(leaf('rng',s.script||id,'일회성 추첨 결과가 해당 이벤트여야 함'));
      for(const id of arr(s.oneTimeEarlier))out.push(leaf('event-order',id,'먼저 발생해야 하는 이벤트'));
      return out;
    };
    const scripts=(id,entries,extras=()=>[],note='서로 다른 스크립트 대안 OR')=>
      group('or',id,arr(entries).length?arr(entries).map(s=>group('and',s.script,
        [...scriptConditions(s),...extras(s)],'이 스크립트에 필요한 조건을 함께 충족')):[
        leaf('unindexed-script',id,'지급 근거는 있으나 발생 스크립트가 색인되지 않음')],note);
    if(kind==='research'){
      const r=rules[id];
      if(!r)return leaf('unindexed-research',id,'연구 원본 규칙 누락 · 이벤트/임무 여부 별도 검증');
      if(id==='STR_UNAVAILABLE')return leaf('unavailable',id,'내부 전용 연구 · 일반 캠페인 수행 경로 없음');
      const requirements=[
        ...arr(r.requires).map(research),
        ...arr(r.requiresBaseFunc).map(baseFunction)
      ];
      if(r.needItem){
        const sample=r.neededItem||id;
        requirements.push(data.itemSupply?.[sample]||data.sourceItemIds?.has(sample)?
          item(sample):leaf('unbacked-sample',sample,'연구실에 필요한 표본의 실물 공급 근거 없음 · 이벤트 직접 지급에는 불필요'));
      }
      const paths=[
        ...requirements,
        ...((arr(r.dependencies).length||arr(reverse.get(id)).some(x=>x.kind==='unlock'))?
          [group('or','ACCESS:'+id,[
            ...(arr(r.dependencies).length?[
              group('and','ALL_DEPENDENCIES:'+id,arr(r.dependencies).map(research),
                '원본 dependencies 전부 완료 (AND) · 아래 각 연구를 개별 OR로 취급하지 않음')
            ]:[leaf('baseline-access',id,
              '원본 dependencies 미지정 · 초기 연구실 노출 가능성은 실제 해금 판정 필요')]),
            ...arr(reverse.get(id)).filter(x=>x.kind==='unlock').map(x=>
              group('and','UNLOCK:'+x.source,[research(x.source)],
                '연구 직접 unlocks 우회 개방 · dependencies 충족 대안이지만 연구 실행 및 별도 표본·시설 조건은 유지'))
          ],'일반 dependencies 전부 완료(AND) 또는 별도 unlocks 우회(OR)')]:[]),
        leaf(Number(r.cost)>0?'lab':'auto',id,Number(r.cost)>0?
          '연구량 '+r.cost+' 수행 · 표본/시설/자금은 실제 확보 확인 필요':
          '연구량 0 · 자동 처리 시점/연구 큐를 실제 재생해야 함')
      ];
      const methods=[group('and','LAB:'+id,paths,'연구실·자동 연구 경로 · 이 방법에만 위 조건 적용')];
      for(const choice of arr(reverse.get(id))){
        if(choice.kind==='unlock')continue;
        methods.push(group('and',choice.kind.toUpperCase()+':'+choice.source,
          [research(choice.source),...(choice.guard?[research(choice.guard)]:[]),
            ...(choice.kind.startsWith('free')?[leaf('random-free',id,'무료 연구 후보 선택/추첨 · 지급 보장 없음')]:[])],
          choice.kind==='lookup'?'완료 후 lookup 연결 연구':'연구 완료 후 무료 지급 대안'));
      }
      for(const event of arr(data.eventResearchSources?.[id]))
        methods.push(scripts('EVENT:'+event.event,event.scripts,
          ()=>event.choiceCount>1?[leaf('research-choice',id,'이벤트 연구 '+event.choiceCount+'종 중 무작위 선택')]:
            [leaf('research-award',event.event,'이 이벤트의 연구 지급 · 발생 미확정')],
          '연구를 직접 지급하는 이벤트 (연구실 표본 조건 적용 금지)'));
      for(const mission of arr(data.missionResearchSources?.[id]))
        methods.push(scripts('MISSION:'+mission.deployment,mission.scripts,()=>[
          ...(mission.startingCondition?[leaf('mission-start',mission.startingCondition,'임무 전용 시작 조건 ID · 연구로 단정하지 않음')]:[]),
          leaf('mission-victory',mission.deployment,'실제 임무 등장·승리 후 무료 연구 지급 · 미검증')
        ],'임무 승리 후 연구 지급 (연구실 표본 조건 적용 금지)'));
      const blocked=Object.entries(rules).filter(([,candidate])=>arr(candidate.disables).includes(id))
        .map(([source])=>source);
      return group('research',id,[group('or','RESEARCH_METHOD:'+id,methods,
        '연구 획득 방법별 OR · 연구실 전용 표본을 이벤트 지급에 강제하지 않음')],
        (id.startsWith('STR_CAPTAINS_RANK_')?'캡틴 계급 연구 플래그 · 이벤트/점수/월 조건 확인. ':'')+
        (blocked.length?'이 연구를 차단하는 완료 연구: '+blocked.join(', '):'현재 출처별 연구 접근 조건'));
    }
    // Paginate source methods rather than expanding every loot block, event
    // and manufacturer into millions of DOM bytes. Each page remains linked
    // to exactly one original item and preserves all alternative method IDs.
    const itemPageSize=2;
    const pageLink=(category,itemId,total,offset,shown)=>offset+shown<total?
      leaf('limit',itemId,'추가 '+(total-offset-shown)+'개 중 다음 '+Math.min(itemPageSize,total-offset-shown)+
        '개 펼치기 · 현재 '+(offset+shown)+'/'+total+'개 원본 공급 경로 확인',
        {traceKind:'item-method-'+category,traceOffset:offset+shown}):null;
    const mapScripts=(materialId,block,index,offset=0)=>{
      const paths=arr(block.missionPaths),selected=paths.slice(offset,offset+itemPageSize);
      const children=selected.map(path=>group('and',path.script,
        [...scriptConditions(path),
          leaf('mission-generation',path.mission||path.deployment,
            '임무 출현·전장 생성 필요: '+path.deployment),
          leaf('map-recovery',block.block,'지형 '+block.terrain+' / 블록 '+block.block+
            ' · '+(block.placement==='fixedOnBlock'?'블록에 고정 배치':'블록에서 무작위 아이템')+
            ' · 블록 선택·생존·회수 필요')],
        '임무 스크립트 '+path.script+' · 보상 확정 아님'));
      const next=pageLink('map-scripts',materialId+'@'+index,paths.length,offset,selected.length);
      if(next)children.push(next);
      if(!paths.length)children.push(leaf('map-unlinked',block.terrain,'지도 블록과 실제 임무 출현 스크립트 연결 미색인'));
      return group('or','MAP_MISSIONS:'+index+':'+offset,children,
        '이 지도 블록으로 이어지는 임무별 스크립트 OR');
    };
    const categoryMethods=(category,itemId,s,offset=0)=>{
      if(category==='buy'){
        if(!(Number(s.buyCost)>0))return [];
        return [group('and','BUY:'+itemId,
          [...uniq([...arr(s.buyRequires),...arr(s.buyRequirements)]).map(research),
            leaf('funds',itemId,'구매비 '+s.buyCost+' · 실제 상점 재고는 확인 필요')],
          '물품 구매 · 조건/자금')];
      }
      if(category==='map'){
        const loot=s.mapLoot||{},all=arr(loot.sources),subset=all.slice(offset,offset+itemPageSize);
        const nodes=subset.map((block,i)=>{
          const index=offset+i;
          return group('and','MAP_BLOCK:'+block.block+':'+index,
            [mapScripts(itemId,block,index),
              leaf('map-selection',block.block,
                '블록 배치 '+block.blockSelection+
                (block.missionPathsTruncated?' · 이 블록의 임무 스크립트 색인이 잘림':''))],
            '지도 '+block.terrain+' / 블록 '+block.block+' · 실제 임무 등장/전리품 미검증');
        });
        const next=pageLink('map',itemId,all.length,offset,subset.length);
        if(next)nodes.push(next);
        if(offset+subset.length>=all.length&&loot.possiblyTruncated)
          nodes.push(leaf('unindexed-map',itemId,'원본 지도 공급처 '+loot.sourceCount+'개 중 '+all.length+
            '개만 색인됨 · 색인 밖 경로를 불가능으로 판단하지 않음'));
        return nodes.length?[group('or','MAP_LOOT:'+itemId+':'+offset,nodes,
          '지도 전리품 대안 · 전장 생성/회수 필수')]:[];
      }
      const collections={
        manufacture:arr(s.manufacture),random:arr(s.randomManufacture),
        event:arr(s.eventGrants),research:arr(s.researchGrants)
      };
      const all=collections[category]||[];
      const selected=all.slice(offset,offset+itemPageSize);
      const nodes=selected.map(row=>{
        if(category==='manufacture')return group('and','MAKE:'+row.id,
          [...arr(row.requires).map(research),
            ...arr(row.requiresBaseFunc).map(baseFunction),
            ...Object.entries(row.requiredItems||{}).map(([ingredient,quantity])=>
              group('and','MATERIAL:'+ingredient,[item(ingredient)],'제조에 '+quantity+'개 필요')),
            leaf('funds',row.id,'제조비 '+row.cost)],
          '제조 '+row.id+' · 산출 '+row.quantity+'개');
        if(category==='random')return group('and','RANDOM:'+row.id,
          [...arr(row.requires).map(research),...arr(row.requiresBaseFunc).map(baseFunction),
            ...Object.keys(row.requiredItems||{}).map(item),
            leaf('rng',row.id,'무작위 생산 선택 가중치 '+row.weight+'/'+row.weightTotal)],
          '무작위 물품 제조 · 획득 확정 아님');
        if(category==='research')return group('and','RESEARCH_ITEM:'+row.research,
          [research(row.research)],'연구 완료 시 '+row.count+'개 보상');
        return scripts('EVENT:'+row.event,row.scriptRoutes,()=>[
          leaf('item-reward',row.event,'지급 내용: '+arr(row.grants).map(g=>
            g.mode==='every'||g.mode==='everyMulti'?g.count+'개 고정':'무작위/가중 지급').join(' + ')),
          ...(arr(row.directResearchAwards).length?[
            leaf('parallel-research',row.event,'같은 이벤트에서 연구 '+arr(row.directResearchAwards).join(', ')+
              '도 지급 · 연구실 표본 별도 요구 아님')]:[])
        ],'이벤트 지급 · 발생 스크립트는 OR');
      });
      const next=pageLink(category,itemId,all.length,offset,selected.length);
      if(next)nodes.push(next);
      return nodes;
    };
    if(kind==='item-method-map-scripts'){
      const sep=id.lastIndexOf('@'),itemId=id.slice(0,sep);
      const index=Number(id.slice(sep+1)),s=data.itemSupply?.[itemId];
      const block=s?.mapLoot?.sources?.[index];
      if(sep<0||!Number.isSafeInteger(index)||!block)
        return leaf('unknown',id,'추가 임무 스크립트 원본 범위 불일치');
      return mapScripts(itemId,block,index,profile.traceTarget?.offset||0);
    }
    if(kind.startsWith('item-method-')){
      const category=kind.slice('item-method-'.length),s=data.itemSupply?.[id];
      if(!s)return leaf('unindexed-item',id,'추가 페이지의 물품 원본 누락');
      return group('or','ITEM_PAGE:'+category+':'+id+':'+(profile.traceTarget?.offset||0),
        categoryMethods(category,id,s,profile.traceTarget?.offset||0),
        '동일 아이템의 추가 '+category+' 공급처 (이어지는 대안 OR)');
    }
    if(kind==='item'){
      const s=data.itemSupply?.[id];
      if(!s)return leaf('unindexed-item',id,'아이템 공급 기록 미색인 · 공급 불가능 확정 아님');
      const categories=['buy','event','manufacture','random','research','map'];
      const methods=categories.flatMap(category=>categoryMethods(category,id,s));
      return group('item',id,[group('or','ITEM_METHOD:'+id,
        methods.length?methods:[leaf('unknown-supply',id,'아직 연결된 공급처 없음 · 불가능 판정 아님')],
        '아이템 획득 방법별 OR · 남은 대안은 각 버튼에서 계속 펼칠 수 있음')],
        '실물 아이템 확보 · 연구와 별개의 재료 조건');
    }
    if(kind==='facility-function'){
      const providers=arr(facilitiesByFunction.get(id));
      return group('facility-function',id,[group('or','PROVIDERS:'+id,
        providers.length?providers.map(facility):[
          leaf('unknown-facility',id,'기능 제공 시설 미색인 · 확보 증명 필요')],
        '이 기지 기능을 제공하는 시설들 중 하나')],'기지 기능 · 시설 유형이 아닌 기능 ID');
    }
    if(kind==='facility-type'){
      const f=data.baseFacilityFunctions?.[id];
      if(!f)return leaf('facility-type',id,'시설 보유 조건 · 시설 규칙 미색인');
      return group('facility-type',id,[
        ...arr(f.research).map(research),
        ...arr(f.requires).map(baseFunction),
        leaf('facility-built',id,'실제 시설 건설·완공·동일 기지 보유 필요')
      ],'시설 개방 연구/기능과 건설을 모두 충족');
    }
    if(kind==='soldier-body'){
      const births=arr(sourcesByBody.get(id));
      const limit=8;
      return group('soldier-body',id,[
        group('or','BODY_SOURCE:'+id,births.length?[
          ...births.slice(0,limit).map(p=>group('and','BIRTH_SOURCE:'+p.id,
            [...arr(p.requires).map(research),
              ...Object.keys(p.acquisitionRequiredItems||{}).map(item),
              leaf('birth-source',p.id,'출생 이벤트/제조 실행 · 이력·능력치·재료는 출생처별 구분')],'해당 병종의 출생처 후보')),
          ...(births.length>limit?[leaf('source-limit',id,
            '출생처 '+births.length+'개 중 '+limit+'개만 펼침 · 전수 인증 불가')]:[])
        ]:[leaf('unknown-body',id,'직접 출생처 미등록 · 변신 경로 조사 필요')],
        '이 병종의 보유가 필요 · 출생처별 OR')
      ],'유닛 보유 조건, 단순 연구 완료만으로 충족되지 않음');
    }
    return leaf('unknown',id,'해당 연결 유형을 해석할 규칙 없음');
  });
  const initial=[
    leaf('start','CAMPAIGN_START','게임 시작: 완료 연구 0개. 국가·난이도·캡틴 초기 선택은 해당 조건 노드에서 검증'),
    ...Object.entries(profile.acquisitionRequiredItems||{}).map(([id,n])=>
      group('and','REQUIRED_ITEM:'+id,[go('item',id)],'출생 제조에 '+n+'개 실물 필요')),
    ...arr(profile.requires).map(id=>go('research',id)),
    ...arr(profile.requiresBaseFunc).map(id=>go('facility-function',id)),
    ...(profile.traceTarget?[go(profile.traceTarget.kind,profile.traceTarget.id)]:[])
  ];
  if(profile.sourceType==='event'){
    const scripts=arr(profile.acquisitionEventScripts);
    // Direct birth scripts must retain their own month/guard/choice evidence.
    const scriptNodes=scripts.length?scripts.map(s=>{
      // Provide visible first-order conditions even at shallow root depth.
      const extras=[
        ...arr(s.researchPositive).map(id=>go('research',id)),
        ...arr(s.researchNegative).map(id=>leaf('forbidden-research',id,'완료 시 출생 이벤트 차단')),
        ...arr(s.itemPositive).map(id=>go('item',id)),
        ...arr(s.itemNegative).map(id=>leaf('forbidden-item',id,'보유 시 출생 이벤트 차단')),
        ...arr(s.facilityPositive).map(id=>go('facility-type',id)),
        ...arr(s.facilityNegative).map(id=>leaf('forbidden-facility',id,'시설 존재 시 차단')),
        ...arr(s.countryPositive).map(id=>leaf('country',id,'시작/기지 국가 조건')),
        ...arr(s.countryNegative).map(id=>leaf('forbidden-country',id,'해당 국가 기지가 없어야 함')),
        ...arr(s.regionPositive).map(id=>leaf('region',id,'기지 지역 조건')),
        ...arr(s.regionNegative).map(id=>leaf('forbidden-region',id,'해당 지역 기지가 없어야 함')),
        ...arr(s.soldierTypePositive).map(id=>go('soldier-body',id)),
        ...arr(s.soldierTypeNegative).map(id=>leaf('forbidden-soldier',id,'보유 시 차단')),
        ...arr(s.pactPositive).map(id=>leaf('pact',id,'협정 조건')),
        ...arr(s.pactNegative).map(id=>leaf('forbidden-pact',id,'협정이 없어야 함')),
        ...Object.entries(s.otherConditions||{}).map(([key,v])=>leaf(key,s.script,String(v)+' · 추가 이벤트 조건')),
        leaf('month',s.script,(s.firstMonth??0)+'개월부터 '+(s.lastMonth??'종료 제한 없음')+'까지'),
        leaf('rng',s.script,'스크립트 실행 '+(s.executionOdds??100)+'% · 지급 보증 아님')
      ];
      return group('and',s.script,[...extras,
        leaf('birth-award',profile.sourceId,'이 이벤트 발생 시 '+(profile.spawnedPersons??1)+'명 생성 · 확률/실측 미확인')],
        '출생 이벤트의 개별 스크립트 조건');
    }):[leaf('unknown-event',profile.sourceId,'직접 출생 이벤트 스크립트가 색인되지 않음')];
    initial.push(group('or','BIRTH_EVENT:'+profile.sourceId,scriptNodes,
      '출생 이벤트 원본 스크립트 대안 OR'));
  }
  if(profile.cost)initial.push(leaf('funds',profile.id,'출생 고용/제조 비용 '+profile.cost));
  if(!profile.traceTarget)initial.push(leaf('origin-history',profile.id,'최초 이력: '+
    Object.keys(profile.previousTransformations||{}).filter(id=>
      Number(profile.previousTransformations[id])>0).join(', ')+
    ' · 출생 당시 갖춘 이력이며 이후 훈련을 뜻하지 않음'));
  return {profileId:profile.id,root:group('and','BIRTH:'+profile.id,initial,
    profile.traceTarget?'선택한 조건 노드의 추가 경로 · 상위 출생 조건과 합쳐 보아야 함':
      '하나의 출생 방법 · 반드시 필요한 조건은 AND, 공급처 대안은 OR'),truncated,nodes:count,
    verifiedCampaign:false};
}
export function buildAcquisitionSubtree(kind,id,data,offset=0){
  if(!['research','item','facility-type','facility-function','soldier-body'].includes(kind)&&
    !kind.startsWith('item-method-'))throw Error('추적할 수 없는 조건 종류 '+kind);
  const p={id:'TRACE:'+kind+':'+id,sourceType:'direct',requires:[],requiresBaseFunc:[],
    acquisitionRequiredItems:{},cost:0,previousTransformations:{},
    traceTarget:{kind,id,offset}};
  return buildAcquisitionTree(p,data,{maxDepth:4,maxNodes:45});
}
export function renderAcquisitionTree(tree,{name=x=>x,esc=x=>String(x??'').replace(/[&<>"]/g,c=>
  ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]))}={}){
  const label=n=>n.kind==='and'?'모두 필요 (AND)':n.kind==='or'?'대체 경로 (OR)':
    n.kind==='research'&&n.id.startsWith('STR_CAPTAINS_RANK_')?'캡틴 계급 '+n.id.slice(-2):
    name(n.id);
  function view(n,depth=0){
    const title='<strong>'+esc(label(n))+'</strong>'+
      (n.kind==='and'||n.kind==='or'?'':' <small>'+esc(n.id)+'</small>');
    if(!n.children.length)return '<li class="origin-tree-leaf" data-condition-kind="'+esc(n.kind)+'">'+
      title+' <small>'+esc(n.note)+'</small>'+
      (n.kind==='limit'?'<button type="button" data-trace-kind="'+esc(n.traceKind)+
        '" data-trace-id="'+esc(n.id)+'" data-trace-offset="'+esc(n.traceOffset||0)+
        '">다음 선행 조건 펼치기</button>':'')+'</li>';
    return '<li data-condition-kind="'+esc(n.kind)+'"><details class="origin-tree-branch"'+
      (depth<4?' open':'')+'><summary>'+title+' <small>'+n.children.length+'개</small></summary>'+
      '<p class="fine">'+esc(n.note)+'</p><ul>'+n.children.map(x=>view(x,depth+1)).join('')+
      '</ul></details></li>';
  }
  return '<section class="origin-complete-tree" data-complete-profile="'+esc(tree.profileId)+
    '"><h4>'+(tree.profileId.startsWith('TRACE:')?'선택한 조건의 추가 선행·공급 경로':
      '게임 시작 → 출생 전체 조건 트리')+'</h4><p class="fine">출생 방법의 연구·아이템·시설·임무·월·캡틴 계급·평가 점수·지역 조건을 원본에서 역추적합니다. AND/OR는 선택 구조일 뿐 실제 캠페인 실행·전역 가능성 증명이 아닙니다.</p>'+
    (tree.truncated?'<p class="origin-tree-warning">일부 경로는 크기 제한으로 접혔습니다. 버튼으로 더 추적할 수 있으나 불가능 판정이 아닙니다.</p>':'')+
    '<ul class="origin-tree-root">'+view(tree.root)+'</ul></section>';
}
