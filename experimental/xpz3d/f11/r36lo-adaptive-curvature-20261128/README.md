# R36LO — 전신 메시 적응형 곡률 및 2,100△ 예산 완전 사용 (2026-11-28)

## 실제 산출물

이번 버전은 R36LN의 **실제 전체 캐릭터 GLB**를 입력받아, 기존 통합 피부 메시의 전면에만 국소 삼각형을 12개 더한 후 GLB를 새로 생성했다. 원본을 덮어쓰지 않는다.

- `output/R36LO_FRONT_DEFINED_2100_FULL.glb` — 전면 정밀 곡률 후보, 4,123,828 bytes, SHA-256 `018dca2e6b59daf659449a2940d3a1fbd38015e5db2cd101a60777b133a6d629`
- `output/R36LO_FRONT_SOFT_2100_FULL.glb` — 전면 완화 후보, 4,123,824 bytes, SHA-256 `a774edb55007a6524c7466e261513c1da3f3f8be1964c5a92f41892290bb04aa`
- 동명의 `.report.json` — 실제 선택된 모서리 좌표, 두 면의 ID, 곡률 이동량, 새 GLB SHA-256
- `source/build_r36lo.cjs` — Node.js 독립 빌드 엔진
- `preview/index.html` — R36LO 전면 후보 2개와 R36LN 구형 후보를 같은 조명·카메라·포즈로 비교하는 뷰어
- `.github/workflows/xpz3d-r36lo-production.yml` — GitHub Actions 자동 생산 및 main 비강제 게시

### 측정 결과

| 지표 | 기존 R36LN | 새 R36LO FRONT |
|---|---:|---:|
| 머리/헤어 삼각형 | 968 | 968 |
| 몸체 삼각형 | 1,120 | 1,132 |
| 전신 삼각형 | 2,088 | **2,100** |
| 몸체 고유 정점 위치 | 562 | 568 |
| 폐쇄 메시 경계 에지 | 0 | **0** |
| 비다양체 에지 | 0 | **0** |
| 골격 본 수 | 63 | **63** |
| 분할한 원본 공유 모서리 | 0 | **6** |
| 추가된 삼각형 | 0 | **12** |

곡률 강도: Defined 최대 ±0.0035, Soft 최대 ±0.00238 (GLB 바인드 공간 좌표 단위). 이 숫자는 사진과의 유사도 점수가 아니라 실제 기하 변위량이다.

### 작업 중 스스로 발견하고 보정한 사항

첫 R36LO 생산 결과에서 골반 후면 또는 안쪽의 보이지 않는 면까지 모서리 배분이 이루어진 것을 발견했다. 이를 그대로 최종 후보라고 부르지 않고, `surface_patch.cjs`의 전면 표면 샘플러로 **표면 깊이 필터링**을 추가했다.

이후 `FRONT_` 접두사를 사용해 다시 전체 GLB 2개를 빌드했다. 이전 초기 후보 `R36LO_DEFINED_2100_FULL.glb`와 `R36LO_SOFT_2100_FULL.glb`는 비교·회귀 추적용으로 보존한다. 앞으로의 기본 후보는 **R36LO_FRONT_DEFINED** 및 **R36LO_FRONT_SOFT**이다.

### 보존된 요소

동일 몸체 메시 안에서 모서리 분할하며, 기존 머리/헤어 프리미티브와 63본 스킨, 메쉬 재질, 2048 컬러·노멀·ORM 아틀라스를 계승한다. 분할로 생긴 정점은 해당 원래 삼각형의 UV 안에서 보간하고 본 가중치를 정규화한다. 새 독립 부품은 생성하지 않는다.

### 품질 및 남은 문제

실제 생산 및 GitHub 커밋은 완료했고 폐쇄/삼각형 예산/스킨 검사도 통과했다. 그러나 **새 버전의 WebGL 0°·35° 렌더를 시각적으로 직접 평가하지 않았으며 사용자가 제공한 목표 이미지에 충분히 근접했다고 승인하지 않았다.** 2,100△ 예산을 모두 사용했으므로 이후 곡률 개선은 낮은 우선순위 영역의 폴리곤 감축과 재배분이 필요하다. 새로 보간된 UV 정점에서 색상 또는 노멀 경계가 나타난다면 다음 단계에서 2048 아틀라스의 해당 UV를 재베이크해야 한다.

## 재생산

```sh
node experimental/xpz3d/f11/r36lo-adaptive-curvature-20261128/source/build_r36lo.cjs \
 experimental/xpz3d/f11/r36ln-reference-contour-20261128/output/R36LN_BALANCED_2088_FULL.glb \
 scratch/R36LO_FRONT_DEFINED_2100_FULL.glb defined
```

Windows 사용자 PC Python 실행 없음. 빌드는 GitHub Actions의 Node.js 22에서 수행되었다.
