# v.o2 rest 속성 조회

현재 설치본의 **정확히 일치하는** X-Piratez 2.1 규칙 파일을 직접 검사합니다. 게임 파일은 수정하거나 저장소에 업로드하지 않습니다.

```powershell
node tools/inspect-v2-rest.mjs --source "C:\Dioxine_XPiratez_o2.1\Dioxine_XPiratez\XPiratez" --query "위어드 갈"
```

`--source`는 `Ruleset/` 및 `Language/` 하위 폴더가 있는 **모드 루트**여야 합니다. 설치 구조에 따라 정확한 위치를 지정하세요. 내부 ID를 알고 있으면 `--query STR_...` 형식도 됩니다.

출력에 일치하는 모든 규칙 항목의 원본 ID, 규칙 섹션, 직접 지정된 `rest` 값, 동일 섹션 `refNode` 상속 추적, 해당 파일 이름을 제공합니다. `UNSPECIFIED`는 **false라고 판정하지 않습니다**. 본 도구는 규칙 정적 선언 분석이며 엔진 기본값·변신·전투 중 변경은 별도 확인 대상입니다.

`public/ruleset/manifest.json`에 기록된 **v.o2 전체 Ruleset 및 번역 원본 SHA-256/크기**가 일치하지 않으면 실행을 중단합니다. 룰셋 파일 일부만 제공되거나 다른 버전이면 추정 결과를 만들지 않습니다.
