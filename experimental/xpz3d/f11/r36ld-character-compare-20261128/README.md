# R36LD — 실제 R36LC / R36LA 전체 캐릭터 통합 비교 대시보드

2026-11-28, R36LC의 게시 모델 바이너리 및 R36LA의 검증된 뷰어 기능을 연결한 새로운 **비파괴적 대시보드**. 노출광 캐릭터 전체를 기준으로 한다. 중심부 절차적 독립 모델을 새로 생성하지 않는다.

## 생산/개선 사항
- R36LC 안정형(스킨 보정 GLB)과 균형형(표면 흐름 GLB)의 **게시된 .glb.part00 + .part01 바이너리를 브라우저에서 실시간 합치기**. 보안 컨텍스트(localhost / HTTPS)에서 SHA-256 해시까지 대조.
- R36LA 안정형과 강조 노멀형의 전체 캐릭터 GLB를 함께 로드해 좌우 비교.
- R36LA 기존 Three.js 뷰어의 실물 스킨 포즈(0° / 18° / 35°), 전신/얼굴/흉부/골반 카메라, 회전, 와이어, 노멀맵 토글, 조명 노출, 화면 저장 기능 계승.
- 피부 Color / Normal / ORM / Relief 2048 맵의 R36LA↔R36LC 버전 교체.
- 기존 R36HW 머리/얼굴/헤어, 몸체의 2,100 삼각형(머리 968 / 몸체 1,132), 63본 골격, 스킨 웨이트는 **변경하지 않음**.

## 실행
저장소 루트에서:
```sh
node experimental/xpz3d/f11/r36ld-character-compare-20261128/serve.cjs
```
브라우저 주소:
`http://127.0.0.1:9406/experimental/xpz3d/f11/r36ld-character-compare-20261128/preview/index.html`

정적 GitHub Pages가 같은 경로를 게시한다면 같은 HTML을 연다. `file://`에서 열 경우 모듈/GLB fetch가 차단될 수 있다.

**필수 경로:** `experimental/xpz3d/f11/r36kp/preview/vendor/`, `r36kp/preview/pose-spread.mjs`, `r36la-surface-flow-20261128/output/`, `r36lc-atlas-20261128/assets/parts/`, `r36lc-atlas-20261128/output/balanced/textures/`.

## 두 버전 판단 기준
- R36LC UV 심 지표(Color 평균 44.52% 감소, ORM 12.65% 감소)는 **R36LB 대비** 수치이다. R36LA와의 직접 렌더링 우수성 결과는 아니다.
- R36LA는 실제 0°/35° WebGL 캡처와 포즈 검증 자료가 존재한다. 이 검증 프레임을 새 대시보드에서 재사용한다.
- 실제 검은 빈 공간 및 자체 그림자는 물리 형상의 문제다. 이 대시보드가 형태를 완성하거나 S2 엔진 적용을 검증하지는 않는다.

## 상태
- 이번 작업에서 새 HTML 뷰어/실행기·안내문 생산 및 GitHub 게시.
- R36LA/LC 기존 3D 모델 파일 및 텍스처는 덮어쓰지 않음.
- 실제 크롬 WebGL 렌더와 35° 비교 캡처는 추가 실행 검증 필요.
