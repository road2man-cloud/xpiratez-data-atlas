# R36KW — 노멀맵 좌표 70면 보완 / 실제 GLB 2종

작업일: 2026-11-27. 입력은 R36KV 생산 커밋 `8fa18e9c436805b39b9638270fe35b855e5f5f85`의 1024/512 GLB다. 피부색과 메시 형상을 바꾸지 않고, 노멀맵에 면적 0인 UV를 사용하던 헤어 14면과 양쪽 다리 56면을 보완했다. 고밀도 공여 메시 복원본이 아니다.

## 바로 받기

[전체 작업물 ZIP](R36KW_COMPLETE_BUNDLE.zip?raw=1) · [오프라인 비교 HTML](preview/index.html?raw=1)

[1024 GLB](output/R36KW_F11_NORMAL_UV_REPAIR_1024_2100TRI.glb?raw=1) · [512 GLB](output/R36KW_F11_NORMAL_UV_REPAIR_512_2100TRI.glb?raw=1)

HTML 하나에 R36KV/R36KW의 두 해상도 GLB 4개와 three.js 렌더러를 넣었다. 받아서 직접 열면 인터넷·CDN·HTTP 서버 없이 file://로 동작한다. 좌측과 우측을 동일 해상도, 카메라, 조명으로 비교한다. 시점 선택, 노멀맵 토글, 조명 없는 색상 표시, 와이어, 합성 포즈를 제공한다.

## 실제 생산 결과

| 항목 | R36KV | R36KW |
|---|---:|---:|
| 삼각형 | 2,100 | 2,100 |
| 본 | 63 | 63 |
| 메시 프리미티브 | 12 | 12 |
| 정점 레코드 | 1,837 | 2,047 |
| 노멀맵 UV 면적 0인 면 | 70 | 0 |
| 1024 GLB 바이트 | 870,632 | 933,040 |
| 512 GLB 바이트 | 527,200 | 580,476 |
| glTF Validator 오류 | 0 | 0 |
| glTF Validator 경고 | 30 | 1 |

GLB SHA-256:

- 1024: `55f909dc9f2c3618be2ea325f773b76749e0fbfb37e025955b27f0c5dc1825a0`
- 512: `9be48c35c0f9c099ce86cf29ffc880df4ba204b9295eef708ca2f729503ed085`

경량화 버전이 아니라 노멀 표현의 정의되지 않은 구간을 보완하는 버전이다. 기존 R36KV는 그대로 보존한다.

## 실제 변경

기존 `TEXCOORD_0` 색상/거칠기 좌표를 그대로 두고 해당 부위에 `TEXCOORD_1` 노멀 좌표를 별도로 넣었다. 재질 수나 드로 콜 단위인 프리미티브 수를 늘리지 않기 위해 원래 노멀 아틀라스를 확장하고, 70개 면에만 패딩이 있는 독립 영역을 배치했다.

헤어 14면은 R36KV의 기존 노멀과 기존 탄젠트 기저를 새 기저로 재투영했다. 유효한 헤어 면의 탄젠트는 그대로다. 양쪽 다리 56면은 기존 노멀 UV가 퇴화되어 있었으므로, 과거 원형을 복원했다고 주장하지 않고 얕은 rest-space 표면 요철을 새로 부여했다.

몸통·어깨·다리에는 three.js 0.170.0에 포함된 MikkTSpace 구현으로 생성한 명시적 탄젠트를 넣었다. glTF 좌표 관례에 따라 W 부호를 뒤집으며, 코드의 근거는 같은 버전의 `BufferGeometryUtils.computeMikkTSpaceTangents`다. 기존 얼굴·팔 등 R36KV 공유 UV 디테일은 다시 만들지 않았다.

가중치가 정확히 0인 관절 슬롯 24개의 인덱스를 0으로 정리했다. 유효 가중치와 실제 영향을 주는 본 번호는 바꾸지 않았다. 위상 접합이나 메시 형상 보정은 수행하지 않았다.

## 보존 범위

모든 기존 삼각형 코너의 위치, 노멀, 색상, 기존 UV, 스키닝 가중치와 유효 관절 번호를 보존했다. 본 목록·계층, inverse-bind 행렬, 노드·장면 데이터도 유지했다. 접근자/정점 번호는 재패킹으로 달라진다. 형상과 피부색을 바꾸지 않았다는 것은 조명 반응까지 항상 같다는 뜻은 아니다.

