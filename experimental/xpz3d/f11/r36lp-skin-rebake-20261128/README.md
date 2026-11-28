# R36LP — 연속 피부 컬러·노멀 2048 재베이크

2026-11-28. **전신 GLB 2종 생산 및 GitHub main 게시 완료**. 기존 R36LO FRONT DEFINED를 그대로 보존하고 새 피부 색상맵/노멀맵을 GLB 안에 넣었다. 별도 중심부 오버레이, 새로운 골격, 삼각형 추가는 없다.

## 실제 파일
| 후보 | 전체 GLB 크기 | SHA-256 |
|---|---:|---|
| BALANCED | 6,868,356 B | `126d099f07f5e5636c48764402b6abe73aeb2a19ca66bccc10ab10a60805151f` |
| GENTLE | 6,840,216 B | `9ce7f8019b9d99d97cf227fe168fa48830704e4b95659c9f004cf9b29881b6f2` |

- `output/balanced/R36LP_BALANCED_2100_FULL.glb`, 색상 PNG, 노멀 PNG, .report.json
- `output/gentle/R36LP_GENTLE_2100_FULL.glb`, 색상 PNG, 노멀 PNG, .report.json
- `source/build_r36lp.cjs`: PNG 디코드/인코드, UV 안쪽 재베이크, 세계좌표 피부 명암/노멀 보정, GLB 출력까지 Node.js
- `preview/index.html`: R36LP 2종 / R36LO 원본 동기식 전신·골반 비교
- `.github/workflows/xpz3d-r36lp-production.yml`: GitHub Actions 자동 빌드 및 main 게시

## 이번 실제 개선
- 새 컬러/노멀 2048² 텍스처를 각각 생성했고 GLB로 다시 임베딩
- 골반 중심부 마스크 내 **451,996 픽셀** 변경
- 색상 수치는 의도적으로 약하게 유지해 기존 스프라이트 기준 피부색 보존: RGB8 평균 변화 BALANCED `[+0.682,+0.491,+0.339]`, GENTLE `[+0.358,+0.301,+0.245]`
- RGB8 최대 변경량 BALANCED `[3,2,2]`, GENTLE `[2,1,1]`
- 노멀맵의 강도 및 미세 굴곡을 개별 옵션으로 제작
- **전신 2,100△ = 머리·헤어 968 + 몸체 1,132, 63본 스킨 그대로 유지**
- 2048 아틀라스의 기존 삼각형 UV를 따라 변경. 원본 2100△ GLB를 덮어쓰지 않음.

## 별도로 명시하는 미완료 작업
- 0°/35° 실제 브라우저 캡처 비교와 Silent Storm 2 엔진 피부색 정합성은 아직 확인하지 않았다.
- 컬러 변화는 매우 미세하므로 픽셀 수정량만으로 목표 이미지 수준을 달성했다고 볼 수 없다.
- 중앙부 실제 형상은 이전 R36LO 그대로이므로 형상 자체의 부족함은 후속 메시 재배분이 필요하다.
- 대시보드 HTML은 게시했지만 실제 GitHub Pages HTTP 실행/GLB 로딩 확인은 미실시.

## 재생산
```sh
node experimental/xpz3d/f11/r36lp-skin-rebake-20261128/source/build_r36lp.cjs \
  experimental/xpz3d/f11/r36lo-adaptive-curvature-20261128/output/R36LO_FRONT_DEFINED_2100_FULL.glb \
  scratch/r36lp-balanced balanced
```

본 세션은 로컬 Windows Python을 사용하지 않았다. Node.js 22 기반 GitHub Actions에서 전신 GLB 산출물을 생성해 게시했다.
