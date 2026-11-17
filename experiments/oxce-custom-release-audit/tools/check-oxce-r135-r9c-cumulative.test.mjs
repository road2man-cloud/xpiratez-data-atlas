import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const base=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const r8=path.join(base,'R135-r8-search-five/src/Basescape');
const r9c=path.join(base,'R135-r9c-r8-cumulative/src/Battlescape');
const read=(p)=>fs.readFileSync(p,'utf8');

test('R8 visible onChange search on purchase/sale/manufacture/research',()=>{
 for(const state of ['PurchaseState','SellState','NewManufactureListState','NewResearchListState']){
  const s=read(path.join(r8,state+'.cpp'));
  assert.match(s,/_btnQuickSearch->onChange/);
  assert.match(s,/_btnQuickSearch->setVisible\(true\)/);
  assert.match(s,/btnQuickSearchApply/);
 }
});

test('R8 category grouping preserves purchase and sale row to item index',()=>{
 for(const state of ['PurchaseState','SellState']){
  const s=read(path.join(r8,state+'.cpp'));
  assert.match(s,/_rows.push_back\(i\)/);
  assert.match(s,/const size_t i = r7Order\[displayIndex\]/);
 }
});

test('R132 team-level new enemy detection keeps per-walk known set',()=>{
 const s=read(path.join(r9c,'UnitWalkBState.cpp'));
 assert.match(s,/r132SnapshotTeamVision/);
 assert.match(s,/r132NewEnemyInTeamVision/);
 assert.match(s,/known.insert\(enemy\)\.second/);
 assert.match(s,/r132WalkTeamKnown.erase\(this\)/);
});

test('R132 experience screen highlights selected soldier',()=>{
 const s=read(path.join(r9c,'ExperienceOverviewState.cpp'));
 assert.match(s,/_lstSoldiers->setCellColor\(row, 0/);
 assert.match(s,/getSelectedUnit\(\)/);
});

test('R132 XP blocked hostile tile marker is separate from surrender',()=>{
 const s=read(path.join(r9c,'Map.cpp'));
 assert.match(s,/Tag\.IXP_HOSTILE_UNIT_XP_BLOCK_LEVEL/);
 assert.match(s,/getOriginalFaction\(\) == FACTION_HOSTILE/);
 assert.match(s,/getScriptUnitTag\(xpBlockTag\) >= 2/);
});

test('R134 backtick action cycle ignores non-shooting and incompatible launcher modes',()=>{
 const s=read(path.join(r9c,'BattlescapeState.cpp'));
 assert.match(s,/mode->shots <= 0/);
 assert.match(s,/clashesWithLauncher/);
 assert.match(s,/getActionConf\(BA_LAUNCH\)/);
});

test('R9C provenance uses R8 archive and R132/R134 donors',()=>{
 const s=read(path.join(base,'R135-r9c-r8-cumulative/build_r9c.ps1'));
 assert.match(s,/objects_r135_r8_r131baseline\.a/);
 const receipt=read(path.join(base,'R135-r9c-r8-cumulative/R9C_FEATURE_LEDGER_KO.md'));
 assert.match(receipt,/objects_r132_integrated\.a/);
 assert.match(receipt,/objects_r134_integrated\.a/);
 assert.match(s,/413/);
 assert.match(read(path.join(base,'R135-r9c-r8-cumulative/src/main.cpp')),/R135-R9C-R8-CUMULATIVE/);
});
