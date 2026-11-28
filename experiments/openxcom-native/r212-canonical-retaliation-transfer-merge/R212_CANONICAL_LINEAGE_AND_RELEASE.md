# R212 정통 R208 계열 통합 릴리스 / 계보 기록

기준: 2026-11-23 KST  
상태: **Windows 네이티브 EXE 생산 및 설치 완료 / 실제 게임 내 이송·TU QA 미실시**

## 정식 계보와 부모

이번 통합본의 **실제 바이너리 부모**는 다음과 같습니다.

- R208 `RETALIATION_BASE_MATCH` 설치/빌드 EXE: SHA-256 `8FE5C42ED0D6062966DEFBF773E074AF2425E1E04936A5FC8ADE91CBA85259D2`
- R208 `objects_r208_cumulative_retaliation_base_match.a` (413 members): SHA-256 `FBB9361503C6F96D0E37DDBD5ECA895777B18028D5FB7E18C43BEA1B520E6F6F`
- 부모 경로: `D:\daphne_auto\XPZ_R208_RETALIATION_BASE_MATCH_20261123`
- **R209 `GRENADE_PAIR_PRUNING` 실행파일을 부모로 사용하지 않았음.**
- R210 `MERGED_ASSAULT_GRENADE` (SHA-256 `54F2434FAFBA9F4B00343DF7C4DA8EA613763DE3538589799E668D9192176682`)의 변경된 소스만 참고하여 통합.
- R211 함선 이송 개발 소스 `TransferItemsState.cpp` SHA-256 `7E05C847E91D74559EA87646C91C0357F8A70113E89DA04D267A144A357A77C6`를 별도 스냅샷으로 보존하여 빌드.

## 통합된 실제 코드

- `src/Geoscape/GeoscapeState.cpp` — 정통 R208 보복 침공·New Trap 기지 대상 매칭을 보존하면서 R210 최초 HUD 렌더 개선 포함
- `src/Battlescape/InventoryState.cpp`, `GrenadeTuLabel.h`, `GroundScan.h` — R209 양손 수류탄 TU·후보 4→32→64·비용 가지치기 통합
- `src/Basescape/TransferItemsState.cpp/.h`, `R145QuickSearch.h`, `R148SearchView.h` — R211 함선 이송 UI·함선만/승무원·장비 동반 선택, 출격함선 귀환지 변경, 항행 중 임무 목적지 보존, 취소 시 수량 보정
- `src/main.cpp` — R212 제목
- 나머지 409개 컴파일 오브젝트는 R208의 누적 오브젝트를 변경하지 않고 상속
- R208 아카이브에 있는 이전 CQC/미션 HUD/기지 습격 관련 오브젝트도 유지

## Windows 생산

- 빌드 폴더: `D:\daphne_auto\XPZ_R212_CANONICAL_RETALIATION_TRANSFER_MERGE_20261123`
- 실행파일: `openxcom_R212_ALLPATCH_CANONICAL_TRANSFER_MERGE.exe`
- 파일 크기: **27,670,766 bytes**
- SHA-256: `BA4823DC7A2B81317CFD2D53A56B6375C1AC1928738A9272BB8ECB678587A589`
- C++ 컴파일/링크: 성공 (GeoscapeState, InventoryState, TransferItemsState, main), 아카이브 413개 유지
- 설치 경로: `C:\Dioxine_XPiratez_o2.1\Dioxine_XPiratez\openxcom_R212_ALLPATCH_CANONICAL_TRANSFER_MERGE.exe`
- 설치 후 빌드본과 SHA-256 일치
- 전용 실행기: `XPZ_R212_ALLPATCH_START.cmd`; 공용 런처/기존 EXE/세이브 미수정
- 재현 스크립트: `build_r212_repro.ps1` (원본 `BattlescapeGame.h` 일시 accessor 추가 후 원본 바이트 복원). 기존 MinGW 및 R208 아카이브 필요

## 주의 / 미완료

1. R211은 동시에 개발 중인 작업트리. R212가 포함한 것은 SHA 고정된 2026-11-23 04:00 KST의 `TransferItemsState.cpp` 버전이며 **그 뒤의 R211 자동 병합을 의미하지 않음**.
2. 출격 중 함선에 탑승한 승무원·장비 보존, 귀환 중 목적지 변경, 임무 중 목적지 유지, 창고/숙소 수용량, 함선 맞교환과의 경합은 **실제 게임 내 QA 미실시**.
3. 빌드 성공과 413개 오브젝트 유지가 R1~R208의 모든 과거 기능의 완전 동등성을 입증하는 것은 아님.
4. GitHub에서 R208과 이름이 일치하는 기존 원격 브랜치는 검색되지 않음. 그러므로 Git 브랜치의 ancestry와 네이티브 EXE의 실제 바이너리 부모를 혼동하지 않도록 R208 SHA를 별도 기록함.
