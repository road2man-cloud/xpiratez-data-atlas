# R135-R9G — 장신구 자동착용 제한 및 유용한 모자 기능 보존

기준일: 2026-11-17 KST. 기존 기준: R9F `openxcom_R135_R9F_JEWELRY_SAFE_F12_TEAM_TEST.exe`.

## 실제 문제와 규칙 근거

기존 R134/R9E의 `InventoryState.cpp`에서 `getArmor()` 또는 `getPower()` 값이 크다는 이유로 장신구를 자동착용했다. 이 둘은 착용자의 능력치 증가를 보증하지 않는다.

실제 `user/mods/Piratez/Ruleset/Piratez.rul`, `Language/ko.yml` 대조:

- `STR_RING` 서명반지: 보물, 직접 전투 효과 확인 불가. 자동착용 금지.
- `STR_YELLOW_GEM`, `STR_BLUE_GEM`, `STR_GREEN_GEM`, `STR_RED_GEM`, `STR_DIAMOND`: 일반 보석/전리품. 자동착용 금지.
- `STR_MEDALLION`: 장착 시 **TU -2**, 전투 피로 -1 (동종 중첩 가능). 자동착용 금지.
- `STR_DOGE_COLLAR`: 매혹 공격 취약성 증가. 자동착용 제외.
- `STR_PSI_RESONATOR`: 체력 부작용. 자동착용 제외.
- `STR_DUST_MASK`, `STR_XMED_MASK`: 다른 이익은 있으나 기력회복 감소; 보수적 자동착용 제외(수동 허용).
- 이름/효과가 입증되지 않은 장신구/모자: 기본 자동착용 금지.

## R9F에서 R9G로 보강한 이유

R9F의 우선순위 허용 목록은 착용 효과가 확인된 일부 보석만 허용했으나, 그 목록을 **모자 칸에도 동일 적용**하면서 효과가 명확한 모자들이 자동선택에서 빠지는 회귀 위험이 발견됐다. R9G는 아래 실제 효능이 있는 모자를 복구한다.

| 모자 ID | ko.yml에 명시된 착용 효과 |
|---|---|
| `STR_GOLDEN_MASK` | 매 턴 기절 회복 +5 및 화염/질식/충격 저항 |
| `STR_GLITTERSKULL` | 사기·기력 회복 +3 |
| `STR_GAS_MASK` | 질식 피해 저항 |
| `STR_FUR_HAT` | 냉기 및 멍해짐 저항 |
| `STR_PIRATE_HAT` | 매 턴 사기·기력 회복 +1 |
| `STR_POLYMAKH_SHAPKA` | 유쾌도 회복 및 정신·냉기 저항 |
| `STR_RIBBON` | 매 턴 사기 회복 +1 |

기존 R9F의 확정 유용장신구(`STR_HELLERIUM_CHARM`, `STR_LUNAR_WARD`, `STR_AVATAR_MEDALLION`, `STR_HAREM_COLLAR`, `STR_AY_GOGGLES`, `STR_BEJEWELED_CAP`)는 모두 유지. `BT_MEDIKIT` 자동착용 우선순위 역시 유지.

장신구 자동착용 전에 `physicallyPermitted`, 슬롯 호환, 인벤토리 크기, 근력 대비 총중량 확인을 계속 수행한다. 기존 수동 장비는 제거·교체하지 않음. 장비가 총중량을 근력 위로 올리면 자동착용하지 않아 과중량으로 인한 TU 손실을 예방.

## 생산·검증·보존

- R9F 네이티브 아카이브를 그대로 복사해 **InventoryState.cpp.obj, main.cpp.obj 두 개만 치환**. 아카이브 엔트리 413개 동일.
- 이전 F12 `ExperienceOverviewState.cpp.obj`, 우사인 볼트 모드 `UnitWalkBState.cpp.obj` 등 나머지 객체의 SHA-256은 R9F와 일치.
- R9G C++ 컴파일 및 전체 EXE 링크 성공.
- `C:\Dioxine_XPiratez_o2.1\Dioxine_XPiratez\openxcom_R135_R9G_WEARABLE_SAFE_F12_TEAM_TEST.exe`
- 27,262,434바이트 · SHA-256 `15DD89A4C7576CFF0BECD6E3558D976882C6FBF8C7D578E128E72D49B7C0CBE7`
- **실제 수정한 C++ 자동착용 람다**를 복사해 모의 `RuleItem`에 대해 컴파일 실행, 반지/보석/TU 감소/불명/기능성 모자 **29개 사례 통과**.
- Windows 실제 로그인 세션1에서 안전 실행기 수행: 2026-11-17 21:44:50 KST, PID 25400, 2초에 HWND 11675416, `Responding=True`, `R135-R9G-WEARABLE-SAFE` 창 생성. 시험 프로세스만 정리.
- 기존 R8, R9C, R9D, R9E, R9F EXE 및 세이브는 덮어쓰지 않음.

**아직 미검증**: 실제 전투 세이브에서 자동배분 후 유효한 장신구 장착 상태, 힘/중량/TU 전후, 모든 장비 조합을 클릭해 확인하는 게임플레이 검증. 게임 창 실행 성공과 람다 테스트 성공을 완전한 전투 동작 검증으로 주장하지 않음.
