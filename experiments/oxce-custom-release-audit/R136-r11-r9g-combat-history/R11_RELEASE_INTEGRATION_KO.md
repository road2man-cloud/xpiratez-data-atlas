# OXCE R136-R11 — R9G 장신구 정책 + Ctrl+Alt+H 사망 원인 통합

기준: 2026-11-17, Windows MinGW64 네이티브 빌드

## 통합 목적 및 정확한 기준

- 기준 브랜치: `integration/oxce-r135-r9g-wearable-safe-20261117` (PR #87)
- 기준 C++ 아카이브: `objects_r135_r9g_wearable_safe.a` (413 멤버)
- 추가 변경: `Battlescape/TurnDiaryState.cpp` 및 버전 표시 `main.cpp` 2개 객체만 교체
- **R9G의 액세서리 자동착용 정책과 모자 허용 정책은 수정하지 않음.**
- 기존 `BattlescapeState.cpp`의 `Ctrl+Alt+H` → `TurnDiaryState` 단축키 유지.

## 게임 내 표시 내용

- 플레이어 소속 사망/기절 대원 이름과 상태
- 저장된 `getMurdererId`로 확인한 가해자 이름, 아군 가해자 구분
- 사망 원인 무기 `getMurdererWeapon`와 탄약 `getMurdererWeaponAmmo`, 번역명·내부 ID
- 가해자 ID가 없을 경우 기존 `BattleUnitStatistics::kills`와 피해자 ID·상태가 일치하는 기록을 **추정 자료로 명시하여** 보조 사용
- 저장된 유닛 좌표, 현재 HP, 아군에게 피격된 누적 횟수(치명타 증거와 명확히 구분)
- 저장 파일에 없는 정확한 치명타 피해량은 임의 복원하지 않고 ‘저장 기록 없음’ 출력
- 기존 직전 적 턴 이벤트와 현재 턴 기록을 기존 순서·서식을 유지하여 화면에 추가

### 제약

- 현재 메커니즘은 세이브 포맷이나 `HitLog` ABI를 변경하지 않는 조회 기능. 정확한 이벤트별 피해량·시간 순서 전체 기록을 **새로 수집하는 기능은 아님**.
- 죽은 대원이나 기절 유닛이 현재 전투의 `SavedBattleGame::getUnits()`에 존재하고 관련 필드가 기록된 경우에 한해 화면에서 해당 원인 확인 가능.
- 단축키가 `Options::oxceDisableHitLog`에 의해 금지되거나 적 턴일 때는 기존 접근 제약 유지.

## 네이티브 빌드 증거

- C++ 컴파일·링크 성공, 아카이브 엔트리 413개 유지.
- 신규 EXE 크기 27,274,523 바이트.
- 설치된 EXE SHA-256: `E69DFB88F159FDDE38FF5AD24088ADAB8490B3603B83EC2E54BAB149E7ECEBB5`
- 설치 경로: `C:\Dioxine_XPiratez_o2.1\Dioxine_XPiratez\openxcom_R136_R11_R9G_JEWELRY_COMBAT_HISTORY_TEST.exe`
- 작업 경로: `D:\daphne_auto\oxce-r136-r11-cumulative-cause-jewelry-20261117`
- Windows 사용자 세션 1에서 2026-11-17 21:57:26 KST GUI 시작 `WINDOW_READY`, 고유 PID 정리. `R11_LAUNCHER_SMOKE.log` 참조.

## 보존 여부 검증

R9G 아카이브와 R11 아카이브를 같은 멤버명으로 추출하고 SHA-256 직접 비교:

| 객체 | 결과 |
|---|---|
| `InventoryState.cpp.obj` | UNCHANGED (R9G 자동착용 정책 유지) |
| `UnitWalkBState.cpp.obj` | UNCHANGED (팀 시야 행동 유지) |
| `ExperienceOverviewState.cpp.obj` | UNCHANGED (F12 HUD 유지) |
| `TurnDiaryState.cpp.obj` | MODIFIED (사망·기절 원인 표시) |
| `main.cpp.obj` | MODIFIED (버전 문자열) |

**미검증:** 실제 사용자 세이브를 로딩해 Ctrl+Alt+H 화면을 눈으로 확인한 게임플레이 결과, 모든 누적 패치의 기능적 회귀 검증. 빌드 및 메인 GUI 스모크 성공과 게임플레이 기능 성공은 구분한다.

## 다음 세션 주의

- R9F로 후퇴하지 말 것: R9G에 유용한 모자 허용 정책 추가됨.
- 기존 EXE 및 세이브를 덮어쓰지 말 것.
- 직전 적 턴 기록 UI를 기존처럼 상단에 유지할 것.
- 전투 기록에 대한 가설은 저장 데이터 기반 증거와 분리할 것.
