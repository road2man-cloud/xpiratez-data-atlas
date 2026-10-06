# X-Piratez Data Atlas

X-Piratez 아이템·연구·방어구·병종·탈것을 **검색·정렬·비교**하고, 상세 화면에서 실제 적용 핵심 스펙, 원본 룰 필드, 연구/제조/이벤트 역참조를 확인할 수 있는 정적 웹 DB입니다. 병종과 탈것은 획득 방식, 해금 연구트리, 명목 누적 연구량, 분기 전용 조건, 표본/기지 기능/기간 제한 같은 특수조건까지 추적합니다.

## 기준 데이터

- X-Piratez: **v.o1.1.1**
- OXCE 요구 버전: **8.6**
- 현재 생성 결과: **4,007 items / 4,612 research / 957 armors (496 store-item armors) / 29 base Soldier rules / 72 acquisition profiles / 83 soldier transformations / 998 soldier bonuses / 96 crafts / 2,158 manufacture / 4,972 ufopaedia records**
- 한국어 이름은 모드의 `Language/ko.yml`, 영문은 `Language/en-US.yml`에서 해석합니다.
- 이미지·음원·맵 등 원본 게임 자산은 포함하지 않습니다.
- UFOPEDIA 장문 본문은 저작권이 있는 원문 재배포를 피하기 위해 기본 생성물에서는 제외합니다.

## 무엇을 보여주나

목록 화면은 한글명/영문명/내부 ID, 종류, 무게, 구매가/판매가, 위력, 피해형, 사격 명중/TU, 연구·제조 연결 수를 정렬할 수 있습니다. 상세 화면은 호환 탄약, 이 탄약을 쓰는 무기, 연구·제조 관계, 다른 룰셋에서 해당 아이템 ID가 참조되는 위치, 최종 병합된 **item 룰 객체 전체**를 보여줍니다.

특히 `refNode` 상속을 먼저 펼치며, 룰에 생략된 핵심값은 OXCE의 엔진 기본값과 X-Piratez 전역 보정값을 별도로 계산해 “실제 적용값”으로 표시합니다. 각 핵심값 옆에는 **아이템 룰 / OXCE 기본값 / X-Piratez 전역값** 중 어디에서 왔는지도 표시합니다. 희귀 필드는 UI에 별도 해설이 없어도 원본 필드 테이블에 보존됩니다.

연구 탭은 직접 선행, 후속 연구, 명시 해금, 무료 획득, 실물 표본 필요/소모 여부, 아이템/제조/기타 룰 역참조를 추적합니다.

방어구 탭은 957개 Armor 룰을 전/좌/우/후/하 방어력, 무게, 능력치 보정, 피해유형별 저항 배율, 근접 회피, 회복·위장 값으로 정렬·비교합니다. `storeItem`을 따라 실제 장비 아이템으로 연결하고 구매·제조·연구 보상·이벤트 참조를 역추적합니다. 제조법은 재료, 시설, 비용, engineer-hours를 표시하고, 선행 연구는 중복 제거한 명목 scientist-hours와 1명/10명 환산 시간을 함께 보여줍니다.

병종 탭의 기본 단위는 내부 `RuleSoldier` 29개가 아니라 **실제 획득형 72개**입니다. 직접 고용 15개, 제조/Recruitment 48개, 이벤트 생성 9개를 각각 별도 행으로 추적하고, 같은 Soldier Type이라도 `spawnedSoldier.currentStats`나 생성 시 `transformationBonuses`가 다르면 서로 다른 획득형으로 분리합니다. 자동 특성의 soldierBonus `stats`를 OXCE 엔진과 같은 순서로 합산한 **실전 생성 능력치**를 TU·기력·체력·용기·반응·사격·투척·근력·Psi·근접·Mana별 최소/평균/최대로 정렬할 수 있습니다. 29개 RuleSoldier는 내부 바디/성장 규칙 참고 탭으로 따로 두며, 초기 획득 이후의 변신·훈련은 83개 루트를 별도 탭으로 제공합니다. Saint 지원군은 31칸 가중표지만 고유 결과는 15개이며, 각 획득형에 슬롯 수와 확률을 표시합니다. Psi Skill은 기본 0이면 특성만으로 잠금 해제되지 않는 OXCE 예외도 반영합니다.

