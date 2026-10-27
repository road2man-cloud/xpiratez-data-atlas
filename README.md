# X-Piratez Data Atlas

X-Piratez [아이템 DB](./public/items/) · [연구 DB](./public/research/) · [병사훈련·조합 DB](./public/trainings/) · [기지시설 DB](./public/facilities/) · [기체무장 DB](./public/craft-weapons/) · 방어구·병종·탈것을 **검색·정렬·비교**하고, 상세 화면에서 실제 적용 핵심 스펙, 원본 룰 필드, 연구/제조/이벤트 역참조를 확인할 수 있는 정적 웹 DB입니다. 병종과 탈것은 획득 방식, 해금 연구트리, 명목 누적 연구량, 분기 전용 조건, 표본/기지 기능/기간 제한 같은 특수조건까지 추적합니다.

## 버전별 자료의 적용 범위

**기존 무기·아이템·연구 등 정적 DB는 X-Piratez v.o1.1.1 / OXCE 8.6**, 별도 `public/reference/` 엔진 번호표 및 직접 경험치 선언 아이템 306개는 **X-Piratez 2.1 / OXCE 8.7.1** 설치본을 기준으로 합니다. 동일한 내부 ID라도 버전 사이에서 스펙, 연구 선행, 해금, 저항, 경험치 및 전투 스크립트의 일치를 가정하지 마세요. 참조표의 최신 엔진 규칙을 기존 DB 수치에 적용하는 계산은 2.1 게임에서 검증된 계산이 아닙니다. 사이트 내 각 페이지의 버전 안내를 먼저 확인하세요.

## 기준 데이터

- X-Piratez: **v.o1.1.1**
- OXCE 요구 버전: **8.6**
- 현재 생성 결과: **4,007 items / 4,612 research / 957 armors (496 store-item armors) / 29 base Soldier rules / 72 acquisition profiles / 83 soldier transformations / 998 soldier bonuses / 96 crafts / 155 craft weapons / 115 facilities / 2,158 manufacture / 4,972 ufopaedia records**
- 한국어 이름은 모드의 `Language/ko.yml`, 영문은 `Language/en-US.yml`에서 해석합니다.
- 이미지·음원·맵 등 원본 게임 자산은 포함하지 않습니다.
- UFOPEDIA 장문 본문은 저작권이 있는 원문 재배포를 피하기 위해 기본 생성물에서는 제외합니다.

## 모든 DB의 간결한 플레이 판단

공개된 **14개 DB / 정적 원본 16,391개 항목**에 **요약 · 판단** 버튼을 공통 제공하며 목록에서 한 줄 결론을 미리 보여줍니다. 클릭하면 **한눈에 보는 결론 → 실제 효과 → 해금·자격·비용 → 실행 방법 → 언제 가치가 있는가 → 주의·예외** 순서로 설명합니다. 기존 검색·정렬·세부 수치·원본 근거·상호배타 조합기의 판정은 유지합니다.

