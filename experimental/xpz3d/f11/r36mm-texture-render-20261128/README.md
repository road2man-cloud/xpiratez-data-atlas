# R36MM — 실제 R36MK GLB 임베디드 재질 렌더링

## 실제 생산 완료

GitHub Actions [#46150197500](https://github.com/road2man-cloud/xpiratez-data-atlas/actions/runs/46150197500) 성공. ART DENSE·GUARDED, SUBTLE DENSE·GUARDED **4종 × 9장 = 36장**의 900×1120 PNG를 GitHub main에 게시했다.

- 제작 코드: `source/render_r36mm.cjs` (Node.js 22, sharp 0.33.5)
- 입력: R36MK 전신 GLB, 몸체 1,132 + 얼굴/헤어 968 = 전체 2,100삼각형
- 모드: `CLAY`(기하 면법선), `TEXTURED`(GLB 임베디드 컬러), `TEXTURED_NORMAL`(컬러 + 실제 탄젠트 공간 노멀맵)
- 시점: FRONT, OBLIQUE, SIDE. 각 모델의 산출물 `output/<variant>/`에 존재
- 텍스처: 이미지 실제 10개 디코딩, UV 좌표 픽셀 샘플링, 오클루전·거칠기·알파 컷오프 대응. 조명은 S2 원본의 packed normal 디코딩과 directional + ambient 계산식에서 출발했다.
- ART DENSE 정면 `TEXTURED_NORMAL`: 컬러 텍셀 샘플 191,078, 노멀맵 샘플 169,468, AO 샘플 169,468, PNG 파일 크기 219,220바이트.
- R36MK ART DENSE 입력 GLB SHA-256 `f587771e1998810e59ce23f6a4aca04173f31da7216bdee97221e09c9e5b5bf3`.

## 정확한 상태 표시

이 이미지는 **실제 GLB 정점·면·텍스처를 사용하는 CPU 렌더링**이다. 그러나 네이티브 S2 엔진이나 Direct3D9 GPU에서 출력된 스크린샷은 아니다. S2의 실제 쉐이더 전체, shadow maps, 애니메이션 스키닝, 게임 카메라, 재질 파라미터·후처리 전체를 재현한 것이 아니다. 컬러·노멀 텍스처의 사용 여부는 픽셀 처리 카운트로 확인됐지만, 품질이 네이티브 S2에 도달했는지/목표 사진에 유사한지는 미승인 상태다.

R36ML의 미구현 부분(컬러/노멀맵 미샘플링)을 수정했으나, 네이티브 S2 캡처의 대체물로 표시하지 않는다.
