# R36LY — R36LX 텍스처를 보존한 실제 정점 곡률 개선 (2026-11-28)

## 목적과 입력

이 작업은 **단순 명암 그리기가 아니라 실제 메시 형상을 바꾸는 단계**다. 입력은 R36LX의 분할 이미지 텍스처가 입혀진 전신 GLB이다.

- 기준 입력: `../r36lx-polygon-texture-20261128/output/compact/R36LX_ART_POLYGON_DETAIL_2100_COMPACT_FULL.glb`
- SUBTLE 입력도 동일한 위치의 SUBTLE GLB를 사용
- 프로그램: `source/build_r36ly.cjs`
- 자동 생산: `.github/workflows/xpz3d-r36ly-curvature.yml`
- 비교 뷰어: `preview/index.html`

## 실제 변경

- 기존 몸체 1,132△의 중심 후보 정점 위치를 **Y축 방향으로 제한하여 실제 수정**한다. 골격 63본, 얼굴·헤어 968△, 몸체 UV·인덱스·웨이트는 변경하지 않는다.
- 같은 3D 위치에 대응하는 UV 분할 정점들을 하나로 묶어 동일한 이동을 적용한다.
- 중앙의 가벼운 곡면 통로와 양쪽 표면 연결을 위한 연속적인 함수로 이동한다. 이는 **사진에서 실제 깊이를 측정한 값이 아닌 조형 후보**다.
- 변경된 정점에 연속적인 표면 법선과 이에 직교화한 탄젠트를 적용한다. 기존 2048 컬러/노멀/ORM 이미지 텍스처는 변경 없이 사용한다.
- 얼굴·헤어 모델, 원본 스킨 웨이트·본 인덱스 및 본 애니메이션 구조를 유지한다.
- FLOW(기본)와 GUARDED(변형 강도 55%) 후보를 생산한다.

## 첫 번째 실제 생산 결과

성공한 GitHub Actions: [46130757430](https://github.com/road2man-cloud/xpiratez-data-atlas/actions/runs/46130757430)

| 모델 | GLB bytes | 이동한 3D 고유 정점 | UV 분할 정점 | 최대 이동 | 최소 면 법선 내적 | 최소 면 면적비 |
|---|---:|---:|---:|---:|---:|---:|
| ART FLOW | 5,909,256 | 92 | 527 | 0.00386154 | 0.981105 | 0.872552 |
| ART GUARDED | 5,909,264 | 92 | 527 | 0.00212385 | 0.993578 | 0.925517 |
| SUBTLE FLOW | 5,680,728 | 92 | 527 | 0.00386154 | 0.981105 | 0.872552 |
| SUBTLE GUARDED | 5,680,736 | 92 | 527 | 0.00212385 | 0.993578 | 0.925517 |

이동량은 모델 좌표 단위다. 178개 R36LX 텍스처 적용 삼각형과 92개 R36LY 이동 고유 정점은 서로 다른 지표이며, 이 숫자가 일치해야 하는 것은 아니다.

**실제 생산 결과:** `output/models/` 안에 전신 GLB 네 종류, `output/ART_flow/`, `output/ART_guarded/`, `output/SUBTLE_flow/`, `output/SUBTLE_guarded/` 안에 JSON 정점 변화·면적 보고서.

## 편집용 OBJ 패치 및 대응 JSON

- `source/export_edit_cage.cjs`는 실제 생성한 R36LY GLB를 R36LX 입력과 대조하여 움직인 정점과 연결된 실제 삼각형만 독립 OBJ로 추출한다.
- `output/cage/<MODEL>_<STYLE>/R36LY_<MODEL>_<STYLE>_CENTER_CAGE.obj`는 Blender 등의 편집기에 가져갈 수 있는 **중심부 표면 편집 후보**다. **리깅된 전신 모델이 아니다.**
- 같은 폴더의 `*_EDIT_CAGE.json`에는 GLB 원래 정점 인덱스 ↔ OBJ 정점 인덱스, 원본/변형 위치, 위치 변화량, UV, 원본/새 법선, 본 인덱스 및 스킨 웨이트, 해당 삼각형 ID를 기록한다.
- OBJ 조형 결과를 전체 GLB로 돌려보내는 역매핑 기능은 **아직 구현되지 않았다.** 자동 생산 코드를 바로 수정하거나 JSON의 정점 대응을 사용해야 한다.

### 재생산

```bash
BASE=experimental/xpz3d/f11
R=$BASE/r36ly-curvature-20261128
node "$R/source/build_r36ly.cjs" \
 "$BASE/r36lx-polygon-texture-20261128/output/compact/R36LX_ART_POLYGON_DETAIL_2100_COMPACT_FULL.glb" \
 /path/to/output/ART_flow flow
```

Node.js 22만 사용한다. 사용자 PC에서 Python을 실행할 필요가 없다. GitHub Actions 자동 생산 경로를 우선한다.

## 현재 한계와 다음 지시

**기하학적 변화와 SHA 보고서의 존재는 실제 확인한 사실**이지만, 0°/35° 화면의 개선, S2 엔진 재질 투영, 첨부 사진과의 외관 유사도를 승인한 것은 아니다. 단일 사진으로 정확한 높이 지도를 측정할 수 없으며, 현재 조형은 제한된 연속 함수 기반이다.

추후 실제 아트 개선에서는 사용자가 목표로 지정한 구조를 **이미지 분할→실제 3D 곡면→원래 UV 섬별 텍스처 대응** 순서로 보정하되, 단순 회화 명암만으로 실루엣을 대체하지 말아야 한다. 모델의 총 2,100△를 넘기는 경우 상부 몸체·골반저·얼굴·헤어에 대한 예산과 시각 품질을 함께 고려해야 한다.