탈것/기체 탭은 탑승 병력·조종사·속도·연료·내구·무장·레이더·비용을 비교하고, 직접 구매/제조법과 핵심 재료의 이벤트 획득원을 연결합니다. 예를 들어 Schoolbus처럼 특정 이벤트 재료가 필요한 기체는 이벤트의 연구 트리거, 월 제한, 난이도, 기타 트리거까지 함께 표시합니다.

선장 선택 매트릭스는 초기 5선장부터 PUSSY 클래스·Unclassed 혼합형·Pure/Ultimate까지의 분기를 한 표에서 비교합니다. 반복 이벤트 현금 기대값, Hotel/VIP/Nonprofit/Scamming 같은 경제 옵션, 방사탑·네크로방어·벙커·전술센터 같은 방어/탐지 옵션, Boot Camp·Military Drill·Bread & Fishes·Warrior Culture·Charmy Dance 같은 병사 강화, Chaos Saint 특수병 공급과 인프라 해금을 함께 보여줍니다. 정적 모듈은 `public/captains/`에 있습니다.

선장 페이지는 각 단계의 실제 `disables`를 전수 표시하며, Codex의 선택 연구와 실물 Codex 연구에서 발생하는 2중 4색 상호배타도 따로 보여줍니다. 기본 4선장의 Saint 보완색(무모→Green, 멍청→Gray, 게으름→Red, 소심→Gold), G1~G8 Captain×Codex 보너스, Saint 진입 시 중단되는 보너스, Gray/Sore-Ass 등으로 봉쇄되는 부정·도박 이벤트까지 교차표로 정리합니다.

병종/탈것의 **명목 누적 연구량**은 표시된 해금 루트의 `dependencies`와 `requires`를 중복 제거해 합산합니다. OXCE는 이미 비활성화된 선행 연구를 검사에서 제외할 수 있고 `unlocks`, `getOneFree`, 이벤트 직접 지급으로 우회하는 경우가 있으므로, 실제 플레이에서 필요한 연구량은 이 명목값보다 작을 수 있습니다. 페이지는 분기 연구·실물 표본·필요 기지기능·이벤트 조건을 함께 표시해 실제 경로를 따로 판단할 수 있게 합니다.

## 로컬에서 데이터 갱신

Node.js 20+ 기준입니다.

```bash
npm install
npm run build:data -- --source "C:/path/to/user/mods/Piratez"
npm run check
```

개인 로컬 용도로 UFOPEDIA 본문까지 포함하려면 `--include-lore`를 추가할 수 있습니다. 공개 저장소에는 기본 생성물만 커밋하는 것을 권장합니다.

생성기는 Ruleset의 `*.rul` 파일을 읽고 같은 ID의 규칙을 순서대로 병합한 뒤 `refNode` 상속을 펼칩니다. 상세 DB는 16개 청크로 나뉘어 아이템/연구/방어구 상세를 열 때 필요한 청크만 브라우저가 가져옵니다.

## 배포

`public/` 폴더가 완성된 정적 사이트입니다. `.github/workflows/pages.yml`은 main 브랜치 push 시 GitHub Pages에 배포합니다.

## 권리

사이트 코드에는 MIT 라이선스를 적용합니다. X-Piratez, OpenXcom/OXCE, 원본 X-COM 및 모드 데이터/문구에 대한 권리는 각 원저작자에게 있으며 MIT 라이선스의 적용 대상이 아닙니다. 이 저장소는 팬 제작 기술 참고 도구입니다.
