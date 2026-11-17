# XPZ / OXCE R135-R7B — R131 기준 통합 및 실행 기록

**기준일:** 2026-11-17 (Asia/Seoul)
**구현 기준:** R131 기반 R135-R7 커밋 `f0a1118fcd4c46375c465920c1ff8fe833ad40a3`
**변경 방식:** 별도 R7B 후보로 신규 빌드. R131, R7, 세이브 덮어쓰기 금지.

## 통합 내용

R131 기반의 R7 전체 네이티브 오브젝트 아카이브를 유지한 채 다음 세 C++ 오브젝트만 새로 컴파일하여 교체했다.

- `Basescape/NewManufactureListState.cpp`: 제조 전체 목록에서 카테고리 첫 행 여부를 `r7HasPreviousCategory`로 명시. 빈 분류를 `STR_UNASSIGNED`로 표기. 후속 행의 들여쓰기 유지.
- `Basescape/SellState.cpp`: 장물아비(판매) 전체 목록에서 `r7HasPreviousGroup`로 첫 행 처리. 빈 분류 표기 개선. 원본 판매 항목 인덱스인 `_rows.push_back(i)`, 검색·사용자 정렬·드롭다운 필터 경로 유지.
- `main.cpp`: 버전 제목을 `R135-R7B-CATEGORY-GROUPS`로 명시.

R7에 선반영된 15회 탄약 상한, 의료품·채찍 우선 배분, Backspace 변신 개요 복귀, 기존 R131 전술/맵/이동 처리 보존은 **아카이브를 기반으로 상속**한다. R7B에서 이 관련 오브젝트는 재컴파일하거나 덮어쓰지 않았다.

## 실제 빌드 결과

빌드 소스: `D:\daphne_auto\oxce-r135-r7b-r131baseline-20261117\src`
빌드 스크립트: `build_r7b_integrated.ps1`
컴파일러: MinGW-w64, GNU C++17
기준 아카이브: `D:\daphne_auto\oxce-r135-r7-r131baseline-20261117\build-r131-v2\objects_r135_r7_r131baseline.a`

- 세 파일 컴파일: 성공
- 통합 아카이브 구성: 원본과 동일한 **413개 멤버**, 멤버 누락 없음
- Windows EXE 링크: 성공
- EXE: `openxcom_R135_R7B_R131_BASELINE_CATEGORY_GROUPS_TEST.exe`
- 파일 크기: **27,238,038바이트**
- SHA-256: `DEB4FD13EAB4E9036137F76CCAE8D7479CAA85FACAF33F304D8BB36D04C5F7DC`

빌드 폴더: `D:\daphne_auto\oxce-r135-r7b-r131baseline-20261117\build-r131-r7b`
게임 폴더 시험용 독립 사본: `C:\Dioxine_XPiratez_o2.1\Dioxine_XPiratez\openxcom_R135_R7B_R131_BASELINE_CATEGORY_GROUPS_TEST.exe`

## Windows 로그인 세션 실제 실행 시험

2026-11-17 **16:22 KST**, `road4` 사용자 로그인 세션 1에서 실제 R7B EXE를 시험했다.

- PID 15368 시작
- 1초 차에 스레드 13개, `Responding=True`, 창 핸들 정상
- 창 제목 `OpenXcom Extended 8.7.1 (v2026-11-17 R135-R7B-CATEGORY-GROUPS)`
- `WINDOW_READY=TRUE`; 시험용 PID 15368만 종료
- 시험 동안 별도 사용자 설정 폴더 `user\r7b_smoke_cfg_20261117` 사용, 실제 세이브 수정 없음

시험 로그: `R7B_INTERACTIVE_SMOKE.log` (로컬 보존).

## 사용자를 위한 실행 방법

게임 폴더: `XPZ_R135_R7B_START.cmd`
동작 로직: `XPZ_R135_R7B_START_RESUME.ps1`

실행기는 R7B EXE SHA-256을 확인한 뒤, 다른 OpenXcom 버전 실행 중 중복 실행을 거부하고, 일시 중단된 자기 실행 스레드만 재개한다. 일정 시간 안에 정상 창이 나타나지 않으면 자신이 시작한 R7B PID만 종료한다. **기존 R7 사용 중에는 먼저 게임 내에서 저장한 뒤 R7을 정상 종료**해야 한다.

## 자동화 점검 및 릴리스 차단

`node --test tools/check-oxce-r135-r7-r131-source.test.mjs tools/check-oxce-r135-r7b-source.test.mjs`

- 정적 테스트 **11개 통과 / 실패 0개**.
- 누적 기능 관련 문자열·행 매핑·검색/필터·빈 분류 경계 조건 검사.
- 실제 게임 화면에서 제조/장물아비 물품 목록을 선택하고 생산·판매 완료하는 테스트, 세이브 회귀, 자동장비 수량/채찍 실물 확인: **아직 미검증**.

즉 **게임 창 실행이 검증된 테스트 후보**이지 전체 플레이가 인증된 안정 릴리스는 아니다. R131 원본·R7 원본 및 기존 세이브 파일을 대체하지 않는다.
