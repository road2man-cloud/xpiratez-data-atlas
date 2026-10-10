# Captain Matrix verification notes

Baseline: XPiratez v.o1.1.1 / OpenXcom Extended 8.6.

## Scope

The captain module covers:

- initial captains: JACKASS, DUMBASS, LAZYASS, SOREASS, PUSSY
- PUSSY class branches: THIEF, PRIEST, MAGE, RULER, UNCLASSED
- Unclassed hybrid branches: DUMBLAZY, LAZYSORE, SOREDUMB, JACKSORE, JACKDUMB, JACKLAZY
- Pure gate and GOLD / GREEN / RED / GRAY / ULTIMATE endpoints

## Directional branch exclusions (v.o1.1.1)

Run `npm run check:choices` before deploying. The first check verifies coverage of question-labelled topics, mutual components and external blockers. The second (`tools/check-choice-exclusions.mjs`) compares **the exact directed `disables` targets** for all 22 captain choices and 8 Codex declarations, checks the 18 additional groups, and verifies cross-story gates. It also verifies that the module and published copies match.

The normalized research data has 163 `disables`-bearing topics and 440 directed disable links, 171 of which have no reverse link. A one-way disable must not automatically be mirrored. In particular, four missing-Codex EXP nodes are consequences of prerequisites, *not* direct mutual-disable choices. The ordinary six Dr. X outcomes disable one another, but the Aurora-specific GDX_018 is unlocked by TEC_168, which blocks those six; TEC_169 blocks GDX_018. These distinctions must survive future content changes.

The public branch page has a **save-backed choice simulator**. It reads a user-selected OXCE plain-UTF-8 YAML `.sav` locally (without uploading it), extracts the second document's `discovered`, `researchRuleStatus`, and research-only fields from `researchDiary`, and treats `researchRuleStatus=2` as authoritative permanent disabled status. Current engine code (`SavedGame::addFinishedResearch` in OXCE 8.6) removes previously discovered targets of a new research's `disables` **from the completed set**, then records status=2. `reenables` resets the disabled flag without rediscovering the target. The simulator models these mechanics sequentially and distinguishes direct permanent blocks from nominal prerequisite-route risks; it uses dated research diary entries and sourceType (0=base, 1=free from, 2=free after, 3=mission, 4=event) to display historical evidence and *candidate* disable causes backed by raw rules, but does NOT treat diary alone as authoritative completion, nor simulate auto-granted zero-cost research, the getOneFree random draw, completed item/event reward reversal, facilities, mission state, timing or difficulty. Manually entered completed IDs cannot establish historical order; applying a manual list clears the save's authoritative disabled set. Regression gates include `tools/check-choice-engine-coverage.mjs` (independent check against all 4,612 published effective raw research rules), `tools/check-choice-simulator.mjs`, `tools/check-save-import.mjs` (including OXCE diary flow/block fixtures), and mobile browser smoke. In v.o1.1.1 raw rules there are zero reenables, 396 getOneFree sources and 102 conditional getOneFree sources; no RNG outcome may be invented. Only actual `.sav` test files can prove compatibility with specific save variants, since the fixture exercises the writer-defined YAML structure. Internal/result/aftermath PREQ flags are not all shown as distinct player-facing choices.

### Engine-correct research gateways

`npm run build:choice-gates` rebuilds the compact `public/data/choice-research-gates.json` sidecar from every published effective-raw research entry after a full data rebuild. The simulator now checks OXCE `getAvailableResearchProjects()` rules: `dependencies` can be bypassed by the `unlocks` list of **currently discovered** research, but `requires` cannot. Direct permanent disabled status takes precedence. Base stock, facilities and active projects are explicitly **not** asserted from save metadata, so a candidate remains an assumption, not confirmed available research.

Free reward lists are advisory: `getOneFree` can have duplicate target IDs which OXCE inserts multiple times into its random selection vector, providing weights; `getOneFreeProtected` candidates enter only when their prerequisite is discovered. The Atlas preserves these duplicates and exposes eligible candidate species versus weighted lottery tickets, but never invents an RNG result or automatically completes that topic. The current raw mod contains 186 getOneFree and nine dependency references not represented in its normalized 4,612-topic catalog; they are counted as unresolved and are excluded from firm claims. Continuous regression compares both gate arrays and their weighted contents against the published effective raw rule chunks.

## Status semantics

- `yes`: the captain path naturally supplies the captain/personality tag needed by the feature.
- `late`: obtainable only after later personality tests, color/Codex progression or other late conditions.
- `warn`: accessible, but the feature carries a large structural penalty.
- `no`: the path does not naturally provide the required tag or explicitly disables the feature.

Research prerequisites beyond the captain tag are not collapsed into the O/X mark; they are described in the row notes.

## Event EV

Recurring captain event cash EV is computed from:

`monthly EV = sum(monthly execution probability × expected immediate cash-equivalent reward)`

Included:
- direct funds
- items with a positive current-difficulty sell value

Excluded and documented separately:
- soldiers
- research unlocks
- missions
- score/reputation
- strategic items whose sale would destroy more value than it realizes

At Experienced difficulty the sell-price coefficient is 100%.

## Important mechanics verified against OXCE

### Research dependencies

Normal `dependencies:` are AND checks. A research unlocked directly through `unlocks:` can bypass the normal dependency availability path.

### Weighted event/item lists

A weighted list selects one row per roll. Random item lists select one item uniformly.

### Irradiator Tower

Geoscape defense weapons do not shoot arbitrary UFOs passing the base. Their `defense` / `hitRatio` values are used when a UFO actually attacks the base and the Base Defense sequence runs.

