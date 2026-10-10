# X-Piratez Data Atlas

X-Piratez [아이템 DB](./public/items/) · [연구 DB](./public/research/) · [병사훈련·조합 DB](./public/trainings/) · [기지시설 DB](./public/facilities/) · [기체무장 DB](./public/craft-weapons/) · 방어구·병종·탈것을 **검색·정렬·비교**하고, 상세 화면에서 실제 적용 핵심 스펙, 원본 룰 필드, 연구/제조/이벤트 역참조를 확인할 수 있는 정적 웹 DB입니다. 병종과 탈것은 획득 방식, 해금 연구트리, 명목 누적 연구량, 분기 전용 조건, 표본/기지 기능/기간 제한 같은 특수조건까지 추적합니다.

## 기준 데이터

- X-Piratez: **v.o1.1.1**
- OXCE 요구 버전: **8.6**
- 현재 생성 결과: **4,007 items / 4,612 research / 957 armors (496 store-item armors) / 29 base Soldier rules / 72 acquisition profiles / 83 soldier transformations / 998 soldier bonuses / 96 crafts / 155 craft weapons / 115 facilities / 2,158 manufacture / 4,972 ufopaedia records**
- 한국어 이름은 모드의 `Language/ko.yml`, 영문은 `Language/en-US.yml`에서 해석합니다.
- 이미지·음원·맵 등 원본 게임 자산은 포함하지 않습니다.
- UFOPEDIA 장문 본문은 저작권이 있는 원문 재배포를 피하기 위해 기본 생성물에서는 제외합니다.

## 병사훈련·상호배타 조합 DB

`public/trainings/`는 공식 v.o1.1.1의 `soldierTransformation` 83개를 전수 표시합니다. 병종 29개 또는 실제 획득형 72개를 선택하고, 훈련을 체크한 순서대로 이전 변신 기록을 갱신하여 필수 선행·방향성 상호배타·대상 병종·생존 상태를 재검증합니다. 209건의 방향성 배제와 16건의 비대칭 관계도 원본 `forbiddenPreviousTransformations`대로 다루며 임의로 쌍방 배제하지 않습니다. `removeTransformations`와 병종 전환, 반복 가능한 훈련/복제도 구분합니다. 단계 해제 시 그 이후 선택도 취소합니다. 직접 능력치 변화와 `soldierBonus` 특성 보너스는 별도 표시합니다.

**중요:** 조합기에서 「선택 가능」은 구조적 가능성입니다. 연구 완료, 실물 재료, 건물 기능, 훈장, Psi 수치/계급은 세이브 파일 없이 보장할 수 없습니다. 연구의 명목 선행망에 `disables` 관계가 동시에 나타나면 별도로 경고하며 강제 제외하지 않습니다. 최종 실효 스탯은 상한, 퍼센트, 순서·성장 상태에 따라 달라질 수 있습니다.

## 무엇을 보여주나

목록 화면은 한글명/영문명/내부 ID, 종류, 무게, 구매가/판매가, 위력, 피해형, 사격 명중/TU, 연구·제조 연결 수를 정렬할 수 있습니다. 상세 화면은 호환 탄약, 이 탄약을 쓰는 무기, 연구·제조 관계, 다른 룰셋에서 해당 아이템 ID가 참조되는 위치, 최종 병합된 **item 룰 객체 전체**를 보여줍니다. 픽셀·스프라이트·애니메이션·사운드 같은 표현 리소스 필드는 핵심 룰 JSON과 분리 저장하고 상세 화면에서 필요할 때만 별도 로드합니다.

특히 `refNode` 상속을 먼저 펼치며, 룰에 생략된 핵심값은 OXCE의 엔진 기본값과 X-Piratez 전역 보정값을 별도로 계산해 “실제 적용값”으로 표시합니다. 각 핵심값 옆에는 **아이템 룰 / OXCE 기본값 / X-Piratez 전역값** 중 어디에서 왔는지도 표시합니다. 희귀 필드는 UI에 별도 해설이 없어도 원본 필드 테이블에 보존됩니다.

연구 탭은 직접 선행, 후속 연구, 명시 해금, 무료 획득, 실물 표본 필요/소모 여부, 아이템/제조/기타 룰 역참조를 추적합니다.

방어구 탭은 957개 Armor 룰을 전/좌/우/후/하 방어력, 무게, 능력치 보정, 피해유형별 저항 배율, 근접 회피, 회복·위장 값으로 정렬·비교합니다. `storeItem`을 따라 실제 장비 아이템으로 연결하고 구매·제조·연구 보상·이벤트 참조를 역추적합니다. 제조법은 재료, 시설, 비용, engineer-hours를 표시하고, 선행 연구는 중복 제거한 명목 scientist-hours와 1명/10명 환산 시간을 함께 보여줍니다.

