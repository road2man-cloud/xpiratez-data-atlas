const S={yes:"✅",late:"◇",no:"❌",warn:"⚠"};
const columns=[
  {key:"ev",label:"총 반복 현금성 EV/월",group:"경제",type:"ev"},
  {key:"hotel",label:"호텔 +360k/월",group:"경제"},
  {key:"vip",label:"VIP +500k/월",group:"경제"},
  {key:"nonprofit",label:"비영리 연구실 +150k/월",group:"경제"},
  {key:"scamming",label:"사기 제조",group:"경제"},
  {key:"bulk",label:"덩어리 캐내기",group:"경제"},
  {key:"ultimateCash",label:"666k 이벤트",group:"경제"},
  {key:"irradiator",label:"방사탑",group:"방어·탐지"},
  {key:"necro",label:"네크로방어",group:"방어·탐지"},
  {key:"bunker",label:"벙커",group:"방어·탐지"},
  {key:"tactical",label:"전술센터",group:"방어·탐지"},
  {key:"treasure",label:"보물 사냥",group:"방어·탐지"},
  {key:"boot",label:"신병 훈련",group:"병사 강화"},
  {key:"military",label:"군사 훈련",group:"병사 강화"},
  {key:"bread",label:"건강미 훈련",group:"병사 강화"},
  {key:"warrior",label:"전사 문화",group:"병사 강화"},
  {key:"charmy",label:"Charmy Dance",group:"병사 강화"},
  {key:"saint",label:"혼돈의 성자",group:"특수병·마법"},
  {key:"saintReinf",label:"성자 지원군",group:"특수병·마법"},
  {key:"orthodox",label:"정통파 마법사 영애",group:"특수병·마법"},
  {key:"transfig",label:"변신술 의식",group:"특수병·마법"},
  {key:"xlarge",label:"초대형 저장고",group:"인프라"},
  {key:"capsule",label:"캡슐 숙소",group:"인프라"},
  {key:"doubleJail",label:"2배 감옥",group:"인프라"},
  {key:"dungeon",label:"지하감옥 마스터",group:"인프라"},
  {key:"codexGold",label:"금색 코덱스",group:"Codex 상호배타",type:"codex",color:"Gold"},
  {key:"codexGreen",label:"녹색 코덱스",group:"Codex 상호배타",type:"codex",color:"Green"},
  {key:"codexRed",label:"적색 코덱스",group:"Codex 상호배타",type:"codex",color:"Red"},
  {key:"codexGray",label:"회색 코덱스",group:"Codex 상호배타",type:"codex",color:"Gray"}
];

