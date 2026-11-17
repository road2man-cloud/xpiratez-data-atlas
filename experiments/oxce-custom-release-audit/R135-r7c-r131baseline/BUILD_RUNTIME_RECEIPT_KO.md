# XPZ/OXCE R135-R7C — 제조·장물아비·암시장 선분류 통합

기준일: 2026-11-17 (KST)
기준: R131 네이티브 엔진을 선별 승계한 R7 → R7B 후보
상태: **GUI 기동 확인된 시험 후보**. 게임 내 거래 확정 및 전수 기능 검증 전.

## 변경 내용

1. `Basescape/PurchaseState.cpp` — 암시장 ‘지금 구매해라’ 구매 창의 전체 목록 및 부족/숨김/장착 목록을 분류별로 정렬하고, 분류 첫 행은 `[분류]`, 이어지는 행은 4칸 들여쓰기. 기존 구매 수량 자동 계산(`_autoBuyDone`), 가격·월별 구매 제한·`_rows.push_back(i)` 원본 항목 인덱스 유지.
2. `Basescape/SellState.cpp` — 장물아비 목록에서 여러 종류에 속한 물품을 드롭다운에서 앞서는 분류로 묶음. `_items`는 재정렬하지 않으며 사용자 정렬, 필터, 판매 수량 로직 보존.
3. `Basescape/NewManufactureListState.cpp` — 제조 화면 분류 순서를 규칙의 원래 등장 순서대로 묶음. 분류 드롭다운과 표시 순서 일치, 제조 대상 행 매핑 보존.
4. `main.cpp` — R135-R7C 독립 버전 제목.

R131의 전술·이동·맵·경험치 객체와 R7B까지 누적된 탄약 15회·의료품·채찍·Backspace 복귀 소스는 **기존 오브젝트 아카이브의 변경되지 않은 멤버**로 보존함.

## 빌드

- 기준 아카이브: `D:\daphne_auto\oxce-r135-r7b-r131baseline-20261117\build-r131-r7b\objects_r135_r7b_r131baseline.a`
- 컴파일: `NewManufactureListState.cpp`, `SellState.cpp`, `PurchaseState.cpp`, `main.cpp` 총 4개 파일 성공.
- MinGW-w64 C++17 링크 성공, 아카이브 구성 요소 413개 유지.
- 빌드 EXE: `D:\daphne_auto\oxce-r135-r7c-r131baseline-20261117\build-r131-r7c\openxcom_R135_R7C_R131_BASELINE_CATEGORY_GROUPS_TEST.exe`
- 게임 폴더 별도 시험용 사본: `C:\Dioxine_XPiratez_o2.1\Dioxine_XPiratez\openxcom_R135_R7C_R131_BASELINE_CATEGORY_GROUPS_TEST.exe`
- EXE 크기 **27,253,016바이트**
- SHA-256 `092102A2DD5A9B7134CF47F9DD443B3BF046C5D8A1F3645A3471E6FBB1AFF107`

## 실제 GUI 실행

2026-11-17 17:10 KST, Windows 사용자 로그인 세션 1에서 R7C 실행:
- PID 6636
- 1초: 스레드 13개, `Responding=True`, 창 핸들 정상
- 실제 표시 제목 `OpenXcom Extended 8.7.1 (v2026-11-17 R135-R7C-CATEGORY-GROUPS)`
- `WINDOW_READY=TRUE`
- 진단용 PID 6636만 종료. 이전 R7B 게임 프로세스 및 세이브를 변경하지 않음.

## 실행기

- `C:\Dioxine_XPiratez_o2.1\Dioxine_XPiratez\XPZ_R135_R7C_START.cmd`
- `XPZ_R135_R7C_START_RESUME.ps1` — EXE 해시 검사, 일시 중단된 시작 스레드만 재개, 다른 게임 버전 중복 실행 방지.

## 회귀 검사

`node --test tools/check-oxce-r135-r7-r131-source.test.mjs tools/check-oxce-r135-r7b-source.test.mjs tools/check-oxce-r135-r7c-source.test.mjs`

**16개 통과, 실패 0개.**

## 미완료·제약

- 실제 제조·판매·구매 화면에서 카테고리 표기와 들여쓰기 시각 확인, 검색·스크롤·수량 변경 및 최종 거래·생산 실행은 미검증.
- 로그인 세션 GUI 기동 성공은 플레이 기능 전체 검증을 뜻하지 않음.
- 기존 R7B 사용 중에는 구매 테스트본과 동시에 별도 실행을 하지 말고, 정상 저장·종료 후 R7C 실행기를 사용할 것.
- 게임의 R131·R7·R7B 바이너리 및 세이브를 덮어쓰지 않음.
