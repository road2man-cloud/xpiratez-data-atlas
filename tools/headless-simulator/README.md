# X-Piratez lightweight headless surrogate (experimental)

This directory contains a deterministic independent battle **approximation**. It is **NOT OXCE**, does not reproduce full OXCE combat/AI, and does not certify victory in the actual game.

## Use (Node.js 18+, no npm install)

    node tools/headless-simulator/simulate.mjs 17.sav --runs 5000 --seed 20261028 --turns 14

Test:

    node --test tools/headless-simulator/test.mjs

With terrain: supply all mapdatasets MCDs extracted to one folder and active mod LOFTEMPS.DAT:

    node tools/headless-simulator/simulate.mjs 17.sav --runs 5000 --terrain-dir /path/to/MCDs --loft /path/to/LOFTEMPS.DAT

Save-game data is local input only; NEVER commit private campaign saves publicly. Simulator does not change save or game install.

## Constraints

- Without --terrain-dir and --loft, geometry is unavailable and line of sight is not validated.
- Optional geometry assumes 50x50x7 map, 23-byte tile records and 62-byte MCD entries based on inspected 17.sav. Other maps are not validated.
- Terrain collision is approximate centerline LOFT only; units, projectiles, arcs, partial cover and OXCE exact targeting are not reproduced.
- AI targeting, weapon power, TU, damage, morale, panic, armor and reactions are surrogate approximations.
- No OXCE process is launched, and no replay of the actual battle is performed.
- Victories are only MODEL victories: all enemies down and at least one ally alive before turn limit. Best unfinished runs are not victories.

Output JSON labels the model SURROGATE_APPROXIMATION_NOT_OXCE, verifiedFullEngine=false, seed, wins, flawless runs, loss rates, best seed and geometry status.

## Korean cross-chat instruction

GitHub road2man-cloud/xpiratez-data-atlas 의 tools/headless-simulator 을 사용하고 새로 첨부한 .sav 파일을 GPT 격리 실행 환경에서 분석하세요. Node.js로 test.mjs를 먼저 실행한 다음 simulate.mjs를 --runs 5000 --seed 20261028 로 실행하세요. 결과를 실제 OXCE 승리라고 오인하지 말고 근사 독립 시뮬레이터임을 반드시 표시하세요. MCD/LOFT 파일 없이 사선 검증 불가함을 표시하고, 미완료 시드도 승리로 세지 마세요.
