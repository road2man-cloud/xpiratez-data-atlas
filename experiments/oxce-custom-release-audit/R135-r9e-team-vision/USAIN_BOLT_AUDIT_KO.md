# R135-R9E 우사인 볼트 모드 팀 시야 전수조사 및 누적 빌드 기록

기준일: 2026-11-17 KST. 기준 바이너리: `openxcom_R135_R9D_R8_FULLMERGE_F12_CENSUS_TEST.exe`.
사용자 증상: 이미 다른 대원이 발견했고 팀의 시야에 존재하는 적을 달리는 대원이 다시 발견할 때 불필요하게 멈춤.

## 실제 코드 경로 조사

| 입력·판정 경로 | 조사 결과 | 변경 |
|---|---|---|
| `BattlescapeGame::primaryAction` | 기존 `R62` 자동 달리기는 `ignoreSpottedEnemies=false`이므로 발견 정지 활성. Ctrl·Shift 달리기는 예외 | 변경하지 않음 |
| `UnitWalkBState::init` | R132는 대원별 현재 시야·이번 턴 발견만 초기 팀 기준에 저장. 엔진 전체 적의 `getVisible()` 글로벌 비트 미포함 | 팀 전체 가시 상태를 포함하는 공통 판정으로 변경 |
| `UnitWalkBState::think` 타일 완료 | `calculateFOV(position,...)` 이후 R132 팀 판정. 기존의 후속 관측은 `getVisibleUnits()`만 훑으며 `getUnitsSpottedThisTurn()`과 글로벌 비트를 다시 확인하지 않음 | 모든 정보원을 통합한 새 발견 판정 |
| `UnitWalkBState::think` 회전 완료 | `calculateFOV(unit)` 이후 같은 R132 판정, 회전 중 신규 적 발견 시 `_preMovementCost`를 청구하고 중단 | 공통 팀 판정으로 오인 중단 예방 |
| `UnitTurnBState::think` 독립 회전 | *R9D까지 남아 있던 개인 발견 수 증가*만으로 중단 | 우사인 볼트 모드에서 팀 전체 판정, 모드 해제 시 종전 로직 유지 |
| `TileEngine::calculateUnitsInFOV` | 새로운 개인 시야 적을 `BattleUnit::addToVisibleUnits`로 현재 시야·이번 턴 기록에 반영 | 엔진 로직 변경 불필요 |
| `BattleUnit::prepareNewTurn` | `getUnitsSpottedThisTurn` 기록은 매 턴 시작에 초기화 | 행동 시작 때 현재 팀 캐시와 이번 턴 기록을 스냅샷 |
| 기타 이동 중단 | 반응사격·지뢰/수류탄 근접 감지·점유 타일·TU 부족·문 개폐는 적 재발견과 무관하게 이동을 중단시킬 수 있음 | 기존 안전 동작 유지 |

## 구현

- 신규 헤더 `src/Battlescape/TeamVisionGate.h`: 모든 현역 아군의 가시 적 목록, 이번 턴 최초 발견 적 목록, 적의 팀 전체 `getVisible()` 플래그를 합집합으로 만듦.
- 현재 `FACTION_HOSTILE`이고 `!isOut()`인 적만 대상. 아군/중립/이미 쓰러진 적 제외.
- 행동 시작 때 이미 보이는 적의 포인터 집합을 기록하고 새 FOV 시점의 합집합을 이전 기록과 비교. **기존 팀 스코프에 있던 적의 개인 재발견은 중단하지 않음**. 진짜 새 적을 처음 삽입하면 중단하고, 같은 적의 반복 발견은 중복 중단하지 않음.
- `UnitWalkBState.cpp`는 R132 클래스 크기·ABI 유지를 위해 기존 클래스 외부 `std::map<UnitWalkBState*,set<BattleUnit*>>` 방식 유지. 소멸 시 해당 항목 제거.
- `UnitTurnBState.cpp`는 별도 회전마다 로컬 스냅샷 사용. 기존 클래스 헤더/크기 변경 없음.
- `Options::usainBoltMode`가 꺼져 있으면 독립 회전의 기존 개인 시야 정지 로직을 유지. Ctrl/Shift 덮어쓰기도 유지.
- **이동 중 정상적으로 소비한 TU는 반환하지 않음**. 오인 중단으로 발생하던 불필요한 회전/재이동을 줄이지만 이동·회전 중 실제로 쓴 TU를 임의로 환급하는 코드는 넣지 않음.

## 검증한 실물

- R9D 기준 네이티브 오브젝트 아카이브 `objects_r135_r9d_r8_f12_census.a`를 복사해 3개 오브젝트만 치환:
  - `UnitWalkBState.cpp.obj`
  - `UnitTurnBState.cpp.obj`
  - `main.cpp.obj`
- GNU C++17 컴파일 3/3 성공, 최종 링크 성공, R9D→R9E **변경 3개뿐**, 두 버전 모두 413개 아카이브 항목(고유 이름 411개).
- 이전 F12 `ExperienceOverviewState.cpp.obj` SHA-256은 R9D와 **완전히 동일**. R8 제조·구매·판매·연구 검색 및 R131 이후 탄약·채찍 등 나머지 오브젝트도 그대로 유지됨.
- EXE: `openxcom_R135_R9E_TEAM_VISION_F12_TEST.exe`
- 크기 27,261,922바이트, SHA-256 `F95FB7124E39920D83F580AA0ABCE82BD4C06BEEAC5FE4BB08C2D6C32C92CAEF`
- Windows 실사용자 세션 1에서 2026-11-17 20:01 KST 실제 창 실행: PID 29616, 1초 시점 `Responding=True`, HWND 정상, R9E 타이틀. PID 29616만 진단 종료.
- 로그인 사용자 세션에서 안전 실행기 시험 20:06 KST: PID 43232, 2초에 HWND 3474356, `Responding=True`, 종료 코드 0, 자신의 시험 PID만 정리.
- `test_team_vision_gate.ps1`: **실제 R9E 팀 시야 헤더의 C++ 함수 본문을 추출하여** 모의 `BattleUnit`/전투 저장게임으로 컴파일 실행한 8가지 시나리오 및 9개 assertion 통과.

## 기능 판정과 반증 조건

예상: 움직이는 대원이 적 A를 새로 발견해도 출발 당시 동료 B의 가시 목록/이번 턴 발견 목록 또는 적 A의 팀 전체 가시 플래그에 있다면 **이동 정지는 발생하지 않음**. 반대로 적 A가 세 정보원 어디에도 없다가 새로 발견되면 정지해야 함.

기존 팀원에게 보였던 적인데도 실제 게임에서 `UnitWalkBState`의 `unitSpotted`가 참이 되어 정지한다면 새 가설은 반증됨. 그 경우 `calculateFOV` 업데이트 시점의 원본 `BattleUnit*`, 팀 전체 가시 비트, 세 정보원의 실제 값을 추가 계측해야 함.

**아직 미검증:** 사용자의 실제 세이브와 실제 우사인 볼트 달리기 조작에서 정지 여부·TU 전후값·반응사격/문·지뢰 예외를 GUI로 직접 재현하는 시험. 초기 창 실행 성공과 모의 C++ 판정 함수 통과를 완전한 게임플레이 검증이라고 부르지 않음.

이전 R9C/R9D/R8 실행 파일 및 사용자 세이브는 모두 보존. 신규 R9E는 독립 시험 후보.
