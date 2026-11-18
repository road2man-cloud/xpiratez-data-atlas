# X-Piratez v.o2 제조 계산기 — 개발 인계 및 다음 세션 실행 지시문

- 작성 기준: 2026-11-18
- 프로젝트: `road2man-cloud/xpiratez-data-atlas`
- 개발 범위: `public/manufacture-v2/planner/` 브라우저 제조/조달 계산기 (X-Piratez v.o2 전용)
- 마지막 **기능** 커밋: `b7cbe3ad07bcf11928d62b3cedaad73d26ef2205` (`b7cbe3a`)
- 기능 브랜치: `feat/manufacture-route-safe-review-carryover-20261118`
- 기준 비교: `origin/main` = `14aec19` (인계 문서 작성 당시)
- 기능 코드 원격 업로드: 확인됨. `main` 병합: 확인되지 않음/수행하지 않음
- 개발 보존 원칙: 원본 규칙·번역·게임 세이브·다른 작업자 브랜치 덮어쓰기 금지

## 1. 완료 상태 구분

**구현 및 원격 보존 완료(소스 수준):** 단일 제조 목표 계산, 부족 재료 가상 확보, 부분 수량 시뮬레이션, A/B 비교, 조달 조합 후보 탐색, 후보 재고 입력 초안, 제조 경로 편집 작업대, 저장 기지 시설/연구 증거 표시, 제조 준비 체크리스트, 경로 변경 기준 일괄 조달, 후속 부족 재료 반복 가정, 재료별 단계 원장, 규칙상 조달 사유별 분류, 제조 의존 순서, 통합 검토 작업표, 검토 메모 저장/복원, 변경 계획 간 안전한 검토 기록 선택적 이어받기.

**검증 완료(지정된 테스트 범위):** `npm run check:manufacture:planner:v2` 119/119 통과, `npm run check:manufacture:planner:v2:browser` PASS (2026-11-18 재실행).

**완료로 표시 금지:** `main` 병합, 실제 웹사이트 배포, OXCE 게임 내부 실행 연동, EXE/ZIP 제작, 실제 세이브 데이터 수정·게임 내 제조 실행, 모든 연구/시설/구매 조건의 완전한 해석, 다른 작업자 변경 전체 통합, 전체 프로젝트 `npm run check:all` 통과.

## 2. 실제 작업물 경로

원격 저장소: https://github.com/road2man-cloud/xpiratez-data-atlas

개발 브랜치: https://github.com/road2man-cloud/xpiratez-data-atlas/tree/feat/manufacture-route-safe-review-carryover-20261118

마지막 기능 커밋: https://github.com/road2man-cloud/xpiratez-data-atlas/commit/b7cbe3a

로컬 Windows DevSpace 작업 트리:
`C:\Users\road4\.devspace\worktrees\xpiratez-data-atlas-68d14c0e-463e11c7`

작업 도구의 workspace ID: `ws_9233141c63` (같은 작업 트리를 이어서 사용하는 세션에서만 유효; 새 세션에서는 실제 접근 가능 여부 재확인).

주요 파일:
- `public/manufacture-v2/planner/index.html` — 브라우저 UI
- `public/manufacture-v2/planner/planner-ui.mjs` — 화면 및 사용자 동작, JSON/CSV, 가상 시나리오 연결
- `public/manufacture-v2/planner/planner.css` — UI 스타일
- `public/manufacture-v2/planner/planner-core.mjs` — 기존 v.o2 제조 계산 엔진(기반 소스; 이번 기능 브랜치 차이 목록에 없음)
- `public/manufacture-v2/planner/external-basket-core.mjs` — 외부 재료 묶음 가상 조달 및 A/B
- `public/manufacture-v2/planner/external-candidate-explorer.mjs`, `external-candidate-handoff.mjs` — 조달 후보 탐색/불러오기
- `public/manufacture-v2/planner/candidate-route-workbench.mjs` — 제조 경로 편집·조달 비교
- `public/manufacture-v2/planner/candidate-route-evidence.mjs` — 시설 기능/연구 ID 근거
- `public/manufacture-v2/planner/manufacturing-readiness-checklist.mjs` — 부족 재료·시설·연구·규칙 확인 목록
- `public/manufacture-v2/planner/readiness-acquisition-batch.mjs` — 체크리스트 기반 일괄 가상 조달
- `public/manufacture-v2/planner/route-aware-readiness-batch.mjs` — 경로 변경 기준 가상 조달
- `public/manufacture-v2/planner/route-aware-cascade.mjs` — 추가 부족 재료 단계별 반복 가정
- `public/manufacture-v2/planner/route-acquisition-ledger.mjs` — 현재 재고/초기·후속 확보량/남은 부족량 원장
- `public/manufacture-v2/planner/route-material-workflow.mjs` — 조달 사유 분류 및 하위 제조식 우선 순서
- `public/manufacture-v2/planner/route-action-board.mjs` — 재료/조건/제조식 의존 검토표와 메모
- `public/manufacture-v2/planner/route-action-carryover.mjs` — 변경 계획 간 검토 메모의 안전한 선택적 복원
- `public/manufacture-v2/planner/save-operations-core.mjs` — 명시 시설 기능 처리 보완
- `docs/manufacture-planner-2.1.md` — 기존 기능 및 한계 설명
- `tools/check-v2-manufacture-planner-browser.mjs` — 브라우저 기능 검사
- `tools/test-v2-*.mjs` — 제조 계산/조달/작업표 관련 Node 테스트
- `package.json` — `check:manufacture:planner:v2`, `check:manufacture:planner:v2:browser` 스크립트

