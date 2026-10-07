(() => {
  "use strict";

  const groups = [
    {
      title: "드릴의 힘",
      kind: "직접 2지선다 + 후속 잠금",
      hint: "STR_QUESTION_OF_DRILL 뒤의 핵심 선택. ‘자그마한 드릴 조사’는 제3의 동등 선택지가 아니라 거부 루트와만 충돌하는 별도 연구입니다.",
      options: [
        {name:"힘을 품는다", id:"STR_EMBRACE_THE_POWER", meta:"연구량 1 · +25점", effect:"힘을 거부한다 비활성화"},
        {name:"힘을 거부한다", id:"STR_REJECT_THE_POWER", meta:"연구량 1 · +200점", effect:"힘을 품는다 + 자그마한 드릴 조사 비활성화 · Cinderella Project 선행 해금"}
      ],
      note:"자그마한 드릴 조사(연구량 5)는 ‘힘을 품는다’와 공존 가능하지만 ‘힘을 거부한다’와는 상호배타입니다."
    },
    {
      title: "여왕 형태",
      kind: "상호배타 5분기",
      hint: "Queen 연구 5종이 서로를 직접 disables 합니다. 네 색은 해당 Codex에 종속되고, Savage는 별도 needItem 루트입니다.",
      options: [
        {name:"위대한 여왕", id:"STR_QUEEN_GOLD", meta:"Gold Codex · +1000점", effect:"다른 Queen 4종 봉쇄"},
        {name:"음험한 여왕", id:"STR_QUEEN_GRAY", meta:"Gray Codex · +1000점", effect:"다른 Queen 4종 봉쇄"},
        {name:"멋쟁이 여왕", id:"STR_QUEEN_GREEN", meta:"Green Codex · +1000점", effect:"다른 Queen 4종 봉쇄"},
        {name:"전사 여왕", id:"STR_QUEEN_RED", meta:"Red Codex · +1000점", effect:"다른 Queen 4종 봉쇄"},
        {name:"야만 여왕", id:"STR_QUEEN_SAVAGE", meta:"needItem · +2000점", effect:"다른 Queen 4종 봉쇄 · Crowning 해금"}
      ]
    },
    {
      title: "Bounty Hunting Challenge",
      kind: "직접 4지선다",
      hint: "STR_BOUNTY_HUNTING_CHALLENGE 뒤 네 선택지가 서로를 직접 봉쇄합니다.",
      options: [
        {name:"고블린 잭스에게 도전", id:"STR_BOUNTY_HUNTING_CHALLENGE_BANK", meta:"연구량 6", effect:"Challenge Done으로 진행"},
        {name:"돌연변이 연맹에게 도전", id:"STR_BOUNTY_HUNTING_CHALLENGE_MA", meta:"연구량 6", effect:"Reticulan Electrogun 무료 연구 + Damsel Victim 지급"},
        {name:"잭에게 도전", id:"STR_BOUNTY_HUNTING_CHALLENGE_JACK", meta:"연구량 6", effect:"Challenge Done으로 진행"},
        {name:"고객에게 도전하지 않음", id:"STR_BOUNTY_HUNTING_CHALLENGE_NONE", meta:"연구량 12", effect:"다른 도전 선택 봉쇄 · Challenge Done으로 진행"}
      ]
    },
    {
      title: "스카이 닌자 챔피언 처리",
      kind: "직접 3지선다",
      hint: "Ninja Champion 격파 뒤 처리 방식. 세 PREQ가 서로를 직접 봉쇄합니다.",
      options: [
        {name:"추방", id:"STR_CBT_TOURNAMENT_CHALLENGER_NINJA_DEFEAT_BANISH_PREQ", meta:"연구량 1 · +250점 · SUMM 필요", effect:"Mystery Box 지급"},
        {name:"예속", id:"STR_CBT_TOURNAMENT_CHALLENGER_NINJA_DEFEAT_ENSLAVE_PREQ", meta:"연구량 1 · +100점", effect:"Slave Ninja Champion 지급"},
        {name:"사귀기", id:"STR_CBT_TOURNAMENT_CHALLENGER_NINJA_DEFEAT_BEFRIEND_PREQ", meta:"연구량 1 · +1500점", effect:"Ninja Scroll 지급"}
      ]
    },
    {
      title: "대의의 방향",
      kind: "직접 2지선다",
      hint: "STR_THE_GREAT_CAUSE 뒤 서로 직접 disables 하는 선택입니다.",
      options: [
        {name:"기사단", id:"STR_RED_KNIGHT_PREQ", meta:"연구량 1 · +100점", effect:"인민의 군대 봉쇄"},
        {name:"인민의 군대", id:"STR_PEOPLES_ARMY_PREQ", meta:"연구량 1 · +1000점", effect:"기사단 봉쇄"}
      ]
    },
    {
      title: "순수혈통 고용 vs 돌연변이 연맹",
      kind: "경로 상호배타",
      hint: "같은 화면의 즉시 2지선다라기보다, 한쪽 연구를 완료하면 다른 세력 루트가 닫히는 장기 선택입니다.",
      options: [
        {name:"순수혈통 병사 고용", id:"STR_RECRUIT_PUREBLOODS", meta:"연구량 10 · +100점", effect:"돌연변이 연맹 접촉 봉쇄"},
        {name:"돌연변이 연맹", id:"STR_CONTACT_MUTANT_ALLIANCE", meta:"연구량 10 · +1500점", effect:"Pureblood 고용 봉쇄 · School Books / Durasuit / Alliance Lore / Hybrid Recruitment 등 해금"}
      ]
    },
    {
      title: "분석실 vs VIP 클럽",
      kind: "시설 경로 상호배타",
      hint: "연구 규칙상 STR_STUDY_ROOM과 STR_VIP_CLUB_FAC가 서로를 직접 disables 합니다.",
      options: [
        {name:"분석실", id:"STR_STUDY_ROOM", meta:"연구량 150 · +150점", effect:"VIP Club facility 연구 봉쇄 · Analytics 해금"},
        {name:"VIP 클럽", id:"STR_VIP_CLUB_FAC", meta:"VIP Club 연구 종속", effect:"분석실 연구 봉쇄 · Analytics 해금"}
      ]
    },
    {
      title: "닥터 X 처리",
      kind: "후기 스토리 6지선다",
      hint: "STR_GDX_011 뒤의 직접 선택. 여섯 연구가 서로를 봉쇄하며 일부는 Red Mage 후속도 추가로 잠급니다.",
      options: [
        {name:"그녀를 고용", id:"STR_GDX_012", meta:"연구량 10", effect:"Doctor X Hire 지급"},
        {name:"그녀에게 장난치기", id:"STR_GDX_013", meta:"연구량 5", effect:"Doctor X A35 지급 · Spector 약탈 PREQ 해금"},
        {name:"그녀를 모욕", id:"STR_GDX_014", meta:"연구량 5", effect:"Doctor X C50 지급 · Spector 약탈 PREQ 해금"},
        {name:"그녀를 추방", id:"STR_GDX_015", meta:"연구량 5", effect:"Mystery Box 지급 · Spector 약탈 PREQ 해금"},
        {name:"그녀를 상품화", id:"STR_GDX_016", meta:"연구량 20", effect:"Doctor X Sale 지급 · Spector 약탈 PREQ 해금"},
        {name:"레드 메이지에게 선물", id:"STR_GDX_017", meta:"연구량 1", effect:"Red Mage 계열 lookup · Spector 약탈 PREQ 해금"}
      ]
    },
    {
      title: "거드런 형태",
      kind: "후기 스토리 3지선다",
      hint: "세 Gudrun 연구가 서로 직접 disables 합니다.",
      options: [
        {name:"거드런 부인", id:"STR_GDX_065", meta:"연구량 3 · +25점", effect:"Knight / Vampire Princess 봉쇄"},
        {name:"기사 거드런", id:"STR_GDX_066", meta:"연구량 3 · +25점", effect:"Lady / Vampire Princess 봉쇄 · Red-Eyes 협력 루트도 봉쇄"},
        {name:"거드런 흡혈공주", id:"STR_GDX_067", meta:"연구량 3 · +25점", effect:"Lady / Knight 봉쇄"}
      ]
    },
    {
      title: "붉은-눈 대응",
      kind: "후기 스토리 2지선다",
      hint: "STR_TEC_080 뒤 협력/거절이 서로를 직접 봉쇄합니다.",
      options: [
        {name:"협력하기", id:"STR_TEC_081", meta:"연구량 1", effect:"Book of Life 지급 · 일부 Gudrun/Red Mage 경로 추가 봉쇄"},
        {name:"거절하기", id:"STR_TEC_082", meta:"연구량 1", effect:"TEC_083 해금"}
      ]
    },
    {
      title: "오로라와 거드런",
      kind: "후기 스토리 2지선다",
      hint: "STR_TEC_172 뒤 거드런을 누구를 위해 확보할지 선택합니다.",
      options: [
        {name:"오로라를 위해 거드런 납치", id:"STR_TEC_168", meta:"연구량 1", effect:"TEC_180 PREQ 해금 · Dr. X 선택축 봉쇄"},
        {name:"먼저 당신을 위해 거드런 확보", id:"STR_TEC_169", meta:"연구량 1", effect:"TEC_168 봉쇄 · 이후 ‘오로라 도움’ 선택도 봉쇄"}
      ]
    },
    {
      title: "오로라의 다음 단계",
      kind: "후기 스토리 2지선다",
      hint: "STR_TEC_176 뒤의 직접 선택. 앞에서 TEC_169를 골랐다면 ‘도움 필요’ 쪽은 이미 닫힙니다.",
      options: [
        {name:"오로라는 당신 도움이 필요하다", id:"STR_TEC_178", meta:"연구량 1", effect:"TEC_182 PREQ 해금"},
        {name:"오로라는 성장이 필요하다", id:"STR_TEC_179", meta:"연구량 1", effect:"TEC_083 해금"}
      ]
    },
    {
      title: "오로라 최종 이용",
      kind: "후기 스토리 3지선다",
      hint: "STR_TEC_103 + STR_TEC_183 뒤 세 연구가 서로를 직접 봉쇄합니다.",
      options: [
        {name:"무기로 이용", id:"STR_TEC_196", meta:"연구량 25 · +50점", effect:"다른 두 이용 방식 봉쇄"},
        {name:"하인으로 이용", id:"STR_TEC_197", meta:"연구량 1 · +50점", effect:"Nine Circles PREQ 해금"},
        {name:"제물로 이용", id:"STR_TEC_198", meta:"연구량 15 · +50점", effect:"TEC_110_UNUSED 해금"}
      ]
    },
    {
      title: "레드 메이지 처리",
      kind: "후기 스토리 2지선다",
      hint: "STR_WIZ_111 + Chronomancy 뒤 신뢰/예속이 서로 직접 disables 합니다.",
      options: [
        {name:"레드 메이지를 믿기", id:"STR_WIZ_112_NO", meta:"연구량 1 · +10점", effect:"Treasure Chest 지급"},
        {name:"레드 메이지 예속하기", id:"STR_WIZ_112", meta:"연구량 30 · +100점", effect:"일부 Dr. X 및 Red Mage 생산 루트 봉쇄"}
      ]
    },
    {
      title: "레드 메이지의 샘",
      kind: "후기 스토리 2지선다",
      hint: "STR_WIZ_022 뒤 샘 공유/숨기기가 서로 직접 disables 합니다.",
      options: [
        {name:"샘 공유", id:"STR_WIZ_181", meta:"연구량 1", effect:"Mystery Box 지급 · 일부 Dr. X/Red-Eyes 경로 봉쇄"},
        {name:"샘 숨기기", id:"STR_WIZ_182", meta:"연구량 1", effect:"공유 루트 봉쇄"}
      ]
    }
  ];

  function esc(v){
    return String(v ?? "").replace(/[&<>"']/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));
  }

  function renderOption(o){
    return '<article class="choice-option">'+
      '<div class="choice-option-head"><div><strong>'+esc(o.name)+'</strong><small>'+esc(o.id)+' · '+esc(o.meta)+'</small></div></div>'+
      '<div class="choice-effects-wrap"><span class="choice-effects-title">확인된 효과</span>'+
        '<div class="choice-effect-list"><div class="choice-effect"><b>분기 결과</b><span>'+esc(o.effect)+'</span></div></div>'+
      '</div>'+
    '</article>';
  }

  function renderGroup(g, idx){
    return '<article class="choice-stage card">'+
      '<div class="choice-stage-head"><div><p class="eyebrow">추가 분기 '+(idx+1)+'</p><h3>'+esc(g.title)+'</h3><p>'+esc(g.hint)+'</p></div><span class="one-choice-badge">'+esc(g.kind)+'</span></div>'+
      '<div class="choice-grid">'+g.options.map(renderOption).join("")+'</div>'+
      (g.note?'<p class="choice-late"><b>구조 주의:</b> '+esc(g.note)+'</p>':'')+
    '</article>';
  }

  const root=document.querySelector("#exclusiveRules");
  if(!root) return;

  const heading=document.createElement("article");
  heading.className="card";
  heading.innerHTML='<p class="eyebrow">원본 ruleset 상호배타 감사</p>'+
    '<h3>선장·Codex·갈라지는 길 외 추가 분기</h3>'+
    '<p class="muted">아래는 v.o1.1.1 <code>research.disables</code>를 전수 검사해 기존 페이지에 없던 실제 선택축을 별도로 정리한 것입니다. 단순 연결요소를 한 묶음으로 오인하지 않고, 같은 질문의 직접 선택과 후속 경로 잠금을 구분했습니다.</p>';
  root.appendChild(heading);
  root.insertAdjacentHTML("beforeend", groups.map(renderGroup).join(""));
})();
