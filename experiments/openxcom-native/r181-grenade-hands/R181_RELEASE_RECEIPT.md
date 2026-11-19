# R181 — 수류탄 양손 점유 TU 계산 통합 릴리스

**기준일:** 2026-11-20  
**이전 버전:** R180, 커밋 `797dd795b40035c56c6e780ea11480ebf05394c3`  
**신규 버전:** R181 GRENADE HANDS

## 실제 제작물

- Windows 실행파일: `C:\Dioxine_XPiratez_o2.1\Dioxine_XPiratez\openxcom_R181_ALLPATCH_GRENADE_HANDS.exe`
- 파일 크기: **27,534,324바이트**
- SHA-256: `9EE41FE6AC935FE62CDECF5A56B8D4F23FA084C42B0CC27E324FED9603C6CC59`
- 누적 아카이브: `build/objects_r181_cumulative_grenade_hands.a`
- 누적 413개 오브젝트 중 기존 411개 동일
- 변경 오브젝트: `InventoryState.cpp.obj`, `main.cpp.obj`
- 배포 실행 CMD: `XPZ_R181_ALLPATCH_START.cmd`
- 공용 진입점: `XPZ_LATEST_INTEGRATED.cmd` → R181
- 이전 공용 진입점 백업: `XPZ_LATEST_INTEGRATED.before_R181-hand-clear-20261120.cmd`

## 실제 개선된 UI 동작

R180에서는 배낭/허리에서 수류탄을 손으로 꺼내는 비용을 고려했지만
손이 양쪽 모두 찼을 때 기존 무기를 치우는 TU가 빠져 총 비용을 과소평가했다.

R181은 각 손에 대해 다음 경로를 평가한다.

1. 손이 비었다면 해당 손에 수류탄을 꺼내는 TU만 적용.
2. 점유된 손이면 기존 장비가 고정 무기인지, 지상 보관이 허용되는지 확인.
3. 기존 장비를 지면으로 내리는 `BattleItem::getMoveToCost(ground)` + 수류탄의 `getMoveToCost(hand)` 비용을 합산.
4. 가능한 경로 중 TU가 더 낮은 쪽 선택.
5. 어느 손도 사용할 수 없으면 `손 비우기 불가 / 투척 준비 불가`로 표시하고 잘못된 합산 TU를 표시하지 않음.
6. 장전 수류탄은 장전 TU를 다시 합산하지 않음.
7. 전투 중 필요한 TU가 남은 TU보다 많으면 부족 경고, 전투 준비 화면에서는 경고 미표시.
8. 인벤토리의 원래 66×24 픽셀 영역을 넘지 않도록 4단계 표기 축약.

이는 *장비 정리 후 수류탄을 손으로 꺼내는 최소 준비 비용*이다.
손에 든 장비를 대체 슬롯으로 옮기거나 실제 맵의 배치 제약 등은 별도이며,
실제 게임에서 손 점유 예외 전체를 플레이로 검증한 상태는 아니다.

## 실제 결과

- MinGW C++ 재컴파일·링크 성공
- 수류탄 라벨 테스트 11개 PASS
- 누적 기능 보호 게이트 28개 PASS
- 신규 릴리스 관리자 감사 PASS: 부모 EXE SHA·누적 아카이브·영구 필수 기능 확인
- 원본 세이브 및 R180 EXE 유지, 새로운 런처/EXE를 별도 파일로 배포

## 로컬 소스 위치

`D:\daphne_auto\XPZ_R181_GIT_WORKTREE_20261120\experiments\openxcom-native\r181-grenade-hands`

복원 빌드 실행: `build_r181.ps1` (같은 출력 이름이 존재하면 안전하게 중단).
특정 C++ 오브젝트가 살아있다는 사실은 모든 GUI 행동 성공을 의미하지 않는다.
**미검증:** 실제 전투 상황에서 장비를 내려놓고 수류탄을 장전·투척한 최종 TU 차감,
창고/격납고 맞교환 후 저장·재로드. 실행 중인 R180 프로세스는 건드리지 않았다.
