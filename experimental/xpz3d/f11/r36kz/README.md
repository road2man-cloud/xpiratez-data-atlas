# R36KZ — F11 오프라인 모델 선택·설치 준비 패키지

2026-11-27. 신규 캐릭터 조형이 아니라 검증된 R36KX/R36KY 생산 GLB를 실제로 묶어 배포하는 후속 버전이다. 모든 GLB의 기존 바이트는 변경하지 않는다. 입력 커밋과 SHA-256은 profiles.json에 고정되어 있다.

## 바로 사용

전체 묶음: [R36KZ_COMPLETE_BUNDLE.zip](R36KZ_COMPLETE_BUNDLE.zip?raw=1)

ZIP을 풀면 ready/ 아래에 네 가지 선택 모델이 각각 F11.glb로 준비되어 있다. F11.glb는 이 패키지의 설치 준비용 공통 파일명이며, 실제 게임 엔진이 요구하는 파일명이나 설치 경로라고 확인된 것은 아니다.

| 프로필 | 버전 | 삼각형 | 본 | 프리미티브 | 텍스처 규격 |
|---|---|---:|---:|---:|---|
| compact-1024 | R36KX | 2100 | 63 | 12 | NPOT 포함 |
| compact-512 | R36KX | 2100 | 63 | 12 | NPOT 포함 |
| pot-1024 | R36KY | 2100 | 63 | 15 | 모든 이미지 POT |
| pot-512 | R36KY | 2100 | 63 | 15 | 모든 이미지 POT |

기존 모델의 형상, 본, 색상 및 표면 디테일을 추가로 바꾸지 않았다. R36KX는 낮은 프리미티브 수, R36KY는 POT 규격이 장점이다. 둘 중 하나가 S2/S3에서 더 빠르다고 단정하지 않는다.

## 사용 명령 (Python 3.9 이상, 외부 라이브러리 불필요)

```powershell
python f11_deploy.py list
python f11_deploy.py stage pot-512 ./my-import-stage
python f11_deploy.py hash "C:\path\to\existing-model.glb"
```

실제 엔진 파일 위치를 알고 있고 게임을 종료한 경우에만 명시적으로 적용한다. 대상 파일명은 예시이며 자동 탐색하지 않는다. 아래의 SHA256은 기존 대상 파일의 정확한 해시로 교체해야 한다.

```powershell
python f11_deploy.py apply pot-512 --target "C:\path\to\existing-model.glb" --expect SHA256
python f11_deploy.py rollback --target "C:\path\to\existing-model.glb" --receipt "C:\path\to\.r36kz-TRANSACTION\receipt.json"
```

새 파일 생성은 --expect absent를 명시해야 한다. 기존 대상의 기대 해시 불일치, 다른 프로세스가 교체한 모델에 대한 복구는 거부한다. 같은 프로필의 재적용은 변경하지 않는다. 원본 백업과 적용 기록을 대상 폴더 옆에 보존하고 동일 볼륨의 임시 파일에서 교체한다. 비정상 종료 후 prepared 상태 기록이 남으면 현재 파일 해시와 백업을 확인해야 한다. 잠금은 이 도구의 동시 실행만 막으며 다른 프로그램의 파일 쓰기를 막지 못한다. 실제 게임이 실행 중일 때 사용하지 않는다.

## 실제 생산 범위

- models/의 실물 GLB 네 개, ready/의 설치 준비본 네 개 및 각각의 JSON 기록을 실제 생성했다.
- produce_ready_profiles.py는 실제 GLB를 사용해 격리된 임시 경로에서 교체/거부/복구를 수행한다.
- PRODUCTION_REPORT.json은 실행 결과다. 원본 교체와 복구가 바이트 단위로 일치했다.
- 동일 모델을 다시 제작하려면 python f11_deploy.py fetch 후 python produce_ready_profiles.py를 실행한다. 이미 모델이 포함된 ZIP에는 네트워크가 필요 없다.
- 실제 게임의 엔진 import, 렌더링, 애니메이션, FPS 및 경로 매핑은 아직 미확인. 게임 설치 폴더를 변경하지 않았다. 이번 버전은 모델 배포 및 안전한 파일 교체 도구다.
- 내부 가상공간에서 GitHub DNS 조회 실패를 확인하여 C:\mnt\data\r36kz_work 격리 Windows 작업공간에서 실물 생산했다. 기존 R36KX/R36KY 경로를 덮어쓰지 않는다.
