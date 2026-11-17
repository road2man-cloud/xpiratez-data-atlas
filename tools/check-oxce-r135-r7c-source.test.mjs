import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
const root=path.resolve('experiments/oxce-custom-release-audit/R135-r7c-r131baseline/src');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');

test('black-market PurchaseState uses category dropdown order with stable original purchase indices',()=>{
 const s=read('Basescape/PurchaseState.cpp');
 assert.match(s,/const bool r7GroupPurchases = selectedCategory == "STR_ALL_ITEMS"/);
 assert.match(s,/selectedCategory == "STR_FILTER_MISSING"/);
 assert.match(s,/std::stable_sort\(r7Order.begin\(\), r7Order.end\(\)/);
 assert.match(s,/const size_t i = r7Order\[displayIndex\]/);
 assert.match(s,/_rows.push_back\(i\)/);
 assert.match(s,/if \(!_autoBuyDone\)/);
 assert.match(s,/_items\[i\]\.amount \+= missingQty/);
 assert.match(s,/ssQty << _items\[i\]\.qtySrc/);
 assert.match(s,/ssAmount << _items\[i\]\.amount/);
});
test('black market normal/all/hidden/equipped/missing category grouping only changes displayed names',()=>{
 const s=read('Basescape/PurchaseState.cpp');
 assert.match(s,/r7Keys\[i\] = r7GroupKey\(i\)/);
 assert.match(s,/r7PreviousGroup = group/);
 assert.match(s,/if \(!r7HasPreviousGroup \|\| group != r7PreviousGroup\)/);
 assert.match(s,/name\.insert\(0, "    "\)/);
 assert.match(s,/group\.empty\(\) \? "STR_UNASSIGNED"/);
 assert.match(s,/const auto pos = std::find\(_cats.begin\(\), _cats.end\(\), r7Keys\[i\]\)/);
 assert.match(s,/const std::vector<std::string> &categories = rule->getCategories\(\)/);
 assert.match(s,/if \(pos != _cats.end\(\)\) r7Ranks\[i\]/);
});
test('manufacture projects group in original first-seen category order and keep actual rule rows',()=>{
 const s=read('Basescape/NewManufactureListState.cpp');
 assert.match(s,/std::unordered_map<std::string, size_t> r7CategoryOrder/);
 assert.match(s,/r7CategoryOrder.emplace\(category, r7CategoryOrder.size\(\)\)/);
 assert.match(s,/std::stable_sort\(_possibleProductions.begin\(\), _possibleProductions.end\(\)/);
 assert.match(s,/_displayedStrings.push_back\(manuf->getName\(\).c_str\(\)\)/);
 assert.match(s,/r7HasPreviousCategory = true/);
});
test('SellState uses mod dropdown precedence with indexed sales rows, not mutation of _items',()=>{
 const s=read('Basescape/SellState.cpp');
 assert.match(s,/r7CustomCategories = _game->getMod\(\)->getDisplayCustomCategories\(\) > 0/);
 assert.match(s,/r7Keys\[i\] = r7GroupKey\(i\)/);
 assert.match(s,/r7Ranks\[i\] = static_cast<size_t>/);
 assert.match(s,/const size_t i = r7Order\[displayIndex\]/);
 assert.match(s,/_rows.push_back\(i\)/);
 assert.match(s,/if \(!searchString.empty\(\)\)/);
});
test('R7C has a unique title while preserving R7B linked objects',()=>{
 const s=read('main.cpp');
 assert.match(s,/R135-R7C-CATEGORY-GROUPS/);
 assert.doesNotMatch(s,/R135-R7B-CATEGORY-GROUPS/);
});
