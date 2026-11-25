# R135-R4 실행 성공 기록

2026-11-17 14:55 KST: Windows 사용자 세션 1에서 `openxcom_R135_R4_UNVERIFIED_AMMO15_MED_WHIP_BACKSPACE.exe`를 게임 설치 경로에서 실행. 창 제목 `OpenXcom Extended 8.7.1 (v2026-11-17 R135-R4-AMMO15-MED-WHIP-BACKSPACE)`; `Responding=True`, 스레드 14개. 테스트 프로세스 PID 45772 종료.

2026-11-17 15:03 KST: `XPZ_R135_R4_START.cmd` 런처로 재시험. 스레드 일시 중단 자동 복구를 거쳐 10초 시점에 응답하는 창 확인. 진단 PID 20660 정리. 기존 게임 바이너리/세이브 덮어쓰기 없음.

설치된 후보: `C:\Dioxine_XPiratez_o2.1\Dioxine_XPiratez\openxcom_R135_R4_AMMO15_MED_WHIP_BACKSPACE.exe`
SHA-256: `511EAC3C579CDF329A8CA511FEBCFED50B728ADE85A330E5F4536B3229C14DA6` (27,227,961 bytes).

런처: `C:\Dioxine_XPiratez_o2.1\Dioxine_XPiratez\XPZ_R135_R4_START.cmd`와 `XPZ_R135_R4_START_RESUME.ps1`; 바탕화면 `XPZ R135-R4 실행.lnk`.

빌드 원본: `D:\daphne_auto\oxce-r135-r4-version-title-20261117` (MinGW-w64 GNU++17, 413-member archive).

**한계:** 실제 게임 내 자동 장비 15회 제한, 의료품/채찍, Backspace 복귀의 플레이 검증은 아직 미완료. GUI 시작 성공 ≠ 기능 전체 통과. 앞선 실패 R135-R5 시험 프로세스는 종료했고 사용하지 말 것.
