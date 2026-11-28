# X-Piratez v.o2 V15 캠페인 연구경로 정상화 — 실행 인계서
기준: 2026-11-28 / branch career-campaign-start-p0-20261128
마지막 확인된 생산 원장 커밋: 0c3540d4c04a5a35b01b81fc987be3b16c77fadd
이 문서는 생산 결과와 미완료 사항을 구별한다. Main/Pages 및 실제 게임 엔진 인증을 완료로 보지 않는다.

## 1. 작업 목적과 변경 금지 사항
- 기존 15,543개 육성경로 및 173개 종결 조합의 캠페인 시작 연구 순서부터 정상화한다. 신규 종결 조합 확장은 후순위.
- 실제 시작 선택지: 근처 마을 방문 STR_JACKSTOWN_SCOUTING(cost 3), 회의 소집 STR_WAT_DO(3), 지역 농부 고용 STR_RECRUIT_PEASANTS(3), 기계류 조사 STR_INSPECT_MACHINERY(6). 시작 게이트 START_RESEARCH에서 확인.
- 모든 후속 행동은 연구, 무료 지급, 이벤트, 시설, 제조, 모집, 성장, 훈련의 순서를 지켜 재생한다. 외부 물품/연구/시설 강제 지급 금지.
- 영구 특성, 훈장, raw stats, battle cap, statMax, 훈련 상한 및 실제 게임 인증을 구분.
- GPT 내부에서 JS 작성 및 통합 계산 우선. 원본 룰셋을 읽어야 하는 경우만 격리 DevSpace에서 Node.js 실행. 로컬 Python 사용 금지에 가깝게 회피. 사용자 추가 피드백 없이 자체 개선 후 GitHub 커밋.
- Main과 병렬 작업자의 변경을 덮어쓰지 않는다. 개별 파일 SHA를 확인하고 작업 브랜치에만 반영. 더티 작업공간 전체 reset/switch/commit 금지.

## 2. 고정 입력 및 실행 환경
- Repository: road2man-cloud/xpiratez-data-atlas
- Working branch: career-campaign-start-p0-20261128
- Pinned legacy ledger commit: a7e64ad8b071c557a0194f26e811dcfc460a1b50
- v.o2 source metadata SHA256: a16408dc92af6f7377511843533c12749fbb43c79508b8c194f9680ca49c751e
- Prefix hash: 1e8c53af3e1f68eba22b9ab58a9dd29a4215076e30a0d51ba13de0224b349ec0
- Queue hash: e7bca2398bb87dd88185bd8b7353b3aee62964f49f716cf21a67f0538b53522b
- GitHub input: public/data/campaign-start-prefix-repair-v2.json, public/data/campaign-start-repair-worklist-v2.json.gz
- DevSpace existing workspaceId: ws_6473ff57f7; root C:/Users/road4/.devspace/worktrees/xpiratez-data-atlas-9971a13c. Reuse if available; do not reopen same workspace.
- Local pinned repo for git show: D:/xpiratez-data-atlas
- Local source: C:/Dioxine_XPiratez_o2.1/Dioxine_XPiratez/user/mods/Piratez/Ruleset/
- Local input filenames: campaign-prefix-repair-v2.json, campaign-repair-worklist-v2.json.gz
- The real .rul source was read locally and hashed; do not assume those raw files are on GitHub.

