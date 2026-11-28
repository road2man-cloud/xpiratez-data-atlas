# R138J — R36HW N4 네이티브 S2 정적 연결 어댑터

## 실제 생성 자산

- 원본 R36HW의 N3 직접 편집 후 N4 재질/노멀 개선 GLB: **2076 삼각형, 63본 유지**
- Node.js GLB→XPZC 생산기: `source/build_native_packet.cjs`
- 실제 생성 XPZC: `output/R36HW_N4_STATIC_XPZC.bin` (74,912바이트, 9개 네이티브 그룹)
- 저장소 Actions: `.github/workflows/xpz3d-r138j-hw-n4-packet.yml`
- 별도 R138J 네이티브 컴파일 자동화: `source/PREPARE_R138J_NATIVE.ps1`

## 실제 네이티브 빌드

2026-11-28 Windows MSVC Win32 로컬 컴파일·링크 성공. 기존 R138E C++ 소스/헤더를 **별도 R138J 디렉터리에 복사한 뒤**, 고정값 2100을 실제 패킷의 `1..2100` 범위로 바꾸고 완료조건 `nsum==hdr.triangles`를 사용한다.

- 새 실행 파일: `D:\daphne_auto\_xpz3d_launch_integration_20261117\r138j-hw-n4-native-20261128\Game-r138j-native-R36HW-N4.exe`
- Win32 exe: **7,367,680바이트**, SHA-256 `7de00f74de64203af6819a87a6eb826766fa4d2bc0954f778c41ec69e6f0daa7`
- 원본 S2 엔진 코드·기존 R138E 실행파일은 변경하지 않았다.
- `reports/R138J_NATIVE_WINDOWS_BUILD.json`에는 확인된 컴파일 영수증을 남긴다.

**구현 범위 구분:** 네이티브 S2 렌더러에 실제 모델 삼각형을 전달할 수 있는 Win32 전용 실행 파일과 XPZC를 생산했다. 이 시점에 R138J의 **실제 S2 창 캡처나 렌더 프레임은 아직 확인하지 않았다**. S2 CMemObject 정적 경로이므로 **UV·PBR 노멀 텍스처·63본 실시간 변형은 표시하지 않는다.** R36HW N4 GLB에서 63본이 유지된다는 사실과 엔진에서 63본을 스키닝한다는 사실은 다르다.

## 향후 주요 개선

S2 원본 `IGameView::CreateSkin(NDb::CModel*, CFuncBase<NAnimation::SSkeletonPose>*)` 및 `IGameView::CreateMesh(NDb::CModel*,...)` 경로를 이용해 CMemObject를 제거할 것. 먼저 NDb::CModel의 실제 데이터 생성·로딩 API를 찾아 UV/정점법선/텍스처/본 가중치를 전달하는 모델 어댑터를 만든 뒤 실제 화면으로 검증할 것. 또 R36HW 의복 유래 실루엣과 가려진 피부 복원은 여전히 미완료다.
