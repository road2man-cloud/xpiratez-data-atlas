# XPZ3D F11 rev96 — r26 실제 GLB 생산 / 다음 작업자 실행 인계 (2026-11-18)

## 현재 판정

**r26 Unified Skin v2: 실제 생성/메시 통합/재질 일치 성공. 자연스러운 앞 큰 U + posterior 작은 U + 항문 타원 윤곽은 미완료.**

기준 원본은 r24 Ellipse Soft v3:
`r21AO-F11-user101-native-retopo-r24-posterior-opening-elliptic-soft-v3.glb`
SHA-256 `ed99fb2df29767fff3258a6267ddc395b6e5b177eebc9676de7f1c5485bced7a`.

새 r26 개발 기준:
`r21AO-F11-user101-integrated-oval-r26-unified-skin-v2.glb`
SHA-256 `08e37ff8fa981ad9f23807e090f477cdf7d97c1bfd50027f59e87b249fd6cbc3`.

사용자 수동 삭제 JSON SHA-256 `624685b103b4d610f60c38132ce3d28abde87e2552748e492632742e07347ec5` 불변. 이전 r16~r25 전부 별도 보존.

## 실제 수정한 모델의 구조

- r24의 중심해부학 primitive 13: 921면 중 기존 authored/접합 면 529면(인덱스 face 0~528)을 유지.
- 후방 생성 해부학 392면(face 529~920)을 primitive 23으로 실제 이동.
- 기존 별도 회음부 피부 primitive 23의 682면과 합쳐 **동일한 물리 인덱스 메시 1,074면**으로 구성.
- 중심해부학과 회음부 피부가 공유하던 **22개 정점을 실제 인덱스 용접**. 과거 가상 좌표 매칭과 구별할 것.
- 동일한 통합 메시 내부 정점 464개를 제한된 Laplacian fairing으로 재조형; r24의 항문 후방 +20mm 유지.
- 원래 authored 529면은 primitive 13에 그대로 남음. 이 authored 부분과 몸통 primitive 0까지 물리적 용접했다고 주장하지 말 것.
- r26 Unified Skin v2는 authored core 13과 새 통합 피부 23의 glTF 재질 ID를 **material 5로 통일**. _TISSUE/_ANATREGION/_ANATCAVITY 속성 보존.

| 항목 | 결과 |
| --- | --- |
| 전체 삼각형 | 4,680 |
| 63 Bones / 의복 독립 370면 | 보존 |
| 사용자 삭제 101면 / 수동 조형 754 / 106 controls | 보존 |
| 원본 중심 authored 최초 908정점 | POSITION/morph 보존 |
| 원본 몸통 primitive 0 | POSITION/morph/index/weights 보존 |
| 통합 피부 메시 내부 실제 용접 | 22정점 |
| 골반 열린 모서리 / 비매니폴드 / 역방향 | 0 / 0 / 0 |
| 전신 나머지 열린 모서리 | 34 |
| 실제 0°/25°/40°/55° 접합 | 자세당 236쌍, 최대 벌어짐 0 |
| 16장 실체/와이어 이미지 | 생성 완료 |
| 최종 실루엣 육안 승인 | **미승인** |

세부 증거: `REV96_USER101_R26_ACCEPTANCE.json`, `REV96_USER101_R26_UNIFIED_V2_POSED_SEAMS.json`, `rev96-r26-unified-v2-union-boundary.json`.

## r26 실험 분류

1. `build_rev96_user101_r26_integrated_oval.cjs`: 생성 핵심 392+682면 통합, centroid 1,074개 생성, 전체 6,828면. 부채꼴 형상과 거친 음영 남음. **기각**.
2. `build_rev96_user101_r26_integrated_oval_shaded.cjs`: 부드러운 원본 법선 보간, 전체 6,828면. 원래 방사형 피부판 구조가 계속 눈에 띔. **기각**.
3. `build_rev96_user101_r26_integrated_ribbon.cjs`: 좌우 fan 511면을 301/349면 종방향 스트립으로 실제 대체, 전체 6,198/6,342면. 55° 화면에서 양옆 장력막과 삼각형 주름이 악화. **기각**.
4. `build_rev96_user101_r26_integrated_smoothed.cjs`: 이미 합친 메시 내 정점 464개만 완화, 전체 4,680면. 화면에서 가장 안정적. **개발 기준**.
5. `build_rev96_user101_r26_unified_skin_v2.cjs`: 4번 GLB authored core와 통합 skin의 재질을 일치시킨 독립 GLB. **현재 우선 개발 후보**.

