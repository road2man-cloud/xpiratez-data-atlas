# R36KV - 공유 UV 경량화 / 실제 GLB 2종

작업일: 2026-11-27. R36KU 생산 커밋 `d2b576f59ddd9388ec4aff1180c1542d6451fb69`을 입력으로 사용했다. 원본 삼각형 코너 속성은 함께 제공된 R36KS와 대조했다. **새 외형이나 고밀도 원본 복원 작업이 아니라, R36KU의 표면 디테일을 유지하는 경량화 작업이다.**

## 바로 열기

[전체 번들 ZIP](R36KV_COMPLETE_BUNDLE.zip?raw=1) · [오프라인 비교 HTML](preview/index.html?raw=1)

[1024 GLB](output/R36KV_F11_SHARED_UV_1024_2100TRI.glb?raw=1) · [512 GLB](output/R36KV_F11_SHARED_UV_512_2100TRI.glb?raw=1)

HTML은 모델 3개와 three.js를 내장한다. 다운로드한 HTML 하나를 직접 열면 된다. 인터넷, CDN, 로컬 HTTP 서버가 필요 없다. 왼쪽 R36KU 1024와 오른쪽 R36KV 1024/512를 같은 카메라와 조명으로 비교한다. 얼굴/팔/전신, 색상만 보기, 디테일 끄기, 와이어, 합성 관절 포즈를 제공한다.

## 실제 생산 결과

| 항목 | R36KU | R36KV |
|---|---:|---:|
| 삼각형 | 2,100 | 2,100 |
| 본 | 63 | 63 |
| 정점 레코드 | 4,707 | 1,837 |
| 정점/인덱스 속성 바이트 합 | 363,980 | 145,252 |
| 피부 보강 UV 영역 | 1,120 | 116 |
| 1024 GLB 바이트 | 1,063,816 | 870,632 |
| 512 GLB 바이트 | 737,076 | 527,200 |
| 내장 이미지 | 9 | 9 |

정점 레코드 60.97% 감소. 실제 GPU 메모리 사용량, 게임 FPS 개선율은 측정하지 않았다. R36KS의 1,249정점보다는 여전히 588개 많다. 필요한 UV 경계와 탄젠트 분리까지 무조건 제거한 결과가 아니다.

## 구현한 변경

`build_r36kv.py`는 xatlas 0.0.11로 얼굴, 손목, 목/팔/손가락 등 기존 피부 보강 부위의 UV를 공유 영역으로 묶는다. 인접 면이 하나의 정점을 공유하도록 재구성하되, 기존 POSITION, NORMAL, JOINTS_0, WEIGHTS_0, COLOR_0 및 원래부터 있던 UV는 삼각형 코너별로 동일하게 유지한다.

R36KU의 같은 결정적 rest-space 표면 함수를 새로운 UV에 재베이크한다. 영역 내부에는 공통 샘플링 폭을 사용하여 면마다 필터 폭이 바뀌던 문제를 줄인다. 노멀은 새로 내보낸 탄젠트 기저에 맞춰 변환한다. 탄젠트는 각도 가중 방식이며 MikkTSpace와 동일하다고 주장하지 않는다. 명시적인 TANGENT를 존중하는 glTF 렌더러가 대상이다.

헤어 정점은 882개에서 207개로 줄었다. 헤어의 색/노멀/거칠기 이미지는 그대로이고, 공유 탄젠트를 사용한다. UV의 방향성이 반대인 부분은 분리하여 잘못 합쳐지지 않게 했다.

512판은 2배 해상도에서 샘플링한 뒤 평균 노멀을 정규화하여 축소한다. 초기 단일 샘플 빌드에서 샘플 중심이 들어가지 않던 작은 면 5개가 있었고, 최종 2배 샘플링 단계에서는 대상 피부 1,120개 면 모두 샘플을 얻었다. 이것이 512 최종 텍스처에서 모든 면마다 독립 텍셀이 존재한다는 뜻은 아니다.

## 보존 범위

원본 R36KS의 모든 삼각형 코너의 기존 속성, 본 계층, inverse-bind 행렬 값, 노드, 장면과 기존 애니메이션 데이터는 보존했다. R36KU의 재질 설정 전체를 그대로 유지했다. 접근자 번호와 정점 인덱스는 재패킹으로 달라질 수 있다.

