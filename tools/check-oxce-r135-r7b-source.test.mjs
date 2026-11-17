import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const base = path.resolve('experiments/oxce-custom-release-audit');
const r7 = p => fs.readFileSync(path.join(base, 'R135-r7-r131baseline/src', p), 'utf8');
const r7b = p => fs.readFileSync(path.join(base, 'R135-r7b-r131baseline/src', p), 'utf8');

test('R7B first manufacturing row always gets category marker, even for empty category', () => {
 const src = r7b('Basescape/NewManufactureListState.cpp');
 assert.match(src,/bool r7HasPreviousCategory = false;/);
 assert.match(src,/!r7HasPreviousCategory \|\| r7PreviousCategory != manuf->getCategory\(\)/);
 assert.match(src,/r7HasPreviousCategory = true;/);
 assert.match(src,/manuf->getCategory\(\)\.empty\(\) \? "STR_UNASSIGNED"/);
 assert.match(src,/r7Name\.insert\(0, "    "\)/);
 assert.match(src,/_displayedStrings\.push_back\(manuf->getName\(\)\.c_str\(\)\)/);
});

test('R7B selling lists category first item and indents subsequent rows, including empty category', () => {
 const src = r7b('Basescape/SellState.cpp');
 assert.match(src,/bool r7HasPreviousGroup = false;/);
 assert.match(src,/!r7HasPreviousGroup \|\| group != r7PreviousGroup/);
 assert.match(src,/r7HasPreviousGroup = true;/);
 assert.match(src,/group\.empty\(\) \? "STR_UNASSIGNED" : group/);
 assert.match(src,/name\.insert\(0, "    "\)/);
 assert.match(src,/const size_t i = r7Order\[displayIndex\]/);
 assert.match(src,/_rows\.push_back\(i\)/);
 assert.match(src,/if \(_items\[i\]\.amount > 0\)/);
});

test('R7B preserves search, filter and user sort pathways', () => {
 const sell = r7b('Basescape/SellState.cpp');
 const manu = r7b('Basescape/NewManufactureListState.cpp');
 assert.match(sell,/r7GroupSales = !categoryFilterEnabled/);
 assert.match(sell,/_currentSort == TransferSortDirection::BY_LIST_ORDER/);
 assert.match(sell,/if \(!searchString\.empty\(\)\)/);
 assert.match(manu,/r7GroupManufacture = _catStrings\[_cbxCategory->getSelected\(\)\] == "STR_ALL_ITEMS"/);
 assert.match(manu,/std::stable_sort\(_possibleProductions\.begin\(\), _possibleProductions\.end\(\)/);
});

test('R7B inherits preserved Backspace and inventory fixes from R131-based R7', () => {
 const soldiers = r7('Basescape/SoldiersState.cpp');
 const detail = r7('Basescape/SoldierTransformationState.cpp');
 const inventory = r7('Battlescape/InventoryState.cpp');
 assert.match(soldiers,/&SoldiersState::btnTransformationsBackClick, SDLK_BACKSPACE/);
 assert.match(detail,/&SoldierTransformationState::btnOverviewClick, SDLK_BACKSPACE/);
 for(const k of ['const int spareLimit = 15;', 'R133 AutoAll timing', 'fillWearSlot', 'r131LowTuButton']) {
   assert.ok(inventory.includes(k), k);
 }
});

test('R7B compiled title distinguishes its build from R7', () => {
 const src = r7b('main.cpp');
 assert.ok(src.includes('R135-R7B-CATEGORY-GROUPS'));
 assert.ok(!src.includes('R135-R7-CATEGORY-GROUPS'));
});

test('pure boundary cases do not suppress first category row nor alter underlying indices', () => {
 function grouped(entries){
   const order=entries.map((_,i)=>i).sort((a,b)=>entries[a].category.localeCompare(entries[b].category));
   let hasPrev=false,prev='';
   return order.map(i=>{
     const group=entries[i].category;
     const title=!hasPrev||group!==prev
       ? '['+(group || 'STR_UNASSIGNED')+'] '+entries[i].name
       : '    '+entries[i].name;
     hasPrev=true;prev=group;
     return {originalIndex:i,title};
   });
 }
 const rows=grouped([
   {name:'first unassigned',category:''},
   {name:'ammunition',category:'ammo'},
   {name:'second unassigned',category:''},
   {name:'second ammunition',category:'ammo'}
 ]);
 assert.deepEqual(rows.map(x=>x.originalIndex),[0,2,1,3]);
 assert.deepEqual(rows.map(x=>x.title),[
   '[STR_UNASSIGNED] first unassigned','    second unassigned','[ammo] ammunition','    second ammunition'
 ]);
});
