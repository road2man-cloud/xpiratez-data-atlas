# R36KW — 설계형 피부 텍스처 + 골반저 중심 메시 / 2026-11-28

**생산 완료:** 새 GLB 2종, 2048² PNG 4종, 설계 레이어 이미지, 생산용 Node.js 소스, 실제 브라우저 대시보드·0°/35° 캡처. **최종 아트 검수 합격 아님 / 게임 엔진 적용 미완료.**

## 작업 목적

사용자가 요구한 품질 기준은 '균일한 피부 위에 노이즈'가 아니라 R36HW 의복처럼 **설계된 톤, 의도적인 얇은 경계선, 방향성 있는 하이라이트, 세밀한 피부 텍스처가 한 화면에서 일관된 아트로 보이는 것**이다.

R36KV의 골반저 집중 120회 세분화와 R36HW 얼굴 원본을 유지한 채, 기존 `skin_art.cjs`의 느슨한 노이즈·넓은 명암 베이크를 **`source/designed_skin_art.cjs`** 의 연속적인 바인드-공간 아트 디자인으로 교체하였다. `source/bake_atlas.cjs`는 새 모듈을 실제 2048 텍스처 베이크 루프에서 호출하도록 수정하였다.

## 실질적으로 추가한 디테일

1. **골반저/하복부 구조 톤:** 하복부·골반저·안쪽 허벅지에 연속한 서로 다른 색상대와 볼륨 구분
2. **의도된 이중 경계선:** 완만한 주름과 톤 경계를 따라 얇은 색상 그림자선 + 인접한 밝은 림
3. **양측 볼륨 하이라이트:** 좌우 형태 흐름에 맞춰 공간 좌표로 배치, UV 삼각형 경계에 종속되지 않음
4. **미세 채색:** 높은 공간 주파수의 약한 피부결과 색반점, 낮은 반사·높은 거칠기
5. **노멀맵 보조:** 원본 고밀도 몸체 및 중심부의 법선을 참고하되 큰 삼각형 음영을 강조하지 않도록 완화

위 경계선은 **의학적인 표면 구조의 정확한 지도라는 주장이 아니라 아트 방향을 위한 도색 지시**이다.

## 실제 생산 수치

| 항목 | 수치 |
|---|---:|
| 최종 화면의 삼각형 | **2,088** (허용치 2,100) |
| R36HW 원본 얼굴·헤어·눈 | 968△ |
| 중심부를 포함한 단일 피부 몸체 | 1,120△ |
| 별도 떠 있는 중심 메시 | 0△ |
| 골반저 추가 분할 | **120회**, 상부 추가 분할 0회 |
| 참조 고밀도 몸체 | 12,896△ |
| 참조 고밀도 중심부 | 6,044△ |
| 베이크 캔버스 | 2048×2048 |
| 실제 채색 픽셀 | 1,663,200 |
| 설계형 경계 효과 사용 픽셀 | 143,123 |
| 하이라이트 사용 픽셀 | 326,626 |
| 구조적인 명암 효과 픽셀 | 453,043 |
| 고밀도 중심부 법선 참조 픽셀 | 449,810 |

이 '효과 사용 픽셀'은 각 레이어의 유의미한 가중치를 받은 텍셀 수다. **고유한 수작업 문양의 개수나 사람이 그린 붓터치의 개수가 아니다.**

## 신규 모델

- `output/R36KW_2088_DESIGNED_ART.glb` — 새 아트 텍스처, 골반저 추가 분할
- `output/R36KW_2088_DESIGNED_STABLE.glb` — 위 새 GLB에 부드러운 Hip 스킨 가중치 재분배 적용(강도 0.73)
- `output/body_color_2048.png` — Base Color; 컬러맵만으로도 구조적 톤과 경계선을 표현
- `output/body_normal_2048.png` — 원본 기반 노멀맵
- `output/body_orm_2048.png` — 거칠기·차폐
- `output/body_relief_2048.png` — 높낮이 보조맵(원본 GLB에 별도 게임 엔진 displacement로 장착하지 않음)
- `output/R36KW_DESIGNED_LAYERS.png` — 왼쪽 위: 설계형 컬러, 오른쪽 위: 경계선, 왼쪽 아래: 하이라이트, 오른쪽 아래: 거칠기. 이는 **도색 함수의 전면 슬라이스 도식**이며, 실제 GLB 렌더는 `preview/captures/`를 참고한다.

