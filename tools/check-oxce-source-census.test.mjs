// Static preservation checks on imported REAL custom OXCE source snapshots.
// These do not replace a native compile or in-game tests.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
const root=path.resolve('experiments/oxce-custom-release-audit');
const load=(v,f='InventoryState.cpp')=>fs.readFileSync(path.join(root,v,f),'utf8');
test('R131 inherited lowTU button, actual callback and auto-all',()=>{
 const s=load('R131');
 for (const anchor of ['r131LowTuButton->onMouseClick','InventoryState::btnAutoAllClick','r131LowTuButton->setText("저TU")','_btnAutoAll->setText("전원자동")'])assert.ok(s.includes(anchor),anchor);
});
test('R132 clear and pre-existing lowTU, ammo eligibility stay in R134',()=>{
 const s=load('R134');
 for(const anchor of ['r132ClearButton->onMouseClick','btnAutoAllClearClick','r131LowTuButton->onMouseClick','R128 AutoAll existing weapon ammo:','canFireLowTu','isGrenadeOrProxy'])assert.ok(s.includes(anchor),anchor);
});
test('R133 optimization and R134 medical/offhand/wear code survive in next candidate',()=>{
 const s=load('R135-candidate');
 for(const anchor of ['R133 AutoAll timing','r133RelevantRules','physicallyPermitted','fillWearSlot','r133GroundShots','hasMedical','medOffhand','getActionTUs(BA_SNAPSHOT'])assert.ok(s.includes(anchor),anchor);
});
test('R135 lowTU label restored and slot fits between x230 and x270',()=>{
 const s=load('R135-candidate');
 assert.ok(s.includes('new TextButton(40, 11, 230, 125)'));
 assert.ok(s.includes('r131LowTuButton->setText("저TU")'));
 assert.ok(s.includes('new TextButton(19, 11, 251, 138)'));
 const match=s.match(/r131LowTuButton = new TextButton\((\d+),\s*(\d+),\s*(\d+),\s*(\d+)\)/);
 assert.ok(match);
 assert.equal(Number(match[3])+Number(match[1]),270);
});
test('R134 backquote skip unsupported shots remains in BattlescapeState',()=>{
 const s=load('R134','BattlescapeState.cpp');
 for(const anchor of ['mode->shots <= 0','clashesWithLauncher','getActionConf(BA_LAUNCH)'])assert.ok(s.includes(anchor),anchor);
});
