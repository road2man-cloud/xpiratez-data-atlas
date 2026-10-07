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
      hint: "STR_TINY_DRILL_INVESTIGATION 뒤 STR_CHOOSE_*_QUERY 네 색 중 하나를 고릅니다. 선택 뒤 Tiny Drill + Menacing Hull 특수 프로젝트로 Anomaly를 만들고, 해당 Anomaly를 연구한 뒤 이벤트 연쇄에서 실제 Codex와 색별 보상을 받습니다.",
      options: [
        {name:"금색 코덱스 선택", id:"STR_CHOOSE_GOLD_QUERY", meta:"연구량 1 · +10점", effect:"Fuego Anomaly → Gold Codex"},
        {name:"회색 코덱스 선택", id:"STR_CHOOSE_GRAY_QUERY", meta:"연구량 1 · +10점", effect:"Fortuna Anomaly → Gray Codex"},
        {name:"적색 코덱스 선택", id:"STR_CHOOSE_RED_QUERY", meta:"연구량 1 · +10점", effect:"Metallo Anomaly → Red Codex"},
        {name:"녹색 코덱스 선택", id:"STR_CHOOSE_GREEN_QUERY", meta:"연구량 1 · +10점", effect:"Ventura Anomaly → Green Codex"}
      ],
      note:"특수 프로젝트 규칙은 space 70 / time 1이며 Tiny Drill과 Menacing Hull을 요구하고 refund:true라 재료를 반환합니다. 실제 Codex 획득 전 해당 Anomaly 연구(cost 4)와 이벤트 단계가 남습니다."
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
      kind: "경로 상호배타 결과",
      hint: "Queen 연구 5종이 서로를 직접 disables 합니다. 같은 시점의 단순 5지선다라기보다 네 색은 해당 Codex 결과, Savage는 별도 needItem 루트이므로 ‘경로 결과’로 표시합니다.",
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
      kind: "일반 6지선다 + 오로라 대체 1개",
      hint: "보통 STR_GDX_011 뒤 6개 처리안 중 하나를 고릅니다. 그러나 앞서 ‘오로라를 위해 거드런 납치’를 고르면 그 6개가 전부 봉쇄되고, 조건부 7번째 선택 ‘닥터 X를 오로라에게 선물’로 대체됩니다.",
      options: [
        {name:"그녀를 고용", id:"STR_GDX_012", meta:"연구량 10", effect:"Doctor X Hire 지급"},
        {name:"그녀에게 장난치기", id:"STR_GDX_013", meta:"연구량 5", effect:"Doctor X A35 지급 · Spector 약탈 PREQ 해금"},
        {name:"그녀를 모욕", id:"STR_GDX_014", meta:"연구량 5", effect:"Doctor X C50 지급 · Spector 약탈 PREQ 해금"},
        {name:"그녀를 추방", id:"STR_GDX_015", meta:"연구량 5", effect:"Mystery Box 지급 · Spector 약탈 PREQ 해금"},
        {name:"그녀를 상품화", id:"STR_GDX_016", meta:"연구량 20", effect:"Doctor X Sale 지급 · Spector 약탈 PREQ 해금"},
        {name:"레드 메이지에게 선물", id:"STR_GDX_017", meta:"연구량 1", effect:"Red Mage 계열 lookup · Spector 약탈 PREQ 해금"},
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
        {name:"협력하기", id:"STR_TEC_081", meta:"연구량 1", effect:"Book of Life 지급 · 일부 Gudrun/Red Mage 경로 추가 봉쇄"},
        {name:"거절하기", id:"STR_TEC_082", meta:"연구량 1", effect:"TEC_083 해금"}
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

  const consequences = {
    STR_THREAD_OF_PROPHECY_PERSONALITY:{preq:"Personality Test + STR_THREAD_OF_PROPHECY",gain:"STR_CAPTAIN_PUSSY로 이어지는 예언 전용 대체 진입",loss:"일반 초기 5선장 선택 전체",recovery:"Thread of Prophecy를 확보하기 전 세이브가 아니면 일반 5선장으로 되돌리는 우회 없음."},

    STR_GALS_ARE_SUPERIOR_PREQ:{preq:"STR_DIVERGING_PATHS",loss:"다른 갈라지는 길 4개 + Nekomimi Network",recovery:"선택 전 회피만 가능."},
    STR_WE_NEED_MALE_TOUCH_PREQ:{preq:"STR_DIVERGING_PATHS",loss:"다른 갈라지는 길 4개 + Nekomimi Network",recovery:"선택 전 회피만 가능."},
    STR_PEASANT_REVOLUTION_PREQ:{preq:"STR_DIVERGING_PATHS + Farmer Recruitment",loss:"다른 갈라지는 길 4개 + Nekomimi Network + Pure Maiden Training",recovery:"선택 전 회피만 가능."},
    STR_HYBRID_PATH_PREQ:{preq:"STR_DIVERGING_PATHS + STR_TAKE_ME_TO_YOUR_DEALER",gain:"STR_RETICULAN 무료 획득 + Reticulan/Hybrid 장기축",loss:"다른 갈라지는 길 4개",recovery:"Hybrid Recruitment에는 별도로 Mutant Alliance + Human-Reticulan Alliance 등이 필요."},
    STR_CAT_PATH_PREQ:{preq:"STR_DIVERGING_PATHS + Alien Origins + Communications",gain:"Nekomimi 연구 무료 획득 + Nekomimi Network 축",loss:"다른 갈라지는 길 4개",recovery:"선택 전 회피만 가능."},

    STR_CHOOSE_GOLD_QUERY:{preq:"STR_TINY_DRILL_INVESTIGATION",gain:"query +10점 → STR_USE_DRILL_GOLD(space 70/time 1, Tiny Drill+Menacing Hull, refund) → Fuego Anomaly 연구(cost 4) → 중간 이벤트 +300점·큰 바위×30 → 최종 이벤트에서 Gold Codex + 은괴×12 + 금괴×36 + 보물 상자 + 우주복×3 + 제독의 복장 + 장교의 채찍",loss:"다른 Codex 색 query 3개",recovery:"다른 색 query를 직접 disable하므로 선택 후 색 변경 불가."},
    STR_CHOOSE_GRAY_QUERY:{preq:"STR_TINY_DRILL_INVESTIGATION",gain:"query +10점 → STR_USE_DRILL_GRAY(space 70/time 1, 재료 refund) → Fortuna Anomaly 연구(cost 4) → 중간 이벤트 -210점·광기의 기록물×1 → 최종 이벤트에서 Gray Codex + 암호화 데이터 디스크×7 + 노움×1 + 똑똑이 복장 + 리베르 오컬터스 + 주술의 책",loss:"다른 Codex 색 query 3개",recovery:"다른 색 query를 직접 disable하므로 선택 후 색 변경 불가."},
    STR_CHOOSE_RED_QUERY:{preq:"STR_TINY_DRILL_INVESTIGATION",gain:"query +10점 → STR_USE_DRILL_RED(space 70/time 1, 재료 refund) → Metallo Anomaly 연구(cost 4) → 중간 이벤트 -$25k → 최종 이벤트에서 Red Codex + 구식 광선총×2 + 군용 광선총×2 + 광선총 전지×50 + 어그레서 갑옷×8 + 악마 해골",loss:"다른 Codex 색 query 3개",recovery:"다른 색 query를 직접 disable하므로 선택 후 색 변경 불가."},
    STR_CHOOSE_GREEN_QUERY:{preq:"STR_TINY_DRILL_INVESTIGATION",gain:"query +10점 → STR_USE_DRILL_GREEN(space 70/time 1, 재료 refund) → Ventura Anomaly 연구(cost 4) → 중간 이벤트 청소비×15·고철더미×7 → 최종 이벤트에서 Green Codex + 치료 젤×20 + 의료 보급품×10 + 간호사 복장 + 완벽한 슈퍼변이체 스테이시스 포드×3",loss:"다른 Codex 색 query 3개",recovery:"다른 색 query를 직접 disable하므로 선택 후 색 변경 불가."},

    STR_CODEX_GRAY_EXP:{gain:"Gold + Red + Gray 상태 유지",loss:"Green 결손 → Zombie Medicine + Mushroom Medicine",recovery:"Codex 선택 시 빠진 Green을 채우면 이 결손 상태를 피할 수 있음."},
    STR_CODEX_GREEN_EXP:{gain:"Gold + Green + Red 상태 유지",loss:"Gray 결손 → Astrosensorium + Mutant Magic + Grimoire",recovery:"Codex 선택 시 빠진 Gray를 채우면 회피."},
    STR_CODEX_GOLD_EXP:{gain:"Gold + Green + Gray 상태 유지",loss:"Red 결손 → Berserker Armor + Powered by Rage + Aggressor Armor Production",recovery:"Codex 선택 시 빠진 Red를 채우면 회피."},
    STR_CODEX_RED_EXP:{gain:"Green + Red + Gray 상태 유지",loss:"Gold 결손 → Amazon Armor Production + Grav Cannon",recovery:"Codex 선택 시 빠진 Gold를 채우면 회피."},

    STR_EMBRACE_THE_POWER:{preq:"STR_QUESTION_OF_DRILL",gain:"Menacing Hull / Shadow Chasing 쪽을 유지하고 Tiny Drill Investigation → Codex Choice 경로를 보존",loss:"STR_REJECT_THE_POWER 및 Reject가 즉시 여는 Cinderella Project 선행",recovery:"Reject와 직접 상호배타. Tiny Drill 조사까지 살리려면 이쪽."},
    STR_REJECT_THE_POWER:{preq:"STR_QUESTION_OF_DRILL",gain:"STR_CINDERELLA_PROJECT_PREQ 즉시 해금 + Ninja Weapon Use 요구조건",loss:"STR_EMBRACE_THE_POWER + STR_TINY_DRILL_INVESTIGATION → Tiny Drill 기반 Codex Choice 경로",recovery:"Tiny Drill 조사는 직접 disable되므로 이 경로에서는 복구 불가."},

    STR_QUEEN_GOLD:{preq:"STR_CODEX_GOLD",gain:"Magnificent Queen 상태 · +1000점",loss:"다른 Queen 4종",recovery:"Codex/Queen 진행 전 경로 선택으로만 회피."},
    STR_QUEEN_GRAY:{preq:"STR_CODEX_GRAY",gain:"Insidious Queen 상태 · +1000점",loss:"다른 Queen 4종",recovery:"Codex/Queen 진행 전 경로 선택으로만 회피."},
    STR_QUEEN_GREEN:{preq:"STR_CODEX_GREEN",gain:"Gentle Queen 상태 · +1000점",loss:"다른 Queen 4종",recovery:"Codex/Queen 진행 전 경로 선택으로만 회피."},
    STR_QUEEN_RED:{preq:"STR_CODEX_RED",gain:"Warrior Queen 상태 · +1000점",loss:"다른 Queen 4종",recovery:"Codex/Queen 진행 전 경로 선택으로만 회피."},
    STR_QUEEN_SAVAGE:{preq:"별도 Queen Savage 실물 조건",gain:"Savage Queen · +2000점 + STR_CROWNING_UC 해금. 추가로 Pariah Training과 History 051의 선행이며, Captain Red 보유 시 STR_QUEEN_SAVAGE_RED를 통해 Warrior Culture PREQ도 해금",loss:"색상 Queen 4종",recovery:"다른 Queen이 먼저 확정되면 복구 불가."},

    STR_BOUNTY_HUNTING_CHALLENGE_JACK:{preq:"STR_BOUNTY_HUNTING_CHALLENGE",gain:"선택 결과 플래그에서 -500점. 승리 시 +250점 + Casino Coupon ×5 + TIGER_TURRET_ARMOR 무료 연구",loss:"Mutant Alliance / Goblin Zaxx / 도전하지 않음",recovery:"같은 Challenge에서 다른 상대 재선택 불가."},
    STR_BOUNTY_HUNTING_CHALLENGE_MA:{preq:"STR_BOUNTY_HUNTING_CHALLENGE",gain:"선택 즉시 Reticulan Electrogun 무료 연구 + Damsel Victim 지급, 결과 플래그 -500점; 승리 시 +250점 + Peasant Bondage Gear 무료 연구",loss:"Jack / Goblin Zaxx / 도전하지 않음",recovery:"다른 상대 재선택 불가."},
    STR_BOUNTY_HUNTING_CHALLENGE_BANK:{preq:"STR_BOUNTY_HUNTING_CHALLENGE",gain:"Goblin Zaxx Challenge 진행; 선택 결과 플래그 -500점, 승리 연구 +250점",loss:"Jack / Mutant Alliance / 도전하지 않음",recovery:"다른 상대 재선택 불가."},
    STR_BOUNTY_HUNTING_CHALLENGE_NONE:{preq:"STR_BOUNTY_HUNTING_CHALLENGE",gain:"전투 도전 없이 Challenge Done; NONE_CHOSEN 상태 +500점",loss:"세 도전 임무의 승리 보상",recovery:"Challenge Active도 닫혀 나중에 도전으로 되돌릴 수 없음."},

    STR_CBT_TOURNAMENT_CHALLENGER_NINJA_DEFEAT_BANISH_PREQ:{preq:"Ninja Champion Defeat + SUMM",gain:"Mystery Box ×1 +250점",loss:"예속의 Slave Ninja Champion + 사귀기의 Ninja Scroll/+1500점",recovery:"결과 연구까지 서로 disable되어 복구 불가."},
    STR_CBT_TOURNAMENT_CHALLENGER_NINJA_DEFEAT_ENSLAVE_PREQ:{preq:"Ninja Champion Defeat",gain:"Slave Ninja Champion ×1 +100점",loss:"추방 Mystery Box + 사귀기 Ninja Scroll/+1500점",recovery:"복구 불가."},
    STR_CBT_TOURNAMENT_CHALLENGER_NINJA_DEFEAT_BEFRIEND_PREQ:{preq:"Ninja Champion Defeat",gain:"Ninja Scroll ×1 +1500점",loss:"추방 Mystery Box + 예속 Slave Ninja Champion",recovery:"복구 불가."},

    STR_RED_KNIGHT_PREQ:{preq:"STR_THE_GREAT_CAUSE",gain:"STR_RED_KNIGHT 변환: 기본 Soldier/S/M/V/X/W 및 Damsel, Rank 3+, 근접 85+, stat-gain commendation, Glamour×20, DOJO, $50k, 14일. 일반 flat stat(캡 적용): 용기+10·PsiStr+3. SoldierBonus(별도 레이어): 전/측/후/하부 장갑+3, TU/기력/체력/반응/근력/Mana+3, 용기+10, PsiStr-3. Red Knight 선택은 Peasant Party 혁명 지원군 A(25%) 조건도 차단",loss:"STR_PEOPLES_ARMY_PREQ + STR_RED_FANATIC 변환",recovery:"두 PREQ가 직접 상호배타."},
    STR_PEOPLES_ARMY_PREQ:{preq:"STR_THE_GREAT_CAUSE",gain:"STR_RED_FANATIC 변환: Revolutionary Training 완료 Peasant/Damsel/Slave/Lamia, Glamour×1, DOJO, $0, 14일. 일반 flat stat(캡 적용): TU+10·기력+10·체력+5·용기+10·사격+5·근력+5·PsiSkill+5·근접+5·Mana+5. SoldierBonus(별도 레이어): 전/측/후/하부 장갑+1, TU/기력/체력/반응/근력/Mana+1, 용기+10, PsiSkill+3. People’s Army는 혁명 지원군 C 25% 판정을 추가하고 Red Knight가 아니므로 Peasant Party 지원군 A 25%도 유지 가능",loss:"STR_RED_KNIGHT_PREQ + STR_RED_KNIGHT 변환",recovery:"두 PREQ가 직접 상호배타."},

    STR_RECRUIT_PUREBLOODS:{preq:"STR_GDX_129 + STR_SLAVE_SOLDIERS",gain:"Pureblood 고용 제조: 100 worker-h + $10k + Mutant Alliance Trophy Credit ×250 → Pureblood 1명 + Long Knife + Infantry Laser + 탄창 5",loss:"Mutant Alliance 접촉 + School Books + Durasuit Procurement + Mutant Alliance Lore + Zero Zero + Hybrid Recruitment",recovery:"Mutant Alliance 연구 자체를 disable하므로 이후 Hybrid 축 우회 없음."},
    STR_CONTACT_MUTANT_ALLIANCE:{preq:"Alien Origins + Mutant Origins + Logistics + Alien Terror + MA Trophy 75 + Alliance Favors + Captain Rank 04",gain:"School Books + Durasuit Procurement + Mutant Alliance Lore + Zero Zero + Hybrid Recruitment 해금; Medical Supplies 구매 가능",loss:"Pureblood 직접 고용 연구/제조",recovery:"Life Is Hybrid 후 Bugeye/Hybrid 축을 살리려면 이쪽이 핵심."},

    STR_STUDY_ROOM:{preq:"Schooling 2 + Data Mining + Steam Power + Alchemy + Engineer+ + Healer+ + Personal Labs",gain:"Analytics + Study Room: 건설 $2.5m/26일, 유지 $150k/월, Govt Corpse×200 + Cultural Wealth×50, Lab +4, ANAL",loss:"VIP Club 시설 연구: 월 +$500k, Training 16, Mana +8/day, DOJO",recovery:"STR_VIP_CLUB_FAC와 직접 상호배타."},
    STR_VIP_CLUB_FAC:{preq:"STR_VIP_CLUB",gain:"Analytics + VIP Club: $1.35m/20일, Glamour×240, 월 +$500k, Lab +1, Training 16, Mana +8/day, ANAL+DOJO",loss:"Study Room의 Lab +4 연구 인프라",recovery:"STR_STUDY_ROOM과 직접 상호배타."},

    STR_GDX_012:{preq:"STR_GDX_011 + Honor",gain:"STR_DOCTOR_X_HIRE 지급 → Ocular + Dr. X Spector 관련 후속",loss:"Prank/Humiliate/Banish/Merchandize/Red Mage 선물 + Red Mage 예속",recovery:"일반 Dr. X 처리 변경 불가."},
    STR_GDX_013:{preq:"STR_GDX_011 + Lingerie Set + LFS_002 + Creativity",gain:"Doctor X A35 지급 + Spector 약탈 PREQ + Appease Dr. X 축",loss:"다른 일반 Dr. X 처리 + Red Mage 예속 + Red Mage Fountain Share",recovery:"세 스토리 축에 교차 봉쇄가 생김."},
    STR_GDX_014:{preq:"STR_GDX_011 + Zombie Sustenance + Interrogation + Justice",gain:"Doctor X C50 지급 + Spector 약탈 PREQ + Humiliating Dr. X 프로젝트",loss:"다른 일반 Dr. X 처리",recovery:"복구 불가."},
    STR_GDX_015:{preq:"STR_GDX_011 + STR_NEC_001",gain:"Mystery Box ×1 + Spector 약탈 PREQ",loss:"다른 일반 Dr. X 처리",recovery:"복구 불가."},
    STR_GDX_016:{preq:"STR_GDX_011 + Plotting + Captain Rank 05 + Savvyness",gain:"Doctor X Sale 지급 + Spector 약탈 PREQ; Sell Dr. X to Jack → Credit Chip M ×2000",loss:"다른 일반 Dr. X 처리",recovery:"복구 불가."},
    STR_GDX_017:{preq:"STR_GDX_011 + STR_WIZ_102",gain:"STR_WIZ_127 Red Mage's New Maid → Black Tower 축 + Spector 약탈 PREQ",loss:"다른 일반 Dr. X 처리 + Red Mage 예속",recovery:"복구 불가."},
    STR_GDX_018:{preq:"STR_GDX_011 + STR_TEC_168",gain:"Experiment-X(STR_GDX_053) + Spector 약탈 PREQ → STR_TEC_190/Aurora 축",loss:"STR_TEC_169를 선택한 경우 이 루트 자체가 봉쇄",recovery:"TEC168을 택하면 일반 GDX012~017이 먼저 닫히므로 조건부 대체 선택."},

    STR_GDX_065:{preq:"GDX_064 + Doctor X A40 + Dancer Slave + Honor + Justice",gain:"Marry Dr. X 특수 프로젝트 → Doctor X A60 축",loss:"Knight / Vampire Princess",recovery:"세 결과가 직접 상호배타."},
    STR_GDX_066:{preq:"GDX_064 + Doctor X A40 + Emancipation + Honor",gain:"Knight Dr. X 프로젝트 → Doctor X Knight 50",loss:"Lady / Vampire Princess; Red-Eyes 협력을 먼저 택하면 이 선택도 봉쇄",recovery:"복구 불가."},
    STR_GDX_067:{preq:"GDX_064 + Doctor X Vampire",gain:"Gudrun Vampire Princess 반복 이벤트 풀 4개 활성화(각 executionOdds 36)",loss:"Lady / Knight",recovery:"복구 불가."},

    STR_TEC_081:{preq:"STR_TEC_080",gain:"Book of Life 지급 + STR_TEC_100X/STR_TEC_181 후속 선행",loss:"Red-Eyes 거절 + Shadowtech 재교정 + Knight Gudrun + Red Mage Fountain Share",recovery:"여러 스토리 축 교차봉쇄라 선택 전 확인 필요."},
    STR_TEC_082:{preq:"STR_TEC_080",gain:"STR_TEC_083 해금 + STR_NO_AGGRESSION 선행",loss:"Red-Eyes 협력 + Book of Life/협력 후속",recovery:"협력 루트 복구 불가."},

    STR_TEC_168:{preq:"STR_TEC_172",gain:"STR_TEC_180_PREQ + Doctor X → Aurora(GDX018) 조건",loss:"STR_TEC_169 + 일반 Dr. X 처리 GDX012~017",recovery:"Dr. X 처리까지 사실상 고정하는 고영향 선택."},
    STR_TEC_169:{preq:"STR_TEC_172",gain:"Gudrun을 자기 루트에 보존",loss:"STR_TEC_168 + GDX018 + 이후 STR_TEC_178 Help",recovery:"다음 Aurora 분기 폭도 줄어듦."},

    STR_TEC_178:{preq:"STR_TEC_176",gain:"STR_TEC_182_PREQ + Family Ties Aurora + STR_TEC_181 + Hanged Princess 후속",loss:"STR_TEC_179 + STR_TEC_169",recovery:"TEC169가 먼저면 이 선택은 이미 봉쇄."},
    STR_TEC_179:{preq:"STR_TEC_176",gain:"STR_TEC_083 해금",loss:"STR_TEC_178 Help 후속축",recovery:"Help 전용 후속은 복구 불가."},

    STR_TEC_196:{preq:"STR_TEC_103 + STR_TEC_183",gain:"STR_PRISS_CC_UC craft armament 축",loss:"Servant / Sacrifice",recovery:"세 이용 방식 직접 상호배타."},
    STR_TEC_197:{preq:"STR_TEC_103 + STR_TEC_183",gain:"Nine Circles PREQ + Mistress of Hell Aurora 프로젝트(1000 worker-h)",loss:"Weapon / Sacrifice",recovery:"직접 상호배타."},
    STR_TEC_198:{preq:"STR_TEC_103 + STR_TEC_183",gain:"STR_TEC_110_UNUSED + Frozen Aurora(STR_TEC_199) 축",loss:"Weapon / Servant",recovery:"직접 상호배타."},

    STR_WIZ_112_NO:{preq:"STR_WIZ_111 + Chronomancy",gain:"Treasure Chest 지급 + STR_WIZ_025 결과",loss:"Red Mage 예속/Slave Red Mage",recovery:"STR_WIZ_112를 직접 disable."},
    STR_WIZ_112:{preq:"STR_WIZ_111 + Chronomancy",gain:"Enslave: Red Mage → STR_WIZ_113 Slave Red Mage 축",loss:"Trust + Doctor X 고용/장난/Red Mage 선물 + Red Mage용 X-Slave 준비",recovery:"Dr. X 선택과 교차봉쇄."},

    STR_WIZ_181:{preq:"STR_WIZ_022",gain:"Mystery Box ×1 + STR_WIZ_023 결과",loss:"Fountain Hide + Doctor X Prank + Red-Eyes Cooperate",recovery:"GDX013 또는 TEC081이 먼저면 Share가 이미 봉쇄."},
    STR_WIZ_182:{preq:"STR_WIZ_022",gain:"STR_WIZ_041 결과",loss:"Fountain Share + Mystery Box",recovery:"Share만 직접 봉쇄."}
  };

  function esc(v){
    return String(v ?? "").replace(/[&<>"']/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));
  }

  function renderOption(o,g){
    const c=consequences[o.id]||{};
    const peerLoss=g.options.filter(x=>x.id!==o.id).map(x=>x.name).join(" · ");
    const preq=c.preq||"상위 분기 조건 충족";
    const gain=c.gain||o.effect||"—";
    const loss=c.loss||(peerLoss||"추가 직접 봉쇄 없음");
    const recovery=c.recovery||(peerLoss?"같은 세이브에서 해당 상호배타 선택으로 직접 복구 불가.":"별도 복구 제한 없음.");
    return '<article class="choice-option">'+
      '<div class="choice-option-head"><div><strong>'+esc(o.name)+'</strong><small>'+esc(o.id)+' · '+esc(o.meta)+'</small></div></div>'+
      '<div class="choice-effects-wrap"><span class="choice-effects-title">장기 영향</span>'+
        '<div class="choice-effect-list">'+
          '<div class="choice-effect"><b>선행</b><span>'+esc(preq)+'</span></div>'+
          '<div class="choice-effect"><b>얻는 것</b><span>'+esc(gain)+'</span></div>'+
        '</div>'+
      '</div>'+
      '<p class="choice-consequence"><b>영구 손실:</b> '+esc(loss)+'</p>'+
      '<p class="choice-late"><b>복구/우회:</b> '+esc(recovery)+'</p>'+
    '</article>';
  }

  function renderGroup(g, idx){
    return '<article class="choice-stage card">'+
      '<div class="choice-stage-head"><div><p class="eyebrow">추가 분기 '+(idx+1)+'</p><h3>'+esc(g.title)+'</h3><p>'+esc(g.hint)+'</p></div><span class="one-choice-badge">'+esc(g.kind)+'</span></div>'+
      '<div class="choice-grid">'+g.options.map(o=>renderOption(o,g)).join("")+'</div>'+
      (g.note?'<p class="choice-late"><b>구조 주의:</b> '+esc(g.note)+'</p>':'')+
    '</article>';
  }

  const root=document.querySelector("#exclusiveRules");
  if(!root) return;

  const heading=document.createElement("article");
  heading.className="card";
  heading.innerHTML='<p class="eyebrow">원본 ruleset 상호배타 감사</p>'+
    '<h3>선장·Codex·갈라지는 길 외 추가 분기</h3>'+
    '<p class="muted">v.o1.1.1 정규화 연구 DB에서 <b>raw.disables 보유 연구 163개 / 연결요소 86개</b>를 전수 검사했습니다. 단순 PREQ/result 안전장치·완료 플래그는 제외하고, 실제 선택축과 선택 뒤 영구 손실만 분리했습니다.</p>';
  root.appendChild(heading);
  root.insertAdjacentHTML("beforeend", groups.map(renderGroup).join(""));
})();
