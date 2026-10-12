# XPiratez LOS/LOF R22: 누적 기능 재구축 기록

**버전 상태: `R22-RECONSTRUCTION-BETA-UNVERIFIED`. 기존 R21을 교체하거나 정식 R22라고 표시하지 말 것.**

## 재현 기반

- 엔진: OpenXcom Extended 8.6.0, 고정 SHA `3e722e09b655ab67acfb59fc8585dc70b583826c`
- 원본 R21 실행파일/소스/변경 이력 전체: 확보되지 않음. R1~R21 누적 기능의 **완전 동등성 보증 불가능**
- 8.6.1·8.7 등 다른 엔진으로 교체하지 않음. 사이트 `main`에도 병합하지 않음.
- 전투 RNG는 일시 보관했다가 매 미리보기 배치 끝에 복원. 실제 발사 기본 인자는 변경하지 않음.

## 복원된 코드 경로 및 확인 수준

| 기능 | 구현 지점 | 확인 수준 |
|---|---|---|
| F8 기본 OFF, OXCE 원래 클릭·이동·우클릭 보존, `\\` 가상 STAND/KNEEL | Map, BattlescapeState | 정적 클릭 흐름·키 처리 검사, 실전 미검증 |
| 이동 경로의 마지막 위치에서 LOS 외곽선, 실제 높이, 1×1 도트 | Pathfinding/TileEngine/Map | 프레임당 최대 64후보로 분산, 정적 검사 |
| LOF 선과 1차 차단점 빨강, 화면 밖/층 차이 HUD | Map | 소스 연결/컴파일 검사 |
| H/B/M, 비대칭 산포, 대형 2×2 병종 겹침 판정 | Projectile/Map/Tile | 실제 탄도 API 기반, 확률은 실험적 |
| 산탄의 1차 충돌 -2 복셀 기준과 추가 펠릿, 연사 | Projectile/Map | OXCE 엔진 계산 재사용, 실전 검증 없음 |
| H/B/M 몬테카를로 1,024회, 위험도 384회 | Map 통계 캐시 | 여러 프레임에 걸쳐 누적, 정적 테스트 |
| 위험도 1% 경계, 강도별 테두리/해칭 | Map | 소스 연결/컴파일 검사 |
| 투척 궤적과 무게/힘/사거리, 가상 사수 위치 | TileEngine/ProjectileFlyBState | 실제 엔진 공식 사용, 확률 분산까지는 미구현 |
| 투척 창문/벽 충돌·착지 장애물 검사 | Map/TileEngine/Projectile | 실제 엔진 허용 충돌 종류(V_FLOOR/UNIT/OBJECT)만 미리보기 통과, 정적 검사 |
| 캠페인 시작 이후 수류탄 즉시 폭발 옵션 변경 | Mod/OptionsAdvancedState | 기존 battleInstantGrenade만 고정 잠금 해제, 게임 메뉴에서 값 저장 가능 |
| 게임 오브젝트 변화에 대한 캐시 무효화 | Map | 조준선의 차단점은 즉시, 주변 산포 영역은 제한적 |
| 8.6.0 빌드, EXE `-version` | GitHub Actions | 통과한 빌드에서 확인 |

## 최근 사용성 개선 (2026-10-13)

- **실제 투척 충돌 검사:** 기존 `result != V_OUTOFBOUNDS` 성공 판정은 창문과 벽 충돌을 성공으로 오인할 수 있다. R22는 실제 엔진이 허용하는 `V_FLOOR/V_UNIT/V_OBJECT`만 통과시키고, 물체 착지 시 `INVALID_MOVE_COST`와 큰 벽 예외를 검증한다. 결과는 `ARC CLEAR` 또는 `ARC BLOCKED`로 표시한다. 엔진이 투척 순간 정확도에 따른 랜덤 산포를 적용하므로 `ARC CLEAR`은 **실제 수류탄이 반드시 창문을 통과하거나 목표 타일에 착지한다는 보증이 아니다.**
- **기존 캠페인 즉시 수류탄:** 일시정지 → 옵션 → Advanced → OXC → Battlescape → Instant Grenades 항목을 변경하고 확인(OK)하면 된다. XPiratez가 고정시킨 다른 옵션의 잠금은 유지한다. `battleInstantGrenade`는 게임에서 던지는 순간 참조하며, 즉시 폭발의 실제 적용 대상은 수류탄의 점화 상태·`FuseTriggerEvent`/아이템의 타이머 타입에 따른다. 기존 게임 세이브의 바이트는 수정하지 않는다.

## 반드시 유지할 주의점

- **HUD 고정 폭 및 대비:** 조준/투척 때 자세는 `STAND` 또는 `KNEEL` **항상 5글자**로 표시한다. `SIM` 글자 대신 가상 자세에만 작은 좌측 표시선을 사용한다. 현재 팔레트에서 실제 어두운 색과 밝은 색을 선택해 12픽셀 높이의 HUD 바탕과 글자를 그린다(인덱스 0 제외). 확률/투척 결과는 x=42 픽셀에서 시작한다.

