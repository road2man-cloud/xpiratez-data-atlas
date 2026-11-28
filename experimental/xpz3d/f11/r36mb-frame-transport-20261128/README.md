# R36MB — 실제 이미지 노멀을 새 곡면의 탄젠트 좌표에 재정렬 (2026-11-28)

## 목표

기존 R36LX는 32개 영역에 분산 투영한 이미지 디테일과 국소 노멀을 가졌다. R36LY/R36LZ가 실제 메시 정점과 노멀·탄젠트를 수정하고 R36MA가 UV 경계를 보정했지만, **원본 이미지의 접선 공간 미세 노멀 방향을 옛 프레임에서 새 프레임으로 이송하는 명시적인 단계**가 남아 있었다. 이 버전에서는 원본 이미지 노멀의 방향을 실제 3D 바인드 공간에서 변환한 뒤 수정된 R36MA 메시의 탄젠트 공간으로 다시 기록한다.

단순히 RGB 밝기를 바꾸거나 명암 붓질을 추가하지 않는다. **이미 존재하는 이미지 픽셀 정보를 사용해 새 메시 곡률에 맞춘 표면 방향을 다시 생성**하는 작업이다.

## 실제 구현 소스

- `source/build_r36mb.cjs` — R36LX/R36MA 전신 GLB 대조, 동일 UV·삼각형 인덱스·스킨 웨이트 확인, 3D 탄젠트 프레임 사이 노멀맵 이송, 2048 이미지 갱신, R36MA의 실제 공유 UV 모서리 기반 재베이크 수행
- `.github/workflows/xpz3d-r36mb-frame-transport.yml` — GitHub Actions Node.js 22 ART/SUBTLE×FLOW/GUARDED 4종 자동 생산, 이미지 PNG·보고서·경량 전신 GLB 게시

## 입력

- 이미지 원천: `../r36lx-polygon-texture-20261128/output/compact/R36LX_ART_POLYGON_DETAIL_2100_COMPACT_FULL.glb`
- 실제 수정 메시·색상: `../r36ma-seam-rebake-20261128/output/compact/R36MA_ART_FLOW_2100_COMPACT_FULL.glb`
- SUBTLE, GUARDED에 대해서도 동일 방식으로 실행한다.

```bash
BASE=experimental/xpz3d/f11
ROOT=$BASE/r36mb-frame-transport-20261128
node "$ROOT/source/build_r36mb.cjs" \
 "$BASE/r36lx-polygon-texture-20261128/output/compact/R36LX_ART_POLYGON_DETAIL_2100_COMPACT_FULL.glb" \
 "$BASE/r36ma-seam-rebake-20261128/output/compact/R36MA_ART_FLOW_2100_COMPACT_FULL.glb" \
 "$ROOT/output/ART_FLOW" 0.72
```

## 출력 파일

- `output/ART_FLOW/R36MB_COLOR_2048.png`
- `output/ART_FLOW/R36MB_NORMAL_2048.png`
- `output/ART_FLOW/R36MB_FRAME_ROTATION_HEAT_2048.png` — 각 UV 픽셀에서 실제 메시 노멀 방향 변화량을 색상으로 보여주는 작업용 지도 (모델 재질로 포함하지 않음)
- `output/ART_FLOW/R36MB_FRAME_ALIGNED.report.json`
- `output/compact/R36MB_ART_FLOW_2100_COMPACT_FULL.glb`
- 나머지 3개 변종도 같은 구조다.

## 조형과 재질 보존 조건

- 몸체 1,132△, 얼굴·헤어 968△, 전신 2,100△, 63본, 기존 스킨 웨이트·UV·정점 위치는 변경하지 않는다.
- 입력 R36LX와 R36MA에서 동일한 삼각형·정점 인덱스 구조를 사용해야 한다.
- 이송 강도는 기본 0.72이며, 텍스처 채널별 최대 변화는 38 RGB8로 제한한다. 미세 이미지 방향을 완전히 덮지 않기 위한 제약이다.
- 곡률이 달라진 실제 삼각형에서만 원래 이미지 노멀을 3D로 변환하여 새 삼각형 탄젠트 공간으로 이송한다.
- 이어서 R36MA의 **물리 공유 모서리 ↔ 분리된 UV 차트** 대응에 맞춰 색상 및 이송 노멀을 재보정한다.
- 새 재질에는 새 2048 컬러/노멀을 연결한다. 기존 ORM 등 기타 텍스처는 그대로 둔다.
- 원본 사진의 RGB 원본, 높이 지도 등 비공개 참조 자산은 GitHub에 올리지 않는다.

## 성공과 미완료 구분

이 문서의 소스 작성·워크플로 게시와 실제 GLB/PNG 생산 성공은 별개다. 모델 생산 수치, SHA-256, 게시 여부는 GitHub Actions 실행 결과와 해당 `output/` JSON을 확인한 후 확정한다.

실제 S2 엔진에서의 광학적 모습, 0°/35° 확대, 사용자 목표 이미지와의 구조적 일치는 현재 보장되지 않는다. 노멀의 방향 일치는 메시/텍스처 좌표 변환의 정합성을 개선하지만, 원본 사진에서 **물리 깊이를 측정**하거나 새로운 폴리곤을 만든 결과는 아니다.

## 후속 실질 작업

R36MB 결과의 실제 이미지 노멀·메시 곡률 조화가 충분하지 않다면, R36LX의 32개 원천 구역을 각 면의 3D 면적/곡률에 맞춰 비균등하게 분산하는 방식과 정점 재배치를 병행한다. 색상 변화량만으로 성공을 판단하지 않는다.
