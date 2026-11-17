# X-Piratez R136-R11T — 이송 창 장물아비형 분류·검색 통합

기준: 2026-11-18 KST. 기반 빌드: **현재 등록된 R136-R11** (`openxcom_R136_R11_R9G_JEWELRY_COMBAT_HISTORY_TEST.exe`).
선택 근거: R12는 독립 시험 후보로 존재하나 사용자 게임 폴더의 최신 등록 버전은 R11이며, R12의 XP 표식 개별 변경을 이 패치에 무심코 섞지 않기 위함.

## 실제 변경 소스

`src/Basescape/TransferItemsState.cpp` **하나**, `src/main.cpp` 버전 표시 하나. `TransferItemsState.h`는 원본과 바이트 동일.

1. 검색 입력창을 기본 표시하며 48px → 84px로 확장, `TextEdit::onChange`를 `btnQuickSearchApply`에 연결. Enter 검색도 유지.
2. 전체 목록(`STR_ALL_ITEMS`)과 목적지 기지 보유 목록(`STR_ITEMS_AT_DESTINATION`)에서 드롭다운 분류 순서에 맞게 정렬하고, 첫 표시 항목에 `[분류]` 접두어, 다음 항목에 4칸 들여쓰기.
3. 다중 카테고리 규칙 물품은 `_cats`의 custom category 구간에서 **드롭다운 앞 순위**를 선택. 분류 미지정은 `STR_UNASSIGNED`, 병사·선박·인력은 `getCategory(index)` 기본값.
4. 검색·목적지·연구 필터는 분류 표기 **전**에 수행하여 검색 결과 첫 행에 해당 분류명을 정상 표시.
5. 명시적인 분류 선택 시 해당 분류 필터 유지. 사용자가 Ctrl/Alt/Shift로 호출하는 원래 이송 비용/용량 정렬을 선택하면 분류별 그룹 정렬을 해제하고 기존 정렬 우선 적용.
6. 실제 `_items`와 `TransferRow.amount`를 복제하거나 재배치하지 않으며, 화면용 `r11tDisplayOrder`만 정렬. `_rows.push_back(i)`와 기존 `getRow() -> _items[_rows[_sel]]` 유지. 인원·함선·기술자·과학자·탄약 강조 및 확인창/저장 동작은 변경하지 않음.

## 컴파일/실행 산출물

빌드 스크립트: `D:\daphne_auto\oxce-r136-r11t-transfer-categories-20261118\build_r11t.ps1`
기반 아카이브: `D:\daphne_auto\oxce-r136-r11-cumulative-cause-jewelry-20261117\build-r11\objects_r136_r11_history_jewelry_cumulative.a`

- `TransferItemsState.cpp` 및 `main.cpp` 컴파일·링크 모두 성공.
- R11 vs R11T 오브젝트 아카이브: **413개 항목/고유 오브젝트 411개** 그대로; 다른 점은 `TransferItemsState.cpp.obj`와 `main.cpp.obj` **정확히 2개**.
- `TurnDiaryState`(Ctrl+Alt+H), `ExperienceOverviewState`(F12), `UnitWalkBState`(팀 신규 적 판정), `SellState`(장물아비), `InventoryState`(장비 자동착용) 해시는 모두 R11과 동일.
- 빌드 EXE: `D:\daphne_auto\oxce-r136-r11t-transfer-categories-20261118\build-r11t\openxcom_R136_R11T_TRANSFER_CLASS_SEARCH_TEST.exe`
- 게임 폴더 독립 설치: `C:\Dioxine_XPiratez_o2.1\Dioxine_XPiratez\openxcom_R136_R11T_TRANSFER_CLASS_SEARCH_TEST.exe`
- **27,257,315바이트**, SHA-256 `C4E394C0556817BFF4F2340CFBFF0A419DC181E7982042BF836FFB22C519A761`.
- Node.js 소스 회귀 검사 `node --test check_transfer_r11t.test.mjs`: **7/7 통과**.
- Windows 로그인 사용자 세션1에서 안전 실행기 `XPZ_R136_R11T_START.cmd` 실기동 2026-11-18 00:50:42 KST. 2초에 PID `27792`, 스레드 13, `Responding=True`, 창 핸들 `5908314`, 실제 제목 `OpenXcom Extended 8.7.1 (v2026-11-17 R136-R11T-TRANSFER-CATEGORIES)`. 테스트 PID만 정리. `TASK_RESULT=0`.

## 검증 경계와 미완료

- **완료**: 네이티브 빌드, R11 전체 오브젝트 보존 대조, 소스 테스트 7/7, 사용자 세션 실제 게임 창 생성.
- **미완료**: 실제 세이브에서 이송 화면에 진입하여 분류 헤더, 장신구/탄약 검색, 수량 증가/감소, 목적지 기지로 실제 이송하는 게임플레이 검증.
- 기존 R11·R12 시험용 EXE 및 세이브 변경 없음. R12의 무경험치 적 표시 개량은 본 R11T에 포함됐다고 주장하지 않는다.
- 다중 카테고리 물품의 소속은 드롭다운 우선순위로 표시되므로, 이전 기본 분류와 다르게 보이는 것은 설계 변경이고 실제 이송 물품 유형이 바뀌는 것은 아님.