## 남은 원인 — 사용자 요구와의 차이

현재 r26은 392+682 면을 물리적으로 합쳤지만 처음 작성된 **529개 authored 표면 면을 여전히 별도로 고정**하고 있어, 사용자가 지적한 전방 큰 U와 후방 작은 U의 높이/접선/재질 조형을 완전히 함께 바꾸지는 못했다.

또한 몸통 원형과 좌우 넓은 피부막 경계가 크고 비대칭이므로, 이 경계를 직선으로 zipper 연결하거나 centroid fan 세분하는 방식은 넓은 삼각 막을 재생성한다. 수치상 봉합 0개와 실제 자연스러운 oval은 별개다.

## 다음 작업자 실행 지시: 반드시 실제 GLB 생성

1. 우선 위 r26 Unified Skin v2에서 작업하되 r24 원본과 수동 사용자 JSON은 불변 기준으로 저장한다.
2. 수동 조형 754개 정점 ID가 최초 authored 908개 중 어디에 해당하는지 명확히 지도화한다. 754 수동 조형을 보호하면서, 새 독립 파생 모델에서 **기존 authored 접합 529면 중 교체 가능한 얼굴/회음부 표면**을 별도로 처리한다. 원본을 수정하지 않고 새 후보에만 적용한다.
3. 단면 기준으로 **전방 큰 U + 그 posterior 작은 U를 합쳐 하나의 전후 타원형 함몰**을 실재 메시 표면으로 조형. posterior 항문 중심 Y≈+0.0208213은 질구와 합치지 않고 독립 함몰로 유지.
4. 기존 38/35 edge의 좌우 경계를 단순 fan/zipper 삼각망으로 채우지 말 것. 피부 표면의 경계 위치와 **접선**까지 맞춘 constrained patch, 곡률 조절 가능한 Coons/B-spline 패치로 다시 지오메트리를 생성하고 비정상적인 날개막은 없앨 것. 사용자 기준에서는 열린 구멍보다 추가된 제거 가능한 피부가 낫지만 긴 평면 가림판은 금지한다.
5. material 5, _ANATREGION, UV, morph, LBS, Bones 63 및 의복 370면을 지키고, 55° under/behind의 실체·wire를 최우선 육안 판정으로 직접 확인하라.
6. 최종 실루엣이 사용자 명세를 달성하지 않았다면 품질/위상 검사에 통과해도 **미완료**로 분류하고 더 개선하라.
7. r27 후보 CJS·GLB·16장 이미지·품질 JSON을 새 이름으로 만들고 로컬 Git 누적. 원격 push는 원격 커밋 확인 후만 완료로 표시.

## 로컬 실제 산출물

작업 폴더: `D:\daphne_auto\F11-r21AO-rev96-user-trim-20261117\`

GLB: `r21AO-F11-user101-integrated-oval-r26-unified-skin-v2.glb`

생성기: `build_rev96_user101_r26_integrated_smoothed.cjs`, `build_rev96_user101_r26_unified_skin_v2.cjs`

실제 WebGL 비교: `http://127.0.0.1:8873/f11/r21al/review-rev96-user101-r26-smoothed.html` (왼쪽 r24 baseline / 오른쪽 r26)

16장 이미지: `rev96-r26-unified-v2-canonical-{0,25,40,55}-{under,behind}-{solid,wire}.png`.

**최종 상태: 실제 생산 완료 / 국소 메시 통합 및 재질 통일 완료 / 이중 U 자연스러운 타원 실루엣 미완료 / 전신 완전 폐쇄 미완료.**
