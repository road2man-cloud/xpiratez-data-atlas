# R36LW — 실제 이미지 텍스처 / UV 아틀라스 합성 단계

## 이번에 생산·수정한 작업물

- `source/apply_uv_patches.cjs` — **실제 편집한 PNG 픽셀**을 R36LT UV 섬 좌표에 합성하고, R36LV 기반 전체 전신 GLB 및 컬러/노멀 2048 PNG 생산
- `source/build_r36lt.cjs` — RGBA / indexed PNG 등 2048이 아닌 참조 이미지도 직접 입력할 수 있게 디코더 교체
- `source/png_rgba.cjs` — Node.js 내장 모듈 기반 PNG 디코더
- 사용자가 제공한 이미지에서 **비공개 512px 컬러·노멀·마스크·높이 4맵** 생성. 이 파일들은 ChatGPT 작업물 ZIP에 보존하며 **공개 GitHub에 포함하지 않음**.

## R36LW UV 섬 패치 합성 (Node.js 22)

```bash
BASE=experimental/xpz3d/f11
ROOT=$BASE/r36lt-texture-projection-20261128
node "$ROOT/source/apply_uv_patches.cjs" \
  "$ROOT/output/r36lv/compact/R36LV_ART_IMAGE_DETAIL_2100_COMPACT_FULL.glb" \
  "$ROOT/output/uv-template" \
  /path/to/edited-island-pngs \
  /path/to/output/r36lw
```

작업 PNG 이름은 UV 템플릿 보고서의 `stem`을 기준으로 `<stem>_COLOR.png`, 선택적으로 `<stem>_NORMAL.png`을 지정한다. 예: `R36LT_NEGATIVE_UV_ISLAND_01_COLOR.png`. 각 입력 PNG의 폭과 높이는 해당 `atlasBounds`와 같아야 한다. 이미 존재하는 `*_MASK.png`를 사용하므로 UV 바깥 픽셀은 수정하지 않는다.

**원본 참조 이미지나 512px 이미지 패치를 임의로 첫 UV 섬에 붙이지 말 것.** 하나의 3D 영역이 여러 UV 삼각형으로 나뉘어 있기 때문에 목표 형상을 바르게 재현하려면 실제 각 삼각형의 바인드 공간 위치와 레퍼런스의 대응점을 먼저 매칭해야 한다.

## 안전한 데이터 보존

- 바인드 정점, 법선, UV, 인덱스, 스킨 웨이트, 골격을 그대로 둔다.
- 원본 2,100삼각형(몸체 1,132 + 얼굴·헤어 968), 63본을 기준으로 검사한다.
- 외부 PNG가 없는 섬은 변경하지 않는다.
- UV 영역을 마스크로 제한하고 영역 중첩 시 오류를 낸다.
- 입력 패치가 모두 원본과 같으면 새 모델을 생산하지 않고 실패 처리한다.
- GLB·PNG·JSON SHA-256 생산 보고서를 생성한다.

## 완료 여부

- R36LW 소스 및 PNG 호환성 수정: **GitHub 게시 완료**
- 512px 참조 컬러·노멀·마스크·높이 PNG: **ChatGPT 내부 생성 완료 (비공개 ZIP)**
- 3D/UV 정합을 거친 섬별 PNG 및 R36LW 최종 GLB: **미생산**
- 실제 렌더러 비교/S2 투영/최종 외관 승인: **미완료**

사용자 PC Python 불필요. 이미지 기반 미세 요철을 정밀하게 만들기 위해서는 사진의 원근, 알베도와 실제 높낮이 분리, 텍스처 UV 대응점 보정이 필요하다.