기능 브랜치 `origin/main...HEAD` 실제 차이: 32개 파일, 7,589줄 추가, 11줄 삭제(인계 문서 자체를 추가하기 전 측정).

## 3. 단계별 기능 커밋 계보

아래 16개 기능 커밋은 **같은 연속 개발 계보**로 최신 브랜치에 포함되어 있으며, 각 단계는 GitHub 기능 브랜치로 업로드되었다.

1. `426e588` — 단일 부족 재료 확보 가정 미리보기/재고 입력 초안
2. `fc4d6e0` — 전체 재료 CSV 출력
3. `2f81ad8` — 단일 제조 목표의 다중 재료 조달 묶음
4. `0d286ed` — 부분 조달 A/B 비교
5. `c8cc536` — 제한된 조달 조합 후보 탐색
6. `3e93864` — 탐색 후보를 체크·재고 초안으로 전달
7. `0ef4c21` — 경로 편집·조달 통합 작업대
8. `fc67b15` — 연구·시설 기능 근거 및 경로 비교
9. `7d5c652` — 통합 제조 준비 체크리스트
10. `4a3da93` — 체크리스트에서 다중 재료 가상 확보
11. `9547b03` — 변경된 제조 경로 기준 일괄 조달
12. `ea4ac32` — 새로 드러난 부족 재료의 단계별 반복 가정
13. `1a796c1` — 단계별 재료 조달 원장
14. `bcbe54e` — 조달 사유/제조 의존 순서
15. `48787cf` — 선행 작업 연계 통합 검토표·메모·동일 그래프 복원
16. `b7cbe3a` — 제조 계획 변경 후 동일·비모호 항목 검토 메모 선택적 이어받기

## 4. 실제 검증 결과 및 해석

2026-11-18 DevSpace 작업 트리에서 재실행:

```sh
npm run check:manufacture:planner:v2
# tests 119; pass 119; fail 0

npm run check:manufacture:planner:v2:browser
# PASS 2.1 manufacturing planner UI: nested production,
# stock deduction, consolidated materials, alternative comparison and JSON export
```

`git status --short --branch`에서 기능 커밋은 원격 추적 브랜치와 일치했으며, 인계 문서 작성 직전에는 작업 트리가 깨끗했다.

검증된 것은 **현재 Node 테스트에 포함된 로직**과 **브라우저 테스트 스크립트의 상호작용**이다. 실제 게임에서의 생산 주문 실행, 브라우저 사용자의 전체 시나리오, 외부 서버 사이트 배포, EXE 실행과 동일하다고 해석하지 않는다. 세이브는 브라우저에서 선택된 파일의 저장량/연구 증거 참고 용도이며 게임 세이브를 자동 수정하지 않는다.

## 5. 알려진 미완료·불확실 사항

1. **`main` 미병합.** 최신 기능은 `feat/manufacture-route-safe-review-carryover-20261118`에 있다. `origin/main`의 최신 상태와 다른 작업자 변경을 병합 전에 다시 확인해야 한다.
2. **실제 웹 배포 미확인.** 원격 브랜치에 소스가 있다는 사실만 확인했으며 운영 사이트 반영·URL 접근 검사는 수행하지 않았다.
3. **EXE·ZIP 없음.** 이 작업은 브라우저 제조 계획 도구다. 게임에 직접 삽입되는 OXCE 네이티브 패치가 아니다.
4. **게임 제조 가능성 판정 미완료.** 연구 AND/OR, 이벤트, 세력, 시설, 생산 대기열, 잠금 상태 등 실제 엔진 조건을 전부 해석하지 않는다.
5. **실제 시장/획득 경로 미검증.** 규칙의 `costBuy` 등은 참고가일 뿐 실제 구매·판매 가능성을 의미하지 않는다.
6. **재고 수송/기지 단위 제약 미해결.** 선택한 단일 기지 시설 근거를 우선 사용한다. 전체 기지 재고 합산은 즉시 생산에 활용 가능하다는 증거가 아니다.
7. **반복 조달은 가정.** 실제 게임에서 재료를 샀거나 생산한 것으로 기록하지 않는다. 기본 UI는 추가 4단계(엔진 허용 1~6단계)만 가정한다.
8. **검토 메모는 사용자 기록.** 체크와 의존 작업의 검토 완료가 게임 내 진행 완료를 뜻하지 않는다.
9. **전체 프로젝트 통합·전체 검사 미실시.** 해당 기능 범위 이외의 OXCE/XPZ3D/F11 및 동시 작업자 브랜치는 별도 작업이다. 본 기록만으로 전체 프로젝트 통합을 선언할 수 없다.
10. **라이브 게임 세이브에 대한 최종 호환성 확인 필요.** 테스트가 제공하는 세이브 형식·규칙 증거를 넘어 모든 세이브 호환을 단정하지 않는다.

