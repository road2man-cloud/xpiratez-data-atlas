# Captain Matrix verification notes

Baseline: XPiratez v.o1.1.1 / OpenXcom Extended 8.6.

## Scope

The captain module covers:

- initial captains: JACKASS, DUMBASS, LAZYASS, SOREASS, PUSSY
- PUSSY class branches: THIEF, PRIEST, MAGE, RULER, UNCLASSED
- Unclassed hybrid branches: DUMBLAZY, LAZYSORE, SOREDUMB, JACKSORE, JACKDUMB, JACKLAZY
- Pure gate and GOLD / GREEN / RED / GRAY / ULTIMATE endpoints

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
