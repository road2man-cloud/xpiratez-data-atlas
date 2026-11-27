# R36KX — 골반저 삼각형 재연결/편평한 접힘 완화

**상태:** 실제 3종 GLB, 2048 텍스처, Node.js 생성기, 웹 대시보드, 비교 스크린샷까지 생성됨. 기존 안정 모델은 그대로 둔다.

## 수행한 구조 수정
기존 R36KW의 몸체 1,120삼각형과 R36HW 얼굴/머리 968삼각형(합계 2,088)을 유지하면서, 골반저 중심에 집중된 얇고 긴 삼각형을 실제로 바꾸었다.

- `source/floor_regularize.cjs`: 국소 삼각형 두 장의 대각선 42회(균형형) 또는 20회(보수형) 변경.
- 정점 200개(균형형) 또는 185개(보수형)를 **제한된 접선 방향**으로 완화. 최대 이동량 0.006 / 0.0025 모델 단위.
- 면 뒤집힘 및 열린 경계 검사를 통과한 연결 변경만 허용.
- 새 메시의 UV 삼각형을 다시 펼치고, 고밀도 원본 기반 2048² Base Color / Normal / ORM / Height를 재베이크.
- 새 모델에서 중심 피부가 양쪽 허벅지 관절에 과도하게 끌려가지 않도록 골반 Hip 가중치 재배분한 별도 안정형도 제작.

| 지표 | 기존 R36KW | R36KX 보수형 | R36KX 균형형 |
|---|---:|---:|---:|
| 전체 삼각형 | 2,088 | 2,088 | 2,088 |
| 골반저 기준 면 수 | 389 | 389 | 389 |
| 골반저 평균 형상 품질 | 0.7045 | 0.7686 | 0.8218 |
| 품질 0.28 미만 골반저 삼각형 | 24 | 7 | **1** |
| 닫힌 몸체 메시 | 예 | 예 | 예 |

형상 품질은 정삼각형에 가까울수록 1인 기하학적 수치이며, **해부학적 사실성 또는 시각적 완성도 점수가 아니다.**

## 파일
- `output/R36KX_STABLE_2088_DESIGNED_ART.glb`: 균형형 + 피부 스킨 안정화
- `output/R36KX_BALANCED_2088_DESIGNED_ART.glb`: 균형형 원본
- `output/R36KX_SOFT_2088_DESIGNED_ART.glb`: 보수형 원본
- `output/BALANCED_GEOMETRY_REPORT.json`, `output/SOFT_GEOMETRY_REPORT.json`
- `source/build_floor.cjs`, `source/floor_regularize.cjs`, 그 외 원본 소스·의존성
- `preview/index.html`: 원본 R36KW와 직접 비교하는 3D 대시보드
- `preview/captures/`, `preview/BROWSER_REPORT.json`: 0°와 35° 실제 WebGL 출력

**제약:** 삼각형 연결을 정돈했지만 실제 피부 표면이 없는 공간을 새로 만들지는 않았다. 검게 보이는 중심 영역의 완전한 해부학적 형상 개선은 R36KY 이후 후속 작업 대상이다.

## 빌드 방법
동일한 소스 SHA-256의 R36HW 및 R36JB가 요구된다. 레퍼런스 경로는 실제 파일 존재 여부를 확인해야 한다.

```sh
node source/build_floor.cjs path/to/R36HW_F11_CLOTHED.glb path/to/F11_R36JB_GPT62_NUDIST_CLEAN_ANATOMY_MASTER.glb output/new_build --variant=balanced --atlas=2048
node source/pelvis_skin_anchor.cjs output/new_build/R36KX_BALANCED_2088_DESIGNED_ART.glb output/new_skin
node serve.cjs
```

Windows에서 Python은 실행하지 않았다. 해당 머신에서는 Node.js로만 최종 GLB를 빌드하였다.
