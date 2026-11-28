# R36MC — 사진 윤곽 가설을 이용한 실제 3D 중심부 재조형

## 이번에 실제 구현한 것

기존 R36LY의 소수 가우시안 홈/융기 대신, 사용자 목표 사진에서 손으로 식별한 여러 불규칙한 윤곽 경로를 **수정 가능한 2D 랜드마크**로 기록했다. 해당 경로를 기존 모델 바인드 좌표 X/Z에 대응시켜 **X/Y/Z 정점을 실제 이동**하고 표면 노멀과 탄젠트를 다시 구성한다.

- `source/landmark_hypothesis.json`: 좌우 비대칭 외곽·안쪽 경계·중앙 함몰·하부 접힘 등 8개 조절 가능한 윤곽 가설과 폭/깊이 후보
- `source/build_r36mc.cjs`: UV 경계에서 중복된 정점을 같은 물리 위치로 모아 함께 이동, 메시 면 뒤집힘/붕괴 방지, 재계산 법선·탄젠트, 전신 GLB 두 종류 출력
- `.github/workflows/xpz3d-r36mc-landmark-sculpt.yml`: GitHub Actions Node.js 22에서 ART/SUBTLE × SCULPT/GUARDED 4종 생산
- `preview/index.html`: **−Y를 전면, +Z를 위쪽**으로 하는 카메라를 명시하고, 같은 카메라에서 R36MB ↔ R36MC를 CLAY/텍스처 비교

## 확정된 첫 생산 실적

GitHub Actions: https://github.com/road2man-cloud/xpiratez-data-atlas/actions/runs/46132776930

| 지표 | ART SCULPT | ART GUARDED |
|---|---:|---:|
| 기존 몸체 변경 삼각형 | 211 | 211 |
| 이동한 고유 물리 정점 | 91 | 91 |
| 함께 이동한 UV 분할 정점 | 518 | 518 |
| 최대 이동 모델 단위 | 0.0161701 | 0.0139946 |
| 최소 삼각형 면적비 | 0.6926 | 0.8086 |
| 최소 면 법선 내적 | 0.7072 | 0.8988 |
| 전체 삼각형 | 2100 | 2100 |
| 골격 | 63본 | 63본 |

SUBTLE에도 동일한 기하 구조를 적용했으며, 각각 추가로 `_CLAY_` GLB를 생산했다.

## 실제 게시 경로

- `output/compact/R36MC_ART_SCULPT_2100_COMPACT_FULL.glb`
- `output/compact/R36MC_ART_SCULPT_CLAY_2100_COMPACT_FULL.glb`
- `output/compact/R36MC_ART_GUARDED_2100_COMPACT_FULL.glb`
- `output/compact/R36MC_ART_GUARDED_CLAY_2100_COMPACT_FULL.glb`
- SUBTLE에서도 동형 4개, 합계 8개 GLB
- `output/ART_sculpt/R36MC_SCULPT.report.json` 등 실제 SHA-256·이동량 JSON

## 현재 분명한 한계

- 단일 사진은 실제 모델 깊이를 제공하지 않는다. **랜드마크와 굴곡 수치는 조형 가설**이며 물리적 치수라는 뜻이 아니다.
- 2,100△ 예산은 지켰지만, **새 삼각형을 만들어 배분하거나 엣지를 다시 연결한 리토폴로지는 수행하지 않았다.** 이미 존재하는 211개 삼각형의 정점을 이동했다. 따라서 요구된 '폴리곤 예산 재배분'은 여전히 별도 작업이다.
- CLAY 모델에서는 몸체의 컬러/노멀맵을 제거했으며, 목표 이미지와 동일 시점의 화면을 자동 수치 비교한 결과는 없다.
- S2 엔진 결과는 아직 미확인이다. 'GLB 생산 성공'을 '목표 외관 성공'으로 승격하지 않는다.

## 다음 제작 지시

1. CLAY 정면/35도 비교로 큰 윤곽과 실제 겹침 구조가 맞지 않으면 기하를 우선 재설계.
2. 메시 2,100△ 예산 안에서 구체적인 삼각형 면적·밀도·엣지 방향을 재배치. 스킨 본/웨이트 보존.
3. `r36md-feature-texture-20261128` 작업은 기존 4×8 격자가 아니라 개별 윤곽/접힘에 대응하는 UV 이미지 패치를 실제 메시에서 추출해 관리.
4. 표면 원래 이미지에서 가져온 세부 정보와 새 구조의 노멀 방향을 맞추되 사진 명암을 강제로 깊이로 해석하지 말 것.
