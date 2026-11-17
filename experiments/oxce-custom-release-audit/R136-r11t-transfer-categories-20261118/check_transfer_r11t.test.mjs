import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.dirname(fileURLToPath(import.meta.url));
const cpp=fs.readFileSync(path.join(root,'src/Basescape/TransferItemsState.cpp'),'utf8');
const h=fs.readFileSync(path.join(root,'src/Basescape/TransferItemsState.h'),'utf8');
const main=fs.readFileSync(path.join(root,'src/main.cpp'),'utf8');
const build=fs.readFileSync(path.join(root,'build_r11t.ps1'),'utf8');

test('search is visible by default and filters while typing without pressing Enter',()=>{
  assert.match(cpp,/_btnQuickSearch->onChange\(\(ActionHandler\)&TransferItemsState::btnQuickSearchApply\);/);
  assert.match(cpp,/_btnQuickSearch->onEnter\(\(ActionHandler\)&TransferItemsState::btnQuickSearchApply\);/);
  assert.match(cpp,/_btnQuickSearch->setVisible\(true\);/);
  assert.match(cpp,/new TextEdit\(this, 84, 9, 10, 13\)/);
  assert.match(cpp,/void TransferItemsState::btnQuickSearchApply\(Action \*\)\s*\{\s*updateList\(\);/);
  assert.match(cpp,/Unicode::upperCase\(searchString\)/);
});

test('transfer uses dropdown first-match category priority, including mod categories',()=>{
  assert.match(cpp,/const bool r11tCustomCategories = _game->getMod\(\)->getDisplayCustomCategories\(\) > 0;/);
  assert.match(cpp,/for \(size_t rank = _vanillaCategories; rank < _cats\.size\(\); \+\+rank\)/);
  assert.match(cpp,/std::find\(categories.begin\(\), categories.end\(\), _cats\[rank\]\)/);
  assert.match(cpp,/return "STR_UNASSIGNED"/);
  assert.match(cpp,/return getCategory\(static_cast<int>\(index\)\)/);
});

test('all-items and destination-only lists group, other explicit categories and manual sorting unchanged',()=>{
  assert.match(cpp,/const bool r11tGrouped = \(allItems \|\| onlyItemsAtDestination\) &&\s*_currentSort == TransferSortDirection::BY_LIST_ORDER/);
  assert.match(cpp,/std::stable_sort\(r11tDisplayOrder\.begin\(\), r11tDisplayOrder\.end\(\)/);
  assert.match(cpp,/ranks\[a\] != ranks\[b\]/);
  assert.match(cpp,/keys\[a\] < keys\[b\]/);
  assert.match(cpp,/_previousSort != _currentSort/);
});

test('group header emitted after search/category/at-destination filtering',()=>{
  const search=cpp.indexOf('if (!searchString.empty())',cpp.indexOf('void TransferItemsState::updateList()'));
  const header=cpp.indexOf('if (r11tGrouped)',search);
  const text=cpp.indexOf('std::ostringstream ssQtySrc',header);
  assert.ok(search>=0 && header>search && text>header);
  assert.match(cpp,/r11tHasPreviousGroup = false/);
  assert.match(cpp,/r11tPreviousGroup = group/);
  assert.match(cpp,/name = "\[" \+ std::string\(tr\(group\.empty\(\) \? "STR_UNASSIGNED" : group\)\) \+ "\] " \+ name/);
  assert.match(cpp,/else name\.insert\(0, "    "\)/);
});

test('arrow quantity handlers and actual transfer amounts keep original row mapping',()=>{
  assert.match(cpp,/const size_t i = r11tDisplayOrder\[visibleIndex\]/);
  assert.match(cpp,/_lstItems->addRow\(4, name\.c_str\(\), ssQtySrc\.str\(\)\.c_str\(\), ssAmount\.str\(\)\.c_str\(\), ssQtyDst\.str\(\)\.c_str\(\)\);\s*_rows\.push_back\(i\)/);
  assert.match(h,/TransferRow &getRow\(\) \{ return _items\[_rows\[_sel\]\]; \}/);
  assert.match(cpp,/void TransferItemsState::completeTransfer\(\)/);
  assert.match(cpp,/for \(const auto& transferRow : _items\)/);
  assert.match(cpp,/std::stable_sort\(_items\.begin\(\), _items\.end\(\)/);
});

test('medical/vehicle/craft/personnel data and ammo coloration are untouched by classification',()=>{
  assert.match(cpp,/case TRANSFER_SOLDIER:/);
  assert.match(cpp,/case TRANSFER_CRAFT:/);
  assert.match(cpp,/case TRANSFER_SCIENTIST:/);
  assert.match(cpp,/case TRANSFER_ENGINEER:/);
  assert.match(cpp,/ammo = \(rule->getBattleType\(\) == BT_AMMO/);
  assert.match(cpp,/_lstItems->setRowColor\(_rows\.size\(\) - 1, _ammoColor\)/);
});

test('R11 combat history + F12 + Usain Bolt + jewelry code inherited, not replaced',()=>{
  assert.match(build,/objects_r136_r11_history_jewelry_cumulative\.a/);
  assert.match(build,/\$units=@\('TransferItemsState','main'\)/);
  assert.match(build,/if\(\$after\.Count -ne 413\)/);
  assert.match(main,/R136-R11T-TRANSFER-CATEGORIES/);
});
