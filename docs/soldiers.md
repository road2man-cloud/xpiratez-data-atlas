# Soldier database verification notes

Baseline: XPiratez v.o1.1.1 / OpenXcom Extended 8.6.

## Coverage

The generated soldier database contains:

- 29 merged `soldiers` rules: internal body/growth archetypes, not the practical soldier count
- 72 acquisition profiles: 15 direct hires + 48 manufacture/recruitment spawns + 9 event spawns
- 83 soldier transformation/training routes
- 998 `soldierBonuses` definitions
- Saint Reinforcements: 31 weighted slots representing 15 unique acquisition outcomes

The acquisition profiles are the main comparison unit because the same base Soldier Type can be created through multiple routes with different fixed stats and automatic traits. For example, STR_SOLDIER_PEASANT currently has eight distinct scripted acquisition profiles before counting its normal direct-hire form.

## Effective generated stats

For each spawn profile, the database calculates three effective stat bands:

- minimum
- average
- maximum

The calculation mirrors the engine order:

1. Generate a soldier from the soldier rule's min/max stats.
2. Apply `spawnedSoldier.currentStats` template overrides.
3. Read the template's `transformationBonuses`.
4. Add each unique `RuleSoldierBonus.stats` once.
5. Apply OXCE fixed minimums (health >= 1, other stats >= 0).

Armor stat modifiers are intentionally excluded from the "trait-included generated stats" columns; the user can therefore compare intrinsic soldier + automatic trait performance without equipment contamination.

### Psi Skill exception

OXCE `Soldier::prepareStatsWithBonuses` prevents soldier bonuses from unlocking Psi Skill when the base current Psi Skill is 0 or lower. The database mirrors that behavior.

### Bonus counts

The save format stores transformation bonuses as a map with integer counts, but OXCE `Soldier::getBonuses()` resolves unique bonus rule pointers before stats are applied. Therefore a present bonus contributes its stat rule once even if its stored count is greater than one.

## Sortable stats

Both base soldier types and real spawn profiles can be sorted by:

- TU
- stamina
- health
- bravery
- reactions
- firing
- throwing
- strength
- Psi Strength
- Psi Skill
- melee
- mana

For base soldier types the UI can switch between generated minimum / average / maximum values.

For spawn profiles, the same minimum / average / maximum bands include all automatic stat-changing traits attached at creation time.

## Example

`STR_DAMSEL_OF_WAR_RECRUITMENT` sets firing to 123 in its spawned soldier template and automatically grants:

- Glamourous
- Supersoldier
- Career Soldier

Those soldier bonuses contribute +13 firing in total, so the database displays an effective generated firing value of **136**, not 123.

This distinction is why acquisition profiles are separate rows instead of collapsing all recruits into their underlying soldier type.


## Counting terminology

Do not describe the database as "29 soldier types" without qualification.

- **29 base Soldier rules** describe body/growth/stat-cap behavior.
- **72 acquisition profiles** are the practical initial states a player can receive from hiring, manufacturing/recruitment, or events.
- **83 transformations** describe post-acquisition training, mutation, class changes, and other derived states. They can stack under compatibility rules, so there is no single small "final class count" obtained by simply adding 72 + 83.

If two acquisition routes share the same base Soldier Type but differ in `currentStats`, `transformationBonuses`, armor, rank, or other spawn-template state, they remain separate rows.

## Saint Reinforcements

`STR_SAINTS_REINFORCEMENTS` has 31 weighted list slots but only 15 unique item outcomes. Those 15 all map to acquisition profiles in the soldier database. Each profile records:

- Saint slot count
- exact slot probability out of 31
- underlying Soldier Type
- spawn-template fixed stats
- automatic transformation bonuses
- effective trait-included generated stats


## Growth caps and sorting

Every stat in the acquisition and base-rule tables is shown as:

`generated stat / effective growth cap`

For acquisition profiles:

- raw growth cap = the underlying `RuleSoldier.statCaps`
- effective growth cap = raw growth cap + stat modifiers from automatic creation-time soldier bonuses
- training cap = `RuleSoldier.trainingStatCaps`, shown separately in detail views

The main table can sort each stat column by either the selected generated value (min/avg/max) or by the effective growth cap.

Automatic bonus stats are outside the intrinsic `statCaps` system in OXCE. Therefore an automatic +13 firing bonus on a body with firing cap 120 produces an effective displayed growth cap of 133. Spawn templates and transformations may also create a soldier already above the intrinsic cap; those cases are valid and are highlighted rather than clamped down.
