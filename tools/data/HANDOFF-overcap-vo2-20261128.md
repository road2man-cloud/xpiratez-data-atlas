# X-Piratez v.o2 육성 종결·통합 레지스트리 개발 인계서

기준: 2026-11-28 18:29 KST. 확인된 생산 커밋 739f911424e22ac04fd1bab4718651e66bd05d39 (main 및 overcap-canonical-intake-20261128). 아래 완료는 조건부 모델의 실제 소스·데이터 생산을 뜻하며, 실제 게임 인증이나 공개 배포 완료를 뜻하지 않는다.

## 1. 목표와 고정 조건
- 기존 사이트의 공용 병종 육성 비교 원장에 일원화한다. 별도 비교 사이트를 만들지 않는다.
- 캠페인 시작 연구 선택지: 근처 마을 방문 / 회의 소집 / 지역 농부 고용 / 기계류 조사. 다른 작업자가 시작 연구 정상화를 진행 중이다. 이 작업의 v10 산출물에 그 결과가 전수 적용됐다고 가정하지 않는다.
- 실제 행동·연구 순서, 출생처, 분기, 최종 병종, 난이도, 특성 이력, 영구 능력치, 성장 복원 및 한정 재료를 유지한다. 일반 훈장 보너스를 영구 능력치와 분리한다.
- 사용자 피드백 대기 없이 실제 생산을 우선한다. GPT 내부 실행이 가능하면 우선하고, 기존 격리 DevSpace Node.js 작업 공간을 대안으로 사용한다. 로컬 Python 실행 금지에 준해 회피한다. 검증은 생산 및 회귀 방지에 필요한 만큼만 한다.

## 2. 현재 실제 완료 수치

| 지표 | 수치 |
|---|---:|
| 기존 공개 공식 종결 조합 | 173 (교체 안 함) |
| 새 v10 조건부 고유 종결 조합 | 186 |
| 기존 유지 / 대체 / 미복구 | 158 / 15 / 0 |
| 기존 목록 대비 순증 | 13 (코르트) |
| 최종 병종·변종 | 28 |
| 종결 증빙 | 277 |
| 종결 동등 증빙 | 5 |
| 중복 제거 전 종결 조합 / 제거 | 191 / 5 |
| 전체 연구·특성 조합 / 분류 / 미처리 | 4505 / 3524 / 981 |
| 연구 도달 증빙 / 분류 | 6339 / 4627 |
| 공용 그래프 / 육성경로 / 상태 | 343 / 7457 / 9890 |
| 연구 trie / 행동 trie | 123789 / 231881 |
| 기존 15개 재료 문제의 보완 재생 | 27/27 성공, 실패 0 |
| 전체 증빙의 재료 미해결 | 1682 (기존 15개 복구와 별개) |

분류된 증빙: FINAL_CLOSED 277, FINAL_EQUIVALENT 5, KNOWN_CONTINUATION 2252, OPEN_RESEARCH_OR_GROWTH 358, OPEN_TRANSFORMATION 53, UNRESOLVED_FINITE_MATERIAL 1682. 합계 4627. 미분류 1712개 증빙. 이들 분류는 186개에 임의 가산하지 않는다.

## 3. 실제 수정·추가한 주요 소스

