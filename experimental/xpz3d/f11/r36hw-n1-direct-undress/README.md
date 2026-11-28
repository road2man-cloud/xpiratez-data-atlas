# R36HW-N1 — 원본 몸체 직접 보존형 1단계

이 버전의 목적은 **R36HW 원본 GLB의 정점·스킨·UV·법선·인덱스 데이터를 손대지 않은 상태로** 의복 재질과 독립 장비 영역을 분리하는 첫 단계이다. R36JB 축약 몸체를 가져오지 않는다.

## 원본을 직접 읽어 확인한 내용

원본: `experimental/xpz3d/f11/r36kp/reference/R36HW_F11_CLOTHED.glb` (270,068바이트; Git blob `6bb853074804086a73bc82d81950f3614b954e72`). 원본 SHA-256은 빌드 과정에서 인계서의 `a0780ab8995e68036388754449cfb66891c8bbbb160ef18b04a730d3294db732`과 직접 비교한다.

원본은 GLB 2.0, mesh 1개, primitive 15개, 총 2,100삼각형, skin 1개/63 joints이다. 재질별 삼각형: face 644, hair 294, jacket 160, pants 180, boots 140, gloves 48, trim 24, hardware 12, skin 428, webbing 32, gear 36, eye_white 14, eye 4, skull 64, thigh_strap 18.

원본에 POSITION, NORMAL, JOINTS_0, WEIGHTS_0, COLOR_0가 존재하고 일부 primitive에 TEXCOORD_0가 있다. 의복은 별도 mesh가 아닌 *primitive 단위*로 분리돼 있다.

## 1단계 생산기

```bash
node experimental/xpz3d/f11/r36hw-n1-direct-undress/source/build_r36hw_n1.cjs
```

- 유지: face / hair / skin / eyes 및 해당 원본 지오메트리
- 피부 재질 적용(형상 **미수정**): jacket / pants / boots / gloves
- 제거: trim / hardware / webbing / gear / skull / thigh_strap
- 외부 라이브러리 없이 GLB JSON 청크만 수정하고 BIN 청크와 원본의 스킨·정점 버퍼를 그대로 보존한다.
- 출력: `output/R36HW_N1_STAGE1.glb` 및 `reports/R36HW_N1_STAGE1.json`

**주의:** 의복 표면을 피부 재질로 전환한 것만으로 실제 탈의 모델이 완성되는 것은 아니다. 의복의 실루엣이 남아 있으며 가려진 피부를 복원하지 않았다. 따라서 현 단계는 *표면 분류 및 몸체 보존 후보*이지 최종 탈의/중심해부학/아트 승인 결과가 아니다. 원래 피부 mesh가 옷 안쪽까지 덮여 있는지도 별도 확인 대상이다.

## 남은 작업

R36HW를 유지하는 국소 표면 복원 및 의복 실루엣 교정, 중심부 국소 메시 통합과 예산 재분배, UV/노멀 이음매 보수, 63본 실시간 스키닝, 네이티브 S2 렌더링과 원본 대비 시각적 승인.
