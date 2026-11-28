# R36LV — 기존 이미지의 미세 질감 추출 / 전신 GLB 재베이크

## 실제 개발 내용

이 생산기는 **명암을 새로 그리는 회화 작업이 아니다**. R36LU ART/SUBTLE 전신 GLB에 이미 포함된 2048×2048 피부 컬러 이미지에서 5×5 가우시안 근사 저역 통과와의 차이(고주파 이미지 픽셀 정보)를 추출해 컬러맵 디테일 및 탄젠트 공간 노멀맵에 제한적으로 반영한다.

- 소스: `source/build_r36lv_image_detail.cjs`
- 자동 생산: `.github/workflows/xpz3d-r36lv-image-detail.yml`
- 기본 설정: 색상 강도 0.38, 노멀 반영 강도 0.22
- 색상 최대 변화량/평균 변화량, 노멀 변경 픽셀, 출력 SHA-256을 보고한다.
- UV 삼각형 내부만 처리하며 주변 UV 패치의 픽셀이 필터에 섞이지 않도록 유효 마스크를 사용한다.

## 기존 모델 보존

- R36LU의 2,100△(몸체 1,132 + 얼굴/헤어 968), 63본 골격, 정점·UV·웨이트 보존
- 기존 ORM 텍스처를 재생성하지 않고 유지
- 삼각형 ID에 의존한 가짜 신체 디테일/회화 그림자는 만들지 않음
- R36LU에 이미 존재하는 컬러 정보가 적으면 추출 가능한 새로운 세부 정보도 제한됨

## 자동 생산 명령

```bash
BASE=experimental/xpz3d/f11
ROOT="$BASE/r36lt-texture-projection-20261128"
SOURCE="$ROOT/output/r36lu/compact/R36LU_ART_UVGUTTER_2100_COMPACT_FULL.glb"
node "$ROOT/source/build_r36lv_image_detail.cjs" "$SOURCE" "$ROOT/output/r36lv/art" 0.38 0.22
```

기본 산출물:

- `output/r36lv/art/R36LV_IMAGE_DETAIL_COLOR_2048.png`
- `output/r36lv/art/R36LV_IMAGE_DETAIL_NORMAL_2048.png`
- `output/r36lv/art/R36LV_IMAGE_DETAIL.report.json`
- `output/r36lv/compact/R36LV_ART_IMAGE_DETAIL_2100_COMPACT_FULL.glb`
- SUBTLE도 동일한 방식으로 생산

**중요:** 기존 이미지 기반 미세 디테일 추출과 특정 목표 이미지의 정확한 재현은 별개다. 레퍼런스 이미지 정렬, 형태와 노멀 방향 검토, S2 엔진 시각적 승인 및 메시 곡률 수정은 남은 과제다. 자동 생산 성공만으로 외관 목표 달성을 주장하지 않는다.