병종 탭의 기본 단위는 내부 `RuleSoldier` 29개가 아니라 **실제 획득형 72개**입니다. 직접 고용 15개, 제조/Recruitment 48개, 이벤트 생성 9개를 각각 별도 행으로 추적하고, 같은 Soldier Type이라도 `spawnedSoldier.currentStats`나 생성 시 `transformationBonuses`가 다르면 서로 다른 획득형으로 분리합니다. 자동 특성의 soldierBonus `stats`를 OXCE 엔진과 같은 순서로 합산한 **실전 생성 능력치**를 TU·기력·체력·용기·반응·사격·투척·근력·Psi·근접·Mana별 최소/평균/최대로 정렬할 수 있습니다. 29개 RuleSoldier는 내부 바디/성장 규칙 참고 탭으로 따로 두며, 초기 획득 이후의 변신·훈련은 83개 루트를 별도 탭으로 제공합니다. Saint 지원군은 31칸 가중표지만 고유 결과는 15개이며, 각 획득형에 슬롯 수와 확률을 표시합니다. Psi Skill은 기본 0이면 특성만으로 잠금 해제되지 않는 OXCE 예외도 반영합니다. 상세창에는 직접 고용·제조/Recruitment·이벤트 획득 방식, 분기 전용 여부, 명목 누적 연구량, Destructor 같은 특수 훈련의 전체 선행 연구트리를 연결합니다.

탈것/기체 탭은 탑승 병력·조종사·속도·연료·내구·무장·레이더·비용을 비교하고, 직접 구매/제조법과 핵심 재료의 이벤트 획득원을 연결합니다. 예를 들어 Schoolbus처럼 특정 이벤트 재료가 필요한 기체는 이벤트의 연구 트리거, 월 제한, 난이도, 기타 트리거까지 함께 표시합니다.\n\n기체무장 탭은 155개 `craftWeapons` 프로필의 weaponType, 위력·사거리·명중·탄약·재장전·재보급률·지원 스탯을 비교하고, 각 장비가 실제로 장착 가능한 기체/슬롯을 역추적합니다. `launcher`와 `clip`이 `items`의 개인 전술무기·탄약을 재사용하는지도 표시합니다. 예를 들어 `STR_CRAFT_PIR_CANNON_UC`(해적 대포)는 `STR_PIR_CANNON`(돌격대포)과 `STR_PIR_CANNONBALL`(대포알)을 재사용하지만, 기체전 위력·사거리·명중은 craftWeapon 프로필의 별도 수치를 사용합니다.\n\n기지시설 탭은 115개 effective facility 룰의 건설비·기간·월 유지비/수익·면적·숙소·창고·연구실·작업장·훈련실·격납고·포로 수용·탐지·방어를 비교합니다. 시설의 `provideBaseFunc`와 연구/제조/시설의 `requiresBaseFunc`를 양방향 역추적해 “이 시설을 지으면 실제로 무엇이 열리는가”를 표시하고, 전체 선행 연구망·건설 재료·파괴/개조 상태도 함께 보여줍니다.

영구 선택·분기 DB는 초기 5선장부터 PUSSY 클래스·Unclassed 혼합형·Pure/Ultimate, Codex, 갈라지는 길, 세력·병종·스토리 상호배타까지 한곳에서 비교합니다. **선택 조합 시뮬레이터**에서 연구 카드를 순서대로 완료로 가정하면 룰셋의 방향성 `disables`에 따라 다른 선택지가 즉시 차단되고 이유가 표시됩니다. 과거 완료 연구 ID를 붙여넣거나 4,612개 연구를 검색해 기준 상태에 추가할 수도 있습니다. XPiratez .sav 파일을 브라우저 안에서 직접 읽어 현재 완료 연구(discovered), 영구 배제 상태(researchRuleStatus=2), 연구 일지(researchDiary)의 날짜·획득 경로를 반영합니다. 현재 영구 배제된 연구가 과거 어떤 연구의 직접 disables에 걸렸는지 일지와 룰셋을 교차 대조한 원인 후보도 보여줍니다. 원본 OXCE 엔진에 따라 후속 disables가 이미 완료된 연구 플래그를 제거하고 영구 배제하는 상황까지 계산합니다. 기존 지급품·이벤트 보상의 소급 회수 여부는 별도 룰입니다. 미완료 선행 조건과 이벤트/무료 지급 우회는 실제 선택 가능 확정이 아닌 별도 주의사항으로 표시합니다. 각 선택의 선행·즉시 보상·후속 해금뿐 아니라 영구 손실과 복구/우회 가능성을 함께 표시하며, 반복 이벤트 경제·방어/탐지·병사 강화·Chaos Saint 공급과 인프라 영향도 연결합니다. 정적 모듈은 `public/captains/`에 있습니다.

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