Irradiator Tower:
- build cost: 1,450,000
- monthly: 60,000
- defense: 333
- hit ratio: 100
- radar range: 1600
- radar chance: 40
- hyperwave: true
- sickBayAbsoluteBonus: -0.35

With no other healing modifiers, one tower changes the base daily wound recovery contribution from 1.00 to 0.65, making equivalent recovery times about 1.54× longer.

### Bunker

The Bunker is a tactical base-defense facility. Its map tile spawns an allied fixed 14 mm turret.

Turret highlights:
- HP 75
- armor 75 / 65 / 65 / 60
- mounted 14 mm weapon
- power 66
- 4-round burst
- 30% TU
- infinite ammunition
- up to roughly 12 rounds per turn from its 50 TU budget

### Necrodefenses

Necrodefenses is not a stronger tower. It is an alternate Flak Tower Kit manufacturing route replacing rare small cannons/ammunition with 25 Necroplane Parts, at higher worker-hour cost.

### Tactical Center

- build cost: 600,000
- monthly: 50,000
- radar range: 10800
- radar chance: 4
- requires 50 personal-data items (internal STR_GOVT_CORPSE)

It is an intelligence/detection facility, not a weapon.

## Soldier training

### Basic Firearms Training
- firing +10
- reactions +3

### Boot Camp
For compatible troops:
- stamina +10
- bravery +10
- reactions +5
- firing +15
- throwing +5
- strength +10
- melee +5
- mana +10

The negative `percentGainedStatChange` fields apply to gains above original stats, creating diminishing returns rather than subtracting the listed percentage from total current stats.

### Military Drill
Ruler-specific continuation after Boot Camp:
- TU +5
- stamina +10
- health +5
- bravery +10
- reactions +5
- firing +5
- throwing +5
- melee +5
- mana +10
- psi strength +15
plus the transformation bonus package.

### Bread and Fishes
Priest route; favors stamina, health, strength and armor rather than marksmanship.

### Warrior Culture / Proud Warrior
JackDumb, Pure Red and Chaos Saint routes can access the melee/throwing-oriented Proud Warrior transformation.

## Chaos Saint

The four non-PUSSY starting captains can eventually reach Chaos Saint after obtaining all four color captain tags. PUSSY is explicitly excluded.

Before the Lizardman Statue condition changes the pool, Saint Reinforcements average about 0.652 successful special-person rolls per month, or one every ~1.53 months.

Dumbass + Saint has an additional 7% monthly Orthodox Mage Damsel event with +100,000 funds.

## Ultimate

The Ultimate captain event:
- 63% monthly execution probability
- +666,000 funds
- +666 score
- no item cost, debt or combat consequence in the event itself

Core monthly cash EV: 419,580.

The larger ~579k/month figure shown in the matrix includes other no-color / missing-color-pair events while Ultimate remains colorless; adding Codex colors disables some of those extra event pools.

For the referenced 2601-01-26 save, the shortest personality-test timeline makes the first Ultimate monthly payout roll occur on 2601-05-01.

## Codex: second mutually-exclusive axis

The four base Codex researches are an explicit one-of-four choice.

- Gold Codex disables Gray / Green / Red Codex.
- Green Codex disables Gray / Red / Gold Codex.
- Red Codex disables Gray / Green / Gold Codex.
- Gray Codex disables Red / Green / Gold Codex.

Awakening the chosen Codex unlocks the matching captain color:

- Gold Awakening -> `STR_CAPTAIN_GOLD`
- Green Awakening -> `STR_CAPTAIN_GREEN`
- Red Awakening -> `STR_CAPTAIN_RED`
- Gray Awakening -> `STR_CAPTAIN_GRAY`

For the four non-PUSSY starting captains, the missing color has no other reachable supplier on that captain route. Therefore choosing the wrong Codex permanently closes the Codex route to Chaos Saint:

- Jackass starts Gold + Red + Gray -> choose **Green Codex**
- Dumbass starts Gold + Green + Red -> choose **Gray Codex**
- Lazyass starts Gold + Green + Gray -> choose **Red Codex**
- Soreass starts Green + Red + Gray -> choose **Gold Codex**

PUSSY-derived routes cannot become Chaos Saint regardless because the Saint trigger explicitly requires `STR_CAPTAIN_PUSSY: false`.

### Codex direct tech and awakening rewards

| Codex | Direct tech | Awakening reward | Base god-gift branch |
|---|---|---|---|
| Gold | Officer's Baton, Flame Cannon Report | Porn x36 + Captain Gold | G1 |
| Green | Bioplasma Projector Report | Active Transdimensional Locker x3 + Captain Green | G3 |
| Red | Little Ilya Report | Living Brimstone x4 + 200 score + Captain Red | G5 |
| Gray | Conversion Launcher Report | Esoterica x7 + Captain Gray | G7 |

Captain hybrid tags add extra god-gift branches:

- DumbLazy: Gold G2A / Green G2B
- SoreDumb: Red G4A / Green G4B
- JackSore: Red G6A / Gray G6B
- JackLazy: Gold G8A / Gray G8B

The captain matrix renders these as the final four columns of the same table, so captain and Codex exclusivity can be evaluated together.

### Ultimate interaction

Ultimate is colorless initially. Awakening any Codex adds one captain color. The core Ultimate event (+666,000 at 63% monthly probability) remains, but some no-color / missing-color-pair event pools disappear, so the larger colorless ~579k/month aggregate EV declines after taking a Codex color.
