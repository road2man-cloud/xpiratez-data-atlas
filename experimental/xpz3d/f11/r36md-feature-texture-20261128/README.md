# R36MD — 비균등 구조별 UV 패치·노멀 재베이크

R36MC가 새로 조형한 실제 3D 표면을 입력받아, 기존 4×8 균등격자 대신 `landmark_hypothesis.json`의 윤곽곡선 8개를 기준으로 서로 다른 실제 UV 패치를 생산한다.

- `source/build_r36md.cjs`: R36MB 노멀 텍스처를 R36MC의 수정된 탄젠트 프레임으로 재이송, 물리적인 공유 UV 모서리를 재베이크, 실제 3D 좌표에서 가장 가까운 구조 분류 후 각 영역의 RGBA 컬러/노멀/마스크 크롭을 추출
- `.github/workflows/xpz3d-r36md-feature-texture.yml`: Node.js 22 자동 생산, ART/SUBTLE×SCULPT/GUARDED 4종 전신 GLB 및 2048 PNG와 구조별 패치 게시
- `output/<VARIANT>/R36MD_SEMANTIC.report.json`: 각 구조 영역이 담당한 삼각형 수, 실제 픽셀, UV 크롭 위치, 이미지 노멀 이송량 기록
- `output/compact/R36MD_<VARIANT>_2100_COMPACT_FULL.glb`: 기존 2,100△·63본 스킨 전체 캐릭터

**주의**: 이번 구조별 PNG는 게임 모델에 있던 기존 컬러/노멀 픽셀의 의미별 분리본이다. 레퍼런스 사진 원본을 그대로 투영한 것이 아니며, 구조별로 새로운 사진의 색채를 정교하게 재제작한 단계는 아니다. 비균등 분할 자체는 실제 구현했으나, 원본 사진과 시각적으로 닮았다는 판정은 아직 없다.

산출물의 실제 성공은 GitHub Actions 기록과 `output` 경로 확인 이후 확정한다.
