# 병종 DB · 출생 추첨 확률과 전체 경로 상한 근거 (2026-11-20)

## 구현 범위

별도 브랜치 없이 기존 `public/soldiers/modern/index.html` 표에 `출생 추첨 기대값 · 확률분포` 보기를 추가했다. 모든 출생처(72개)에 동일한 계산기를 적용한다. 사용자는 다른 출생처를 비교 기준으로 선택해 12종 기대값 차이, 총합 우세 확률, 동률 확률을 볼 수 있고, 상세 화면에서는 총합 기준 이상의 최초 추첨 확률과 분위를 볼 수 있다.

기존 4,123개 등록 연구·육성 경로에는 `training-order-evidence.js`를 적용한다. 각 경로에 실려 있는 변신·훈련 순서대로 출발 병종→도착 병종, `upperBoundAtMaxStats` / `upperBoundAtStatCaps` 우선순위, 소프트/하드 한계, 능력치 원시 변화/난수/퍼센트/재추첨, 영구 보너스와 `reset`/이력 제거를 읽는다. 입력 시술 경로가 원본과 다르면 값을 만들지 않는다.

## 수학적 정의와 출처

기준 엔진: OXCE 8.7.1 `Savegame/Soldier.cpp` 61–79행의 `Soldier::Soldier` 생성자 및 1971–2051행의 `Soldier::calculateStatChanges`.

- 초기 능력치 `tu, stamina, health, mana, reactions, firing, throwing, strength, psiStrength, melee`: 최소~최대 정수를 포함한 균등 추첨
- `bravery`: `RNG::generate(min/10, max/10)*10` (C++ 정수 나눗셈)
- `psiSkill`: `minStats.psiSkill` 고정
- `spawnedSoldier.currentStats` 템플릿의 `0`은 유지, `-1`은 0, 기타 값은 지정 수치로 덮어쓰기
- 출생 `SoldierBonus`는 한 번만 합산한다. 원시 psi 기술이 0 이하라면 영구 보너스가 양의 기술값을 새로 만들지 않는다.
- 각 능력치 이산 분포를 합성곱하여 총합 `S`의 분포를 만들고 `E[S]`, 10·50·90백분위수, `P(S_A>S_B)`, `P(S_A=S_B)`, `P(S>=t)`를 계산한다.

확률 표시는 **신병 각각을 독립 생성한다는 RNG 모델**에 따른다. 무작위 모집 두 번의 이론적 비교일 뿐, 연구 접근성과 실제 캠페인 비용·이벤트 선택·구매 가능성까지 포함하지 않는다.

## 혼동 방지

기존 `성장 완료 가정`은 단일 병사가 각 단계 전후로 성장할 여유가 있다는 낙관적 조건부 **상한 포락선**이다. `출생 추첨 기대값`은 첫 생성 시점의 **확률분포**다. 포락선 총합을 평균이나 달성 확률로 변환하지 않는다.

전투 성장의 주능력치 마지막 증가량이 `statCaps`를 최대 +5, 용기 +9, 보조 능력치 +1 초과할 가능성은 기존 `growth-envelope.js`가 상계로 처리한다. 실제 모든 전투를 거쳐 그 수치에 도달할 확률과 경로 전역 최적성은 아직 미산출이다.

`reset:true`는 이전 변신·훈련 이력 및 변신 영구 보너스를 초기화한다. 기존 원시 능력치나 전투 훈장 자체를 모두 제거한다는 뜻이 아니다.

## 검사

- `node tools/check-soldier-birth-rng.mjs`: 72개 출생처 분포, 합계 확률·분위·기대값, 템플릿·정신기술 예외
- `node tools/check-training-order-evidence.mjs`: 4,123개 등록 경로, 11,416개 훈련 단계, 대상 병종·상한·초기화 확인
- `node tools/check-route-table-compare.mjs`, `node tools/check-route-table-browser.mjs`: 기존 비교표 및 신규 출생 추첨·선발 기준 UI
- `node tools/check-soldier-modern-browser.mjs`: 기존 병종 DB 회귀 검사

기존 문서/이미지/게임 실행파일 및 사용자 세이브는 변경하지 않는다. 로컬 작업물은 아직 별도 커밋/배포하지 않았다.
