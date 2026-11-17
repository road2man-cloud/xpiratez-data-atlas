# XPiratez R135-R9F — 장신구 자동착용 안전 정책

기준: 2026-11-17 KST. 기준 컴파일 아카이브 R9E (R9D F12 복구 및 R9E 팀 시야 수정 누적).

## 확인한 실질적인 오류

R9E의 `InventoryState.cpp` `fillWearSlot`에서 모든 호환 장비를 아래 식으로 점수화함:

`(BT_MEDIKIT ? 10000 : 0) + max(0, getArmor())*10 + max(0, getPower())`

그러나 `RuleItem::getArmor()`, `getPower()`는 아이템 자체의 방어·피해 관련 데이터이지 *착용자에게 패시브 보너스를 준다는 근거가 아님*. 실제 아이템 설명을 대조한 결과:

- `STR_RING` — 작은 보석이 붙은 서명용 은반지. 판매 가치만 명시됨. 자동착용 제외.
- `STR_YELLOW_GEM`, `STR_BLUE_GEM`, `STR_GREEN_GEM`, `STR_RED_GEM`, `STR_DIAMOND` — 전리품/보물 성격. 자동착용 제외.
- `STR_MEDALLION` — 장착 시 행동력(TU) **-2**, 전투 피로 감소 1. 사용자가 TU 감소 장신구 자동착용 금지를 요청. 자동착용 제외.
- `STR_DOGE_COLLAR` — 사기 +3과 동시에 매혹 취약성 증가. 자동착용 제외.
- `STR_DUST_MASK`, `STR_XMED_MASK` — 보호 기능은 있으나 기력 회복 감소. 이번 보수적 정책에서 자동착용 제외, 수동 허용.
- `STR_PSI_RESONATOR` — 큰 체력 부작용. 자동착용 제외.

## 자동착용 허용 화이트리스트

설치된 `Piratez.rul`과 `Language/ko.yml`에서 착용 효과를 확인한 장비만 자동 착용 후보:

| ID | 확인된 효과 |
|---|---|
| `STR_HELLERIUM_CHARM` | 매 턴 기절 피해 회복 1, 냉기 저항 |
| `STR_LUNAR_WARD` | 정신 피해 저항, 매 턴 사기 회복 2 |
| `STR_AVATAR_MEDALLION` | 왜곡 피해 저항 |
| `STR_HAREM_COLLAR` | 매 턴 사기·기절 회복 1, 매혹 저항 |
| `STR_AY_GOGGLES` | 화학/화염 피해 감소 |
| `STR_BEJEWELED_CAP` | 정신/멍해짐 보호, 매 턴 사기·기절 회복 |
| `BT_MEDIKIT` | 기존 의료용 아이템 우선순위 보존 |

확인되지 않은 물품 ID는 **자동착용만** 금지한다. 수동 착용, 기존 장비 유지, 판매, 연구, 제조는 변경하지 않음.

장신구/모자 장착 전 기존의 연구/환경 허용, 올바른 슬롯 호환, 유효 인벤토리 크기, 무게 제한(착용 후 총무게 <= 근력)을 유지한다. 착용으로 과중량을 만들지 않도록 함. 이미 수동으로 채운 슬롯은 아예 건드리지 않음. 기존 의료품·총기·15회 탄약·채찍·수류탄 우선순위 변경 없음.

## 실제 빌드·검증

- R9E 기준 네이티브 아카이브 413 엔트리 중 **InventoryState.cpp.obj, main.cpp.obj만 교체**. F12 `ExperienceOverviewState`와 팀 시야 `UnitWalkBState` 객체는 이전 R9E와 SHA-256 동일.
- R9F C++ 두 파일 컴파일·링크 성공.
- EXE `C:\Dioxine_XPiratez_o2.1\Dioxine_XPiratez\openxcom_R135_R9F_JEWELRY_SAFE_F12_TEAM_TEST.exe`
- 크기 **27,262,434 바이트**, SHA-256 `3728E20A46AF56100008D68239A3F51DD6AE8CA77D8665F47DC62FF6055C6CAB`.
- Windows 실사용자 로그인 세션 1, 2026-11-17 21:30 KST, 안전 실행기 PID 37980 -> 2초 만에 게임 HWND 23465394, `Responding=True`, 버전 R135-R9F-JEWELRY-SAFE, 진단 PID만 종료.
- **실제 수정한 C++ `r9fWearPriority` 람다 본문**을 별도 모의 `RuleItem`에 넣어 컴파일 실행: 20개 허용/거부 사례 통과. 실제 게임에서 자동장비 버튼을 눌러 착용 결과를 확인한 플레이 검증은 미완료.

## 결론

R9F는 요청한 장신구 자동착용 금지의 컴파일·네이티브 기준 구현 후보. 기존 세이브 및 R8/R9C/R9D/R9E EXE를 변경하지 않음. 게임 창 실행과 착용 판정 함수 단위 테스트는 성공했지만 실제 모드/병사/아이템 조합에서 완전 검증되었다는 뜻은 아님.
