import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
const root=path.resolve('experiments/oxce-custom-release-audit/R135-r7-r131baseline/src');
const source=p=>fs.readFileSync(path.join(root,p),'utf8');
test('manufacture default all-items displays group/indent without fake selection rows',()=>{
 const s=source('Basescape/NewManufactureListState.cpp');
 assert.ok(s.includes('r7GroupManufacture'));
 assert.ok(s.includes('std::stable_sort(_possibleProductions.begin()'));
 assert.ok(s.includes('r7Name.insert(0, "    ")'));
 assert.ok(s.includes('_displayedStrings.push_back(manuf->getName().c_str());'));
 assert.ok(s.includes('_lstManufacture->addRow(3, r7Name.c_str()'));
 assert.ok(s.includes('r7PreviousCategory != manuf->getCategory()'));
});
test('sell screen grouping preserves actual item index and amount/transaction mapping',()=>{
 const s=source('Basescape/SellState.cpp');
 assert.ok(s.includes('r7GroupSales = !categoryFilterEnabled'));
 assert.ok(s.includes('_currentSort == TransferSortDirection::BY_LIST_ORDER'));
 assert.ok(s.includes('std::stable_sort(r7Order.begin(),r7Order.end()') || s.includes('std::stable_sort(r7Order.begin(), r7Order.end()'));
 assert.ok(s.includes('const size_t i = r7Order[displayIndex];'));
 assert.ok(s.includes('name.insert(0, "    ")'));
 assert.ok(s.includes('_rows.push_back(i);'));
 assert.ok(s.includes('ssAmount << _items[i].amount;'));
});
test('Backspace returns to overview conditionally, without removing detail Escape',()=>{
 const s=source('Basescape/SoldiersState.cpp');
 const h=source('Basescape/SoldiersState.h');
 const detail=source('Basescape/SoldierTransformationState.cpp');
 assert.ok(h.includes('void btnTransformationsBackClick(Action *action);'));
 assert.ok(s.includes('&SoldiersState::btnTransformationsBackClick, SDLK_BACKSPACE'));
 assert.ok(s.includes('_cbxScreenActions->getSelected() > _mainOffset'));
 assert.ok(detail.includes('&SoldierTransformationState::btnOverviewClick, SDLK_BACKSPACE'));
 assert.ok(detail.includes('Options::keyCancel'));
});
test('inventory continues R135 ammo cap, medical, whip, R133 performance',()=>{
 const s=source('Battlescape/InventoryState.cpp');
 for(const token of ['const int spareLimit = 15;', 'spares >= spareLimit || shotsPacked >= 15', 'R133 AutoAll timing', 'r133RelevantRules', 'fillWearSlot', 'r131LowTuButton'])assert.ok(s.includes(token),token);
 const ammo=s.indexOf('R125: spare magazines');
 const med=s.indexOf('R134: issue functional medical gear');
 const whip=s.indexOf('Priority 2: leather whip');
 const gren=s.indexOf('R132: preferred 1+1+1');
 assert.ok(ammo>0 && med>ammo && whip>med && gren>whip,String([ammo,med,whip,gren]));
});
test('R135 R7 title is distinct from R6',()=>{
 const m=source('main.cpp');
 assert.ok(m.includes('R135-R7-CATEGORY-GROUPS'));
 assert.ok(!m.includes('R135-R6-AMMO-MED-AUTOALL'));
});