이미지 9장 중 7장의 바이트를 그대로 유지했다. 변경된 두 장은 몸통/다리 노멀과 헤어 노멀이다. 그 두 장에서도 기존 아틀라스의 모든 픽셀을 새 이미지 안에 그대로 보관했다. 기본 색상 이미지, 기본 색상 인자, 거칠기·AO 이미지와 인자는 바꾸지 않았다.

**원래 색상 UV의 면적 0인 면은 의도적으로 남아 있다.** 이번의 70 → 0은 재질이 실제 노멀맵용으로 참조하는 UV의 수치이며, 모든 UV가 수정됐다는 의미가 아니다.

## 비용과 확인 범위

정점은 210개 증가했다. 1024판의 확장 몸통 노멀은 2048×1024, 512판은 1024×512이며, 헤어 노멀은 공통 512×256이다. 다른 텍스처 해상도는 그대로다.

이미지 면적에 RGBA8 4바이트를 곱한 밉 제외 추정 합계는 1024판 21,831,680 → 26,288,128바이트(+4.25MiB), 512판 6,103,040 → 7,413,760바이트(+1.25MiB)다. 이는 실제 GPU 할당량/VRAM/FPS 측정이 아니며 밉, 렌더러별 포맷, 드라이버 비용을 포함하지 않는다.

실제 headless Edge/three.js r170/file:// 캡처에서는 네 모델이 정상 로드되었고 JavaScript 오류가 없었다. 1024 얼굴·발·전신의 조명 없는 캔버스 비교는 RGB 차이 0이었다. 화면의 버전 라벨은 픽셀 비교에서 제외했다. 해당 포즈와 조명만의 결과이며 전투 애니메이션 검증이 아니다.

[렌더 보고서](preview/RENDER_REPORT.json) · [1024 빌드 보고서](output/R36KW_1024_BUILD_REPORT.json) · [512 빌드 보고서](output/R36KW_512_BUILD_REPORT.json)

[얼굴](preview/R36KW_1024_HEAD_PBR.png) · [발](preview/R36KW_1024_FEET_PBR.png) · [다리](preview/R36KW_1024_LEGS_PBR.png) · [전신](preview/R36KW_1024_FULL_PBR.png) · [색상만](preview/R36KW_1024_FULL_ALBEDO.png) · [합성 포즈](preview/R36KW_POSE_70_32.png)

남은 Validator 경고는 `NODE_SKINNED_MESH_NON_ROOT` 1개다. `UNUSED_OBJECT`, `IMAGE_NPOT_DIMENSIONS`는 별도의 정보 메시지로 남아 있다. 경고를 없애기 위해 원본 본 계층이나 눈 텍스처를 바꾸지는 않았다.

## 재생산

Python 3.11, Node.js, npm이 필요하다. GLB만 사용하는 데는 설치가 필요 없다.

```powershell
python -m pip install -r requirements.txt
npm ci --prefix viewer_deps --ignore-scripts --no-audit --no-fund
# 번들에는 입력 GLB가 포함되어 있다. 재다운로드가 필요할 때만:
python prepare_r36kw.py
python build_r36kw.py
python build_preview.py
node validate_glb.cjs
# Microsoft Edge와 Playwright가 설치된 환경에서만:
python review_r36kw.py
# 묶음만 생성:
python publish_r36kw.py
# 게시 경로가 아직 없을 때만, gh 로그인 후:
python publish_r36kw.py --publish
```

입력 SHA-256은 빌드가 강제 확인한다. 환경과 파일별 해시는 `MANIFEST_R36KW.json`, 재개 지시는 `HANDOFF_R36KW.md`에 있다. `mikktspace_stage.mjs`는 표준입력/출력으로 탄젠트 데이터만 주고받는다. MikkTSpace 실행은 빌드 단계이며 오프라인 뷰어에 불필요한 빌드 도구를 넣지 않는다.

## 미완료와 게시 상태

S2/S3 실제 게임 설치, 전투 애니메이션 실행, FPS 측정, 고밀도 원본 확보/복원, 몸통-다리의 완전한 위상 접합은 하지 않았다. GitHub 게시와 Pages 배포는 별개다. README 자체는 업로드 성공을 증명하지 않으며 `PUBLISH_RECEIPT.json` 및 실제 원격 커밋/바이너리 해시로 확인한다.

ChatGPT 내부 컨테이너의 외부 다운로드는 DNS 오류로 실패했다. 실제 제작은 별도 `C:\mnt\data\r36kw_work` 작업폴더에서 수행했다. 기존 게임 실행폴더와 다른 작업자의 소스는 수정하지 않았다. 게시 경로는 `experimental/xpz3d/f11/r36kw/`다.