- **부분 차폐 표적:** 실제 OXCE `canTargetUnit`의 다중 복셀 조준 후보와 좌·중앙·우 사격 위치를 순서대로 검사한다. 900ms 목표 후보 캐시, 커서/자세/무기/표적 변화 시 무효화. 이 검사에서 유효 표적선이 없으면 허구의 자동사격 5% 등을 표시하는 대신 `NO LOF`로 표시한다. 첫 발이 원본 Projectile에서 거부되면 후속 연사탄을 시뮬레이션하지 않는다. 실제 게임 사격 동등성은 별도로 검증해야 한다.
- 통계의 `H/B/M`은 정확한 실전 피해량 예측이 아니라 샘플링 추정값이다. 가상 사수의 고유 위치/스크립트/특수 스탯 효과는 실제 R21과 차이가 있을 수 있다.
- 투사체를 아주 많이 발사하는 특수 무기(한 묶음 256개 초과)는 과도한 프레임 지연을 막기 위해 추정 확률 표시를 포기한다.
- 계산 예산: H/B/M 최대 1,024 표본, 위험 통과 384 표본. 최초 조준에는 최대 24개, 이후에는 최대 96개(특수 고연사 예외에서 최대 256개)의 투사체를 한 번에 추적하며 95ms 이상 간격을 둔다. LOS 외곽선은 한 번에 최대 64후보를 검사한다. `n=`은 HUD에 표시하지 않는다.
- 폴더의 모드 파일, 원본 EXE, 세이브를 절대 덮어쓰지 말고 복사본에서 실행해야 한다.
- `-version` 실행 성공은 게임 전투, XPiratez 데이터 파일, 모든 DLL 조합의 플레이 가능성 보증이 아니다.

## 순서가 고정된 재구축

1. `patch_r22_preview.py`
2. `patch_r22_stats_EXPERIMENTAL.py`
3. `patch_r22_recovery_beta.py`
4. `patch_r22_safety.py`
5. `patch_r22_throw.py`
6. `patch_r22_native_targeting.py` — 기존 클릭 가로채기 제거, 실제 조준/확인사격, `\\` 가상 자세, HUD 정리
7. `patch_r22_native_ballistic_aim.py` — 실제 OXCE 표적 다중 복셀 탐색/좌·우 발사 원점 대조, 첫 발 거부 시 자동사격의 후속 탄환 환상 확률 제거
8. `patch_r22_throw_window_and_grenade_options.py` — 창문·벽 투척 착탄 판정 및 기존 캠페인 instant grenade 옵션 잠금 해제

해당 브랜치의 `.github/workflows/loslof-r22-win64-reconstruction.yml`가 이 순서로 8.6.0 원본에 패치를 적용하고 정적 검사, Windows 컴파일·링크, EXE `-version`, DLL 수집, SHA256 및 ZIP 업로드를 실행한다.

## 2026-10-13 확인된 CI 및 패키지

- GitHub Actions 실행 [#38274358495](https://github.com/road2man-cloud/xpiratez-data-atlas/actions/runs/38274358495): Windows x64 컴파일·EXE `-version`·정적 검사·DLL 패키징 전부 성공. **이후 추가된 64후보/프레임 LOS 분산과 가상 SIM HUD 수정은 이 오래된 실행에서 검증한 것이 아님**.
- 위 빌드 산출물(이전 커밋 `4fd71dd20473b4fc38fadf3b785d456d366823ed`) ZIP의 각 파일 SHA-256 검사 통과. 본 저장소의 최신 브랜치는 별도 CI 확인 필요.
- EXE 버전 명칭은 계속 `R22 Reconstruction Beta`; 원본 R21 확보 전 동등성 표기는 절대 금지.
- CI 산출물의 실행파일·DLL은 테스트 복사본에만 배치. 기존 XPiratez 본체, 세이브, 원본 R21을 덮어쓰지 말 것.

## 아직 완료되지 않은 검증

실제 XPiratez 전투 세이브로 R21과 R22의 1) F8 화면 변화, 2) LOS/LOF 레이어·높이, 3) 표적 뒤 벽/대형 유닛 분류, 4) 가상 자세, 5) 7펠릿·연사 1,024회 표본 수렴, 6) 투척 사거리, 7) 게임 RNG 불변, 8) 100회 조준 이동 성능, 9) 전투 저장/불러오기, 10) 모드 DLL 로딩을 비교해야 한다.

**핵심:** GitHub Actions green도 원본 R21의 동등성 PASS를 뜻하지 않는다. 실전 회귀 검사를 완료할 때까지 정식 배포/기존 EXE 덮어쓰기 금지.
