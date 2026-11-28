# R36LS — HW 계열의 2차 설계형 전신 피부 채색 (2026-11-28)

이 단계는 R36LR의 방향성 회화 텍스처에 **별도의 수작업 설계 스트로크 목록**을 덧씌워 실제 컬러·노멀·거칠기 아틀라스를 새로 생성하는 후속 개발이다. 기존 색상맵의 단순 평균이나 UV 이음새 보정이 아니다.

## 새로 실제 작성한 소스

- `source/paint_detail.cjs`: 신체 위치별 방향성 스트로크를 직접 설계한 데이터. 상체 윤곽, 어깨, 팔, 허리, 복부, 골반, 다리의 부드러운 음영·반사광 경로를 신체 바인드 공간에서 정의한다. 미세 입자와 거칠기 변화도 레이어에 포함
- `source/build_r36ls.cjs`: R36LR ART 전신 GLB를 바탕으로 2048 컬러·노멀·ORM 채색을 다시 만들어 새 전신 GLB에 임베딩하는 Node.js 생산기
- `preview/index.html`: 0°/35° 전신 및 확대 등 기존 비교 UI를 계승하고 R36LS ART/SUBTLE와 R36LR ART를 비교하는 3D 뷰어 소스
- `.github/workflows/xpz3d-r36ls-production.yml`: Node.js GitHub Actions 자동 생산 및 main 비강제 게시

## 생산 원칙

- 원본 GLB: `r36lr-authored-paint-20261128/output/art/R36LR_ART_2100_FULL.glb`
- 전체 캐릭터 2,100삼각형 = 몸체 1,132 + 머리·헤어 968
- 기존 63본, UV, 스킨 웨이트, 텍스처 투영 좌표 및 전신 메시 유지
- 골반 또는 중앙의 독립적인 부품을 추가하지 않음
- source palette를 건드리지 않고 **기존 색상 위에 방향성 그림자를 새로 그리는** 처리
- 이후에도 S2 렌더러와 동일하다고 주장하지 않음

## 예상 출력 경로 (빌드 완료 확인 필요)

- `output/art/R36LS_ART_2100_FULL.glb` + 같은 이름의 컬러·노멀·ORM 2048 PNG + `.report.json`
- `output/subtle/R36LS_SUBTLE_2100_FULL.glb` + 같은 이름의 컬러·노멀·ORM 2048 PNG + `.report.json`

실제 생산 수치와 SHA-256은 **새 GLB가 main에 게시되고 보고서가 확인된 후에만** 완료 수치로 기입한다. Node.js 22, Python 불필요.


## 실제 생산 완료 결과 — Actions 기록

- 회화 생산 실행: [46126010927](https://github.com/road2man-cloud/xpiratez-data-atlas/actions/runs/46126010927) **성공**
- 경량화 생산 실행: [46126110437](https://github.com/road2man-cloud/xpiratez-data-atlas/actions/runs/46126110437) **성공**
- R36LS ART: `output/art/R36LS_ART_2100_FULL.glb` (18,518,060 B), SHA-256 `be062bd32b86b7ca555993bfe498ca3cda479e68da5905f573d45c75b1110079`
- R36LS SUBTLE: `output/subtle/R36LS_SUBTLE_2100_FULL.glb` (18,348,552 B), SHA-256 `fdba1b29fd611292d8bc158dd8e513ba3ad7f99d66becf6a07441e02954ebe2e`
- `output/compact/R36LS_ART_2100_COMPACT_FULL.glb`: **5,546,716 B**, SHA-256 `c899da4b31d6a560ef03e2b67b1e6e6325d9228651ebfdd5edd12ec5163f64d1`
- `output/compact/R36LS_SUBTLE_2100_COMPACT_FULL.glb`: **5,377,208 B**, SHA-256 `31d1d90eecdf9576db11dcd90acafc5bbf00b83b501843fdb1564f64739b616b`

| 측정 항목 | ART | SUBTLE |
|---|---:|---:|
| 새로 채색한 픽셀 | 1,241,497 | 1,071,473 |
| 평균 절대 색상 변화 RGB8 | 1.970 | 1.443 |
| 노멀 변경 픽셀 | 3,476 | 3,516 |
| 거칠기 변경 픽셀 | 595,394 | 134,388 |
| 삼각형 / 골격 | 2,100 / 63본 | 2,100 / 63본 |
| GLB 경량화 비율 | 70.05% 감소 | 70.69% 감소 |

경량화는 이전 버전에서 누적된 **참조되지 않는 PNG 및 텍스처 객체 10개씩 제거**하는 무손실 바이너리 재패킹이며, 조명/3D 렌더 스크린샷 동일성까지 검증됐다는 의미는 아니다. GLB 뷰어는 경량 버전을 기본으로 불러오게 변경했다.

이전의 ART 색상 변경량보다 이번 2차 회화의 변화량이 작다. 이를 곧바로 개선의 정량적 품질 점수로 해석하지 않는다. 목표 이미지와의 동일 조건 전신 0°·35° 외관 비교는 아직 남아 있다.

## 한계와 우선순위

R36LS는 회화적 표면 묘사 증가를 목표로 하지만 토폴로지 자체를 바꾸지는 않는다. 2,100△ 전신의 거시적 형상 한계를 근본 해결한 것으로 보고하지 않는다. 사용자가 제공한 목표와 실제 0°·35° 외관 비교 및 게임 출력 기준 피부색 비교도 별도 검토가 필요하다.
