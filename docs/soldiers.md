# Soldier database verification notes

Baseline: XPiratez v.o1.1.1 / OpenXcom Extended 8.6.

## Coverage

The generated soldier database contains:

- 29 merged `soldiers` rules
- 57 real soldier spawn profiles from manufacture and event rules
- 998 `soldierBonuses` definitions

The spawn profiles are important because the same base soldier type can be created through multiple routes with different fixed stats and automatic traits.

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
