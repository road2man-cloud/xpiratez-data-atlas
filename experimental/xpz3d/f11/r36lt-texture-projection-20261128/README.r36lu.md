# R36LU — 저폴리곤 이미지 텍스처 UV 경계 보정 (ART / SUBTLE)

R36LS COMPACT의 **실제 2048 컬러·노멀·ORM 이미지**를 읽어 UV 삼각형 바깥 여백에 가장 가까운 유효 픽셀을 복사한다. 임의의 회화 명암과 구조를 새로 생성하지 않는다.

## 실제 추가한 소스
- `source/build_r36lu_uv_gutter.cjs`: 삼각형 UV 커버리지 래스터화, 8 px 영역 확장, 원본 2048 RGBA 텍스처 픽셀 보존, 새로운 GLB 생산 및 JSON/SHA 보고
- `.github/workflows/xpz3d-r36lu-uv-gutter.yml`: Node.js 22로 ART/SUBTLE 생산, 경량 GLB 재패킹, GitHub main 게시

## 생산 명령
```bash
BASE=experimental/xpz3d/f11
node "$BASE/r36lt-texture-projection-20261128/source/build_r36lu_uv_gutter.cjs" \
 "$BASE/r36ls-illustrated-skin-20261128/output/compact/R36LS_ART_2100_COMPACT_FULL.glb" \
 "$BASE/r36lt-texture-projection-20261128/output/r36lu/art" 8
```

## 산출물
- `output/r36lu/art/R36LU_UVGUTTER_COLOR_2048.png` · `NORMAL_2048.png` · `ORM_2048.png`
- `output/r36lu/subtle/` 같은 구조
- `output/r36lu/compact/R36LU_ART_UVGUTTER_2100_COMPACT_FULL.glb`
- `output/r36lu/compact/R36LU_SUBTLE_UVGUTTER_2100_COMPACT_FULL.glb`
- 각 `R36LU_UVGUTTER.report.json` 과 compact 결과 보고서

## 미변경 조건
- 삼각형 2,100 (몸체 1,132 + 얼굴·헤어 968), 스킨 63본 유지
- 정점·UV·스킨 웨이트·리깅 데이터 수정 없음
- UV 삼각형에 포함된 원본 RGBA 픽셀은 바이트 단위로 보존
- 새 이미지 디테일을 만들어 넣은 결과가 아니다. **기존 디테일이 UV 경계에서 샘플링될 때 손실되는 것을 줄이는 단계**
- 실제 S2 엔진 / 정면·사선에서 개선됨을 확인하려면 별도 비교 필요

이 README는 생산기가 게시됐다는 사실만으로 GLB 생산 성공을 주장하지 않는다. 실제 `output/r36lu/` 파일이 GitHub main에 올라온 후 보고서의 수치·SHA를 기록한다.
