# R36KU 실제 산출물 다운로드

실제 GLB·텍스처·뷰어·소스 36개 파일의 생산 커밋: `d2b576f59ddd9388ec4aff1180c1542d6451fb69` (main).

## 전체 묶음

[전체 재생산 번들 ZIP — 4,954,990바이트](R36KU_COMPLETE_BUNDLE.zip?raw=1)

ZIP에는 신규 GLB 2종, 텍스처 6장, 원본 R36KS GLB 2종, 제작 소스, 비교 캡처, 오프라인 뷰어, 빌드 보고서 및 인계 문서가 들어 있습니다.

SHA-256: `b3be5c9588d4a2d5827d750888dbc43936afac5633c9e5c8f2e0f349358813c1`

## 모델을 바로 받기

[1024 GLB — 1,063,816바이트](output/R36KU_F11_BALANCED_DETAIL_1024_2100TRI.glb?raw=1)

SHA-256: `03bc2a0830178dbaec1482500909f8be7d8ca3fbf061f9931696d367ba0fd99e`

[512 GLB — 737,076바이트](output/R36KU_F11_BALANCED_DETAIL_512_2100TRI.glb?raw=1)

SHA-256: `84496d92a60e0d7dba46639c3d1b6c9dc53a0f2086257c6d4a20e27953f39110`

두 GLB 모두 2,100삼각형, 63본, 정점 레코드 4,707개, 내장 이미지 9장입니다. GitHub의 바이너리 크기와 Git blob SHA를 제작본과 대조했습니다.

## 비교 뷰어와 실제 렌더

[독립 실행 HTML 비교 뷰어 — 3,559,546바이트](preview/index.html?raw=1)

다운로드한 HTML을 직접 열면 됩니다. 인터넷·CDN·로컬 서버 없이 동작합니다. R36KS 1024와 R36KU 1024/512 세 모델 및 three.js가 모두 내장되어 있습니다.

[얼굴·헤어 비교 캡처](preview/R36KU_COMPARE_HEAD.png) · [팔·손 비교 캡처](preview/R36KU_COMPARE_ARM.png) · [전신 비교 캡처](preview/R36KU_COMPARE_FULL.png) · [조명 없는 색상 비교](preview/R36KU_ALBEDO_PRESERVED.png)

## 실제 개선과 제한

얼굴·목·팔·손목·손가락에 미세 표면 노멀/거칠기를 추가했고, 기존 헤어 텍스처의 결로 헤어 노멀/거칠기를 만들었습니다. 기존 다섯 이미지, 원본 색상 값, 모든 삼각형 코너의 기존 속성과 리깅을 유지했습니다. 몸통·어깨·다리의 기존 재질은 변경하지 않았습니다.

새 디테일 UV 분리로 정점 레코드는 1,249 → 4,707로 늘었습니다. 삼각형 수는 같지만 동일한 GPU 비용이라고 주장하지 않습니다. 다음 개선 대상은 UV 차트 통합과 불필요한 정점 분리 감소입니다.

별도 공여 메시의 기록 `6044`를 전체 캐릭터가 6,000 → 2,100으로 줄었다는 근거로 볼 수 없습니다. 이전 65% 축약 설명을 정정합니다. 이번 작업은 원본 공여 메시 복원이 아니라 새 저폴리 표면 디테일 보강입니다.

GLB 포맷 검사 오류 0개, 경고 각 30개. headless Edge에서 file:// 뷰어 로드 및 실제 캡처 완료, JavaScript 오류 없음. S2/S3 게임 엔진 적용과 실제 애니메이션 검증은 미완료입니다. 게임 실행폴더는 수정하지 않았으며 GitHub Pages 배포 확인을 주장하지 않습니다.

[세부 인계·재생산 방법](README.md) · [1024 빌드 보고서](output/R36KU_1024_BUILD_REPORT.json) · [512 빌드 보고서](output/R36KU_512_BUILD_REPORT.json) · [전체 파일 해시](MANIFEST_R36KU.json)
