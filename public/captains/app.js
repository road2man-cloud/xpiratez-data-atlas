const S={yes:"✅",late:"◇",no:"❌",warn:"⚠"};
const columns=[
  {key:"ev",label:"반복 이벤트 월 EV",group:"경제",type:"ev"},
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
  {key:"dungeon",label:"지하감옥 마스터",group:"인프라"}
];

const rows=[
 {id:"jackass",name:"?무모한 선장?",code:"JACKASS",stage:"initial",stageName:"초기",from:"지금(1/26)",route:"초기 성격검사 → 무모한",colors:["Gold","Red","Gray"],ev:-5846,evText:"-$5.8k",hotel:"no",vip:"no",nonprofit:"no",scamming:"no",bulk:"no",ultimateCash:"no",irradiator:"yes",necro:"no",bunker:"no",tactical:"no",treasure:"yes",boot:"no",military:"no",bread:"no",warrior:"yes",charmy:"no",saint:"late",saintReinf:"late",orthodox:"no",transfig:"no",xlarge:"no",capsule:"no",doubleJail:"no",dungeon:"yes",summary:"돈보다 탐험·공격적 콘텐츠. JackSore/JackDumb/JackLazy를 동시에 열어 방사탑·전사문화·보물사냥·지하감옥에 접근한다.",notes:["기본 반복 이벤트 EV는 약 -$5.8k/월.","후기 4색 완성 시 혼돈의 성자 가능.","보물사냥은 기지가 있는 각 지역에서 월 21% 판정으로 Lootbox 기회를 만든다."]},
 {id:"dumbass",name:"?멍청한 선장?",code:"DUMBASS",stage:"initial",stageName:"초기",from:"지금(1/26)",route:"초기 성격검사 → 멍청한",colors:["Gold","Green","Red"],ev:37270,evText:"+$37.3k",hotel:"no",vip:"yes",nonprofit:"no",scamming:"yes",bulk:"no",ultimateCash:"no",irradiator:"no",necro:"no",bunker:"yes",tactical:"no",treasure:"no",boot:"no",military:"no",bread:"no",warrior:"yes",charmy:"yes",saint:"late",saintReinf:"late",orthodox:"late",transfig:"no",xlarge:"no",capsule:"no",doubleJail:"no",dungeon:"no",summary:"초반 현금 EV가 기본 4선장 중 가장 높고, 벙커·전사문화·VIP·댄스훈련·Saint 특수병까지 연결되는 다재다능형.",notes:["기본 반복 이벤트 EV 약 +$37.3k/월.","VIP Club: 건설 $1.35m, 월수익 +$500k, Lab+1/Training16/Mana+8.","Dumbass+Saint이면 별도 7%/월로 정통파 마법사 영애 + $100k 이벤트."]},
 {id:"lazyass",name:"?게으른 선장?",code:"LAZYASS",stage:"initial",stageName:"초기",from:"지금(1/26)",route:"초기 성격검사 → 게으른",colors:["Gold","Green","Gray"],ev:5190,evText:"+$5.2k",hotel:"yes",vip:"no",nonprofit:"no",scamming:"no",bulk:"no",ultimateCash:"no",irradiator:"no",necro:"yes",bunker:"no",tactical:"no",treasure:"no",boot:"no",military:"no",bread:"no",warrior:"late",charmy:"no",saint:"late",saintReinf:"late",orthodox:"no",transfig:"no",xlarge:"no",capsule:"no",doubleJail:"no",dungeon:"no",summary:"호텔과 네크로방어가 핵심. 전투 고유성보다는 현금흐름·기지 편의가 강하다.",notes:["기본 반복 이벤트 EV 약 +$5.2k/월.","호텔: $1.2m, 월 +$360k, 인원+25/훈련12/저장50/Mana+9.","네크로방어는 Flak Tower Kit를 25mm 기관포 대신 Necroplane Parts 25개로 생산."]},
 {id:"soreass",name:"?소심한 선장?",code:"SOREASS",stage:"initial",stageName:"초기",from:"지금(1/26)",route:"초기 성격검사 → 소심한",colors:["Green","Red","Gray"],ev:3319,evText:"+$3.3k",hotel:"no",vip:"no",nonprofit:"no",scamming:"no",bulk:"yes",ultimateCash:"no",irradiator:"warn",necro:"yes",bunker:"yes",tactical:"yes",treasure:"no",boot:"yes",military:"no",bread:"no",warrior:"late",charmy:"no",saint:"late",saintReinf:"late",orthodox:"no",transfig:"no",xlarge:"no",capsule:"no",doubleJail:"no",dungeon:"no",summary:"방어·탐지·병사 기본육성의 종합형. JackSore+LazySore+SoreDumb 세 방어 성향을 한 번에 보존하는 유일한 초기 선장.",notes:["방사탑 + 네크로방어 + 벙커 + 전술센터 + 신병훈련을 모두 보존.","방사탑 1기당 부상회복 속도 1.00→0.65/day(다른 치료보너스 없을 때).","암살 이벤트의 위험 결과를 안전 결과가 약 50% 대체."]},
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

const featureNames=Object.fromEntries(columns.filter(c=>c.type!=="ev").map(c=>[c.key,c.label]));
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
    if(only&&!columns.some(c=>c.type!=="ev"&&(r[c.key]==="yes"||r[c.key]==="warn")))return false;
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
  tbody.innerHTML=filteredRows().map(r=>'<tr data-id="'+r.id+'"><td><span class="captain-name">'+r.name+'</span><span class="captain-code">'+r.code+'</span></td><td>'+stagePill(r)+'</td><td>'+r.from+'</td><td>'+colors(r)+'</td>'+columns.map(c=>'<td>'+(c.type==="ev"?evCell(r):statusCell(r[c.key]))+'</td>').join("")+'</tr>').join("");
  tbody.querySelectorAll("tr").forEach(tr=>tr.addEventListener("click",()=>openDetail(tr.dataset.id)));
}
function openDetail(id){
  const r=rows.find(x=>x.id===id); if(!r)return;
  const avail=columns.filter(c=>c.type!=="ev"&&(r[c.key]==="yes"||r[c.key]==="warn"||r[c.key]==="late"));
  document.querySelector("#dialogBody").innerHTML='<p class="eyebrow">'+r.stageName+'</p><h2>'+r.name+'</h2><p class="muted">'+r.route+' · '+r.from+'</p><p>'+r.summary+'</p>'+
  '<div class="detail-grid"><div class="detail-box"><strong>반복 이벤트 월 EV</strong>'+r.evText+'</div><div class="detail-box"><strong>색 태그</strong>'+colors(r)+'</div></div>'+
  '<h3>접근 가능한 주요 옵션</h3><div class="feature-list">'+avail.map(c=>'<span class="feature-chip">'+S[r[c.key]]+' '+c.label+'</span>').join("")+'</div>'+
  '<h3>주의 / 해설</h3><ul>'+r.notes.map(n=>'<li>'+n+'</li>').join("")+'</ul>';
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

renderHead();renderRows();renderTimeline();renderDeep();