const rows=[
 {id:"jackass",name:"?무모한 선장?",code:"JACKASS",stage:"initial",stageName:"초기",from:"지금(1/26)",route:"초기 성격검사 → 무모한",colors:["Gold","Red","Gray"],ev:60386,evText:"≈+$60.4k",hotel:"no",vip:"no",nonprofit:"no",scamming:"no",bulk:"no",ultimateCash:"no",irradiator:"yes",necro:"no",bunker:"no",tactical:"no",treasure:"yes",boot:"no",military:"no",bread:"no",warrior:"yes",charmy:"no",saint:"late",saintReinf:"late",orthodox:"no",transfig:"no",xlarge:"no",capsule:"no",doubleJail:"no",dungeon:"yes",summary:"돈보다 탐험·공격적 콘텐츠. JackSore/JackDumb/JackLazy를 동시에 열어 방사탑·전사문화·보물사냥·지하감옥에 접근한다.",notes:["현재 활성화되는 기본·성향·색·결손색·Flaw·Double 반복 이벤트를 합친 현금성 EV는 약 +$60.4k/월.","후기 4색 완성 시 혼돈의 성자 가능.","보물사냥은 기지가 있는 각 지역에서 월 21% 판정으로 Lootbox 기회를 만든다."]},
 {id:"dumbass",name:"?멍청한 선장?",code:"DUMBASS",stage:"initial",stageName:"초기",from:"지금(1/26)",route:"초기 성격검사 → 멍청한",colors:["Gold","Green","Red"],ev:82267,evText:"≈+$82.3k",hotel:"no",vip:"yes",nonprofit:"no",scamming:"yes",bulk:"no",ultimateCash:"no",irradiator:"no",necro:"no",bunker:"yes",tactical:"no",treasure:"no",boot:"no",military:"no",bread:"no",warrior:"yes",charmy:"yes",saint:"late",saintReinf:"late",orthodox:"late",transfig:"no",xlarge:"no",capsule:"no",doubleJail:"no",dungeon:"no",summary:"초반 현금 EV가 기본 4선장 중 가장 높고, 벙커·전사문화·VIP·댄스훈련·Saint 특수병까지 연결되는 다재다능형.",notes:["현재 활성화되는 전체 반복 이벤트 현금성 EV 약 +$82.3k/월.","VIP Club: 건설 $1.35m, 월수익 +$500k, Lab+1/Training16/Mana+8.","Dumbass+Saint이면 별도 7%/월로 정통파 마법사 영애 + $100k 이벤트."]},
 {id:"lazyass",name:"?게으른 선장?",code:"LAZYASS",stage:"initial",stageName:"초기",from:"지금(1/26)",route:"초기 성격검사 → 게으른",colors:["Gold","Green","Gray"],ev:8543,evText:"≈+$8.5k",hotel:"yes",vip:"no",nonprofit:"no",scamming:"no",bulk:"no",ultimateCash:"no",irradiator:"no",necro:"yes",bunker:"no",tactical:"no",treasure:"no",boot:"no",military:"no",bread:"no",warrior:"late",charmy:"no",saint:"late",saintReinf:"late",orthodox:"no",transfig:"no",xlarge:"no",capsule:"no",doubleJail:"no",dungeon:"no",summary:"호텔과 네크로방어가 핵심. 전투 고유성보다는 현금흐름·기지 편의가 강하다.",notes:["현재 활성화되는 전체 반복 이벤트 현금성 EV 약 +$8.5k/월.","호텔: $1.2m, 월 +$360k, 인원+25/훈련12/저장50/Mana+9.","네크로방어는 Flak Tower Kit를 25mm 기관포 대신 Necroplane Parts 25개로 생산."]},
 {id:"soreass",name:"?소심한 선장?",code:"SOREASS",stage:"initial",stageName:"초기",from:"지금(1/26)",route:"초기 성격검사 → 소심한",colors:["Green","Red","Gray"],ev:37236,evText:"≈+$37.2k",hotel:"no",vip:"no",nonprofit:"no",scamming:"no",bulk:"yes",ultimateCash:"no",irradiator:"warn",necro:"yes",bunker:"yes",tactical:"yes",treasure:"no",boot:"yes",military:"no",bread:"no",warrior:"late",charmy:"no",saint:"late",saintReinf:"late",orthodox:"no",transfig:"no",xlarge:"no",capsule:"no",doubleJail:"no",dungeon:"no",summary:"방어·탐지·병사 기본육성의 종합형. JackSore+LazySore+SoreDumb 세 방어 성향을 한 번에 보존하는 유일한 초기 선장.",notes:["방사탑 + 네크로방어 + 벙커 + 전술센터 + 신병훈련을 모두 보존.","방사탑 1기당 부상회복 속도 1.00→0.65/day(다른 치료보너스 없을 때).","암살 이벤트의 위험 결과를 안전 결과가 약 50% 대체."]},
 {id:"pussy",name:"?위와는 다른 선장?",code:"PUSSY",stage:"initial",stageName:"초기",from:"지금(1/26)",route:"초기 성격검사 → 위와는 다른",colors:[],ev:0,evText:"≈$0",hotel:"no",vip:"no",nonprofit:"late",scamming:"late",bulk:"no",ultimateCash:"late",irradiator:"late",necro:"late",bunker:"late",tactical:"no",treasure:"no",boot:"late",military:"late",bread:"late",warrior:"late",charmy:"no",saint:"no",saintReinf:"no",orthodox:"no",transfig:"late",xlarge:"late",capsule:"late",doubleJail:"late",dungeon:"no",summary:"즉시 완성형이 아니라 분기용 입구. 2/1 PUSSY_UP 이후 클래스 선택, 3/1 무직 분기, 4/1 Pure 분기로 확장된다.",notes:["혼돈의 성자 조건에서 CAPTAIN_PUSSY:false라 Saint는 영구 포기.","대신 초대형 저장고와 여러 PUSSY 전용 인프라 경로가 열린다."]},

 {id:"thief",name:"?도둑 계급 선장?",code:"THIEF",stage:"class",stageName:"PUSSY 2단계",from:"최단 2/1",route:"PUSSY → 도둑",colors:["Gold","Green","Gray"],ev:43611,evText:"≈+$43.6k",hotel:"no",vip:"no",nonprofit:"no",scamming:"yes",bulk:"no",ultimateCash:"no",irradiator:"no",necro:"no",bunker:"no",tactical:"no",treasure:"no",boot:"no",military:"no",bread:"no",warrior:"no",charmy:"no",saint:"no",saintReinf:"no",orthodox:"no",transfig:"no",xlarge:"yes",capsule:"no",doubleJail:"no",dungeon:"no",summary:"사기 제조와 Gold 계열 경제 이벤트를 챙기는 PUSSY 경제 클래스.",notes:["Scamming 기대 산출물 약 $2,656/회, Govt Corpse 판매 기회비용과 제조비를 뺀 평균 순익 약 $2,431/20 worker-hours.","초대형 저장고(저장3000 + 작업공간50) 접근."]},
 {id:"priest",name:"?사제 계급 선장?",code:"PRIEST",stage:"class",stageName:"PUSSY 2단계",from:"최단 2/1",route:"PUSSY → 사제",colors:["Gold","Green","Red"],ev:42609,evText:"≈+$42.6k",hotel:"no",vip:"no",nonprofit:"no",scamming:"no",bulk:"no",ultimateCash:"no",irradiator:"no",necro:"no",bunker:"yes",tactical:"no",treasure:"no",boot:"no",military:"no",bread:"yes",warrior:"no",charmy:"no",saint:"no",saintReinf:"no",orthodox:"no",transfig:"no",xlarge:"yes",capsule:"no",doubleJail:"no",dungeon:"no",summary:"벙커 + 건강미 훈련. 사격 성장보다 체력·기력·근력 탱커 육성에 특화.",notes:["건강미 훈련: 기본 기력+25/체력+15/근력+10/투척+5 + 보너스 장갑+1/체력+8/기력+6/근력+4/Mana+6.","군사훈련과 상호배타."]},
 {id:"mage",name:"?마법사 계급 선장?",code:"MAGE",stage:"class",stageName:"PUSSY 2단계",from:"최단 2/1",route:"PUSSY → 마법사",colors:["Gold","Red","Gray"],ev:17274,evText:"≈+$17.3k",hotel:"no",vip:"no",nonprofit:"no",scamming:"no",bulk:"no",ultimateCash:"no",irradiator:"warn",necro:"no",bunker:"no",tactical:"no",treasure:"no",boot:"no",military:"no",bread:"no",warrior:"no",charmy:"no",saint:"no",saintReinf:"no",orthodox:"no",transfig:"yes",xlarge:"yes",capsule:"no",doubleJail:"no",dungeon:"no",summary:"방사탑과 후기 변신술/마법 테크를 얻는 PSI·마법 특화 클래스.",notes:["Mage는 YESGRAY_NORED 태그도 있지만 동시에 CAPTAIN_RED를 열어 NONPROFIT_LAB을 disable하므로 비영리 연구실은 불가.","변신술 의식은 매우 후기(오컬트/매지텍/PSION 선행)."]},
 {id:"ruler",name:"?지도자 계급 선장?",code:"RULER",stage:"class",stageName:"PUSSY 2단계",from:"최단 2/1",route:"PUSSY → 지도자",colors:["Green","Red","Gray"],ev:-6496,evText:"≈-$6.5k",hotel:"no",vip:"no",nonprofit:"no",scamming:"no",bulk:"no",ultimateCash:"no",irradiator:"warn",necro:"no",bunker:"yes",tactical:"no",treasure:"no",boot:"yes",military:"yes",bread:"no",warrior:"no",charmy:"no",saint:"no",saintReinf:"no",orthodox:"no",transfig:"no",xlarge:"yes",capsule:"no",doubleJail:"yes",dungeon:"no",summary:"정규병 확정 육성 최강. JackSore+SoreDumb를 동시에 얻어 방사탑·벙커·신병훈련에 군사훈련까지 연결.",notes:["기본총기→신병훈련→군사훈련의 정규 성장 사슬.","군사훈련: TU+5/기력+10/체력+5/용기+10/반응+5/사격+5/투척+5/근접+5/Mana+10/PsiStr+15.","Saint 특수병 공급을 포기하는 대가가 큼."]},
 {id:"unclassedGate",name:"?이 게임을 좋아하지 않는 선장?",code:"UNCLASSED_UP",stage:"class",stageName:"PUSSY 2단계",from:"최단 2/1 → 3/1 해금",route:"PUSSY → 무직 게이트",colors:[],ev:0,evText:"분기용",hotel:"no",vip:"no",nonprofit:"late",scamming:"late",bulk:"no",ultimateCash:"late",irradiator:"late",necro:"late",bunker:"late",tactical:"no",treasure:"no",boot:"no",military:"no",bread:"no",warrior:"late",charmy:"no",saint:"no",saintReinf:"no",orthodox:"no",transfig:"no",xlarge:"yes",capsule:"late",doubleJail:"late",dungeon:"no",summary:"3/1 성격검사 3을 열기 위한 게이트. 이후 6개 혼합형 또는 Pure로 분기.",notes:["이 선택 자체보다 다음 단계가 핵심.","UNCLASSED_UP 태그가 남으므로 후기 캡슐 숙소 조건의 기반이 된다."]},

 {id:"dumblazy",name:"?멋지고 버릇없는 선장?",code:"DUMBLAZY_UP",stage:"unclassed",stageName:"무직 3단계",from:"최단 3/1",route:"PUSSY → 무직 → DumbLazy",colors:["Gold","Green"],ev:8661,evText:"≈+$8.7k",hotel:"no",vip:"no",nonprofit:"no",scamming:"yes",bulk:"no",ultimateCash:"no",irradiator:"no",necro:"no",bunker:"no",tactical:"no",treasure:"no",boot:"no",military:"no",bread:"no",warrior:"no",charmy:"no",saint:"no",saintReinf:"no",orthodox:"no",transfig:"no",xlarge:"yes",capsule:"late",doubleJail:"no",dungeon:"no",summary:"Gold+Green 및 사기 제조를 갖는 경제 혼합형.",notes:["YESGOLD_NOGRAY를 직접 열어 Scamming 가능.","Capsule Quarters는 현재 색 조합으로는 불가하지만 Codex로 Green+Gray를 맞추면 후기 가능."]},
 {id:"lazysore",name:"?합리적 선장?",code:"LAZYSORE_UP",stage:"unclassed",stageName:"무직 3단계",from:"최단 3/1",route:"PUSSY → 무직 → LazySore",colors:["Green","Gray"],ev:-7145,evText:"≈-$7.1k",hotel:"no",vip:"no",nonprofit:"yes",scamming:"yes",bulk:"no",ultimateCash:"no",irradiator:"no",necro:"yes",bunker:"no",tactical:"no",treasure:"no",boot:"no",military:"no",bread:"no",warrior:"no",charmy:"no",saint:"no",saintReinf:"no",orthodox:"no",transfig:"no",xlarge:"yes",capsule:"yes",doubleJail:"no",dungeon:"no",summary:"현금 이벤트는 약하지만 인프라 최강 후보. 비영리 연구실+네크로방어+Scamming+캡슐숙소+초대형 저장고.",notes:["비영리 연구실: $750k, 월 +$150k, Labs+3/Workshop+15/SHOP.","Capsule Quarters: 인원+50, Mana+3/day, 대신 Lab-1/Workshop-10.","Scamming도 가능."]},
 {id:"soredumb",name:"?보수적인 선장?",code:"SOREDUMB_UP",stage:"unclassed",stageName:"무직 3단계",from:"최단 3/1",route:"PUSSY → 무직 → SoreDumb",colors:["Green","Red"],ev:13369,evText:"≈+$13.4k",hotel:"no",vip:"no",nonprofit:"no",scamming:"no",bulk:"no",ultimateCash:"no",irradiator:"no",necro:"no",bunker:"yes",tactical:"no",treasure:"no",boot:"no",military:"no",bread:"no",warrior:"no",charmy:"no",saint:"no",saintReinf:"no",orthodox:"no",transfig:"no",xlarge:"yes",capsule:"late",doubleJail:"yes",dungeon:"no",summary:"벙커와 2배 감옥을 챙기는 보수적 기지방어/수용 혼합형.",notes:["SoreDumb 태그로 벙커 접근.","YESRED_NOGRAY로 2배 감옥 접근."]},
 {id:"jacksore",name:"?두려운 선장?",code:"JACKSORE_UP",stage:"unclassed",stageName:"무직 3단계",from:"최단 3/1",route:"PUSSY → 무직 → JackSore",colors:["Red","Gray"],ev:11254,evText:"≈+$11.3k",hotel:"no",vip:"no",nonprofit:"no",scamming:"no",bulk:"no",ultimateCash:"no",irradiator:"warn",necro:"no",bunker:"no",tactical:"no",treasure:"no",boot:"no",military:"no",bread:"no",warrior:"no",charmy:"no",saint:"no",saintReinf:"no",orthodox:"no",transfig:"no",xlarge:"yes",capsule:"late",doubleJail:"no",dungeon:"no",summary:"방사탑 하나를 선택적으로 가져가는 방어 혼합형.",notes:["방사탑의 기지방어 화력은 강하지만 치료 페널티 때문에 도배는 비추천."]},
 {id:"jackdumb",name:"?대담한 선장?",code:"JACKDUMB_UP",stage:"unclassed",stageName:"무직 3단계",from:"최단 3/1",route:"PUSSY → 무직 → JackDumb",colors:["Gold","Red"],ev:67207,evText:"≈+$67.2k",hotel:"no",vip:"no",nonprofit:"no",scamming:"no",bulk:"no",ultimateCash:"no",irradiator:"no",necro:"no",bunker:"no",tactical:"no",treasure:"no",boot:"no",military:"no",bread:"no",warrior:"yes",charmy:"no",saint:"no",saintReinf:"no",orthodox:"no",transfig:"no",xlarge:"yes",capsule:"late",doubleJail:"yes",dungeon:"no",summary:"이벤트 현금 EV가 높은 혼합형이며 전사문화+2배 감옥을 얻는다.",notes:["JackDumb 태그가 WARRIOR_CULTURE_PREQ를 직접 열어 줌.","PUSSY 계열이므로 Saint는 불가."]},
 {id:"jacklazy",name:"?진보하는 선장?",code:"JACKLAZY_UP",stage:"unclassed",stageName:"무직 3단계",from:"최단 3/1",route:"PUSSY → 무직 → JackLazy",colors:["Gold","Gray"],ev:20287,evText:"≈+$20.3k",hotel:"no",vip:"no",nonprofit:"yes",scamming:"no",bulk:"no",ultimateCash:"no",irradiator:"no",necro:"no",bunker:"no",tactical:"no",treasure:"no",boot:"no",military:"no",bread:"no",warrior:"no",charmy:"no",saint:"no",saintReinf:"no",orthodox:"no",transfig:"no",xlarge:"yes",capsule:"late",doubleJail:"no",dungeon:"no",summary:"비영리 연구실을 쓸 수 있는 두 대표 혼합형 중 하나. LazySore보다 이벤트 현금은 높지만 네크로방어/캡슐의 즉시 조합은 없다.",notes:["YESGRAY_NORED를 열고 Red 자체는 얻지 않아 Nonprofit Lab이 살아 있다."]},
 {id:"pureGate",name:"?혼자 있고 싶은 선장?",code:"PURE_UP",stage:"unclassed",stageName:"무직 3단계",from:"최단 3/1 → 4/1 해금",route:"PUSSY → 무직 → Pure 게이트",colors:[],ev:0,evText:"분기용",hotel:"no",vip:"no",nonprofit:"no",scamming:"no",bulk:"no",ultimateCash:"late",irradiator:"no",necro:"no",bunker:"no",tactical:"no",treasure:"no",boot:"no",military:"no",bread:"no",warrior:"late",charmy:"no",saint:"no",saintReinf:"no",orthodox:"no",transfig:"no",xlarge:"yes",capsule:"late",doubleJail:"no",dungeon:"no",summary:"4/1 성격검사 4 뒤 Gold/Green/Red/Gray/Ultimate 중 하나를 고르기 위한 최종 게이트.",notes:["Ultimate를 택하면 네 색을 모두 비운 상태로 666k 이벤트에 진입."]},

 {id:"pureGold",name:"?고귀한 영혼의 선장?",code:"GOLD_UP",stage:"pure",stageName:"Pure 최종",from:"최단 4/1",route:"PUSSY → 무직 → Pure → Gold",colors:["Gold"],ev:116583,evText:"≈+$116.6k",hotel:"no",vip:"no",nonprofit:"no",scamming:"no",bulk:"no",ultimateCash:"no",irradiator:"no",necro:"no",bunker:"no",tactical:"no",treasure:"no",boot:"no",military:"no",bread:"no",warrior:"no",charmy:"no",saint:"no",saintReinf:"no",orthodox:"no",transfig:"no",xlarge:"yes",capsule:"late",doubleJail:"no",dungeon:"no",summary:"Pure 계열 중 이벤트 현금이 매우 높은 축. DoubleGold 이벤트를 함께 사용.",notes:["초기 $500k Taking a Loan은 Government Fine×5가 붙으므로 순이익으로 계산하지 않음."]},
 {id:"pureGreen",name:"?현명한 선장?",code:"GREEN_UP",stage:"pure",stageName:"Pure 최종",from:"최단 4/1",route:"PUSSY → 무직 → Pure → Green",colors:["Green"],ev:57513,evText:"≈+$57.5k",hotel:"no",vip:"no",nonprofit:"no",scamming:"no",bulk:"no",ultimateCash:"no",irradiator:"no",necro:"no",bunker:"no",tactical:"no",treasure:"no",boot:"no",military:"no",bread:"no",warrior:"no",charmy:"no",saint:"no",saintReinf:"no",orthodox:"no",transfig:"no",xlarge:"yes",capsule:"late",doubleJail:"no",dungeon:"no",summary:"Green/자연·회복 계열 Pure 선택. 현금보다는 색상 이벤트 성격이 중심.",notes:["PUSSY 계열이므로 색을 나중에 채워도 Saint는 불가."]},
 {id:"pureRed",name:"?강한 전사 선장?",code:"RED_UP",stage:"pure",stageName:"Pure 최종",from:"최단 4/1",route:"PUSSY → 무직 → Pure → Red",colors:["Red"],ev:61724,evText:"≈+$61.7k",hotel:"no",vip:"no",nonprofit:"no",scamming:"no",bulk:"no",ultimateCash:"no",irradiator:"no",necro:"no",bunker:"no",tactical:"no",treasure:"no",boot:"no",military:"no",bread:"no",warrior:"yes",charmy:"no",saint:"no",saintReinf:"no",orthodox:"no",transfig:"no",xlarge:"yes",capsule:"late",doubleJail:"no",dungeon:"no",summary:"Pure 중 전사문화 직행형. 자랑스러운 전사 육성을 원하는 PUSSY 최종 분기.",notes:["RED_UP이 WARRIOR_CULTURE_PREQ를 직접 unlock."]},
 {id:"pureGray",name:"?위대한 몽상가 선장?",code:"GRAY_UP",stage:"pure",stageName:"Pure 최종",from:"최단 4/1",route:"PUSSY → 무직 → Pure → Gray",colors:["Gray"],ev:116246,evText:"≈+$116.2k",hotel:"no",vip:"no",nonprofit:"no",scamming:"no",bulk:"no",ultimateCash:"no",irradiator:"no",necro:"no",bunker:"no",tactical:"no",treasure:"no",boot:"no",military:"no",bread:"no",warrior:"no",charmy:"no",saint:"no",saintReinf:"no",orthodox:"no",transfig:"no",xlarge:"yes",capsule:"late",doubleJail:"no",dungeon:"no",summary:"Pure Gold와 함께 이벤트 현금 EV가 높은 최종색 선택.",notes:["돈은 강하지만 고유 방어/병사강화 테크는 적다."]},
 {id:"ultimate",name:"?이 모두를 가진 선장!?",code:"ULTIMATE",stage:"pure",stageName:"Pure 최종",from:"최단 4/1 · 첫 지급판정 5/1",route:"PUSSY → 무직 → Pure → Ultimate",colors:[],ev:579129,evText:"≈+$579.1k*",hotel:"no",vip:"no",nonprofit:"no",scamming:"no",bulk:"no",ultimateCash:"yes",irradiator:"no",necro:"no",bunker:"no",tactical:"no",treasure:"no",boot:"no",military:"no",bread:"no",warrior:"no",charmy:"no",saint:"no",saintReinf:"no",orthodox:"no",transfig:"no",xlarge:"yes",capsule:"late",doubleJail:"no",dungeon:"no",summary:"경제 특화 최종분기. 매월 63%로 $666k+666점. 무색 상태의 기타 이벤트까지 포함하면 약 +$579k/월.",notes:["666k 이벤트 자체 기대값은 0.63×666,000 = $419,580/월.","리스크·아이템소모·부채 없음. 다만 지금 19(1).sav에서는 최단 첫 판정이 5/1.","*+$579.1k는 NO COLOR/PAIR 이벤트를 함께 평균낸 무색 Ultimate 상태. Codex로 색을 채우면 일부 추가 EV가 사라짐."]}
];