**데이터 생성:** npm run build:play-guide (기존 룰셋 정규화 데이터와 연구·아이템·제조·이벤트·적부대 editorial sidecar에서 생성). **검증:** npm run check:play-guide (14개 DB의 전체 원본 ID와 가이드 1:1 대응·필수 필드·Captain's 11 원본 이벤트/변신/특성 교차 확인). 두 명령은 패키지에 등록되어 있고, 가이드 검증은 통합 npm run check 및 Pages 배포 게이트에 포함됩니다.

연구를 **요구**하는 이벤트와 연구를 직접 **지급**하는 이벤트, 직접 병사 스탯과 별도 SoldierBonus, 훈련의 방향성 상호배타와 후속 훈련 봉쇄를 구별합니다. 이 요약은 **원본 기반의 정적 플레이 해석**이지 현재 세이브를 실행한 실측·게임 내부 예외의 전수 증명이 아닙니다. 연구 완료·시설·재료·분기 충족 및 병종의 실시간 최종 강화 조합은 기존 상세 정보·시뮬레이터에서 따로 검증해야 합니다.

## X-Piratez 2.1 전용 병종·상호배제 검증 (OXCE 8.7.1)

[2.1 병종 검증기](./public/soldiers/modern/)는 **현재 설치된 X-Piratez v.o2 / OXCE 8.7.1 룰셋으로 별도 생성한 데이터**를 사용합니다. 기존 `public/soldiers/`, `public/trainings/`와 다른 v.o1.1.1 자료를 섞지 않습니다. 최신 전용 데이터는 `public/data/soldiers-modern-index.json`에 저장하며 29개 바디, 72개 획득형, 83개 변신, 연구 4,629개, 병사 허용 방어구 540개, 훈장 110개를 포함합니다.

- 변신 실행 순서, 필수/금지 이력의 방향성, 초기 획득형의 이전 변신 기록, 병종 변경, 연구 영구 폐쇄·대체 해금, 생존·부상·훈장·스탯·재료를 검사합니다. 연구 플래그 `STR_UNAVAILABLE`이 필요한 3개 내부 전용 변신은 일반 캠페인의 후보에서 자동 제거합니다. 훈장 요구 등급 0도 해당 훈장의 실제 보유를 요구합니다.
- **세이브는 사용자의 브라우저에서만 읽습니다.** v.o2 / Extended 8.7.1 버전 확인 후 완료/폐쇄 연구와 현재 대원 및 완공 시설·현재 재료·훈장·능력치 등을 판정에 활용합니다. 개인정보가 담긴 `.sav` 파일은 서버에 전송하지 않습니다. 테스트용 허구의 소형 세이브만 저장소에 포함됩니다.
- 방어구는 **한 벌만 착용**하고, 동일 SoldierBonus 특성은 중복 합산하지 않습니다. OXCE 실효 전투 능력치는 원시 능력치+모든 특성 보너스+장갑 보정 합산 후 최종 최소값을 적용하며, Psi 기술의 훈련 자격 판정과 실제 전투 표시는 구분합니다. 정확한 장비·훈장 보너스 증거가 없으면 현재 실효 능력치를 확정하지 않습니다.
- 일반 갈(`STR_SOLDIER`)과 반 슈퍼변이체 농부(`STR_HALF_UBER_GIRL_RECRUITMENT`)의 **83개 변신 전수 비교표**에서 서로 다른 27개 판정 유형을 필터로 확인할 수 있습니다. 일반 갈은 계보 43개 + 내부 전용 2개 = 45개 확정 제외, 반 슈퍼변이체 농부는 계보 31개 + 내부 전용 3개 = 34개 확정 제외입니다. 나머지 38개·49개는 **실제 획득 확정이 아니라 추가 조건 탐색 대상**입니다.
- 미래 연구 이벤트, 유동적인 물품 공급, 전투 성장·랜덤 재굴림, 세이브 외부 국가·지역 효과와 모든 가능한 연구·선장 선택의 조합은 완전 증명되지 않았습니다. 정적 계보로 갈 수 없는 것과 현재 세이브로 확인한 미충족 조건은 자동 판정하지만, **조건부 후보를 획득 확정으로 표시하지 않습니다.** 이론적 최종 수치의 완전 검증을 선언하지 않습니다.

로컬 2.1 데이터 재생성: `node tools/build-data.mjs --source "<X-Piratez 2.1 모드 폴더>" --soldiers-modern-only`. 전용 QA: `npm run check:soldiers:modern`, `npm run check:soldiers:modern:browser`. `npm run check`에도 포함되어 있으며, 공개 Pages 배포의 브라우저 게이트도 확인합니다.

## 병사훈련·상호배타 조합 DB

`public/trainings/`는 공식 v.o1.1.1의 `soldierTransformation` 83개를 전수 표시합니다. 병종 29개 또는 실제 획득형 72개를 선택하고, 훈련을 체크한 순서대로 이전 변신 기록을 갱신하여 필수 선행·방향성 상호배타·대상 병종·생존 상태를 재검증합니다. 209건의 방향성 배제와 16건의 비대칭 관계도 원본 `forbiddenPreviousTransformations`대로 다루며 임의로 쌍방 배제하지 않습니다. `removeTransformations`와 병종 전환, 반복 가능한 훈련/복제도 구분합니다. 단계 해제 시 그 이후 선택도 취소합니다. 직접 능력치 변화와 `soldierBonus` 특성 보너스는 별도 표시합니다.

**중요:** 조합기에서 「선택 가능」은 구조적 가능성입니다. 연구 완료, 실물 재료, 건물 기능, 훈장, Psi 수치/계급은 세이브 파일 없이 보장할 수 없습니다. 연구의 명목 선행망에 `disables` 관계가 동시에 나타나면 별도로 경고하며 강제 제외하지 않습니다. 최종 실효 스탯은 상한, 퍼센트, 순서·성장 상태에 따라 달라질 수 있습니다.

## 무엇을 보여주나

목록 화면은 한글명/영문명/내부 ID, 종류, 무게, 구매가/판매가, 위력, 피해형, 사격 명중/TU, 연구·제조 연결 수를 정렬할 수 있습니다. 상세 화면은 호환 탄약, 이 탄약을 쓰는 무기, 연구·제조 관계, 다른 룰셋에서 해당 아이템 ID가 참조되는 위치, 최종 병합된 **item 룰 객체 전체**를 보여줍니다. 픽셀·스프라이트·애니메이션·사운드 같은 표현 리소스 필드는 핵심 룰 JSON과 분리 저장하고 상세 화면에서 필요할 때만 별도 로드합니다.

특히 `refNode` 상속을 먼저 펼치며, 룰에 생략된 핵심값은 OXCE의 엔진 기본값과 X-Piratez 전역 보정값을 별도로 계산해 “실제 적용값”으로 표시합니다. 각 핵심값 옆에는 **아이템 룰 / OXCE 기본값 / X-Piratez 전역값** 중 어디에서 왔는지도 표시합니다. 희귀 필드는 UI에 별도 해설이 없어도 원본 필드 테이블에 보존됩니다.

연구 탭은 직접 선행, 후속 연구, 명시 해금, 무료 획득, 실물 표본 필요/소모 여부, 아이템/제조/기타 룰 역참조를 추적합니다. **복수 선행 · 분기 배제 필터**는 원본 4,612개 연구 중 직접 선행이 2개 이상인 1,777개를 전수 검사한 뒤, 상호배타적 선행을 동시에 기재한 42개를 보여줍니다. 전부 명시적 `unlocks` 출처가 있지만 이를 실제 접근 가능성의 증거로 취급하지 않으며, 직접 `disables`·선행 `dependencies`·우회 불가 `requires`·대체 해금 연구를 근거와 함께 구분합니다. **대체 해금 출처 자체에도 상호배타적 명목 선행이 있는 8개 연구(관련 연결 16개, 고유 출처 7개)**는 별도 필터로 표시하고, 분기 시뮬레이터에서 출처별 완료·직접 차단·경로 위험을 재검사합니다. 또한 `STR_CAPTAIN_GOLD_UP`처럼 연구 완료 시 자신을 `disables`해 완료 플래그가 사라지는 연구는 지속적인 해금 출처에서 제외하며, 이 예외가 영향을 주는 목표 연구 3개를 별도 필터로 표시합니다. 더 깊은 재귀 연구망에서는 **명목 선행 순환 7그룹·95개 연구**를 확인했고, 원본 이벤트 DB의 직접 연구 지급과 `unlocks`/`getOneFree`의 외부 진입 후보를 찾아 순환 고리 증거와 함께 표시합니다. 순환 연구를 실제 획득 불가로 일괄 판정하지 않습니다.

방어구 탭은 957개 Armor 룰을 전/좌/우/후/하 방어력, 무게, 능력치 보정, 피해유형별 저항 배율, 근접 회피, 회복·위장 값으로 정렬·비교합니다. `storeItem`을 따라 실제 장비 아이템으로 연결하고 구매·제조·연구 보상·이벤트 참조를 역추적합니다. 제조법은 재료, 시설, 비용, engineer-hours를 표시하고, 선행 연구는 중복 제거한 명목 scientist-hours와 1명/10명 환산 시간을 함께 보여줍니다.

병종 탭의 기본 단위는 내부 `RuleSoldier` 29개가 아니라 **실제 획득형 72개**입니다. 직접 고용 15개, 제조/Recruitment 48개, 이벤트 생성 9개를 각각 별도 행으로 추적하고, 같은 Soldier Type이라도 `spawnedSoldier.currentStats`나 생성 시 `transformationBonuses`가 다르면 서로 다른 획득형으로 분리합니다. 자동 특성의 soldierBonus `stats`를 OXCE 엔진과 같은 순서로 합산한 **실전 생성 능력치**를 TU·기력·체력·용기·반응·사격·투척·근력·Psi·근접·Mana별 최소/평균/최대로 정렬할 수 있습니다. 29개 RuleSoldier는 내부 바디/성장 규칙 참고 탭으로 따로 두며, 초기 획득 이후의 변신·훈련은 83개 루트를 별도 탭으로 제공합니다. Saint 지원군은 31칸 가중표지만 고유 결과는 15개이며, 각 획득형에 슬롯 수와 확률을 표시합니다. Psi Skill은 기본 0이면 특성만으로 잠금 해제되지 않는 OXCE 예외도 반영합니다. 상세창에는 직접 고용·제조/Recruitment·이벤트 획득 방식, 분기 전용 여부, 명목 누적 연구량, Destructor 같은 특수 훈련의 전체 선행 연구트리를 연결합니다.

병사훈련 DB에는 83개 변신의 209개 방향성 배제, 62쌍 양방향 및 16쌍 단방향 관계, 자기 재시행 제한과 필수 선행을 조합 순서대로 확인하는 기능이 있습니다. 원본 YAML .sav의 완료 연구·현재 영구 배제 연구(status=2)와 기지별 주둔 대원(currentStats, rank, previousTransformations, transformationBonuses, diary commendations), 재고(items), 시설(facilities)을 브라우저 안에서만 판독합니다. 기지와 대원을 선택하면 현재 병종·변신 이력이 훈련 순서 배제 계산에 자동 적용되며, 각 SoldierBonus는 OXCE처럼 고유 ID별 한 번만 능력치에 반영합니다. 재고는 선택 기지의 즉시 보유분만, 기지 기능은 완공 시설만 계산합니다. **온전한 재고·시설 목록에서 확인한 누락은 0으로 처리하지만, 목록 자체가 누락되거나 파싱이 불완전한 경우 0으로 추정하지 않습니다.** 수동 보정은 현재 선택에만 적용하며 기지·대원 변경 시 초기화합니다. 이 판정은 선장/연구 경로 시나리오를 자동 수정하지 않으며 실제 훈련 가능을 확정하지 않습니다. 사망 대원 시체 회수 여부, 예정한 변신 후의 새 능력치·재고, 이송 중인 대원/물자는 별도로 확인해야 합니다.\n\n탈것/기체 탭은 탑승 병력·조종사·속도·연료·내구·무장·레이더·비용을 비교하고, 직접 구매/제조법과 핵심 재료의 이벤트 획득원을 연결합니다. 예를 들어 Schoolbus처럼 특정 이벤트 재료가 필요한 기체는 이벤트의 연구 트리거, 월 제한, 난이도, 기타 트리거까지 함께 표시합니다.\n\n기체무장 탭은 155개 `craftWeapons` 프로필의 weaponType, 위력·사거리·명중·탄약·재장전·재보급률·지원 스탯을 비교하고, 각 장비가 실제로 장착 가능한 기체/슬롯을 역추적합니다. `launcher`와 `clip`이 `items`의 개인 전술무기·탄약을 재사용하는지도 표시합니다. 예를 들어 `STR_CRAFT_PIR_CANNON_UC`(해적 대포)는 `STR_PIR_CANNON`(돌격대포)과 `STR_PIR_CANNONBALL`(대포알)을 재사용하지만, 기체전 위력·사거리·명중은 craftWeapon 프로필의 별도 수치를 사용합니다.\n\n기지시설 탭은 115개 effective facility 룰의 건설비·기간·월 유지비/수익·면적·숙소·창고·연구실·작업장·훈련실·격납고·포로 수용·탐지·방어를 비교합니다. 시설의 `provideBaseFunc`와 연구/제조/시설의 `requiresBaseFunc`를 양방향 역추적해 “이 시설을 지으면 실제로 무엇이 열리는가”를 표시하고, 전체 선행 연구망·건설 재료·파괴/개조 상태도 함께 보여줍니다.

영구 선택·분기 DB는 초기 5선장부터 PUSSY 클래스·Unclassed 혼합형·Pure/Ultimate, Codex, 갈라지는 길, 세력·병종·스토리 상호배타까지 한곳에서 비교합니다. **선택 조합 시뮬레이터**에서 연구 카드를 순서대로 완료로 가정하면 룰셋의 방향성 `disables`에 따라 다른 선택지가 즉시 차단되고 이유가 표시됩니다. 과거 완료 연구 ID를 붙여넣거나 4,612개 연구를 검색해 기준 상태에 추가할 수도 있습니다. XPiratez .sav 파일을 브라우저 안에서 직접 읽어 현재 완료 연구(discovered), 영구 배제 상태(researchRuleStatus=2), 연구 일지(researchDiary)의 날짜·획득 경로를 반영합니다. 현재 영구 배제된 연구가 과거 어떤 연구의 직접 disables에 걸렸는지 일지와 룰셋을 교차 대조한 원인 후보도 보여줍니다. 원본 OXCE 엔진에 따라 후속 disables가 이미 완료된 연구 플래그를 제거하고 영구 배제하는 상황까지 계산합니다. 기존 지급품·이벤트 보상의 소급 회수 여부는 별도 룰입니다. 연구의 `dependencies`와 `requires`를 분리하고, 이미 완료한 연구의 `unlocks`로 dependencies를 우회하는 OXCE 엔진 규칙을 반영했습니다. `getOneFree`의 중복 후보는 추첨 가중치로 보존하며, 현재 배제·완료 상태에서 남은 무료 지급 후보(고유 종류 수 및 추첨칸 수)를 보여주지만 실제 RNG 결과를 임의로 지급하지 않습니다. 실물·시설·이벤트·0비용 자동 연구·선행 미완료 조건이 있으면 연구 가능을 확정하지 않습니다. 각 선택의 선행·즉시 보상·후속 해금뿐 아니라 영구 손실과 복구/우회 가능성을 함께 표시하며, 반복 이벤트 경제·방어/탐지·병사 강화·Chaos Saint 공급과 인프라 영향도 연결합니다. 정적 모듈은 `public/captains/`에 있습니다.

영구 선택·분기 DB에는 **22개 선장 선택지의 실제 후속 장점·조건부 보상**을 표시합니다. 기존 시설·능력훈련 표에 빠져 있던 도둑 계급의 **선장의 11(Captain’s 11)** 보상(5개 이벤트 선행 → 토큰 11개 + 연구 플래그, 훈련 1명당 토큰1·글래머21·$100k·500시간)을 대표 이점으로 강조하고, 모든 분기마다 원본 4,612개 연구의 명시적 unlocks 및 792개 이벤트로부터 직접/후속 조건부 경로를 검증해 제공합니다. 목록은 해당 선장을 택했다는 이유만으로 자동 지급된다는 뜻이 아니며, 각 이벤트의 실제 트리거·추첨 가중치·부정 조건·지급품·상호배제와 원본 DB 링크를 별도로 표시합니다. 보상 색인은 경량으로 시작하고 선장별 후속 이벤트 전체 자료는 선택 시 별도 로딩합니다. 모바일에서는 검색 툴바를 비고정 처리하고 표 헤더를 축소하여 실제 스크롤 시 화면 상단 20% 이내만 차지하도록 브라우저 검사합니다.

영구 선택·분기 페이지는 정규화 연구 DB의 `raw.disables` 보유 연구 163개를 86개 연결요소로 전수 감사하고, 내부 PREQ/result 플래그를 제외한 실제 선택축과 경로 결과를 구분해 보여줍니다. Codex의 선택 연구와 실물 Codex 연구에서 발생하는 2중 4색 상호배타도 따로 보여줍니다. 기본 4선장의 Saint 보완색(무모→Green, 멍청→Gray, 게으름→Red, 소심→Gold), G1~G8 Captain×Codex 보너스, Saint 진입 시 중단되는 보너스, Gray/Sore-Ass 등으로 봉쇄되는 부정·도박 이벤트까지 교차표로 정리합니다.

병종/탈것의 **명목 누적 연구량**은 표시된 해금 루트의 `dependencies`와 `requires`를 중복 제거해 합산합니다. OXCE는 이미 비활성화된 선행 연구를 검사에서 제외할 수 있고 `unlocks`, `getOneFree`, 이벤트 직접 지급으로 우회하는 경우가 있으므로, 실제 플레이에서 필요한 연구량은 이 명목값보다 작을 수 있습니다. 페이지는 분기 연구·실물 표본·필요 기지기능·이벤트 조건을 함께 표시해 실제 경로를 따로 판단할 수 있게 합니다.

## 로컬에서 데이터 갱신

Node.js 20+ 기준입니다.

```bash
npm install
npm run build:data -- --source "C:/path/to/user/mods/Piratez"
npm run check              # 전체 DB · 스타팅 · 선택지 · 프런트 자산 통합 검증

# 스타팅만 검증 (원본 이벤트 및 번역 지연/실패/재시도까지)
npm run check:starting

# 선택: 실제 Chrome/Edge에서 14개 DB를 모바일 화면으로 열고
# 검색·상세창·HTTP/자바스크립트 오류까지 검사
npm install --no-save --package-lock=false playwright-core@1.64.0
node tools/check-site-browser.mjs --local
node tools/check-site-browser.mjs --base=https://road2man-cloud.github.io/xpiratez-data-atlas/

# 병사훈련 전용 sidecar 갱신 (다른 DB/Pages 자산에 손대지 않음)
npm run build:trainings -- --source "C:/path/to/user/mods/Piratez"
npm run check:trainings

# 기지시설 DB만 안전하게 갱신·검증
npm run build:facilities -- --source "C:/path/to/user/mods/Piratez" --out public/data
npm run check:facilities -- --data public/data

# 공개 아이템/연구 DB 전용 생성·검증
npm run build:item-research -- --source "C:/path/to/user/mods/Piratez" --out public/items/data
npm run check:item-research -- --data public/items/data
```

개인 로컬 용도로 UFOPEDIA 본문까지 포함하려면 `--include-lore`를 추가할 수 있습니다. 공개 저장소에는 기본 생성물만 커밋하는 것을 권장합니다.

생성기는 Ruleset의 `*.rul` 파일을 읽고 같은 ID의 규칙을 순서대로 병합한 뒤 `refNode` 상속을 펼칩니다. 상세 DB는 청크로 나뉘어 필요한 데이터만 브라우저가 가져옵니다. 병종/탈것 progression은 연구 노드를 `progression-research.json`에 한 번만 저장하고, 연구 경로는 숫자 인덱스 배열, 제조법·이벤트는 ID 참조로 정규화해 동일 정보의 반복 저장을 피합니다.

아이템/연구 공개 DB는 정보 손실 없이 중복을 정규화합니다. 반복되는 한·영 이름은 `entities.json`에 한 번만 저장하고, 연구·제조·역참조는 ID와 경로를 중심으로 연결합니다. `effectiveCoreSources`와 전역 기본값처럼 모든 아이템에 반복되던 메타데이터도 스키마로 이동합니다. 표현 리소스 필드는 `resource-chunks/` sidecar로 분리하며 원본 JSON pointer와 값을 보존하므로 다시 합치면 원본 룰 객체를 복원할 수 있습니다. v.o1.1.1 기준 기존 공개용 생성물 약 58 MiB가 약 30 MiB로 줄며, 검증기는 단일 생성 파일이 50 MiB를 넘으면 실패하도록 막습니다.

## 배포

`public/` 폴더가 완성된 정적 사이트입니다. `.github/workflows/pages.yml`은 main 브랜치 push 시 저장소의 정적 산출물을 검증해 GitHub Pages에 배포합니다. 병종/탈것 progression도 공식 X-Piratez v.o1.1.1 원본으로 로컬 생성·검증한 정규화 JSON을 `public/data/progression*`에 보존하므로 Pages 배포는 외부 다운로드에 의존하지 않습니다. GitHub-hosted runner에서는 ModDB가 403을 반환하므로 `.github/workflows/publish-progression.yml`은 외부 다운로드/자동 재생성 대신 체크인된 compact progression의 구조·크기·smoke test를 검증합니다.

## 권리

사이트 코드에는 MIT 라이선스를 적용합니다. X-Piratez, OpenXcom/OXCE, 원본 X-COM 및 모드 데이터/문구에 대한 권리는 각 원저작자에게 있으며 MIT 라이선스의 적용 대상이 아닙니다. 이 저장소는 팬 제작 기술 참고 도구입니다.

## OXCE 엔진 참조표 (2026-10-24)

- **웹 페이지:** [참조표 / reference](./public/reference/) · 배포 URL: https://road2man-cloud.github.io/xpiratez-data-atlas/reference/
- **기계 판독용 번호 정의:** [engine-codes.json](./public/reference/engine-codes.json) — experienceTrainingMode 0–32, damageType 0–19, damageAlter.RandomType 0–9, 성장 상한 용어
- **최신 게임 X-Piratez 2.1 아이템:** [items.json](./public/reference/items.json) — 현재 설치본 v.o2의 경험치 모드 직접 선언 306개. 참조표에는 이 데이터만 표시하며 이전 버전 데이터는 제공하지 않습니다.
- **검증:** `npm run check:reference`. `npm run check` 및 Pages 배포 검사에도 포함됩니다.

**GPT 검색 순서:** engine-codes.json에서 번호 의미를 확인 → 최신 게임 [items.json](./public/reference/items.json)에서 `i` (원본 ID), `m` (experienceTrainingMode), `f` / `l` (원문 출처) 확인. `null`로 표시한 `damageType`이나 `power`는 0이 아니라 **해당 아이템 블록에 직접 선언되지 않았다**는 뜻입니다. 상속·탄약·오버라이드·스크립트 적용 결과는 별도 검증해야 합니다.

현재 참조표는 **2026-10-24에 확인한 X-Piratez 2.1 (v.o2), OXCE 8.7.1** 설치본을 기준으로 합니다. 버전 선택기와 구버전 데이터는 제거했습니다. 새로운 게임 업데이트가 나오면 `items.json`과 브라우저용 `items.js`를 함께 갱신하고 `npm run check:reference`로 검증해야 합니다. `extendedExperienceAwardSystem: true` 및 기절·정신지배 시 경험치 제한도 함께 고려해야 합니다.