경로는 저장소 루트 기준.
- tools/atlas-research-material-policy-v2-vo2.mjs, tools/atlas-career-material-budget-v2-vo2.mjs: v.o2 출처 인덱스, 전 경로 한정 재료 검사. 선장 토큰 11, 녹색 정지 포드 3, NEKO_STS 1, CLOTHING_OFFICER 1; 후자의 조건부 근거는 구별. 일반 재료/제조를 실제 캠페인 인증으로 간주하지 않는다.
- tools/atlas-body-career-scope-v5-vo2-irreversible.mjs, tools/atlas-shade-reset-dominance-v2-vo2.mjs, tools/atlas-final-career-admission-v10-vo2-irreversible.mjs: 고정 병종의 조건부 성장캡 복원, 반복 순환, 불가역 연구 제외 및 독립 재생. 타 병종/복제/실제 게임 승리/전역 최적은 별도 문제.
- tools/build-overcap-canonical-intake.mjs, tools/apply-overcap-canonical-intake.mjs: CHORT 경로 추가 및 append-only 단계별 그래프·trie 편입.
- tools/build-overcap-vo2-pod-source-repair-batch.mjs: 녹색 포드 출처 경로 보완. 실제 STR_VENTURA_ANOMALY.disables에 의한 STR_TINY_DRILL_INVESTIGATION_DEP 폐쇄만 예외 허용; 임시 연구 폐쇄 전후 상태·룰·제조 해시 저장. 나머지 연구 소실 금지.
- tools/merge-overcap-vo2-pod-source-repair.mjs: immutable intake v1/v2/v3 및 실패 재시도 통합. 기존 성공 덮어쓰기 금지.
- tools/build-overcap-vo2-pod-successors.mjs: 연속 시술 생산, --intake=N, --from= 이전 배치 지원.
- tools/build-overcap-vo2-pod-cycle.mjs: 실제 순환 상태 및 모든 시술 전이 재생. v2 8개 후보 및 v3 3개 후보 생산. 영구 수치 동일성만으로 종결 처리하지 않는다.
- tools/build-overcap-pod-canonical-intake.mjs: 보완 및 순환 종결 후보를 공용 그래프에 추가. --cycle --include-direct --intake=N, base-stage 체인 및 기존 편입 후보 중복 방지.
- tools/build-overcap-staged-final-vo2.mjs: 집중 후보 v10 판정. 전체 생산과 분리.
- tools/build-overcap-vo2-full-prepared.mjs: 전체 연구·특성 증빙과 material budget 준비; --reuse-stage= 이전 append-only 준비 원장 재사용.
- tools/build-overcap-vo2-final-batch.mjs: --next, --fast-pass, --static-pass, --closure-first, --resume-from= 분할 생산. 자동 선택의 빈 대기열은 정상 종료. 스케줄 힌트는 종결 근거 아님.
- tools/merge-overcap-vo2-final-batches.mjs: 배치 범위 중복 금지, 해시·증빙 일치, 전역 반복 동등성 제거, 기존 공개 조합 유지·대체 매핑.
- tools/build-overcap-vo2-unified-registry.mjs: 신규 통합 공개 후보 조립기. 7개 기존 출처의 커버리지 재산출, 연구·특성/종결/재료/최대 능력치/반복 비교 재조립, 공개 경제 계획 28개와 기존 연계 자료 6종 보존. 미분류 상태를 탐색으로만 유지.
- public/branch-soldier-atlas-career-core.js: 연구 도달 탐색 모드에서 FINAL_EQUIVALENT 대표도 읽게 수정. final 모드에는 계속 엄격한 FINAL_CLOSED 검사를 적용.

위 외 다른 작업자의 fixed-body/training queue/연구 정규화/3D 소스 수정은 본 작업자의 생산 실적으로 집계하지 않는다.

## 4. 실제 산출물 경로 및 기준 해시
현재 기준 stage: POD_RETRY_B. 이전 CHORT -> POD_REPAIR -> POD_CYCLE_A -> POD_CYCLE_B -> POD_CYCLE_C -> POD_RETRY_A -> POD_RETRY_B.

- tools/data/overcap-intake-stage-POD_RETRY_B/vo2-full-prepared.json.gz (29 MiB)
- tools/data/overcap-vo2-full-prepared-manifest-POD_RETRY_B.json
- tools/data/overcap-intake-stage-POD_RETRY_B/vo2-final-merged.json.gz
- tools/data/overcap-vo2-final-merge-progress-POD_RETRY_B.json
- tools/data/overcap-intake-stage-POD_RETRY_B/vo2-unified-registry.json.gz (48,036,973 bytes)
- tools/data/overcap-intake-stage-POD_RETRY_B/soldier-population-missing-origin-career.json.gz (18 MiB)
- tools/data/overcap-intake-stage-POD_RETRY_B/soldier-population-missing-origin-career-index.json.gz (4.4 MiB)
- tools/data/overcap-vo2-unified-registry-POD_RETRY_B.json
- tools/data/overcap-vo2-pod-repair-intake-v3.json 및 v1/v2, 개별 source-repair 및 retry-v2 배치, pod-cycle v2/v3 배치
- tools/data/overcap-canonical-graph-patch-{CHORT,POD_REPAIR,POD_CYCLE_A,POD_CYCLE_B,POD_CYCLE_C,POD_RETRY_A,POD_RETRY_B}.json
- tools/data/overcap-staged-intake-receipt-{동일 stage}.json

