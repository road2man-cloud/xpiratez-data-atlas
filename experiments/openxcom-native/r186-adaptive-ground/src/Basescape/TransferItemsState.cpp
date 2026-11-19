/*
 * Copyright 2010-2016 OpenXcom Developers.
 *
 * This file is part of OpenXcom.
 *
 * OpenXcom is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * OpenXcom is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with OpenXcom.  If not, see <http://www.gnu.org/licenses/>.
 */
#include "TransferItemsState.h"
#include "R148SearchView.h"
#include "R145QuickSearch.h"
#include "ItemLocationsState.h"
#include "ManufactureDependenciesTreeState.h"
#include <sstream>
#include <climits>
#include <algorithm>
#include <map>
#include <locale>
#include "../Engine/CrossPlatform.h"
#include "../Engine/Action.h"
#include "../Engine/Game.h"
#include "../Mod/Mod.h"
#include "../Interface/TextButton.h"
#include "../Interface/Window.h"
#include "../Interface/Text.h"
#include "../Interface/TextEdit.h"
#include "../Interface/TextList.h"
#include "../Savegame/BaseFacility.h"
#include "../Savegame/SavedGame.h"
#include "../Savegame/Base.h"
#include "../Savegame/Soldier.h"
#include "../Savegame/Craft.h"
#include "../Savegame/ItemContainer.h"
#include "../Mod/RuleItem.h"
#include "../Engine/Timer.h"
#include "../Menu/ErrorMessageState.h"
#include "TransferConfirmState.h"
#include "../Engine/Options.h"
#include "../fmath.h"
#include "../Mod/RuleInterface.h"
#include "../Mod/Armor.h"
#include "../Interface/ComboBox.h"
#include "TechTreeViewerState.h"
#include "../Ufopaedia/Ufopaedia.h"
#include "../Battlescape/DebriefingState.h"

