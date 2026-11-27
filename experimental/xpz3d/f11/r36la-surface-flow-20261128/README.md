# R36LA · 2,100△ full-budget continuous-body + donor-normal flow

**날짜:** 2026-11-28. **상태:** GLB 3종, 2048² 텍스처 4종, 원본 대비 WebGL 비교 대시보드 및 Node.js 생산 소스 제작. **기존 R36KZ를 대체하는 최종 완성판은 아님.**

## 제작한 개선 사항

1. R36KZ의 2,088△에서 남아 있던 12△를 투입해 **2,100△**의 예산을 정확히 사용했다. 얼굴·헤어 968△ 유지, 단일 폐쇄 몸체는 1,120→1,132△.
2. 추가 분할 120→126회. R36KZ의 골반저 92 / 흉부 28 분할을 R36LA에서 **골반저 102 / 흉부 24**로 변경했다. 중복 표면은 추가하지 않았다.
3. `source/surface_flow.cjs`: 고밀도 원본 몸체(12,896△)에서 샘플링한 법선을 연속 스킨의 정점 법선에 혼합하고, 주변 정점과 방향이 어긋나는 부분만 선택적으로 보정한다. 균형형의 358개 참조 샘플 중 **355개 정점 법선이 실제 변경**되었고 평균 법선 변화 약 3.16°, 강화형은 약 4.57°다.
4. `source/designed_skin_art.cjs`: UV 섬마다 끊길 수 있는 고밀도 원본 **정점 컬러 영향**을 제거하고, 3D 공간에 연속적으로 정의한 피부색 변조만 사용하도록 수정했다. 이는 기존 단순 노이즈 대체가 아니라 설계한 구조·톤·하이라이트 레이어를 계속 사용한다. 노멀/height에는 고밀도 원본을 사용한다.
5. 2100△ 신모델에서 Base Color/Normal/ORM/Relief 2048² 텍스처를 실제 재생산했다.
6. `source/pelvis_skin_anchor.cjs`를 2,100△에 맞춰 수정하여, 골반부 Hip 가중치 보정형 GLB를 별도로 제작했다.

| 기준 | R36KZ | R36LA |
|---|---:|---:|
| 전체 삼각형 | 2,088 | **2,100** |
| 얼굴/머리 | 968 | **968** |
| 몸체 | 1,120 | **1,132** |
| 골반저 집중 추가 분할 | 92 | **102** |
| 흉부 집중 추가 분할 | 28 | **24** |
| 실물 텍스처 크기 | 2048² | **2048²** |
| 본 | 63 | **63** |

R36LA 내부 골반저 품질 지표는 초기 0.699→ 정돈 후 0.822, 품질 0.28 미만의 좁은 면은 21→2개였다. 기하학적 삼각형 형상 품질이지 아트 완성도 점수가 아니다.

## 새 실제 산출물

- `output/R36LA_BALANCED_2100_SURFACE_FLOW.glb`: 새 2100△ 연속 메시, 균형형 법선 흐름
- `output/R36LA_BOLD_2100_SURFACE_FLOW.glb`: 새 2100△ 연속 메시, 법선 혼합 강조
- `output/R36LA_STABLE_2100_SURFACE_FLOW.glb`: 균형형 + 골반부 스킨 가중치 안정화, 대시보드 기본값
- `output/body_color_2048.png`, `body_normal_2048.png`, `body_orm_2048.png`, `body_relief_2048.png`
- `output/BALANCED_GEOMETRY_REPORT.json`, `BOLD_GEOMETRY_REPORT.json`, `BALANCED_PRODUCTION_REPORT.json`, `BOLD_PRODUCTION_REPORT.json`, `STABLE_SKIN_REPORT.json`
- `source/build_floor.cjs`, `source/surface_flow.cjs`, `source/designed_skin_art.cjs`, `source/pelvis_skin_anchor.cjs`, 기타 재생산에 필요한 Node.js 모듈
- `preview/index.html` 및 `preview/captures/`: 기존 R36KZ 대비 0°/35° 골반부, 흉부, 노멀맵·조명을 끈 컬러 텍스처 단독 비교

## 실제 화면과 확인된 실패 원인

Chrome WebGL에서 R36LA 2,100△와 R36KZ 2,088△를 함께 표시하면 **4,188△/12 draw calls**이며 WebGL 오류 0이다. 35° 벌림에서 무릎 간격은 0.180→0.686 모델 단위로 증가한다.

**중요한 자체 피드백:** 새 컬러맵은 고밀도 원본 삼각형 정점색 의존성을 제거했지만, `R36LA_00_COLOR_ONLY.png`에서도 **삼각형 경계의 밝은 선이 여전히 보인다**. 따라서 원본 정점 색상의 불연속성 **하나만으로** 이 현상을 설명하는 가설은 무효화되었다. UV 삼각형 아틀라스의 압축/필터링/패딩 및 색상 베이크 경계 샘플을 더 근본적으로 수정해야 한다. **색상 심이 고쳐졌다고 표시하지 않는다.**

마찬가지로 골반 중앙의 검은 틈은 실제 기하학과 자기 그림자를 포함하고 있어 완전히 없어지지 않았다. 법선 재배치로 빈 메시를 만들어 낼 수 없다. R36LA는 **실제 생산된 메시·법선/컬러 생성기 개선 후보**이며, 사용자가 제시한 기준 사진과 동일한 최종 형상은 아직 달성하지 못했다.

## 빌드

원본 SHA와 63본 골격을 확인하는 R36HW / R36JB GLB 파일이 필요하다.

```sh
node source/build_floor.cjs path/to/R36HW_F11_CLOTHED.glb path/to/F11_R36JB_GPT62_NUDIST_CLEAN_ANATOMY_MASTER.glb scratch/balanced --variant=balanced --atlas=2048
node source/build_floor.cjs path/to/R36HW_F11_CLOTHED.glb path/to/F11_R36JB_GPT62_NUDIST_CLEAN_ANATOMY_MASTER.glb scratch/bold --variant=bold --atlas=2048
node source/pelvis_skin_anchor.cjs scratch/balanced/R36LA_BALANCED_2100_SURFACE_FLOW.glb scratch/skin
node serve.cjs
```

- Python 미사용. 소스 및 예외 설계는 GPT 작업공간에서 수행하고, 원본 바이너리 접근이 필요한 최종 빌드는 허가된 Windows 작업 PC에서 Node.js로 실행했다.
- 기존 R36KZ 및 이전 GLB는 덮어쓰지 않는다.
- 게임 엔진 직접 적용과 전체 애니메이션 검수는 미완료.

## 다음 작업자에게

**기본 후보는 `R36LA_STABLE_2100_SURFACE_FLOW.glb`** (대시보드의 첫 모델). R36KZ가 안정 비교 기준이다. 다음에는 (a) per-triangle UV island 구조를 유지하더라도 에지 양쪽의 `albedo`를 같은 월드 위치에서 샘플하고 색을 일치시키는 border propagation, 또는 메시의 넓은 영역 UV 연속 재전개, (b) 중앙의 실제 물리적 깊이/연결부 재구성을 우선한다. 단순히 색에 어두운 톤을 입혀 틈이 해결됐다고 주장하지 않는다.
