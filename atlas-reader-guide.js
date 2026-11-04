/* X-Piratez Data Atlas shared reader experience.
 * No database semantics are altered: this layer only supplies meaningful
 * navigation, plain-language context, and optional source terminology.
 */
(()=>{
  'use strict';
  const script=document.currentScript;
  const root=new URL('./',script?.src||location.href);
  const groups=[
    {title:'게임 시작·분기 선택',help:'처음 무엇을 선택하고 무엇을 포기할지',pages:['starting','captains','events']},
    {title:'병사·전투',help:'대원과 무기, 적 전력을 비교할 때',pages:['soldiers','weapons','armors','forces']},
    {title:'기지·운영',help:'시설, 기체, 생산 자원을 계획할 때',pages:['facilities','crafts','craft-weapons','manufacture']},
    {title:'연구·자료 찾기',help:'아이템과 연구를 역추적하거나 원본을 검증할 때',pages:['research','items','reference']}
  ];
  const pages={
    starting:{name:'시작 위치',purpose:'첫 기지 위치가 주는 혜택과 예외를 비교하세요.',focus:'이 위치를 선택하면 받는 혜택',
      search:'국가·지역 찾기',compare:'시작 보너스 비교',detail:'지역 카드를 눌러 보너스와 조건을 확인하세요.'},
    captains:{name:'선장 선택',purpose:'한 선택으로 얻는 것과 포기하는 것을 함께 비교하세요.',focus:'선택의 이익과 영구 손실',
      search:'선장·특성 찾기',compare:'선택지 비교',detail:'선장을 눌러 전용 혜택과 배제를 확인하세요.'},
    soldiers:{name:'병종',purpose:'병종 비교 후, 실제 출생 방법과 필요한 준비를 확인하세요.',focus:'출생 방법 → 준비물 → 연구·이벤트 조건',
      search:'병종·출생처 찾기',compare:'능력치 비교',detail:'출생처를 눌러 획득 경로·육성 조건을 확인하세요.'},
    crafts:{name:'기체',purpose:'운용 가능한 기체와 구매·제조 조건을 비교하세요.',focus:'성능 → 획득 방법 → 운용 조건',
      search:'기체 찾기',compare:'기체 성능 비교',detail:'기체를 눌러 구매와 연구 조건을 확인하세요.'},
    'craft-weapons':{name:'기체무장',purpose:'무장 성능과 호환 기체를 비교하세요.',focus:'화력 → 탄약 → 장착 가능 기체',
      search:'기체무장 찾기',compare:'무장 비교',detail:'무장을 눌러 탄약·장착 조건을 확인하세요.'},
    facilities:{name:'기지시설',purpose:'건설의 비용, 제공 기능, 선행 연구를 알아보세요.',focus:'건설 비용 → 기지 효과 → 개방 조건',
      search:'시설 찾기',compare:'시설 효율 비교',detail:'시설을 눌러 제공 기능과 조건을 확인하세요.'},
    armors:{name:'방어구',purpose:'방어력과 저항·착용 조건을 비교하세요.',focus:'방어 성능 → 착용 대상 → 구하는 방법',
      search:'방어구 찾기',compare:'방어구 비교',detail:'방어구를 눌러 저항과 획득 조건을 확인하세요.'},
    items:{name:'아이템',purpose:'쓰임새부터 확인하고 구매·제조·보상 출처를 찾으세요.',focus:'무엇에 쓰나 → 어디서 얻나 → 무엇이 필요한가',
      search:'아이템 찾기',compare:'아이템 비교',detail:'아이템을 눌러 사용처와 획득 경로를 확인하세요.'},
    research:{name:'연구',purpose:'어떤 연구를 먼저 해야 하고 무엇이 열리는지 확인하세요.',focus:'선행 연구 → 얻는 효과 → 배제되는 연구',
      search:'연구 찾기',compare:'연구 비교',detail:'연구를 눌러 요구 조건과 후속 영향을 확인하세요.'},
    manufacture:{name:'제조',purpose:'제품별 재료·비용·필요 연구와 경제성을 비교하세요.',focus:'산출물 → 재료·비용 → 제조 개방',
      search:'제조법 찾기',compare:'제조 비용 비교',detail:'제조법을 눌러 실제 소모품과 산출물을 확인하세요.'},
    events:{name:'이벤트',purpose:'언제 발생할 수 있고 무엇을 받거나 잃는지 확인하세요.',focus:'발생 시기 → 필요한 조건 → 보상·위험',
      search:'이벤트 찾기',compare:'이벤트 비교',detail:'이벤트를 눌러 발생 조건과 보상 방식을 확인하세요.'},
    forces:{name:'적부대·작전',purpose:'어떤 임무에서 어떤 적이 나올 수 있는지 조사하세요.',focus:'임무 등장 → 세력·병종 → 전투 준비',
      search:'적·임무 찾기',compare:'적부대 비교',detail:'작전을 눌러 등장 조건과 구성 병력을 확인하세요.'},
    weapons:{name:'무기',purpose:'현재 대원에게 유리한 공격 수단을 수치로 비교하세요.',focus:'한 발 피해 → 행동력 → 사거리·명중',
      search:'무기 찾기',compare:'무기 화력 비교',detail:'무기를 눌러 공격 방식과 탄약을 확인하세요.'},
    reference:{name:'엔진 참조',purpose:'게임 규칙·계산 방식의 근거를 확인하세요.',focus:'규칙 이름 → 적용 대상 → 예외·출처',
      search:'규칙 찾기',compare:'규칙 표 확인',detail:'항목을 눌러 원본 설명과 예외를 확인하세요.'}
  };
  const link=(id)=>new URL(id+'/',root).href;
  function make(type,className,text){
    const el=document.createElement(type);
    if(className)el.className=className;
    if(text!==undefined)el.textContent=text;
    return el;
  }
  function appendLink(where,text,target,cls=''){
    const a=make('a',cls,text);a.href=target;where.append(a);return a;
  }
  function buildGroups(host,current){
    for(const group of groups){
      const section=make('section','atlas-nav-group');
      section.append(make('strong','',group.title));
      section.append(make('p','',group.help));
      const links=make('div','atlas-nav-links');
      for(const id of group.pages){
        const a=appendLink(links,pages[id].name,link(id));
        if(id===current){a.setAttribute('aria-current','page');a.classList.add('is-current');}
      }
      section.append(links);host.append(section);
    }
  }
  function home(){
    const main=document.querySelector('body > main');
    if(!main||!main.querySelector('.grid'))return;
    const heading=make('h2','atlas-home-title','어떤 정보를 찾으시나요?');
    const lead=make('p','atlas-home-intro','목적에 가까운 범주부터 선택하세요. 기술 명칭과 원본 규칙은 각 DB의 상세 근거에서 볼 수 있습니다.');
    const source=main.querySelector('.grid');
    const cards=new Map([...source.querySelectorAll(':scope > a.card')].map(a=>{
      const key=a.getAttribute('href')?.match(/^\.\/([a-z-]+)\//)?.[1];
      return [key,a];
    }));
    source.before(heading,lead);
    for(const group of groups){
      const section=make('section','atlas-home-group');
      section.append(make('h2','',group.title));
      section.append(make('p','',group.help));
      const grid=make('div','grid');
      for(const id of group.pages)if(cards.has(id))grid.append(cards.get(id));
      section.append(grid);source.before(section);
    }
    source.remove();
    const quick=main.querySelector('.quicknav');
    if(quick){
      const details=make('details','atlas-home-directory');
      details.append(make('summary','','전체 DB를 한 번에 보기'));
      quick.before(details);details.append(quick);
    }
  }
  function guide(id){
    const config=pages[id],main=document.querySelector('main');
    if(!main||!config||main.querySelector('[data-atlas-reader-guide]'))return;
    const box=make('section','atlas-reader-guide');
    box.dataset.atlasReaderGuide=id;
    const head=make('div','atlas-reader-head');
    head.append(make('span','atlas-reader-eyebrow','이 DB에서 확인할 내용'));
    head.append(make('h2','',config.focus));
    head.append(make('p','',config.purpose));
    box.append(head);
    const actions=make('div','atlas-reader-actions');
    const search=document.getElementById('search');
    if(search){
      const target=search.closest('.toolbar')||search;
      if(!target.id)target.id='atlas-search-area';
      appendLink(actions,'1. '+config.search,'#'+target.id,'atlas-reader-link');
    }
    const table=main.querySelector('table, #cards, #modes');
    if(table){
      if(!table.id)table.id='atlas-compare-area';
      appendLink(actions,'2. '+config.compare,'#'+table.id,'atlas-reader-link');
    }
    actions.append(make('span','atlas-reader-action','3. '+config.detail));
    box.append(actions);
    const idLabel=make('label','atlas-reader-id-toggle');
    const idInput=make('input');idInput.type='checkbox';idInput.setAttribute('aria-label','비교 목록에 원본 ID 표시');
    idInput.addEventListener('change',()=>document.body.classList.toggle('atlas-show-source-ids',idInput.checked));
    idLabel.append(idInput,document.createTextNode('목록에서 원본 ID 함께 보기'));
    const idNote=make('span','atlas-reader-id-note','기본 화면은 이름 위주입니다. 원본 ID로 검색하는 기능은 언제나 사용할 수 있습니다.');
    box.append(idLabel,idNote);
    const term=make('details','atlas-reader-glossary');
    term.append(make('summary','','조건 표시를 읽는 법'));
    const defs=make('dl','');
    const pairs=[
      ['반드시 충족','열거된 연구·재료·시설을 모두 갖추어야 다음 단계로 진행할 수 있습니다.'],
      ['획득 방법 중 선택','구매·이벤트·제조 등 중 한 경로로 얻을 수 있다는 뜻입니다. 다른 방법을 모두 수행할 필요는 없습니다.'],
      ['조건부·미검증','게임 규칙에 존재하는 경로이지만 실제 이벤트 발생·자금 확보·동시 달성은 아직 확인하지 않았습니다.'],
      ['원본 ID','게임 내부의 정확한 식별자입니다. 검색·검증에 필요하지만 처음 읽을 때는 이름과 용도를 먼저 보세요.']
    ];
    for(const [k,v] of pairs){defs.append(make('dt','',k),make('dd','',v));}
    term.append(defs);box.append(term);
    const dir=make('details','atlas-reader-directory');
    dir.append(make('summary','','다른 종류의 DB 찾아보기'));
    const all=make('div','atlas-nav-directory');buildGroups(all,id);dir.append(all);
    box.append(dir);
    main.prepend(box);
  }
  const url=new URL(location.href);
  const path=url.pathname.replace(root.pathname,'').replace(/^\/|\/$/g,'');
  const current=path.startsWith('soldiers/')?'soldiers':path.split('/')[0];
  const init=()=>{if(!current||current==='index.html')home();else guide(current);};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});
  else init();
})();
