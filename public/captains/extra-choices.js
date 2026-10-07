(() => {
  "use strict";

  const groups = [
    {
      title: "예언에 의한 선장 성격 우회",
      kind: "조건부 대체 선택",
      hint: "STR_THREAD_OF_PROPHECY를 확보하면 일반 초기 5선장 연구가 모두 비활성화되고, 같은 성격검사에서 별도 선택인 ‘난 캡틴 키드다!?’가 열립니다.",
      options: [
        {name:"난 캡틴 키드다!?", id:"STR_THREAD_OF_PROPHECY_PERSONALITY", meta:"연구량 1 · Personality Test + Thread of Prophecy", effect:"lookup이 STR_CAPTAIN_PUSSY로 연결되는 예언 전용 대체 진입. 일반 5선장 선택은 Thread of Prophecy 자체가 봉쇄"}
      ],
      note:"이 항목은 6번째 일반 선장 선택지가 아니라, Thread of Prophecy를 먼저 얻은 경우 기존 5지선다 전체를 대체하는 특수 진입입니다."
    },
    {
      title: "갈라지는 길의 숨은 고유 손실",
      kind: "5지선다 추가 결과",
      hint: "다른 네 갈래를 닫는 공통 효과를 제외하고, 각 선택만 추가로 잃게 만드는 연구를 분리했습니다.",
      options: [
        {name:"슈퍼변이체 계집이 최고다", id:"STR_GALS_ARE_SUPERIOR_PREQ", meta:"연구량 24", effect:"추가로 Nekomimi Network 봉쇄"},
        {name:"남성 병사", id:"STR_WE_NEED_MALE_TOUCH_PREQ", meta:"연구량 3", effect:"추가로 Nekomimi Network 봉쇄"},
        {name:"농부 혁명!", id:"STR_PEASANT_REVOLUTION_PREQ", meta:"연구량 9", effect:"추가로 Nekomimi Network + Pure Maiden Training(영애 순화 의식) 봉쇄"},
        {name:"삶은 혼종이다", id:"STR_HYBRID_PATH_PREQ", meta:"연구량 20", effect:"다른 네 갈래 외 추가 고유 disable 없음"},
        {name:"고양이와 함께 살기", id:"STR_CAT_PATH_PREQ", meta:"연구량 32", effect:"다른 네 갈래 외 추가 고유 disable 없음"}
      ]
    },
    {
      title: "자그마한 드릴 → Codex 실제 색상 선택",
      kind: "직접 4지선다 + 색별 Anomaly",
      hint: "STR_TINY_DRILL_INVESTIGATION 뒤 STR_CHOOSE_*_QUERY 네 색 중 하나를 고릅니다. 각 선택은 Tiny Drill + Menacing Hull을 쓰는 70 작업공간·시간 1의 특수 프로젝트로 서로 다른 Anomaly를 만들고, 그 Anomaly 사건이 해당 Codex와 색별 보상 패키지를 지급합니다.",
      options: [
        {name:"금색 코덱스 선택", id:"STR_CHOOSE_GOLD_QUERY", meta:"연구량 1 · +10점", effect:"Fuego/가두어진 이변 → 중간 +300점·큰 바위×30 → 금색 코덱스 + 은괴×12 + 금괴×36 + 보물 상자 + 우주복×3 + 제독의 복장 + 장교의 채찍"},
        {name:"회색 코덱스 선택", id:"STR_CHOOSE_GRAY_QUERY", meta:"연구량 1 · +10점", effect:"Fortuna/말할 수 없는 이변 → 중간 -210점·광기의 기록물×1 → 회색 코덱스 + 암호화 데이터 디스크×7 + 노움×1 + 똑똑이 복장 + 리베르 오컬터스 + 주술의 책"},
        {name:"적색 코덱스 선택", id:"STR_CHOOSE_RED_QUERY", meta:"연구량 1 · +10점", effect:"Metallo/폭풍 같은 이변 → 중간 -$25k → 적색 코덱스 + 구식 광선총×2 + 군용 광선총×2 + 광선총 전지×50 + 어그레서 갑옷×8 + 악마 해골"},
        {name:"녹색 코덱스 선택", id:"STR_CHOOSE_GREEN_QUERY", meta:"연구량 1 · +10점", effect:"Ventura/고요한 이변 → 중간 청소비×15 + 고철더미×7 → 녹색 코덱스 + 치료 젤×20 + 의료 보급품×10 + 간호사 복장 + 완벽한 슈퍼변이체 스테이시스 포드×3"}
      ],
      note:"네 query는 서로 직접 disables 합니다. 색 선택 뒤 실제 Codex 획득에는 Anomaly 생성·연구·이벤트 단계가 남으므로 ‘선택 즉시 Codex 연구 완료’는 아닙니다."
    },
    {
      title: "Codex 결손색 페널티",
      kind: "선택 후 잔존 결손색 효과",
      hint: "기본 4선장은 이미 3색을 갖습니다. 빠진 색을 Codex 선택으로 채우면 4색/Saint로 가지만, 이미 가진 색을 중복 선택해 결손색을 남기면 해당 3색 조합의 EXP 연구가 특정 테크를 추가 봉쇄합니다.",
      options: [
        {name:"녹색이 끝까지 없음", id:"STR_CODEX_GRAY_EXP", meta:"Gold + Red + Gray", effect:"Zombie Medicine + Mushroom Medicine 봉쇄"},
        {name:"회색이 끝까지 없음", id:"STR_CODEX_GREEN_EXP", meta:"Gold + Green + Red", effect:"Astrosensorium + Mutant Magic + Grimoire 봉쇄"},
        {name:"적색이 끝까지 없음", id:"STR_CODEX_GOLD_EXP", meta:"Gold + Green + Gray", effect:"Berserker Armor + Powered by Rage + Aggressor Armor Production 봉쇄"},
        {name:"금색이 끝까지 없음", id:"STR_CODEX_RED_EXP", meta:"Green + Red + Gray", effect:"Amazon Armor Production + Grav Cannon 봉쇄"}
      ],
      note:"따라서 기본 4선장에서 ‘Saint가 막힌다’가 비정답 Codex의 전부가 아닙니다. 남겨 둔 결손색에 따라 실제 연구 손실도 달라집니다."
    },
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
        {name:"위대한 여왕", id:"STR_QUEEN_GOLD", meta:"Gold Codex · +1000점", effect:"다른 Queen 4종 봉쇄. 원본 research dependency 기준 별도 전용 후속 연구는 확인되지 않음"},
        {name:"음험한 여왕", id:"STR_QUEEN_GRAY", meta:"Gray Codex · +1000점", effect:"다른 Queen 4종 봉쇄. 원본 research dependency 기준 별도 전용 후속 연구는 확인되지 않음"},
        {name:"멋쟁이 여왕", id:"STR_QUEEN_GREEN", meta:"Green Codex · +1000점", effect:"다른 Queen 4종 봉쇄. 원본 research dependency 기준 별도 전용 후속 연구는 확인되지 않음"},
        {name:"전사 여왕", id:"STR_QUEEN_RED", meta:"Red Codex · +1000점", effect:"다른 Queen 4종 봉쇄. 원본 research dependency 기준 별도 전용 후속 연구는 확인되지 않음"},
        {name:"야만 여왕", id:"STR_QUEEN_SAVAGE", meta:"needItem · +2000점", effect:"다른 Queen 4종 봉쇄 · Crowning 해금 · Captain Red와 조합 시 Warrior Culture 선행 · Pariah Training · History 051 선행"}
      ]
    },
    {
      title: "Bounty Hunting Challenge",
      kind: "직접 4지선다",
      hint: "STR_BOUNTY_HUNTING_CHALLENGE 뒤 네 선택지가 서로를 직접 봉쇄합니다.",
      options: [
        {name:"고블린 잭스에게 도전", id:"STR_BOUNTY_HUNTING_CHALLENGE_BANK", meta:"연구량 6", effect:"선택 결과 플래그에서 -500점. 장갑·무장된 노움 표적 포획 임무. 승리 연구 +250점; 별도 무료 연구 보상은 없음"},
        {name:"돌연변이 연맹에게 도전", id:"STR_BOUNTY_HUNTING_CHALLENGE_MA", meta:"연구량 6", effect:"즉시 Reticulan Electrogun 무료 연구 + Damsel Victim 지급. 선택 결과 -500점. 최대 12명의 훈련된 농부 부대를 요구하는 침투 임무. 승리 +250점 + Peasant Bondage Gear 무료 연구"},
        {name:"잭에게 도전", id:"STR_BOUNTY_HUNTING_CHALLENGE_JACK", meta:"연구량 6", effect:"선택 결과 -500점. 강한 대전차 화기를 권고하는 임무. 승리 +250점 + Casino Coupon 5 지급 + Tiger Turret Armor 무료 연구"},
        {name:"고객에게 도전하지 않음", id:"STR_BOUNTY_HUNTING_CHALLENGE_NONE", meta:"연구량 12", effect:"도전 활성 플래그를 봉쇄해 임무를 건너뜀. 결과 플래그 +500점; 다른 세 도전은 영구 봉쇄"}
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
        {name:"기사단", id:"STR_RED_KNIGHT_PREQ", meta:"연구량 1 · +100점", effect:"붉은 기사 훈련: Rank 3+, 근접 85+, Glamour×20, DOJO, $50k, 14일. 일반 stat은 용기+10·PsiStr+3; SoldierBonus는 전방/측면/후방/하부 장갑+3, TU/기력/체력/반응/근력/Mana+3, 용기+10, PsiStr-3. 인민의 군대 봉쇄 + Peasant Party 기반 혁명 지원군 A(25%)도 차단"},
        {name:"인민의 군대", id:"STR_PEOPLES_ARMY_PREQ", meta:"연구량 1 · +1000점", effect:"혁명적 광신 훈련: Revolutionary Training 선행, Glamour×1, DOJO, 비용 $0, 14일. 캡 미도달 총효과 기준 TU+11·기력+11·체력+6·용기+20·반응+1·사격+5·근력+6·PsiSkill+8·근접+5·Mana+6·전방/측면/후방/하부 장갑+1. 별도 혁명 지원군 C 25% 판정 추가; Red Knight가 아니므로 Peasant Party 지원군 A도 유지 가능"}
      ]
    },
    {
      title: "순수혈통 고용 vs 돌연변이 연맹",
      kind: "경로 상호배타",
      hint: "같은 화면의 즉시 2지선다라기보다, 한쪽 연구를 완료하면 다른 세력 루트가 닫히는 장기 선택입니다.",
      options: [
        {name:"순수혈통 병사 고용", id:"STR_RECRUIT_PUREBLOODS", meta:"연구량 10 · +100점", effect:"돌연변이 연맹 접촉 봉쇄. 이후 CULT 시설에서 Mutant Alliance Trophy Credit×250 + $10k + 100 작업시간으로 Pureblood 1명 반복 고용; Long Knife×1 + Infantry Laser×1 + 탄창×5 동반 지급"},
        {name:"돌연변이 연맹", id:"STR_CONTACT_MUTANT_ALLIANCE", meta:"연구량 10 · +1500점", effect:"Pureblood 전용 고용 연구 봉쇄 · School Books + Durasuit Procurement PREQ + Mutant Alliance Lore + Zero Zero PREQ + Hybrid Recruitment 즉시 해금"}
      ]
    },
    {
      title: "분석실 vs VIP 클럽",
      kind: "시설 경로 상호배타",
      hint: "연구 규칙상 STR_STUDY_ROOM과 STR_VIP_CLUB_FAC가 서로를 직접 disables 합니다.",
      options: [
        {name:"분석실", id:"STR_STUDY_ROOM", meta:"연구량 150 · +150점", effect:"VIP Club facility 연구 봉쇄 · Analytics 해금. 시설: 건설 $2.5m / 26일, 유지 $150k/월, Lab+4, ANAL 제공, Govt Corpse×200 + Cultural Wealth×50 필요"},
        {name:"VIP 클럽", id:"STR_VIP_CLUB_FAC", meta:"VIP Club 연구 종속", effect:"분석실 연구 봉쇄 · Analytics 해금. 시설: 건설 $1.35m / 20일, 월 유지비 -$500k = 매월 $500k 수입, Glamour×240, Lab+1, 훈련실16, Mana+8/day, ANAL+DOJO 제공"}
      ]
    },
    {
      title: "닥터 X 처리",
      kind: "일반 6지선다 + 오로라 대체 1개",
      hint: "보통 STR_GDX_011 뒤 6개 처리안 중 하나를 고릅니다. 그러나 앞서 ‘오로라를 위해 거드런 납치’를 고르면 그 6개가 전부 봉쇄되고, 조건부 7번째 선택 ‘닥터 X를 오로라에게 선물’로 대체됩니다.",
      options: [
        {name:"그녀를 고용", id:"STR_GDX_012", meta:"연구량 10", effect:"Doctor X Hire 지급 · Doctor X의 Spector 약탈 봉쇄 · Red Mage 예속 봉쇄"},
        {name:"그녀에게 장난치기", id:"STR_GDX_013", meta:"연구량 5", effect:"Doctor X A35 지급 · Spector 약탈 PREQ 해금 · Red Mage 예속 + 샘 공유 봉쇄"},
        {name:"그녀를 모욕", id:"STR_GDX_014", meta:"연구량 5", effect:"Doctor X C50 지급 · Spector 약탈 PREQ 해금"},
        {name:"그녀를 추방", id:"STR_GDX_015", meta:"연구량 5", effect:"Mystery Box 지급 · Spector 약탈 PREQ 해금"},
        {name:"그녀를 상품화", id:"STR_GDX_016", meta:"연구량 20", effect:"Doctor X Sale 지급 · Spector 약탈 PREQ 해금"},
        {name:"레드 메이지에게 선물", id:"STR_GDX_017", meta:"연구량 1", effect:"Red Mage 계열 lookup · Spector 약탈 PREQ 해금 · Red Mage 예속 봉쇄"},
        {name:"오로라에게 선물", id:"STR_GDX_018", meta:"연구량 1 · STR_TEC_168 필요", effect:"오로라 루트에서만 등장 · Spector 약탈 PREQ 해금"}
      ],
      note:"STR_TEC_168은 일반 GDX_012~017을 모두 직접 disable하고 GDX_018의 선행이 됩니다. 반대로 STR_TEC_169는 GDX_018을 disable합니다."
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
        {name:"협력하기", id:"STR_TEC_081", meta:"연구량 1", effect:"Book of Life 지급 · Dark Tech Recalibration(TEC_046) + 기사 거드런 + Red Mage 샘 공유 봉쇄"},
        {name:"거절하기", id:"STR_TEC_082", meta:"연구량 1", effect:"TEC_083 해금 · 협력 루트 봉쇄"}
      ]
    },
    {
      title: "오로라와 거드런",
      kind: "후기 스토리 2지선다",
      hint: "STR_TEC_172 뒤 거드런을 누구를 위해 확보할지 선택합니다.",
      options: [
        {name:"오로라를 위해 거드런 납치", id:"STR_TEC_168", meta:"연구량 1", effect:"TEC_180 PREQ 해금 · Doctor X 일반 6개 처리안 봉쇄 · 대신 GDX_018 ‘오로라에게 선물’ 활성 조건"},
        {name:"먼저 당신을 위해 거드런 확보", id:"STR_TEC_169", meta:"연구량 1", effect:"TEC_168 봉쇄 · Doctor X의 오로라 전용 GDX_018 봉쇄 · 이후 ‘오로라 도움’ 선택도 봉쇄"}
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
        {name:"레드 메이지 예속하기", id:"STR_WIZ_112", meta:"연구량 30 · +100점", effect:"WIZ_126_PROD + Doctor X 고용(GDX_012) + 장난(GDX_013) + Red Mage에게 선물(GDX_017) 봉쇄"}
      ]
    },
    {
      title: "레드 메이지의 샘",
      kind: "후기 스토리 2지선다",
      hint: "STR_WIZ_022 뒤 샘 공유/숨기기가 서로 직접 disables 합니다.",
      options: [
        {name:"샘 공유", id:"STR_WIZ_181", meta:"연구량 1", effect:"Mystery Box 지급 · Doctor X 장난(GDX_013) + Red-Eyes 협력(TEC_081) 봉쇄"},
        {name:"샘 숨기기", id:"STR_WIZ_182", meta:"연구량 1", effect:"샘 공유 루트만 봉쇄"}
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
