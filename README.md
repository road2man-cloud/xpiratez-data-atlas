# X-Piratez Data Atlas

X-Piratez [아이템 DB](./public/items/) · [연구 DB](./public/research/) · [병종 DB (훈련 경로 통합)](./public/soldiers/) · [기지시설 DB](./public/facilities/) · [기체무장 DB](./public/craft-weapons/) · 방어구·병종·탈것을 **검색·정렬·비교**하고, 상세 화면에서 실제 적용 핵심 스펙, 원본 룰 필드, 연구/제조/이벤트 역참조를 확인할 수 있는 정적 웹 DB입니다. 병종과 탈것은 획득 방식, 해금 연구트리, 명목 누적 연구량, 분기 전용 조건, 표본/기지 기능/기간 제한 같은 특수조건까지 추적합니다.

## 버전별 자료의 적용 범위

**기존 무기·아이템·연구 등 정적 DB는 X-Piratez v.o1.1.1 / OXCE 8.6**이지만 **현재 병종 DB는 X-Piratez 2.1 / OXCE 8.7.1만 제공합니다.** 별도 `public/reference/` 엔진 번호표 및 직접 경험치 선언 아이템 306개도 최신 설치본을 기준으로 합니다. 동일한 내부 ID라도 버전 사이에서 스펙, 연구 선행, 해금, 저항, 경험치 및 전투 스크립트의 일치를 가정하지 마세요. 참조표의 최신 엔진 규칙을 기존 DB 수치에 적용하는 계산은 2.1 게임에서 검증된 계산이 아닙니다. 사이트 내 각 페이지의 버전 안내를 먼저 확인하세요.

## 기준 데이터

- X-Piratez: **v.o1.1.1**
- OXCE 요구 버전: **8.6**
- 현재 생성 결과: **4,007 items / 4,612 research / 957 armors (496 store-item armors) / 29 base Soldier rules / 72 acquisition profiles / 83 soldier transformations / 998 soldier bonuses / 96 crafts / 155 craft weapons / 115 facilities / 2,158 manufacture / 4,972 ufopaedia records**
- 한국어 이름은 모드의 `Language/ko.yml`, 영문은 `Language/en-US.yml`에서 해석합니다.
- 이미지·음원·맵 등 원본 게임 자산은 포함하지 않습니다.
- UFOPEDIA 장문 본문은 저작권이 있는 원문 재배포를 피하기 위해 기본 생성물에서는 제외합니다.

## 모든 DB의 간결한 플레이 판단

기존 14개 카탈로그에 대한 **정적 원본 16,391개 항목**을 검증하며, 병종·훈련은 하나의 최신 2.1 메뉴로 합쳤습니다. 나머지 공개 DB에는 **요약 · 판단** 기능을 제공하며 목록에서 한 줄 결론을 미리 보여줍니다. 클릭하면 **한눈에 보는 결론 → 실제 효과 → 해금·자격·비용 → 실행 방법 → 언제 가치가 있는가 → 주의·예외** 순서로 설명합니다. 각 구형 카탈로그의 검색·정렬·세부 수치·원본 근거는 내부 회귀검사로 보존하고, 2.1 병종 경로는 별도 출처 검증에 따라 갱신합니다.

