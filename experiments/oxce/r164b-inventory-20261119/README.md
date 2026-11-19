# XPZ R164B — 누적 인벤토리 UI 복구 (2026-11-19)

R160B → R163(공중 이동 TU 및 단일층 타일 렌더링) → R164(전원자동/전원해제/低, 퀵드로 정렬) → R164B(검색창과 버튼 겹침 수정)의 **누적 브랜치 소스 스냅샷**입니다.

## 사용자 요청에 대응하는 고정 기능 계약

| 기능 | 구현 위치 | 회귀 검사 |
| --- | --- | --- |
| 전원자동 | InventoryState.cpp, btnAutoAllClick | 버튼 생성/클릭/이름 |
| 전원해제 | InventoryState.cpp, btnAutoAllClick | 전체 병사 소지품을 각자 지면으로 이동 |
| 低 | InventoryState.cpp, r164LowTuMode | 사용할 수 있는 무기/탄약조합에 실제 20TU 이하 발사 모드 요구 |
| 퀵드로 우선순위 | InventoryState.cpp, 마지막 자동배치 단계 | 사용 가능 무기 → 폭탄 → 탄창, 실패 시 위치 되돌림 |
| 세열수류탄 우선/붕대 | InventoryState.cpp, R160B | 기존 보유 재고에 한정하여 폭탄 우선 |
| 공중 이동 TU | Map.cpp, R163 | 공중 타일 직접 숫자 및 경로 프리뷰 |
| 한 층 보기 | Map.cpp, R161/R163 | 비행 공중 타일 표시 |
| 검색 UI 비중첩 | InventoryState.cpp, R164B | 검색 x=184..224, 低 x=230..248, 전원해제 x=250..320 |

## 빌드/원본 보존

- 빌드 입력: R163 누적 `objects_r163_r160b_fly_tile_path_markers.a`; `InventoryState.cpp.obj`만 교체.
- R163 부모 EXE SHA256: `267E2C30CD5CA073C984EC591A3ABB2A6B4B57CA647CF9A8ACA7AD95D6A5D69E`
- R164B EXE SHA256: `4386E9563AE278B860CFCF094B90BBC9DCFAB1D2E6878A13B487537D199818DF`
- 빌드 멤버: 413 (ar 추출 시 이름 중복으로 고유 파일 411개). R163 대비 변경 객체: `InventoryState.cpp.obj` 1개뿐.
- 설치 경로: `C:\Dioxine_XPiratez_o2.1\Dioxine_XPiratez\openxcom_R164B_ALLPATCH_INVENTORY_UI.exe`
- 전용 실행기: `XPZ_R164B_ALLPATCH_INVENTORY_START.cmd`
- 기존 EXE 및 세이브는 건드리지 않음. **실제 게임에서 클릭·정렬 확인은 아직 하지 않았음.**

## 후속 개발 규칙

이 폴더를 빌드 및 기능 보존 기준으로 삼고, 후속 R 버전에는 `verify-r164b.ps1`의 모든 조건을 포함해야 합니다. 조건이 소스 변경으로 바뀌면 회귀 검사를 새 구현에 맞춰 함께 갱신하고, 기능 자체가 빠지면 실패로 처리합니다. 이전 버전 아카이브를 기준으로 객체 단위 변경 대조를 수행하고, 추가/삭제 대상은 명시적으로 기록하십시오. 작업자가 서로 다른 누적본을 쓰는 동안 메인 브랜치에 무단 덮어쓰지 않습니다.
