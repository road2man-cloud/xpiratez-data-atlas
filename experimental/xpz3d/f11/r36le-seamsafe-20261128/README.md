# R36LE — 실물 노출광 캐릭터 전체 UV 샘플러 개선 후보
2026-11-28. 기존 R36HW → R36LA → R36LB → R36LC 계보를 보존하고 R36LC 기반으로 새 **실제 GLB 2종**을 생산한다.

## 실제 산출물
- `output/R36LE_SEAMSAFE_SKIN_2100TRI.glb` — R36LC 스킨 안정형 기반 실물 캐릭터
- `output/R36LE_SEAMSAFE_FLOW_2100TRI.glb` — R36LC 표면 흐름 기반 실물 캐릭터
- `R36LE_PRODUCTION_REPORT.json` — SHA-256, 원본 해시, 뼈·폴리곤·재질 변경 데이터
- `build_r36le.cjs` — 독립 Node.js 재생산기(기본 데이터는 저장소 안의 GitHub R36LC 분할 바이너리)
- `preview/index.html` — R36LE 및 R36LC/LA 전체 캐릭터 WebGL 비교 대시보드

## 작업 목적 및 제한
R36LC의 삼각형 단위 아틀라스는 2,048px 텍스처에서 약 60px 타일에 배치된다. 기본 삼중선형 필터의 축소 MIP 레벨이 인접한 무관한 UV 삼각형 색을 섞을 수 있다. R36LE는 몸체 재질의 BaseColor / Normal / ORM / AO **텍스처 참조를 복제**하여 아래 샘플러를 실험한다.

- `magFilter=9729 (LINEAR)`
- `minFilter=9729 (LINEAR, no mipmap sampling)`
- `wrapS=33071, wrapT=33071 (CLAMP_TO_EDGE)`
- 얼굴·헤어에 사용되는 재질, 원본 임베디드 PNG, 메시 정점·인덱스, UV, 스킨 웨이트, 63본, 노드 구조 유지
- R36LC 원본 GLB 덮어쓰기 금지
- 멀리서 깜빡임(aliasing/shimmer) 위험은 *새로 생길 수 있으므로* 비교 실험 후보이며 무조건 상위 품질이라고 주장하지 않는다
- 실제 형상 빈 공간은 이 샘플러로 고칠 수 없다

## 제작 방식
저장소의 `experimental/xpz3d/f11/r36lc-atlas-20261128/ARTIFACTS.json` 및 `assets/parts`만으로 Node.js에서 복원한다. 원본 바이너리 조각의 Git blob SHA-1과 GLB SHA-256을 검사하고 새로운 파일로 출력한다. 생성된 GLB의 BIN 청크가 원본과 **바이트 단위 동일**, 골격·노드·모델 접근자 참조까지 동일한지 자동 확인한다. Python 미사용.

```sh
node experimental/xpz3d/f11/r36le-seamsafe-20261128/build_r36le.cjs
```

## 대시보드
`preview/index.html`: 실물 GLB 비교, 0°/18°/35° 포즈, 전신/얼굴/흉부/골반 카메라, 와이어, 노멀 토글, PNG 저장. 외부 CDN 대신 저장소의 기존 `r36kp/preview/vendor` Three.js를 사용한다. **GPT 대화 안의 경량 대시보드도 별도로 제공**하며 다운로드/로컬 체크아웃이 필수는 아니다.

정적 URL (GitHub Pages가 전체 실험 폴더를 배포한 경우):
`https://road2man-cloud.github.io/xpiratez-data-atlas/experimental/xpz3d/f11/r36le-seamsafe-20261128/preview/index.html`

## 검증 상태
- ✅ GLB 2종 생성, 각 SHA-256 확보
- ✅ 2100△ (머리 968 / 몸체 1132), 63본, 뼈·메시·BIN 바이트 유지
- ✅ 텍스처 참조 4개만 새 sampler로 연결
- ☐ 실제 브라우저 화면 샘플링 개선/거리별 깜빡임 확인
- ☐ S2 게임 엔진 출력 검수

R36LE는 R36LC의 메시 전체를 버리거나 중심부만 따로 다시 제작하지 않는다.