const captainTraits={
  jackass:["jackSore","jackDumb","jackLazy"],
  dumbass:["dumbLazy","jackDumb","soreDumb"],
  lazyass:["dumbLazy","lazySore","jackLazy"],
  soreass:["jackSore","lazySore","soreDumb"],
  pussy:[],
  thief:["jackLazy","dumbLazy"],
  priest:["soreDumb","dumbLazy"],
  mage:["jackLazy","jackSore"],
  ruler:["jackSore","soreDumb"],
  unclassedGate:[],
  dumblazy:["dumbLazy"], lazysore:["lazySore"], soredumb:["soreDumb"],
  jacksore:["jackSore"], jackdumb:["jackDumb"], jacklazy:["jackLazy"],
  pureGate:[], pureGold:[], pureGreen:[], pureRed:[], pureGray:[], ultimate:[]
};
const saintCodexTarget={jackass:"Green",dumbass:"Gray",lazyass:"Red",soreass:"Gold"};
const codexInfo={
  Gold:{
    ko:"금색", direct:"장교봉 · 화염포 보고서", awakened:"Porn ×36 + Captain Gold",
    baseGods:["G1"], synergy:{dumbLazy:"G2A",jackLazy:"G8A"},
    reward:"G1 과찬의 선물(Prince's Gift); DumbLazy면 G2A 케이크×3; JackLazy면 G8A Glamour×33"
  },
  Green:{
    ko:"녹색", direct:"바이오플라즈마 프로젝터 보고서", awakened:"활성 차원 보관함 ×3 + Captain Green",
    baseGods:["G3"], synergy:{dumbLazy:"G2B",soreDumb:"G4B"},
    reward:"G3 영혼의 선물(Sivalinga); DumbLazy면 G2B 케이크×3; SoreDumb면 G4B +300점"
  },
  Red:{
    ko:"적색", direct:"Little Ilya 보고서", awakened:"Living Brimstone ×4 + 200점 + Captain Red",
    baseGods:["G5"], synergy:{soreDumb:"G4A",jackSore:"G6A"},
    reward:"G5 피의 선물(Bloodoge 특수병); SoreDumb면 G4A +300점; JackSore면 G6A Mad Scribblings"
  },
  Gray:{
    ko:"회색", direct:"Conversion Launcher 보고서", awakened:"Esoterica ×7 + Captain Gray",
    baseGods:["G7"], synergy:{jackSore:"G6B",jackLazy:"G8B"},
    reward:"G7 요술 선물(Arcane Book / Demonic Essence×13 / Poltergeist 가중추첨); JackSore면 G6B Mad Scribblings; JackLazy면 G8B Glamour×33"
  }
};

