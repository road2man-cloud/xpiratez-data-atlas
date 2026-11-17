import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve('experiments/oxce-custom-release-audit/R135-r2');
const source = (file) => fs.readFileSync(path.join(root,file),'utf8');

test('R135-r2: all firearms cease automatic spare ammo placement after >=15 complete actions', () => {
  const s=source('Battlescape/InventoryState.cpp');
  assert.match(s,/const int spareLimit = 15;/);
  assert.match(s,/spares >= spareLimit \|\| shotsPacked >= 15/);
  assert.doesNotMatch(s,/const int spareLimit = \(limited \|\| r128NewPrimary\) \? 15 : 2/);
  assert.match(s,/loaded->getAmmoQuantity\(\) \/ spend/);
  assert.match(s,/carried->getAmmoQuantity\(\) \/ spend/);
  assert.match(s,/if \(ready >= 15\) break;/);
});
test('R135-r2: already held manual ammo and weapon never dropped by the ammo cap pass', () => {
  const s=source('Battlescape/InventoryState.cpp');
  assert.match(s,/if \(r128NewPrimary && shotsPacked < 15\)/);
  assert.match(s,/if \(r128NewPrimary && r129ReadyAttacks\[unit\] >= 15\)/);
  assert.match(s,/R128 AutoAll existing weapon ammo:/);
});
test('R135-r2: whip is issued ahead of optional loose spare ammunition', () => {
  const s=source('Battlescape/InventoryState.cpp');
  const whip=s.indexOf('Priority 2: leather whip, then stun rod.');
  const ammo=s.indexOf('R125: spare magazines are budgeted');
  const meds=s.indexOf('R134: issue functional medical gear');
  assert.ok(whip>0 && ammo>whip && meds>ammo, 'ordering: primary, whip/stun, spare ammo, medical');
  assert.match(s,/isWhip\(item->getRules\(\)\)/);
  assert.match(s,/fit\(unit, item, 0, false\)/);
});
test('R135-r2: preserve R131 to R134 features',()=>{
  const s=source('Battlescape/InventoryState.cpp');
  for(const anchor of ['r131LowTuButton->setText("저TU")','r132ClearButton->onMouseClick','R133 AutoAll timing','r133RelevantRules','physicallyPermitted','fillWearSlot','isGrenadeOrProxy','canFireLowTu','R128 AutoAll existing weapon ammo:']) assert.ok(s.includes(anchor),anchor);
});
test('R135-r2: Backspace navigates to overview and Escape remains cancellation',()=>{
  const s=source('Basescape/SoldierTransformationState.cpp');
  const h=source('Basescape/SoldierTransformationState.h');
  const list=source('Basescape/SoldiersState.cpp');
  assert.match(s,/SoldierTransformationState::btnOverviewClick, SDLK_BACKSPACE/);
  assert.match(s,/SoldierTransformationState::btnCancelClick, Options::keyCancel/);
  assert.match(s,/_overviewScreenActions->setSelected\(_overviewScreenActionIndex\)/);
  assert.match(s,/new SoldierTransformationListState\(_base, _overviewScreenActions\)/);
  assert.match(h,/ComboBox \*_overviewScreenActions/);
  assert.match(list,/&_filteredListOfSoldiers, _cbxScreenActions, static_cast<int>\(_mainOffset\)/);
});
