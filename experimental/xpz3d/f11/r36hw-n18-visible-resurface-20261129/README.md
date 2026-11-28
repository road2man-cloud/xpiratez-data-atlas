# R36HW N18 — 원본 몸체 기반 중앙 피부 복원형 GLB

이 버전은 **전신 리모델링이나 이미지 생성 결과물이 아닌**, 실제 R36HW 계보의 N17 골반 primitive 3의 원래 정점 위치를 변경한 게임용 GLB다. 사진의 픽셀을 붙여넣거나 깊이맵으로 간주하지 않았다. 중심부 접힘을 기하 구조로 구현하려는 미완성 시제품이다.

## 이번 세션에서 실제 게시한 작업

| 항목 | 실제 산출물 | 상태 |
|---|---|---|
| 앞면 가시 삼각형 3D 샘플러 | `source/scan_visible.cjs`, `reports/N17_VISIBLE_SURFACE.json` | Actions 성공 |
| 중앙 피부 앞면 위치 복원 생산기 | `source/build_r36hw_n18.cjs` | Actions 성공 |
| 통합 골반 모델 | `output/R36HW_N18_FRONT_SKIN_RESTORED.glb` | 생성·게시 완료 |
| 정점 변경 보고서 | `reports/R36HW_N18_FRONT_SKIN_RESTORED.json` | 생성·게시 완료 |
| 실제 GLB 렌더러 | `source/render_n18.cjs` | Actions 성공 |
| GLB 기반 CLAY/색상 근접 화면 | `captures/` — 총 12개 (6개 전체 중심부, 6개 골반 primitive만) | 생성·게시 완료 |
| 중심부 부분 편집 모델 | `output/R36HW_N18_CENTER_EDITING_SUBMESH.glb` | 생성·게시 완료 |
| 부분 편집 모델 선택 영역 | `reports/R36HW_N18_CENTER_EDITING_SUBMESH.json` | 생성·게시 완료 |

## 실제 모델 변경

- 입력: `../r36hw-n17-skin-field-20261129/output/R36HW_N17_CENTER_DEPTH.glb`
- 입력 SHA-256: `56af097238c2b562f98330648b2e8a9782c64b3cef4e7320f2c9a03e38029e6f`
- N18 출력 SHA-256: `cbf436a41905d1278697ad1520b8000318ea1130485ed1c325d87341483516a9`
- 전체 2,099삼각형 / 골반 363삼각형 / 골반 정점 240개 / 63본 유지
- 골반 중심부 정점 **95개** 실제 3D 좌표 변경
- 최대 좌표 변화 **37.090mm**, 변경 정점 평균 **8.984mm**
- 외부 개방 경계 **45정점 위치 고정**
- 국소 인접 삼각형 반전 방지 하에서 Y 표면을 앞쪽으로 복원; X/Z에도 제한된 위치 보정
- 원본 얼굴·헤어·골반 이외 primitive·UV 및 스키닝 가중치 변경 없음
- N17 실제 가시성 스캔에서 Z≈0.87의 중심부 Y=-0.0448 대 주변 -0.09의 **약 45mm 함몰**을 발견하고 복원 방향 결정

## 부분 편집용 GLB

`R36HW_N18_CENTER_EDITING_SUBMESH.glb`는 통합 GLB에서 **중심부 174삼각형**만 선별한 부분 편집 자산이다. 원래 GLB 좌표, UV, 본 인덱스 및 가중치를 계승한다. 골반과의 독립된 최종 접합 품질을 증명하는 파일은 아니다. 잘린 외곽은 의도된 편집 경계이며 단독 게임 최종 모델이 아님을 주의.

## 자체 미술 평가

N18 실캡처에서는 중앙 함몰부 일부가 더 전방으로 이동하지만, **아래쪽의 큰 V자형 틈과 의복형 하단 곡면, 날카로운 장삼각형 패턴이 여전히 보인다. 사용자 참고 사진의 중앙부 형태에 미달하며 미술 합격 처리 금지.**

원인 후보는 이전 모델에서 계승한 의복형 골반 하단의 실제 토폴로지와 허벅지 피부 경계의 미용접이다. 정점 95개만 앞으로 이동해서 해결할 문제가 아니며, 다음 모델은 **부분 편집용 174삼각형 영역의 하단 경계를 직접 새로 구성**하고 실제 골반·허벅지 피부와 접합해야 한다. 근접 캡처는 실제 GLB를 읽는 Node CPU 진단이며 네이티브 S2 캡처가 아니다.

## 재현

```bash
node experimental/xpz3d/f11/r36hw-n18-visible-resurface-20261129/source/build_r36hw_n18.cjs
node experimental/xpz3d/f11/r36hw-n18-visible-resurface-20261129/source/extract_center_n18.cjs
node experimental/xpz3d/f11/r36hw-n18-visible-resurface-20261129/source/render_n18.cjs experimental/xpz3d/f11/r36hw-n18-visible-resurface-20261129/output/R36HW_N18_FRONT_SKIN_RESTORED.glb experimental/xpz3d/f11/r36hw-n18-visible-resurface-20261129/captures-new
```

Windows 사용자 PC의 Python 실행은 사용하지 않았다. GitHub Actions로 Node.js를 실행했다.
