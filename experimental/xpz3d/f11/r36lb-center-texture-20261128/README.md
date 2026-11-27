# R36LB — 2,100△ 연속 메시 및 고해상도 피부 텍스처 개선

**2026-11-28 생산 결과** — R36LA 원본을 덮어쓰지 않는 신규 후보. 작성된 내용은 실제 Node.js 로컬 빌드 로그로 확인함. GitHub 업로드 상태는 바이너리/소스와 별도로 확인한다.

## 실제 제작 결과

- `R36LB_BALANCED_2100_SURFACE_FLOW.glb`: 3,689,864 bytes, SHA-256 `24a59294500d5c6aaae6cbb1bad14a0425d90a2e890625678fa667801f2bc7e2`
- `R36LB_BALANCED_SKIN_2100TRI.glb`: 신규 골반부 본 가중치 후보.
- `R36LB_SOFT_SKIN_2100TRI.glb`: 추가 부드러운 가중치 후보.
- Base Color 2048² PNG: 980,839 bytes
- Normal 2048² PNG: 1,660,407 bytes
- ORM 2048² PNG: 513,534 bytes
- Relief 2048² PNG: 1,290,927 bytes
- `GEOMETRY_REPORT.json`, `PRODUCTION_REPORT.json`, `BUILD_MANIFEST.json` 생산 완료.

## 변경된 생산기

R36LA `source/`를 복사한 후 비파괴 버전 분리.

- `reference_sculpt.cjs`: 중앙 양측 표면을 부드러운 비대칭 리지로 변형. 상하 이행부 연결. 141개 기존 정점 수정. 단일 폐쇄 메시, 별도 장식 메시 없음.
- `designed_skin_art.cjs`: 3D 위치 기반 미세 색 변조와 중앙 굴곡 음영, 하이라이트를 추가. 기존 설계 피부 팔레트 유지.
- `bake_atlas.cjs`: UV gutter의 대각선 경계를 0.92의 고정 barycentric 반경이 아니라 `1-1.5/span`으로 변경.
- `build_floor.cjs`: R36LB 버전 이름으로 GLB 및 생산 보고서 출력.
- `pelvis_skin_anchor.cjs`: 별도의 균형형/부드러운 본 가중치 출력.

## 정량적 빌드 결과

| 항목 | 결과 |
|---|---:|
| 머리/얼굴 삼각형 | 968 |
| 몸체 삼각형 | 1,132 |
| 전체 삼각형 | **2,100** |
| 바디 경계 에지 | 0 |
| 비매니폴드 에지 | 0 |
| 퇴화 삼각형 | 0 |
| 중심부 조각 수정 정점 | 141 |
| 중심부 최대 정점 이동 | 0.01062427 |
| 중심부 최소 국소 면적비 | 0.48776 |
| 연결 표면 | 닫힌 단일 피부 메시 |

## 빌드 실물 경로

`D:\daphne_auto\F11_Web_Review_ghpages_20261105\f11\r36ko-seam-integrated-20261127\github_publish_stage\experimental\xpz3d\f11\r36lb-center-texture-20261128\`

실행 오케스트레이터:
`D:\daphne_auto\F11_Web_Review_ghpages_20261105\f11\r36ko-seam-integrated-20261127\build_r36lb_20261128.cjs`

원본 입력:
- `R36HW-CLOTH-PANEL/R36HW_F11_CLOTHED.glb`
- `r36kp/reference/F11_R36JB_GPT62_NUDIST_CLEAN_ANATOMY_MASTER.glb`

Node.js만 실행했으며 Windows Python은 사용하지 않음.

## 확인되지 않은 사항

- 첨부 이미지와 정밀 일치 여부: **미확인** (사진은 실제 3D 스캔 데이터가 아님).
- 0°/35° 실제 시점 브라우저 비교: **미완료**.
- S2 게임 엔진 직접 적용: **미완료**.
- GitHub에 이 README 외 신규 GLB/PNG 전체 업로드: **별도 진행 필요**. 로컬 git CLI 푸시는 Git Credential Manager 인증 실패로 중단됨.
- R36LA 안정본은 덮어쓰지 않음.
