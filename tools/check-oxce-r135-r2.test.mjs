import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
const root=path.resolve('experiments/oxce-custom-release-audit');
const read=(rev,file)=>fs.readFileSync(path.join(root,rev,file),'utf8');
const inv=read('R135-r2','Battlescape/InventoryState.cpp');
const detail=read('R135-r2','Basescape/SoldierTransformationState.cpp');
const header=read('R135-r2','Basescape/SoldierTransformationState.h');
const soldiers=read('R135-r2','Basescape/SoldiersState.cpp');
const chooser=read('R135-r2','Basescape/SoldierTransformState.cpp');
test('R135-r2 physically budgets auto-primary magazines for 15 complete actions',()=>{
  assert.match(inv,/if\s*\(ready\s*>=\s*15\)\s*break/);
  assert.match(inv,/if\s*\(ready\s*<\s*15\)/);
  assert.match(inv,/r129ReadyAttacks\[unit\]\s*=\s*ready/);
  assert.match(inv,/const int spareLimit\s*=\s*15/);
  assert.match(inv,/spares\s*>=\s*spareLimit\s*\|\|\s*shotsPacked\s*>=\s*15/);
  assert.doesNotMatch(inv,/const int spareLimit\s*=\s*\(limited\s*\|\|\s*r128NewPrimary\)\s*\?\s*15\s*:\s*2/);
});
test('R135-r2 whip before secondary magazine and grenade allocations',()=>{
 const whip=inv.indexOf('// Priority 2: leather whip');
 const spare=inv.indexOf('// R125: spare magazines');
 const grenades=inv.indexOf('// R132: preferred 1+1+1 HE/frag/WP kit');
 assert.ok(whip>0 && whip<spare && spare<grenades);
 assert.match(inv,/isWhip\(item->getRules\(\)\)/);
 assert.match(inv,/fit\(unit, item, 0, false\)/);
});
test('R135-r2 retains R133 cache and R134 medical/offhand/wear',()=>{
 for(const key of ['r133RelevantRules','r133GroundShots','R133 AutoAll timing','physicallyPermitted','bestOffhand','fillWearSlot','r131LowTuButton->setText("저TU")'])assert.ok(inv.includes(key),key);
});
test('R135-r2 Backspace routes to transformation overview and does not start transformation',()=>{
 assert.match(detail,/onKeyboardPress\(\(ActionHandler\)&SoldierTransformationState::btnOverviewClick, SDLK_BACKSPACE\)/);
 assert.match(detail,/void SoldierTransformationState::btnOverviewClick\(Action \*\)/);
 assert.match(detail,/_game->popState\(\);\s*_game->pushState\(new SoldierTransformationListState\(_base, _overviewScreenActions\)\)/);
 assert.ok(detail.includes('if (!_overviewScreenActions)'));
 assert.ok(header.includes('ComboBox *_overviewScreenActions'));
 assert.ok(soldiers.includes('&_filteredListOfSoldiers, _cbxScreenActions, static_cast<int>(_mainOffset)'));
 assert.ok(chooser.includes('new SoldierTransformationState(transformationRule, _base, soldier, nullptr)'));
});
