# R36MM — 실제 R36MK GLB 원본 텍스처 및 노멀맵 렌더링

## 실제 결과

R36ML에서는 실제 GLB의 물리 삼각형을 투영했지만 피부·머리카락 원본 텍스처와 2048 노멀맵을 샘플링하지 않았다. R36MM은 실제 GLB에 내장된 이미지와 UV를 샘플링하여 **CLAY / TEXTURED / TEXTURED_NORMAL** 세 모드, 정면·사선·측면 총 **9장/모델**을 생산한다.

GitHub Actions [#46150197500](https://github.com/road2man-cloud/xpiratez-data-atlas/actions/runs/46150197500) **성공**. ART/SUBTLE × DENSE/GUARDED 4종, 총 36장 PNG와 각 보고서를 `main`에 게시했다. 선행 단일 모델 테스트 [#46150189939](https://github.com/road2man-cloud/xpiratez-data-atlas/actions/runs/46150189939)도 성공했다.

| 모델 | 임베드 이미지 디코딩 | 정면 컬러 텍스처 픽셀 | 정면 노멀맵 픽셀 | PNG |
|---|---:|---:|---:|---:|
| ART DENSE | 10 | 191,078 | 169,468 | 9 |
| ART GUARDED | 10 | 191,123 | 169,513 | 9 |
| SUBTLE DENSE | 10 | 191,078 | 169,468 | 9 |
| SUBTLE GUARDED | 10 | 191,123 | 169,513 | 9 |

## 구현

- `source/render_r36mm.cjs`: 실제 GLB의 2,100삼각형 위치·UV·정점 법선·접선 및 임베드 PNG와 Material PBR 필드를 읽는 Node.js CPU rasterizer. PNG 디코딩만 `sharp@0.33.5`를 사용한다.
- 모델의 baseColor, normal, occlusion, metallic-roughness, emissive, alphaCutoff를 가능한 범위에서 샘플링한다. 조명 계산은 S2 원본 `CalcDirAmbLightDO`에 기초한 고전 방향광·앰비언트 구조이고, 거칠기 하이라이트·반사율에는 간략화된 계산을 사용한다.
- `output/<VARIANT>/R36MM_TEXTURED_NORMAL_FRONT.png` 등이 렌더 파일이며, `R36MM_RENDER.report.json`에 GLB 입력 SHA와 실제 픽셀 샘플 횟수가 기록된다.
- `.github/workflows/xpz3d-r36mm-20261128.yml`: Node.js 22 GitHub Actions 생산기.

## 정확한 제한 사항

**이것은 네이티브 S2 Direct3D 9 엔진 캡처가 아니다.** 원본 S2의 실제 GPU 셰이더·조명 장면·그림자·스키닝 애니메이션을 실행하지 않았다. glTF PBR를 S2 유사 고전 조명으로 투영한 중간 비교 결과다.

같은 카메라 기준 CLAY/색상/노멀 적용 차이를 볼 수 있지만, 이 PNG의 외관이 곧 실제 게임 렌더 품질이나 목표 이미지의 유사도를 뜻하지 않는다. 실제 사진의 구조적 깊이 문제는 계속 모델 메시 자체에서 수정해야 한다.