해시:
- sourceMetadataSha256: a16408dc92af6f7377511843533c12749fbb43c79508b8c194f9680ca49c751e
- baseGraphHash: fe8a0f73b39b512b5747d7deff0f71f8f9ab0eb65e9e943bf115be7f7b549898
- sourceGraphSha256: ca1007dfc5bddb9465b9555e6bb9dc36349ae307b08578e39a998b3324aa7bdd
- preparedHash: 5d84b8da9eff0fc14f6d3320c84754e865527084556283e4e5577720fd1bb6b3
- planHash: 148cae9bd2ea7e8101f3d148a60f2f8dfc2e8fae8af0b06399a84402134543af
- mergeHash: 6dc87df92bc6b99fe5b390633923f375a379910f13b1e5d6450f2c2a0a050861
- registry SHA-256: 006eb1da68e08a92bce293644e8ae9f1163b9d8b8cb9bb434fdd83923211b339
- original public registry SHA-256: b8a3798e20c4d674852791bcfae01caeeef397589d970b48bfeabe28a2d5df05
- staged ledger SHA-256: 20176a069f2e284b0d4271236166806ff265c8816021d1f16ed76fba492bbacf
- staged index SHA-256: 051653528a8062124f1cf177352341ce3d1e271895d696bc70c852c724c233e1

주요 생산 커밋: 2077cf12(순환 8개 및 경로 120개), bb8f6301(7407경로 통합), cdfc21f2(171개), dfe2b899(175개 및 기존 173개 복구), 246ca05e(코르트 11개 순증), 739f9114(186개 통합 레지스트리 및 그래프·색인). 모든 위 작업은 main에 반영.

## 5. 실제 검증 결과와 한계
- 최종 병합기: 3524개 조합 4627개 증빙, 186 고유 종결. 기존 173개는 158 유지+15 대체, 미복구 0.
- 압축 통합 레지스트리를 다시 읽고 hydrateResearchPaths, hydrateSharedCareerSections, loadCareerRows를 호출함. final 277개 증빙/186개 고유 조합, research-line 6339개, 오류 0. 해시 일치.
- 이 과정에서 새 출생처/분기 연결 1개 발견: manufacture:STR_CATGIRL_WARRIOR_RECRUITMENT|branch-3f47bfff0ab551d49dbd0355.
- 공개 조립기의 초기 시도는 새 출생처/분기 및 공개 제조계획 투영(28개 vs 원본 46개) 차이로 실패했고 수정 후 성공.
- 실제 브라우저 UI/Pages 배포/공개 자료 교체는 미실행. 실제 원본 룰셋 및 실제 게임 승리·글로벌 최적 인증 없음.
- 제조/재료 획득은 조건부 모델. 27/27은 기존 15개 조합의 재료 보완 재생이지 전체 1682개 재료 문제 해결이 아님.
- public/data/branch-soldier-results.json.gz 및 공개 그래프/색인은 기존 상태. publicRegistryChanged=false, publicationReady=false, complete=false, officialFinalAdded=0.
- v10 연구 순서가 캠페인 시작 4개부터 실제 도달 가능하다는 전수 인증은 미완료. 다른 연구 정상화 작업과 연계 필요.
- 이전 답변의 병종 수 27은 오류. 결과 보고서 byFinalBody 실제 28종, 합계 186.

## 6. 미완료 및 다음 세션 구체 지시

### P0. 기존 stage 그대로 이어서 종결 생산
최신 main에 새 변경이 없는지 확인. 최신 원격 원장이 동일하면 준비 원장 재생성하지 말 것.
```sh
node tools/build-overcap-vo2-final-batch.mjs --body=POD_RETRY_B --closure-first --limit=24
node tools/merge-overcap-vo2-final-batches.mjs --body=POD_RETRY_B
```
- 현재 모든 미처리 981개가 마지막 스케줄에서 tier 3(불가역 제외 후보). 신규 고유 종결 생산이 확인된 --closure-first를 먼저 반복. 시간 초과 시 6~12 단위로 축소. 체크포인트와 완료 배치를 보존.
- 정렬 우선순위 개선 시 특정 병종에 편중되지 않도록 실제 종결 기회와 병종 커버리지를 고려. --next도 사용 가능. 다음 미처리 인덱스 363,369,372,375,377,384,387,390,391,392,393,395.
- 각 배치의 새 파일과 merge/progress만 명시적 git add; 실제 생산마다 커밋/푸시. 중복 제거 후 순증만 보고.
- 981개 미분류의 최종 분류는 목표이나, 4505개 모두 분류돼도 전체 가능한 게임 육성 공간을 완전 탐색했다는 뜻은 아님.

