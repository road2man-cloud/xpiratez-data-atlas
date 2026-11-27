# R36KY — 사용자가 제공한 중심부 형상 이미지 기반 통합 메시 조형 후보

**상태:** 실제 R36KY GLB **5개**(보수/중간/강화 및 스킨 안정 후보), 2048 텍스처 4개, Node.js 생산기, WebGL 비교 대시보드 및 0°/35° 캡처. **최종 형상 승인 전 실험 후보**.

## 요청과 실제 변경
사용자는 중심해부학 메시가 첨부 이미지처럼 독립된 윤곽과 부피를 가진 구조여야 한다고 제시했다. 기존 R36KX는 삼각형의 단순화·배열만 정돈했으며, 화면 중심의 검은 음영 자체는 여전히 뚜렷했다.

이번 R36KY는 `source/reference_sculpt.cjs`로 **기존 단일 몸체 메시의 전면 중심부 정점 161개를 실제로 변형**한다.

1. 양측 연속 볼륨, 바깥 연결부, 중앙 홈을 만드는 얕은 3D 높이장 적용.
2. R36JB 고밀도 중심부 6,044△를 후방 +0.020, 상방 +0.026 정렬한 뒤 외부 피부 표면 근처에서만 일부 깊이 참조. 피부 뒤편 내부 표면을 억지로 튀어나오게 하지 않는다.
3. 새 별도 렌더 객체를 만들지 않고 **동일한 몸체 정점·면·스킨·63본 골격**에서 작업한다.
4. 각 이동은 인접 면의 방향·면적을 확인하며 독립적으로 백트래킹하므로 2,088삼각형과 폐쇄 메시를 유지한다.
5. 해당 조형을 기준으로 2048² 색상·노멀·ORM·높이 맵을 전부 재생산한다.
6. 사용자에게 기존 R36KX와 직접 비교할 수 있는 대시보드 제공.

| 후보 | 원본 조형 세기 | 중심부 유효 이동 정점 | 최대 이동 | 모델 |
|---|---:|---:|---:|---|
| 보수형 | 0.55 | 실측 보고서 참조 | 실측 보고서 참조 | `R36KY_SOFT_2088_CENTER_SCULPT.glb` |
| 중간형 | 1.0 | **161** | **0.0093** | `R36KY_BALANCED_2088_CENTER_SCULPT.glb` |
| 강화형 | 1.7 | **161** | **0.0158** | `R36KY_BOLD_2088_CENTER_SCULPT.glb` |

스킨 안정화를 추가한 `R36KY_STABLE_2088_CENTER_SCULPT.glb` 및 `R36KY_BOLD_STABLE_2088_CENTER_SCULPT.glb`도 제작하였다. 좌우 비교 기본값은 강화형 안정화 모델 대 R36KX이다.

## 모델의 실제 한계 — **완료로 오인하지 말 것**
- 제공한 단일 이미지에는 3D 깊이와 실제 크기의 계측 데이터가 없으므로, 모델은 **형태적 근사**이지 사진과 동일한 체적 스캔이 아니다.
- 0°와 35°의 실제 WebGL 캡처에서 형태 변화는 관찰할 수 있지만 **육안상 매우 미세**하다. 검은 공간과 저폴리곤 각진 실루엣도 계속 남는다.
- **단순 정점 이동만으로 사용자가 제시한 완전한 중심해부학 메시 윤곽을 만들었다고 주장해서는 안 된다.** 추후에는 전체 2,100△ 예산 안에서 상부/바깥쪽 삼각형을 추가로 줄이고 중심부의 국소 토폴로지를 재구성해야 한다.
- 옷·피부·형상 텍스처가 실제 Silent Storm 게임 엔진에 적합한지는 확인하지 않았다.

## 재생산
- `source/reference_sculpt.cjs`: 로컬 메시 폐쇄/면 방향 보존 3D 변형
- `source/floor_regularize.cjs`: 조형 전 메시 삼각형 정돈
- `source/build_floor.cjs`: 원본 GLB에서 Node.js로 재생산
- `source/pelvis_skin_anchor.cjs`: 골반 안정 스킨 적용
- `output/BOLD_GEOMETRY_REPORT.json`, `output/BALANCED_GEOMETRY_REPORT.json`, `output/SOFT_GEOMETRY_REPORT.json`
- `preview/index.html`: 카메라·와이어·컬러만·0/18/35° 비교
- `preview/captures/`: 실제 0/35° WebGL 캡처

```sh
node source/build_floor.cjs path/to/R36HW_F11_CLOTHED.glb path/to/F11_R36JB_GPT62_NUDIST_CLEAN_ANATOMY_MASTER.glb scratch/newbuild --variant=bold --atlas=2048
node source/pelvis_skin_anchor.cjs scratch/newbuild/R36KY_BOLD_2088_CENTER_SCULPT.glb scratch/newstable
node serve.cjs
```

Windows 로컬에서는 Python을 실행하지 않았다. 재현성을 위한 모든 생산 소스는 JavaScript이다. 기존 R36KP/R36KV/R36KW/R36KX는 덮어쓰지 않는다.
