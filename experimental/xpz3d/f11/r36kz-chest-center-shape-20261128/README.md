# R36KZ — 흉부 곡면 재조형 및 중심부 이미지 기준 보존 (2026-11-28)

**상태:** 실제 GLB 3종, 2048² 텍스처 4종, Node.js 생성기, 흉부/골반 0°·35° 브라우저 대시보드 캡처 제작. **사용자가 지정한 중심부 사진에 대한 정밀한 3D 복제는 아직 완료되지 않았다.**

## 이번 작업에서 실제 달라진 것

이전 R36KY의 2,088삼각형을 보존하면서 상부 체형 실루엣의 통합 형상을 작업했다. 기존에는 120회 추가 분할이 전부 골반저로 향했다. 새 생산기는 아래와 같이 **같은 120회**를 다시 배분한다.

| 부위 | 새로 배정된 에지 분할 |
|---|---:|
| 골반저 | 92 |
| 전면 상부 몸체 | 28 |
| 그 외 | 0 |
| **합계** | **120** |

나머지 880개 초기 몸체 삼각형과 기존 HW 얼굴/헤어의 968개 삼각형을 포함한 전체 합계는 계속 2,088삼각형(제한 2,100)이다. 단일 폐쇄 몸체·63본 스킨은 유지하며, 별도 흉부/중앙부 메시를 겹치지 않는다.

`source/chest_volume.cjs`는 전면 흉곽의 양쪽 곡면, 하중이 느껴지는 아래쪽 전이와 넓고 연속적인 외곽 연결을 **피부 메시 정점 88개**에 적용한다. 이것은 노골적인 디테일이 아닌 **외부 체형의 큰 실루엣 보정**이다.

`source/designed_skin_art.cjs`에도 새 흉부 컬러 레이어(상부 하이라이트, 볼륨 톤, 아래쪽 전이선)를 추가해 삼각형을 가로질러 일관된 톤을 형성했다. 피부색/노멀/ORM/높낮이 2048² PNG를 새 모델의 UV 기준으로 재베이크했다.

## 생산값

| | R36KZ 균형형 | R36KZ 강화형 |
|---|---:|---:|
| 전체 삼각형 | 2,088 | 2,088 |
| 본 수 | 63 | 63 |
| 흉부 변형 정점 | 88 | 88 |
| 흉부 최대 이동 (모델 단위) | 0.02935 | 0.03522 |
| 중앙부 R36KY 조형 정점 | 130 | 130 |
| 중심부 조형 최대 이동 (모델 단위) | 0.00929 | 0.01579 |
| 골반저 면의 평균 기하 품질 | 0.8245 | 0.8245 |
| 골반저 품질 0.28 미만 면 | 1 | 1 |

기존 R36KY와 같은 원본 전면 표면의 46개 대응점에서 R36KZ는 앞으로 평균 0.01760(균형형), 0.02055(강화형) 모델 단위 더 돌출되었다. 측정은 `output/CHEST_SHAPE_REPORT.json`에 원시 좌표를 기록했다. 이 값은 볼륨의 이동량이지 아트 완성도 점수가 아니다.

## 신규 파일

- `output/R36KZ_BALANCED_2088_TORSO_CENTER.glb` — 피부 원형, 균형형 상부 체형
- `output/R36KZ_BOLD_2088_TORSO_CENTER.glb` — 피부 원형, 강화형 상부 체형
- `output/R36KZ_STABLE_2088_TORSO_CENTER.glb` — 균형형 + 중심부 Hip 스킨 가중치 안정화, 대시보드 기본값
- `output/body_color_2048.png`, `body_normal_2048.png`, `body_orm_2048.png`, `body_relief_2048.png` — 균형형 기준 텍스처
- `output/BALANCED_GEOMETRY_REPORT.json`, `BOLD_GEOMETRY_REPORT.json`, `CHEST_SHAPE_REPORT.json` — 실제 생산·형상 이동 데이터
- `source/reallocate_floor.cjs` — 골반저 92 + 흉부 28 분할 배분
- `source/chest_volume.cjs` — 연결된 흉부 메시 조형
- `source/designed_skin_art.cjs` — 흉부 하이라이트·전이·명암 레이어
- `source/build_floor.cjs` — 전체 GLB 재생성
- `preview/index.html` — R36KY 원형 대비 3D 비교, 0°/18°/35°, 흉부 확대, 골반부 확대, 와이어, 컬러 단독 보기
- `preview/captures/` — 브라우저가 실제로 캡처한 결과
- `preview/BROWSER_REPORT.json` — WebGL draw 및 스키닝 확인

## 참조 이미지 취급

대화에서 사용자가 제시한 이미지들은 **체형/중심부 아트 방향 참조**로만 적용한다. 원본 이미지는 개인 자료일 수 있어 **공개 GitHub 저장소에 복사하지 않는다**. 이미지에서 실제 3D 크기나 깊이를 측정할 수 없으므로 형상은 근사치다. 중심부 참조의 목표는 양측의 연속된 완만한 표면과 중앙 굴곡, 주변 피부에 묻히지 않는 연결부다. **R36KY 중간 조형값을 유지했을 뿐 사용자가 최종 선택한 사진의 구체적인 형상을 이번 버전에서 재현했다고 주장하지 않는다.**

## 생산 예시

```sh
# 원본 GLB가 접근 가능한 F11 작업공간 기준
node source/build_floor.cjs path/to/R36HW_F11_CLOTHED.glb path/to/F11_R36JB_GPT62_NUDIST_CLEAN_ANATOMY_MASTER.glb scratch/new_balanced --variant=balanced --atlas=2048
node source/build_floor.cjs path/to/R36HW_F11_CLOTHED.glb path/to/F11_R36JB_GPT62_NUDIST_CLEAN_ANATOMY_MASTER.glb scratch/new_bold --variant=bold --atlas=2048
node source/pelvis_skin_anchor.cjs scratch/new_balanced/R36KZ_BALANCED_2088_TORSO_CENTER.glb scratch/new_stable
node source/measure_silhouette.cjs old.glb balanced.glb bold.glb scratch/shape_report.json
node serve.cjs
```

사용자 PC에서 Python은 실행하지 않았다. 생산기는 Node.js만 사용한다. 원본 바이너리를 포함하지 않는 GPT 내부에서 수치장 설계 및 코드 작성 후, 원본이 저장된 허가된 PC에서 Node.js GLB 빌드만 수행했다.

## 실제 화면에서 남은 한계

1. **흉부:** 큰 형태·아래쪽 전이는 개선되지만, 원본이 극도로 저폴리이므로 각진 면과 삼각형 명암은 여전히 눈에 띈다. 제공 사진과 동일한 형태·피부 표현을 보장하지 않는다.
2. **중심부:** 사진 기반 목표가 확정되었어도 기존 R36KY의 검은 홈과 부족한 실제 굴곡은 해결되지 않았다. 색상만 칠하는 대신 2,100 예산 내 **중심 표면의 토폴로지를 다시 연결하는 작업**이 필요하다.
3. 28개 상부 분할을 확보했기 때문에 기존 R36KY보다 골반저의 추가 세분화가 28회 줄었다. 총예산이 같아도 양쪽 영역의 투자비용을 항상 검토해야 한다.
4. 실제 게임 엔진 재질·애니메이션 적용은 미완료이다.

**완료 판정:** 코드/GLB/브라우저 후보 생산 및 GitHub 게시. **사용자가 지정한 이미지와 일치하는 최종 모델 생산은 미완료**.