내장 이미지 9장 중 7장의 원본 바이트를 보존했다: 원래 이미지 5장 + R36KU 헤어 노멀/거칠기 2장. 바뀐 것은 새 UV에 맞게 재베이크한 피부 보강 노멀/거칠기 2장이다. 몸통/어깨/다리 primitive 7~11의 속성과 재질은 건드리지 않았다.

## 실제 비교 결과

`preview/RENDER_REPORT.json`은 headless Microsoft Edge / three.js r170 / file:// 실행 결과다. 모델 3개 로드와 63본/2,100삼각형 확인, JavaScript 오류 0개. 피부색 비교용 1024 얼굴 화면에서 조명 없는 RGB 픽셀 차이는 0이었다. PBR 비교는 얼굴 최대 채널 차이 2/255, 팔 3/255, 전신 2/255였다. 해당 카메라/조명/포즈에서의 결과이며 모든 장면이나 게임 엔진의 일치를 보장하지 않는다.

실제 캡처: [얼굴](preview/R36KV_COMPARE_HEAD.png) · [팔](preview/R36KV_COMPARE_ARM.png) · [전신](preview/R36KV_COMPARE_FULL.png) · [색상 비교](preview/R36KV_ALBEDO_COMPARE.png) · [512](preview/R36KV_COMPARE_512.png) · [합성 포즈](preview/R36KV_POSE_70_32.png).

GLB Validator 오류는 두 파일 모두 0개, 경고는 각 30개다. 기존 몸통/다리의 런타임 탄젠트 생성, 스킨드 노드 계층, 0가중치 슬롯의 관절 인덱스 관련 경고는 남아 있다. 원본 헤어의 UV 면적이 0인 면 14개도 남아 있으며 안전한 탄젠트 대체 기저를 사용한다. UV 원형 자체를 수정한 것은 아니다.

## 재생산

```powershell
python -m pip install -r requirements.txt
# 번들에 입력 파일이 포함되어 있으므로 다음 준비 명령은 선택 사항이다.
python prepare_r36kv.py
python build_r36kv.py
npm install --prefix viewer_deps --no-audit --no-fund three@0.170.0 esbuild@0.24.0 gltf-validator@2.0.0-dev.3.10
python build_preview.py
node validate_glb.cjs
# Microsoft Edge + Playwright가 있는 환경:
python review_r36kv.py
python publish_r36kv.py
# GitHub main에 아직 이 버전 경로가 없을 때만 실제 게시:
python publish_r36kv.py --publish
```

빌드는 R36KU/R36KS 입력 SHA-256을 고정한다. 입력 목록은 `input/SOURCE_RECEIPT.json`. 실제 환경/파일 해시는 `MANIFEST_R36KV.json`. 업로더는 기존 R36KV 경로를 덮어쓰지 않고 현재 main 위에 새 트리를 만들며 force push를 사용하지 않는다.

## 완료하지 않은 것

S2/S3 실제 게임 설치/애니메이션/프레임레이트 시험, 게임 실행폴더 변경, 6,044삼각형 고밀도 공여 메시의 확보와 복원, 몸통-다리 위상 접합, 모든 포맷 경고 제거는 수행하지 않았다. GitHub 업로드와 GitHub Pages 배포는 별개이며 Pages 배포 완료를 주장하지 않는다.

제작 공간은 `C:\mnt\data\r36kv_work`이다. ChatGPT 내부 컨테이너의 외부 다운로드가 실패하여 별도 격리 Windows 작업공간으로 전환했다. 다른 작업공간/게임 설치폴더를 덮어쓰지 않았다.

## 다음 작업

다음은 원본 헤어의 면적 0 UV 14면을 명확히 분리하여 수정하고, 기존 몸통/다리의 노멀맵과 명시적 탄젠트 일관성을 개선하는 작업이다. 입력은 R36KV 1024/512를 사용하고 피부색/스키닝을 계속 보호한다. 실제 게임 경로를 연결하기 전에는 엔진 준비 완료로 표시하지 않는다.
