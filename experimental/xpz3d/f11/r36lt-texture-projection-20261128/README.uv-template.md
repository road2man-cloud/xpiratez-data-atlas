# R36LT — 실제 R36LS 메시 UV 템플릿 생산

이 생산 단계는 명암 붓질을 추가하지 않는다. R36LS ART COMPACT GLB의 실제 BODY POSITION/TEXCOORD_0/INDEX 데이터를 읽어 바인드 공간 선택 영역의 UV 그림 작업용 템플릿을 추출한다.

## 실행

```bash
BASE=experimental/xpz3d/f11
ROOT=$BASE/r36lt-texture-projection-20261128
node "$ROOT/source/export_uv_template.cjs" \
  "$BASE/r36ls-illustrated-skin-20261128/output/compact/R36LS_ART_2100_COMPACT_FULL.glb" \
  "$ROOT/config.example.json" "$ROOT/output/uv-template"
```

Python 없이 Node.js 22 사용. GPU/Blender 요구 없음. GitHub Actions 워크플로: `.github/workflows/xpz3d-r36lt-uv-template.yml`

## 생성물

- `R36LT_NEGATIVE_CENTER_MASK_2048.png` / `R36LT_POSITIVE_CENTER_MASK_2048.png`: 몸체 UV에 실제로 연결된 픽셀 선택 마스크
- `R36LT_*_CENTER_SOURCE_CROP.png`: 기존 R36LS 컬러 아틀라스에서 선택 영역만 추출
- `R36LT_*_CENTER_UV_WIRE_CROP.png`: 원본 피부색 위에 실제 UV 삼각형 선을 표시한 그림 작업 가이드
- `R36LT_*_CENTER_UV.json`: 영향을 받는 각 삼각형의 ID, UV, 3D 바인드 위치
- `R36LT_UV_TEMPLATE.report.json`: 소스 SHA, 삼각형/스킨 수, 방향별 선택 영역·픽셀 수

`frontDirection`을 설정하기 전에 실제 표면을 확인할 수 있도록 음·양의 Y 측을 모두 추출한다. 잘못된 좌표를 임의의 픽셀과 연결한 결과를 성공한 모델로 주장하지 않는다.

## 품질 및 경계

- 몸체 1,132삼각형, 전신 2,100삼각형 및 63본 확인 조건 포함
- 이 실행은 **GLB를 수정하지 않으며**, 2048 텍스처 패치를 작성할 UV 템플릿을 생산
- 이미지 대응·실제 디테일 합성 및 노멀맵/메시 변경은 이 작업 결과와 별도로 진행
- 원본 참조 이미지를 GitHub에 업로드하지 않는다
- GitHub Actions의 새 출력 PNG와 보고서는 해당 파일의 실제 게시 여부를 다시 확인한 후에만 완료로 표시

생산기 코드를 게시했으며, 자동 실행 후 생성 파일이 게시됐는지는 별도 확인한다.