const colorMonthlyEV={Gold:7188.49,Green:-1912.16,Red:10237.50,Gray:3363.66};
const noColorMonthlyEV={Gold:69.13,Green:165.00,Red:-1776.92,Gray:0};
const pureColorMonthlyEV={Gold:3763.64,Green:0,Red:4279.27,Gray:0};
const purePairMonthlyEV=[
  {missing:["Red","Gold"],ev:55300.00},{missing:["Red","Gray"],ev:5833.33},
  {missing:["Red","Green"],ev:53000.00},{missing:["Gold","Gray"],ev:0},
  {missing:["Gold","Green"],ev:291.96},{missing:["Green","Gray"],ev:46666.67}
];
const godMonthlyEV={G1:27600,G2A:8280,G2B:8280,G3:23000,G4A:0,G4B:0,G5:0,G6A:2300,G6B:2300,G7:7997.73,G8A:22770,G8B:22770};
const saintPoolMonthly={cashEquivalentBeforeStatue:21924.18,cashEquivalentAfterStatue:10962.09,directFundsBeforeStatue:-2444.51,directFundsAfterStatue:-1222.25};
function pairPoolEV(colors){const have=new Set(colors);return purePairMonthlyEV.reduce((sum,pair)=>sum+(pair.missing.every(c=>!have.has(c))?pair.ev:0),0);}
function pureSinglePoolEV(colors){return colors.length===1?(pureColorMonthlyEV[colors[0]]||0):0;}
function money(v){if(!Number.isFinite(Number(v)))return "—";const n=Number(v),sign=n>0?"+":n<0?"-":"";return sign+"$"+(Math.abs(n)/1000).toFixed(1)+"k";}

function codexGods(r,color){
  const info=codexInfo[color], traits=captainTraits[r.id]||[];
  const gods=[...info.baseGods];
  for(const [trait,g] of Object.entries(info.synergy)) if(traits.includes(trait)) gods.push(g);
  return gods;
}
function codexEconomy(r,color){
  if(["pussy","unclassedGate","pureGate"].includes(r.id))return null;
  const before=[...r.colors],after=before.includes(color)?before:[...before,color];
  let delta=0;
  if(!before.includes(color))delta+=(colorMonthlyEV[color]||0)-(noColorMonthlyEV[color]||0);
  if(r.stage==="pure"){delta+=pairPoolEV(after)-pairPoolEV(before);delta+=pureSinglePoolEV(after)-pureSinglePoolEV(before);}
  const post=r.ev+delta,gods=codexGods(r,color),godsEv=gods.reduce((sum,g)=>sum+(godMonthlyEV[g]||0),0);
  const saint=saintCodexTarget[r.id]===color;
  return{before:r.ev,post,delta,gods,godsEv,withGods:post+godsEv,saint};
}
function codexCell(r,color){
  const info=codexInfo[color],gods=codexGods(r,color),eco=codexEconomy(r,color),target=saintCodexTarget[r.id];
  let head="",cls="codex-cell";
  if(target){if(target===color){head="★ 성자";cls+=" codex-saint";}else{head="⚠ 성자봉쇄";cls+=" codex-block";}}
  else if(r.id==="ultimate"){head="⚠ EV변화 +"+info.ko;cls+=" codex-warn";}
  else if(r.colors.includes(color)){head="중복 "+info.ko;cls+=" codex-dup";}
  else{head="+"+info.ko;cls+=" codex-new";}
  const evHtml=eco?'<span class="codex-ev"><b>'+money(eco.before)+'</b> → <b>'+money(eco.post)+'</b><em>'+money(eco.delta)+'</em></span>':'<span class="codex-ev muted">분기 확정 후 계산</span>';
  let godHtml='';
  if(eco&&eco.godsEv)godHtml=eco.saint?'<small class="codex-gods off">신들 '+money(eco.godsEv)+'/월 · Saint 후 정지</small>':'<small class="codex-gods">신들 완성 '+money(eco.godsEv)+'/월 → '+money(eco.withGods)+'</small>';
  else if(eco&&eco.saint)godHtml='<small class="codex-gods off">Saint 전환 후 Codex 신들 보너스 정지</small>';
  const title=info.ko+" 코덱스 선택 시 나머지 3 Codex 연구 영구 disable. 월 EV는 직접 funds + 양수 판매가 지급품의 기대환금가치.";
  return '<span class="'+cls+'" title="'+title+'"><strong>'+head+'</strong>'+evHtml+'<small>'+gods.join(" · ")+'</small>'+godHtml+'</span>';
}
function codexDetailHtml(r){
  return '<h3>Codex 상호배타 분기 · 월 수입 비교</h3><p class="muted">월 EV는 직접 현금 + 양수 판매가 지급품의 기대환금가치입니다. 연구·임무·병사의 전투가치는 0원으로 둡니다. Codex 각성으로 색이 늘면 해당 색 이벤트 풀이 켜지고 결손색/일부 Pure 풀이 꺼집니다.</p>'+
    '<div class="codex-detail-grid">'+Object.keys(codexInfo).map(color=>{
      const i=codexInfo[color],eco=codexEconomy(r,color);let extra='';
      if(eco){
        extra='<p><b>반복 EV:</b> '+money(eco.before)+' → <b>'+money(eco.post)+'</b> /월 ('+money(eco.delta)+')</p>';
        if(eco.godsEv)extra+='<p><b>신들 보너스 만개:</b> '+(eco.saint?'Saint 전 한시 ':'')+money(eco.godsEv)+'/월'+(eco.saint?' → Saint 후 정지':' → 합계 '+money(eco.withGods)+'/월')+'</p>';
        if(eco.saint)extra+='<p><b>Saint 풀:</b> 조각상 전 기대환금가치 약 '+money(saintPoolMonthly.cashEquivalentBeforeStatue)+'/월. 단 병사 아이템 판매가를 돈으로 센 값이며, 이벤트의 직접 funds만 보면 '+money(saintPoolMonthly.directFundsBeforeStatue)+'/월입니다.</p>';
      }
      return '<div class="detail-box">'+codexCell(r,color)+extra+'<p><b>고유 테크:</b> '+i.direct+'</p><p><b>승천:</b> '+i.awakened+'</p></div>';
    }).join("")+'</div>';
}
function renderCodexCards(){
  const el=document.querySelector("#codexCards"); if(!el)return;
  el.innerHTML=Object.entries(codexInfo).map(([color,i])=>
    '<article class="codex-card card"><p class="eyebrow">'+i.ko+' CODEX</p><h3>'+i.ko+' 코덱스</h3>'+
    '<p><b>상호배타:</b> 선택 연구에서 이미 다른 3색 선택을 막고, 실제 Codex 연구에서도 다시 다른 3 Codex를 막는다.</p>'+
    '<p><b>고유 테크:</b> '+i.direct+'</p><p><b>승천:</b> '+i.awakened+'</p><p><b>신들:</b> '+i.reward+'</p></article>'
  ).join("");
}