## 3. 실제 소스 및 커밋
All paths below relative to repo root. Blob hashes checked against local on 2026-11-28 for four core files.
| Path | Actual change | Confirmed commit/blob |
|---|---|---|
| tools/build-atlas-campaign-repair-suffixes-v1.mjs | pinned input consumer, prefix cache, downstream supply, suffix replay, state/stats and atomic batch output | dabf2414; current blob abacb3c23f27d4e2db31ec4a6d607b4da15127af |
| same | STR_TEC_001 fixed mission loot, Siberia event and region | b28ca9eb, c48f6f7f |
| same | fixed event bundles, permanent vectors, country-only Japan/Egypt, source checks | 900232ca, 984abfe0 |
| public/soldiers/modern/campaign-start-gate-v1.js | mission loot and item-only events, event funds/points | d59947e1, c533f248, 53df59f7; current blob 6cf5bca42bc17c00a4a1b8dd6f73ff122cf6e822 |
| public/soldiers/modern/campaign-start-research-planner-v1.js | source-backed mission/event supply and ranked facility provider search | a9c69a7b, c0a43c45, 0eb1934c; current blob 6870141b4a1b1470d6926eaa2782461042ebabc6 |
| public/soldiers/modern/campaign-start-career-actions-v1.js | existing conditional growth/promotion/medal module reused; not claimed as newly authored in this session | confirmed blob bd57f6b319f666e6a5bda2617293f63fdca1e453 |
| public/soldiers/modern/campaign-start-event-rules-v1.js | Japan country-event full reward, existing Egypt event reused | 121d95e7; current blob ca867cb6bc4b9f289b343bbc776aa37fb825f6e4 |
| tools/build-atlas-campaign-repair-ledger-v1.mjs | deduplicated scenario jobs/routes/pairs, source identity checks, witness pointers | a7cf3a9c; blob d87bbf3e1b08971868021ef1d682781585d1d998 |
| public/data/campaign-repair-ledger-v1.json | consolidated actual batch receipts | aa2441f0, 661a8b16, 5f6fa7bf, 0c3540d4; blob bca5f4f4ad79f9bbcd33bb59ae94297b6acf3171 |

Facility prioritization: reachable research, material cost, required functions, build time; skip direct cycles/disabled/forbidden research. CULT bottleneck passed in some replays, not universal proof.
Fixed event support includes STR_SIBERIA_DAMSEL_EVENT, STR_SLAVE_CAUGHT_EVENT, STR_KNOCK_KNOCK_CASTAWAYS, STR_POLYMAKH_SHAPKA_EVENT_RECRUIT, STR_HYBRID_OF_TWILIGHT_EVENT, STR_KNOCK_KNOCK_HYBRID_OF_TWILIGHT, STR_KNOCK_KNOCK_WILLING_SLAVE. Retain exact bundle and triggers/weights, one-use conservative assumption.
Country conditions mutually exclusive with region-only scenario in this implementation. Do not combine Siberia + Japan/Egypt artificially.

## 4. 실제 GitHub 생산 데이터
All files in public/data/. Processed/completed is batch count before deduplication.
| File | Processed / complete | Commit |
|---|---:|---|
| campaign-suffix-repair-v1-batch3.json | 6 / 2 | 315ae70e |
| campaign-suffix-repair-v1-batch4.json | 18 / 10 | a26edcb3 |
| campaign-suffix-repair-v1-batch5-offset18.json | 8 / 7 | 3d642cd5 |
| campaign-suffix-repair-v1-batch6-offset26.json | 8 / 2 | f83308b8 |
| campaign-suffix-repair-v1-cult-retry20.json | 1 / 0 | c37dadf3 |
| campaign-suffix-repair-v1-batch7-offset26.json | 8 / 6 | fb94c4ae |
| campaign-suffix-repair-v1-slave-retry20.json | 1 / 1 | cd492c3c |
| campaign-suffix-repair-v1-batch8-retry0.json | 18 / 17 | 5b435a8c |
| campaign-suffix-repair-v1-japan42.json | 1 / 1 | 37ae618c |
| campaign-suffix-repair-v1-egypt2.json | 1 / 1 | c101db31 |

The ledger inputs above are authoritative; do not sum batch successes as unique paths.
Local-only batch0, batch1, batch2, growth-batch4 and batch9-training42 are not included in the ledger. batch9-training42 (offset 42 limit 6 Siberia, 0 successes) remains local, not uploaded. Transfer useful failure evidence; do not overwrite country success.

