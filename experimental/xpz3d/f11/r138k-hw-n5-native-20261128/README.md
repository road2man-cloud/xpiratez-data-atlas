# R138K — R36HW N5 네이티브 S2 연결 패킷

## 실제 완료
1. N5 GLB SHA-256 `428fb74aae696a6e904313c80d944ceb9a0564a5016453195818588f8e841702`로부터 실제 삼각형을 추출했다.
2. 기존 S2의 `XPZC` 정적 지오메트리 형식으로 **2,080삼각형/10그룹** 패킷을 빌드했다.
3. 파일: `output/R36HW_N5_STATIC_XPZC.bin`; SHA-256 `ef2f059134920c694d030621d1dba8d1c8bae7a92fe19a6361d150d8a5fcd64b`.
4. GitHub Actions는 패킷 검사와 게시를 수행한다.
5. Python을 사용하지 않는 독립 실행용 PowerShell `source/LAUNCH_R138K_NATIVE.ps1`을 제공한다.

## 로컬 기존 네이티브 S2 빌드
기존 R138E 네이티브 연결 코드를 별도 폴더로 복사한 R138J Win32 빌드가 성공했다. 생성한 `Game-r138j-native-R36HW-N4.exe`는 2,100삼각형 **고정 검사를 1~2,100 허용으로만 변경**하여 N5 패킷을 사용할 수 있다. S2 원본 바이너리는 변경하지 않았다.

격리 경로:
`D:\daphne_auto\_xpz3d_launch_integration_20261117\r138j-hw-n4-native-20261128\`

해당 폴더에는 N5 패킷을 설치했고 원본 EXE와 빌드 영수증의 SHA-256을 기준으로 사전검사를 수행했다. 결과:
- 패킷 75,072바이트
- 삼각형 2,080개, 그룹 10개
- PowerShell 실행 사전검사 성공
- 브리지 계정의 세션이 **Session 0**이라 실제 가시적인 S2 렌더링은 수행하지 못했다.

## 실행
사용자 로그인 데스크톱 세션(대화형 Session 1 등)에서 다음 스크립트를 실행하도록 설계되었다. 무창 서비스(Session 0)에서는 실제 렌더링 성공을 주장하지 않고 실행을 차단한다.

```powershell
& 'D:\daphne_auto\_xpz3d_launch_integration_20261117\r138j-hw-n4-native-20261128\LAUNCH_R138K_NATIVE.ps1' -Launch
```

실행 스크립트는 원본 저장게임을 수정하지 않으며, 기존 활성화 JSON과 네이티브 S2 런타임을 재사용한다. 실제 화면이 나타나고 `R138E_NATIVE_S2_CHARACTER_ATTACHED groups=10 tris=2080`가 출력되는지 별도 확인해야 하며, 소스만으로 렌더 성공으로 간주하지 않는다.

## 한계
이 네이티브 경로는 **정적 바인드 포즈의 삼각형 위치**만 전달한다. GLB에 포함된 미세 노멀맵/컬러 텍스처, 63본 동적 스키닝까지 유지하는 최종 경로가 아니다. 원본 API `NDb::CModel`, `NGScene::IGameView::CreateSkin` 등의 실제 리소스 적재는 미완료다. 제작 모델의 외관 승인도 별도 단계다.
