# R138H — 원본 Silent Storm 네이티브 S2 렌더링에서 R36MK 실제 메시 전시

**2026-11-28 상태: Win32 S2 네이티브 GPU 렌더링 및 실화면 캡처 완료.** 별도 유사 렌더러, 생성형 이미지, Three.js 캡처가 아니다.

## 실제 생산물

- `captures/R138H_WARM_NATIVE_S2_WINDOW.png`: 로그인 데스크톱 Session 1의 `Silent Storm` 실제 전술 창 캡처(656×519). 원본 UI와 메시가 함께 보인다. **외관 최종 승인 아님**.
- `output/R36MK_R138H_WARM_PALETTE.xpzc`: 원본 R36MK의 2,100개 삼각형에서 추출한 실형상 좌표와 재질별 4단계 색조(총 24그룹)를 가진 독립 바이너리 76,016바이트. SHA-256 `cef088fa3a8e81a3722f1a0988df5158c8a5c216c310674e420ee9b4f2cc344f`.
- `output/R138H_WARM_HAIR_ATLAS_256.png`: 원본 GLB의 256×256 녹색 머리카락 아틀라스를 결의 밝기를 보존하며 갈색으로 재채색. 아틀라스 SHA-256 `fabd55f5985929980587def77305bead7002d513ec26a6d8bb3151d6c2a05e39`.
- `source/glb_to_s2_palette.cjs`: 실제 GLB 정점·삼각형·UV와 내장 PNG를 읽고 S2용 패킷을 출력. Node.js 내장 모듈만 사용.
- `source/colorgrade_hair_glb.cjs`: 머리카락 아틀라스 보정본 GLB 생산. 원래 메시·본·UV 미변경.
- `source/XPZ3DS2CharacterR138E.h`: 원본 S2 `CMemObject::Create` 및 `IGameView::CreateMesh` 경로에 XPZC v1/v2를 연결하는 사용자 작성 헤더.
- `report/`: 모델·색상·해시 보고서.

원본 R36MK GLB SHA-256: `f587771e1998810e59ce23f6a4aca04173f31da7216bdee97221e09c9e5b5bf3`. R138H 보정 GLB SHA-256: `9b8e98cc88ee4cd78ec1394674c8fdd96efaad4d362b1588a9c4ba8bf11ef524`. 머리카락 평균 RGB (44,84,17) → (136,92,62).

## 실제 네이티브 실행 증거

- 기존 S2 소스의 Win32 x86 MSVC 네이티브 빌드에서 별도 실행 파일 `Game-r138g-native-R36MK-palette.exe` 생성. **이 실행 파일·원본 엔진 소스·라이브러리는 저작권상 GitHub에 게시하지 않음**.
- S2 창은 Session 1에서 실행했고, 프로세스 PID 26656(당시 로그)에 `R138G_NATIVE_S2_PALETTE_ATTACHED groups=24 tris=2100 scene=0561A0C0` 기록.
- 원본 S2의 3D 장면 및 UI 출력과 Windows 바탕화면 캡처를 통해 갈색 헤어 전시 확인.
- 캐릭터 위치는 지형에 가리지 않도록 택티컬 지도 위 별도의 갤러리 높이에 배치한 임시 구성. 사용자 세이브·원래 R138D 엔진 바이너리는 변경하지 않음.

## 현재 기술적 한계

현재 24그룹 렌더링은 **원본 PNG를 오프라인에서 삼각형별로 샘플링해 색상 버킷으로 전달**한다. 따라서 S2 GPU에서 피부 2048 텍스처·노멀맵을 UV 매핑하여 직접 샘플링하는 것은 아니다. 바인드 자세 대신 어깨 정점 가중치를 이용해 양팔을 내린 정적 포즈를 사용했지만 **S2 스켈레탈 애니메이션에 연결한 것도 아니다**.

추후 네이티브 S2의 재질 메시 경로(`NDb::CModel`, `IGameView::CreateSkin`)를 통해 실제 UV/스키닝 처리 연결이 필요하다. 현 `CMemObject` 단색 경로를 S2 최종 셰이더 동일화로 오인하면 안 된다.

## 로컬 작업 경로

`D:\daphne_auto\_xpz3d_launch_integration_20261117\r138g-s2-palette`
및
`D:\daphne_auto\_xpz3d_launch_integration_20261117\r138e-s2-character`.

이 GitHub 경로의 소스는 사용자 작성 어댑터만 포함한다. 원본 S2 C++ 전체 소스, 링커 라이브러리, 실행 파일은 포함하지 않는다.