namespace OpenXcom
{
// R147: keep optional toolbar state external to preserve the binary class layout.
static std::map<const TransferItemsState *, Text *> r147SearchCounters;
struct R148TransferItemsStateSearchState
{
 R148SearchCache cache;
 std::string lastQuery;
};
static std::map<const TransferItemsState *, R148TransferItemsStateSearchState> r148SearchState;
// R140: compact direction cues using ASCII characters supported by bitmap fonts.
static std::string r140SortHeader(const std::string &label, bool active, bool descending)
{
    return active ? label + (descending ? " v" : " ^") : label;
}

// R138: external per-window state preserves the existing TransferItemsState ABI.
struct R138TransferColumnSortState
{
	int column; // 0 original, 1 source stock, 2 selected amount, 3 destination stock
	bool descending;
	R138TransferColumnSortState() : column(0), descending(true) {}
};
static std::map<const TransferItemsState *, R138TransferColumnSortState> r138TransferColumnSort;
static std::map<const TransferItemsState*, std::vector<std::pair<Craft*, Craft*>>> exchangeMap;

class ExchangeCraftState : public State
{
    TransferItemsState *_parent;
    Craft *_outgoing;
    Window *_window;
    Text *_title;
    TextList *_list;
    TextButton *_ok, *_cancel;
    Text *_status;
    int _chosen;
    std::vector<Craft*> _choices;
public:
    ExchangeCraftState(TransferItemsState *parent, Craft *outgoing, Base *destination)
        : _parent(parent), _outgoing(outgoing), _chosen(-1)
    {
        _screen = false;
        setInterface("transferMenu");
        _window = new Window(this, 320, 150, 0, 25);
        _title = new Text(300, 20, 10, 33);
        _status = new Text(290, 24, 15, 120);
        _list = new TextList(280, 72, 20, 66);
        _ok = new TextButton(132, 16, 18, 146);
        _cancel = new TextButton(132, 16, 170, 146);
        add(_window, "window", "transferMenu");
        add(_title, "text", "transferMenu");
        add(_status, "text", "transferMenu");
        add(_list, "list", "transferMenu");
        add(_ok, "button", "transferMenu");
        add(_cancel, "button", "transferMenu");
        centerAllSurfaces();
        setWindowBackground(_window, "transferMenu");
        _title->setBig();
        _title->setAlign(ALIGN_CENTER);
        _title->setText("함선 교환");
        _status->setAlign(ALIGN_CENTER);
        _status->setWordWrap(true);
        _status->setText("함선을 클릭하여 선택");
        _list->setColumns(1, 270);
        _list->setSelectable(true);
        _list->setBackground(_window);
        _list->setMargin(2);
        _list->onMouseClick((ActionHandler)&ExchangeCraftState::pick, SDL_BUTTON_LEFT);
        for (Craft *c : *destination->getCrafts())
        {
            if (c->getStatus() != "STR_OUT")
            {
                _choices.push_back(c);
                _list->addRow(1, c->getName(_game->getLanguage()).c_str());
            }
        }
        if (_choices.empty()) _status->setText("교환 가능한 함선이 없습니다.");
        _ok->setText("교환");
        _ok->onMouseClick((ActionHandler)&ExchangeCraftState::confirm);
        _cancel->setText(tr("STR_CANCEL"));
        _cancel->onMouseClick((ActionHandler)&ExchangeCraftState::cancel);
        _cancel->onKeyboardPress((ActionHandler)&ExchangeCraftState::cancel, Options::keyCancel);
    }
    void pick(Action *)
    {
        const size_t index = _list->getSelectedRow();
        if (index >= _choices.size()) return;
        _chosen = static_cast<int>(index);
        _list->setRowColor(index, _list->getSecondaryColor());
        if (_parent->canExchangeCraft(_outgoing, _choices[index]))
            _status->setText("선택됨 - 교환 버튼으로 진행");
        else
            _status->setText(_parent->exchangeBlockReason(_outgoing, _choices[index]));
    }
    void confirm(Action *)
    {
        if (_chosen < 0 || static_cast<size_t>(_chosen) >= _choices.size())
        {
            _status->setText("먼저 받는 함선을 클릭하세요.");
            return;
        }
        if (!_parent->canExchangeCraft(_outgoing, _choices[_chosen]))
        {
            _status->setText(_parent->exchangeBlockReason(_outgoing, _choices[_chosen]));
            return;
        }
        if (_parent->queueCraftExchange(_outgoing, _choices[_chosen]))
            _game->popState();
        else
            _status->setText("교환 예약 실패 - 다시 선택");
    }
    void cancel(Action *) { _game->popState(); }
};

/**
 * Initializes all the elements in the Transfer screen.
 * @param game Pointer to the core game.
 * @param baseFrom Pointer to the source base.
 * @param baseTo Pointer to the destination base.
 */
TransferItemsState::TransferItemsState(Base *baseFrom, Base *baseTo, DebriefingState *debriefingState) :
	_baseFrom(baseFrom), _baseTo(baseTo), _debriefingState(debriefingState),
	_sel(0), _total(0), _pQty(0), _cQty(0), _aQty(0), _iQty(0.0), _distance(0.0), _ammoColor(0),
	_previousSort(TransferSortDirection::BY_LIST_ORDER), _currentSort(TransferSortDirection::BY_LIST_ORDER), _errorShown(false)
{
	r138TransferColumnSort[this] = R138TransferColumnSortState();
	// Create objects
	_window = new Window(this, 320, 200, 0, 0);
	_btnQuickSearch = new TextEdit(this, 98, 9, 10, 22);
 TextButton *r147Clear = new TextButton(22, 10, 110, 22);
 Text *r147Count = new Text(75, 9, 136, 22);
 r147SearchCounters[this] = r147Count;
	_btnOk = new TextButton(148, 16, 8, 176);
	_btnCancel = new TextButton(148, 16, 164, 176);
	_txtTitle = new Text(310, 17, 5, 2);
	_txtQuantity = new Text(50, 9, 150, 35);
	_txtAmountTransfer = new Text(60, 17, 200, 35);
	_txtAmountDestination = new Text(60, 17, 260, 35);
	_cbxCategory = new ComboBox(this, 120, 16, 10, 35);
	_lstItems = new TextList(287, 119, 8, 55);

	touchComponentsCreate(_txtTitle);

	// Set palette
	setInterface("transferMenu");

	_ammoColor = _game->getMod()->getInterface("transferMenu")->getElement("ammoColor")->color;

	add(_window, "window", "transferMenu");
	add(_btnQuickSearch, "button", "transferMenu");
 add(r147Clear, "button", "transferMenu");
 add(r147Count, "text", "transferMenu");
	add(_btnOk, "button", "transferMenu");
	add(_btnCancel, "button", "transferMenu");
	add(_txtTitle, "text", "transferMenu");
	add(_txtQuantity, "text", "transferMenu");
	add(_txtAmountTransfer, "text", "transferMenu");
	add(_txtAmountDestination, "text", "transferMenu");
	add(_lstItems, "list", "transferMenu");
	add(_cbxCategory, "text", "transferMenu");

	touchComponentsAdd("button2", "transferMenu", _window);

	centerAllSurfaces();

	// Set up objects
	setWindowBackground(_window, "transferMenu");

	touchComponentsConfigure();

	_btnOk->setText(tr("STR_TRANSFER"));
	_btnOk->onMouseClick((ActionHandler)&TransferItemsState::btnOkClick);
	_btnOk->onKeyboardPress((ActionHandler)&TransferItemsState::btnOkClick, Options::keyOk);

	_btnCancel->setText(tr("STR_CANCEL"));
	_btnCancel->onMouseClick((ActionHandler)&TransferItemsState::btnCancelClick);
	_btnCancel->onKeyboardPress((ActionHandler)&TransferItemsState::btnCancelClick, Options::keyCancel);

	_txtTitle->setBig();
	_txtTitle->setAlign(ALIGN_CENTER);
	_txtTitle->setText(tr("STR_TRANSFER"));

	_txtQuantity->setText(tr("STR_QUANTITY_UC"));

	_txtAmountTransfer->setText(tr("STR_AMOUNT_TO_TRANSFER"));
	_txtAmountTransfer->setWordWrap(true);

	_txtAmountDestination->setText(tr("STR_AMOUNT_AT_DESTINATION"));
	_txtAmountDestination->setWordWrap(true);

	// R138: clickable column headings, direction toggles per repeated click.
	_txtQuantity->onMouseClick((ActionHandler)&TransferItemsState::r138SortSourceQty);
	_txtAmountTransfer->onMouseClick((ActionHandler)&TransferItemsState::r138SortTransferAmount);
	_txtAmountDestination->onMouseClick((ActionHandler)&TransferItemsState::r138SortDestinationQty);

	_lstItems->setArrowColumn(193, ARROW_VERTICAL);
	_lstItems->setColumns(4, 162, 58, 40, 27);
	_lstItems->setSelectable(true);
	_lstItems->setBackground(_window);
	_lstItems->setMargin(2);
	_lstItems->onLeftArrowPress((ActionHandler)&TransferItemsState::lstItemsLeftArrowPress);
	_lstItems->onLeftArrowRelease((ActionHandler)&TransferItemsState::lstItemsLeftArrowRelease);
	_lstItems->onLeftArrowClick((ActionHandler)&TransferItemsState::lstItemsLeftArrowClick);
	_lstItems->onRightArrowPress((ActionHandler)&TransferItemsState::lstItemsRightArrowPress);
	_lstItems->onRightArrowRelease((ActionHandler)&TransferItemsState::lstItemsRightArrowRelease);
	_lstItems->onRightArrowClick((ActionHandler)&TransferItemsState::lstItemsRightArrowClick);
	_lstItems->onMousePress((ActionHandler)&TransferItemsState::lstItemsMousePress);

	_distance = getDistance();

	_cats.push_back("STR_ALL_ITEMS");
	_cats.push_back("STR_ITEMS_AT_DESTINATION");
	if (Options::oxceBaseFilterResearchable)
	{
		_cats.push_back("STR_FILTER_RESEARCHED");
		_cats.push_back("STR_FILTER_RESEARCHABLE");
	}

	for (auto* soldier : *_baseFrom->getSoldiers())
	{
		if (_debriefingState) break;
		if (soldier->getCraft() == 0)
		{
			TransferRow row = { TRANSFER_SOLDIER, soldier, soldier->getName(true), (int)(5 * _distance), 1, 0, 0, -4, 0, 0, (int)(5 * _distance) };
			_items.push_back(row);
			std::string cat = getCategory(_items.size() - 1);
			if (std::find(_cats.begin(), _cats.end(), cat) == _cats.end())
			{
				_cats.push_back(cat);
			}
		}
	}
	for (auto* craft : *_baseFrom->getCrafts())
	{
		if (_debriefingState) break;
		if (craft->getStatus() != "STR_OUT" || (Options::canTransferCraftsWhileAirborne && craft->getFuel() >= craft->getFuelLimit(_baseTo)))
		{
			TransferRow row = { TRANSFER_CRAFT, craft, craft->getName(_game->getLanguage()),  (int)(25 * _distance), 1, 0, 0, -3, 0, 0, (int)(25 * _distance) };
			_items.push_back(row);
			std::string cat = getCategory(_items.size() - 1);
			if (std::find(_cats.begin(), _cats.end(), cat) == _cats.end())
			{
				_cats.push_back(cat);
			}
		}
	}
	if (_baseFrom->getAvailableScientists() > 0 && _debriefingState == 0)
	{
		TransferRow row = { TRANSFER_SCIENTIST, 0, tr("STR_SCIENTIST"),  (int)(5 * _distance), _baseFrom->getAvailableScientists(), _baseTo->getAvailableScientists(), 0, -2, 0, 0, _baseFrom->getAvailableScientists() * (int)(5 * _distance) };
		_items.push_back(row);
		std::string cat = getCategory(_items.size() - 1);
		if (std::find(_cats.begin(), _cats.end(), cat) == _cats.end())
		{
			_cats.push_back(cat);
		}
	}
	if (_baseFrom->getAvailableEngineers() > 0 && _debriefingState == 0)
	{
		TransferRow row = { TRANSFER_ENGINEER, 0, tr("STR_ENGINEER"),  (int)(5 * _distance), _baseFrom->getAvailableEngineers(), _baseTo->getAvailableEngineers(), 0, -1, 0, 0, _baseFrom->getAvailableEngineers() * (int)(5 * _distance) };
		_items.push_back(row);
		std::string cat = getCategory(_items.size() - 1);
		if (std::find(_cats.begin(), _cats.end(), cat) == _cats.end())
		{
			_cats.push_back(cat);
		}
	}
	for (auto& itemType : _game->getMod()->getItemsList())
	{
		RuleItem *rule = _game->getMod()->getItem(itemType, true);
		int qty = _baseFrom->getStorageItems()->getItem(rule);
		if (_debriefingState != 0)
		{
			qty = _debriefingState->getRecoveredItemCount(rule);
		}
		if (qty > 0)
		{
			TransferRow row = { TRANSFER_ITEM, rule, tr(itemType),  (int)(1 * _distance), qty, _baseTo->getStorageItems()->getItem(rule), 0, rule->getListOrder(), rule->getSize(), qty * rule->getSize(), qty * (int)(1 * _distance) };
			_items.push_back(row);
			std::string cat = getCategory(_items.size() - 1);
			if (std::find(_cats.begin(), _cats.end(), cat) == _cats.end())
			{
				_cats.push_back(cat);
			}
		}
	}

	_vanillaCategories = _cats.size();
	if (_game->getMod()->getDisplayCustomCategories() > 0)
	{
		bool hasUnassigned = false;

		// first find all relevant item categories
		std::vector<std::string> tempCats;
		for (const auto& transferRow : _items)
		{
			if (transferRow.type == TRANSFER_ITEM)
			{
				RuleItem *rule = (RuleItem*)(transferRow.rule);
				if (rule->getCategories().empty())
				{
					hasUnassigned = true;
				}
				for (auto& itemCategoryName : rule->getCategories())
				{
					if (std::find(tempCats.begin(), tempCats.end(), itemCategoryName) == tempCats.end())
					{
						tempCats.push_back(itemCategoryName);
					}
				}
			}
		}
		// then use them nicely in order
		if (_game->getMod()->getDisplayCustomCategories() == 1)
		{
			_cats.clear();
			_cats.push_back("STR_ALL_ITEMS");
			_cats.push_back("STR_ITEMS_AT_DESTINATION");
			if (Options::oxceBaseFilterResearchable)
			{
				_cats.push_back("STR_FILTER_RESEARCHED");
				_cats.push_back("STR_FILTER_RESEARCHABLE");
			}
			_vanillaCategories = _cats.size();
		}
		for (auto& categoryName : _game->getMod()->getItemCategoriesList())
		{
			if (std::find(tempCats.begin(), tempCats.end(), categoryName) != tempCats.end())
			{
				_cats.push_back(categoryName);
			}
		}
		if (hasUnassigned)
		{
			_cats.push_back("STR_UNASSIGNED");
		}
	}

	_cbxCategory->setOptions(_cats, true);
	_cbxCategory->onChange((ActionHandler)&TransferItemsState::cbxCategoryChange);
	_cbxCategory->onKeyboardPress((ActionHandler)&TransferItemsState::btnTransferAllClick, Options::keyTransferAll);

	_btnQuickSearch->setText(""); // redraw
	_btnQuickSearch->onEnter((ActionHandler)&TransferItemsState::btnQuickSearchApply);
	// R136-R11T: search is always visible and filters on each edit.
	_btnQuickSearch->onChange((ActionHandler)&TransferItemsState::btnQuickSearchApply);
	_btnQuickSearch->setVisible(true);
 r147Clear->setText("X");
 r147Clear->onMouseClick((ActionHandler)&TransferItemsState::r147ClearSearch);
 r147Count->setText("0/0");

	_btnOk->onKeyboardRelease((ActionHandler)&TransferItemsState::btnQuickSearchToggle, Options::keyToggleQuickSearch);

	updateList();

	_timerInc = new Timer(250);
	_timerInc->onTimer((StateHandler)&TransferItemsState::increase);
	_timerDec = new Timer(250);
	_timerDec->onTimer((StateHandler)&TransferItemsState::decrease);
}

/**
 *
 */
TransferItemsState::~TransferItemsState()
{
    exchangeMap.erase(this);
 r147SearchCounters.erase(this);
 r148SearchState.erase(this);
	r138TransferColumnSort.erase(this);
	delete _timerInc;
	delete _timerDec;
}

/**
 * Resets stuff when coming back from other screens.
 */
void TransferItemsState::init()
{
	State::init();

	touchComponentsRefresh();
}

/**
 * Runs the arrow timers.
 */
void TransferItemsState::think()
{
	State::think();

	_timerInc->think(this, 0);
	_timerDec->think(this, 0);
}

/**
 * Determines the category a row item belongs in.
 * @param sel Selected row.
 * @returns Item category.
 */
std::string TransferItemsState::getCategory(int sel) const
{
	RuleItem *rule = 0;
	switch (_items[sel].type)
	{
	case TRANSFER_SOLDIER:
	case TRANSFER_SCIENTIST:
	case TRANSFER_ENGINEER:
		return "STR_PERSONNEL";
	case TRANSFER_CRAFT:
		return "STR_CRAFT_ARMAMENT";
	case TRANSFER_ITEM:
		rule = (RuleItem*)_items[sel].rule;
		if (rule->getBattleType() == BT_CORPSE || rule->isAlien())
		{
			if (rule->getVehicleUnit())
				return "STR_PERSONNEL"; // OXCE: critters fighting for us
			if (rule->isAlien())
				return "STR_PRISONERS"; // OXCE: live aliens
			return "STR_ALIENS";
		}
		if (rule->getBattleType() == BT_NONE)
		{
			if (_game->getMod()->isCraftWeaponStorageItem(rule))
				return "STR_CRAFT_ARMAMENT";
			if (_game->getMod()->isArmorStorageItem(rule))
				return "STR_ARMORS"; // OXCE: armors
			return "STR_COMPONENTS";
		}
		return "STR_EQUIPMENT";
	}
	return "STR_ALL_ITEMS";
}

/**
 * Determines if a row item belongs to a given category.
 * @param sel Selected row.
 * @param cat Category.
 * @returns True if row item belongs to given category, otherwise False.
 */
bool TransferItemsState::belongsToCategory(int sel, const std::string &cat) const
{
	switch (_items[sel].type)
	{
	case TRANSFER_SOLDIER:
	case TRANSFER_SCIENTIST:
	case TRANSFER_ENGINEER:
	case TRANSFER_CRAFT:
		return false;
	case TRANSFER_ITEM:
		RuleItem *rule = (RuleItem*)_items[sel].rule;
		return rule->belongsToCategory(cat);
	}
	return false;
}

/**
* Quick search toggle.
* @param action Pointer to an action.
*/
// R147: focus the always-visible input without hiding the toolbar.
void TransferItemsState::btnQuickSearchToggle(Action *)
{
 _btnQuickSearch->setVisible(true);
 _btnQuickSearch->setFocus(true);
}
void TransferItemsState::r147ClearSearch(Action *)
{
 if (_btnQuickSearch->getText().empty()) return;
 _btnQuickSearch->setText("");
 r148SearchState[this].lastQuery.clear();
 updateList();  // setText() does not invoke onChange; refresh exactly once.
 _btnQuickSearch->setFocus(true);
 }

/**
* Quick search.
* @param action Pointer to an action.
*/
void TransferItemsState::btnQuickSearchApply(Action *)
{
 // Repeated Enter with unchanged query does not regenerate the whole list.
 const std::string query = _btnQuickSearch->getText();
 R148TransferItemsStateSearchState &state = r148SearchState[this];
 if (state.lastQuery == query) return;
 state.lastQuery = query;
 updateList();
}

/**
* Filters the current list of items.
*/
void TransferItemsState::updateList()
{
 const size_t r148OldScroll = _lstItems->getScroll();
 const R148RowAnchor r148Top(r148OldScroll, _rows, _items);
 const R148RowAnchor r148Selection(_sel, _rows, _items);
 const R145QuickSearch r145Search(_btnQuickSearch->getText());
 R148SearchCache &r148Cache = r148SearchState[this].cache;

	_lstItems->clearList();
	_rows.clear();

	size_t selCategory = _cbxCategory->getSelected();
	const std::string cat = _cats[selCategory];
	bool allItems = (cat == "STR_ALL_ITEMS");
	bool onlyItemsAtDestination = (cat == "STR_ITEMS_AT_DESTINATION");
	bool categoryResearched = (cat == "STR_FILTER_RESEARCHED");
	bool categoryResearchable = (cat == "STR_FILTER_RESEARCHABLE");
	bool categoryUnassigned = (cat == "STR_UNASSIGNED");
	bool specialCategory = allItems || onlyItemsAtDestination;

	if (_previousSort != _currentSort)
	{
		switch (_currentSort)
		{
		case TransferSortDirection::BY_TOTAL_COST: std::stable_sort(_items.begin(), _items.end(), [](const TransferRow a, const TransferRow b) { return a.totalCost > b.totalCost; }); break;
		case TransferSortDirection::BY_UNIT_COST:  std::stable_sort(_items.begin(), _items.end(), [](const TransferRow a, const TransferRow b) { return a.cost > b.cost; }); break;
		case TransferSortDirection::BY_TOTAL_SIZE: std::stable_sort(_items.begin(), _items.end(), [](const TransferRow a, const TransferRow b) { return a.totalSize > b.totalSize; }); break;
		case TransferSortDirection::BY_UNIT_SIZE:  std::stable_sort(_items.begin(), _items.end(), [](const TransferRow a, const TransferRow b) { return a.size > b.size; }); break;
		default:                                   std::stable_sort(_items.begin(), _items.end(), [](const TransferRow a, const TransferRow b) { return a.listOrder < b.listOrder; }); break;
		}
	}

	// R136-R11T: default list is classified exactly like the fence/sell
	// window, using the mod dropdown's first matching category for items
	// belonging to multiple categories. Sort *display indices*, never the
	// actual transfer rows: quantity arrows, capacity and confirmation use
	// _rows[visibleRow] to refer back to the original _items entry.
	std::vector<size_t> r11tDisplayOrder;
	r11tDisplayOrder.reserve(_items.size());
	for (size_t index = 0; index < _items.size(); ++index)
		r11tDisplayOrder.push_back(index);
	// R138: keep category groups even when the user sorts rows.
	const bool r11tGrouped = (allItems || onlyItemsAtDestination);
	const R138TransferColumnSortState r138Sort = r138TransferColumnSort[this];
	const bool r11tCustomCategories = _game->getMod()->getDisplayCustomCategories() > 0;
	auto r11tGroupKey = [&](size_t index) -> std::string
	{
		if (_items[index].type == TRANSFER_ITEM && r11tCustomCategories)
		{
			const RuleItem *rule = (const RuleItem*)_items[index].rule;
			if (rule)
			{
				const std::vector<std::string> &categories = rule->getCategories();
				if (categories.empty()) return "STR_UNASSIGNED";
				for (size_t rank = _vanillaCategories; rank < _cats.size(); ++rank)
					if (std::find(categories.begin(), categories.end(), _cats[rank]) != categories.end())
						return _cats[rank];
				return categories.front();
			}
		}
		return getCategory(static_cast<int>(index));
	};
	if (r11tGrouped || r138Sort.column != 0)
	{
		std::vector<std::string> keys(_items.size());
		std::vector<size_t> ranks(_items.size(), _cats.size());
		if (r11tGrouped)
		{
			for (size_t index = 0; index < _items.size(); ++index)
			{
				keys[index] = r11tGroupKey(index);
				const auto position = std::find(_cats.begin(), _cats.end(), keys[index]);
				if (position != _cats.end())
					ranks[index] = static_cast<size_t>(position - _cats.begin());
			}
		}
		std::stable_sort(r11tDisplayOrder.begin(), r11tDisplayOrder.end(),
			[&](size_t a, size_t b)
			{
				if (r11tGrouped)
				{
					if (ranks[a] != ranks[b]) return ranks[a] < ranks[b];
					if (keys[a] != keys[b]) return keys[a] < keys[b];
				}
				if (r138Sort.column != 0)
				{
					const int64_t left = r138Sort.column == 1 ? (int64_t)_items[a].qtySrc - _items[a].amount :
						(r138Sort.column == 2 ? _items[a].amount : _items[a].qtyDst);
					const int64_t right = r138Sort.column == 1 ? (int64_t)_items[b].qtySrc - _items[b].amount :
						(r138Sort.column == 2 ? _items[b].amount : _items[b].qtyDst);
					if (left != right) return r138Sort.descending ? left > right : left < right;
				}
				return false;
			});
	}
	std::string r11tPreviousGroup;
	bool r11tHasPreviousGroup = false;
	for (size_t visibleIndex = 0; visibleIndex < r11tDisplayOrder.size(); ++visibleIndex)
	{
		const size_t i = r11tDisplayOrder[visibleIndex];
		// filter
		if (categoryResearched || categoryResearchable)
		{
			if (_items[i].type == TRANSFER_ITEM)
			{
				RuleItem* rule = (RuleItem*)_items[i].rule;
				bool isResearchable = _game->getSavedGame()->isResearchable(rule, _game->getMod());
				if (categoryResearched && isResearchable) continue;
				if (categoryResearchable && !isResearchable) continue;
			}
			else
			{
				// don't show non-items (e.g. craft, personnel)
				continue;
			}
		}
		else if (selCategory >= _vanillaCategories)
		{
			if (categoryUnassigned && _items[i].type == TRANSFER_ITEM)
			{
				RuleItem* rule = (RuleItem*)_items[i].rule;
				if (!rule->getCategories().empty())
				{
					continue;
				}
			}
			else if (!specialCategory && !belongsToCategory(i, cat))
			{
				continue;
			}
		}
		else
		{
			if (!specialCategory && cat != getCategory(i))
			{
				continue;
			}
		}

		// "items at destination" filter
		if (onlyItemsAtDestination && _items[i].qtyDst <= 0)
		{
			continue;
		}

		// R148: re-use uppercase searchable text until identity/name changes.
		if (r145Search.active() &&
            !r148Cache.matches(i, _items[i], r145Search, [&]() -> std::string
            {
                std::string searchable = _items[i].name;
                if (_items[i].type == TRANSFER_ITEM && _items[i].rule)
                {
                    const RuleItem *rule = (const RuleItem *)_items[i].rule;
                    searchable += " " + rule->getType() + " " + rule->getName();
                    for (const std::string &category : rule->getCategories())
                        searchable += " " + category + " " + std::string(tr(category));
                }
                const std::string group = r11tGroupKey(i);
                if (!group.empty())
                    searchable += " " + group + " " + std::string(tr(group));
                return searchable;
            })) continue;

		std::string name = _items[i].name;
		bool ammo = false;
		if (_items[i].type == TRANSFER_ITEM)
		{
			RuleItem *rule = (RuleItem*)_items[i].rule;
			ammo = (rule->getBattleType() == BT_AMMO || (rule->getBattleType() == BT_NONE && rule->getClipSize() > 0));
			if (ammo)
			{
				name.insert(0, "  ");
			}
		}
		if (r11tGrouped)
		{
			// Only the first *visible* item gets the category prefix, even
			// if search/destination filters hide an earlier item in this group.
			const std::string group = r11tGroupKey(i);
			if (!r11tHasPreviousGroup || group != r11tPreviousGroup)
			{
				name = "[" + std::string(tr(group.empty() ? "STR_UNASSIGNED" : group)) + "] " + name;
				r11tPreviousGroup = group;
				r11tHasPreviousGroup = true;
			}
			else name.insert(0, "    ");
		}
		std::ostringstream ssQtySrc, ssQtyDst, ssAmount;
		ssQtySrc << _items[i].qtySrc - _items[i].amount;
		ssQtyDst << _items[i].qtyDst;
		ssAmount << _items[i].amount;
		_lstItems->addRow(4, name.c_str(), ssQtySrc.str().c_str(), ssAmount.str().c_str(), ssQtyDst.str().c_str());
		_rows.push_back(i);
		if (_items[i].amount > 0)
		{
			_lstItems->setRowColor(_rows.size() - 1, _lstItems->getSecondaryColor());
		}
		else if (ammo)
		{
			_lstItems->setRowColor(_rows.size() - 1, _ammoColor);
		}
	}
 // R148: restore both top-visible and action-selected items by identity,
 // never by stale indices after a sort or category change.
 if (!_rows.empty())
 {
  size_t desiredTop = r148Top.find(_rows, _items);
  if (desiredTop == static_cast<size_t>(-1))
   desiredTop = std::min(r148OldScroll, _rows.size() - 1);
  _lstItems->scrollTo(desiredTop);
  const size_t selection = r148Selection.find(_rows, _items);
  if (selection != static_cast<size_t>(-1)) _sel = selection;
  else if (_sel >= _rows.size()) _sel = _rows.size() - 1;
 }
 else _sel = 0;
 const auto counter = r147SearchCounters.find(this);
 if (counter != r147SearchCounters.end() && counter->second)
  counter->second->setText(std::to_string(_rows.size()) + "/" + std::to_string(_items.size()));
}

/**
 * Transfers the selected items.
 * @param action Pointer to an action.
 */
void TransferItemsState::btnOkClick(Action *)
{
	// R175: do not detach crew of a craft that is currently in the air.
	for (const auto &row : _items)
	{
		if (row.type != TRANSFER_CRAFT || row.amount <= 0) continue;
		Craft *craft = (Craft*)row.rule;
		if (craft->getStatus() == "STR_OUT" && craft->getNumTotalSoldiers() > 0)
		{
			RuleInterface *ui = _game->getMod()->getInterface("transferMenu");
			_game->pushState(new ErrorMessageState("병사가 탑승한 출격 중 함선은 귀환 후 이송하세요.", _palette,
				ui->getElement("errorMessage")->color, "BACK13.SCR", ui->getElement("errorPalette")->color));
			return;
		}
	}
    if (!validateExchangePlan())
    {
        RuleInterface *ui = _game->getMod()->getInterface("transferMenu");
        _game->pushState(new ErrorMessageState(tr("STR_NO_FREE_HANGARS_FOR_TRANSFER"),
            _palette, ui->getElement("errorMessage")->color, "BACK13.SCR", ui->getElement("errorPalette")->color));
        return;
    }
	if (Options::storageLimitsEnforced && !AreSame(_iQty, 0.0))
	{
		// check again (because of items with negative size)
		// But only check the base whose available space is decreasing.
		double freeStoresTo = _baseTo->getAvailableStores() - _baseTo->getUsedStores() - _iQty + exchangedStores();
		double freeStoresFrom = _baseFrom->getAvailableStores() - _baseFrom->getUsedStores() + _iQty - exchangedStores();
		if (_iQty > 0.0 ? freeStoresTo < -0.00001 : freeStoresFrom < -0.00001)
		{
			RuleInterface *menuInterface = _game->getMod()->getInterface("transferMenu");
			_game->pushState(new ErrorMessageState(tr("STR_NOT_ENOUGH_STORE_SPACE"), _palette, menuInterface->getElement("errorMessage")->color, "BACK13.SCR", menuInterface->getElement("errorPalette")->color));
			return;
		}
	}

	_game->pushState(new TransferConfirmState(_baseTo, this));
}

/**
 * Completes the transfer between bases.
 */
void TransferItemsState::completeTransfer()
{
    if (!validateExchangePlan()) return;
	int time = (int)floor(6 + _distance / 10.0);
	_game->getSavedGame()->setFunds(_game->getSavedGame()->getFunds() - getTotal());
	for (const auto& transferRow : _items)
	{
		if (transferRow.amount > 0)
		{
			Transfer *t = 0;
			Craft *craft = 0;
			Soldier* soldier = nullptr;
			switch (transferRow.type)
			{
			case TRANSFER_SOLDIER:
				for (auto soldierIt = _baseFrom->getSoldiers()->begin(); soldierIt != _baseFrom->getSoldiers()->end(); ++soldierIt)
				{
					soldier = (*soldierIt);
					if (soldier == transferRow.rule)
					{
						soldier->setPsiTraining(false);
						if (soldier->isInTraining())
						{
							soldier->setReturnToTrainingWhenHealed(true);
						}
						soldier->setTraining(false);
						t = new Transfer(time);
						t->setSoldier(soldier);
						_baseTo->getTransfers()->push_back(t);
						_baseFrom->getSoldiers()->erase(soldierIt);
						break;
					}
				}
				break;
			case TRANSFER_CRAFT:
				craft = (Craft*)transferRow.rule;
				// R175: transfer craft only; all personnel disembark at this base.
				// Keep soldier ownership, equipment and training unchanged.
				for (Soldier *assigned : *_baseFrom->getSoldiers())
				{
					if (assigned->getCraft() == craft) assigned->setCraft(0);
				}

				// Transfer craft
				_baseFrom->removeCraft(craft, false);
				if (craft->getStatus() == "STR_OUT")
				{
					bool returning = (craft->getDestination() == (Target*)craft->getBase());
					_baseTo->getCrafts()->push_back(craft);
					craft->setBase(_baseTo, false);
					if (craft->getFuel() <= craft->getFuelLimit(_baseTo))
					{
						craft->setLowFuel(true);
						craft->returnToBase();
					}
					else if (returning)
					{
						craft->setLowFuel(false);
						craft->returnToBase();
					}
				}
				else
				{
					t = new Transfer(time);
					t->setCraft(craft);
					_baseTo->getTransfers()->push_back(t);
				}
				break;
			case TRANSFER_SCIENTIST:
				_baseFrom->setScientists(_baseFrom->getScientists() - transferRow.amount);
				t = new Transfer(time);
				t->setScientists(transferRow.amount);
				_baseTo->getTransfers()->push_back(t);
				break;
			case TRANSFER_ENGINEER:
				_baseFrom->setEngineers(_baseFrom->getEngineers() - transferRow.amount);
				t = new Transfer(time);
				t->setEngineers(transferRow.amount);
				_baseTo->getTransfers()->push_back(t);
				break;
			case TRANSFER_ITEM:
				RuleItem *item = (RuleItem*)transferRow.rule;
				_baseFrom->getStorageItems()->removeItem(item, transferRow.amount);
				t = new Transfer(time);
				t->setItems(item, transferRow.amount);
				_baseTo->getTransfers()->push_back(t);
				if (_debriefingState != 0)
				{
					// remember the decreased amount for next sell/transfer
					_debriefingState->decreaseRecoveredItemCount(item, transferRow.amount);
				}
				break;
			}
		}
	}

	// Reciprocal legs are registered after all outgoing legs.
	const int reverseTime = (int)floor(6 + _distance / 10.0);
	for (const auto &exchange : exchangeMap[this])
	{
		Craft *craft = exchange.second;
		// R175: opposite-direction craft also leaves its crew at its own base.
		for (Soldier *assigned : *_baseTo->getSoldiers())
		{
			if (assigned->getCraft() == craft) assigned->setCraft(0);
		}
		_baseTo->removeCraft(craft, false);
		if (craft->getStatus() == "STR_OUT")
		{
			const bool returning = (craft->getDestination() == (Target*)craft->getBase());
			_baseFrom->getCrafts()->push_back(craft);
			craft->setBase(_baseFrom, false);
			if (craft->getFuel() <= craft->getFuelLimit(_baseFrom)) { craft->setLowFuel(true); craft->returnToBase(); }
			else if (returning) { craft->setLowFuel(false); craft->returnToBase(); }
		}
		else { Transfer *ct = new Transfer(reverseTime); ct->setCraft(craft); _baseFrom->getTransfers()->push_back(ct); }
	}
	if (_debriefingState != 0 && _debriefingState->getTotalRecoveredItemCount() <= 0)
	{
		_debriefingState->hideSellTransferButtons();
	}
}

/**
 * Returns to the previous screen.
 * @param action Pointer to an action.
 */
void TransferItemsState::btnCancelClick(Action *)
{
	_game->popState();
	_game->popState();
}

/**
 * Increase all items to max, i.e. transfer everything.
 * @param action Pointer to an action.
 */
void TransferItemsState::btnTransferAllClick(Action *)
{
	bool allItemsSelected = true;
	for (size_t i = 0; i < _lstItems->getTexts(); ++i)
	{
		if (_items[_rows[i]].type == TRANSFER_ITEM && _items[_rows[i]].amount < _items[_rows[i]].qtySrc)
		{
			allItemsSelected = false;
			break;
		}
	}

	size_t backup = _sel;
	_errorShown = false;
	for (size_t i = 0; i < _lstItems->getTexts(); ++i)
	{
		if (_items[_rows[i]].type == TRANSFER_ITEM)
		{
			_sel = i;
			allItemsSelected ? decreaseByValue(INT_MAX) : increaseByValue(INT_MAX);
			if (_errorShown)
			{
				break; // stop on first error
			}
		}
	}
	_sel = backup;
}

/**
 * Starts increasing the item.
 * @param action Pointer to an action.
 */
void TransferItemsState::lstItemsLeftArrowPress(Action *action)
{
	_sel = _lstItems->getSelectedRow();
	if (_game->isLeftClick(action, true) && !_timerInc->isRunning()) _timerInc->start();
}

/**
 * Stops increasing the item.
 * @param action Pointer to an action.
 */
void TransferItemsState::lstItemsLeftArrowRelease(Action *action)
{
	if (_game->isLeftClick(action, true))
	{
		_timerInc->stop();
	}
}

/**
 * Increases the selected item;
 * by one on left-click; to max on right-click.
 * @param action Pointer to an action.
 */
void TransferItemsState::lstItemsLeftArrowClick(Action *action)
{
	if (_game->isRightClick(action, true)) increaseByValue(INT_MAX);
	if (_game->isLeftClick(action, true))
	{
		increaseByValue(_game->getScrollStep());
		_timerInc->setInterval(250);
		_timerDec->setInterval(250);
	}
}

/**
 * Starts decreasing the item.
 * @param action Pointer to an action.
 */
void TransferItemsState::lstItemsRightArrowPress(Action *action)
{
	_sel = _lstItems->getSelectedRow();
	if (_game->isLeftClick(action, true) && !_timerDec->isRunning()) _timerDec->start();
}

/**
 * Stops decreasing the item.
 * @param action Pointer to an action.
 */
void TransferItemsState::lstItemsRightArrowRelease(Action *action)
{
	if (_game->isLeftClick(action, true))
	{
		_timerDec->stop();
	}
}

/**
 * Decreases the selected item;
 * by one on left-click; to 0 on right-click.
 * @param action Pointer to an action.
 */
void TransferItemsState::lstItemsRightArrowClick(Action *action)
{
	if (_game->isRightClick(action, true)) decreaseByValue(INT_MAX);
	if (_game->isLeftClick(action, true))
	{
		decreaseByValue(_game->getScrollStep());
		_timerInc->setInterval(250);
		_timerDec->setInterval(250);
	}
}

/**
 * Handles the mouse-wheels on the arrow-buttons.
 * @param action Pointer to an action.
 */
void TransferItemsState::lstItemsMousePress(Action *action)
{
	_sel = _lstItems->getSelectedRow();
	if (action->getDetails()->button.button == SDL_BUTTON_WHEELUP)
	{
		_timerInc->stop();
		_timerDec->stop();
		if (action->getAbsoluteXMouse() >= _lstItems->getArrowsLeftEdge() &&
			action->getAbsoluteXMouse() <= _lstItems->getArrowsRightEdge())
		{
			increaseByValue(Options::changeValueByMouseWheel);
		}
	}
	else if (action->getDetails()->button.button == SDL_BUTTON_WHEELDOWN)
	{
		_timerInc->stop();
		_timerDec->stop();
		if (action->getAbsoluteXMouse() >= _lstItems->getArrowsLeftEdge() &&
			action->getAbsoluteXMouse() <= _lstItems->getArrowsRightEdge())
		{
			decreaseByValue(Options::changeValueByMouseWheel);
		}
	}
	else if (_game->isRightClick(action, true))
	{
		if (action->getAbsoluteXMouse() >= _lstItems->getArrowsLeftEdge() &&
			action->getAbsoluteXMouse() <= _lstItems->getArrowsRightEdge())
		{
			return;
		}
		if (getRow().type == TRANSFER_ITEM)
		{
			RuleItem *rule = (RuleItem*)getRow().rule;
			if (rule != 0)
			{
				if (_game->isCtrlPressed(true))
				{
					_game->pushState(new ItemLocationsState(rule));
				}
				else
				{
					_game->pushState(new ManufactureDependenciesTreeState(rule->getType()));
				}
			}
		}
	}
	else if (_game->isMiddleClick(action, true))
	{
		if (getRow().type == TRANSFER_ITEM)
		{
			RuleItem *rule = (RuleItem*)getRow().rule;
			if (rule != 0)
			{
				std::string articleId = rule->getUfopediaType();
				if (_game->isCtrlPressed(true))
				{
					Ufopaedia::openArticle(_game, articleId);
				}
				else
				{
					const RuleResearch* selectedTopic = _game->getMod()->getResearch(articleId, false);
					if (selectedTopic)
					{
						_game->pushState(new TechTreeViewerState(selectedTopic, 0));
					}
				}
			}
		}
		else if (getRow().type == TRANSFER_CRAFT)
		{
			Craft *rule = (Craft*)getRow().rule;
			if (rule != 0)
			{
				std::string articleId = rule->getRules()->getType();
				if (_game->isCtrlPressed(true))
				{
					Ufopaedia::openArticle(_game, articleId);
				}
				else
				{
					_game->pushState(new TechTreeViewerState(0, 0, 0, rule->getRules()));
				}
			}
		}
	}
}

/**
 * Increases the quantity of the selected item to transfer by one.
 */
void TransferItemsState::increase()
{
	_timerDec->setInterval(50);
	_timerInc->setInterval(50);
	increaseByValue(_game->getScrollStep());
}

/**
 * Increases the quantity of the selected item to transfer by "change".
 * @param change How much we want to add.
 */
void TransferItemsState::increaseByValue(int change)
{
	if (0 >= change || getRow().qtySrc <= getRow().amount) return;
	std::string errorMessage;
	RuleItem *selItem = 0;
	Craft *craft = 0;

	switch (getRow().type)
	{
	case TRANSFER_SOLDIER:
	case TRANSFER_SCIENTIST:
	case TRANSFER_ENGINEER:
		if (_pQty + 1 > _baseTo->getAvailableQuarters() - _baseTo->getUsedQuarters())
		{
			errorMessage = tr("STR_NO_FREE_ACCOMODATION");
		}
		break;
	case TRANSFER_CRAFT:
		craft = (Craft*)getRow().rule;
		if (craft->getStatus() == "STR_OUT" && craft->getNumTotalSoldiers() > 0)
		{
			errorMessage = "병사가 탑승한 출격 중 함선은 귀환 후 이송하세요.";
		}
		else if (_cQty + 1 - (int)exchangeMap[this].size() > _baseTo->getAvailableHangars() - _baseTo->getUsedHangars())
		{
			_timerInc->stop();
			if (_debriefingState == 0 && craft && craft->getStatus() != "STR_OUT")
			{
				_game->pushState(new ExchangeCraftState(this, craft, _baseTo));
				_errorShown = true;
				return;
			}
			errorMessage = tr("STR_NO_FREE_HANGARS_FOR_TRANSFER");
		}
		
		else if (Options::storageLimitsEnforced)
		{
			double used = craft->getTotalItemStorageSize();
			if (used > 0.0 && _baseTo->storesOverfull(_iQty + used - exchangedStores()))
			{
				errorMessage = tr("STR_NOT_ENOUGH_STORE_SPACE_FOR_CRAFT");
			}
		}
		break;
	case TRANSFER_ITEM:
		selItem = (RuleItem*)getRow().rule;
		if (selItem->getSize() > 0.0 && _baseTo->storesOverfull(selItem->getSize() + _iQty - exchangedStores()))
		{
			errorMessage = tr("STR_NOT_ENOUGH_STORE_SPACE");
		}
		if (selItem->isAlien())
		{
			if (Options::storageLimitsEnforced * _aQty + 1 > _baseTo->getAvailableContainment(selItem->getPrisonType()) - Options::storageLimitsEnforced * _baseTo->getUsedContainment(selItem->getPrisonType()))
			{
				errorMessage = trAlt("STR_NO_ALIEN_CONTAINMENT_FOR_TRANSFER", selItem->getPrisonType());
			}
		}
		break;
	}

	if (errorMessage.empty())
	{
		int freeQuarters = _baseTo->getAvailableQuarters() - _baseTo->getUsedQuarters() - _pQty;
		switch (getRow().type)
		{
		case TRANSFER_SOLDIER:
		case TRANSFER_SCIENTIST:
		case TRANSFER_ENGINEER:
			change = std::min(std::min(freeQuarters, getRow().qtySrc - getRow().amount), change);
			_pQty += change;
			getRow().amount += change;
			_total += getRow().cost * change;
			break;
		case TRANSFER_CRAFT:
			_cQty++;
			_iQty += craft->getTotalItemStorageSize();
			getRow().amount++;
			if (!Options::canTransferCraftsWhileAirborne || craft->getStatus() != "STR_OUT")
				_total += getRow().cost;
			break;
		case TRANSFER_ITEM:
			if (selItem->isAlien())
			{
				int freeContainment = Options::storageLimitsEnforced ? _baseTo->getAvailableContainment(selItem->getPrisonType()) - _baseTo->getUsedContainment(selItem->getPrisonType()) - _aQty : INT_MAX;
				change = std::min(std::min(freeContainment, getRow().qtySrc - getRow().amount), change);
			}
			// both aliens and items
			{
				double storesNeededPerItem = ((RuleItem*)getRow().rule)->getSize();
				double freeStores = _baseTo->getAvailableStores() - _baseTo->getUsedStores() - _iQty + exchangedStores();
				double freeStoresForItem = (double)(INT_MAX);
				if (!AreSame(storesNeededPerItem, 0.0) && storesNeededPerItem > 0.0)
				{
					freeStoresForItem = (freeStores + 0.05) / storesNeededPerItem;
				}
				change = std::min(std::min((int)freeStoresForItem, getRow().qtySrc - getRow().amount), change);
				_iQty += change * storesNeededPerItem;
			}
			if (selItem->isAlien())
			{
				_aQty += change;
			}
			getRow().amount += change;
			_total += getRow().cost * change;
			break;
		}
		updateItemStrings();
	}
	else
	{
		_timerInc->stop();
		RuleInterface *menuInterface = _game->getMod()->getInterface("transferMenu");
		_game->pushState(new ErrorMessageState(errorMessage, _palette, menuInterface->getElement("errorMessage")->color, "BACK13.SCR", menuInterface->getElement("errorPalette")->color));
		_errorShown = true;
	}
}

/**
 * Decreases the quantity of the selected item to transfer by one.
 */
void TransferItemsState::decrease()
{
	_timerInc->setInterval(50);
	_timerDec->setInterval(50);
	decreaseByValue(_game->getScrollStep());
}

/**
 * Decreases the quantity of the selected item to transfer by "change".
 * @param change How much we want to remove.
 */
void TransferItemsState::decreaseByValue(int change)
{
	if (0 >= change || 0 >= getRow().amount) return;
	Craft *craft = 0;
	change = std::min(getRow().amount, change);

	switch (getRow().type)
	{
	case TRANSFER_SOLDIER:
	case TRANSFER_SCIENTIST:
	case TRANSFER_ENGINEER:
		_pQty -= change;
		break;
	case TRANSFER_CRAFT:
		craft = (Craft*)getRow().rule;
		_cQty--;
		_iQty -= craft->getTotalItemStorageSize();
		for (auto it = exchangeMap[this].begin(); it != exchangeMap[this].end(); ++it)
		{
			if (it->first == craft)
			{
				_total -= returnCraftCost(it->second);
				exchangeMap[this].erase(it);
				break;
			}
		}
		break;
	case TRANSFER_ITEM:
		const RuleItem *selItem = (RuleItem*)getRow().rule;
		_iQty -= selItem->getSize() * change;
		if (selItem->isAlien())
		{
			_aQty -= change;
		}
		break;
	}
	getRow().amount -= change;
	if (!Options::canTransferCraftsWhileAirborne || 0 == craft || craft->getStatus() != "STR_OUT")
		_total -= getRow().cost * change;
	updateItemStrings();
}

/**
 * Updates the quantity-strings of the selected item.
 */
void TransferItemsState::updateItemStrings()
{
	std::ostringstream ss1, ss2;
	ss1 << getRow().qtySrc - getRow().amount;
	ss2 << getRow().amount;
	_lstItems->setCellText(_sel, 1, ss1.str());
	_lstItems->setCellText(_sel, 2, ss2.str());

	if (getRow().amount > 0)
	{
		_lstItems->setRowColor(_sel, _lstItems->getSecondaryColor());
	}
	else
	{
		_lstItems->setRowColor(_sel, _lstItems->getColor());
		if (getRow().type == TRANSFER_ITEM)
		{
			RuleItem *rule = (RuleItem*)getRow().rule;
			if (rule->getBattleType() == BT_AMMO || (rule->getBattleType() == BT_NONE && rule->getClipSize() > 0))
			{
				_lstItems->setRowColor(_sel, _ammoColor);
			}
		}
	}
}

/**
 * Gets the total cost of the current transfer.
 * @return Total cost.
 */
int TransferItemsState::getTotal() const
{
	int ret = std::max(1, _total * _game->getMod()->getGlobalTransferCostMultiplier() / _game->getMod()->getGlobalTransferCostDivider());

	if (ret == 1)
	{
		bool empty = true;
		for (const auto& item : _items)
		{
			if (item.amount != 0)
			{
				empty = false;
				break;
			}
		}
		if (empty)
			return 0;
	}

	return ret;
}


double TransferItemsState::exchangedStores() const
{
    double result = 0;
    auto it = exchangeMap.find(this);
    if (it != exchangeMap.end())
        for (const auto &p : it->second) result += p.second->getTotalItemStorageSize();
    return result;
}
int TransferItemsState::returnCraftCost(Craft *craft) const
{
    return (craft->getStatus() == "STR_OUT" && Options::canTransferCraftsWhileAirborne) ? 0 : (int)(25 * _distance);
}
bool TransferItemsState::projectedCapacitiesValid(int outboundCrafts, int outboundCrew,
    double outboundStores, int inboundCrafts, int inboundCrew, double inboundStores) const
{
    if (_baseTo->getUsedHangars() + outboundCrafts - inboundCrafts > _baseTo->getAvailableHangars()) return false;
    if (_baseFrom->getUsedHangars() - outboundCrafts + inboundCrafts > _baseFrom->getAvailableHangars()) return false;
    // R176: only explicit personnel transfers count. A craft-only exchange
    // never creates transferred soldiers and needs no additional quarters.
    const int netPersonnelTo = outboundCrew - inboundCrew;
    if (netPersonnelTo > 0 &&
        _baseTo->getUsedQuarters() + netPersonnelTo > _baseTo->getAvailableQuarters()) return false;
    if (netPersonnelTo < 0 &&
        _baseFrom->getUsedQuarters() - netPersonnelTo > _baseFrom->getAvailableQuarters()) return false;
    if (Options::storageLimitsEnforced)
    {
        // Do not reject a swap that preserves or reduces existing stored cargo.
        const double netCargoTo = outboundStores - inboundStores;
        if (netCargoTo > 0.00001 && _baseTo->storesOverfull(netCargoTo)) return false;
        if (netCargoTo < -0.00001 && _baseFrom->storesOverfull(-netCargoTo)) return false;
    }
    return true;
}
bool TransferItemsState::validateExchangePlan() const
{
    auto it = exchangeMap.find(this);
    if (it == exchangeMap.end() || it->second.empty()) return true;
    double stores = 0;
    std::vector<Craft*> used;
    for (const auto &p : it->second)
    {
        bool selected = false, present = false;
        for (const auto &row : _items)
            if (row.type == TRANSFER_CRAFT && row.rule == p.first && row.amount > 0) selected = true;
        for (Craft *c : *_baseTo->getCrafts()) if (c == p.second) present = true;
        if (!selected || !present || std::find(used.begin(), used.end(), p.second) != used.end()) return false;
        used.push_back(p.second);
        stores += p.second->getTotalItemStorageSize();
    }
    return projectedCapacitiesValid(_cQty, _pQty, _iQty, (int)it->second.size(), 0, stores);
}
std::string TransferItemsState::exchangeBlockReason(Craft *outgoing, Craft *incoming) const
{
    if (!outgoing || !incoming) return "함선 정보가 없습니다.";
    if (outgoing->getStatus() == "STR_OUT" || incoming->getStatus() == "STR_OUT")
        return "출격 중인 함선은 귀환 후 교환할 수 있습니다.";
    bool from = false, to = false;
    for (Craft *c : *_baseFrom->getCrafts()) if (c == outgoing) from = true;
    for (Craft *c : *_baseTo->getCrafts()) if (c == incoming) to = true;
    if (!from || !to) return "선택한 함선이 해당 기지에 없습니다.";
    for (const auto &row : _items)
        if (row.type == TRANSFER_CRAFT && row.rule == outgoing && row.amount != 0)
            return "보내는 함선이 이미 이송 목록에 있습니다.";
    auto it = exchangeMap.find(this);
    int count = 0;
    double stores = 0;
    if (it != exchangeMap.end())
    {
        count = (int)it->second.size();
        for (const auto &pair : it->second)
        {
            if (pair.first == outgoing || pair.second == incoming)
                return "이 함선은 이미 다른 교환에 예약되었습니다.";
            stores += pair.second->getTotalItemStorageSize();
        }
    }
    const int fromHangars = _baseFrom->getUsedHangars() - (_cQty + 1) + (count + 1);
    const int toHangars = _baseTo->getUsedHangars() + (_cQty + 1) - (count + 1);
    if (fromHangars > _baseFrom->getAvailableHangars())
        return "보내는 기지 격납고 초과: " +
            std::to_string(fromHangars) + "/" + std::to_string(_baseFrom->getAvailableHangars());
    if (toHangars > _baseTo->getAvailableHangars())
        return "받는 기지 격납고 초과: " +
            std::to_string(toHangars) + "/" + std::to_string(_baseTo->getAvailableHangars());
    // _pQty contains separately selected personnel transfers only.
    if (_pQty > 0 && _baseTo->getUsedQuarters() + _pQty > _baseTo->getAvailableQuarters())
        return "별도로 선택한 병사 이송의 숙소가 부족합니다.";
    if (Options::storageLimitsEnforced)
    {
        const double cargoTo = _iQty + outgoing->getTotalItemStorageSize() -
            stores - incoming->getTotalItemStorageSize();
        if (cargoTo > 0.00001 && _baseTo->storesOverfull(cargoTo))
            return "받는 기지 창고 부족 (함선 적재품 포함)";
        if (cargoTo < -0.00001 && _baseFrom->storesOverfull(-cargoTo))
            return "보내는 기지 창고 부족 (역방향 적재품 포함)";
    }
    return std::string();
}
bool TransferItemsState::canExchangeCraft(Craft *outgoing, Craft *incoming) const
{
    return exchangeBlockReason(outgoing, incoming).empty();
}
bool TransferItemsState::queueCraftExchange(Craft *outgoing, Craft *incoming)
{
    if (!canExchangeCraft(outgoing, incoming)) return false;
    for (size_t i = 0; i < _items.size(); ++i)
    {
        TransferRow &row = _items[i];
        if (row.type != TRANSFER_CRAFT || row.rule != outgoing || row.amount != 0) continue;
        row.amount = 1;
        ++_cQty;
        _iQty += outgoing->getTotalItemStorageSize();
        _total += row.cost + returnCraftCost(incoming);
        exchangeMap[this].push_back(std::make_pair(outgoing, incoming));
        updateList();
        return true;
    }
    return false;
}

/**
 * Gets the shortest distance between the two bases.
 * @return Distance.
 */
double TransferItemsState::getDistance() const
{
	double x[3], y[3], z[3], r = 51.2;
	Base *base = _baseFrom;
	for (int i = 0; i < 2; ++i) {
		x[i] = r * cos(base->getLatitude()) * cos(base->getLongitude());
		y[i] = r * cos(base->getLatitude()) * sin(base->getLongitude());
		z[i] = r * -sin(base->getLatitude());
		base = _baseTo;
	}
	x[2] = x[1] - x[0];
	y[2] = y[1] - y[0];
	z[2] = z[1] - z[0];
	return sqrt(x[2] * x[2] + y[2] * y[2] + z[2] * z[2]);
}

/**
* Updates the production list to match the category filter.
*/
// R138: header sorting changes displayed indices only, never transfer transactions.
void TransferItemsState::r138ApplyColumnSort(int column)
{
	R138TransferColumnSortState &sort = r138TransferColumnSort[this];
	if (sort.column == column) sort.descending = !sort.descending;
	else { sort.column = column; sort.descending = true; }
	_txtQuantity->setInvert(column == 1);
	_txtAmountTransfer->setInvert(column == 2);
	_txtAmountDestination->setInvert(column == 3);
    _txtQuantity->setText(r140SortHeader(std::string(tr("STR_QUANTITY_UC")), column == 1, sort.descending));
    _txtAmountTransfer->setText(r140SortHeader(std::string(tr("STR_AMOUNT_TO_TRANSFER")), column == 2, sort.descending));
    _txtAmountDestination->setText(r140SortHeader(std::string(tr("STR_AMOUNT_AT_DESTINATION")), column == 3, sort.descending));
	const size_t scrollPos = _lstItems->getScroll();
	updateList();
	// The list refresh already restored the corresponding item anchor.
}
void TransferItemsState::r138SortSourceQty(Action *) { r138ApplyColumnSort(1); }
void TransferItemsState::r138SortTransferAmount(Action *) { r138ApplyColumnSort(2); }
void TransferItemsState::r138SortDestinationQty(Action *) { r138ApplyColumnSort(3); }

void TransferItemsState::cbxCategoryChange(Action *)
{
	_previousSort = _currentSort;

	if (_game->isCtrlPressed(true))
	{
		_currentSort = _game->isShiftPressed(true) ? TransferSortDirection::BY_UNIT_SIZE : TransferSortDirection::BY_TOTAL_SIZE;
	}
	else if (_game->isAltPressed(true))
	{
		_currentSort = _game->isShiftPressed(true) ? TransferSortDirection::BY_UNIT_COST : TransferSortDirection::BY_TOTAL_COST;
	}
	else
	{
		_currentSort = TransferSortDirection::BY_LIST_ORDER;
	}

	updateList();
}

}
