# R36HW F11 Athletic V26 — Balanced Center

V25의 V14 기반 단일 불투명 운동복 표면에 연속적인 중심 골과 좌우 곡률을 강화한 버전입니다.

## 생성 및 상태
- 소스: `source/build.cjs`
- 출력: `output/R36HW_F11_ATHLETIC_SUIT_V26_BALANCED_CENTER.glb`
- 보고서: `reports/build.json`
- 자동 제작: `.github/workflows/xpz3d-r36hw-v26-balanced-center.yml`
- 빌드 및 GLB 게시 여부는 Actions 실행과 실제 파일 존재로 별도 확인합니다.

## 변경된 형상 입력
- 중앙 골 깊이: -4.8 mm, 가우시안 가로 σ = 0.235
- 좌우 융기: +2.1 mm, U = ±0.43
- 변위 입력 상한/하한: -4.6 mm ~ +2.4 mm
- 이 값은 공간 감쇠 전의 함수 파라미터입니다. 실제 변위량은 보고서 `meanMoveMeters`, `maxMoveMeters`를 확인합니다.

## 보존 원칙
- V14 고정 커밋의 GLB를 기초로 생성
- 원래의 운동복 재질, 색상, 스킨과 63 관절 유지
- 별도 패널 및 피부 메시 전사 없음
- 고주파 노멀맵 증폭 없음
- UV 이음새 및 심한 삼각형 변형 검사
- 네이티브 S2의 육안 검토는 빌드 성공과 별개의 작업
