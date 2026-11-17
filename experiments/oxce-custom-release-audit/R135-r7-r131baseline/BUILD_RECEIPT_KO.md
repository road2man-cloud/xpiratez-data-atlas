# R131 기준 R135-R7 제조·장물아비 분류 UI 복구 후보 — 빌드 기록

기준일: 2026-11-17 KST  
트래킹: [OXCE 회귀 이슈 #64](https://github.com/road2man-cloud/xpiratez-data-atlas/issues/64)

## 후보의 실제 내용

- R131 네이티브 통합 오브젝트 아카이브(`objects_r131_integrated.a`)를 **기준본**으로 사용.
- R131과 R6 아카이브 모두 411개 고유 구성요소 이름을 가짐. 서로 다른 구성요소는 9개(`BattlescapeState.cpp.obj`, `ExperienceOverviewState.cpp.obj`, `InventoryState.cpp.obj`, `main.cpp.obj`, `Map.cpp.obj`, `SoldiersState.cpp.obj`, `SoldierTransformationState.cpp.obj`, `SoldierTransformState.cpp.obj`, `UnitWalkBState.cpp.obj`). `ar t` 기준 멤버 목록은 중복 이름을 포함해 413개.
- R6 전체를 무분별하게 승계하지 않고 다음 7개 파일만 GNU++17로 새로 컴파일해 R131 기준 아카이브의 해당 멤버를 교체함:
  `NewManufactureListState.cpp`, `SellState.cpp`, `SoldiersState.cpp`, `SoldierTransformationState.cpp`, `SoldierTransformState.cpp`, `InventoryState.cpp`, `main.cpp`.
- 제조: 드롭다운의 '모든 물품'에서 규칙의 `getCategory()`별 안정 정렬, 분류 첫 행에는 `[분류]` 표시, 이어지는 행은 들여쓰기. 기존 선택 가능한 물품행과 행-제조 규칙 매핑 유지.
- 장물아비/판매: 기본 전체 목록 및 기본 정렬에서 분류별 안정 정렬, 첫 물품 분류명과 나머지 물품 들여쓰기. `_rows.push_back(i)`에 실제 원본 항목 인덱스를 기록해 판매 수량/클릭 로직의 행 대응 유지. 필터/사용자 정렬 시 기존 순서 유지.
- 개별 변신 훈련 목록: R6에서 빠진 `SoldiersState::btnTransformationsBackClick` 복구. 상세 변신 화면의 기존 Backspace도 유지.
- 자동 장비: R6의 `InventoryState.cpp`에 들어 있던 15회 탄약 목표, 의료품, 채찍/진압봉, R133 캐시 개선을 **선택적으로** 통합. R131 기준본의 변경되지 않은 맵·보행·전술·경험치 오브젝트는 유지.

## 산출물

Windows 로컬 후보:
`D:\daphne_auto\oxce-r135-r7-r131baseline-20261117\build-r131-v2\openxcom_R135_R7_R131_BASELINE_CATEGORY_GROUPS_TEST.exe`

SHA-256 `3B762C8622367376CE2EA6A6904BDDC2E2408A708F3F278735E75300486E6FB8`  
크기: **27,237,526 바이트** (파일 크기 재확인 필요 시 실제 Get-Item을 우선함).  
원본 게임 설치 파일이나 R131 아카이브를 덮어쓰지 않음.

## 실제 검증 수준

- C++ 7개 파일 컴파일 성공.
- 413 아카이브 멤버 유지, 링크 성공.
- `tools/check-oxce-r135-r7-r131-source.test.mjs`의 5개 정적 테스트 모두 통과.
- **게임 창 실행·제조 목록 시각 결과·장물아비 목록 시각 결과·수량 판매·세이브 테스트: 미검증.**
- 이 후보를 정상 배포본 또는 전체 기능 전수조사 완료본으로 취급하지 말 것. R131에도 기존 자동 장비 3~4분 병목 가능성이 있어 성능 별도 측정 필요.

## 릴리스 차단

R131이 사용자가 상대적으로 정상이라 평가한 버전일 뿐, R131 자체가 100% 기능 정상 판정된 것은 아님. 실제 게임에서 제조/판매 행 선택, 스크롤, 검색, 카테고리 변경 및 자동 장비 배분을 시험하고, 특히 이전 기능 누락을 조사하기 전에는 설치 폴더로 승격하지 말 것.
