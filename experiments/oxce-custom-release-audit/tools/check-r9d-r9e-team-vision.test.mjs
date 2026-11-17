import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const base = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const r9d = path.join(base, 'R135-r9d-f12-recovered');
const r9e = path.join(base, 'R135-r9e-team-vision');
const read = (root, suffix) => fs.readFileSync(path.join(root, suffix), 'utf8');

test('R9D restores R100 F12 enemy census and R132 selected-soldier emphasis', () => {
  const s = read(r9d, 'src/Battlescape/ExperienceOverviewState.cpp');
  for (const token of [
    'FIGHT ', 'INTENT ', 'SURRENDERING ', 'KO ', 'TOTAL ', 'START ',
    'activeEnemyCoordinates', 'getR32InitialHostiles()', 'enemyCoordinates->setText',
    'soldier == _game->getSavedGame()->getSavedBattle()->getSelectedUnit()',
    '_lstSoldiers->setCellColor(row, 0'
  ]) assert.ok(s.includes(token), token);
});

test('R9E team snapshot includes teammate current FOV, per-turn memory, global visible flag', () => {
  const s = read(r9e, 'src/Battlescape/TeamVisionGate.h');
  for (const token of [
    'getVisible()', 'getVisibleUnits()', 'getUnitsSpottedThisTurn()',
    'getFaction() == FACTION_HOSTILE', 'getFaction() != FACTION_PLAYER',
    '!enemy->isOut()', 'known.insert(enemy).second', 'save->getSide() != FACTION_PLAYER'
  ]) assert.ok(s.includes(token), token);
});

test('R9E walk gate snapshots at init, checks after step and in-turn rotation, frees per-action state', () => {
  const s = read(r9e, 'src/Battlescape/UnitWalkBState.cpp');
  assert.ok(s.includes('r132WalkTeamKnown.erase(this)'), 'cleanup');
  assert.ok(s.includes('r9eCaptureTeamKnown(save)'), 'initial capture');
  assert.ok(s.includes('r9eTeamSawNewHostile(save, r132WalkTeamKnown[state])'), 'shared gate');
  assert.equal(s.split('r132NewEnemyInTeamVision(this, _parent->getSave())').length - 1, 2, 'step and turn checks');
  assert.ok(s.includes('!_action.ignoreSpottedEnemies'), 'Ctrl/Shift override');
});

test('R9E standalone turning uses team-wide gate in Bolt mode, personal fallback otherwise', () => {
  const s = read(r9e, 'src/Battlescape/UnitTurnBState.cpp');
  for (const token of [
    'Options::usainBoltMode', 'r9eCaptureTeamKnown(_parent->getSave())',
    'r9eTeamSawNewHostile(_parent->getSave(), teamKnown)',
    '_unit->getUnitsSpottedThisTurn().size() > unitSpotted',
    '_action.type == BA_NONE && genuinelyNewEnemy'
  ]) assert.ok(s.includes(token), token);
});

test('R9E inherits R9D archive intact except walking, turning and title', () => {
  const s = read(r9e, 'build_r9e.ps1');
  assert.ok(s.includes('objects_r135_r9d_r8_f12_census.a'), 'F12-preserving input');
  assert.ok(s.includes("$units=@('UnitWalkBState','UnitTurnBState','main')"));
  assert.ok(s.includes('if($after.Count -ne 413)'));
  assert.ok(read(r9e, 'src/main.cpp').includes('R135-R9E-TEAM-VISION-F12'));
});