## 5. 확인된 수치 (실제 입력 JSON 및 원격 원장 재조회)
Queue: 15,543 paths, 4,371 legacy pairs, 173 legacy final combinations.
Prefix: 94 groups, 65 conditional replay success, 29 unresolved. 8,335 suffix-repair-pending, 302 prefix-repair-pending, 8 other repair-pending, 6,898 parent-link-pending. Direct full histories 8,645. These are input queue counts, not end-to-end success counts; prefix input normalizedCareers remains 0.
Current integrated ledger: 70 attempts, 47 successful attempts, 36 distinct scenario jobs, 33 completed, 3 pending, 33 distinct route IDs, 24 conditional research/trait pair hashes, 10 growth routes, 1 transform route, 0 terminal certified, 0 game certified.
Bodies: STR_SOLDIER_HYBRID 15 (growth 5), STR_SOLDIER_PEASANT 5 (includes one Theban clone), STR_SOLDIER_DAMSEL 5 (growth 2), STR_SOLDIER_SLAVE 3, STR_SOLDIER 3 (growth 2, transform 1), STR_SOLDIER_S 2 (growth 1).
Note: 24 new conditional pair hashes are not 24 canonical terminal combinations. 36 scenario jobs are not necessarily 36 unique legacy IDs. Ledger still records Siberia Theban failure even after Egypt succeeds.

First full training replay: Japan offset 42, STR_SOLDIER from manufacture:STR_SISTER_VICTIM_RECRUITMENT, 49 actions, STR_SUN_WARRIORS_TRAINING, trait STR_SUN_WARRIOR.
Theban: Egypt offset 2, manufacture:STR_THEBAN_ASSAULT_CLONE, body STR_SOLDIER_PEASANT, trait STR_THEBAN_ASSAULT_CLONE, 36 actions.
Stat order: tu,stamina,health,bravery,reactions,firing,throwing,strength,psiStrength,psiSkill,melee,mana.
Japan permanent stats: 100,153,90,100,97,120,90,83,64,37,130,70.
Egypt permanent stats: 80,110,55,90,70,80,60,45,50,0,80,35 (birth min, not grown).
Both actually replayed and uploaded. No native gameplay certification.

## 6. 미완료 및 제한
- No complete terminal reclassification or canonical comparison-ledger admission; 0/173 normalized terminals. Main/Pages not changed.
- Prefix receipts cover 65/94 groups only, parent suffix normalization 6,898 remains. Old ledger/queue are pinned; extend by versioned inputs, not silent mutation.
- Conditional battle-cap growth is not a native combat/training duration simulation; promotion defaults when rankStrings absent and medal/psi/mana/statMax/cap semantics need further source-based work. No unsupported growth or random transformation should be treated as exact.
- Monetary affordability, native construction/event day timing, RNG, base land placement and actual mission victory not certified. Country reward in Japan replay is recorded in month 0 after earlier actions, not proof of actual calendar feasibility. Gate checks the four research options at empty start; events may precede first research; do not confuse conditional replay with strict native schedule.
- Ledger function actually ran in GPT JS and remote JSON was generated. Standalone Node CLI has not been executed. CLI path normalization (backslashes) and parity of output should be checked when using it. Do not claim tests passed.
- Some events' points only change score if score state modeled. Source-backed conditional events still have scheduling assumptions.
- Existing local and remote four core source blobs match as of final check. New changes by other workers may exist later; fetch current SHAs before edits.

