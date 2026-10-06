(function(){
  const terms=[
    {
      id:"princes-gift",labels:["사상 최고의 선물","Prince's Gift"],name:"사상 최고의 선물 (Prince's Gift)",kind:"아이템 · 랜덤 선물상자",
      short:"개봉하면 고급 보상 1묶음",
      effect:"그대로 팔면 $120k. 연구 후 개봉하면 18 가중치 중 하나를 뽑습니다: 하렘 목걸이 3/18, 란제리×3+메달 2/18, 사케×5 2/18, 초콜릿×10 2/18, 다이아 2/18, 슈퍼 슬레이브 메이드 2/18, 시발링가 돌 2/18, 아마존 갑옷 2/18, 노움 1/18."
    },
    {
      id:"sivalinga",labels:["시발링가 돌","Sivalinga"],name:"시발링가 돌",kind:"치유 유물 · 부활 핵심재료",
      short:"자가치료 + 사망 병사 부활 루트",
      effect:"전투에서 자기 자신에게 쓰는 치유석입니다(healthRecovery 7, woundRecovery 1; 사용 36 TU·60 기력·5 사기). 후기 ‘시발링가 부활’은 회수한 사망 병사를 되살리는 변환으로, 용기70·반응60·Psi강도50 이상, 시발링가 돌 1개와 제물 1개, 비용 500, 회복 36일을 요구합니다."
    },
    {
      id:"bloodoge",labels:["전쟁의 축복 블러드하운드","Bloodoge 특수병","Bloodoge"],name:"전쟁의 축복 블러드하운드",kind:"G5 특수병",
      short:"사격 0 대신 매우 강한 근접 야수",
      effect:"G5 이벤트가 STR_SOLDIER_BLOODOGE 1명을 직접 생성하고 ‘전쟁의 축복’을 붙입니다. 기본 TU95/체력65/근력65/근접90/기력100에 축복이 체력+15·기력+15·근력+30·근접+20, 장갑 +16 전면/측면/하부·+8 후면을 더해 실전 체력80·근력95·근접110의 근접 특수병이 됩니다."
    },
    {
      id:"mad-scribblings",labels:["광기의 기록물","Mad Scribblings"],name:"광기의 기록물",kind:"아이템 · 1회성 장비 추첨권",
      short:"소모해서 고급 장비 1묶음 랜덤 생성",
      effect:"매각가는 $10k. 연구 후 ‘광기의 기록물 사용’ 프로젝트에서 기록물 1개+소비재 1개, 20 작업시간을 써서 매우 큰 고급 장비 풀에서 1묶음을 랜덤 생산합니다. 단순 현금보다 기술 점프용 가치가 큰 보상입니다."
    },
    {
      id:"arcane-book",labels:["비전의 고서","Arcane Book"],name:"비전의 고서",kind:"오컬트 연구 아이템",
      short:"연구하면 오컬트 지식 1개를 무작위 무료 획득",
      effect:"매각가 $30k. 도서관에서 연구(cost 20)하면 책을 소모하고 STR_ESOTERICA_PLUS를 열며, 긴 오컬트 목록에서 연구 하나를 getOneFree로 얻습니다. G7A는 이 책 1권을 지급합니다."
    },
    {
      id:"demonic-essence",labels:["악마의 정수","Demonic Essence"],name:"악마의 정수",kind:"전투 투척물 · 오컬트 자원",
      short:"위력 200 투척물 + 후기 연구재료",
      effect:"매각가 $15k/개. 전투에서는 포물선 투척, 위력 200, 최대사거리 14의 특수 투척물이며 오컬트/악마계 연구에도 쓰입니다. G7B는 13개를 주므로 즉시 매각가 합계는 $195k입니다."
    },
    {
      id:"poltergeist",labels:["시끄러운 유령","Poltergeist"],name:"시끄러운 유령 (Poltergeist)",kind:"위험 자산 · 포획 전 부채",
      short:"미포획 시 유지비 +$333k/월",
      effect:"보상처럼 보이지만 그대로 두면 월 유지비가 $333k 늘고, 즉시 처분 비용도 $13m입니다(costSell -13m). Gray+Electrics+Psi Illusion 등으로 포획 연구를 열면 유령 1개+Alien Alloys10+Wire15, 300 작업시간으로 ‘포획된 유령’으로 바꿀 수 있고, 이후에는 월 +$100k 수입(monthlyMaintenance -100k)과 매각가 $1m 자산이 됩니다."
    },
    {
      id:"glamour",labels:["글래머","Glamour"],name:"글래머",kind:"기지/고용 메타 자원",
      short:"호텔·VIP·고용계열에 쓰는 자원",
      effect:"매각가 $3k/개. 글래머 연구·고용 계열과 호텔/VIP 같은 시설 조건에 쓰입니다. G8의 33개는 즉시 매각가 $99k이지만 시설/고용 진행에 보존할 전략 가치가 있습니다."
    },
    {
      id:"cake",labels:["마법 케이크","Cake"],name:"마법 케이크",kind:"전투 회복 소모품",
      short:"체력 +15 · Mana +30 · 사기 완전회복",
      effect:"자가사용 소모품. UFOPEDIA 기준 사용 시 체력 15, Mana 30을 회복하고 사기를 완전히 회복합니다. 매각가 $12k/개. G2A/G2B는 3개를 지급합니다."
    },
    {
      id:"living-brimstone",labels:["살아있는 유황","Living Brimstone"],name:"살아있는 유황",kind:"후기 오컬트 자원",
      short:"개당 $200k · Red 각성은 4개 지급",
      effect:"매각가 $200k/개이며 연구/변환에 쓰이는 희귀 자원입니다. Red Codex 각성 보상 4개는 즉시 매각 기준 $800k의 일회성 가치가 있습니다."
    },
    {
      id:"active-locker",labels:["초차원 사물함(작동중)","활성 차원 보관함"],name:"초차원 사물함(작동중)",kind:"저장공간 자산",
      short:"1개당 저장공간 +50 또는 매각 $400k",
      effect:"아이템 size가 -50이라 기지 저장공간을 실질적으로 50 늘립니다. 매각가도 $400k입니다. Green Codex 각성의 3개는 보관하면 +150 저장공간, 팔면 $1.2m입니다."
    },
    {
      id:"esoterica",labels:["비전서","Esoterica"],name:"비전서",kind:"연구 문서",
      short:"1개 연구 시 무료 지식 1개 · 매각 $15k",
      effect:"1개를 소모해 cost 7 연구를 하면 STR_ESOTERICA_PLUS를 열고 큰 목록에서 연구 하나를 무료 획득합니다. 매각가는 $15k/개. Gray 각성의 7개는 총 매각가 $105k이며 보통 1개는 연구에 쓰는 편이 가치가 큽니다."
    },
    {
      id:"officers-baton",labels:["장교의 채찍","장교봉"],name:"장교의 채찍",kind:"Gold Codex 근접 제압무기",
      short:"9 TU 근접 · 기절/사기/TU 조작",
      effect:"근접 명중 90%, 사용 9 TU·9 기력·9 사기. 장갑 효과를 50%로 줄여 기절을 가하고 대상의 사기와 행동력에 영향을 주는 권위/제압 무기입니다. 위력은 사용자 계급에도 비례합니다."
    },
    {
      id:"flame-cannon-report",labels:["화염포(결과보고)","화염포 보고서"],name:"화염포(결과보고)",kind:"Gold Codex 연구 게이트",
      short:"화염포 제조 연구로 이어지는 보고서",
      effect:"Gold Codex가 직접 여는 보고서입니다. 후속 화염포 제조 연구는 Shadowtech, LFS_001, Heavy Flamer, Carronade, Alien Alloys, 고급 무기부품, Elerium 115까지 요구합니다. 보고서 자체가 무기가 아니라 후기 제조 루트의 입구입니다."
    },
    {
      id:"bioplasma-report",labels:["생체플라스마 투사기(보고)","바이오플라즈마 프로젝터 보고서"],name:"생체플라스마 투사기(보고)",kind:"Green Codex 연구",
      short:"Green Codex가 직접 여는 특수무기 보고서",
      effect:"Green Codex가 직접 여는 고유 보고서입니다. 현재 v.o1.1.1 룰에서 이 보고서를 dependency로 삼는 별도 *_MANUFACTURE 연구는 확인되지 않아 Gold/Red/Gray의 제조 보고서와 동일한 구조로 단정하면 안 됩니다."
    },
    {
      id:"little-ilya-report",labels:["리틀'일리야(결과보고)","Little Ilya 보고서"],name:"리틀'일리야(결과보고)",kind:"Red Codex 연구 게이트",
      short:"리틀'일리야 제조 연구의 입구",
      effect:"Red Codex가 직접 여는 보고서입니다. 후속 제조 연구는 Shadowtech, DES_001, Unguided Launcher, 고급 무기부품, Alien Alloys를 요구합니다."
    },
    {
      id:"conversion-report",labels:["컨버전 발사기(결과보고)","Conversion Launcher 보고서"],name:"컨버전 발사기(결과보고)",kind:"Gray Codex 연구 게이트",
      short:"컨버전 발사기 제조 연구의 입구",
      effect:"Gray Codex가 직접 여는 보고서입니다. 후속 제조 연구는 Shadowtech, 고급 무기부품, Optronics, Alien Alloys를 요구합니다."
    }
  ];

  function termRef(term,label){
    return '<a class="term-link" href="#term-'+term.id+'" title="'+term.short+'">'+label+'<small>'+term.short+'</small></a>';
  }
  function explain(text){
    let out=String(text);
    const matches=[];
    for(const term of terms)for(const label of term.labels)matches.push({term,label});
    matches.sort((a,b)=>b.label.length-a.label.length);
    for(const m of matches){
      if(out.includes(m.label))out=out.split(m.label).join(termRef(m.term,m.label));
    }
    return out;
  }
  function render(){
    const root=document.querySelector("#termGlossary"); if(!root)return;
    root.innerHTML=terms.map(t=>'<article id="term-'+t.id+'" class="glossary-card card"><div class="glossary-head"><div><p class="eyebrow">'+t.kind+'</p><h3>'+t.name+'</h3></div><a class="back-up" href="#top">↑ 위로</a></div><p class="glossary-short">'+t.short+'</p><p>'+t.effect+'</p></article>').join("");
  }
  document.addEventListener("click",e=>{
    const a=e.target.closest?.(".term-link"); if(!a)return;
    const href=a.getAttribute("href"); if(!href?.startsWith("#term-"))return;
    e.preventDefault();
    const dialog=document.querySelector("#detailDialog"); if(dialog?.open)dialog.close();
    setTimeout(()=>{const target=document.querySelector(href);if(target){target.scrollIntoView({behavior:"smooth",block:"start"});history.replaceState(null,"",href);}},0);
  });
  window.CaptainGlossary={terms,explain,render};
})();