## 소스 / 재생산

- `source/designed_skin_art.cjs` — Node.js, 외부 패키지 없는 설계형 아트 함수
- `source/build_floor.cjs` — R36KW GLB 빌드
- `source/bake_atlas.cjs` — 색상/노멀/ORM/높이 베이크 및 삼각형 UV 패딩
- `source/reallocate_floor.cjs` — 골반저 삼각형 우선 배분
- `source/pelvis_skin_anchor.cjs` — 중심 피부 스킨 보정
- `source/generate_artboard.cjs` — 아트 방향 4패널 시각화
- `source/glb_io.cjs`, `source/mesh_qem.cjs`, `source/surface_patch.cjs` — 빌드 의존성

```sh
# F11 저장소 아래에서 실행
cd experimental/xpz3d/f11/r36kw-designed-skin-20261128
node source/build_floor.cjs \
  ../r36kp/reference/R36HW_F11_CLOTHED.glb \
  ../r36kp/reference/F11_R36JB_GPT62_NUDIST_CLEAN_ANATOMY_MASTER.glb \
  scratch/new_build --atlas=2048

node source/pelvis_skin_anchor.cjs \
  scratch/new_build/R36KW_2088_DESIGNED_ART.glb \
  scratch/new_stable

node source/generate_artboard.cjs
node serve.cjs
# http://127.0.0.1:9405/r36kw-designed-skin-20261128/preview/index.html
```

코드는 GPT 내부 Linux/Node.js에서 설계·단위 테스트한 뒤, 원본 GLB가 있는 연결된 Windows 컴퓨터에서 **Node.js로만** 최종 바이너리 빌드했다. Windows에서 Python은 실행하지 않았다.

## 실제 대시보드 비교

`preview/index.html`: R36KW 설계형 아트+안정 스킨(기본) / R36KW 아트 원형 / 기존 R36KV / 고밀도 참조 / 원래 R36HW 의복 모델 비교. 0°/18°/35° 허벅지 벌림, 2048 PNG 확대, **컬러 텍스처 단독 보기(조명과 노멀 제외)** 지원.

WebGL 브라우저에서 0°·35° 모두 GLB 로딩 성공, GPU 오류 0, 두 2,088△ 모델 동시 표시 시 4,176△/12 draw calls. `preview/BROWSER_REPORT.json` 및 `preview/captures/`에 실제 측정값과 이미지를 보존한다.

## 미완료 문제 및 배제 조건

- 골반 중앙의 실제 기하학적 틈과 극히 각진 면은 텍스처·스킨만으로 제거할 수 없다. 대시보드에서도 **여전히 관찰된다**.
- 브라우저 조명 아래에서는 이번 설계형 도색 경계가 일부 옅게 보인다. 수작업으로 그린 R36HW 의복과 동일한 완성도라고 평가하지 않는다.
- 자동 베이크한 2048 텍스처와 63본 골격이 실제 Silent Storm 엔진 재질·동작에 맞는지는 미검증이다.
- 이전 R36KV 및 기존 R36KP 안정 모델은 덮어쓰지 않았다. **최종 기본모델로 강제 전환하지 말 것.**
- 후속 단계: 중심부의 저폴리곤 슬리버/접힘 재설계, UV 스트레칭 완화, 원본 2D 스프라이트와 색상 대조, 색상 텍스처의 수작업 아트 보강.

**완료 판정:** 새 생산기와 실제 바이너리·시각화·GitHub 게시까지 완료. **아트 품질 목표는 부분 개선 상태**.