**데이터 생성:** npm run build:play-guide (기존 룰셋 정규화 데이터와 연구·아이템·제조·이벤트·적부대 editorial sidecar에서 생성). **검증:** npm run check:play-guide (14개 DB의 전체 원본 ID와 가이드 1:1 대응·필수 필드·Captain's 11 원본 이벤트/변신/특성 교차 확인). 두 명령은 패키지에 등록되어 있고, 가이드 검증은 통합 npm run check 및 Pages 배포 게이트에 포함됩니다.

연구를 **요구**하는 이벤트와 연구를 직접 **지급**하는 이벤트, 직접 병사 스탯과 별도 SoldierBonus, 훈련의 방향성 상호배타와 후속 훈련 봉쇄를 구별합니다. 이 요약은 **원본 기반의 정적 플레이 해석**이지 현재 세이브를 실행한 실측·게임 내부 예외의 전수 증명이 아닙니다. 연구 완료·시설·재료·분기 충족은 각 원본 버전과 별도의 시간순 경로 검증으로 확인해야 합니다.

## 병종 DB — 2.1 출생처별 잠정 최고 경로

[병종 DB](./public/soldiers/)는 **X-Piratez v.o2 / OXCE 8.7.1 전용의 유일한 병사·훈련 연구 화면**입니다. 별도의 병사훈련 DB와 화면의 로컬 세이브 입력은 제거했습니다. 옛 훈련 깊은 링크는 병종 DB의 해당 훈련 근거로 이동하며, 1.1.1 병종/훈련 UI는 공개하지 않습니다.

### 등록 상태와 숫자의 범위

- **출생 프로필 72개 전부 독립 등록** (병종 29종, 다른 병종으로 변경되는 40개 입구는 출생처와 구분). 2.1 연구에 `needItem`이 있지만 해당 ID가 2.1 원본 아이템에 없으면, 무조건 획득 가능한 표본으로 취급하지 않고 이벤트·임무 완료 플래그의 별도 공급 증거를 기다립니다.
- **66개 출생처에서 잠정 경로 163개를 재생**하고 개인별 최고 발견값을 게시. 나머지 **6개는 미해결 병목**을 표시하며 값을 지어내지 않습니다. 숫자는 새 탐색 결과에 따라 달라질 수 있습니다.
- 한 출생처만 반복 탐색하려면 `node tools/build-soldier-origin-candidates.mjs --profile=direct:STR_SOLDIER_X`처럼 원본 출생 프로필 ID를 지정합니다. 기존 71개 출생처와 재생을 통과한 이전 후보는 보존하며, 현재 합계만 낮다는 이유로 미래 분기 선택이 다른 후보를 버리지 않습니다. 등록된 후보 전체 검증은 `node tools/build-soldier-origin-candidates.mjs --check`로 수행합니다.
- 각 후보는 완료 연구가 없는 상태에서 출발합니다. 요구 연구를 연구실·직접 해금·무료 지급 시점·자동 비용 0 큐·이벤트 직접 지급 순서에 맞춰 재생하고, 출생과 훈련을 같은 병사의 이력으로 처리합니다. 화면에는 연구 전체 목록보다 **분기 선택과 일방향/양방향 배제 근거**를 보여 줍니다. 배제의 방향과 실제로 새로 폐쇄된 단계·이미 폐쇄됐던 상태·후속 재활성화·마지막 폐쇄 상태를 구분하며, 자동 연구가 같은 단계에 여러 개 처리될 때는 단일 연구의 독점적인 인과관계로 단정하지 않습니다. 상세 페이지의 연구 이름을 누르면 연구 관계와 무료 지급·배제 방향을 확인할 수 있습니다.
- 잠정 점수는 **출생 최솟값 + 실행 순서로 재생된 확정형 능력치 변화/영구 SoldierBonus**만 사용합니다. 전투 XP, 체육관 성장, 새 훈장, 승진, 출생 RNG의 최고 결과와 무작위 시술의 유리한 결과는 자동 가산하지 않습니다. 어떤 후보도 다른 병사·다른 연구 경로의 보너스를 섞지 않습니다.
- 원본 파일에 존재하는 표본·재료·자금·기지 기능은 **외부 확보 가정**으로 따로 기재합니다. 무료 연구 추첨·이벤트 확률·출생 RNG와 월별 유지비 등도 **조건부**입니다. 따라서 연구 순서 재생 성공은 실제 게임 실행 성공을 보증하지 않습니다.
- 목표 A(**Mana 포함 영구 보너스 12종 합계**)와 B(**Mana 포함 실효 능력치 12종 합계**)는 따로 비교합니다. 사이트에는 두 목표 모두 12종 값만 표시하고, 게임 표시 순서로 근접을 근력 앞에 두고 Mana까지 표시합니다. 과거 11종 재생 지문과 원시/보너스/실효값은 내부 회귀검사용으로만 보존하며 공개 비교값이나 정렬 기준으로 사용하지 않습니다. 12종 현재 능력치·영구 보너스는 원본 출생값과 동일 훈련의 결정론적 계산식으로 재구성합니다. 동일 출생처에서 더 나은 후보가 재생을 통과하면 기존 후보와 비교하여 갱신합니다. **최종 최대치 인증은 0건**이며 모든 경로의 최적성과 실제 게임 실측이 증명되기 전에는 인증하지 않습니다.

### 연구 순서 병목 해소 사례: 시끄러운 유령 실체화

`manufacture:STR_POLTERGEIST_EMBODIMENT`의 기존 실패는 영구 불가능이 아니라 탐색 순서 문제였습니다. 20개월 한정 이벤트를 24개월 이후에 시도하거나, 보호된 무료 연구의 원천을 보호 조건보다 먼저 소비하면 필요한 연구를 얻지 못합니다. `STR_PSI_INITIATION`, `STR_ACADEMY_MED_KNOWHOW`를 먼저 **실제로 탐색·재생할 목표**로 지정하면 원본 규칙을 바꾸지 않고 출생까지 이어집니다.

재현 명령: `node tools/build-soldier-origin-candidates.mjs --profile=manufacture:STR_POLTERGEIST_EMBODIMENT --research-first=STR_PSI_INITIATION --research-first=STR_ACADEMY_MED_KNOWHOW`. `--research-first`는 연구를 완료 처리하는 옵션이 아닙니다. 모든 공급 경로를 기존 재생기로 검사하며, 다른 출생처를 바꾸지 않도록 반드시 `--profile`과 함께 사용합니다.

신규 5개 후보 중 첫 최고 경로는 **연구 433개 처리 · 339개 재생 단계 · 돌연변이 무술 훈련 → 자랑스러운 전사 · 12종 능력치 합계는 병종 DB의 검증된 현재 표시값을 참조**입니다. 출생 최소값에서 시작했고 전투·체육관 성장과 훈장 추가는 없습니다. 20개월 이벤트와 무료 연구 당첨, 실물·자금·시설 공급, 달력 소요시간은 조건부이며 **최종 최대치 인증은 아닙니다**. `tools/check-origin-priority-chronology.mjs`에서 이 경로를 보존하고, 이벤트 지연·보호 조건 누락·무료 보상 재사용을 각각 거부하는 반례를 확인합니다.

### 연구 순서 병목 해소 사례: 고양이 전사 모집

`manufacture:STR_CATGIRL_WARRIOR_RECRUITMENT`은 기존 연구 경로 탐색에서 `STR_SCHOOLING_2_B`의 깊은 선행 관계 때문에 실패했습니다. 보호된 무료 연구와 인접한 선행 조건을 먼저 탐색해 `STR_ACADEMY_MED_KNOWHOW → STR_MUTANT_PHYSIOLOGY → STR_SCHOOLING_2_B` 순서를 확보하면 X-Piratez 2.1 원본 룰을 수정하지 않고 연구·제조·출생까지 연결됩니다.

재현 명령: `node tools/build-soldier-origin-candidates.mjs --profile=manufacture:STR_CATGIRL_WARRIOR_RECRUITMENT --birth-only --research-first=STR_ACADEMY_MED_KNOWHOW --research-first=STR_MUTANT_PHYSIOLOGY --research-first=STR_SCHOOLING_2_B`. `--birth-only`는 긴 경로의 *후속 훈련 최적화만 보류*하고, 이미 재생 성공한 출생 후보를 먼저 등록합니다. 연구를 임의로 완료 처리하지 않으며 `--profile` 없이는 사용할 수 없습니다.

등록한 첫 후보는 **완료 연구 0개 시작 → 연구·출생 515단계 → 처리된 연구 627개 → 고양이 전사 출생 → Mana 포함 12종 합계 660**입니다. 연구 이벤트는 24개월까지 진행한 조건부 시나리오입니다. 출생 RNG·표본·기지 기능·자금·이벤트 발생 결과·달력 소요시간 및 실제 게임 재현은 미검증이며, **최종 최대치 인증은 아닙니다**. 표시·정렬·비교는 **12종 합계 660**만 사용합니다. `tools/check-origin-catgirl-chronology.mjs`에서 20개월 이벤트 기한·기지 기능·연구 선행·제조 재료를 누락한 반례를 거부합니다.

### 연구 관계 표기

연구 상세는 정확히 다음 여섯 가지를 좌우로 구분합니다.

| 좌측 · 이 연구의 조건 | 우측 · 이 연구의 영향 |
|---|---|
| **무조건 필요** (`requires`) | **필수로 요구됨** (다른 연구의 `requires` 역참조) |
| **조건 충족** (`dependencies`) | **조건으로 사용됨** (다른 연구의 `dependencies` 역참조) |
| **직접 해금** (다른 연구가 이 연구를 `unlocks`) | **직접 해금함** (이 연구의 `unlocks`) |

`getOneFree`와 `getOneFreeProtected`는 **무료 지급 후보**로 별도 표시하고 `unlocks`와 혼동하지 않습니다. `lookup`, `disables`, `reenables`도 독립 표시합니다. 양방향 배제는 둘 다 상대를 `disables`하는 경우만, 한쪽만 폐쇄하면 **일방향 배제**로 기록합니다. 폐쇄되기 전 이미 수행한 영구 시술은 별도 시간순 이력으로 판정합니다.

### 보존된 분석 및 검증

기존 2.1의 4,654개 연구 규칙·441건 연구 직접 배제, 72개 출생 프로필·40개 병종 변경 입구, 401개 구조적 변신 사슬·3,559단계 조건부 능력치 감사는 **내부 증거와 회귀검사에 보존**합니다. 이를 실현 가능한 개인 최고 능력치로 단순 승격하지 않습니다.

- 규칙과 후보 생성: `public/data/soldiers-modern-index.json`, `public/data/soldier-origin-candidates.json`, `tools/build-soldier-origin-candidates.mjs`.
- 연구/이벤트/훈련 순서 재생: 기존 `campaign-proof.js`를 사용하는 `origin-witness.js`와 `foundation-research-planner.js`. 새로운 경쟁 연구 DB를 만들지 않습니다.
- 원본 버전·파일 해시·시술 순서·영구 보너스 중복·조건부 이벤트·방향성 연구 폐쇄·최대치 허위 인증을 검사하고 불일치 시 표 전체를 차단합니다.
- 검사: `npm run check:origin-candidates`, `npm run check:research-relations`, `npm run check:soldiers:modern:browser`, `npm run check:all` 및 `node tools/check-site-browser.mjs --local`.

2.1 병종 DB에 대해서만 **구형 데이터의 화면 로드와 세이브 입력이 금지**됩니다. 나머지 무기·아이템·연구 등 DB는 별도의 1.1.1 원본이 남아 있으므로, 그 자료를 2.1 병사의 능력치·연구 실현성 증거로 대체 사용하지 않습니다.

## 무엇을 보여주나

목록 화면은 한글명/영문명/내부 ID, 종류, 무게, 구매가/판매가, 위력, 피해형, 사격 명중/TU, 연구·제조 연결 수를 정렬할 수 있습니다. 상세 화면은 호환 탄약, 이 탄약을 쓰는 무기, 연구·제조 관계, 다른 룰셋에서 해당 아이템 ID가 참조되는 위치, 최종 병합된 **item 룰 객체 전체**를 보여줍니다. 픽셀·스프라이트·애니메이션·사운드 같은 표현 리소스 필드는 핵심 룰 JSON과 분리 저장하고 상세 화면에서 필요할 때만 별도 로드합니다.

특히 `refNode` 상속을 먼저 펼치며, 룰에 생략된 핵심값은 OXCE의 엔진 기본값과 X-Piratez 전역 보정값을 별도로 계산해 “실제 적용값”으로 표시합니다. 각 핵심값 옆에는 **아이템 룰 / OXCE 기본값 / X-Piratez 전역값** 중 어디에서 왔는지도 표시합니다. 희귀 필드는 UI에 별도 해설이 없어도 원본 필드 테이블에 보존됩니다.

연구 탭은 직접 선행, 후속 연구, 명시 해금, 무료 획득, 실물 표본 필요/소모 여부, 아이템/제조/기타 룰 역참조를 추적합니다. **복수 선행 · 분기 배제 필터**는 원본 4,612개 연구 중 직접 선행이 2개 이상인 1,777개를 전수 검사한 뒤, 상호배타적 선행을 동시에 기재한 42개를 보여줍니다. 전부 명시적 `unlocks` 출처가 있지만 이를 실제 접근 가능성의 증거로 취급하지 않으며, 직접 `disables`·선행 `dependencies`·우회 불가 `requires`·대체 해금 연구를 근거와 함께 구분합니다. **대체 해금 출처 자체에도 상호배타적 명목 선행이 있는 8개 연구(관련 연결 16개, 고유 출처 7개)**는 별도 필터로 표시하고, 분기 시뮬레이터에서 출처별 완료·직접 차단·경로 위험을 재검사합니다. 또한 `STR_CAPTAIN_GOLD_UP`처럼 연구 완료 시 자신을 `disables`해 완료 플래그가 사라지는 연구는 지속적인 해금 출처에서 제외하며, 이 예외가 영향을 주는 목표 연구 3개를 별도 필터로 표시합니다. 더 깊은 재귀 연구망에서는 **명목 선행 순환 7그룹·95개 연구**를 확인했고, 원본 이벤트 DB의 직접 연구 지급과 `unlocks`/`getOneFree`의 외부 진입 후보를 찾아 순환 고리 증거와 함께 표시합니다. 순환 연구를 실제 획득 불가로 일괄 판정하지 않습니다.

방어구 탭은 957개 Armor 룰을 전/좌/우/후/하 방어력, 무게, 능력치 보정, 피해유형별 저항 배율, 근접 회피, 회복·위장 값으로 정렬·비교합니다. `storeItem`을 따라 실제 장비 아이템으로 연결하고 구매·제조·연구 보상·이벤트 참조를 역추적합니다. 제조법은 재료, 시설, 비용, engineer-hours를 표시하고, 선행 연구는 중복 제거한 명목 scientist-hours와 1명/10명 환산 시간을 함께 보여줍니다.

병종의 현재 공개 화면은 **2.1 출생처 72개**를 기본으로 사용하며, 병종 29개만으로 서로 다른 출생 이력·영구 특성·계급을 합치지 않습니다. 등록한 연구 경로에서 단계별 훈련·변신의 상세와 방향성 배제를 확인합니다. 잠정 최고 경로는 시작 연구 0개에서 재생된 **조건부 후보**이고, 미완료 출생처에는 연구·이벤트 병목을 표시합니다. 과거 병종별 정적 최대치·훈련 조합·로컬 세이브 입력 화면은 더 이상 공개하지 않습니다.

**과거 v.o1.1.1 병사훈련 데이터는 내부 회귀검사용으로만 보존됩니다.** 현재 공개 병종 DB는 2.1 원본 훈련·연구·이벤트·출생 데이터만 계산에 사용합니다. 별도의 로컬 세이브 판독 인터페이스나 훈련 DB는 제공하지 않습니다.

탈것/기체 탭은 탑승 병력·조종사·속도·연료·내구·무장·레이더·비용을 비교하고, 직접 구매/제조법과 핵심 재료의 이벤트 획득원을 연결합니다. 예를 들어 Schoolbus처럼 특정 이벤트 재료가 필요한 기체는 이벤트의 연구 트리거, 월 제한, 난이도, 기타 트리거까지 함께 표시합니다.\n\n기체무장 탭은 155개 `craftWeapons` 프로필의 weaponType, 위력·사거리·명중·탄약·재장전·재보급률·지원 스탯을 비교하고, 각 장비가 실제로 장착 가능한 기체/슬롯을 역추적합니다. `launcher`와 `clip`이 `items`의 개인 전술무기·탄약을 재사용하는지도 표시합니다. 예를 들어 `STR_CRAFT_PIR_CANNON_UC`(해적 대포)는 `STR_PIR_CANNON`(돌격대포)과 `STR_PIR_CANNONBALL`(대포알)을 재사용하지만, 기체전 위력·사거리·명중은 craftWeapon 프로필의 별도 수치를 사용합니다.\n\n기지시설 탭은 115개 effective facility 룰의 건설비·기간·월 유지비/수익·면적·숙소·창고·연구실·작업장·훈련실·격납고·포로 수용·탐지·방어를 비교합니다. 시설의 `provideBaseFunc`와 연구/제조/시설의 `requiresBaseFunc`를 양방향 역추적해 “이 시설을 지으면 실제로 무엇이 열리는가”를 표시하고, 전체 선행 연구망·건설 재료·파괴/개조 상태도 함께 보여줍니다.

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

## OXCE 엔진 참조표 (최신 데이터: 2026-10-27)

- **웹 페이지:** [참조표 / reference](./public/reference/) · 배포 URL: https://road2man-cloud.github.io/xpiratez-data-atlas/reference/
- **기계 판독용 번호 정의:** [engine-codes.json](./public/reference/engine-codes.json) — experienceTrainingMode 0–32, damageType 0–19, damageAlter.RandomType 0–9, 성장 상한 용어
- **최신 게임 X-Piratez 2.1 아이템:** [items.json](./public/reference/items.json) — 현재 설치본 v.o2의 경험치 모드 직접 선언 306개. 참조표에는 이 데이터만 표시하며 이전 버전 데이터는 제공하지 않습니다.
- **병종별 복셀 높이:** [병종 29종·방어구 540종 참조표](./public/reference/#unit-voxels) · [unit-voxels.json](./public/reference/unit-voxels.json) — 병종의 서기/무릎 복셀 높이와 방어구 착용 시 실효 높이, 점유 타일, 무릎 허용 선언, **서서 사격 및 무릎 사격의 각 출발 Z**, 방어구별 **충돌 마스크 ID와 실측 16×16 마스크 단면**(블러드하운드 탑승 로크나르: 9×9 범위·61복셀/층 등)을 원본 룰·LOFTEMPS.DAT SHA-256과 함께 제공합니다. [2×2 장비 전수표](./public/reference/#large-unit-voxels)는 아군이 착용 가능한 46종을 각각 한 행으로 정리하고 32×32복셀 내 실점유 780개/층, 금지된 무릎 사격, 착용 병종별 서기·총구 높이를 모두 대조합니다.
- **검증:** `npm run check:reference`; 별도 실제 브라우저 QA는 `npm run check:reference:browser`. 정적 체크는 `npm run check` 및 Pages 배포 검사에도 포함됩니다.

**GPT 검색 순서:** engine-codes.json에서 번호 의미를 확인 → 최신 게임 [items.json](./public/reference/items.json)에서 `i` (원본 ID), `m` (experienceTrainingMode), `f` / `l` (원문 출처) 확인. `null`로 표시한 `damageType`이나 `power`는 0이 아니라 **해당 아이템 블록에 직접 선언되지 않았다**는 뜻입니다. 상속·탄약·오버라이드·스크립트 적용 결과는 별도 검증해야 합니다.

아이템 번호표는 2026-10-24, 병종·방어구 복셀 참조표는 **2026-10-27에 확인한 X-Piratez 2.1 (v.o2), OXCE 8.7.1** 설치본을 기준으로 합니다. `node tools/build-data.mjs --unit-voxels-only --source <.../user/mods/Piratez>`로 복셀 JSON을 재생성할 수 있으며 자세한 근거는 [검증 문서](./docs/reference-voxels-2.1.md)에 있습니다. 버전 선택기와 구버전 데이터는 제거했습니다. 새로운 게임 업데이트가 나오면 `items.json`과 브라우저용 `items.js`를 함께 갱신하고 `npm run check:reference`로 검증해야 합니다. `extendedExperienceAwardSystem: true` 및 기절·정신지배 시 경험치 제한도 함께 고려해야 합니다.