## 6. 다음 세션의 구체적 실행 지시

### 시작 시 실제 상태 확인
1. GitHub 저장소에서 `feat/manufacture-route-safe-review-carryover-20261118` 브랜치의 최신 SHA를 확인하고, **기능 기준점 `b7cbe3a`**가 포함되는지 확인한다. 인계 문서 저장 커밋이 뒤에 있을 수 있으므로 SHA와 브랜치 이름을 구별한다.
2. 동일한 DevSpace 작업 트리가 살아 있다면 재사용하고, 없으면 GitHub 브랜치를 새 격리 작업 트리로 체크아웃한다. 다른 작업자의 작업 디렉터리나 `main`을 직접 덮어쓰지 않는다.
3. `git status --short --branch`, `git log -5 --oneline`, `git merge-base HEAD origin/main`, `git diff --name-status origin/main...HEAD`로 현재 상태를 보고 실제 변경 범위를 재확인한다.
4. 규칙 출처는 X-Piratez **v.o2**로 고정하고, 구형 1.1/별도 모드 인덱스를 혼합하지 않는다.

### 개발 우선순위 — 실제 작업물 생산 중심
1. **선택적 검토 기록 이어받기 보완:** 변경 전후 비교를 JSON으로 내보내고, 제외된 작업의 사유·영향받는 하위 제조식을 별도 보고서로 표시한다. 계산/게임 상태는 불변이어야 한다.
2. **검토표에 작업별 근거 연결:** 재료 조달 사유와 시설/연구 증거를 작업 행에서 직접 확인할 수 있도록 확장한다. 근거가 없는 경우에는 확인 필요로만 표시한다.
3. **대량 제조 계획 UX 개선:** 작업표 100건 페이지, 재료별 수량, 단계별 조달 원장, 제조 순서 사이에 공통 ID 탐색/선택 연결을 추가한다. 대량 데이터에서 전체 다운로드 내용은 누락하지 않는다.
4. **원본 세이브 보존 기능 유지:** 파일은 명시 선택 후 브라우저에서만 읽고, 가상 조달은 입력 재고를 자동 덮어쓰지 않는다. 재고 입력문을 준비한 후에도 별도 적용 단추가 필요하다.
5. **다른 작업자 변경과 호환성을 실제 점검한 후 통합 후보 준비:** 우선 새 기능 브랜치에서 완성하고, `main`으로 병합하기 전 변경 충돌과 배포 영향을 확인한다. 검토 없이 `main` 병합을 완료로 선언하지 않는다.

### 테스트와 보존
```sh
npm run check:manufacture:planner:v2
npm run check:manufacture:planner:v2:browser
git diff --check
git status --short --branch
```
- 신규 기능은 최소한 관련 Node 테스트와 브라우저 조작 검사를 함께 추가한다.
- 소스, UI, 검사, 문서를 같은 기능 커밋으로 묶고 **별도 브랜치**에 push한다.
- 원격 업로드 후 커밋 SHA와 GitHub 경로를 제시한다.
- 완료 보고 시 `소스 생성` / `검사 통과` / `원격 push` / `main 병합` / `배포` / `실제 게임 실행`을 반드시 구분한다.
- 사용자 추가 피드백을 요구하지 않고 합리적인 범위의 개선을 진행하되, 검증을 반복하는 대신 실질적인 소스·UI·내보내기 작업물을 우선 생산한다.

## 7. 다음 작업자에게 전달할 핵심 지시

**기준 브랜치**: `feat/manufacture-route-safe-review-carryover-20261118`  
**기준 기능 SHA**: `b7cbe3a`  
**실제 기반**: X-Piratez v.o2 브라우저 제조 계산기  
**개발 원칙**: 수정 소스·실제 기능 생산 우선, 기존 원본/세이브/다른 작업자 브랜치 보존  
**금지**: 소스만 수정하고 EXE 완성이라 주장하기, 브랜치 push를 `main` 통합이라 주장하기, 가상 조달을 실제 구매/제조라 주장하기, 확인하지 않은 호환성을 완료로 표시하기  
**우선 실행**: 기능 기준점 확인 → 검토 기록 이어받기·근거 탐색 등 실사용 기능 확장 → 해당 기능 테스트 → 새 브랜치 commit/push → 실제 결과와 미완료 항목을 분리 보고
