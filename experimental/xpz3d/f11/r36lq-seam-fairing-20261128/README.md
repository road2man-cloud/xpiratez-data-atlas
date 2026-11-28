# R36LQ — UV 경계의 컬러·접선 노멀 연속화 및 전신 캐릭터 생산

2026-11-28 · **두 GLB와 2048 컬러·노멀 PNG 4종 GitHub main 게시 완료** (GitHub Actions 실행 `46091347357`).

## 이번 단계의 실제 개선

- 기존 R36LP BALANCED를 기준으로 별도 2,100△ 전신 모델 `BALANCED`와 `SOFT`를 실제 생산
- 원본 GLB의 **정점·토폴로지·UV·스킨 가중치·63본·얼굴·헤어를 그대로 유지**
- UV 섬의 에지들이 실제 3D 위치로 동일한지 판별하고, 양쪽 접선 공간에서 나온 노멀을 **3D 모델 좌표로 변환해 평균 → 각 UV 섬의 접선 공간으로 다시 변환**
- 색상은 sRGB를 선형 밝기 공간으로 변환해 평균한 뒤 다시 sRGB로 인코딩
- 2048 아틀라스의 기존 피부색을 유지하기 위해 이음새 주변 폭 약 4픽셀에만 국소 보간
- WebGL 비교 뷰어의 노멀맵 슬라이더가 기존 GLB에 저장된 노멀맵 강도를 무시하던 문제도 R36LP 및 R36LO 뷰어에서 별도 수정

## 실제 게시 파일과 측정값

| 지표 | BALANCED | SOFT |
|---|---:|---:|
| GLB 크기 | 9,592,780 B | 9,616,084 B |
| 고유 3D 공유 에지 | 1,698 | 1,698 |
| 보정 대상 이음새 | 1,686 | 1,686 |
| 실제 변경 픽셀 | 1,245,256 | 1,197,823 |
| RGB8 평균 절대 색상 변화 | 0.483 | 0.434 |
| RGB8 평균 절대 노멀 변화 | 0.599 | 0.563 |
| 삼각형 | 2,100 | 2,100 |
| 골격 | 63본 | 63본 |

- BALANCED SHA-256 `6ba23bb953ffe77a72c103aa5f9d54bfd439ef97c60a4b5d19226be4dd899090`
- SOFT SHA-256 `8ac08e77516496157c585e6a57ef3ea5fd6ff043b3a0b577c31780ec7bb2ca36`
- 입력 GLB SHA-256 `126d099f07f5e5636c48764402b6abe73aeb2a19ca66bccc10ab10a60805151f`

생산 파일:

- `output/balanced/R36LQ_BALANCED_2100_FULL.glb`, `*_COLOR_2048.png`, `*_NORMAL_2048.png`, `*.report.json`
- `output/soft/R36LQ_SOFT_2100_FULL.glb`, `*_COLOR_2048.png`, `*_NORMAL_2048.png`, `*.report.json`
- `source/build_r36lq.cjs` — Node.js 생산기
- `preview/index.html` — 전신/골반 0°·35° 비교 뷰어
- `.github/workflows/xpz3d-r36lq-production.yml` — Node.js 자동 GLB 빌드 및 non-force GitHub 게시

## 중요한 한계 및 다음 작업

- 보정 대상 경계 1,686개를 처리했다는 사실은 **눈으로 보이는 삼각형 명암이 모두 개선되었다는 뜻이 아님**. 전신 카메라 0°·35° 캡처와 실제 표면 비교는 아직 미완료
- 결과 GLB는 기존 embedded texture를 유지하면서 새 color/normal atlas를 추가했으므로 크기가 증가함. 배포용 GLB 경량화는 다음 작업
- 2D 레퍼런스의 정확한 3D 실루엣은 측정할 수 없음. 명암 문제가 해결되어도 골반 중앙의 실제 형상과 곡률은 별도 개선 필요
- 다음 작업자는 먼저 R36LQ와 R36LP를 **동일한 카메라, 포즈, 조명**으로 0° 전신·35° 골반·흉부·얼굴에서 비교하고, 필요하면 기존 2,100△ 예산 안에서 중심부 삼각형을 재배분할 것
- 실제 S2 엔진에 동일하게 출력되는지 아직 미확인; Three.js 렌더를 S2 렌더러로 단정하지 말 것

이번 생산에는 사용자 PC에서 Python을 실행하지 않았다. GitHub Actions Node.js를 사용해 빌드하고 커밋했다.