function renderCodexEconomyTable(){
  const root=document.querySelector("#codexEconomyTable"); if(!root)return;
  const captains=rows.filter(r=>["jackass","dumbass","lazyass","soreass"].includes(r.id));
  const colors=["Gold","Green","Red","Gray"];
  root.innerHTML='<div class="table-head"><div><p class="eyebrow">초기 4선장 × Codex</p><h3>월 현금성 EV 직접 비교</h3></div><p class="muted">선장 단독 → Codex 각성 후. 신들 보너스는 Saint 이전에만 별도 가산.</p></div>'+
    '<div class="table-scroll"><table class="exclusive-table codex-money-table"><thead><tr><th>선장</th><th>Codex 전</th>'+
    colors.map(c=>'<th>'+codexInfo[c].ko+' Codex</th>').join('')+'</tr></thead><tbody>'+
    captains.map(r=>'<tr><td><b>'+r.name+'</b><small>'+r.code+'</small></td><td><b>'+money(r.ev)+'</b></td>'+
      colors.map(c=>{
        const e=codexEconomy(r,c), saint=e?.saint;
        const god=e?.godsEv||0;
        const godLine=god?(saint?'Saint 전 신들 '+money(god)+'<br><span class="muted">Saint 후 정지</span>':'신들 만개 '+money(e.withGods)):'';
        const saintLine=saint?'<br><span class="saint-mark">★ Saint</span>':'';
        return '<td><b>'+money(e.post)+'</b><br><span class="'+(e.delta>=0?'ev-pos':'ev-neg')+'">'+money(e.delta)+'</span>'+saintLine+(godLine?'<br><small>'+godLine+'</small>':'')+'</td>';
      }).join('')+'</tr>').join('')+
    '</tbody></table></div>'+
    '<div class="interaction-note"><b>소심 + Gold 예:</b> '+money(rows.find(r=>r.id==="soreass").ev)+' → <b>'+money(codexEconomy(rows.find(r=>r.id==="soreass"),"Gold").post)+'</b>/월, 즉 <b>'+money(codexEconomy(rows.find(r=>r.id==="soreass"),"Gold").delta)+'/월</b> 증가. 이후 Saint가 되면 G1 신들 보너스는 정지하고 Saint 지원군 풀이 대신 켜집니다.</div>';
}

