# R36MJ — 윤곽 정렬 이후 실제 깊이 레이어 추가 (2026-11-28)

## 해결하려는 문제

R36MI에서는 새로 확보한 12개(DENSE)/9개(GUARDED) 제어 정점을 2D 참조 윤곽에 가깝게 이동시켰지만 실제 깊이 중첩이 목표 사진에 가까워졌는지는 증명하지 못했다. R36MJ는 윤곽을 반복해서 당기는 작업보다 **융기와 함몰에 서로 다른 부호의 실제 Y축 변위를 부여하는 조형 후보**를 만드는 데 집중한다.

원본 구조 파일은 `../r36mc-landmark-sculpt-20261128/source/landmark_hypothesis.json`이다. 전면은 −Y, 수직은 +Z이며, 사진 한 장은 정확한 물리 깊이를 제공하지 않는다는 제약을 계속 유지한다.

## 실제 작성한 코드

- `source/build_r36mj.cjs`: R36MH와 R36MI의 물리 정점을 비교하여 **R36MH에는 없었고 R36MI에 추가된 제어 정점만** 식별. 가까운 곡선의 종류/깊이 가설에 따라 음수 깊이(융기)와 양수 깊이(함몰)를 추가한다. X/Z 변위는 제한하며 주변 삼각형 면적 및 법선 방향을 검사한다. 정점의 기존 스킨 웨이트·UV·삼각형 인덱스와 골격은 보존한다. 새 곡률에 맞춰 2048 노멀맵을 원래 TBN → 새 TBN 좌표로 변환한다.
- `.github/workflows/xpz3d-r36mj-depth-layers.yml`: Node.js 22로 ART/SUBTLE × DENSE/GUARDED 네 조합에 대해 텍스처 전신 GLB와 CLAY 전신 GLB, 변경된 노멀 이미지와 JSON 보고서를 생산해 게시한다.
- `preview/index.html`: R36MI와 R36MJ의 동일 카메라 비교. 정면 −Y, 위쪽 +Z, CLAY 우선 보기.

## 예정 출력

- `output/compact/R36MJ_ART_DENSE_2100_COMPACT_FULL.glb`
- `output/compact/R36MJ_ART_DENSE_CLAY_2100_COMPACT_FULL.glb`
- `output/<VARIANT>/R36MJ_DEPTH_LAYERS_NORMAL_2048.png`
- `output/<VARIANT>/R36MJ_DEPTH_LAYERS.report.json`

실제 생산 전에는 예정 경로를 생산 성공으로 표현하지 않는다.

## 품질의 판단 기준

- 실제 GLB 생산과 GitHub 게시 및 미술 목표 승인은 구분한다.
- 몸체 1,132삼각형 + 얼굴/헤어 968삼각형 = 전체 2,100삼각형, 63본 골격, UV 및 스킨 웨이트 보존.
- 목표 사진의 깊이는 계산으로 복원된 것이 아니라 **가설**이다.
- CLAY에서 목표의 비대칭 윤곽·접힘·입체 깊이와 다르면 형상 가설을 수정한다. 색/노멀 픽셀 수 증가를 미술적 성공으로 착각하지 않는다.
- 이 버전에서 새로운 폴리곤 예산 공급은 없으며, R36MH에서 확보한 정점으로 깊이를 만드는 단계다.
