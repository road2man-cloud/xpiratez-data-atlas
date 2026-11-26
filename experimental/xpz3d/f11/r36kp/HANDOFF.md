# R36KP F11 인계 및 긴급 복구 지시 (2026-11-27)

## GitHub에 실물로 업로드된 것
- `R36HW_F11_CLOTHED.glb` (SHA-256 `a0780ab8995e68036388754449cfb66891c8bbbb160ef18b04a730d3294db732`) — 외형 권위 원본
- `baselines/R36KK_F11_SEAM_AWARE_SKIN_1024_2100TRI.glb` (SHA-256 `a33df6ea166f5c08ab70d735f4c8caa150fc5810ed2bb7990247bd63a6ed3ff7`) — R36KP 직접 이전 단계 중 하나의 실제 GLB
- `baselines/build_r36kk.py`, `baselines/render_r36kj.py`, `build_tools/glb_io_r36kj.py`, `build_tools/compact_gltf.py` — 실제 제작 소스
- `README.md` 와 `manifest.json` — 제작 계보 및 SHA 명세

**아직 GitHub에 없는 것**: R36KO 완성 GLB 2종, R36KP 완성 GLB 2종, `build_r36kp.py`, R36KP 피부 텍스처 PNG 6개. 해당 파일이 GitHub에 있다고 주장하지 말 것. GPT 내부 산출물에 존재하지만 원격 전송 경로가 연결되지 않음.

## R36KP 내부 실생산 사실
- 품질형 1024 GLB 2,100△/63본 / SHA `285d9c17848992231da5ffc10ebc6d807b52da1e577c64147bb5408a53584829`.
- 경량형 512 GLB 2,100△/63본 / SHA `1a89353c3a2b15cf1e0073be2c72c2b962bd263622b3288e1f678c39e6112c04`.
- 중심 패치 40△, 중심 패치 정점 24개 후방/상방 재배치. 양측 허벅지 안쪽 상단 각각 5정점 조정, 완전 용접 미완료.
- 원본 R36HW 얼굴·헤어·눈·기존 비의복 부위 메시/재질을 변형시키지 않는 것이 필수.

## 다음 작업자의 우선 작업
1. 우선 R36KP GLB·R36KO GLB·`build_r36kp.py`의 GitHub 누락 해결. GitHub에 원본이 없는 상태에서 복구 완료라고 쓰지 말 것.
2. 기준색은 **스프라이트의 어두운 갈색**과 R36HW의 스프라이트 기반 피부 팔레트. R36KQ의 밝은 PBR 미리보기를 정답으로 채택하지 말 것.
3. R36HW 얼굴·헤어·손·눈·머리핀과 비의복 노출 피부의 기하/UV/COLOR_0/원본 PNG/material을 유지.
4. 중앙 골반은 후방(posterior)·상방(superior)으로 안쪽 연결되게 수정. 2,100△ 전투용 예산 유지.
5. R36JB 정밀 중심해부학 6,044△은 편집용 도너이고, 전투용 GLB에는 전체를 넣지 않음. 외곽은 폴리곤, 미세 표현은 Albedo/Normal/ORM.
6. 전신 관절 변형, S2/S3 게임 엔진 적용과 정확한 색상 정합은 완료되지 않았음.
7. 새 버전은 실생산 GLB → 렌더 → 검증 → GitHub 바이너리 SHA 확인 → 인계로 진행.

## 확보된 별도 내부 인계 번들
`XPZ3D_R36KP_GITHUB_HANDOFF_BUNDLE_20261127.zip` (GPT 내부 컨테이너). 이 파일은 **GitHub에 없는 상태**이며, 별도 파일 전송 전에는 GitHub 인계 완료 아님.
