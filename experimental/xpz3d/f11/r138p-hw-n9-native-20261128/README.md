# R138P — R36HW N9 네이티브 S2 연결 준비

실제 R36HW-N9 GLB(2,098삼각형, 63본)의 **정적 바인드 포즈 삼각형 2,098개**를 추출해 기존 네이티브 S2 브리지에서 사용하는 `XPZC` 10그룹으로 변환한다. UV·법선·피부 텍스처·동적 스키닝 정보는 이 패킷에 저장되지 않으므로 **최종 S2 품질을 나타내지 않는다.**

## 입력 및 산출물
- GLB: `r36hw-n9-direct-skin-front-20261128/output/R36HW_N9_DIRECT_SKIN_FRONT.glb`
- 생산기: `source/build_native_packet.cjs` (Node 22, 외부 패키지 불필요)
- 산출물: `output/R36HW_N9_STATIC_XPZC.bin`, `reports/R36HW_N9_STATIC_XPZC.json`
- 패킷 SHA-256: `729e88d0e68778a70933d0dc74fb75cd22330c13338f14f4951de4e7e1241a58`, 75,720 바이트
- 패킷: 10그룹 / 2,098삼각형

## 네이티브 Windows 작업
기존 R138J 별도 S2 빌드 실행 파일을 **복사**하고 N9 XPZC를 함께 저장하는 PowerShell: `source/PREPARE_R138P_N9.ps1`

사용자 PC 격리 작업 디렉터리:
`D:\daphne_auto\_xpz3d_launch_integration_20261117\r138p-hw-n9-native-20261128\`

완료: 스크립트 실행, N9 패킷 SHA 검사, 63본 출처 확인, 동일한 격리 S2 실행 파일과 패킷 배치, `R138P_STAGE_RECEIPT.json` 생성.

**미완료:** 실제 Win32 대화형 네이티브 창에 로딩·캡처, S2 UV·노멀맵 셰이더 경로, 실시간 63본 애니메이션. 기존 exe의 정적 브리지 코드 재사용으로, 새 런타임 셰이더 또는 스키닝이 구현된 것으로 간주하지 않는다. 원본 S2 엔진 파일/바이너리는 GitHub에 게시하지 않는다.
