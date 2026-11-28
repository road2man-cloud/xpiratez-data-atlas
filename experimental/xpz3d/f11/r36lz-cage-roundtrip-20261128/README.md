# R36LZ — OBJ 중심부 조형 → 실제 스킨 전신 GLB 왕복 생산 (2026-11-28)

## 핵심 목표 및 완료 판정

기존 R36LY는 분리한 중심부 OBJ를 **다시 63본 스킨의 원본 전신 GLB로 넣는 단계**가 미완료였다. 이 버전에서는 R36LY의 정점-OBJ 매핑을 기반으로 이미 만들어진 중심부 OBJ의 위치를 추가 보정하고, GLB 전신 메시로 재삽입하는 Node.js 생산기를 실제 구현했다. **ART/SUBTLE × FLOW/GUARDED 네 모델이 GitHub Actions에서 생성 및 main 게시 완료**되었다.

작업 목표는 삼각형 수를 늘리는 것이 아니라, 저폴리곤의 큰 면이 도드라져 보이는 곳에서 실제 정점 이동의 불연속을 줄이는 것이다.

## 새로 작성한 소스

- `source/refine_cage.cjs`: OBJ 중심부 편집용 메시에서 원래 연결된 물리 정점별 변위를 수집하고, 3회 에지-인식 평활화, 이동 상한, UV 봉합선 일치 조건을 적용한다. 수정된 OBJ와 상대적 변위 에너지 감소량을 JSON으로 생산한다.
- `source/import_cage_glb.cjs`: `R36LY_*_EDIT_CAGE.json`의 **원본 GLB 정점 인덱스와 OBJ 정점 인덱스**를 이용해 수정 OBJ를 다시 R36LY 전신 GLB에 반영한다. 변경된 위치의 법선/탄젠트를 재계산하고, 얼굴·헤어/골격/스킨/UV/재질 및 컬러·노멀·ORM 이미지 바이트를 유지한다.
- `.github/workflows/xpz3d-r36lz-cage-roundtrip.yml`: Node.js 22 실행, 4종 생성 → 경량화 → 실제 파일 `main` 게시.
- `preview/index.html`: R36LY와 R36LZ를 동일 카메라·광원에서 좌우 비교하는 뷰어.

## 실제 생산 결과

[성공한 GitHub Actions #46131100633](https://github.com/road2man-cloud/xpiratez-data-atlas/actions/runs/46131100633)

| 모델 | compact GLB bytes | 추가 편집된 UV 정점 | 연관 고유 정점 | 경사 변위 에너지 감소 | 최저 면적비 |
|---|---:|---:|---:|---:|---:|
| ART FLOW | 6,044,860 | 527 | 92 | 40.37% | 0.945945 |
| ART GUARDED | 6,044,864 | 527 | 92 | 43.15% | 0.973480 |
| SUBTLE FLOW | 5,816,332 | 527 | 92 | 40.37% | 0.945945 |
| SUBTLE GUARDED | 5,816,336 | 527 | 92 | 43.15% | 0.973480 |

- 바뀐 법선 정점: 각 모델 732개
- 포함된 중심부 OBJ 면: 215개, OBJ 정점: 621개
- 최대 추가 이동: FLOW 0.00125, GUARDED 약 0.000878 모델 좌표 단위
- 전신 삼각형: 2,100 (몸체 1,132 + 얼굴/헤어 968)
- 골격: 63본
- **텍스처:** 기존 R36LX의 32개 이미지 정보 구역과 2048 컬러/노멀/ORM 보존. 이 버전은 새 텍스처를 그린 것이 아니라 실제 3D 표면 정점을 수정했다.
- **COMPACT 예외:** 현재 4종의 `*_COMPACT_FULL.glb`는 사용하지 않는 추가 텍스처가 없어 경량화가 이뤄지지 않았고, 재패킹 메타데이터로 인해 원본 출력보다 각각 약 40바이트 더 크다. 파일명은 기존 생산 경로 호환성을 위한 것이며 용량 개선을 의미하지 않는다.

### 실제 게시된 출력

- `output/compact/R36LZ_ART_FLOW_2100_COMPACT_FULL.glb`
- `output/compact/R36LZ_ART_GUARDED_2100_COMPACT_FULL.glb`
- `output/compact/R36LZ_SUBTLE_FLOW_2100_COMPACT_FULL.glb`
- `output/compact/R36LZ_SUBTLE_GUARDED_2100_COMPACT_FULL.glb`
- `output/<MODEL>_<STYLE>/cage/R36LZ_<MODEL>_<STYLE>_REFINED_CAGE.obj`
- `output/<MODEL>_<STYLE>/cage/R36LZ_<MODEL>_<STYLE>_FAIR.report.json`
- `output/<MODEL>_<STYLE>/glb/R36LZ_<MODEL>_<STYLE>.report.json`
- 전체 GLB(경량화 전)는 GitHub Actions 아티팩트에 보존됨.

## 실행 예시 (GitHub Actions와 같은 Node.js 22 환경)

```bash
BASE=experimental/xpz3d/f11
LY="$BASE/r36ly-curvature-20261128/output"
LZ="$BASE/r36lz-cage-roundtrip-20261128"
SOURCE="$LY/models/R36LY_ART_FLOW_2100_FULL.glb"
LEDGER="$LY/cage/ART_FLOW/R36LY_ART_FLOW_EDIT_CAGE.json"
CAGE="$LY/cage/ART_FLOW/R36LY_ART_FLOW_CENTER_CAGE.obj"

node "$LZ/source/refine_cage.cjs" "$SOURCE" "$CAGE" "$LEDGER" \
 "$LZ/output/ART_FLOW/cage" flow

node "$LZ/source/import_cage_glb.cjs" "$SOURCE" "$LEDGER" \
 "$LZ/output/ART_FLOW/cage/R36LZ_ART_FLOW_REFINED_CAGE.obj" \
 "$LZ/output/ART_FLOW/glb" ART_FLOW
```

## 한계와 다음 실제 개발 지시

1. 인체 레퍼런스의 사진에서 **정확한 깊이 지도나 3D 면 곡률이 직접 추출된 것은 아니다.** R36LY의 제한된 실제 곡면을 더 균일하게 바꾼 후보이다.
2. OBJ 편집·재결합 경로는 원래 토폴로지와 UV 정점 인덱스가 유지되어야 작동한다. 면을 추가/삭제하거나 배열을 재정렬하면 실패하도록 설계했다. 사용자 편집 OBJ의 자유로운 리토폴로지는 별도 기능이 필요하다.
3. R36LY 대비 정점 이동 경사가 감소했다는 기하학적 수치만으로 외관이 목표 이미지와 더 가까워졌다고 판단해서는 안 된다. 동일 광원·카메라 0°/35° 및 S2 엔진 뷰 비교를 통해 현재 가설을 반증할 조건을 찾는다.
4. **후속 실질 작업:** 중심 영역의 각 물리 삼각형이 대응하는 원천 이미지 패치의 색·노멀 방향을 별도로 확인하고, 실제 표면 곡률과 UV 텍스처의 연속성을 재베이크한다. 새로운 전신 GLB로 생산하며 기존 R36LZ 결과는 변경하지 않는다.

사용자 PC에서 Python을 실행하지 않았다. 모든 생산은 GitHub Actions Node.js 22에서 수행한다.
