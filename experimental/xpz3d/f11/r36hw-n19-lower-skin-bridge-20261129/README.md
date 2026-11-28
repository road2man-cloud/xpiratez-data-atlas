# R36HW N19 — 원본 다리 피부와 골반 하단 경계 정렬

## 실제 완료한 작업
- **전신 재구축이나 이미지 생성이 아닌** GLB 원본 골반 primitive 3의 국소 기하 변경
- 입력: N18 `R36HW_N18_FRONT_SKIN_RESTORED.glb`, 출력: `output/R36HW_N19_LOWER_SKIN_BRIDGE.glb`
- Node.js 생산기: `source/build_r36hw_n19.cjs`
- 실제 skin primitive 6의 각 다리 테두리 8정점, 골반 하단 경계 29정점의 좌표를 분석
- 경계 지도 생산기: `source/inspect_lower_seam.cjs`
- 산출 보고서: `reports/N18_LOWER_SEAM_MAP.json`, `reports/R36HW_N19_LOWER_SKIN_BRIDGE.json`
- 실제 N19 GLB 기반 중심부 CLAY/색상 및 pelvis-only 근접 렌더: `captures/` (총 12장)
- GitHub Actions: 데이터 조회, N19 GLB 생산, 근접 렌더 실행

## 실제 변화
- 전체 **2,099삼각형** 및 63본 유지, 얼굴/헤어와 주변 primitive 변경 없음
- 골반 하단 경계 29개 정점을 원본 다리 테두리로 제한 이동 (**각 정점 최대 8.5mm**)
- 전체 정점 126개 변경, 하부 곡률 보정 반복 476회, 실제 최대 정점 이동 24.64mm
- 골반 하단 대상 정점에서 원래 다리 테두리로의 평균 간격 **4.7647mm → 3.2983mm** 감소
- 원본 경계 중 상부 정점 고정
- UV와 JOINTS_0/WEIGHTS_0 유지, 새 이미지 투영 없음
- N19 SHA-256: `4f3459f4a9e9f79cb78e5f3573ea6c16c7c5e045b4075e621de4215a279ae230`

## 실제 CLAY 근접 화면의 자체 평가
`captures/R36HW_N19_CLAY_FRONT_DETAIL.png` 및 `R36HW_N19_PELVIS_ONLY_CLAY_FRONT_DETAIL.png`에서 **중앙 하단의 큰 V자형 틈과 의복에서 유래한 반바지 실루엣이 여전히 뚜렷하다.** 표면을 피부색으로 바꾸거나 골반 경계 위치만 맞춰서는 사용자 제공 형상의 목표에 도달하지 않는다. **미술 품질 합격 아님.**

**중요:** 현재는 기하 위치 맞춤이며, 다른 primitive에 있는 다리 피부 메시와 실제 정점·인덱스 용접을 한 것이 아니다. 인접 피부 경계의 대응 정점 수가 다른 문제를 해결하지 않았다. 네이티브 S2 UV/법선/63본 실시간 스키닝 렌더도 미완료다.

## 다음 기하 작업의 구체적인 목표
하부 V자형으로 겹치는 원래 의복형 장삼각형을 직접 식별하여 선택적 제거·재배분하고, 복부/허벅지 피부의 실제 표면에 연결하는 국소 패치를 생성한다. 골반 외곽과 전체 2,100삼각형을 보호한다. 단순 스무딩·정점 이동·법선 보정만 반복하지 않는다.

## 재현
```bash
node experimental/xpz3d/f11/r36hw-n19-lower-skin-bridge-20261129/source/build_r36hw_n19.cjs
node experimental/xpz3d/f11/r36hw-n19-lower-skin-bridge-20261129/source/render_n19.cjs experimental/xpz3d/f11/r36hw-n19-lower-skin-bridge-20261129/output/R36HW_N19_LOWER_SKIN_BRIDGE.glb experimental/xpz3d/f11/r36hw-n19-lower-skin-bridge-20261129/captures
```

이 버전은 GitHub Actions에서 Node.js로 빌드했으며, 사용자 PC에 Python을 실행하지 않았다.
