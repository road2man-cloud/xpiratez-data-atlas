# X-Piratez v.o2 — 위어드갈 reset / MaxStats / 성장 상한

## 즉시 조회 (로컬 규칙 원문 불필요)

v.o2 출처 해시와 연결된 \`public/data/soldiers-modern-index.json\`을 사용합니다.

\`\`\`powershell
node tools/inspect-v2-reset.mjs --query "위어드갈"
node tools/inspect-v2-reset.mjs --query STR_WEIRDGAL_TRANSFORMATION --compare "미치광이" --compare "싸움꾼"
\`\`\`

* 위어드갈 변신: \`STR_WEIRDGAL_TRANSFORMATION\`
* 결과 병종: \`STR_SOLDIER_W\`
* 인덱스 기준 \`reset: false\`, \`resetRank: false\`, \`rerollStats: null\`
* \`upperBoundAtMaxStats: true\`, \`upperBoundType: 1\`(soft), \`upperBoundAtStatCaps: false\`, \`lowerBoundAtMinStats: false\`
* 고정 직접 변화: 용기 +20, 정신력 +3, 정신기술 +3
* 별도 \`STR_MEDAL_WEIRDGAL\` 보너스: 용기 +20, 정신력 +3
* 위의 두 값은 별도 메커니즘이므로 사전 적용값과 최종 결과를 구분하세요.

### 병종 비교

| 능력치 | 시작 Max 미치광이 / 싸움꾼 / 위어드갈 | 전투 Cap 미치광이 / 싸움꾼 / 위어드갈 | 훈련 Cap 미치광이 / 싸움꾼 / 위어드갈 |
|---|---|---|---|
| TU | 85 / 80 / 103 | 100 / 100 / 100 | 85 / 85 / 85 |
| 스태미나 | 80 / 80 / 175 | 150 / 140 / 150 | 100 / 100 / 100 |
| 체력 | 60 / 60 / 100 | 90 / 90 / 90 | 66 / 66 / 66 |
| 용기 | 80 / 70 / 110 | 100 / 100 / 100 | 0 / 0 / 0 |
| 반응 | 75 / 70 / 103 | 100 / 100 / 100 | 0 / 0 / 0 |
| 사격 | 70 / 65 / 123 | 120 / 120 / 120 | 85 / 85 / 85 |
| 투척 | 65 / 65 / 92 | 90 / 90 / 90 | 66 / 66 / 66 |
| 힘 | 55 / 50 / 82 | 80 / 80 / 80 | 66 / 66 / 66 |
| 정신력 | 63 / 60 / 75 | 63 / 60 / 70 | 0 / 0 / 0 |
| 정신기술 | 0 / 0 / 0 | 40 / 40 / 60 | 40 / 40 / 60 |
| 근접 | 100 / 90 / 140 | 130 / 125 / 130 | 100 / 100 / 100 |
| 마나 | 50 / 40 / 100 | 70 / 70 / 70 | 0 / 0 / 0 |

\`maxStats\`는 신규 병종 생성 시 **시작 스탯 추첨 상한**이며 개인의 장기 성장 상한이 아닙니다. 이미 존재하는 대원이 \`producedSoldierType\`으로 변경되는 것만으로 위어드갈 \`maxStats\`를 다시 뽑지 않습니다. 위어드갈 변신에는 \`rerollStats\` 선언이 없습니다. \`reset\`은 이전 변신에서 얻은 보너스 및 변신 이력을 지우는 옵션으로, 시작 능력치 재추첨 옵션이 아닙니다.

### 로컬 규칙 원문에서 reset 직접 선언 여부 확인

\`\`\`powershell
node tools/inspect-v2-reset.mjs --query "위어드갈" --source "C:\...\user\mods\Piratez"
\`\`\`

\`--source\`는 정확히 일치하는 v.o2 모드 루트이고 \`Ruleset/\`, \`Language/\`, \`metadata.yml\`이 존재해야 합니다. 전체 파일의 SHA-256, 크기, 추가 규칙파일이 없는지 확인한 후 \`soldierTransformation\`과 중첩 \`refNode\` 선언을 분석합니다.

로컬 검증 없이는 \`reset: false\`가 직접 선언인지 OXCE 기본값인지 구별했다고 주장하지 않습니다. 위어드갈의 엔진 실제 능력치 최종 산출은 개인의 현재 능력치·변신 이력·보너스·상한 옵션에 의존합니다.

원본 버전 정책: \`AGENTS.md\`. 사용 규칙 참고: [OXCE Ruleset Reference Nightly](https://ufopaedia.org/Ruleset_Reference_Nightly_%28OpenXcom%29).