const researchLabels={
  STR_CAPTAIN_DUMBASS:"멍청한 선장",STR_CAPTAIN_JACKASS:"무모한 선장",STR_CAPTAIN_LAZYASS:"게으른 선장",STR_CAPTAIN_SOREASS:"소심한 선장",STR_CAPTAIN_PUSSY:"위와는 다른 선장",
  STR_CAPTAIN_THIEF:"도둑 계급",STR_CAPTAIN_PRIEST:"사제 계급",STR_CAPTAIN_MAGE:"마법사 계급",STR_CAPTAIN_RULER:"지도자 계급",STR_CAPTAIN_UNCLASSED_UP:"무직 게이트",
  STR_CAPTAIN_DUMBLAZY_UP:"멋지고 버릇없는",STR_CAPTAIN_JACKDUMB_UP:"대담한",STR_CAPTAIN_JACKLAZY_UP:"진보하는",STR_CAPTAIN_JACKSORE_UP:"두려운",STR_CAPTAIN_LAZYSORE_UP:"합리적",STR_CAPTAIN_SOREDUMB_UP:"보수적인",STR_CAPTAIN_PURE_UP:"Pure 게이트",
  STR_CAPTAIN_GOLD_UP:"고귀한 영혼",STR_CAPTAIN_GREEN_UP:"현명한",STR_CAPTAIN_RED_UP:"강한 전사",STR_CAPTAIN_GRAY_UP:"위대한 몽상가",STR_CAPTAIN_ULTIMATE:"궁극의 선장",
  STR_SCAMMING:"사기 제조",STR_BULK_EXCAVATION:"덩어리 캐내기",STR_DUNGEON_MASTER:"지하감옥 마스터",STR_HOTEL:"호텔",STR_STUDY_ROOM:"학습실",STR_JAIL_DOUBLE:"2배 감옥",STR_GENERAL_STORES_XLARGE:"초대형 저장고",STR_CAPSULE_QUARTERS:"캡슐 숙소",STR_TACTICAL_CENTER:"전술센터",
  STR_CAPTAIN_DOUBLEGOLD:"특성: 다면성",STR_CAPTAIN_DOUBLEGRAY:"특성: 활달함",STR_CAPTAIN_DOUBLERED:"특성: 힘이 넘침",STR_CAPTAIN_DOUBLEGREEN:"특성: 불굴"
};
const exclusiveStages=[
 {title:"1단계 · 기본 성격",rows:[
  ["STR_CAPTAIN_DUMBASS",["STR_CAPTAIN_JACKASS","STR_CAPTAIN_LAZYASS","STR_CAPTAIN_SOREASS","STR_CAPTAIN_PUSSY","STR_BULK_EXCAVATION","STR_DUNGEON_MASTER","STR_HOTEL","STR_STUDY_ROOM","STR_JAIL_DOUBLE","STR_GENERAL_STORES_XLARGE","STR_CAPSULE_QUARTERS","STR_TACTICAL_CENTER"]],
  ["STR_CAPTAIN_JACKASS",["STR_CAPTAIN_DUMBASS","STR_CAPTAIN_LAZYASS","STR_CAPTAIN_SOREASS","STR_CAPTAIN_PUSSY","STR_SCAMMING","STR_BULK_EXCAVATION","STR_HOTEL","STR_JAIL_DOUBLE","STR_GENERAL_STORES_XLARGE","STR_CAPSULE_QUARTERS","STR_TACTICAL_CENTER"]],
  ["STR_CAPTAIN_LAZYASS",["STR_CAPTAIN_JACKASS","STR_CAPTAIN_DUMBASS","STR_CAPTAIN_SOREASS","STR_CAPTAIN_PUSSY","STR_SCAMMING","STR_BULK_EXCAVATION","STR_DUNGEON_MASTER","STR_JAIL_DOUBLE","STR_GENERAL_STORES_XLARGE","STR_CAPSULE_QUARTERS","STR_TACTICAL_CENTER"]],
  ["STR_CAPTAIN_SOREASS",["STR_CAPTAIN_JACKASS","STR_CAPTAIN_DUMBASS","STR_CAPTAIN_LAZYASS","STR_CAPTAIN_PUSSY","STR_SCAMMING","STR_DUNGEON_MASTER","STR_HOTEL","STR_JAIL_DOUBLE","STR_GENERAL_STORES_XLARGE","STR_CAPSULE_QUARTERS"]],
  ["STR_CAPTAIN_PUSSY",["STR_CAPTAIN_JACKASS","STR_CAPTAIN_DUMBASS","STR_CAPTAIN_LAZYASS","STR_CAPTAIN_SOREASS","STR_BULK_EXCAVATION","STR_DUNGEON_MASTER","STR_TACTICAL_CENTER","STR_HOTEL"]]
 ]},
 {title:"2단계 · PUSSY 직업",rows:[
  ["STR_CAPTAIN_THIEF",["STR_CAPTAIN_PRIEST","STR_CAPTAIN_MAGE","STR_CAPTAIN_RULER","STR_CAPTAIN_UNCLASSED_UP"]],
  ["STR_CAPTAIN_PRIEST",["STR_CAPTAIN_THIEF","STR_CAPTAIN_MAGE","STR_CAPTAIN_RULER","STR_CAPTAIN_UNCLASSED_UP"]],
  ["STR_CAPTAIN_MAGE",["STR_CAPTAIN_THIEF","STR_CAPTAIN_PRIEST","STR_CAPTAIN_RULER","STR_CAPTAIN_UNCLASSED_UP"]],
  ["STR_CAPTAIN_RULER",["STR_CAPTAIN_THIEF","STR_CAPTAIN_PRIEST","STR_CAPTAIN_MAGE","STR_CAPTAIN_UNCLASSED_UP"]],
  ["STR_CAPTAIN_UNCLASSED_UP",["STR_CAPTAIN_THIEF","STR_CAPTAIN_PRIEST","STR_CAPTAIN_MAGE","STR_CAPTAIN_RULER"]]
 ]},
 {title:"3단계 · 무직 혼합형",rows:[
  ["STR_CAPTAIN_DUMBLAZY_UP",["STR_CAPTAIN_LAZYSORE_UP","STR_CAPTAIN_SOREDUMB_UP","STR_CAPTAIN_JACKSORE_UP","STR_CAPTAIN_JACKDUMB_UP","STR_CAPTAIN_JACKLAZY_UP","STR_CAPTAIN_PURE_UP"]],
  ["STR_CAPTAIN_JACKDUMB_UP",["STR_CAPTAIN_DUMBLAZY_UP","STR_CAPTAIN_LAZYSORE_UP","STR_CAPTAIN_SOREDUMB_UP","STR_CAPTAIN_JACKSORE_UP","STR_CAPTAIN_JACKLAZY_UP","STR_CAPTAIN_PURE_UP"]],
  ["STR_CAPTAIN_JACKLAZY_UP",["STR_CAPTAIN_DUMBLAZY_UP","STR_CAPTAIN_LAZYSORE_UP","STR_CAPTAIN_SOREDUMB_UP","STR_CAPTAIN_JACKSORE_UP","STR_CAPTAIN_JACKDUMB_UP","STR_CAPTAIN_DOUBLEGOLD","STR_CAPTAIN_DOUBLEGRAY","STR_CAPTAIN_PURE_UP"]],
  ["STR_CAPTAIN_JACKSORE_UP",["STR_CAPTAIN_DUMBLAZY_UP","STR_CAPTAIN_LAZYSORE_UP","STR_CAPTAIN_SOREDUMB_UP","STR_CAPTAIN_JACKDUMB_UP","STR_CAPTAIN_JACKLAZY_UP","STR_CAPTAIN_DOUBLERED","STR_CAPTAIN_DOUBLEGRAY","STR_CAPTAIN_PURE_UP"]],
  ["STR_CAPTAIN_LAZYSORE_UP",["STR_CAPTAIN_DUMBLAZY_UP","STR_CAPTAIN_SOREDUMB_UP","STR_CAPTAIN_JACKSORE_UP","STR_CAPTAIN_JACKDUMB_UP","STR_CAPTAIN_JACKLAZY_UP","STR_CAPTAIN_PURE_UP"]],
  ["STR_CAPTAIN_SOREDUMB_UP",["STR_CAPTAIN_DUMBLAZY_UP","STR_CAPTAIN_LAZYSORE_UP","STR_CAPTAIN_JACKSORE_UP","STR_CAPTAIN_JACKDUMB_UP","STR_CAPTAIN_JACKLAZY_UP","STR_CAPTAIN_DOUBLEGREEN","STR_CAPTAIN_DOUBLERED","STR_CAPTAIN_PURE_UP"]],
  ["STR_CAPTAIN_PURE_UP",["STR_CAPTAIN_DUMBLAZY_UP","STR_CAPTAIN_LAZYSORE_UP","STR_CAPTAIN_SOREDUMB_UP","STR_CAPTAIN_JACKSORE_UP","STR_CAPTAIN_JACKDUMB_UP","STR_CAPTAIN_JACKLAZY_UP"]]
 ]},
 {title:"4단계 · Pure 최종",rows:[
  ["STR_CAPTAIN_GOLD_UP",["STR_CAPTAIN_GOLD_UP","STR_CAPTAIN_GRAY_UP","STR_CAPTAIN_GREEN_UP","STR_CAPTAIN_RED_UP","STR_CAPTAIN_ULTIMATE"]],
  ["STR_CAPTAIN_GREEN_UP",["STR_CAPTAIN_GOLD_UP","STR_CAPTAIN_GRAY_UP","STR_CAPTAIN_RED_UP","STR_CAPTAIN_ULTIMATE"]],
  ["STR_CAPTAIN_RED_UP",["STR_CAPTAIN_GOLD_UP","STR_CAPTAIN_GRAY_UP","STR_CAPTAIN_GREEN_UP","STR_CAPTAIN_ULTIMATE"]],
  ["STR_CAPTAIN_GRAY_UP",["STR_CAPTAIN_GOLD_UP","STR_CAPTAIN_GREEN_UP","STR_CAPTAIN_RED_UP","STR_CAPTAIN_ULTIMATE"]],
  ["STR_CAPTAIN_ULTIMATE",["STR_CAPTAIN_GOLD_UP","STR_CAPTAIN_GRAY_UP","STR_CAPTAIN_GREEN_UP","STR_CAPTAIN_RED_UP"]]
 ]}
];
const codexExclusive=[
 ["?금색 코덱스 선택?","STR_CHOOSE_GOLD_QUERY",["STR_CHOOSE_GREEN_QUERY","STR_CHOOSE_GRAY_QUERY","STR_CHOOSE_RED_QUERY"]],
 ["?녹색 코덱스 선택?","STR_CHOOSE_GREEN_QUERY",["STR_CHOOSE_GRAY_QUERY","STR_CHOOSE_RED_QUERY","STR_CHOOSE_GOLD_QUERY"]],
 ["?적색 코덱스 선택?","STR_CHOOSE_RED_QUERY",["STR_CHOOSE_GREEN_QUERY","STR_CHOOSE_GRAY_QUERY","STR_CHOOSE_GOLD_QUERY"]],
 ["?회색 코덱스 선택?","STR_CHOOSE_GRAY_QUERY",["STR_CHOOSE_GREEN_QUERY","STR_CHOOSE_RED_QUERY","STR_CHOOSE_GOLD_QUERY"]],
 ["금색 코덱스 연구","STR_CODEX_GOLD",["STR_CODEX_GRAY","STR_CODEX_GREEN","STR_CODEX_RED"]],
 ["녹색 코덱스 연구","STR_CODEX_GREEN",["STR_CODEX_GRAY","STR_CODEX_RED","STR_CODEX_GOLD"]],
 ["적색 코덱스 연구","STR_CODEX_RED",["STR_CODEX_GRAY","STR_CODEX_GREEN","STR_CODEX_GOLD"]],
 ["회색 코덱스 연구","STR_CODEX_GRAY",["STR_CODEX_RED","STR_CODEX_GREEN","STR_CODEX_GOLD"]]
];
const captainCodexInteractionRows=[
 ["G1","Gold Awakened + GODS E1 + Saint 아님","23%","Prince's Gift"],
 ["G2A","DumbLazy + Gold Awakened + GODS E2 + Saint 아님","23%","Cake ×3 + 50점"],
 ["G2B","DumbLazy + Green Awakened + GODS E2 + Saint 아님","23%","Cake ×3 + 50점"],
 ["G3","Green Awakened + GODS E3 + Saint 아님","23%","Sivalinga"],
 ["G4A","SoreDumb + Red Awakened + GODS E4 + Saint 아님","23%","+300점"],
 ["G4B","SoreDumb + Green Awakened + GODS E4 + Saint 아님","23%","+300점"],
 ["G5","Red Awakened + GODS E5 + Saint 아님","23%","Bloodoge 특수병 1명 + 전쟁 축복"],
 ["G6A","JackSore + Red Awakened + GODS E6 + Saint 아님","23%","Mad Scribblings"],
 ["G6B","JackSore + Gray Awakened + GODS E6 + Saint 아님","23%","Mad Scribblings"],
 ["G7","Gray Awakened + GODS E7 + Saint 아님","23%","Arcane Book / Demonic Essence×13 / Poltergeist 가중 추첨"],
 ["G8A","JackLazy + Gold Awakened + GODS E8 + Saint 아님","23%","Glamour ×33"],
 ["G8B","JackLazy + Gray Awakened + GODS E8 + Saint 아님","23%","Glamour ×33"],
 ["Lab Accident +1","Gray Codex + Schooling + Basic Electronics + Captain Red 없음","13%","-$250k 실험실 사고 추가 판정"],
 ["Lab Accident +1","Gray Codex + Schooling + Basic Electronics + Captain Green 없음","13%","-$250k 실험실 사고 추가 판정"],
 ["Gambling Night","Gambling + Hierarchy + Gray Codex 없음 + SoreAss 아님","13%","승리 전리품 또는 -$100k; Gray/SoreAss는 이 이벤트를 봉쇄"]
];
function prettyRule(id){return '<span class="rule-chip"><b>'+(researchLabels[id]||id.replace(/^STR_/,""))+'</b><small>'+id+'</small></span>'}
function renderExclusiveRules(){
  const insight=document.querySelector("#soreassGoldInsight");
  if(insight) insight.innerHTML='<strong>소심한 선장 + Gold Codex 경제 비교</strong>'+
   '<p><b>Codex 전:</b> 소심의 현재 활성 기본·성향·색·결손색·Flaw·Double 반복 이벤트를 모두 합치면 현금성 EV는 약 <b>+$37.2k/월</b>입니다.</p>'+
   '<p><b>Gold 각성 후:</b> Gold 색 이벤트가 +$7.19k/월 켜지고 기존 NO_GOLD 풀이 약 +$0.07k/월 사라져 순증은 약 <b>+$7.12k/월</b>. 따라서 <b>+$44.4k/월</b>로 올라갑니다.</p>'+
   '<p><b>Saint 전 신들 단계:</b> GODS E1까지 열리면 G1의 현금성 EV가 약 <b>+$27.6k/월</b> 추가되어 잠시 <b>+$72.0k/월</b> 수준까지 갈 수 있습니다. 하지만 Gold가 네 번째 색이므로 Saint가 성립하면 G1~G8 Codex 보너스는 <code>STR_CAPTAIN_SAINT:false</code> 조건 때문에 정지합니다.</p>'+
   '<p><b>Saint 후:</b> 기본/색 반복 EV 약 +$44.4k/월은 유지되고 Saint 전용 풀이 켜집니다. 그 Saint 풀을 지급 병사·아이템의 판매가까지 환금가치로 치면 조각상 전 약 <b>+$21.9k/월</b>이지만, 이벤트의 직접 funds만 보면 약 <b>-$2.44k/월</b>입니다. 즉 Saint의 핵심 보상은 현금보다 특수병 공급입니다.</p>'+
   '<p><b>별도 일회성:</b> 소심+밀수업자 접촉의 Gold Trade는 $3m → 금괴 100개이며 즉시 매각 시 $4m, 순현금 약 <b>+$1m</b>입니다. 이건 월 반복 EV와 별도로 봐야 합니다.</p>';
  const root=document.querySelector("#exclusiveRules"); if(!root)return;
  const stageHtml=exclusiveStages.map(g=>'<article class="card exclusive-card"><h3>'+g.title+'</h3><div class="table-scroll"><table class="exclusive-table"><thead><tr><th>선택</th><th>완료 시 실제 disables</th></tr></thead><tbody>'+
    g.rows.map(([id,blocks])=>'<tr><td>'+prettyRule(id)+'</td><td><div class="rule-list">'+blocks.map(prettyRule).join("")+'</div></td></tr>').join("")+
    '</tbody></table></div></article>').join("");
  const codexHtml='<article class="card exclusive-card"><h3>Codex · 2중 상호배타</h3><p class="muted">드릴 조사 뒤 색을 <b>선택하는 1포인트 연구</b>에서 한 번, 실제 Codex 연구에서 다시 한 번 다른 3색을 disable합니다.</p><div class="table-scroll"><table class="exclusive-table"><thead><tr><th>선택/연구</th><th>내부 ID</th><th>disable</th></tr></thead><tbody>'+
    codexExclusive.map(([name,id,blocks])=>'<tr><td><b>'+name+'</b></td><td><code>'+id+'</code></td><td><div class="rule-list">'+blocks.map(prettyRule).join("")+'</div></td></tr>').join("")+
    '</tbody></table></div></article>';
  root.innerHTML=stageHtml+codexHtml;
}
function renderCaptainCodexInteractions(){
  const root=document.querySelector("#captainCodexInteractions"); if(!root)return;
  root.innerHTML='<div class="interaction-note"><b>중요:</b> G1~G8 Codex 보너스는 모두 <code>STR_CAPTAIN_SAINT:false</code>를 요구합니다. 즉 <b>Saint가 된 뒤에는 이 신들 보너스 풀은 정지</b>합니다. Saint는 보너스를 단순 추가하는 상위호환이 아닙니다.</div>'+
    '<div class="table-scroll"><table class="exclusive-table"><thead><tr><th>이벤트</th><th>조건</th><th>실행확률</th><th>효과 / 봉쇄</th></tr></thead><tbody>'+
    captainCodexInteractionRows.map(r=>'<tr><td><b>'+r[0]+'</b></td><td>'+r[1]+'</td><td>'+r[2]+'</td><td>'+r[3]+'</td></tr>').join("")+
    '</tbody></table></div>';
}

