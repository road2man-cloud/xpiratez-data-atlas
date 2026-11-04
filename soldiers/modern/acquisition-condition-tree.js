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
  let count=0,truncated=false,activeNodeBudget=maxNodes;
  const bounded=(kind,id,trail,depth,create)=>{
    const key=kind+':'+id;
    if(trail.includes(key))return leaf('cycle',id,'같은 경로 내 재방문 · 중복/순환은 새 획득으로 인정하지 않음');
    if(depth>=maxDepth||count>=activeNodeBudget){
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
      group('or',id,arr(entries).length?arr(entries).map(s=>({
        ...group('and',s.script,
          [...scriptConditions(s),...extras(s)],'이 스크립트에 필요한 조건을 함께 충족'),
        // The first-order script guards are authoritative even if a bounded
        // research traversal contains a "limit" marker. Keep the original
        // AND conditions available to the player without expanding the graph.
        sourceScript:s
      })):[
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
      return {
        ...group('research',id,[group('or','RESEARCH_METHOD:'+id,methods,
          '연구 획득 방법별 OR · 연구실 전용 표본을 이벤트 지급에 강제하지 않음')],
          (id.startsWith('STR_CAPTAINS_RANK_')?'캡틴 계급 연구 플래그 · 이벤트/점수/월 조건 확인. ':'')+
          (blocked.length?'이 연구를 차단하는 완료 연구: '+blocked.join(', '):'현재 출처별 연구 접근 조건')),
        // This is an untruncated summary of the LAB method ONLY. Other
        // methods can award the research directly without its lab conditions.
        researchOverview:{
          cost:Number(r.cost)||0,
          labRequires:arr(r.requires),
          dependencies:arr(r.dependencies),
          baseFunctions:arr(r.requiresBaseFunc),
          specimen:r.needItem?(r.neededItem||id):null,
          destroySpecimen:Boolean(r.destroyItem),
          unlockSources:arr(reverse.get(id)).filter(x=>x.kind==='unlock').map(x=>x.source),
          blockedBy:blocked
        }
      };
    }
    // Paginate source methods rather than expanding every loot block, event
    // and manufacturer into millions of DOM bytes. Each page remains linked
    // to exactly one original item and preserves all alternative method IDs.
    const itemPageSize=kind.startsWith('item-method-')?6:2;
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
        const gates=uniq([...arr(s.buyRequires),...arr(s.buyRequirements)]);
        return [{
          ...group('and','BUY:'+itemId,
            [...gates.map(research),
              ...arr(s.buyRequiresBaseFunc).map(baseFunction),
              ...(s.buyRequiresCountry?[leaf('country',s.buyRequiresCountry,
                '상점 판매 허용 국가 · 해당 국가 조건 확인 필요')]:[]),
              leaf('funds',itemId,'구매비 '+s.buyCost+' · 실제 상점 재고는 확인 필요')],
            '상점 판매 해금 연구·기지 기능·국가 조건을 모두 충족한 후 구매 · 타 획득 방법에는 적용하지 않음'),
          // Always retain first-order purchase evidence even when the bounded
          // exploration truncates the deeper research tree. These are normal
          // lab dependencies, not unconditional gates on event research gifts.
          purchaseGateDetails:gates.map(id=>({
            id,normalDependencies:arr(rules[id]?.dependencies),
            directUnlockSources:arr(reverse.get(id)).filter(v=>v.kind==='unlock').map(v=>v.source),
            // An ordinary lab project requiring the very material that this
            // purchase route would provide cannot bootstrap its FIRST sample.
            // Event/mission/free research gifts remain separate alternatives.
            requiresOwnPurchaseItemSpecimen:Boolean(rules[id]?.needItem&&
              (rules[id]?.neededItem||id)===itemId)
          })),
          purchaseAlternativeSources:{
            events:arr(s.eventGrants).length,
            manufacture:arr(s.manufacture).length,
            randomManufacture:arr(s.randomManufacture).length,
            mapLoot:Number(s.mapLoot?.sourceCount)||0
          },
          purchaseBaseFunctions:arr(s.buyRequiresBaseFunc),
          purchaseCountry:s.buyRequiresCountry||null,
          supplyOutcome:{method:'buy',fixedQuantity:1,unitCost:Number(s.buyCost)}
        }];
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
        if(category==='manufacture')return {
          ...group('and','MAKE:'+row.id,
            [...arr(row.requires).map(research),
              ...arr(row.requiresBaseFunc).map(baseFunction),
              ...Object.entries(row.requiredItems||{}).map(([ingredient,quantity])=>
                group('and','MATERIAL:'+ingredient,[item(ingredient)],'제조에 '+quantity+'개 필요')),
              leaf('funds',row.id,'제조비 '+row.cost)],
            '제조 '+row.id+' · 산출 '+row.quantity+'개'),
          supplyOutcome:{method:'manufacture',fixedQuantity:Number(row.quantity),unitCost:Number(row.cost)}
        };
        if(category==='random')return {
          ...group('and','RANDOM:'+row.id,
            [...arr(row.requires).map(research),...arr(row.requiresBaseFunc).map(baseFunction),
              ...Object.keys(row.requiredItems||{}).map(item),
              leaf('rng',row.id,'무작위 생산 선택 가중치 '+row.weight+'/'+row.weightTotal)],
            '무작위 물품 제조 · 획득 확정 아님'),
          supplyOutcome:{method:'random',conditionalQuantity:Number(row.count)}
        };
        if(category==='research')return {
          ...group('and','RESEARCH_ITEM:'+row.research,
            [research(row.research)],'연구 완료 시 '+row.count+'개 보상'),
          supplyOutcome:{method:'research',fixedQuantity:Number(row.count)}
        };
        const fixed=arr(row.grants).filter(g=>g.mode==='every'||g.mode==='everyMulti')
          .reduce((n,g)=>n+Math.max(0,Number(g.count)||0),0);
        const hasRandom=arr(row.grants).some(g=>g.mode!=='every'&&g.mode!=='everyMulti');
        return {
          ...scripts('EVENT:'+row.event,row.scriptRoutes,()=>[
            leaf('item-reward',row.event,'지급 내용: '+arr(row.grants).map(g=>
              g.mode==='every'||g.mode==='everyMulti'?g.count+'개 고정':'무작위/가중 지급').join(' + ')),
            ...(arr(row.directResearchAwards).length?[
              leaf('parallel-research',row.event,'같은 이벤트에서 연구 '+arr(row.directResearchAwards).join(', ')+
                '도 지급 · 연구실 표본 별도 요구 아님')]:[])
          ],'이벤트 지급 · 발생 스크립트는 OR'),
          supplyOutcome:{method:'event',fixedQuantity:fixed,hasRandom}
        };
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
      return {
        ...group('item',id,[group('or','ITEM_METHOD:'+id,
          methods.length?methods:[leaf('unknown-supply',id,'아직 연결된 공급처 없음 · 불가능 판정 아님')],
          '아이템 획득 방법별 OR · 남은 대안은 각 버튼에서 계속 펼칠 수 있음')],
          '실물 아이템 확보 · 연구와 별개의 재료 조건'),
        // Source counts come from the full indexed catalog, not the 2-route
        // preview or its continuation links. A map block is one source record.
        supplyCounts:{
          buy:Number(s.buyCost)>0?1:0,
          event:arr(s.eventGrants).length,
          manufacture:arr(s.manufacture).length,
          random:arr(s.randomManufacture).length,
          research:arr(s.researchGrants).length,
          map:arr(s.mapLoot?.sources).length
        },
        mapSourcesMayBeIncomplete:s.mapLoot?.possiblyTruncated===true
      };
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
      // Every registered source must be selectable. In particular, the peasant
      // body has nine independent births; an eight-source cutoff hides the
      // direct recruitment option and makes a reachable body seem unavailable.
      // The tech viewer rebuilds the selected BIRTH_SOURCE with its *own*
      // complete birth conditions, never sharing another birth's event guards.
      return group('soldier-body',id,[
        group('or','BODY_SOURCE:'+id,births.length?births.map(p=>
          group('and','BIRTH_SOURCE:'+p.id,
            [...arr(p.requires).map(research),
              ...arr(p.requiresBaseFunc).map(baseFunction),
              ...Object.entries(p.acquisitionRequiredItems||{}).map(([material,qty])=>
                group('and','REQUIRED_ITEM:'+material,[item(material)],
                  '이 출생 방법에서 실물 '+qty+'개 준비')),
              ...(p.sourceType==='event'?[scripts('BIRTH_EVENT:'+p.sourceId,
                p.acquisitionEventScripts,()=>[
                  leaf('birth-award',p.sourceId,'이벤트가 발생해야 출생 · 확정 획득 아님')],
                '이벤트 발생 스크립트별 OR')]:[]),
              ...(Number(p.cost)>0?[leaf('funds',p.id,'출생 비용 '+p.cost)]:[]),
              leaf('birth-source',p.id,
                '원본 출생 방법 '+p.sourceType+' · 첫 출생과 이후 이력/조건을 혼동하지 않음')],
            '이 출생 방법 하나의 필수 연구·시설·재료·발생 조건')):[
          leaf('unknown-body',id,'직접 출생처 미등록 · 변신 경로 조사 필요')],
        '이 병종의 보유가 필요 · 등록된 모든 독립 출생처 OR')
      ],'유닛 보유 조건, 단순 연구 완료만으로 충족되지 않음');
    }
    return leaf('unknown',id,'해당 연결 유형을 해석할 규칙 없음');
  });
  // An expensive first material must never consume the entire root budget
  // and hide the next material's purchase / event choices. Bound each
  // independent first-order prerequisite, with deeper paths lazy-linked.
  const rootPreview=(kind,id,quota)=>{
    if(profile.traceTarget)return go(kind,id);
    const previous=count,previousBudget=activeNodeBudget;
    count=0;activeNodeBudget=Math.min(maxNodes,quota);
    try{
      const result=go(kind,id);
      count=previous+count;
      return result;
    }finally{activeNodeBudget=previousBudget;}
  };
  const initial=[
    leaf('start','CAMPAIGN_START','게임 시작: 완료 연구 0개. 국가·난이도·캡틴 초기 선택은 해당 조건 노드에서 검증'),
    ...Object.entries(profile.acquisitionRequiredItems||{}).map(([id,n])=>
      group('and','REQUIRED_ITEM:'+id,[rootPreview('item',id,8)],'출생 제조에 '+n+'개 실물 필요')),
    ...arr(profile.requires).map(id=>rootPreview('research',id,10)),
    ...arr(profile.requiresBaseFunc).map(id=>rootPreview('facility-function',id,8)),
    ...(profile.traceTarget?[go(profile.traceTarget.kind,profile.traceTarget.id)]:[])
  ];
  if(profile.sourceType==='event'){
    const scripts=arr(profile.acquisitionEventScripts);
    // Direct birth scripts must retain their own month/guard/choice evidence.
    const scriptNodes=scripts.length?scripts.map(s=>{
      // Provide visible first-order conditions even at shallow root depth.
      const extras=[
        ...arr(s.researchPositive).map(id=>rootPreview('research',id,5)),
        ...arr(s.researchNegative).map(id=>leaf('forbidden-research',id,'완료 시 출생 이벤트 차단')),
        ...arr(s.itemPositive).map(id=>rootPreview('item',id,10)),
        ...arr(s.itemNegative).map(id=>leaf('forbidden-item',id,'보유 시 출생 이벤트 차단')),
        ...arr(s.facilityPositive).map(id=>rootPreview('facility-type',id,8)),
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
      return {
        ...group('and',s.script,[...extras,
          leaf('birth-award',profile.sourceId,'이 이벤트 발생 시 '+(profile.spawnedPersons??1)+'명 생성 · 확률/실측 미확인')],
          '출생 이벤트의 개별 스크립트 조건'),
        sourceScript:s
      };
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
  ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])),requiredQuantity=0}={}){
  const arr=x=>Array.isArray(x)?x:[];
  const display=(id,fallback='조건')=>{
    const value=String(name(id)||'').trim();
    // Missing translations must not expose internal STR_* identifiers as a
    // heading. The exact original remains available in "기술 근거".
    return value&&value!==id&&!/^(STR_|MAP_|BIRTH:|EVENT:|MAKE:|BUY:|TRACE:)/.test(value)?
      esc(value):esc(fallback);
  };
  const readable=(n)=>{
    if(n.kind==='research')return '연구: '+display(n.id,'이름이 확인되지 않은 연구');
    if(n.kind==='item')return '아이템: '+display(n.id,'원본 아이템');
    if(n.kind==='facility-function')return '기지 기능: '+display(n.id,'기지 기능');
    if(n.kind==='facility-type')return '시설: '+display(n.id,'건설 시설');
    if(n.kind==='soldier-body')return '필요 병종: '+display(n.id,'병종');
    if(n.kind.startsWith('forbidden-'))return '이 조건이 있으면 해당 방법 사용 불가: '+
      display(n.id,'제한 조건');
    if(n.kind==='month')return '발생 시기: '+esc(n.note);
    if(n.kind==='rng'||n.kind==='weighted')return '확률·추첨: '+esc(n.note);
    if(n.kind==='funds')return '비용: '+esc(n.note);
    if(n.kind==='limit')return '추가 확인할 선행 조건: '+display(n.id,'원본 조건');
    if(n.kind==='unavailable'||n.kind.startsWith('unindexed')||
      n.kind==='unbacked-sample'||n.kind==='unknown-supply')return '추가 확인 필요: '+esc(n.note);
    if(n.kind==='mission-generation')return '임무 등장: '+display(n.id,'해당 임무');
    if(n.kind==='map-recovery')return '전장에서 아이템 회수 필요';
    if(n.kind==='facility-built')return '시설을 실제로 건설·완공해야 합니다.';
    if(n.kind==='origin-history')return '출생 당시 보유한 이력';
    if(n.kind==='start')return '게임 시작';
    return display(n.id,'요구 조건')+(n.note?' · '+esc(n.note):'');
  };
  const optionTitle=(n)=>{
    const id=n.id||'';
    if(id.startsWith('BUY:'))return '상점에서 구매';
    if(id.startsWith('MAKE:'))return '기지에서 제조';
    if(id.startsWith('RANDOM:'))return '무작위 제조';
    if(id.startsWith('EVENT:')){
      const event=id.slice(6);
      const action=event.startsWith('STR_START_COUNTRY_')?'시작 국가 보상':
        event.startsWith('STR_START_LOCATION_')?'시작 지역 보상':'이벤트 보상';
      return action+' · '+display(event,'이벤트');
    }
    if(id.startsWith('MAP_LOOT:')||id.startsWith('MAP_BLOCK:'))return '임무에서 전리품 회수';
    if(id.startsWith('RESEARCH_ITEM:'))return '연구 완료 보상';
    if(id.startsWith('LAB:'))return '연구실에서 진행';
    if(id.startsWith('FREE:')||id.startsWith('FREE-PROTECTED:'))return '무료 연구 보상';
    if(id.startsWith('LOOKUP:'))return '연결 연구로 획득';
    if(id.startsWith('MISSION:'))return '임무 승리 보상';
    if(id.startsWith('ACCESS:'))return '연구 개방 방법';
    if(id.startsWith('ALL_DEPENDENCIES:'))return '선행 연구를 모두 완료';
    if(id.startsWith('BIRTH_EVENT:'))return '출생 이벤트';
    if(n.kind==='limit')return '그 밖의 획득 방법 더 확인';
    if(n.kind==='or')return '획득 방법 중 하나 선택';
    if(n.kind==='and')return '이 방법에서 함께 필요한 준비';
    return readable(n);
  };
  const traceButton=n=>n.kind==='limit'&&n.traceKind?
    '<button type="button" class="guide-next-condition" data-trace-kind="'+esc(n.traceKind)+
    '" data-trace-id="'+esc(n.id)+'" data-trace-offset="'+esc(n.traceOffset||0)+
    '">이어서 조건 확인</button>':'';
  const supplyPage=n=>n.kind==='limit'&&n.traceKind?.startsWith('item-method-');
  // Map sources are grouped by terrain block; their pagination marker is
  // nested one level deeper than the event/manufacture markers.
  const moreSupplyPages=methods=>arr(methods).flatMap(n=>
    supplyPage(n)?[n]:n.id?.startsWith('MAP_LOOT:')?
      arr(n.children).filter(supplyPage):[]);
  const supplyLabels={
    buy:'상점',event:'이벤트',manufacture:'제조',random:'무작위 제조',
    research:'연구 보상',map:'지도 전리품'
  };
  const moreSupply=(n,needed=requiredQuantity)=>{
    const category=n.traceKind.slice('item-method-'.length);
    const quantity=Number.isSafeInteger(Number(needed))&&Number(needed)>0?Number(needed):0;
    return '<div class="guide-more-sources" data-more-category="'+esc(category)+'">'+
      '<button type="button" class="guide-more-button" data-trace-kind="'+esc(n.traceKind)+
      '" data-trace-id="'+esc(n.id)+'" data-trace-offset="'+esc(n.traceOffset||0)+
      '" data-required-quantity="'+quantity+'" aria-expanded="false">'+
      (supplyLabels[category]||'기타')+' · '+esc(n.note)+'</button>'+
      '<div class="guide-more-target"></div></div>';
  };
  // Amounts are conditional on obtaining the source, never evidence that an
  // event recurs or that the store/production materials are actually available.
  const quantityAdvice=(method,needed)=>{
    const q=Number(needed),o=method.supplyOutcome;
    if(!o||!Number.isSafeInteger(q)||q<=0)return '';
    const amount=n=>Number(n).toLocaleString('ko-KR');
    const fixed=Number(o.fixedQuantity)||0;
    const remaining=Math.max(0,q-fixed);
    let explanation='';
    if(o.method==='buy'){
      const expense=q*Number(o.unitCost);
      explanation='필요 '+amount(q)+'개 기준 최소 구매 '+amount(q)+'개'+
        (Number.isSafeInteger(expense)?' · 표시 가격 합계 '+amount(expense):'')+
        '. 실제 재고·구매 제한·자금 및 해금 조건은 별도 확인';
    }else if(o.method==='manufacture'&&fixed>0){
      const batches=Math.ceil(q/fixed);
      explanation='1회 제조 산출 '+amount(fixed)+'개 / 필요 '+amount(q)+
        '개 · 수량상 최소 '+amount(batches)+'회 제조'+
        '. 반복 가능 여부, 매회 재료·비용·시설 조건은 별도 확인';
    }else if(o.method==='event'||o.method==='research'){
      const kind=o.method==='event'?'이벤트 발생 시':'연구 보상 발생 시';
      explanation=kind+' 고정 지급 '+amount(fixed)+'개 / 필요 '+amount(q)+'개 · '+
        (fixed>=q?'이 지급분으로 필요 수량 충족':
          '고정 지급분 기준 '+amount(remaining)+'개 부족 · 추가 공급 필요')+
        (o.hasRandom?' (별도 무작위 지급분은 계산에서 제외)':'')+
        '. 발생·재지급은 보장하지 않음';
    }else if(o.method==='random'){
      explanation='무작위 생산에서 이 결과가 선택되면 '+amount(o.conditionalQuantity||0)+
        '개 / 필요 '+amount(q)+'개 · 당첨과 재시도는 보장하지 않음';
    }
    return explanation?'<p class="guide-quantity" data-quantity-method="'+esc(o.method)+
      '" data-needed="'+q+'"><strong>필요 수량 비교:</strong> '+esc(explanation)+'</p>':'';
  };
  // First-order event guards come from the source script, NOT from a
  // depth-limited preview tree. A traversal limit is never a game condition.
  // Within each script these are AND gates; separate scripts are alternatives.
  function originalEventConditions(s){
    const rows=[];
    const add=(kind,label,value,traceKind=null)=>{
      const id=String(value??'');
      const shown=traceKind?
        '<button type="button" class="guide-event-trace" '+
        (traceKind==='research'?'data-trace-research-root="'+esc(id)+'"':
          'data-trace-target-kind="'+esc(traceKind)+'" data-trace-target-id="'+esc(id)+'"')+
        '>'+display(id,'원본 조건')+' · 선행 경로 보기</button>':
        display(id,'원본 조건');
      rows.push('<li data-event-gate="'+esc(kind)+'"><strong>'+esc(label)+':</strong> '+shown+'</li>');
    };
    for(const id of arr(s.researchPositive))add('research-required','필수 연구',id,'research');
    for(const id of arr(s.researchNegative))add('research-forbidden','완료하면 차단되는 연구',id,'research');
    for(const id of arr(s.itemPositive))add('item-required','필수 보유 물품',id,'item');
    for(const id of arr(s.itemNegative))add('item-forbidden','보유하면 차단되는 물품',id);
    for(const id of arr(s.facilityPositive))add('facility-required','필요한 기지 시설',id,'facility-type');
    for(const id of arr(s.facilityNegative))add('facility-forbidden','보유하면 차단되는 시설',id);
    for(const id of arr(s.soldierTypePositive))add('soldier-required','필요한 대원 병종',id,'soldier-body');
    for(const id of arr(s.soldierTypeNegative))add('soldier-forbidden','보유하면 차단되는 병종',id);
    for(const id of arr(s.countryPositive))add('country-required','필요한 국가 기지·시작 조건',id);
    for(const id of arr(s.countryNegative))add('country-forbidden','있으면 차단되는 국가 기지',id);
    for(const id of arr(s.regionPositive))add('region-required','필요한 지역 기지 조건',id);
    for(const id of arr(s.regionNegative))add('region-forbidden','있으면 차단되는 지역 기지',id);
    for(const id of arr(s.pactPositive))add('pact-required','필요한 협정',id);
    for(const id of arr(s.pactNegative))add('pact-forbidden','체결되어 있으면 차단되는 협정',id);
    const otherLabels={minScore:'필요 최소 평가점수',maxScore:'허용 최대 평가점수',
      minFunds:'필요 최소 보유 자금',maxFunds:'허용 최대 보유 자금'};
    for(const [key,value] of Object.entries(s.otherConditions||{})){
      const label=otherLabels[key]||'그 밖의 원본 발생 조건 ('+key+')';
      rows.push('<li data-event-gate="other"><strong>'+esc(label)+':</strong> '+
        esc(String(value))+'</li>');
    }
    if(s.firstMonth!=null||s.lastMonth!=null)
      rows.push('<li data-event-gate="month"><strong>발생 가능 기간:</strong> '+
        esc(String(s.firstMonth??0))+'개월부터 '+
        (s.lastMonth==null?'종료 제한 미기록':esc(String(s.lastMonth))+'개월까지')+'</li>');
    if(s.executionOdds!=null)
      rows.push('<li data-event-gate="execution-odds"><strong>스크립트 실행 판정:</strong> '+
        esc(String(s.executionOdds))+'% · 개별 보상 지급 확률이 아님</li>');
    if(s.mode==='weighted'||arr(s.monthWeights).length)
      rows.push('<li data-event-gate="weighted"><strong>월별 후보 가중치:</strong> 별도 선택 판정이 존재 · 확정 출현이 아님</li>');
    if(s.mode==='oneTimeRandom')
      rows.push('<li data-event-gate="one-time"><strong>일회성 추첨:</strong> 해당 이벤트가 선택되어야 함</li>');
    for(const id of arr(s.oneTimeEarlier))
      add('event-earlier','먼저 발생해야 하는 이벤트',id);
    return rows;
  }
  function truncatedCondition(n){
    if(n.kind!=='limit')return readable(n);
    const kind=n.traceKind||'';
    const title=kind==='research'?'추가 확인할 선행 연구':
      kind==='item'?'추가 확인할 필요 물품':'추가 확인할 획득 조건';
    return '<strong>'+title+':</strong> '+
      (kind&&['research','item','facility-type','facility-function','soldier-body']
        .includes(kind)?
        '<button type="button" class="guide-event-trace" data-trace-kind="'+esc(kind)+
          '" data-trace-id="'+esc(n.id)+'">'+display(n.id,'원본 조건')+
          ' · 경로 확인</button>':display(n.id,'원본 조건'))+
      ' <small>(상세 선행 경로는 별도로 확인 · 게임에 새 조건이 추가된 것은 아님)</small>';
  }
  function collectConditions(n,seen=new Set(),depth=0){
    if(depth>3||seen.size>25)return [];
    if(n.kind==='or'&&depth>0)return ['아래에 여러 대체 경로가 있습니다. 원본 근거에서 각각 선택하세요.'];
    if(!n.children?.length){
      if(['start','origin-history','birth-award','item-reward','research-award',
        'parallel-research','lab','auto','birth-source'].includes(n.kind))return [];
      return [truncatedCondition(n)];
    }
    const lines=[];
    for(const child of arr(n.children)){
      if(lines.length>=9)break;
      const token=child.kind+':'+child.id;
      if(seen.has(token))continue;
      seen.add(token);
      if(child.kind==='research'||child.kind==='item'||child.kind==='facility-function'||
        child.kind==='facility-type'||child.kind==='soldier-body'){
        lines.push(readable(child));
      }else if(child.kind==='and'){
        lines.push(...collectConditions(child,seen,depth+1));
      }else if(child.kind==='or'){
        lines.push('다른 확보 방법도 있습니다. 자세한 분기는 원본 근거에서 확인하세요.');
      }else if(child.children?.length){
        lines.push(...collectConditions(child,seen,depth+1));
      }else if(!['origin-history','start','lab','auto','research-award',
        'birth-award','item-reward','parallel-research'].includes(child.kind)){
        lines.push(truncatedCondition(child));
      }
    }
    return [...new Set(lines)].slice(0,8);
  }
  function scriptConditionList(script){
    const rows=script.sourceScript?originalEventConditions(script.sourceScript):
      collectConditions(script).map(t=>'<li>'+t+'</li>');
    return rows.length?rows.join(''):
      '<li>원본에서 별도 발생 조건은 확인되지 않았습니다. 실제 이벤트 발생은 보장되지 않습니다.</li>';
  }
  function visibleRoute(method,index,needed=requiredQuantity){
    const label=optionTitle(method);
    const scripts=method.kind==='or'&&method.id?.startsWith('EVENT:')?arr(method.children):null;
    const firstLeaves=(scripts||[method]).flatMap(s=>arr(s.children));
    const payout=firstLeaves.find(x=>x.kind==='item-reward');
    const cost=firstLeaves.find(x=>x.kind==='funds');
    const lab=firstLeaves.find(x=>x.kind==='lab');
    const price=cost?.note?.replace(/\b\d{4,}\b/g,x=>Number(x).toLocaleString('ko-KR'));
    const outcomes=payout?.note||price||lab?.note||
      '원본 규칙에 있는 획득 방법입니다. 실제 등장과 획득은 확인이 필요합니다.';
    const variants=scripts?.length?
      '<p class="guide-variant-count">발생 조건 '+scripts.length+'가지 중 가능한 경로를 확인하세요.</p>':'';
    const isPurchase=method.id?.startsWith('BUY:');
    const purchaseInfo=arr(method.purchaseGateDetails);
    // The bounded research tree may contain "limit" placeholders. Shop
    // prerequisites must still render from the untruncated source gate list.
    const purchaseResearch=isPurchase?
      (purchaseInfo.length?purchaseInfo.map(g=>g.id):
        arr(method.children).filter(n=>n.kind==='research').map(n=>n.id)):[];
    const purchaseSummary=isPurchase?
      '<div class="guide-purchase-gates"><strong>상점 판매 해금 연구: '+
      (purchaseResearch.length?purchaseResearch.map(id=>display(id,'이름이 확인되지 않은 연구')).join(' · '):
        '원본에 별도 연구 조건 없음')+'</strong>'+
      (arr(method.purchaseBaseFunctions).length?
        '<p>구매에 필요한 기지 기능: '+arr(method.purchaseBaseFunctions).map(id=>display(id,'기지 기능')).join(' · ')+'</p>':'')+
      (method.purchaseCountry?
        '<p>상점 판매 국가 조건: '+display(method.purchaseCountry,'해당 국가')+'</p>':'')+
      '<p class="guide-purchase-disclaimer">조건을 갖추면 구매 후보가 됩니다. 실제 상점 재고와 자금은 별도 확인이 필요합니다.</p></div>':'';
    const purchaseUpstream=purchaseInfo.map(g=>{
      const deps=arr(g.normalDependencies),bypasses=arr(g.directUnlockSources);
      if(!deps.length&&!bypasses.length)return '';
      return '<details class="guide-purchase-dependencies"'+(deps.length<=5?' open':'')+'>'+
        '<summary>'+display(g.id,'해금 연구')+'의 기본 연구 경로 · 선행 '+deps.length+'개'+
        (bypasses.length?' · 직접 해금 대안 있음':'')+'</summary>'+
        (deps.length?
          '<p>일반 연구실 경로에서는 아래 연구를 모두 완료해야 합니다. 이벤트 지급이나 직접 해금은 별도 경로일 수 있습니다.</p>'+
          '<ul>'+deps.map(id=>'<li>'+display(id,'선행 연구')+'</li>').join('')+'</ul>':
          '<p>원본에 일반 선행 연구는 기록되지 않았습니다.</p>')+
        (bypasses.length?'<p>별도 직접 해금 연구: '+bypasses.map(id=>display(id,'우회 해금 연구')).join(' · ')+
          '. 이 경로는 위의 일반 선행 연구와 대체 가능하나 상점 해금 연구 자체를 생략하는 것은 아닙니다.</p>':'')+
        '</details>';
    }).join('');
    const purchaseTrace=purchaseResearch.map(id=>
      '<div class="guide-purchase-trace"><button type="button" data-trace-research-root="'+esc(id)+'">'+
      display(id,'해금 연구')+' · 게임 시작부터 선행 조건 보기</button></div>').join('');
    const circularGates=purchaseInfo.filter(g=>g.requiresOwnPurchaseItemSpecimen);
    const alternate=method.purchaseAlternativeSources||{};
    const supplierLabels=[
      ['events','이벤트'],['manufacture','제조'],['randomManufacture','무작위 제조'],
      ['mapLoot','지도 전리품']
    ].filter(([key])=>Number(alternate[key])>0)
      .map(([key,label])=>label+' '+alternate[key]+'종');
    const purchaseBootstrap=isPurchase&&circularGates.length?
      '<div class="guide-purchase-bootstrap" data-bootstrap-cycle="'+esc(method.id.slice(4))+'">'+
      '<strong>첫 구매 전 다른 공급 경로 확인 필요</strong>'+
      '<p>'+circularGates.map(g=>display(g.id,'해금 연구')).join(' · ')+
      '의 일반 연구실 경로는 구매하려는 '+display(method.id.slice(4),'아이템')+
      '을 실물 표본으로 요구합니다. 이 구매를 첫 표본 확보 방법으로 계산하면 조건이 순환합니다.</p>'+
      '<p>'+(supplierLabels.length?'다른 공급 기록: '+supplierLabels.join(' · ')+'. ':
        '별도 실물 공급 근거 미확인. ')+
      '각 출처의 시기·확률·전리품 회수 조건을 별도로 확인하세요. 연구를 직접 지급하는 이벤트 등은 연구실 표본 조건과 구분합니다.</p>'+
      '</div>':'';
    const conditions=scripts?.length?
      scripts.map((s,i)=>'<li class="guide-event-script" data-event-script="'+esc(s.id)+'">'+
        '<strong>'+(i+1)+'번째 이벤트 경로 · 이 경로 안의 필수 조건은 모두 충족</strong>'+
        '<ul class="guide-script-gates">'+scriptConditionList(s)+'</ul></li>').join(''):
      collectConditions(method).map(t=>'<li>'+t+'</li>').join('');
    return '<article class="guide-option" data-guide-method="'+esc(method.id)+'">'+
      '<div class="guide-option-heading"><span>방법 '+(index+1)+'</span><strong>'+label+'</strong></div>'+
      '<p>'+esc(outcomes)+'</p>'+quantityAdvice(method,needed)+purchaseSummary+purchaseBootstrap+purchaseUpstream+variants+
      '<details class="guide-option-details"><summary>이 방법의 준비 조건 보기</summary>'+
      '<ul class="guide-conditions">'+conditions+'</ul>'+purchaseTrace+traceButton(method)+'</details></article>';
  }
  // Player-facing, non-recursive research summary. Research laboratory
  // prerequisites are AND gates, while direct unlocks only bypass the
  // dependencies (not specimen/facility or the research itself).
  function researchSteps(node){
    const info=node.researchOverview||{};
    const methods=arr(node.children?.[0]?.children);
    const optional=methods.filter(m=>!m.id?.startsWith('LAB:'));
    const nextResearch=id=>'<li><button type="button" class="guide-research-next"'+
      ' data-trace-research-root="'+esc(id)+'">'+display(id,'연구 조건')+
      ' <span aria-hidden="true">›</span></button></li>';
    const all=arr(info.dependencies);
    const must=arr(info.labRequires);
    const bypass=arr(info.unlockSources);
    const resources=[
      ...must.map(id=>'<li>추가 필수 연구: <button type="button" class="guide-research-next"'+
        ' data-trace-research-root="'+esc(id)+'">'+display(id,'연구')+'</button></li>'),
      ...arr(info.baseFunctions).map(id=>'<li>필수 기지 기능: '+display(id,'시설 기능')+'</li>'),
      ...(info.specimen?['<li>연구용 실물 표본: <button type="button"'+
        ' class="guide-research-next" data-trace-target-kind="item"'+
        ' data-trace-target-id="'+esc(info.specimen)+'">'+
        display(info.specimen,'연구 표본')+'</button> '+
        (info.destroySpecimen?'(연구 시 소모)':'(연구 시 비소모)')+'</li>']:[])
    ];
    const routeName=Number(info.cost)>0?'연구실에서 진행':'연구량 0 · 자동 처리 조건 확인';
    const primary='<article class="guide-option guide-research-method" data-research-lab="'+esc(node.id)+'">'+
      '<div class="guide-option-heading"><span>연구 방법 1</span><strong>'+routeName+'</strong></div>'+
      '<p class="guide-research-note">'+(Number(info.cost)>0?
        '원본 연구량 '+Number(info.cost).toLocaleString('ko-KR')+
        '. 연구실·표본·기지 기능을 실제로 확보해야 합니다.':
        '연구량 0이라고 바로 완료되는 것은 아닙니다. 선행 연구가 충족되는 시점의 자동 처리·연구 큐를 확인해야 합니다.')+
      '</p>'+
      '<section class="guide-research-gate"><h6>연구 잠금 해제 · '+(bypass.length?'아래 방법 중 하나':'선행 연구 전부 완료')+'</h6>'+
      '<div class="guide-research-choice"><div class="guide-research-route">'+
      '<strong>기본 경로 · 선행 연구 '+all.length+'개 모두 완료</strong>'+
      (all.length?'<ol class="guide-research-list">'+all.map(nextResearch).join('')+'</ol>':
        '<p>원본상 직접 선행 연구는 없습니다. 실제 연구 노출은 별도 확인이 필요합니다.</p>')+
      '</div>'+
      (bypass.length?'<div class="guide-research-route">'+
        '<strong>대체 해금 · 아래 연구 중 하나를 통한 직접 개방</strong>'+
        '<ol class="guide-research-list">'+bypass.map(nextResearch).join('')+'</ol>'+
        '<p>직접 해금은 기본 선행 연구의 대안입니다. 연구 자체, 별도 표본·시설 조건을 생략하지 않습니다.</p>'+
        '</div>':'')+'</div></section>'+
      '<section class="guide-research-gate"><h6>해금 이후에도 필요한 조건 · 모두 충족</h6>'+
      (resources.length?'<ul class="guide-research-list">'+resources.join('')+'</ul>':
        '<p>원본에 연구실 전용 추가 연구·표본·기지 기능 조건이 기록되지 않았습니다.</p>')+
      '</section>'+
      (arr(info.blockedBy).length?'<p class="guide-research-warning">선택에 따라 차단 가능: '+
        arr(info.blockedBy).map(id=>display(id,'차단 연구')).join(' · ')+
        '. 연구 완료 순서와 차단 시점을 별도로 검증하세요.</p>':'')+
      '</article>';
    return '<p class="guide-lead">이 연구를 얻는 경로는 서로 대체할 수 있지만, <strong>선택한 방법 안의 필수 조건은 모두</strong> 충족해야 합니다. 다음 연구를 선택하면 별도 연구 경로 창에서 확인합니다.</p>'+
      '<div class="guide-options guide-research-options">'+primary+
      optional.map((method,i)=>'<article class="guide-research-alternative">'+
        '<div class="guide-research-alternative-title">다른 획득 방법 '+(i+1)+'</div>'+
        visibleRoute(method,i+1)+'</article>').join('')+'</div>';
  }
  function overviewCard(node,index){
    if(node.kind==='start')return '';
    const itemMatch=node.id?.startsWith('REQUIRED_ITEM:');
    const itemTrace=node.kind==='item';
    const itemKey=itemMatch?node.id.slice('REQUIRED_ITEM:'.length):itemTrace?node.id:null;
    const itemPage=node.kind==='or'&&node.id?.startsWith('ITEM_PAGE:');
    const isResearch=node.kind==='research';
    const isBirthEvent=node.id?.startsWith('BIRTH_EVENT:');
    const isBase=node.kind==='facility-function';
    const isFunds=node.kind==='funds';
    const isHistory=node.kind==='origin-history';
    const trace=tree.profileId.startsWith('TRACE:');
    if(isHistory&&!trace)return '';
    let title='',kind='other',body='';
    if(itemMatch||itemTrace){
      kind='material';
      const id=itemKey;
      title=(itemMatch?'출생 준비물 · ':'아이템 획득 방법 · ')+display(id,'필요 아이템');
      const child=itemMatch?arr(node.children)[0]:node;
      const choices=arr(child?.children).find(x=>x.id==='ITEM_METHOD:'+id);
      const methods=arr(choices?.children),visible=methods.filter(n=>
        !supplyPage(n)&&n.kind!=='unknown-supply');
      const more=moreSupplyPages(methods);
      const counts=child?.supplyCounts||{};
      const total=Object.values(counts).reduce((sum,n)=>sum+(Number(n)||0),0);
      const breakdown=Object.entries(supplyLabels).filter(([key])=>Number(counts[key])>0)
        .map(([key,label])=>label+' '+counts[key]+'건').join(' · ');
      const quantity=itemMatch?node.note.match(/(\d+)개/):null;
      const needed=itemMatch?Number(quantity?.[1]||0):requiredQuantity;
      body=(itemMatch?
        '<p class="guide-lead">출생하려면 <strong>'+display(id,'이 아이템')+
          ' '+esc(quantity?.[1]||'1')+'개</strong>가 필요합니다. 아래 획득 방법 중 가능한 것을 고르세요.</p>':
        '<p class="guide-lead">이 아이템을 얻는 방법별로 상점 해금·연구·임무·이벤트 조건을 확인하세요. 원본에 가격이 있어도 즉시 구매를 보장하지 않습니다.</p>')+
        (total?'<p class="guide-source-count" data-indexed-source-count="'+total+
          '">색인된 공급 기록 '+total+'건 ('+breakdown+') · 첫 화면 '+visible.length+
          '개 선택지 표시. 방법별 조건과 발생 확률은 개별 확인하세요.'+
          (child.mapSourcesMayBeIncomplete?' 지도 출처의 일부는 미색인일 수 있습니다.':'')+'</p>':
          '<p class="guide-source-count">확인된 공급 기록 없음 · 추가 조사 필요. 획득 불가능 판정이 아닙니다.</p>')+
        '<div class="guide-options">'+(visible.length?
          visible.map((method,i)=>visibleRoute(method,i,needed)).join(''):
          '<p>확인된 공급 기록이 없습니다. 원본 근거에서 미연결 출처를 확인하세요.</p>')+
        more.map(n=>moreSupply(n,needed)).join('')+'</div>';
    }else if(itemPage){
      kind='method-page';title='이어서 확인하는 공급 경로';
      const routes=arr(node.children);
      const visible=routes.filter(n=>!supplyPage(n));
      body='<p class="guide-lead">앞에서 펼친 것과 독립적인 추가 공급처입니다. 이 페이지의 조건을 다른 경로에 합치지 않습니다.</p>'+
        '<div class="guide-options">'+
        visible.map((method,i)=>visibleRoute(method,i,requiredQuantity)).join('')+
        moreSupplyPages(routes).map(n=>moreSupply(n,requiredQuantity)).join('')+'</div>';
    }else if(isResearch){
      kind='research';
      title=(trace?'선택한 연구 획득 경로 · ':'출생 전에 완료할 연구 · ')+
        display(node.id,'연구');
      body=researchSteps(node);
    }else if(isBirthEvent){
      kind='event';title='병사가 등장하는 이벤트';
      const scripts=arr(node.children);
      body='<p class="guide-lead">이 출생 방식에 해당하는 이벤트 조건입니다. 여러 종류가 있으면 각각 독립적으로 확인하세요.</p>'+
        '<div class="guide-options">'+scripts.map((script,i)=>
          '<article class="guide-option"><div class="guide-option-heading"><span>경로 '+(i+1)+'</span><strong>출생 이벤트 조건</strong></div>'+
          '<details class="guide-option-details"><summary>필요 조건과 발생 시기 보기</summary>'+
          '<ul class="guide-conditions guide-script-gates" data-event-script="'+esc(script.id)+'">'+
          scriptConditionList(script)+'</ul></details></article>').join('')+'</div>';
    }else if(isBase){
      kind='facility';title='기지에 필요한 기능 · '+display(node.id,'기지 기능');
      body='<p class="guide-lead">해당 기능을 제공하는 시설을 실제로 건설해야 합니다. 연구 완료만으로 시설이 생기지는 않습니다.</p>';
    }else if(isFunds){
      kind='funds';title='고용·제조에 필요한 비용';
      body='<p class="guide-lead">'+esc(node.note)+'</p>';
    }else if(isHistory){
      kind='history';title='추가 조사 대상';
      body='<p class="guide-lead">현재 선택한 원본 조건을 더 자세히 확인하는 화면입니다.</p>';
    }else{
      kind='condition';title=optionTitle(node);
      body='<p class="guide-lead">'+esc(node.note||'해당 조건의 선행 단계를 확인하세요.')+'</p>'+
        '<div class="guide-options">'+arr(node.children).map(visibleRoute).join('')+'</div>';
    }
    return '<section class="guide-card" data-guide-category="'+kind+'"'+
      (itemKey?' data-guide-item="'+esc(itemKey)+'"':'')+'>'+
      '<div class="guide-card-heading"><span class="guide-number">'+(index+1)+'</span><h5>'+title+'</h5></div>'+
      body+'</section>';
  }
  // Exact machine-provenance is still accessible, but technical identifiers,
  // AND/OR expression nodes and recursive debug structure are not the first
  // thing a person encounters.
  const technicalTitle=n=>n.kind==='and'?'함께 필요한 조건 (AND)':
    n.kind==='or'?'여러 경로 중 하나 (OR)':
    n.kind==='limit'?'추가 탐색 필요':readable(n);
  function technical(n,depth=0){
    const title='<strong>'+technicalTitle(n)+'</strong>'+
      (n.kind==='and'||n.kind==='or'?'':' <code class="guide-source-id">'+esc(n.id)+'</code>');
    if(!n.children?.length)return '<li class="origin-tree-leaf" data-condition-kind="'+esc(n.kind)+'">'+
      title+' <small>'+esc(n.note)+'</small>'+traceButton(n)+'</li>';
    return '<li data-condition-kind="'+esc(n.kind)+'"><details class="origin-tree-branch"'+
      (depth<1?' open':'')+'><summary>'+title+' <small>'+n.children.length+'개</small></summary>'+
      '<p class="fine">'+esc(n.note)+'</p><ul>'+n.children.map(x=>technical(x,depth+1)).join('')+
      '</ul></details></li>';
  }
  const source=tree.profileId.startsWith('TRACE:');
  const cards=tree.root.children.filter(n=>n.kind!=='start'&&n.kind!=='origin-history');
  return '<section class="origin-complete-tree origin-readable-guide" data-complete-profile="'+
    esc(tree.profileId)+'">'+
    '<div class="guide-intro"><h4>'+(source?'추가 선행 조건과 획득 방법':
      '이 병사를 얻기 위해 필요한 것')+'</h4>'+
    '<p><strong>무엇을 준비하고 어떤 방법으로 얻는지</strong> 먼저 보세요. 한 카드의 준비물은 다른 카드의 필수 연구·시설 조건을 대신하지 않습니다.</p>'+
    '<p class="guide-state">게임 시작부터 확인하는 경로 · 획득 확률 및 실전 실행 가능성은 아직 검증되지 않은 부분이 있습니다.</p></div>'+
    '<div class="guide-cards">'+cards.map(overviewCard).join('')+'</div>'+
    (tree.truncated?'<p class="guide-incomplete">일부 연구·공급 경로는 아직 펼쳐지지 않았습니다. 아래 원본 근거에서 계속 확인할 수 있습니다.</p>':'')+
    '<details class="guide-technical-evidence"><summary>원본 조건·연구 ID·세부 분기 보기 (검증용)</summary>'+
    '<p>같은 출생 방법의 정확한 연구·이벤트·아이템 ID와 논리 구조입니다. 여기서만 AND(모두 필요)와 OR(여러 경로 중 하나)를 표시합니다.</p>'+
    '<ul class="origin-tree-root">'+technical(tree.root)+'</ul></details></section>';
}