## 7. 다음 세션 실행 지시 (생산 우선)
1. Read this handoff, current branch ledger and queue. Read AGENTS.md. Reuse workspace, do not reset mixed checkout. Confirm four start menu IDs, source fingerprint and pinned commit. Do not spend an entire turn only checking.
2. Produce targeted remaining legacy paths, not generic expansion. First add selection by explicit legacy ID/action type or offset list and resume from ledger (skip completed scenario jobs); current runner only supports --offset/--limit/--priority/--source. Keep old selection sorting unchanged, and distinguish scenario/difficulty/source identity. Batch receipts checkpoint atomically.
3. Priority 2 offsets are stable for pinned queue: 34 onward; 35 nepotism; 42 Japan Sun Warrior already success; 43/45 basic firearms; 46 proud warrior; 47 nepotism; 51 Magos; 80/82/84 gladiator. Inspect exact suffix before spending time. Do not pretend offset 42 succeeded in Siberia. Reuse old successful witnesses, prioritize first real training combinations.
4. Remaining source-backed supply P0: COLT45 purchase requires its own research plus STR_CONTACT_GENERAL_SUPPLIES; research needs item. Trace initial genuine map/craft/unit loot or event, not circular purchase. STR_BOUNTY_HUNTING_PRIZE_MARTIAL_ARTS has a manufacture of the same ID requiring STR_BOUNTY_HUNTING_PRIZE_MARTIAL_ARTS_PREQ; inspect full recipe and trophy-credit sources. STR_ZAN_01 appears as missionBountyItem in Piratez_Factions.rul deployment with unlockedResearch STR_LABYRINTHUS_NOCTIS_DONE; trace exact deployment/missionScripts/transport, victory and actual reward. Do not use arbitrary externalInputs. Other failed training paths: STR_BUSHIDO_HANDBOOK (Japan route solved), STR_ACADEMY_COUNSELLOR / STR_CONTACT_MERCENARIES, STR_BIG_BONE / STR_SHAMBLER_CORPSE.
5. Reproduce missing prefix groups and parent links in parallel only after start gate retained. Rebuild existing terminal combinations from new chronological witnesses, re-evaluate stats/traits and compare legacy endpoints. Only count a terminal when an actual complete witness and endpoint acceptance exist.
6. Upload each changed source using GitHub update_file with fetched blob SHA, create_file for new receipts. For local output use read_chunk with offsetBytes, limitBytes 24576, verify same sha256 across chunks and parse JSON. Update unified ledger immediately after batch upload; use all inputs listed by existing ledger plus new receipts. GPT JS can run buildCampaignRepairLedger on fetched JSON without local Python. Preserve old successes, record failures, dedup routeId and scenario job key. Never silently promote to terminal/native. Main/Pages integration only after common canonical registry acceptance; no independent public viewer.
7. Each turn deliver actual code or data, report new unique successes, source/commit and blockers. Keep no-new-work reports truthful.

## 8. Reproduction commands
In the existing DevSpace workspace, Node.js (not Python):
```bash
node tools/build-atlas-campaign-repair-suffixes-v1.mjs --repo=D:/xpiratez-data-atlas --prefix=campaign-prefix-repair-v2.json --queue=campaign-repair-worklist-v2.json.gz --country=STR_JAPAN --priority=2 --offset=42 --limit=1 --attempts=200 --out=campaign-suffix-repair-v1-japan42-repro.json
node tools/build-atlas-campaign-repair-suffixes-v1.mjs --repo=D:/xpiratez-data-atlas --prefix=campaign-prefix-repair-v2.json --queue=campaign-repair-worklist-v2.json.gz --country=STR_EGYPT --priority=2 --offset=2 --limit=1 --attempts=200 --out=campaign-suffix-repair-v1-egypt2-repro.json
node tools/build-atlas-campaign-repair-suffixes-v1.mjs --repo=D:/xpiratez-data-atlas --prefix=campaign-prefix-repair-v2.json --queue=campaign-repair-worklist-v2.json.gz --region=STR_SIBERIA --priority=2 --offset=34 --limit=8 --attempts=180 --out=campaign-suffix-repair-v1-batch10-offset34.json
```
First two are proven runs with different output filenames to avoid overwrite. Third is suggested next batch, not executed. Use smaller chunks if the remote execution returns no result; first check whether checkpoint exists.
Ledger generator usage: node tools/build-atlas-campaign-repair-ledger-v1.mjs --out=public/data/campaign-repair-ledger-v1.json <all existing input receipt paths plus newly uploaded paths>. This CLI has not been run yet; GPT JS function execution is the confirmed generation method.