const featureNames=Object.fromEntries(columns.filter(c=>c.type!=="ev"&&c.type!=="codex").map(c=>[c.key,c.label]));
const stageOrder={initial:0,class:1,unclassed:2,pure:3};
let sortState={key:"stage",dir:1};

function statusCell(v){
  const label=v==="yes"?"자연 접근":v==="late"?"후기/조건부":v==="warn"?"가능·큰 페널티":"불가/봉쇄";
  return '<span class="status '+v+'" title="'+label+'">'+S[v]+'</span>';
}
function evCell(r){
  const cls=r.ev>0?"ev-pos":r.ev<0?"ev-neg":"ev-zero";
  return '<span class="'+cls+'">'+r.evText+'</span>';
}
function stagePill(r){return '<span class="stage-pill">'+r.stageName+'</span>';}
function colors(r){return r.colors.length?r.colors.map(x=>'<span class="color-pill">'+x+'</span>').join(""):'<span class="muted">무색/게이트</span>';}

function renderHead(){
  const thead=document.querySelector("#matrixTable thead");
  const groups=[];
  for(const c of columns){let g=groups.find(x=>x.name===c.group);if(!g){g={name:c.group,count:0};groups.push(g)}g.count++}
  thead.innerHTML='<tr class="group"><th rowspan="2">선장 선택</th><th rowspan="2">단계</th><th rowspan="2">최단 시점</th><th rowspan="2">색</th>'+groups.map(g=>'<th colspan="'+g.count+'">'+g.name+'</th>').join("")+'</tr>'+
  '<tr>'+columns.map(c=>'<th data-sort="'+(c.key==="ev"?"ev":"")+'">'+c.label+'</th>').join("")+'</tr>';
  thead.querySelectorAll("[data-sort=ev]").forEach(th=>{th.style.cursor="pointer";th.title="클릭하여 EV 정렬";th.addEventListener("click",()=>{sortState={key:"ev",dir:sortState.key==="ev"?-sortState.dir:-1};renderRows()})});
}

