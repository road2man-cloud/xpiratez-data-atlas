# R36MM — 실제 R36MK GLB 텍스처·노멀맵 CPU 렌더링

## 실제 생산 완료

- [GitHub Actions #46150189939](https://github.com/road2man-cloud/xpiratez-data-atlas/actions/runs/46150189939): Node.js 22, 실제 PNG 생산·아티팩트 업로드 및 main 게시 성공
- 입력 GLB: `../r36mk-recess-budget-20261128/output/compact/R36MK_ART_DENSE_2100_COMPACT_FULL.glb`
- 입력 SHA-256: `f587771e1998810e59ce23f6a4aca04173f31da7216bdee97221e09c9e5b5bf3`
- 실제 몸체 1,132면 + 기타 968면 = 2,100삼각형.
- GLB 임베디드 이미지 10개 디코드. 실제 몸체 소재 `R36MK_BUDGET_TRANSFER_STRONG`의 2048×2048 컬러·노멀·ORM·AO 정보 사용.
- 출력: `output/ART_DENSE/`에 총 PNG 9장 (CLAY, TEXTURED, TEXTURED_NORMAL × 정면, 사선, 측면)과 JSON 보고서.
- 소스: `source/render_r36mm.cjs`. Node `sharp`로 이미지 디코딩, 실제 삼각형의 UV 내삽, 탄젠트 공간 노멀 변환, AO 및 거칠기 정보를 픽셀에 적용.

## 실제 샘플링 측정

| 화면 | 컬러맵 적용 픽셀 | 노멀맵 적용 픽셀 | PNG |
|---|---:|---:|---|
| TEXTURED_NORMAL 정면 | 191,078 | 169,468 | `R36MM_TEXTURED_NORMAL_FRONT.png` |
| TEXTURED_NORMAL 사선 | 200,493 | 179,724 | `R36MM_TEXTURED_NORMAL_OBLIQUE.png` |
| TEXTURED_NORMAL 측면 | 169,328 | 150,542 | `R36MM_TEXTURED_NORMAL_SIDE.png` |

이번에는 R36ML의 결함이었던 **실제 2048 피부 텍스처/노멀맵 미사용**을 해결했다. 실제 샘플링 픽셀 수가 JSON 보고서에서 검증 가능하다.

## 제한 및 후속 개선

- 네이티브 Silent Storm / S2 Direct3D 9 렌더러에서 직접 캡처한 화면은 아니다. **실제 GLB를 CPU로 렌더링한 것**이다.
- 카메라·조명은 합성 설정이며, 원본 S2 재질/그림자/후처리를 정확히 복제한 것이 아니다.
- 스키닝 변형, 정교한 반투명 합성, 캐스트 그림자 등은 별도 구현이 필요하다.
- 렌더 완료와 목표 사진에 대한 미술적 승인도 별개다.
- 후속 단계는 데스크톱 세션에서 네이티브 D3D9 엔진 실행·캡처 및 소스 셰이더·렌더 상태 매칭을 우선한다.
