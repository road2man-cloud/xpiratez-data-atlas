# X-Piratez / OXCE R135-R9C — R8 기반 누적 통합 증거

기준일: 2026-11-17 KST. 기준 EXE: `openxcom_R135_R8_R131_BASELINE_SEARCH_FIVE.exe`.

## 버전 관계와 변경 범위

- R8 아카이브: `D:\daphne_auto\oxce-r135-r8-live-search-five-20261117\build\objects_r135_r8_r131baseline.a`
- R8 아카이브 SHA-256: `F8F6F77323C355A9CC6473C0A18089C86F5D96DE58900227B2BD3D76F18E9464`.
- R8의 4가지 검색 화면: 구매(암시장), 판매(장물아비), 제조, 신규 연구. `PurchaseState.cpp`, `SellState.cpp`, `NewManufactureListState.cpp`, `NewResearchListState.cpp`가 원래 R8 아카이브에서 **변경 없이 보존**됨.
- R8↔R7C 413개 아카이브 목록에서 차이 4개, 위 네 화면과 일치.
- R131↔R8의 411개 고유 멤버(총 413개 아카이브 엔트리) 중 일부는 이전 R132~R134 개선 없이 R131 오브젝트였다. 아래 네 개를 선별 통합.

## 이번 R9C의 추가 통합 — 실제 기존 네이티브 바이너리 사용

| R9C 아카이브 멤버 | 원본 네이티브 릴리스 | 보존 기능 |
|---|---|---|
| `UnitWalkBState.cpp.obj` | R132 `objects_r132_integrated.a` | Usain Bolt 모드에서 팀 전체에 처음 발견된 적만 이동 중단 이벤트로 처리 |
| `ExperienceOverviewState.cpp.obj` | R132 | 현재 선택 대원을 경험치 화면 목록에서 색/접두어로 구분 |
| `Map.cpp.obj` | R132 | 경험치 차단 적(XP-blocked)을 항복 백기와 독립된 표식으로 표시 |
| `BattlescapeState.cpp.obj` | R134 `objects_r134_integrated.a` | 실제 사격 횟수 0인 모드와 충돌하는 런처 모드를 백틱 순환에서 건너뜀 |

R9C에서 `main.cpp`만 새로 컴파일해 화면 버전을 `R135-R9C-R8-CUMULATIVE`로 표시한다. R8 아카이브를 복사하여 이 5개 멤버만 `ar r`로 치환, 나머지는 원래 R8 오브젝트 보존.

- R132 기증 아카이브 SHA-256: `B4BDC53AA2CCA7B151C5EA210885EC28F149082FCD86A8A5C2AD4018E57CFFC1`
- R134 기증 아카이브 SHA-256: `57EB6DB4633E24F093B9996CE283F920DF2C7AC5F6A79D5B817858182964CEB6`
- 아카이브 정적 비교: 원본 R8 vs R9C **정확히 5개 구성 요소만 바뀜**, 양쪽 모두 413개 엔트리.
- 빌드 명령: `build_r9c.ps1`(R132/R134 증거가 있는 컴파일 객체를 먼저 추출한 뒤 링크). GNU C++17/MinGW-w64 ABI; 해당 네 오브젝트는 이번 세션에서 재컴파일하지 않고 이전 실제 빌드 결과를 재사용함.

## 실제 산출물

- 로컬 빌드: `D:\daphne_auto\oxce-r135-r9c-r8-cumulative-20261117\build\openxcom_R135_R9C_R8_CUMULATIVE_TEST.exe`
- 설치 폴더 독립 시험용 사본: `C:\Dioxine_XPiratez_o2.1\Dioxine_XPiratez\openxcom_R135_R9C_R8_CUMULATIVE_TEST.exe`
- EXE 크기 **27,253,255바이트**, SHA-256 `2D65BCFC32A36660AB41766B3F3FE687A1420FEF045540576D13C20F49AAA95D`.
- 사용자 실행기: `XPZ_R135_R9C_START.cmd` / `XPZ_R135_R9C_START_RESUME.ps1` (기존 다른 게임 버전이 실행 중이면 추가 실행하지 않음).

## Windows GUI 실행 증거

2026-11-17 18:06–18:08 KST, 사용자 로그인 세션 1에서 동일 SHA-256 R9C 시험본 실행.
- 시험 PID `34364`, 약 3초에 HWND `2162912`, `Responding=True`.
- 실제 창 제목: `OpenXcom Extended 8.7.1 (v2026-11-17 R135-R9C-R8-CUMULATIVE)`.
- 화면 표시 완료 `WINDOW_READY=TRUE`, 진단 프로세스 `34364` 정리.
- 그 외 R8 또는 XPZ3D 작업자가 띄운 다른 게임 프로세스는 종료하거나 수정하지 않음.

## R134 전체 네이티브 오브젝트와의 대조

R134 → R9C 아카이브 전체 비교에서도 413개 아카이브 항목 보존.
실제 해시가 다른 구성요소는 정확히 9개:
`InventoryState.cpp.obj`, `main.cpp.obj`, `NewManufactureListState.cpp.obj`,
`NewResearchListState.cpp.obj`, `PurchaseState.cpp.obj`, `SellState.cpp.obj`,
`SoldiersState.cpp.obj`, `SoldierTransformationState.cpp.obj`, `SoldierTransformState.cpp.obj`.

R134의 `BattlescapeState`, `Map`, `UnitWalkBState`, `ExperienceOverviewState`를 포함해
그 밖의 객체는 R9C에서도 동일하다. 변경된 9개는 이후 R135 UI·장비·훈련·검색 개선과 버전 제목에 해당한다.

R118→R134 `BattlescapeState.cpp` 원본 소스 diff에서도
사격 모드 순환의 필터 조건 및 Backquote 종료 처리 외에 기능 삭제는 발견되지 않았다.

## 설치 런처의 추가 실기동 확인 (19:07 KST)

기존 R7C 런처의 전역 `openxcom*` 차단을 수정해,
**설치 폴더가 다른 XPZ3D 독립 게임 테스트 작업자 프로세스는 차단하지 않고**
**동일한 게임 설치 폴더에 R8·R131 등 다른 게임 버전이 있는 경우에만 중복 실행을 거부**한다.

로그인 사용자 세션 1에서 `XPZ_R135_R9C_START.cmd` 실행기로
R9C 테스트 PID `11836` 생성. 2초 시점
`Responding=True`, HWND `3540056`, 스레드 13개, R9C 제목 확인.
`RESULT=WINDOW_READY`, 해당 테스트 PID만 정리, 스케줄러 종료 상태 0.
기존 사용자 게임·세이브 및 XPZ3D 동시 작업 프로세스는 건드리지 않음.

## 남은 검증 및 안전성

- 이 결과는 **네이티브 오브젝트 수준의 확인된 후속 패치 누적 통합 + 게임 창 실행 성공**을 의미한다.
- 전술 적 탐지와 TU 소비, 사격 모드 순환, XP 차단 표식, 장비 자동 배분, 제조/거래/검색/훈련 Backspace를 실제 저장 게임으로 검증하지는 않았다.
- 모든 비공식 과거 작업자의 모든 패치가 확인됐다고 주장하지 않는다. R131 이전의 보존 내역과 R132~R135에서 추적되지 않은 작업은 별도 기능 전수조사 대상으로 남는다.
- 사용자 세이브 및 기존 R131/R8/R7C EXE는 덮어쓰지 않았다.