### P1. 통합 레지스트리 갱신 및 공개 배포 준비
```sh
node --max-old-space-size=4096 tools/build-overcap-vo2-unified-registry.mjs --body=POD_RETRY_B
```
- 전체 분류 완료 후 기존 유지/대체 매핑 및 오우거 7특성 회귀를 확인. 현 조립기의 publicationReady 조건은 complete && ogreRegression.length>0이므로 충분한 배포 보증이 아님. 회귀 대상 전체와 상태, 재료 예산, 시작 연구 순서 호환, 모든 companion fingerprint 및 공개용 summary 필드 실제 사용 여부를 확인하여 배포 게이트를 강화할 것.
- 연구 도달 탐색 및 final 두 모드에서 개별 증빙/조합 수·오류·해시가 일치해야 함. 기존 6개 경제 companion rebinding은 기존 정책을 따랐으나 실제 UI 연결 전수 검증은 미완료. 압축 복원 후 테스트 및 실제 브라우저에서 기존 통합 비교 화면을 점검.
- 최종 공개 파일은 기존 공용 경로 public/data/branch-soldier-results.json.gz, public/data/soldier-population-missing-origin-career.json.gz, public/data/soldier-population-missing-origin-career-index.json.gz 및 public/branch-soldier-missing-origin-summary.js. 세 gzip과 summary를 동일 graph/hash 기준으로 일괄 교체하는 배포기 신규 구현 필요. 기존 JS/다른 작업자 자료/경제 계획 보존. 미완료 상태에서 복사하지 말 것.
- public registry 입력 자체가 변경되면 새 base 기준으로 재생산/재편입 검토. 오래된 sourceHashes를 강제로 갱신하지 말 것.

### P2. 재료 미해결 1682개 및 후속 미종결 생산
- 전체 미해결 증빙을 material issue, body, branch, origin, 실제 출처로 그룹화. 기존 27개 보완의 성공을 전체에 확대하되, 가용 연구와 분기 충돌 및 임시 연구 폐쇄 증거를 재생.
- 연구 보완 358개, 변환 보완 53개는 별도 후속 대기열로 실제 생산. KNOWN_CONTINUATION 2252개는 현재 원장에 후속 존재, 임의 종결 금지.
- 다른 작업자의 training resume queue 및 캠페인 최초 4개 연구 경로 정상화 변경을 검토하여 통합. 연구 정규화로 replay fingerprint 또는 gate sourceHashes가 달라지면 기존 증빙을 무조건 신뢰하지 않는다.
- 필요하면 새 stage 패치/receipt 생성, append-only 적용, --reuse-stage=POD_RETRY_B 전체 준비, --resume-from=POD_RETRY_B 재분류, 병합·통합 레지스트리 재생산. 기존 stage 결과 삭제 금지.

## 7. 작업 환경 및 Git 절차
- 저장소: https://github.com/road2man-cloud/xpiratez-data-atlas
- DevSpace workspaceId ws_c89f1778e1, 격리 worktree C:\Users\road4\.devspace\worktrees\overcap-site-integration-20261128-3961a371 (도구 내부 경로 D:/DevSpace/road4/.devspace/worktrees/...로도 표시).
- 동일 workspace 재사용. 외부 작업자가 사용 중인 공용 checkout D:\daphne_auto\xpiratez-data-atlas, 이전 dirty worktree는 건드리지 않는다. 이전 단계 임시 gzip 및 미추적 experimental 파일 보존; git add -A 금지.
- Node.js 사용, 이번까지 로컬 Python 미사용. GPT 내부 가상 공간에서 전부 작업한 것은 아님.
- git fetch origin main; 새 변경 확인; 충돌 시 다른 작업자 소스 보존. 실제 생성 파일 명시적 git add, commit, 개발 브랜치 push, main merge/push, 원격 SHA 확인. force push 금지.
- 검증만 반복하거나 모든 미분류를 종결이라고 표기하지 말고 실제 생산/개선 커밋을 우선. 실패와 미완료 구분.

