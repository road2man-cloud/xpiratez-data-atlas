# XPZ3D F11 rev96 — 사용자 원본 101면 트림 확정 기준

기준일: 2026-11-17. 이 문서는 이전 "101면 파일 미확보" 기록보다 최신이며, 이전 기록을 삭제하거나 변조하지 않고 상태를 갱신한다.

## 1. 원본 발견 및 GitHub 보존 완료

- 사용자가 2026-11-16 15:28:07 UTC에 저장한 원본 JSON을 실제로 복구했다.
- 경로: `xpz3d/f11/source/rev95-user-trim-101faces-20261116T152807Z.json`
- SHA-256: `624685b103b4d610f60c38132ce3d28abde87e2552748e492632742e07347ec5`
- 정확히 106개 controls, 754개 positions, 101개 deletedFaces.
- 101면 구성: primitive 13의 100면, primitive 18의 1면.
- 기준 GLB: `r21AO-F11-skin-separated-rev92-base.glb`, SHA-256 `c6d1665cab6b9ad185090843b53e4973e5115c343e96c02de7a5599557ca3783`.
- 기존 0면 조형 임시본, 1면 QA본, 33/48면 자동 삭제본을 이 원본 대신 사용하지 않는다.

## 2. 실제 생성·확인된 독립 GLB

| 출력 파일 (xpz3d/f11/models/) | 전체 면수 | 추가 봉합면 | SHA-256 | 상태 |
|---|---:|---:|---|---|
| `r21AO-F11-user-trim-rev96-base.glb` | 3,546 | 0 | `f53a8d5af9000593aaa681c11038bb641950cae62810511784e05a0fc5d07cd7` | 원본 수동 삭제 확정 기준 |
| `r21AO-F11-user-trim-rev96-bridge-minimal-r4.glb` | 3,552 | 6 | `717c15d61fea69c7cfee7877355f001cbe3896dcd590d0469e7763715c159717` | 형상 검토 전 실험 후보 |
| `r21AO-F11-user-trim-rev96-bridge-smooth-r4.glb` | 3,566 | 20 | `b3a6ecc011822b3c7763627d031f9887856b5dee934605320218dcdc9a20fe70` | 형상 검토 전 실험 후보 |

독립 검사: 원본 101면 비복원, 754개 정점의 rest/open55 재현, 63 Bones, 별도 의복 370면 확인.
0°·25°·40°·55° 각도, base/minimal/smooth × 와이어/실체 = 24장 캡처 완료. 브라우저 오류 0건.

## 3. 실제 파일 위치

- 원본·빌드 작업본: `D:\daphne_auto\F11-r21AO-rev96-user-trim-20261117`
- GitHub 별도 체크아웃: `D:\daphne_auto\F11-r21AO-rev96-github-publish-20261117`
- GitHub 전용 브랜치: `xpz3d/f11-rev96-history-20261117`
- 주요 소스: `scripts/build_rev96_trim_seam_user101.cjs`, `scripts/build_rev96_user101_cross_skin_bridge_r4.cjs`
- 감사: `tests/verify_rev96_user101.cjs`, `tests/REV96_USER101_INDEPENDENT_CHECK.json`
- 경계: `history/rev96-user101-boundary-loops.json`
- 이미지: `review/captures/rev96-user101-*.jpg`
- 로컬 WebGL 비교 화면: `http://127.0.0.1:8873/f11/r21al/review-rev96-user101-r4.html`

## 4. 정확히 남은 일

- **완료로 표시하지 않음:** 원본 삭제 부위의 완전한 곡면 봉합, 좌우 날개형 돌출의 자연스러운 제거, 게임 네이티브 배포.
- r4 최소/부드러운 후보는 실제 면을 추가했지만, 0/25/40/55도 시점에서 육안 변화가 미미하고 기존 하단 측면 돌출이 남아 있다.
- 다음 버전은 3,546면 `user-trim-rev96-base.glb`를 유일한 작업 기준으로 삼는다.
- 수동 삭제 101개 삼각형은 다시 만들지 않는다. 기존 동일한 원본 정점 인덱스 3개를 삼각형으로 재삽입하지 않는다.
- 중앙 해부학 구조와 의도된 개구부는 보존한다. 63 Bones 및 독립 의복 370면도 보존한다.
- 긴 팬형 메시/스트링 구조를 금지하고 짧은 연결 스트립만 사용한다.
- 추가 면이 원래 잘라낸 영역을 시각적으로 다시 덮는 경우에는 후보를 폐기한다.
- r4를 최종 완료·사용자 승인이라고 표시하지 않는다.

## 5. 다음 세션 첫 행동

원본 GLB와 JSON 해시를 비교한 후, 삭제 경계 25개(중앙 24, 오른쪽 연결 피부 1)를 시각적으로 구별해 남겨야 할 개구부/봉합해야 할 경계를 분류한다. 그다음 기준 GLB 위에서만 후보를 추가 생산하고 독립 GLB, 4자세×2표시 렌더링을 출력한다. 형상 변경이 없는 반복 QA보다 실질적 돌출 구조 개선을 우선한다.
