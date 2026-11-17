# XPZ3D F11 rev96 — r26 통합 / r27 적응형 조형 실험 인계

기준일 2026-11-18. 원본 불변, 실제 생성물 우선, 시각 미승인을 완료로 오인하지 않음.

## 현재 실제 모델

- r24 불변 기준: `r21AO-F11-user101-native-retopo-r24-posterior-opening-elliptic-soft-v3.glb`; SHA256 `ed99fb2df29767fff3258a6267ddc395b6e5b177eebc9676de7f1c5485bced7a`.
- r26 통합 구조 기준: `r21AO-F11-user101-integrated-oval-r26-unified-skin-v2.glb`; SHA256 `08e37ff8fa981ad9f23807e090f477cdf7d97c1bfd50027f59e87b249fd6cbc3`.
- r26 별칭 실물 GLB: `r21AO-F11-user101-native-retopo-r26-integrated-oval.glb`; v2와 동일 SHA256. 우회해 실험 ribbon-gentle을 정식 모델로 표시하지 않도록 수정.
- 신규 r27 실험: `r21AO-F11-user101-integrated-oval-r27-adaptive-relief.glb`; SHA256 `857afd41108d74d031b2887c8381cce760a27c4b54c4530d6e68b7e31ce58e98`.

## 실제 수정

1. r26 v2 구조를 보존하며 `build_rev96_user101_r27_adaptive_oval_relief.cjs` 신규 작성. 보호 외곽/다른 메시와 일치하는 정점 272개를 고정; 나머지 331개를 타원형 표면 relief에 따라 조형.
2. 기존 r26 생성기의 전체 fairingScale 0.0824 일괄 감쇠 문제를 피하려고 정점별로 Rest/Pose 양쪽 삼각형 법선 방향을 검사하면서 최대 허용 변위 탐색.
3. 실제 정점 이동 최대 약 0.00503 GLB, 중위수 약 0.00105 GLB; 4,680 tri·63 Bones·370 의복면 보존.
4. r27 0/25/40/55도, under/behind, solid/wire 합계 PNG 16장 렌더. Playwright 콘솔 오류 0.
5. Rest/Pose face flip 0 / 퇴화 0, 골반 국소 open 0, 전체 나머지 open 34, wrong direction 0, nonmanifold 0. 4자세 각각 접합 236쌍, 최대 gap 0.

## 실제 화면 판정 — 승인하지 않음

55도 하단·후방 화면에서 자연스러운 전방 큰 U + 후방 작은 U의 길쭉한 타원은 여전히 불충분. 기존 원본의 넓은 좌우 삼각 피부막과 중앙 직사각형 연장면이 남음. r27 adaptive relief는 정점 이동/안정성 실험 결과물일 뿐 정식 외형 개선 승인품이 아니다.

핵심 원인: 사용자 수동 정점 908개와 authored 코어 529면, 몸통 가장자리 유지 조건만으로는 기존 접합부의 큰 평면 면 구조가 사라지지 않는다. 내부 정점만 움직여서는 실루엣을 충분히 바꿀 수 없다.

## 다음 실제 개발 우선순위

- `r26 Unified Skin v2` 또는 별도 r27 파생 모델에서 **외곽 38/35 edge의 거대한 fan을 제거하고, 실측 외곽 경계/접선을 보존하는 local Coons/B-spline patch**로 구조를 새로 조형할 것. 이전 ribbon의 일방향 zipper나 centroid fan 재사용 금지.
- 908 authored vertex와 수동 754 위치 ID를 atlas로 결합하고, 위치 고정하면서 기존 authored 529면 중 교체 가능한 면을 분리하여 중앙 윤곽을 실제로 리토폴로지. UV·LBS·morph·재질 5 일치 및 63 Bones 필수.
- 항문 중심 Y≈+0.0208213 및 blind pit을 유지하고 전방 개구와 융합하지 말 것.
- 우선 55도 under/behind 실체의 큰/작은 U 연결, 측면 날개 제거를 육안 평가하고 뒤집힘/틈은 그다음 확인. 전신 완전 봉합을 주장하지 말 것.

## 생성 증거

- CJS: `build_rev96_user101_r27_adaptive_oval_relief.cjs`, `render_rev96_r27_adaptive_relief.cjs`, `audit_rev96_r27_adaptive_pose.cjs`, `inspect_rev96_r27_adaptive_union.cjs`.
- JSON: `REV96_USER101_R27_ADAPTIVE_RELIEF_BUILD.json`, `REV96_USER101_R27_ACCEPTANCE.json`, `REV96_USER101_R27_ADAPTIVE_POSED_SEAMS.json`, `rev96-r27-adaptive-union-boundary.json`.
- PNG: `rev96-r27-adaptive-relief-canonical-{0,25,40,55}-{under,behind}-{solid,wire}.png` (16장).
- 로컬 WebGL 비교: `http://127.0.0.1:8873/f11/r21al/review-rev96-user101-r27.html`.
- r26 지정 결과: `REV96_USER101_R26_BOUNDARY_DIFF.json`, `REV96_USER101_R26_ACCEPTANCE.json`, `review-rev96-user101-r26.html`.

## GitHub

로컬 repo `D:\daphne_auto\F11-r21AO-rev96-github-publish-20261117`, branch `xpz3d/f11-rev96-history-20261117`. 2026-11-18 기준 기존 r26 커밋 `53314b7`은 원격보다 앞서 있음. `git push`는 Windows credential store 오류로 실패. **원격 저장 완료로 표시하면 안 됨**. 인증 정상화 후 `git ls-remote`와 `git log origin/...`을 검증하여 push.

**상태: r26 구조 통합 완료 · r27 개선 시제품 생성 완료 · 최종 해부학적 자연스러운 형태 미승인 · GitHub 원격 미반영.**
