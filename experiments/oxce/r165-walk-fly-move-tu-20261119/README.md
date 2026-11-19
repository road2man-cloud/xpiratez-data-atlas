# R165 — WALK MOVE / FLY MOVE 동시 표시 (2026-11-19)

누적 기반: R160B → R163 → R164B → **R165**.

- R164B의 `전원자동`, `전원해제`, `低` 버튼과 저TU 사격 조건, 무기 > 폭탄 > 탄창 퀵드로 우선순위를 그대로 보존.
- 기존 공중 목적지 `FLY MOVE 이동TU/현재TU` 및 커서 옆 실제 경로 비용 표시를 지상 이동에도 동일하게 적용. 지상은 `WALK MOVE 이동TU/현재TU`로 표시.
- 실제 `Pathfinding` 경로 견적을 사용하고, 도달 불가능하거나 미발견인 칸은 비용을 추정하지 않음.
- R163의 공중 경로 마커와 Ctrl+C 단일층 호환 유지.
- R164B 부모 EXE SHA256: `4386E9563AE278B860CFCF094B90BBC9DCFAB1D2E6878A13B487537D199818DF`.
- R165 EXE SHA256: `7D345C2404931DD1E59A09A42541551814F8AD32A369CC43B5821E80FC7C9EE2`.
- 413개 원본 객체(아카이브 멤버)의 순서/이름 동일. 실제 수정된 객체는 `Map.cpp.obj` 하나; `InventoryState.cpp.obj` 해시가 R164B와 동일.
- PC에 전용 실행파일 `C:\Dioxine_XPiratez_o2.1\Dioxine_XPiratez\openxcom_R165_ALLPATCH_WALK_FLY_TU.exe` 설치.
- 전용 실행기: `XPZ_R165_WALK_FLY_TU_START.cmd`.
- **실전 스크린샷 기준 런타임 검사 미실시**. 빌드, 객체 유지, 설치 해시까지만 확인.

검증: `powershell -NoProfile -ExecutionPolicy Bypass -File verify-r165.ps1`. 후속 버전은 기능 회귀 검사를 보존하고, 포팅 시 누적 아카이브가 새 객체로 바뀌었는지 비교할 것.