function filteredRows(){
  const q=document.querySelector("#search").value.trim().toLowerCase();
  const stage=document.querySelector("#stageFilter").value;
  const only=document.querySelector("#onlyAvailable").checked;
  let out=rows.filter(r=>{
    if(stage!=="all"&&r.stage!==stage)return false;
    const blob=[r.name,r.code,r.route,r.summary,...r.notes,...Object.entries(r).filter(([k,v])=>v==="yes"||v==="warn").map(([k])=>featureNames[k]||"")].join(" ").toLowerCase();
    if(q&&!blob.includes(q))return false;
    if(only&&!columns.some(c=>c.type!=="ev"&&c.type!=="codex"&&(r[c.key]==="yes"||r[c.key]==="warn")))return false;
    return true;
  });
  out.sort((a,b)=>{
    if(sortState.key==="ev")return (a.ev-b.ev)*sortState.dir;
    return (stageOrder[a.stage]-stageOrder[b.stage])||rows.indexOf(a)-rows.indexOf(b);
  });
  return out;
}
function renderRows(){
  const tbody=document.querySelector("#matrixTable tbody");
  tbody.innerHTML=filteredRows().map(r=>'<tr data-id="'+r.id+'"><td><span class="captain-name">'+r.name+'</span><span class="captain-code">'+r.code+'</span></td><td>'+stagePill(r)+'</td><td>'+r.from+'</td><td>'+colors(r)+'</td>'+columns.map(c=>'<td>'+(c.type==="ev"?evCell(r):c.type==="codex"?codexCell(r,c.color):statusCell(r[c.key]))+'</td>').join("")+'</tr>').join("");
  tbody.querySelectorAll("tr").forEach(tr=>tr.addEventListener("click",()=>openDetail(tr.dataset.id)));
}
function openDetail(id){
  const r=rows.find(x=>x.id===id); if(!r)return;
  const avail=columns.filter(c=>c.type!=="ev"&&c.type!=="codex"&&(r[c.key]==="yes"||r[c.key]==="warn"||r[c.key]==="late"));
  document.querySelector("#dialogBody").innerHTML='<p class="eyebrow">'+r.stageName+'</p><h2>'+r.name+'</h2><p class="muted">'+r.route+' · '+r.from+'</p><p>'+r.summary+'</p>'+
  '<div class="detail-grid"><div class="detail-box"><strong>반복 이벤트 월 EV</strong>'+r.evText+'</div><div class="detail-box"><strong>색 태그</strong>'+colors(r)+'</div></div>'+
  '<h3>접근 가능한 주요 옵션</h3><div class="feature-list">'+avail.map(c=>'<span class="feature-chip">'+S[r[c.key]]+' '+c.label+'</span>').join("")+'</div>'+
  codexDetailHtml(r)+'<h3>주의 / 해설</h3><ul>'+r.notes.map(n=>'<li>'+n+'</li>').join("")+'</ul>';
  document.querySelector("#detailDialog").showModal();
}

const timelineData=[
  ["1/26","초기 5선장","무모 / 멍청 / 게으른 / 소심 / 위와는 다른 중 선택"],
  ["2/1","PUSSY 성격검사 2","도둑 / 사제 / 마법사 / 지도자 / 무직 게이트"],
  ["3/1","무직 성격검사 3","6개 혼합형 또는 Pure 게이트"],
  ["4/1","Pure 성격검사 4","Gold / Green / Red / Gray / Ultimate"],
  ["5/1","Ultimate 첫 666k 판정","매월 63% · 이벤트 자체는 무위험"]
];
function renderTimeline(){
 document.querySelector("#timeline").innerHTML=timelineData.map(x=>'<article class="card"><time>'+x[0]+'</time><strong>'+x[1]+'</strong><p>'+x[2]+'</p></article>').join("");
}
const deep=[
 {title:"방사탑",tag:"지오스케이프 기지방어",body:"지나가는 UFO를 자동사격하는 SAM이 아니다. 평소에는 범위 1600 / 40% Hyperwave 탐지, 적이 기지를 실제 공격할 때 Base Defense에서 사격한다.",rows:[["건설/유지","$1.45m / $60k월"],["방어력/명중","333 / 100%"],["Flak 비교","225 / 65%"],["치료 페널티","SickBay -0.35/기 → 기본 회복 1.00→0.65/day"]]},
 {title:"벙커 + 14mm 포탑",tag:"전술 기지방어",body:"기지방어 전투맵 XBR_140에 아군 고정포탑 1기가 실제 스폰된다. 좁은 통로를 14mm 4발 버스트로 막는다.",rows:[["건설","$150k + 프리팹7 + Necroplane Parts35"],["포탑","HP75 / 장갑 75·65·65·60"],["무기","Power66 / 4발 Burst / 30% TU / 무한탄"],["턴당 최대","3 Burst ≈ 12발"]]},
 {title:"전술센터",tag:"전지구 탐지",body:"공격시설이 아니라 정보망. 범위 10800, 매시간 4% 탐지 판정을 제공한다. 한 번 추적된 표적은 범위 내 레이더가 있으면 유지된다.",rows:[["건설/유지","$600k / $50k월"],["재료","개인 자료 50"],["24시간 노출 시","단순 독립가정 약 62.5% 이상 1회 탐지"],["소심 전용","CAPTAIN_SOREASS 직접 요구"]]},
 {title:"네크로방어",tag:"Flak 보급 우회",body:"새 포탑이 아니라 Flak Tower Kit 대체 제작법. 귀한 25mm 기관포와 탄약 대신 네크로비행기 부품을 태운다.",rows:[["일반 Kit","1000 worker-h + 소형기관포4 + 50발상자12"],["Necro Kit","2500 worker-h + Necroplane Parts25"],["완성 Flak","방어225 / 명중65% / 인원+5 / 저장+50"]]},
 {title:"신병→군사 훈련",tag:"정규병 확정 성장",body:"소심과 Ruler는 신병훈련을 열 수 있고, Ruler만 거기서 군사훈련까지 간다. 성장한 스탯 일부를 감산하는 diminishing-return 구조라 신병일수록 효율이 좋다.",rows:[["신병훈련","기력+10 용기+10 반응+5 사격+15 투척+5 근력+10 근접+5 Mana+10"],["군사훈련","TU+5 기력+10 체력+5 용기+10 반응+5 사격+5 투척+5 근접+5 Mana+10 PsiStr+15"],["군사훈련 조건","Ruler + Boot Camp 선행 + DOJO"]]},
 {title:"건강미 / 자랑스러운 전사",tag:"대체 육성",body:"Priest는 탱커형 건강미 훈련, JackDumb·Pure Red·Saint는 전사문화의 자랑스러운 전사에 강점. 군사훈련과 일부 상호배타라 한 병사에 전부 쌓는 구조가 아니다.",rows:[["건강미 총효과 핵심","기력≈+31 체력≈+23 근력≈+14 장갑+1"],["자랑스러운 전사 핵심","기력≈+17 체력+6 용기+10 근접+10 투척+10 장갑+1"],["Charmy Dance","TU+10 체력 총+15 반응 총+15 등"]]},
 {title:"혼돈의 성자 지원군",tag:"기본 4선장 장기 보상",body:"PUSSY 계열은 영구 불가. 기본 4선장이 4색을 모두 맞추면 Saint가 가능하고, 도마뱀 조각상 전 기준 특수인력 기대 획득량이 약 0.652명/월이다.",rows:[["평균 간격","약 1.53개월/지원군"],["주요 대박","전쟁공주, 외톨이 클론, 농부 소녀 안내인, 얼음부인, 인간 영웅, 황혼의 신봉자"],["Dumbass 추가","Saint 상태에서 7%/월 정통파 마법사 영애 + $100k"]]},
 {title:"궁극의 선장",tag:"후불 경제 엔진",body:"$666k 이벤트 자체는 소모·부채·전투 없이 매월 63% 판정. 다만 현재 19(1).sav에서는 최단 4/1에 Ultimate 선택, 첫 월초 판정은 5/1.",rows:[["이벤트 1회","+$666,000 + 666점"],["핵심 월 EV","+$419,580"],["무색 전체 EV","약 +$579,129/월"],["대가","Saint·전술센터·호텔·대량채굴·지하감옥 마스터 포기"]]}
];
function renderDeep(){
 document.querySelector("#deepDiveCards").innerHTML=deep.map(d=>'<article class="deep-card card"><p class="eyebrow">'+d.tag+'</p><h3>'+d.title+'</h3><p>'+d.body+'</p><table><tbody>'+d.rows.map(x=>'<tr><th>'+x[0]+'</th><td>'+x[1]+'</td></tr>').join("")+'</tbody></table></article>').join("");
}

document.querySelector("#search").addEventListener("input",renderRows);
document.querySelector("#stageFilter").addEventListener("change",renderRows);
document.querySelector("#onlyAvailable").addEventListener("change",renderRows);
document.querySelector("#resetBtn").addEventListener("click",()=>{document.querySelector("#search").value="";document.querySelector("#stageFilter").value="all";document.querySelector("#onlyAvailable").checked=false;sortState={key:"stage",dir:1};renderRows()});
document.querySelector("#dialogClose").addEventListener("click",()=>document.querySelector("#detailDialog").close());
document.querySelector("#detailDialog").addEventListener("click",e=>{if(e.target.id==="detailDialog")e.currentTarget.close()});

renderHead();renderRows();renderCodexEconomyTable();renderCodexCards();renderExclusiveRules();renderCaptainCodexInteractions();renderTimeline();renderDeep();
