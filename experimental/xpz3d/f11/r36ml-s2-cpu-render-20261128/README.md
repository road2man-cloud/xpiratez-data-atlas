# R36ML — 실제 R36MK GLB를 직접 삼각형 래스터화한 S2 소스 조명식 실험

## 생산 완료

- [GitHub Actions #46149413580](https://github.com/road2man-cloud/xpiratez-data-atlas/actions/runs/46149413580): **성공**, 6개 PNG + JSON 생성 및 `main` 게시.
- 입력: `../r36mk-recess-budget-20261128/output/compact/R36MK_ART_DENSE_2100_COMPACT_FULL.glb`
- 입력 SHA256: `f587771e1998810e59ce23f6a4aca04173f31da7216bdee97221e09c9e5b5bf3`
- 실제 파일에서 몸체 1,132면 + 기타 968면 = **2,100삼각형** 확인.
- 구현 코드: `source/render_r36ml.cjs`; Node.js 22, 내장 Buffer/zlib 기반 CPU PNG 렌더러.
- 결과: `output/ART_DENSE/R36ML_CLAY_FRONT.png`, `R36ML_CLAY_OBLIQUE.png`, `R36ML_CLAY_SIDE.png` 및 대응되는 `SHADED` 세 장 (각 900×1120px).
- `output/ART_DENSE/R36ML_RENDER.report.json`에 각 PNG SHA256·생성 픽셀 수·입력 모델 해시 저장.

## S2 유사 조명으로 구현된 부분

- 원본 S2 `GfxRender.cpp`의 packed normal c3 상수 `(2*255/254, -256/254)`를 근사 사용.
- 원본 `GfxShaders.txt`의 방향광 + 앰비언트 `CalcDirAmbLightDO` 구조를 재현.
- 정면 −Y/상방 +Z, 사선, 측면의 정사영 카메라를 사용.
- CLAY = 지오메트리의 면법선 기준, SHADED = GLB 정점 법선 보간 기준. 폴리곤의 실제 3D 위치에서 래스터화.
- **이 PNG는 생성형 이미지가 아니며 실제 R36MK 메시의 좌표와 면을 사용한다.**

## 미구현 / 해석상 제한

- 네이티브 Silent Storm S2 게임 화면이나 Direct3D 9 GPU 캡처가 아니다.
- 합성 카메라·조명 값이므로 실제 게임 장면 조명과 일치하지 않는다.
- GLB의 컬러 텍스처·노멀맵·ORM 이미지를 샘플링하지 않으므로 **색감과 광택은 원본 재질을 재현한 것이 아니다**.
- 스키닝 애니메이션과 엔진의 실제 픽셀 셰이더 출력도 미재현.
- PNG 자체의 외관과 사용자 목표 이미지 간 유사도는 정량 검사만으로 승인하지 않는다.
