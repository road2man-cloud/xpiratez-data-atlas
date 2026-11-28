# R36LX — 중심부 이미지의 실제 삼각형별 분할 텍스처 (2026-11-28)

## 문제와 이번 생산 방식

R36LW의 512×634 그림을 통째로 전면에 붙이는 방식은 사용하지 않는다. R36LS → R36LU → R36LV 전신 GLB의 원래 2,100삼각형, 63본 골격, UV·웨이트를 보존한다.

- 사용자 제공 이미지의 **80×104, 4비트 국소 밝기 차이 데이터**만 저장한다. 원본 컬러 사진·직접 식별 가능한 고해상도 픽셀은 공개하지 않는다.
- 4열×8행의 **32개 독립 원천 이미지 구역**을 실제 모델의 바인드 공간 X/Z에 맞춰 투영한다.
- **각 몸체 삼각형의 실제 2048 UV 좌표를 독립 래스터화**한 후, 해당 텍셀이 대응하는 이미지 구역에서만 디테일을 읽는다.
- 이어지는 삼각형의 접점에서도 3D 좌표 기반 샘플링을 적용하기 때문에 같은 위치에는 같은 이미지 정보를 적용한다.
- 전면(-Y) 제어 범위: X -0.085..0.085, Z 0.78..0.94, Y < -0.035. 주변 피부는 smooth falloff로 연결한다.
- 새 노멀의 이미지 방향은 **삼각형별 UV↔3D 야코비안**으로 계산한다. 모든 UV 타일을 동일 방향이라고 가정하지 않는다.
- 원본 피부색을 완전히 교체하지 않고 밝기 잔차만 한정해 추가한다. 원본 사진을 통째로 덮지 않는다.

## 실제 파일

- `source/feature_residual_80x104.b64` — 원본 사진 전체가 아닌 다운샘플·4비트 잔차
- `source/build_r36lx.cjs` — 원천 구역 → 삼각형별 UV 픽셀 투영 → 컬러·노멀 2048 PNG → 전신 GLB
- `.github/workflows/xpz3d-r36lx-polygon-texture.yml` — Node.js 22로 ART/SUBTLE 생산 후 2048 PNG와 경량 GLB 게시
- `preview/index.html` — R36LV와 R36LX를 동일 카메라로 비교하는 WebGL 뷰어

GitHub Actions 생산 명령:

```bash
BASE=experimental/xpz3d/f11
node "$BASE/r36lx-polygon-texture-20261128/source/build_r36lx.cjs" \
 "$BASE/r36lt-texture-projection-20261128/output/r36lv/compact/R36LV_ART_IMAGE_DETAIL_2100_COMPACT_FULL.glb" \
 "$BASE/r36lx-polygon-texture-20261128/output/art"
```

출력 위치:

- `output/art/R36LX_POLYGON_COLOR_2048.png`
- `output/art/R36LX_POLYGON_NORMAL_2048.png`
- `output/art/R36LX_POLYGON_DETAIL.report.json`
- `output/compact/R36LX_ART_POLYGON_DETAIL_2100_COMPACT_FULL.glb`
- SUBTLE 모델도 동일 구조.

## 확인된 생산 사실과 작업 한계

최초 생산 후보에서는 ART·SUBTLE 양쪽 **202개 후보 삼각형 중 178개 삼각형**, 모든 32개 이미지 구역, 약 20만 UV 픽셀을 사용했다. 이후 이미지 대비와 UV 방향에 맞춘 노멀을 수정해 같은 Node.js 워크플로에서 새로 생산하도록 설정했다. 최신 수치는 `output/art/`, `output/subtle/` 보고서의 값을 우선한다.

- **실제 컬러 픽셀을 나눠서 배치하는 코드와 GLB 생산을 구현**했다. 그러나 입력은 사진의 직접 RGB가 아니라 압축 잔차이므로 원본 사진의 색채를 복원한 것이 아니다.
- **형상 변경 없음.** 178개의 **기존 삼각형을 사용**한 것이지, 178개의 새로운 삼각형을 추가한 것이 아니다.
- 높이(실제 기하 변위)와 정확한 물리 표면은 사진에서 알 수 없다. 노멀은 시각 보정용이지 구조 인증이 아니다.
- 0°/35° 및 S2 출력의 미학적 승인, 타 모델 환경에서의 외관은 확인된 바 없다.
- 사용자가 최종 목표로 지정한 이미지를 완전히 재현했다는 뜻이 아니다.

**다음 실제 작업 방향:** 사진의 32구역을 채색 강도로만 처리하지 말고 메시 바인드 공간에서 위치별로 정확하게 해석하여 레퍼런스 대비 과도한 평면 패턴/UV 경계를 없애고, 폴리곤 예산을 재배분할 때에는 다른 부위의 실루엣을 훼손하지 않아야 한다. 별도 얼굴·헤어/63본은 보호한다.
