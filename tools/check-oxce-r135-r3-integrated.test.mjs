import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
const root=path.resolve('experiments/oxce-custom-release-audit');
const r3=(file)=>fs.readFileSync(path.join(root,'R135-r3',file),'utf8');
const r2=(file)=>fs.readFileSync(path.join(root,'R135-r2',file),'utf8');

test('R135-r3 medical before whip before optional grenade fill',()=>{
 const s=r3('Battlescape/InventoryState.cpp');
 const ammo=s.indexOf('R125: spare magazines are budgeted');
 const medical=s.indexOf('R134: issue functional medical gear');
 const whip=s.indexOf('Priority 2: leather whip, then stun rod.');
 const grenades=s.indexOf('R132: preferred 1+1+1 HE/frag/WP kit');
 assert.ok(ammo>=0 && medical>ammo && whip>medical && grenades>whip);
});
test('R135-r3 still stops at 15 complete attacks and retains manual gear',()=>{
 const s=r3('Battlescape/InventoryState.cpp');
 assert.ok(s.includes('const int spareLimit = 15;'));
 assert.ok(s.includes('spares >= spareLimit || shotsPacked >= 15'));
 assert.ok(s.includes('if (r128NewPrimary && shotsPacked < 15)'));
 assert.ok(s.includes('R133 AutoAll timing'));
 assert.ok(s.includes('fillWearSlot(wearJewelry)'));
 assert.ok(s.includes('r131LowTuButton->onMouseClick'));
});
test('R135-r3 list Backspace and header use matching handler; Escape intact',()=>{
 const cpp=r3('Basescape/SoldiersState.cpp');
 const header=r3('Basescape/SoldiersState.h');
 const symbol='btnTransformationsOverviewBackspace';
 assert.ok(cpp.includes('&SoldiersState::'+symbol+', SDLK_BACKSPACE'));
 assert.ok(header.includes('void '+symbol+'(Action *action);'));
 assert.ok(cpp.includes('void SoldiersState::'+symbol+'(Action *)'));
 assert.ok(cpp.includes('_cbxScreenActions->getSelected() > _mainOffset'));
 assert.ok(cpp.includes('btnTransformationsOverviewClick(nullptr)'));
 assert.ok(cpp.includes('SoldiersState::btnOkClick, Options::keyCancel'));
});
test('R135-r2 transformation popup Backspace and earlier features preserved',()=>{
 const d=r2('Basescape/SoldierTransformationState.cpp');
 const h=r2('Basescape/SoldierTransformationState.h');
 assert.ok(d.includes('SoldierTransformationState::btnOverviewClick, SDLK_BACKSPACE'));
 assert.ok(d.includes('new SoldierTransformationListState(_base, _overviewScreenActions)'));
 assert.ok(h.includes('_overviewScreenActions'));
});
