// Horizontal, source-first X-Piratez acquisition tech viewer.
// Edges point from prerequisite (left) to goal (right). The source model
// keeps AND/OR distinctions; this module only controls presentation.
import {buildAcquisitionTree,buildAcquisitionSubtree,renderAcquisitionTree}
  from './acquisition-condition-tree.js?v=20261105-body-tech-1';

const list=x=>Array.isArray(x)?x:[];
const safe=s=>String(s??'').replace(/[&<>"']/g,c=>({
  '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'
}[c]));
const supported=new Set(['research','item','facility-type','facility-function','soldier-body']);
const asNumber=(n,fallback=0)=>Number.isFinite(Number(n))?Number(n):fallback;
const amount=x=>Number(x).toLocaleString('ko-KR');
const makeNode=(kind,id,note='')=>({kind,id,note,children:[]});
const splitId=s=>String(s||'').split(':').slice(1).join(':');
const maxBranch=9;

export function mountAcquisitionTechViewer(host,{data,profile=null,kind=null,id=null,
  offset=0,name=x=>x,rootLabel=null,technical=true,adapter=null,onNavigate=()=>{}}={}){
  if(!host||(!adapter&&!data?.researchRules))throw Error('테크뷰어 출생·연구 데이터가 없습니다');
  const tree=adapter?null:profile?buildAcquisitionTree(profile,data):buildAcquisitionSubtree(kind,id,data,offset);
  const root=adapter?.root||(profile?tree.root:tree.root.children.find(n=>n.kind!=='start'));
  if(!root)throw Error('테크뷰어의 시작 노드가 없습니다');
  const getName=(id,alternative='원본 조건')=>{
    const n=String(name(id)||'').trim();
    return n&&n!==id&&!/^(STR_|MAP_|EVENT:|BUY:|MAKE:|BIRTH:|TRACE:)/.test(n)?n:alternative;
  };
  const bodyName=profile?(rootLabel||
    getName(profile.sourceId,getName(profile.soldierType,'선택한 출생 방법'))):null;
  const limitCache=new Map();
  function reRoot(node){
    if(!node)return node;
    if(node.kind==='limit'&&node.traceKind){
      const key=node.traceKind+':'+node.id+':'+asNumber(node.traceOffset);
      if(!limitCache.has(key)){
        try{
          const t=buildAcquisitionSubtree(node.traceKind,node.id,data,node.traceOffset||0);
          limitCache.set(key,t.root.children.find(n=>n.kind!=='start')||node);
        }catch{limitCache.set(key,node);}
      }
      return limitCache.get(key);
    }
    if(supported.has(node.kind)){
      const key=node.kind+':'+node.id;
      if(!limitCache.has(key)){
        try{
          const t=buildAcquisitionSubtree(node.kind,node.id,data);
          limitCache.set(key,t.root.children.find(n=>n.kind!=='start')||node);
        }catch{limitCache.set(key,node);}
      }
      return limitCache.get(key);
    }
    return node;
  }
  function scriptChildren(script,node){
    const nodes=[];
    const add=(kind,ids,note='')=>list(ids).forEach(id=>{
      nodes.push(makeNode(kind,id,note));
    });
    add('research',script.researchPositive,'이 방법의 필수 연구');
    add('forbidden-research',script.researchNegative,'이 연구를 완료하면 이 방법 차단');
    add('item',script.itemPositive,'이 방법에 필요한 실물 아이템');
    add('forbidden-item',script.itemNegative,'이 물품을 소유하면 해당 방법 차단');
    add('facility-type',script.facilityPositive,'필수로 존재해야 하는 기지 시설');
    add('forbidden-facility',script.facilityNegative,'이 시설이 존재하면 해당 방법 차단');
    add('soldier-body',script.soldierTypePositive,'보유해야 하는 병종');
    add('forbidden-soldier',script.soldierTypeNegative,'해당 병종을 보유하면 차단');
    add('country',script.countryPositive,'해당 국가 관련 조건');
    add('forbidden-country',script.countryNegative,'해당 국가 기지가 있으면 차단');
    add('region',script.regionPositive,'해당 지역의 기지 조건');
    add('forbidden-region',script.regionNegative,'해당 지역 기지가 있으면 차단');
    add('pact',script.pactPositive,'필수 협정');
    add('forbidden-pact',script.pactNegative,'해당 협정 체결 시 차단');
    for(const [key,value] of Object.entries(script.otherConditions||{}))
      nodes.push(makeNode('other-condition',key,key+': '+value));
    if(script.firstMonth!=null||script.lastMonth!=null)
      nodes.push(makeNode('month',script.script,
        (script.firstMonth??0)+'개월부터 '+
        (script.lastMonth==null?'종료 제한 미기록':script.lastMonth+'개월까지')));
    if(script.executionOdds!=null)
      nodes.push(makeNode('rng',script.script,
        '스크립트 실행 판정 '+script.executionOdds+'% · 개별 보상 당첨 확률 아님'));
    if(script.mode==='weighted'||list(script.monthWeights).length)
      nodes.push(makeNode('weighted',script.script,
        '월별 이벤트 후보 가중치 존재 · 실제 발생은 확정되지 않음'));
    if(script.mode==='oneTimeRandom')
      nodes.push(makeNode('rng',script.script,'일회성 무작위 이벤트 선택 필요'));
    add('event-order',script.oneTimeEarlier,'먼저 발생해야 하는 이벤트');
    for(const child of list(node.children)){
      if(['item-reward','research-award','birth-award','mission-generation','map-recovery',
        'parallel-research','mission-victory'].includes(child.kind))nodes.push(child);
    }
    return nodes;
  }
  function childrenOf(node){
    if(adapter)return adapter.expand(node);
    // Research dependencies must come directly from source rules. The legacy
    // recursive preview can contain "limit" leaves when its node budget is
    // exhausted, even though all five (or more) *direct* requirements are known.
    if(node.id?.startsWith('ALL_DEPENDENCIES:')){
      const topic=splitId(node.id);
      return {node,relation:'and',children:list(data.researchRules?.[topic]?.dependencies)
        .map(id=>makeNode('research',id,'이 연구를 모두 완료해야 해금'))};
    }
    if(node.id?.startsWith('BIRTH_SOURCE:')){
      // A soldier-body's many sources are mutually alternative origins.
      // Expand exactly the selected original birth profile, including its
      // own event scripts, base functions, item quantities and hiring cost.
      const sourceId=node.id.slice('BIRTH_SOURCE:'.length);
      const source=list(data.profiles).find(p=>p.id===sourceId);
      if(!source)return {node,relation:'chain',children:[makeNode('unavailable',sourceId,
        '등록된 병종 출생처를 원본 프로파일에서 찾지 못함 · 실현 가능성 미검증')]};
      const full=buildAcquisitionTree(source,data);
      return {node,relation:'and',children:list(full.root.children).filter(x=>x.kind!=='start')};
    }
    if(node.id?.startsWith('BUY:')){
      const itemId=splitId(node.id),s=data.itemSupply?.[itemId];
      if(s){
        const studies=[...new Set([...list(s.buyRequires),...list(s.buyRequirements)])];
        const child=[
          ...studies.map(id=>makeNode('research',id,'구매 전에 완료할 연구')),
          ...list(s.buyRequiresBaseFunc).map(id=>
            makeNode('facility-function',id,'구매에 필요한 기지 기능')),
          ...(s.buyRequiresCountry?[makeNode('country',s.buyRequiresCountry,
            '상점의 판매 국가 조건')]:[]),
          makeNode('funds',itemId,'구매비 '+amount(s.buyCost)+' / 1개 · 실제 상점 재고 별도 확인')
        ];
        return {node,children:child,relation:'and'};
      }
    }
    const real=reRoot(node);
    if(real.sourceScript)return {node:real,children:scriptChildren(real.sourceScript,real),
      relation:'and'};
    return {node:real,children:list(real.children),relation:real.kind==='or'?'or':
      real.kind==='and'?'and':'chain'};
  }
  const nameForMethod=(node)=>{
    const x=node.id||'';
    if(x.startsWith('BIRTH:'))return bodyName||'병종 출생';
    if(x.startsWith('REQUIRED_ITEM:'))return getName(splitId(x),'출생 재료')+' 준비';
    if(x.startsWith('ITEM_METHOD:'))return '아이템 획득 방법 선택';
    if(x.startsWith('RESEARCH_METHOD:'))return '연구 획득 방법 선택';
    if(x.startsWith('ITEM_PAGE:'))return '추가 공급처 · 다음 목록';
    if(x.startsWith('ALL_DEPENDENCIES:'))return '직접 선행 연구 모두 완료';
    if(x.startsWith('ACCESS:'))return '연구 해금 경로 선택';
    if(x.startsWith('PROVIDERS:'))return '기지 기능 제공 시설 선택';
    if(x.startsWith('LAB:'))return '연구실에서 수행';
    if(x.startsWith('BUY:'))return '상점에서 구매';
    if(x.startsWith('MAKE:'))return '기지에서 제조';
    if(x.startsWith('RANDOM:'))return '무작위 제조';
    if(x.startsWith('EVENT:'))return '이벤트 · '+getName(splitId(x),'이벤트 지급');
    if(x.startsWith('MISSION:'))return '임무 · '+getName(splitId(x),'임무 보상');
    if(x.startsWith('MAP_LOOT:')||x.startsWith('MAP_BLOCK:'))return '전장에서 아이템 회수';
    if(x.startsWith('UNLOCK:'))return '직접 연구 개방 · '+getName(splitId(x),'연구');
    if(x.startsWith('FREE:')||x.startsWith('FREE-PROTECTED:'))return '무료 연구 지급 후보';
    if(x.startsWith('LOOKUP:'))return '연구 연결 지급';
    if(x.startsWith('BIRTH_EVENT:'))return '출생 이벤트 발생 경로 선택';
    if(x.startsWith('MAP_MISSIONS:'))return '해당 지도 블록 등장 임무 선택';
    if(x.startsWith('BODY_SOURCE:'))return '병종 획득 경로 선택';
    if(x.startsWith('BIRTH_SOURCE:'))return '출생 방법별 독립 조건';
    if(x.startsWith('MATERIAL:'))return '제조 재료 준비 · '+getName(splitId(x),'재료');
    if(node.kind==='and')return '함께 필요한 조건';
    if(node.kind==='or')return '대체 가능한 획득 방법';
    return null;
  };
  function describe(node,index=0){
    if(adapter)return adapter.describe(node,index);
    const id=node.id||'',k=node.kind;
    const scripted=node.sourceScript;
    if(scripted)return {label:'이벤트 발생 경로 '+(index+1),
      detail:'해당 경로의 조건을 모두 충족 · '+(scripted.executionOdds!=null?
        '실행 판정 '+scripted.executionOdds+'%':'실행 확률 별도 확인'),
      category:'event',badge:'모두 필요'};
    if(k==='limit')return {label:'원본의 다음 공급 경로 보기',
      detail:node.note||'다음 대체 경로가 계속됩니다',category:'more',badge:'계속 보기'};
    if(k.startsWith('forbidden-'))return {label:'차단: '+getName(id,'해당 조건'),
      detail:node.note||'조건이 있으면 이 방법을 사용할 수 없습니다',
      category:'blocked',badge:'완료·보유 시 차단'};
    if(k==='start')return {label:'게임 시작',detail:node.note,
      category:'start',badge:'기준'};
    if(id.startsWith('BIRTH_SOURCE:')){
      const source=list(data.profiles).find(p=>p.id===id.slice('BIRTH_SOURCE:'.length));
      const type=source?.sourceType==='event'?'이벤트 출생':
        source?.sourceType==='manufacture'?'제조·모집':'직접 모집';
      return {label:(source?getName(source.sourceId,'출생 방법'):'미확인 출생처')+' · '+type,
        detail:'원본 출생처 '+(source?.sourceId||id)+
          ' · 선택한 출생 방법의 연구·시설·재료·이벤트만 별도 추적',
        category:'soldier',badge:type};
    }
    if(k==='research')return {label:getName(id,'이름이 확인되지 않은 연구'),
      detail:node.note||'연구 완료 필요 · 선행 경로 열기',category:'research',badge:'연구'};
    if(k==='item')return {label:getName(id,'아이템 이름 확인 필요'),
      detail:node.note||'실물 공급 경로 선택',category:'item',badge:'물품'};
    if(k==='facility-type')return {label:getName(id,'기지 시설'),
      detail:node.note||'시설 건설·완공 조건',category:'facility',badge:'시설'};
    if(k==='facility-function')return {label:getName(id,'기지 기능'),
      detail:node.note||'기능을 제공하는 시설 필요',category:'facility',badge:'기지 기능'};
    if(k==='soldier-body')return {label:getName(id,'필요한 병종'),
      detail:node.note||'실제 병종 보유 필요',category:'soldier',badge:'병종'};
    if(k==='month')return {label:'발생 가능 시기',detail:node.note,
      category:'time',badge:'시기'};
    if(k==='rng'||k==='weighted')return {label:'확률·추첨',detail:node.note,
      category:'random',badge:'미확정'};
    if(k==='funds')return {label:'필요한 자금',detail:node.note,
      category:'funds',badge:'비용'};
    if(k==='origin-history')return {label:'출생 당시 이력',
      detail:node.note,category:'history',badge:'이력'};
    if(k==='cycle')return {label:'같은 경로 재방문',detail:node.note,
      category:'warning',badge:'중복 계산 금지'};
    if(k==='unavailable')return {label:'일반 진행 불가',detail:node.note,
      category:'warning',badge:'이용 불가'};
    const generic=nameForMethod(node);
    const category=k==='or'?'or':k==='and'?'and':
      k.includes('reward')?'reward':k.includes('mission')?'event':'condition';
    let detail=node.note||'원본 조건 상세 확인';
    if(id.startsWith('BUY:')){
      const source=data.itemSupply?.[splitId(id)];
      if(source?.buyCost>0)detail='개당 '+amount(source.buyCost)+' · 상점 재고 확인 필요';
    }
    if(id.startsWith('EVENT:')&&node.supplyOutcome?.fixedQuantity)
      detail='고정 지급 '+node.supplyOutcome.fixedQuantity+'개 · 이벤트 발생은 미확정';
    if(id.startsWith('MAKE:')&&node.supplyOutcome?.fixedQuantity)
      detail='1회 제조 '+node.supplyOutcome.fixedQuantity+'개 · 반복 재료 확인 필요';
    return {label:generic||getName(id,'원본 획득 조건'),detail,
      category,badge:k==='or'?'하나 선택':k==='and'?'모두 필요':'조건'};
  }
  const nodeIcons={research:'⌕',item:'▣',facility:'▤',manufacture:'⚙',soldier:'♟',event:'⚑',
    time:'◷',random:'◇',funds:'₵',blocked:'⊘',and:'∧',or:'∨',reward:'★',
    start:'●',more:'…',warning:'!',history:'↺',condition:'◆'};
  const traceId=adapter?'acquisition:'+root.kind+':'+root.id:profile?profile.id:kind+':'+id;
  host.innerHTML='<section class="tech-viewer" data-tech-viewer="'+safe(traceId)+'">'+
    '<div class="tech-toolbar">'+
      '<div class="tech-toolbar-title"><strong>획득 테크뷰어</strong>'+
        '<small>◀ 선행 조건 · 오른쪽으로 갈수록 목표에 가까워집니다</small></div>'+
      '<div class="tech-tools">'+
        '<button type="button" data-tech-action="left" aria-label="선행 방향 이동">←</button>'+
        '<button type="button" data-tech-action="right" aria-label="목표 방향 이동">→</button>'+
        '<button type="button" data-tech-action="zoom-out" aria-label="축소">−</button>'+
        '<button type="button" data-tech-action="zoom-in" aria-label="확대">＋</button>'+
        '<button type="button" data-tech-action="reset">처음으로</button>'+
      '</div></div>'+
    '<nav class="tech-route" aria-label="현재 선택한 획득 경로"><span class="tech-route-caption">현재 추적</span>'+
      '<div class="tech-route-list" role="group" aria-label="경로별 단계 이동"></div></nav>'+
    (adapter?.notice?'<p class="tech-adapter-notice">'+safe(adapter.notice)+'</p>':'')+
    '<div class="tech-legend"><span class="tech-legend-must">━ 모두 필요</span>'+
      '<span class="tech-legend-alternative">┄ 하나 선택</span>'+
      '<span class="tech-legend-uncertain">◇ 확률·기한은 미확정</span>'+
      '<span class="tech-legend-hint">노드를 선택하면 전체 설명을 볼 수 있습니다</span></div>'+
    '<div class="tech-selected" aria-live="polite"></div>'+
    '<div class="tech-viewport" tabindex="0" aria-label="가로로 탐색하는 획득 경로">'+
      '<div class="tech-canvas"><svg class="tech-wires" aria-hidden="true"></svg>'+
        '<div class="tech-columns"></div></div></div>'+
    (technical?'<details class="tech-original" data-tech-original>'+
      '<summary>원본 상세 조건표·연구 ID 확인 (검증용)</summary>'+
      '<div class="tech-legacy"></div></details>':'')+'</section>';
  const shell=host.querySelector('.tech-viewer');
  const viewport=shell.querySelector('.tech-viewport');
  const canvas=shell.querySelector('.tech-canvas');
  const columnsEl=shell.querySelector('.tech-columns');
  const wires=shell.querySelector('.tech-wires');
  const selectedEl=shell.querySelector('.tech-selected');
  const routeEl=shell.querySelector('.tech-route-list');
  const path=[root];
  let zoom=1,selection=null,drag=null,disposed=false,focusStage=0;
  const expansionCache=new WeakMap();
  const moreLimit=new Map();
  function expandNode(node){
    if(expansionCache.has(node))return expansionCache.get(node);
    const x=childrenOf(node);
    expansionCache.set(node,x);return x;
  }
  function enumerate(){
    const columns=[{stage:0,nodes:[root],parent:null,relation:'goal'}];
    for(let i=0;i<path.length;i++){
      const e=expandNode(path[i]);
      if(!e.children.length)break;
      const page=moreLimit.get(i+1)||maxBranch;
      const visible=e.children.slice(0,page);
      columns.push({stage:i+1,parent:path[i],relation:e.relation,
        nodes:visible,total:e.children.length,more:page<e.children.length});
    }
    return columns.reverse();
  }
  function render(preserve='new'){
    if(disposed)return;
    const graph=enumerate();
    onNavigate(path.map(n=>({kind:n.kind,id:n.id})));
    const html=graph.map(col=>{
      const title=col.stage===0?'최종 목표':col.relation==='or'?'이 중 하나 선택':
        col.relation==='and'?'여기 있는 조건 모두 필요':'선행 조건 확인';
      return '<section class="tech-column" data-tech-column="'+col.stage+'">'+
        '<header class="tech-col-head"><span class="tech-stage-number">'+
          (col.stage===0?'목표': '선행 '+col.stage+'단계')+'</span><strong>'+title+'</strong>'+
          (col.total?'<small>'+col.total+'개 노드'+(col.more?' · 일부 표시':'')+'</small>':'')+
        '</header><div class="tech-node-list">'+col.nodes.map((node,i)=>{
          const {label,detail,category,badge}=describe(node,i);
          const active=path[col.stage]===node;
          const expandable=Boolean(expandNode(node).children.length);
          return '<button type="button" class="tech-node tech-node--'+safe(category)+
            (active?' is-path':'')+'" data-tech-stage="'+col.stage+
            '" data-tech-index="'+i+'" data-tech-kind="'+safe(node.kind)+'"'+
            ' aria-pressed="'+(active?'true':'false')+'">'+
            '<span class="tech-node-pill"><span class="tech-node-icon" aria-hidden="true">'+
              safe(nodeIcons[category]||'◆')+'</span>'+safe(badge)+'</span>'+
            '<strong>'+safe(label)+'</strong>'+
            '<small>'+safe(detail)+'</small>'+
            '<span class="tech-node-action">'+
              (expandable?'◀ 왼쪽 선행 경로 보기':'선택해 전체 설명 보기')+'</span>'+
            '</button>';
        }).join('')+(col.more?'<button type="button" class="tech-show-more" data-tech-more="'+col.stage+
          '">이 단계의 다른 조건 '+(col.total-col.nodes.length)+'개 더 보기</button>':'')+
        '</div></section>';
    }).join('');
    columnsEl.innerHTML=html;
    routeEl.innerHTML=path.map((node,stage)=>({node,stage})).reverse().map(({node,stage})=>{
      const meta=describe(node);
      return '<button type="button" class="tech-route-step'+
        (stage===path.length-1?' is-current':'')+'" data-tech-jump="'+stage+'"'+
        ' aria-label="'+safe(meta.label)+' 단계로 이동" title="'+safe(meta.label)+'">'+
        '<span class="tech-route-step-number">'+(stage===0?'목표':stage)+'</span>'+safe(meta.label)+
        '</button>';
    }).join('');
    canvas.style.setProperty('--tech-size',zoom);
    const focused=selection||path.at(-1);
    const meta=describe(focused);
    const link=adapter?.linkForNode?.(focused);
    const focusedStage=path.indexOf(focused);
    const relation=focusedStage>0?expandNode(path[focusedStage-1]).relation:'goal';
    const role=relation==='or'?'여러 대체 방법 중 하나':relation==='and'?
      '이 단계의 조건 모두 필요':relation==='goal'?'현재 최종 목표':'연결된 선행 단계';
    selectedEl.innerHTML='<div class="tech-selected-summary"><span class="tech-selected-label">지금 확인하는 조건 · '+
      safe(role)+'</span><strong>'+safe(meta.label)+'</strong><span class="tech-selected-detail">'+
      safe(meta.detail)+'</span></div>'+
      '<div class="tech-selected-actions"><button type="button" data-tech-action="back"'+
      (path.length<2?' disabled':'')+'>상위 목표로 돌아가기</button>'+
      (technical?'<button type="button" data-tech-action="source">원본 상세 조건표 열기</button>':'')+
      (link?.href&&link?.label?'<a class="tech-source-link" href="'+safe(link.href)+'">'+safe(link.label)+'</a>':'')+
      '</div><details class="tech-node-source"><summary>원본 ID · 추적 정보</summary><code>'+
      safe(focused?.id||'원본 ID 없음')+'</code><span>유형: '+safe(focused?.kind||'')+
      ' · 관계: '+safe(role)+'</span></details>'+
      (focused?.kind==='limit'?'<em>탐색 한도 표시일 뿐 게임의 새로운 선행 조건은 아닙니다.</em>':'');
    const proof=shell.querySelector('[data-tech-original]');
    if(adapter?.renderEvidence&&proof?.open)
      proof.querySelector('.tech-legacy').innerHTML=adapter.renderEvidence(focused,path);
    requestAnimationFrame(()=>{
      alignColumns();
      drawWires();
      if(preserve==='goal'){
        viewport.scrollLeft=viewport.scrollWidth;
        viewport.scrollTop=0;
      }else if(preserve==='new'||preserve==='focus'){
        focusNode(preserve==='focus'?focusStage:path.length-1,preserve==='focus');
      }
    });
  }
  // Align the active path on one horizontal reading line. A large AND group
  // can have many siblings: flex centering each column independently would
  // otherwise make the chosen route zig-zag across the whole viewport.
  function alignColumns(){
    if(disposed||!columnsEl.isConnected)return;
    const sections=[...columnsEl.querySelectorAll('.tech-column')];
    for(const section of sections){
      const list=section.querySelector('.tech-node-list');
      list.style.paddingTop='0px';list.style.paddingBottom='0px';
    }
    const levels=sections.map(section=>{
      const list=section.querySelector('.tech-node-list');
      const anchor=section.querySelector('.tech-node[aria-pressed="true"]')||
        section.querySelector('.tech-node');
      if(!anchor)return null;
      const r=section.getBoundingClientRect(),n=anchor.getBoundingClientRect();
      const center=n.top+n.height/2;
      return {list,above:center-r.top,below:r.bottom-center};
    }).filter(Boolean);
    if(!levels.length)return;
    const above=Math.max(...levels.map(x=>x.above));
    const below=Math.max(...levels.map(x=>x.below));
    for(const level of levels){
      level.list.style.paddingTop=Math.max(0,above-level.above)+'px';
      level.list.style.paddingBottom=Math.max(0,below-level.below)+'px';
    }
  }
  function focusNode(stage,center=false){
    const target=columnsEl.querySelector('.tech-node[data-tech-stage="'+stage+'"]'+
      '[aria-pressed="true"]')||columnsEl.querySelector('.tech-node[data-tech-stage="'+stage+'"]');
    if(!target)return;
    const vr=viewport.getBoundingClientRect(),tr=target.getBoundingClientRect();
    const mx=Math.min(36,viewport.clientWidth*.08),my=Math.min(32,viewport.clientHeight*.08);
    if(center)viewport.scrollLeft+=tr.left+tr.width/2-vr.left-vr.width/2;
    else if(tr.left<vr.left+mx)viewport.scrollLeft+=tr.left-vr.left-mx;
    else if(tr.right>vr.right-mx)viewport.scrollLeft+=tr.right-vr.right+mx;
    if(tr.top<vr.top+my)viewport.scrollTop+=tr.top-vr.top-my;
    else if(tr.bottom>vr.bottom-my)viewport.scrollTop+=tr.bottom-vr.bottom+my;
  }
  function drawWires(){
    if(disposed||!canvas.isConnected)return;
    const bounds=canvas.getBoundingClientRect();
    const columnsBounds=columnsEl.getBoundingClientRect();
    // Do NOT size the SVG from canvas.scrollWidth: the previous SVG can
    // otherwise keep the old (wider) graph's scrollWidth alive forever after
    // Reset/resize, leaving all current nodes outside the visible viewport.
    const width=Math.ceil(Math.max(viewport.clientWidth,
      columnsBounds.right-bounds.left+24));
    const height=Math.ceil(Math.max(viewport.clientHeight,
      columnsBounds.bottom-bounds.top+38));
    wires.setAttribute('width',width);wires.setAttribute('height',height);
    wires.setAttribute('viewBox','0 0 '+width+' '+height);
    const lines=[];
    for(const section of columnsEl.querySelectorAll('.tech-column')){
      const stage=Number(section.dataset.techColumn);
      if(stage===0)continue;
      const right=columnsEl.querySelector('.tech-node[data-tech-stage="'+(stage-1)+
        '"][aria-pressed="true"]')||
        columnsEl.querySelector('.tech-node[data-tech-stage="'+(stage-1)+'"]');
      if(!right)continue;
      const r=right.getBoundingClientRect();
      const toX=r.left-bounds.left,toY=r.top+r.height/2-bounds.top;
      const p=path[stage-1];
      const relation=expandNode(p).relation;
      const css=relation==='or'?'alternative':relation==='and'?'required':'linked';
      for(const left of section.querySelectorAll('.tech-node')){
        const l=left.getBoundingClientRect();
        const fromX=l.right-bounds.left,fromY=l.top+l.height/2-bounds.top;
        const half=Math.max(20,(toX-fromX)/2);
        lines.push('<path class="tech-wire tech-wire--'+css+
          (left.getAttribute('aria-pressed')==='true'?' is-selected':'')+
          '" d="M '+fromX.toFixed(1)+' '+fromY.toFixed(1)+
          ' C '+(fromX+half).toFixed(1)+' '+fromY.toFixed(1)+' '+
          (toX-half).toFixed(1)+' '+toY.toFixed(1)+' '+
          toX.toFixed(1)+' '+toY.toFixed(1)+'"/>');
      }
    }
    wires.innerHTML=lines.join('');
  }
  function chooseNode(stage,index){
    const graph=enumerate();
    const column=graph.find(c=>c.stage===stage);
    const node=column?.nodes[index];if(!node)return;
    selection=node;
    if(stage===0){path.splice(1);moreLimit.clear();render('goal');return;}
    // A nominal research/item cycle must not keep spawning duplicate
    // columns as though that constituted another legitimate acquisition.
    if((supported.has(node.kind)||node.id?.startsWith('BIRTH_SOURCE:'))&&
      path.slice(0,stage).some(ancestor=>
        ancestor.kind===node.kind&&ancestor.id===node.id)){
      selection=makeNode('cycle',node.id,
        '같은 경로의 상위 단계에서 이미 선택한 조건입니다. 반복 진입으로 획득을 증명할 수 없습니다.');
      path.splice(stage);
      render('keep');
      return;
    }
    path.splice(stage,node===path[stage]?path.length-stage:0,node);
    // If the chosen prerequisite is at stage N, everything to its left
    // is discarded. All right-hand goals and their alternatives remain.
    path.splice(stage+1);
    for(const n of [...moreLimit.keys()])if(n>stage+1)moreLimit.delete(n);
    render('new');
  }
  shell.addEventListener('click',event=>{
    const jump=event.target.closest('[data-tech-jump]');
    if(jump){
      focusStage=Number(jump.dataset.techJump);
      selection=path[focusStage]||root;
      render('focus');return;
    }
    const card=event.target.closest('[data-tech-stage][data-tech-index]');
    if(card){chooseNode(Number(card.dataset.techStage),Number(card.dataset.techIndex));return;}
    const show=event.target.closest('[data-tech-more]');
    if(show){const stage=Number(show.dataset.techMore);moreLimit.set(stage,
      (moreLimit.get(stage)||maxBranch)+maxBranch);render('keep');return;}
    const btn=event.target.closest('[data-tech-action]');
    if(!btn)return;
    if(btn.dataset.techAction==='left')viewport.scrollBy({left:-360,behavior:'smooth'});
    if(btn.dataset.techAction==='right')viewport.scrollBy({left:360,behavior:'smooth'});
    if(btn.dataset.techAction==='reset'){path.splice(1);selection=null;moreLimit.clear();render('goal');}
    if(btn.dataset.techAction==='back'&&path.length>1){
      path.pop();selection=path.at(-1);render('keep');
    }
    if(btn.dataset.techAction==='source'){
      const original=shell.querySelector('[data-tech-original]');
      if(original){original.open=true;original.scrollIntoView({behavior:'smooth',block:'nearest'});}
    }
    if(btn.dataset.techAction==='zoom-in'||btn.dataset.techAction==='zoom-out'){
      zoom=Math.max(.75,Math.min(1.35,Math.round((zoom+
        (btn.dataset.techAction==='zoom-in'?.1:-.1))*100)/100));
      render('keep');
    }
  });
  viewport.addEventListener('pointerdown',e=>{
    if(e.pointerType!=='mouse'||e.button!==0||
      e.target.closest('button,summary,a'))return;
    drag={x:e.clientX,y:e.clientY,left:viewport.scrollLeft,top:viewport.scrollTop};
    viewport.classList.add('is-dragging');
  });
  viewport.addEventListener('pointermove',e=>{
    if(!drag)return;
    viewport.scrollLeft=drag.left-(e.clientX-drag.x);
    viewport.scrollTop=drag.top-(e.clientY-drag.y);
  });
  for(const evt of ['pointerup','pointercancel','pointerleave'])
    viewport.addEventListener(evt,()=>{drag=null;viewport.classList.remove('is-dragging');});
  viewport.addEventListener('keydown',e=>{
    if(e.key==='ArrowLeft'||e.key==='ArrowRight'){
      viewport.scrollBy({left:e.key==='ArrowLeft'?-260:260,behavior:'smooth'});
      e.preventDefault();
    }
  });
  const original=shell.querySelector('[data-tech-original]');
  if(original)original.addEventListener('toggle',()=>{
    if(original.open&&(!original.dataset.loaded||adapter?.renderEvidence)){
      original.querySelector('.tech-legacy').innerHTML=adapter?.renderEvidence?
        adapter.renderEvidence(selection||path.at(-1),path):renderAcquisitionTree(tree,{name,esc:safe});
      original.dataset.loaded='true';
    }
  });
  const observer=typeof ResizeObserver==='function'?new ResizeObserver(()=>requestAnimationFrame(()=>{
    alignColumns();drawWires();
  })):null;
  observer?.observe(viewport);
  render('goal');
  return {element:shell, getPath:()=>path.map(x=>({kind:x.kind,id:x.id})),
    back:()=>{if(path.length<2)return false;path.pop();selection=path.at(-1);render('keep');return true;},
    reset:()=>{path.splice(1);selection=null;moreLimit.clear();render('goal');},
    refresh:()=>render('keep'),dispose:()=>{disposed=true;observer?.disconnect();}};
}
