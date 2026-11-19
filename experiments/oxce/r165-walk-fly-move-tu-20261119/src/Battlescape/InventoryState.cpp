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
#include "InventoryState.h"
#include "InventoryLoadState.h"
#include "InventorySaveState.h"
#include "InventoryPersonalState.h"
#include <algorithm>
#include "Inventory.h"
#include "../Basescape/SoldierArmorState.h"
#include "../Basescape/SoldierAvatarState.h"
#include "../Basescape/SoldierVoiceState.h"
#include "../Basescape/SoldierDiaryLightState.h"
#include "../Engine/Game.h"
#include "../Engine/FileMap.h"
#include "../Mod/Mod.h"
#include "../Engine/LocalizedText.h"
#include "../Engine/Screen.h"
#include "../Engine/Palette.h"
#include "../Engine/Surface.h"
#include "../Engine/Collections.h"
#include "../Interface/Text.h"
#include "../Interface/TextEdit.h"
#include "../Interface/BattlescapeButton.h"
#include "../Interface/TextButton.h"
#include "../Engine/Action.h"
#include "../Engine/InteractiveSurface.h"
#include "../Engine/Sound.h"
#include "../Engine/SurfaceSet.h"
#include "../Savegame/SavedGame.h"
#include "../Savegame/Tile.h"
#include "../Savegame/SavedBattleGame.h"
#include "../Savegame/Base.h"
#include "../Savegame/BattleUnit.h"
#include "../Savegame/Craft.h"
#include "../Savegame/Production.h"
#include "../Savegame/ItemContainer.h"
#include "../Savegame/Soldier.h"
#include "../Mod/RuleItem.h"
#include "../Mod/RuleDamageType.h"
#include "../Engine/RNG.h"
#include "../Engine/Logger.h"
#include <sstream>
#include "../Mod/RuleManufacture.h"
#include "../Ufopaedia/CombatPowerHud.h"
#include "../Savegame/Country.h"
#include "../Mod/RuleCountry.h"
#include <set>
#include <map>
#include <algorithm>
#include <cmath>
#include <tuple>
#include "../Mod/RuleInventory.h"
#include "../Mod/RuleSoldier.h"
#include "../Mod/Armor.h"
#include "../Engine/Options.h"
#include "UnitInfoState.h"
#include "BattlescapeState.h"
#include "BattlescapeGenerator.h"
#include "ExtendedInventoryLinksState.h"
#include "TileEngine.h"
#include "../Mod/RuleInterface.h"
#include "../Ufopaedia/Ufopaedia.h"

namespace OpenXcom
{

// R48: persists across inventory views within the running process.
static bool r48InventoryDamageVisible = true;
// R164 regression restore: dedicated prebattle low-TU and squad-clear controls.
static TextButton *r164LowTuButton = nullptr;
static TextButton *r164ClearAllButton = nullptr;
static const int _templateBtnX = 288;
static const int _createTemplateBtnY = 90;
static const int _applyTemplateBtnY  = 113;

/**
 * Initializes all the elements in the Inventory screen.
 * @param game Pointer to the core game.
 * @param tu Does Inventory use up Time Units?
 * @param parent Pointer to parent Battlescape.
 */
InventoryState::InventoryState(bool tu, BattlescapeState *parent, Base *base, bool noCraft) :
	_tu(tu), _noCraft(noCraft), _parent(parent), _base(base),
	_resetCustomDeploymentBackup(false), _reloadUnit(false), _globalLayoutIndex(-1)
{
	_battleGame = _game->getSavedGame()->getSavedBattle();

	if (Options::oxceAlternateCraftEquipmentManagement && !_tu && _base && _noCraft)
	{
		// deassign all soldiers
		for (auto* soldier : *_base->getSoldiers())
		{
			_backup[soldier] = soldier->getCraft();
			if (soldier->getCraft() && soldier->getCraft()->getStatus() != "STR_OUT")
			{
				soldier->setCraftAndMoveEquipment(0, _base, _game->getSavedGame()->getMonthsPassed() == -1);
			}
		}
	}

	if (Options::maximizeInfoScreens)
	{
		Options::baseXResolution = Screen::ORIGINAL_WIDTH;
		Options::baseYResolution = Screen::ORIGINAL_HEIGHT;
		_game->getScreen()->resetDisplay(false);
	}
	else if (_battleGame->isBaseCraftInventory())
	{
		Screen::updateScale(Options::battlescapeScale, Options::baseXBattlescape, Options::baseYBattlescape, true);
		_game->getScreen()->resetDisplay(false);
	}

	// Create objects
	_bg = new Surface(320, 200, 0, 0);
	_soldier = new Surface(320, 200, 0, 0);
	_txtPosition = new Text(70, 9, 65, 95);
	// Non-interactive status above the ground-page header.
	_txtNameStatic = new Text(210, 17, 28, 6);
	_txtName = new TextEdit(this, 210, 17, 28, 6);
	_txtTus = new Text(40, 9, 245, 24);
	_txtWeight = new Text(70, 9, 245, 24);
	_txtStatLine1 = new Text(70, 9, 245, 32);
	_txtStatLine2 = new Text(70, 9, 245, 40);
	_txtStatLine3 = new Text(70, 9, 245, 48);
	_txtStatLine4 = new Text(70, 9, 245, 56);
	// Keep the original caption Y; center it between the two leg slots.
	_txtItem = new Text(100, 9, 30, 126);
	_txtAmmo = new Text(66, 24, 254, 64);
	_btnOk = new BattlescapeButton(35, 22, 237, 1);
	_btnPrev = new BattlescapeButton(23, 22, 273, 1);
	_btnNext = new BattlescapeButton(23, 22, 297, 1);
	_btnUnload = new BattlescapeButton(32, 25, 288, 32);
	_btnGround = new BattlescapeButton(32, 15, 289, 137);
	_btnGroundPrev = new TextButton(17, 15, 271, 137);
	// Compact single-line ground toolbar. Its bounds (x=72..270, y=138..149)
	// are AFTER the page label and BEFORE the page arrows (x>=271).
	// No overlap with the soldier-name editor, the hovered-item caption, the
	// quick-search field, or equipment grid (ground starts below this row).
	_btnTagAll = new TextButton(22, 11, 72, 138);
	_btnTagWater = new TextButton(22, 11, 96, 138);
	_btnTagStealth = new TextButton(22, 11, 120, 138);
	_btnTagQuiet = new TextButton(22, 11, 144, 138);
	_btnTagZeroG = new TextButton(18, 11, 168, 138);
	_btnTagExo = new TextButton(20, 11, 188, 138);
	_btnTagDream = new TextButton(18, 11, 210, 138);
	_btnAutoAll = new TextButton(40, 11, 230, 138);
	// Compact second toolbar row; do not obscure search or ground paging.
	r164LowTuButton = new TextButton(18, 11, 230, 125);
	r164ClearAllButton = new TextButton(70, 11, 250, 125);
	_btnRank = new BattlescapeButton(26, 23, 0, 0);
	_btnArmor = new BattlescapeButton(RuleInventory::PAPERDOLL_W, RuleInventory::PAPERDOLL_H, RuleInventory::PAPERDOLL_X, RuleInventory::PAPERDOLL_Y);
	_btnCreateTemplate = new BattlescapeButton(32, 22, _templateBtnX, _createTemplateBtnY);
	_btnApplyTemplate = new BattlescapeButton(32, 22, _templateBtnX, _applyTemplateBtnY);
	const Element* pixelShift = _game->getMod()->getInterface("inventory")->getElementOptional("buttonLinks");
	if (pixelShift && pixelShift->TFTDMode)
	{
		_btnLinks = new BattlescapeButton(23, 22, 213, 0);
	}
	else
	{
		_btnLinks = new BattlescapeButton(23, 22, 213, 1);
	}
	_selAmmo = new Surface(RuleInventory::HAND_W * RuleInventory::SLOT_W, RuleInventory::HAND_H * RuleInventory::SLOT_H, 272, 88);
	_inv = new Inventory(_game, 320, 200, 0, 0, _parent == 0);
	_inv->setDamageOverlayVisible(r48InventoryDamageVisible);
	// The leg item-slot bounds come from the active ruleset (not a fixed
	// hardcoded HUD pixel). Reserve their actual horizontal gap for item
	// names and button tooltips while retaining y=126.
	const RuleInventory *leftLeg = _game->getMod()->getInventory("STR_LEFT_LEG", false);
	const RuleInventory *rightLeg = _game->getMod()->getInventory("STR_RIGHT_LEG", false);
	if (leftLeg && rightLeg && !leftLeg->getSlots()->empty() &&
	    !rightLeg->getSlots()->empty())
	{
	    auto legBounds = [](const RuleInventory *leg) {
	        int first = 999, last = -1;
	        for (const RuleSlot &slot : *leg->getSlots())
	        {
	            first = std::min(first, slot.x);
	            last = std::max(last, slot.x);
	        }
	        return std::make_pair(leg->getX() + first * RuleInventory::SLOT_W,
	                              leg->getX() + (last + 1) * RuleInventory::SLOT_W);
	    };
	    auto a = legBounds(leftLeg);
	    auto b = legBounds(rightLeg);
	    if (a.first > b.first) std::swap(a, b);
	    const int freeStart = a.second + 1;
	    const int freeEnd = b.first - 1;
	    const int gap = freeEnd - freeStart;
	    if (gap > 0)
	    {
	        // Never let long translated item names overlap either leg slot.
	        // The text box is clipped to the free gap and center aligned.
	        const int width = std::min(100, gap);
	        _txtItem->setWidth(width);
	        _txtItem->setX(freeStart + (gap - width) / 2);
	    }
	    else
	    {
	        // Nonstandard armor inventory layout without a gap: hide the
	        // caption rather than drawing on live inventory cells.
	        _txtItem->setWidth(1);
	        _txtItem->setX(std::min(319, std::max(0, a.second)));
	    }
	}
	// Reserve the line above the toolbar for optional quick search.
	// R164B: reserve x=230..319 for 低 and 전원해제; keep the
	// quick-search edit at x=184..224 (R87 proven non-overlap layout).
	_btnQuickSearch = new TextEdit(this, 40, 9, 184, 126);

	// Set palette
	setStandardPalette("PAL_BATTLESCAPE");

	add(_bg);

	// Set up objects
	_game->getMod()->getSurface("TAC01.SCR")->blitNShade(_bg, 0, 0);
	add(_btnArmor, "buttonArmor", "inventory", _bg);

	add(_soldier);
	add(_btnQuickSearch, "textItem", "inventory");
	add(_txtNameStatic, "textName", "inventory", _bg);
	add(_txtName, "textName", "inventory", _bg);
	add(_txtTus, "textTUs", "inventory", _bg);
	add(_txtWeight, "textWeight", "inventory", _bg);
	add(_txtStatLine1, "textStatLine1", "inventory", _bg);
	add(_txtStatLine2, "textStatLine2", "inventory", _bg);
	add(_txtStatLine3, "textStatLine3", "inventory", _bg);
	add(_txtStatLine4, "textStatLine4", "inventory", _bg);
	add(_txtItem, "textItem", "inventory", _bg);
	add(_txtAmmo, "textAmmo", "inventory", _bg);
	add(_btnOk, "buttonOK", "inventory", _bg);
	add(_btnPrev, "buttonPrev", "inventory", _bg);
	add(_btnNext, "buttonNext", "inventory", _bg);
	add(_btnUnload, "buttonUnload", "inventory", _bg);
	add(_btnGround, "buttonGround", "inventory", _bg);
	add(_btnGroundPrev, "buttonGround", "inventory", _bg);
	add(_btnRank, "rank", "inventory", _bg);
	add(_btnCreateTemplate, "buttonCreate", "inventory", _bg);
	add(_btnApplyTemplate, "buttonApply", "inventory", _bg);
	add(_btnLinks, "buttonLinks", "inventory", _bg);
	add(_selAmmo);
	add(_inv);
	add(_txtPosition, "textSlot", "inventory", _bg);
	// Toolbar overlays the ground-page header without covering inventory slots.
	add(_btnTagAll, "buttonGround", "inventory", _bg);
	add(_btnTagWater, "buttonGround", "inventory", _bg);
	add(_btnTagStealth, "buttonGround", "inventory", _bg);
	add(_btnTagQuiet, "buttonGround", "inventory", _bg);
	add(_btnTagZeroG, "buttonGround", "inventory", _bg);
	add(_btnTagExo, "buttonGround", "inventory", _bg);
	add(_btnTagDream, "buttonGround", "inventory", _bg);
	add(_btnAutoAll, "buttonGround", "inventory", _bg);
	add(r164LowTuButton, "buttonGround", "inventory", _bg);
	add(r164ClearAllButton, "buttonGround", "inventory", _bg);

	// move the TU display down to make room for the weight display
	if (Options::showMoreStatsInInventoryView)
	{
		_txtTus->setY(_txtTus->getY() + 8);
	}

	centerAllSurfaces();


	_txtPosition->setHighContrast(true);

	_txtNameStatic->setBig();
	_txtNameStatic->setHighContrast(true);

	_txtName->setBig();
	_txtName->setHighContrast(true);
	_txtName->onChange((ActionHandler)&InventoryState::edtSoldierChange);
	_txtName->onMousePress((ActionHandler)&InventoryState::edtSoldierPress);

	if (Options::oxceLinksDisableTextEdit)
	{
		_txtName->setVisible(false);
	}
	else
	{
		_txtNameStatic->setVisible(false);
	}

	_txtTus->setHighContrast(true);

	_txtWeight->setHighContrast(true);

	_txtStatLine1->setHighContrast(true);

	_txtStatLine2->setHighContrast(true);

	_txtStatLine3->setHighContrast(true);

	_txtStatLine4->setHighContrast(true);

	_txtItem->setHighContrast(true);
	_txtItem->setAlign(ALIGN_CENTER);

	_txtAmmo->setAlign(ALIGN_CENTER);
	_txtAmmo->setHighContrast(true);

	_btnOk->onMouseClick((ActionHandler)&InventoryState::btnOkClick);
	_btnOk->onKeyboardPress((ActionHandler)&InventoryState::btnOkClick, Options::keyCancel);
	_btnOk->onKeyboardPress((ActionHandler)&InventoryState::btnOkClick, Options::keyBattleInventory);
	_btnOk->onKeyboardPress((ActionHandler)&InventoryState::btnUfopaediaClick, Options::keyGeoUfopedia);
	_btnOk->onKeyboardPress((ActionHandler)&InventoryState::btnArmorClick, Options::keyInventoryArmor);
	_btnOk->onKeyboardPress((ActionHandler)&InventoryState::btnArmorClickRight, Options::keyInventoryAvatar);
	_btnOk->onKeyboardPress((ActionHandler)&InventoryState::btnInventoryLoadClick, Options::keyInventoryLoad);
	_btnOk->onKeyboardPress((ActionHandler)&InventoryState::btnInventorySaveClick, Options::keyInventorySave);
	_btnOk->onKeyboardPress((ActionHandler)&InventoryState::btnCreatePersonalTemplateClick, Options::keyInvSavePersonalEquipment);
	_btnOk->onKeyboardPress((ActionHandler)&InventoryState::btnApplyPersonalTemplateClick, Options::keyInvLoadPersonalEquipment);
	_btnOk->onKeyboardPress((ActionHandler)&InventoryState::btnShowPersonalTemplateClick, Options::keyInvShowPersonalEquipment);
	_btnOk->onKeyboardPress((ActionHandler)&InventoryState::btnDiaryLightClick, Options::keyInventoryDiaryLight);
	_btnOk->setTooltip("STR_OK");
	_btnOk->onMouseIn((ActionHandler)&InventoryState::txtTooltipInExtraOK);
	_btnOk->onMouseOut((ActionHandler)&InventoryState::txtTooltipOut);
	_btnOk->onKeyboardPress((ActionHandler)&InventoryState::invMouseOver, SDLK_LALT);
	_btnOk->onKeyboardRelease((ActionHandler)&InventoryState::invMouseOver, SDLK_LALT);
	_btnOk->onKeyboardPress((ActionHandler)&InventoryState::invMouseOver, SDLK_RALT);
	_btnOk->onKeyboardRelease((ActionHandler)&InventoryState::invMouseOver, SDLK_RALT);

	_btnPrev->onMouseClick((ActionHandler)&InventoryState::btnPrevClick);
	_btnPrev->onKeyboardPress((ActionHandler)&InventoryState::btnPrevClick, Options::keyBattlePrevUnit);
	_btnPrev->setTooltip("STR_PREVIOUS_UNIT");
	_btnPrev->onMouseIn((ActionHandler)&InventoryState::txtTooltipIn);
	_btnPrev->onMouseOut((ActionHandler)&InventoryState::txtTooltipOut);

	_btnNext->onMouseClick((ActionHandler)&InventoryState::btnNextClick);
	_btnNext->onKeyboardPress((ActionHandler)&InventoryState::btnNextClick, Options::keyBattleNextUnit);
	_btnNext->setTooltip("STR_NEXT_UNIT");
	_btnNext->onMouseIn((ActionHandler)&InventoryState::txtTooltipIn);
	_btnNext->onMouseOut((ActionHandler)&InventoryState::txtTooltipOut);

	_btnUnload->onMouseClick((ActionHandler)&InventoryState::btnUnloadClick);
	_btnUnload->setTooltip("STR_UNLOAD_WEAPON");
	_btnUnload->onMouseIn((ActionHandler)&InventoryState::txtTooltipIn);
	_btnUnload->onMouseOut((ActionHandler)&InventoryState::txtTooltipOut);

	_btnTagAll->onMouseClick((ActionHandler)&InventoryState::btnTagAllClick);
	_btnTagWater->onMouseClick((ActionHandler)&InventoryState::btnTagWaterClick);
	_btnTagStealth->onMouseClick((ActionHandler)&InventoryState::btnTagStealthClick);
	_btnTagQuiet->onMouseClick((ActionHandler)&InventoryState::btnTagQuietClick);
	_btnTagZeroG->onMouseClick((ActionHandler)&InventoryState::btnTagZeroGClick);
	_btnTagExo->onMouseClick((ActionHandler)&InventoryState::btnTagExoClick);
	_btnTagDream->onMouseClick((ActionHandler)&InventoryState::btnTagDreamClick);
	_btnAutoAll->onMouseClick((ActionHandler)&InventoryState::btnAutoAllClick);
	_btnAutoAll->setText("전원자동");
	_btnAutoAll->setSmall();
	_btnAutoAll->setVisible(!_tu);
	r164LowTuButton->onMouseClick((ActionHandler)&InventoryState::btnAutoAllClick);
	r164LowTuButton->setText("低");
	r164LowTuButton->setSmall();
	r164LowTuButton->setVisible(!_tu);
	r164ClearAllButton->onMouseClick((ActionHandler)&InventoryState::btnAutoAllClick);
	r164ClearAllButton->setText("전원해제");
	r164ClearAllButton->setSmall();
	r164ClearAllButton->setVisible(!_tu);
	_btnTagQuiet->setSmall();
	_btnTagZeroG->setSmall();
	_btnTagExo->setSmall();
	_btnTagDream->setSmall();
	_btnTagAll->setSmall();
	_btnTagWater->setSmall();
	_btnTagStealth->setSmall();
	updateTagButtons();

	_btnGroundPrev->setText("<");
	_btnGroundPrev->onMouseClick((ActionHandler)&InventoryState::btnGroundClickBackward);
	_btnGroundPrev->setTooltip("STR_SCROLL_LEFT");
	_btnGroundPrev->onMouseIn((ActionHandler)&InventoryState::txtTooltipIn);
	_btnGroundPrev->onMouseOut((ActionHandler)&InventoryState::txtTooltipOut);

	_btnGround->onMouseClick((ActionHandler)&InventoryState::btnGroundClickForward, SDL_BUTTON_LEFT);
	_btnGround->onMouseClick((ActionHandler)&InventoryState::btnGroundClickBackward, SDL_BUTTON_RIGHT);
	_btnGround->setTooltip("STR_SCROLL_RIGHT");
	_btnGround->onMouseIn((ActionHandler)&InventoryState::txtTooltipIn);
	_btnGround->onMouseOut((ActionHandler)&InventoryState::txtTooltipOut);
	_btnGround->onKeyboardPress((ActionHandler)&InventoryState::btnGroundClickBackward, Options::keyBattleLeft);
	_btnGround->onKeyboardPress((ActionHandler)&InventoryState::btnGroundClickForward, Options::keyBattleRight);

	_btnRank->onMouseClick((ActionHandler)&InventoryState::btnRankClick);
	_btnRank->setTooltip("STR_UNIT_STATS");
	_btnRank->onMouseIn((ActionHandler)&InventoryState::txtTooltipIn);
	_btnRank->onMouseOut((ActionHandler)&InventoryState::txtTooltipOut);

	if (!_game->getMod()->getInventoryOverlapsPaperdoll())
	{
		_btnArmor->onMouseClick((ActionHandler)&InventoryState::btnArmorClick);
		_btnArmor->onMouseClick((ActionHandler)&InventoryState::btnArmorClickRight, SDL_BUTTON_RIGHT);
		_btnArmor->onMouseClick((ActionHandler)&InventoryState::btnArmorClickMiddle, SDL_BUTTON_MIDDLE);
		_btnArmor->onMouseIn((ActionHandler)&InventoryState::txtArmorTooltipIn);
		_btnArmor->onMouseOut((ActionHandler)&InventoryState::txtArmorTooltipOut);
	}

	_btnCreateTemplate->onMouseClick((ActionHandler)&InventoryState::btnCreateTemplateClick);
	_btnCreateTemplate->onKeyboardPress((ActionHandler)&InventoryState::btnCreateTemplateClick, Options::keyInvCreateTemplate);
	_btnCreateTemplate->setTooltip("STR_CREATE_INVENTORY_TEMPLATE");
	_btnCreateTemplate->onMouseIn((ActionHandler)&InventoryState::txtTooltipIn);
	_btnCreateTemplate->onMouseOut((ActionHandler)&InventoryState::txtTooltipOut);

	_btnApplyTemplate->onMouseClick((ActionHandler)&InventoryState::btnApplyTemplateClick);
	_btnApplyTemplate->onKeyboardPress((ActionHandler)&InventoryState::btnApplyTemplateClick, Options::keyInvApplyTemplate);
	_btnApplyTemplate->onKeyboardPress((ActionHandler)&InventoryState::onClearInventory, Options::keyInvClear);
	_btnApplyTemplate->onKeyboardPress((ActionHandler)&InventoryState::onAutoequip, Options::keyInvAutoEquip);
	_btnApplyTemplate->setTooltip("STR_APPLY_INVENTORY_TEMPLATE");
	_btnApplyTemplate->onMouseIn((ActionHandler)&InventoryState::txtTooltipIn);
	_btnApplyTemplate->onMouseOut((ActionHandler)&InventoryState::txtTooltipOut);

	_btnLinks->onMouseClick((ActionHandler)&InventoryState::btnLinksClick);
	_btnLinks->setTooltip("STR_EXTENDED_LINKS");
	_btnLinks->onMouseIn((ActionHandler)&InventoryState::txtTooltipIn);
	_btnLinks->onMouseOut((ActionHandler)&InventoryState::txtTooltipOut);

	_btnQuickSearch->setHighContrast(true);
	_btnQuickSearch->setText(""); // redraw
	_btnQuickSearch->onEnter((ActionHandler)&InventoryState::btnQuickSearchApply);
	_btnQuickSearch->setVisible(Options::oxceQuickSearchButton);

	_btnOk->onKeyboardRelease((ActionHandler)&InventoryState::btnQuickSearchToggle, Options::keyToggleQuickSearch);

	_game->getMod()->getSurface("oxceLinksInv")->blitNShade(_btnLinks, 0, 0);
	_btnLinks->initSurfaces();
	_btnLinks->setVisible(Options::oxceLinks);

	// only use copy/paste buttons in setup (i.e. non-tu) mode
	if (_tu)
	{
		_btnCreateTemplate->setVisible(false);
		_btnApplyTemplate->setVisible(false);
	}
	else
	{
		updateTemplateButtons(true);
	}

	_inv->draw();
	_inv->setTuMode(_tu);
	_inv->setSelectedUnit(_game->getSavedGame()->getSavedBattle()->getSelectedUnit(), true);
	_inv->onMouseClick((ActionHandler)&InventoryState::invClick, 0);
	_inv->onMouseOver((ActionHandler)&InventoryState::invMouseOver);
	_inv->onMouseOut((ActionHandler)&InventoryState::invMouseOut);

	if (_battleGame->getDebugMode() && _game->isShiftPressed())
	{
		// replenish TUs
		auto* unit = _inv->getSelectedUnit();
		if (unit)
		{
			int missingTUs = unit->getBaseStats()->tu - unit->getTimeUnits();
			unit->spendTimeUnits(-missingTUs);
		}
	}

	_txtTus->setVisible(_tu);
	_txtWeight->setVisible(Options::showMoreStatsInInventoryView);
	_txtStatLine1->setVisible(Options::showMoreStatsInInventoryView && !_tu);
	_txtStatLine2->setVisible(Options::showMoreStatsInInventoryView && !_tu);
	_txtStatLine3->setVisible(Options::showMoreStatsInInventoryView && !_tu);
	_txtStatLine4->setVisible(Options::showMoreStatsInInventoryView && !_tu);
}

static void _clearInventoryTemplate(std::vector<EquipmentLayoutItem*> &inventoryTemplate)
{
	Collections::deleteAll(inventoryTemplate);
}

/**
 *
 */
InventoryState::~InventoryState()
{
	_clearInventoryTemplate(_curInventoryTemplate);
	_clearInventoryTemplate(_tempInventoryTemplate);

	if (!_battleGame->isBaseCraftInventory())
	{
		if (Options::maximizeInfoScreens)
		{
			Screen::updateScale(Options::battlescapeScale, Options::baseXBattlescape, Options::baseYBattlescape, true);
			_game->getScreen()->resetDisplay(false);
		}

		//fix case when scripts could kill unit before inventory is closed
		if (BattleUnit* unit =_battleGame->getSelectedUnit())
		{
			Tile *inventoryTile = unit->getTile();
			_battleGame->getTileEngine()->applyGravity(inventoryTile);
		}
		_battleGame->getTileEngine()->calculateLighting(LL_ITEMS); // dropping/picking up flares
		_battleGame->getTileEngine()->recalculateFOV();
	}
	else
	{
		Screen::updateScale(Options::geoscapeScale, Options::baseXGeoscape, Options::baseYGeoscape, true);
		_game->getScreen()->resetDisplay(false);
	}
}

void InventoryState::setGlobalLayoutIndex(int index, bool armorChanged)
{
	_globalLayoutIndex = index;
	if (armorChanged)
	{
		_reloadUnit = true;
	}
}

/**
 * Updates all soldier stats when the soldier changes.
 */
void InventoryState::init()
{
	State::init();
	BattleUnit *unit = _battleGame->getSelectedUnit();

	// no selected unit, close inventory
	if (unit == 0)
	{
		btnOkClick(0);
		return;
	}
	// skip to the first unit with inventory
	if (!unit->hasInventory())
	{
		if (_parent)
		{
			_parent->selectNextPlayerUnit(false, false, true, _tu);
		}
		else
		{
			_battleGame->selectNextPlayerUnit(false, false, true);
		}
		// no available unit, close inventory
		if (_battleGame->getSelectedUnit() == 0 || !_battleGame->getSelectedUnit()->hasInventory())
		{
			// starting a mission with just vehicles
			btnOkClick(0);
			return;
		}
		else
		{
			unit = _battleGame->getSelectedUnit();
		}
	}

	_soldier->clear();
	_btnRank->clear();

	if (Options::oxceInventoryShowUnitSlot)
	{
		int unitSlot = 1;
		int totalSlots = 99;
		for (auto* tmpUnit : *_battleGame->getUnits())
		{
			if (tmpUnit == unit)
			{
				if (!_noCraft && _battleGame->getMissionType() != "STR_BASE_DEFENSE")
				{
					auto* tmpCraft = unit->getGeoscapeSoldier() ? unit->getGeoscapeSoldier()->getCraft() : nullptr;
					if (tmpCraft)
					{
						totalSlots = tmpCraft->getMaxUnitsClamped();
					}
				}
				break;
			}
			unitSlot += tmpUnit->getArmor()->getTotalSize();
		}
		_txtPosition->setText(tr("STR_SLOT").arg(unitSlot).arg(totalSlots));
	}

	_txtNameStatic->setBig();
	_txtNameStatic->setText(unit->getName(_game->getLanguage()));

	_txtName->setBig();
	_txtName->setText(unit->getName(_game->getLanguage()));

	_btnLinks->setVisible(Options::oxceLinks);

	bool resetGroundOffset = _tu;
	if (unit->isSummonedPlayerUnit())
	{
		resetGroundOffset = true; // this unit is likely not standing on the shared inventory tile, just re-arrange it every time
	}
	_inv->setSelectedUnit(unit, resetGroundOffset);
	Soldier *s = unit->getGeoscapeSoldier();
	if (s)
	{
		// reload necessary after the change of armor
		if (_reloadUnit)
		{
			if (Options::oxceAlternateCraftEquipmentManagement && s->getArmor() && unit->getArmor() && s->getArmor()->getSize() > unit->getArmor()->getSize())
			{
				_resetCustomDeploymentBackup = true;
			}

			// Step 0: update unit's armor
			unit->updateArmorFromSoldier(_game->getMod(), s, s->getArmor(), _battleGame->getDepth(), false, nullptr);

			// Step 1: remember the unit's equipment (incl. loaded fixed items)
			_clearInventoryTemplate(_tempInventoryTemplate);
			_createInventoryTemplate(_tempInventoryTemplate);

			// Step 2: drop all items (and delete fixed items!!)
			Tile *groundTile = unit->getTile();
			_battleGame->getTileEngine()->itemDropInventory(groundTile, unit, true, true);

			// Step 3: equip fixed items // Note: the inventory must be *completely* empty before this step
			_battleGame->initUnit(unit);

			// Step 4: re-equip original items (unless slots taken by fixed items)
			_applyInventoryTemplate(_tempInventoryTemplate);

			// refresh ui
			_inv->arrangeGround(); // calls drawItems() too

			// reset armor tooltip
			_currentTooltip = "";
			_txtItem->setText("");

			// reload done
			_reloadUnit = false;
		}

		SurfaceSet *texture = _game->getMod()->getSurfaceSet("SMOKE.PCK");
		auto* frame = texture->getFrame(s->getRankSpriteBattlescape());
		if (frame)
		{
			frame->blitNShade(_btnRank, 0, 0);
		}

		if (s->getArmor()->hasLayersDefinition())
		{
			for (const auto& layer : s->getArmorLayers())
			{
				_game->getMod()->getSurface(layer, true)->blitNShade(_soldier, 0, 0);
			}
		}
		else
		{
			const std::string look = s->getArmor()->getSpriteInventory();
			const std::string gender = s->getGender() == GENDER_MALE ? "M" : "F";
			Surface *surf = 0;
			std::stringstream ss;

			for (int i = 0; i <= RuleSoldier::LookVariantBits; ++i)
			{
				ss.str("");
				ss << look;
				ss << gender;
				ss << (int)s->getLook() + (s->getLookVariant() & (RuleSoldier::LookVariantMask >> i)) * 4;
				ss << ".SPK";
				surf = _game->getMod()->getSurface(ss.str(), false);
				if (surf)
				{
					break;
				}
			}
			if (!surf)
			{
				ss.str("");
				ss << look;
				ss << ".SPK";
				surf = _game->getMod()->getSurface(ss.str(), false);
			}
			if (!surf)
			{
				surf = _game->getMod()->getSurface(look, true);
			}
			surf->blitNShade(_soldier, 0, 0);
		}
	}
	else
	{
		Surface *armorSurface = _game->getMod()->getSurface(unit->getArmor()->getSpriteInventory(), false);
		if (!armorSurface)
		{
			armorSurface = _game->getMod()->getSurface(unit->getArmor()->getSpriteInventory() + ".SPK", false);
		}
		if (!armorSurface)
		{
			armorSurface = _game->getMod()->getSurface(unit->getArmor()->getSpriteInventory() + "M0.SPK", false);
		}
		if (armorSurface)
		{
			armorSurface->blitNShade(_soldier, 0, 0);
		}
	}

	// coming from InventoryLoad window...
	if (_globalLayoutIndex > -1)
	{
		loadGlobalLayout((_globalLayoutIndex));
		_globalLayoutIndex = -1;

		// refresh ui
		_inv->arrangeGround();
	}

	updateStats();
	refreshMouse();
}

/**
 * Disables the input, if not a soldier. Sets the name without a statstring otherwise.
 * @param action Pointer to an action.
 */
void InventoryState::edtSoldierPress(Action *action)
{
	if (_btnLinks->getVisible())
	{
		double mx = action->getAbsoluteXMouse();
		if (mx >= _btnLinks->getX())
		{
			_txtName->setFocus(false);
			return;
		}
		else
		{
			_btnLinks->setVisible(false);
		}
	}

	{
		BattleUnit *unit = _inv->getSelectedUnit();
		if (unit != 0)
		{
			Soldier *s = unit->getGeoscapeSoldier();
			if (s)
			{
				// set the soldier's name without a statstring
				_txtName->setText(s->getName());
			}

		}
	}
}

/**
 * Changes the soldier's name.
 * @param action Pointer to an action.
 */
void InventoryState::edtSoldierChange(Action *)
{
	BattleUnit *unit = _inv->getSelectedUnit();
	if (unit != 0)
	{
		Soldier *s = unit->getGeoscapeSoldier();
		if (s)
		{
			// set the soldier's name
			s->setName(_txtName->getText());
			// also set the unit's name (with a statstring)
			unit->setName(s->getName(true));
		}
	}
}

/**
 * Updates the soldier stats (Weight, TU).
 */
void InventoryState::updateStats()
{
	BattleUnit *unit = _battleGame->getSelectedUnit();

	_txtTus->setText(tr("STR_TIME_UNITS_SHORT").arg(unit->getTimeUnits()));

	int weight = unit->getCarriedWeight(_inv->getSelectedItem());
	_txtWeight->setText(tr("STR_WEIGHT").arg(weight).arg(unit->getBaseStats()->strength));
	if (weight > unit->getBaseStats()->strength)
	{
		_txtWeight->setSecondaryColor(_game->getMod()->getInterface("inventory")->getElement("weight")->color2);
	}
	else
	{
		_txtWeight->setSecondaryColor(_game->getMod()->getInterface("inventory")->getElement("weight")->color);
	}

	auto psiSkillWithoutAnyBonuses = unit->getBaseStats()->psiSkill;
	if (unit->getGeoscapeSoldier())
	{
		psiSkillWithoutAnyBonuses = unit->getGeoscapeSoldier()->getCurrentStats()->psiSkill;
	}
	bool showPsiStrength = (psiSkillWithoutAnyBonuses > 0 || (Options::psiStrengthEval && _game->getSavedGame()->isResearched(_game->getMod()->getPsiRequirements())));

	auto updateStatLine = [&](Text* txtField, const std::string& elementId)
	{
		const Element *element = _game->getMod()->getInterface("inventory")->getElementOptional(elementId);
		if (element)
		{
			switch (element->custom)
			{
				case 1:
					txtField->setText(tr("STR_ACCURACY_SHORT").arg(unit->getBaseStats()->firing));
					break;
				case 2:
					txtField->setText(tr("STR_REACTIONS_SHORT").arg(unit->getBaseStats()->reactions));
					break;
				case 3:
					if (psiSkillWithoutAnyBonuses > 0)
						txtField->setText(tr("STR_PSIONIC_SKILL_SHORT").arg(unit->getBaseStats()->psiSkill));
					else
						txtField->setText("");
					break;
				case 4:
					if (showPsiStrength)
						txtField->setText(tr("STR_PSIONIC_STRENGTH_SHORT").arg(unit->getBaseStats()->psiStrength));
					else
						txtField->setText("");
					break;
				case 11:
					txtField->setText(tr("STR_FIRING_SHORT").arg(unit->getBaseStats()->firing));
					break;
				case 12:
					txtField->setText(tr("STR_THROWING_SHORT").arg(unit->getBaseStats()->throwing));
					break;
				case 13:
					txtField->setText(tr("STR_MELEE_SHORT").arg(unit->getBaseStats()->melee));
					break;
				case 14:
					if (showPsiStrength)
					{
						txtField->setText(tr("STR_PSI_SHORT")
							.arg(unit->getBaseStats()->psiStrength)
							.arg(unit->getBaseStats()->psiSkill > 0 ? unit->getBaseStats()->psiSkill : 0));
					}
					else
					{
						txtField->setText("");
					}
					break;
				default:
					txtField->setText("");
					break;
			}
		}
	};

	updateStatLine(_txtStatLine1, "textStatLine1");
	updateStatLine(_txtStatLine2, "textStatLine2");
	updateStatLine(_txtStatLine3, "textStatLine3");
	updateStatLine(_txtStatLine4, "textStatLine4");
}

/**
 * Saves the soldiers' equipment-layout.
 */
void InventoryState::saveEquipmentLayout()
{
	for (auto* bu : *_battleGame->getUnits())
	{
		// we need X-Com soldiers only
		if (bu->getGeoscapeSoldier() == 0) continue;

		std::vector<EquipmentLayoutItem*> *layoutItems = bu->getGeoscapeSoldier()->getEquipmentLayout();

		// clear the previous save
		if (!layoutItems->empty())
		{
			for (auto* equipmentLayoutItem : *layoutItems)
			{
				delete equipmentLayoutItem;
			}
			layoutItems->clear();
		}

		// save the soldier's items
		// note: with using getInventory() we are skipping the ammos loaded, (they're not owned) because we handle the loaded-ammos separately (inside)
		for (auto* bi : *bu->getInventory())
		{
			// skip fixed items
			if (bi->getRules()->isFixed())
			{
				bool loaded = bi->needsAmmoForSlot(0) && bi->getAmmoForSlot(0);
				if (!loaded) continue;
			}
			else if (!bi->getRules()->canBeEquippedToCraftInventory())
			{
				// skip other not-allowed items, which somehow made it here (e.g. were spawned instead of equipped)
				continue;
			}

			layoutItems->push_back(new EquipmentLayoutItem(bi));
		}
	}
}

/**
 * Opens the Armor Selection GUI
 * @param action Pointer to an action.
 */
void InventoryState::btnArmorClick(Action *action)
{
	// don't accept clicks when moving items
	if (_inv->getSelectedItem() != 0)
	{
		// but we can reuse this for quickly dropping an item (as a Ctrl+L-click alternative)
		if (Options::oxceInventoryDropItemOverPaperdoll)
		{
			if (_inv->quickDrop())
			{
				// hide selected item info
				invMouseOut(action);

				// refresh ui
				_inv->arrangeGround();
				updateStats();
				refreshMouse();

				// give audio feedback
				_game->getMod()->getSoundByDepth(_battleGame->getDepth(), Mod::ITEM_DROP)->play();
			}
		}
		return;
	}

	// voice set can be changed at any time
	if ((_game->isCtrlPressed() || _base == 0) && _game->getMod()->getEnableUnitResponseSounds())
	{
		BattleUnit* unit = _battleGame->getSelectedUnit();
		if (unit->getOriginalFaction() == FACTION_PLAYER)
		{
			_game->pushState(new SoldierVoiceState(unit, nullptr, SV_BATTLESCAPE));
			return;
		}
	}

	// only allowed during base equipment
	if (_base == 0)
	{
		return;
	}

	// equipment in the base
	BattleUnit *unit = _battleGame->getSelectedUnit();
	Soldier *s = unit->getGeoscapeSoldier();

	if (!(s->getCraft() && s->getCraft()->getStatus() == "STR_OUT"))
	{
		size_t soldierIndex = 0;
		for (auto soldierIt = _base->getSoldiers()->begin(); soldierIt != _base->getSoldiers()->end(); ++soldierIt)
		{
			if ((*soldierIt)->getId() == s->getId())
			{
				soldierIndex = soldierIt - _base->getSoldiers()->begin();
			}
		}

		_reloadUnit = true;
		_game->pushState(new SoldierArmorState(_base, soldierIndex, SA_BATTLESCAPE));
	}
}

/**
 * Opens the Avatar Selection GUI
 * @param action Pointer to an action.
 */
void InventoryState::btnArmorClickRight(Action *action)
{
	// don't accept clicks when moving items
	if (_inv->getSelectedItem() != 0)
	{
		return;
	}

	// only allowed during base equipment
	if (_base == 0)
	{
		return;
	}

	// equipment in the base
	BattleUnit *unit = _battleGame->getSelectedUnit();
	Soldier *s = unit->getGeoscapeSoldier();

	if (!(s->getCraft() && s->getCraft()->getStatus() == "STR_OUT"))
	{
		_game->pushState(new SoldierAvatarState(unit));
	}
}

/**
 * Opens the Soldier Diary Light GUI
 * @param action Pointer to an action.
 */
void InventoryState::btnDiaryLightClick(Action *action)
{
	// don't accept clicks when moving items
	if (_inv->getSelectedItem() != 0)
	{
		return;
	}

	BattleUnit* unit = _battleGame->getSelectedUnit();
	Soldier* s = unit->getGeoscapeSoldier();
	_game->pushState(new SoldierDiaryLightState(s));
}

/**
* Opens Ufopaedia entry for the corresponding armor.
* @param action Pointer to an action.
*/
void InventoryState::btnArmorClickMiddle(Action *action)
{
	// don't accept clicks when moving items
	if (_inv->getSelectedItem() != 0)
	{
		return;
	}

	BattleUnit *unit = _inv->getSelectedUnit();
	if (unit != 0)
	{
		std::string articleId = unit->getArmor()->getUfopediaType();
		Ufopaedia::openArticle(_game, articleId);
	}
}

void InventoryState::saveGlobalLayout(int index, bool includingArmor)
{
	std::vector<EquipmentLayoutItem*> *tmpl = _game->getSavedGame()->getGlobalEquipmentLayout(index);

	// clear current template
	_clearInventoryTemplate(*tmpl);

	// create new template
	_createInventoryTemplate(*tmpl);

	// optionally save armor info too
	if (includingArmor && _battleGame->getSelectedUnit()->getGeoscapeSoldier())
	{
		_game->getSavedGame()->setGlobalEquipmentLayoutArmor(index, _battleGame->getSelectedUnit()->getArmor()->getType());
	}
	else
	{
		_game->getSavedGame()->setGlobalEquipmentLayoutArmor(index, std::string());
	}
}

void InventoryState::loadGlobalLayout(int index)
{
	std::vector<EquipmentLayoutItem*> *tmpl = _game->getSavedGame()->getGlobalEquipmentLayout(index);

	_applyInventoryTemplate(*tmpl);
}

bool InventoryState::loadGlobalLayoutArmor(int index)
{
	auto& armorName = _game->getSavedGame()->getGlobalEquipmentLayoutArmor(index);
	return tryArmorChange(armorName);
}

bool InventoryState::tryArmorChange(const std::string& armorName)
{
	Armor* prev = nullptr;
	Soldier* soldier = nullptr;
	BattleUnit* unit = _inv->getSelectedUnit();
	if (unit)
	{
		soldier = unit->getGeoscapeSoldier();
		if (soldier)
		{
			prev = soldier->getArmor();
		}
	}

	Armor* next = nullptr;
	{
		next = _game->getMod()->getArmor(armorName, false);
	}

	// check armor availability
	bool armorAvailable = false;
	if (prev && next && next != prev && soldier && _base)
	{
		armorAvailable = true;
		if (_game->getSavedGame()->getMonthsPassed() != -1)
		{
			// is the armor physically available?
			if (next->getStoreItem() && prev->getStoreItem() != next->getStoreItem())
			{
				if (_base->getStorageItems()->getItem(next->getStoreItem()) <= 0)
				{
					armorAvailable = false;
				}
			}
			// is the armor unlocked?
			if (next->getRequiredResearch() && !_game->getSavedGame()->isResearched(next->getRequiredResearch()))
			{
				armorAvailable = false;
			}
		}
		if (armorAvailable)
		{
			// refresh soldier's _bonusCache, needed below in Armor::getCanBeUsedBy()
			//soldier->getBonuses(_game->getMod());

			// does the armor fit on the current unit?
			if (!next->getCanBeUsedBy(soldier))
			{
				armorAvailable = false;
			}
		}
	}

	// change armor
	bool armorChanged = false;
	if (armorAvailable)
	{
		Craft* craft = soldier->getCraft();
		if (craft)
		{
			if (!craft->validateArmorChange(prev->getSize(), next->getSize()))
			{
				// STR_NOT_ENOUGH_CRAFT_SPACE
				return false;
			}
		}
		if (_game->getSavedGame()->getMonthsPassed() != -1)
		{
			if (prev->getStoreItem())
			{
				_base->getStorageItems()->addItem(prev->getStoreItem());
			}
			if (next->getStoreItem())
			{
				_base->getStorageItems()->removeItem(next->getStoreItem());
			}
		}
		if (Options::oxceAlternateCraftEquipmentManagement && next->getSize() > prev->getSize())
		{
			_resetCustomDeploymentBackup = true;
		}
		soldier->setArmor(next, true);
		armorChanged = true;
	}

	return armorChanged;
}

/**
* Handles global equipment layout actions.
* @param action Pointer to an action.
*/
void InventoryState::btnGlobalEquipmentLayoutClick(Action *action)
{
	// cannot use this feature during the mission!
	if (_tu)
	{
		return;
	}

	// don't accept clicks when moving items
	if (_inv->getSelectedItem() != 0)
	{
		return;
	}

	// SDLK_0 = 48, SDLK_1 = 49, SDLK_9 = 57
	// SDLK_0 selects the 10-th inventory layout
	// by repeating a key you can load a layout from the next decade
	const int sym = action->getDetails()->key.keysym.sym;
	const int layout_no = (sym == 48) ? 10 : sym - 48;

	if (sym == _prev_key && !_game->isCtrlPressed())
	{
		_key_repeats++;
	}
	else
	{
		_key_repeats = 0;
	}
	_prev_key = sym;

	const int index = 10 * _key_repeats + layout_no - 1;

	if (index < 0 || index >= Options::oxceMaxEquipmentLayoutTemplates)
	{
		// do nothing if the layout index is out of bounds
		return;
	}

	if (_game->isCtrlPressed())
	{
		// can't save layout >10 this way
		_prev_key = 0, _key_repeats = 0;
		saveGlobalLayout(index, false);

		// give audio feedback
		_game->getMod()->getSoundByDepth(_battleGame->getDepth(), Mod::ITEM_DROP)->play();
		refreshMouse();
	}
	else
	{
		// simulate what happens when loading via the InventoryLoadState dialog
		bool armorChanged = loadGlobalLayoutArmor(index);
		setGlobalLayoutIndex(index, armorChanged);
		init();

		// give audio feedback
		_game->getMod()->getSoundByDepth(_battleGame->getDepth(), Mod::ITEM_DROP)->play();
	}
}

/**
* Opens the InventoryLoad screen.
* @param action Pointer to an action.
*/
void InventoryState::btnInventoryLoadClick(Action *)
{
	// cannot use this feature during the mission!
	if (_tu)
	{
		return;
	}

	// don't accept clicks when moving items
	if (_inv->getSelectedItem() != 0)
	{
		return;
	}

	_game->pushState(new InventoryLoadState(this));
}

/**
* Opens the InventorySave screen.
* @param action Pointer to an action.
*/
void InventoryState::btnInventorySaveClick(Action *)
{
	// don't accept clicks when moving items
	if (_inv->getSelectedItem() != 0)
	{
		return;
	}

	_game->pushState(new InventorySaveState(this));
}

/**
 * Opens the Ufopaedia.
 * @param action Pointer to an action.
 */
void InventoryState::btnUfopaediaClick(Action *)
{
	// don't accept clicks when moving items
	if (_inv->getSelectedItem() != 0)
	{
		return;
	}

	Ufopaedia::open(_game);
}

/**
 * Returns to the previous screen.
 * @param action Pointer to an action.
 */
void InventoryState::btnOkClick(Action *)
{
	if (_inv->getSelectedItem() != 0)
		return;
	_game->popState();
	if (!_tu)
	{
		if (_base || !Options::oxceAlternateCraftEquipmentManagement)
		{
			saveEquipmentLayout();
		}
		if (Options::oxceAlternateCraftEquipmentManagement && !_tu && _base && _noCraft)
		{
			// assign all soldiers back, if possible
			for (auto* soldier : *_base->getSoldiers())
			{
				Craft* c = _backup[soldier];
				if (!soldier->getCraft() && c && c->getStatus() != "STR_OUT")
				{
					int space = c->getSpaceAvailable();
					if (c->validateAddingSoldier(space, soldier) == CPE_None)
					{
						soldier->setCraftAndMoveEquipment(c, _base, _game->getSavedGame()->getMonthsPassed() == -1, _resetCustomDeploymentBackup);
					}
				}
			}
		}
		if (_parent)
		{
			_battleGame->startFirstTurn();
		}
	}
}

/**
 * Selects the previous soldier.
 * @param action Pointer to an action.
 */
void InventoryState::btnPrevClick(Action *)
{
	if (_inv->getSelectedItem() != 0)
	{
		return;
	}

	if (_parent)
	{
		_parent->selectPreviousPlayerUnit(false, false, true);
	}
	else
	{
		_battleGame->selectPreviousPlayerUnit(false, false, true);
	}
	init();
}

/**
 * Selects the next soldier.
 * @param action Pointer to an action.
 */
void InventoryState::btnNextClick(Action *)
{
	if (_inv->getSelectedItem() != 0)
	{
		return;
	}
	if (_parent)
	{
		_parent->selectNextPlayerUnit(false, false, true);
	}
	else
	{
		_battleGame->selectNextPlayerUnit(false, false, true);
	}
	init();
}

/**
 * Unloads the selected weapon.
 * @param action Pointer to an action.
 */
void InventoryState::btnUnloadClick(Action *)
{
	if (_inv->unload(false))
	{
		_txtItem->setText("");
		_txtAmmo->setText("");
		_selAmmo->clear();
		updateStats();
		_game->getMod()->getSoundByDepth(0, Mod::ITEM_DROP)->play();
	}
}

/**
* Quick search toggle.
* @param action Pointer to an action.
*/
void InventoryState::btnQuickSearchToggle(Action *action)
{
	if (_btnQuickSearch->getVisible())
	{
		_btnQuickSearch->setText("");
		_btnQuickSearch->setVisible(false);
		btnQuickSearchApply(action);
	}
	else
	{
		_btnQuickSearch->setVisible(true);
		_btnQuickSearch->setFocus(true);
	}
}

/**
* Quick search.
* @param action Pointer to an action.
*/
void InventoryState::btnQuickSearchApply(Action *)
{
	_inv->setSearchString(_btnQuickSearch->getText());
}

void InventoryState::updateTagButtons()
{
	_btnTagAll->setText("전체");
	_btnTagWater->setText("수중");
	_btnTagStealth->setText("잠입");
	_btnTagQuiet->setText("은밀");
	_btnTagZeroG->setText("0G");
	_btnTagExo->setText("EXO");
	_btnTagDream->setText("꿈");
	_btnTagAll->setHighContrast(_tagFilter == 0);
	_btnTagWater->setHighContrast((_tagFilter & 1u) != 0);
	_btnTagStealth->setHighContrast((_tagFilter & 2u) != 0);
	_btnTagQuiet->setHighContrast((_tagFilter & 4u) != 0);
	_btnTagZeroG->setHighContrast((_tagFilter & 8u) != 0);
	_btnTagExo->setHighContrast((_tagFilter & 16u) != 0);
	_btnTagDream->setHighContrast((_tagFilter & 32u) != 0);
}

void InventoryState::btnTagAllClick(Action *)
{
	if (_inv->getSelectedItem()) return;
	_tagFilter = 0;
	_inv->setBattleTagFilter(_tagFilter);
	updateTagButtons();
}

void InventoryState::btnTagWaterClick(Action *)
{
	if (_inv->getSelectedItem()) return;
	_tagFilter ^= 1u;
	_inv->setBattleTagFilter(_tagFilter);
	updateTagButtons();
}

void InventoryState::btnTagStealthClick(Action *)
{
	if (_inv->getSelectedItem()) return;
	_tagFilter ^= 2u;
	_inv->setBattleTagFilter(_tagFilter);
	updateTagButtons();
}

void InventoryState::btnTagQuietClick(Action *)
{
	if (_inv->getSelectedItem()) return;
	_tagFilter ^= 4u;
	_inv->setBattleTagFilter(_tagFilter);
	updateTagButtons();
}

void InventoryState::btnTagZeroGClick(Action *)
{
	if (_inv->getSelectedItem()) return;
	_tagFilter ^= 8u;
	_inv->setBattleTagFilter(_tagFilter);
	updateTagButtons();
}

void InventoryState::btnTagExoClick(Action *)
{
	if (_inv->getSelectedItem()) return;
	_tagFilter ^= 16u;
	_inv->setBattleTagFilter(_tagFilter);
	updateTagButtons();
}

void InventoryState::btnTagDreamClick(Action *)
{
	if (_inv->getSelectedItem()) return;
	_tagFilter ^= 32u;
	_inv->setBattleTagFilter(_tagFilter);
	updateTagButtons();
}

/**
 * Shows more ground items / rearranges them.
 * @param action Pointer to an action.
 */
void InventoryState::btnGroundClickForward(Action *action)
{
	bool scrollBackwards = _game->isShiftPressed();
	if (Options::oxceInventorySplitScrollButton)
	{
		double mx = action->getAbsoluteXMouse();
		if (mx <= _btnGround->getX() + (_btnGround->getWidth() / 2.0))
		{
			// clicked on the left half of the button
			scrollBackwards = true;
		}
	}

	if (scrollBackwards)
	{
		// scroll backwards
		_inv->arrangeGround(-1);
	}
	else
	{
		// scroll forward
		_inv->arrangeGround(1);
	}
}

/**
 * Shows more ground items / rearranges them.
 * @param action Pointer to an action.
 */
void InventoryState::btnGroundClickBackward(Action *action)
{
	// scroll backwards
	_inv->arrangeGround(-1);
}

/**
 * Shows the unit info screen.
 * @param action Pointer to an action.
 */
void InventoryState::btnRankClick(Action *)
{
	// don't accept clicks when moving items
	if (_inv->getSelectedItem() != 0)
	{
		return;
	}

	_game->pushState(new UnitInfoState(_battleGame->getSelectedUnit(), _parent, true, false));
}

void InventoryState::_createInventoryTemplate(std::vector<EquipmentLayoutItem*> &inventoryTemplate)
{
	// copy inventory instead of just keeping a pointer to it.  that way
	// create/apply can be used as an undo button for a single unit and will
	// also work as expected if inventory is modified after 'create' is clicked
	for (const auto* bi : *_battleGame->getSelectedUnit()->getInventory())
	{
		// skip fixed items
		if (bi->getRules()->isFixed())
		{
			bool loaded = bi->needsAmmoForSlot(0) && bi->getAmmoForSlot(0);
			if (!loaded) continue;
		}
		else if (!bi->getRules()->canBeEquippedToCraftInventory())
		{
			// skip other not-allowed items, which somehow made it here (e.g. were spawned instead of equipped)
			continue;
		}

		inventoryTemplate.push_back(new EquipmentLayoutItem(bi));
	}
}

void InventoryState::btnLinksClick(Action *)
{
	// don't accept clicks when moving items
	if (_inv->getSelectedItem() != 0)
	{
		// but we can reuse this for ufopedia (as an M-click alternative)
		std::string articleId = _inv->getSelectedItem()->getRules()->getUfopediaType();
		Ufopaedia::openArticle(_game, articleId);

		return;
	}

	_game->pushState(new ExtendedInventoryLinksState(this, _battleGame, _base, !_tu));
}

void InventoryState::btnCreateTemplateClick(Action *)
{
	// don't accept clicks when moving items
	if (_inv->getSelectedItem() != 0)
	{
		return;
	}

	// clear current template
	_clearInventoryTemplate(_curInventoryTemplate);

	// create new template
	_createInventoryTemplate(_curInventoryTemplate);

	// give audio feedback
	_game->getMod()->getSoundByDepth(_battleGame->getDepth(), Mod::ITEM_DROP)->play();
	refreshMouse();
}

void InventoryState::btnCreatePersonalTemplateClick(Action *)
{
	// cannot use this feature during the mission!
	if (_tu)
	{
		return;
	}

	// don't accept clicks when moving items
	if (_inv->getSelectedItem() != 0)
	{
		return;
	}

	auto* unit = _battleGame->getSelectedUnit();
	if (unit && unit->getGeoscapeSoldier())
	{
		auto& personalTemplate = *unit->getGeoscapeSoldier()->getPersonalEquipmentLayout();

		// clear current personal template
		_clearInventoryTemplate(personalTemplate);

		// create new personal template
		_createInventoryTemplate(personalTemplate);

		// optionally save armor info too
		if (Options::oxcePersonalLayoutIncludingArmor)
		{
			unit->getGeoscapeSoldier()->setPersonalEquipmentArmor(_battleGame->getSelectedUnit()->getArmor());
		}
		else
		{
			unit->getGeoscapeSoldier()->setPersonalEquipmentArmor(nullptr);
		}

		// give visual feedback
		_inv->showWarning(tr("STR_PERSONAL_EQUIPMENT_SAVED"));

		// give audio feedback
		_game->getMod()->getSoundByDepth(_battleGame->getDepth(), Mod::ITEM_DROP)->play();
		refreshMouse();
	}
}

void InventoryState::_applyInventoryTemplate(std::vector<EquipmentLayoutItem*> &inventoryTemplate)
{
	BattleUnit               *unit          = _battleGame->getSelectedUnit();
	Tile                     *groundTile    = unit->getTile();
	std::vector<BattleItem*> *groundInv     = groundTile->getInventory();

	_battleGame->getTileEngine()->itemDropInventory(groundTile, unit, true, false);

	// attempt to replicate inventory template by grabbing corresponding items
	// from the ground.  if any item is not found on the ground, display warning
	// message, but continue attempting to fulfill the template as best we can
	bool itemMissing = false;
	for (const auto* equipmentLayoutItem : inventoryTemplate)
	{
		// search for template item in ground inventory
		bool found = false;

		bool needsAmmo[RuleItem::AmmoSlotMax] = { };
		const RuleItem* targetAmmo[RuleItem::AmmoSlotMax] = { };
		BattleItem *matchedWeapon = nullptr;
		BattleItem *matchedAmmo[RuleItem::AmmoSlotMax] = { };

		for (int slot = 0; slot < RuleItem::AmmoSlotMax; ++slot)
		{
			targetAmmo[slot] = equipmentLayoutItem->getAmmoItemForSlot(slot);
			needsAmmo[slot] = (targetAmmo[slot] != nullptr);
			matchedAmmo[slot] = nullptr;
		}

		for (BattleItem* groundItem : *groundInv)
		{
			// if we find the appropriate ammo, remember it for later for if we find
			// the right weapon but with the wrong ammo
			auto* groundItemRule = groundItem->getRules();

			bool skipAmmo = false;
			for (int slot = 0; slot < RuleItem::AmmoSlotMax; ++slot)
			{
				if (needsAmmo[slot] && !matchedAmmo[slot] && targetAmmo[slot] == groundItemRule)
				{
					matchedAmmo[slot] = groundItem;
					skipAmmo = true;
				}
			}
			if (skipAmmo)
			{
				continue;
			}

			if (equipmentLayoutItem->isFixed() == false && equipmentLayoutItem->getItemType() == groundItemRule)
			{
				// if the loaded ammo doesn't match the template item's,
				// remember the weapon for later and continue scanning
				bool skipWeapon = false;
				for (int slot = 0; slot < RuleItem::AmmoSlotMax; ++slot)
				{
					if (!groundItem->needsAmmoForSlot(slot))
					{
						continue;
					}
					BattleItem *loadedAmmo = groundItem->getAmmoForSlot(slot);
					if ((needsAmmo[slot] && (!loadedAmmo || targetAmmo[slot] != loadedAmmo->getRules()))
						|| (!needsAmmo[slot] && loadedAmmo))
					{
						// remember the last matched weapon for simplicity (but prefer empty weapons if any are found)
						if (!matchedWeapon || matchedWeapon->getAmmoForSlot(slot))
						{
							matchedWeapon = groundItem;
						}
						skipWeapon = true;
					}
				}
				if (!skipWeapon)
				{
					matchedWeapon = groundItem;
					found = true; // found = true, even if not equipped
					break;
				}
			}
		}

		if (equipmentLayoutItem->isFixed())
		{
			for (BattleItem* fixedItem : *unit->getInventory())
			{
				if (fixedItem->getRules()->isFixed() == false)
				{
					// this is not a fixed item, continue searching...
					continue;
				}
				if (fixedItem->getSlot() == equipmentLayoutItem->getSlot() &&
					fixedItem->getSlotX() == equipmentLayoutItem->getSlotX() &&
					fixedItem->getSlotY() == equipmentLayoutItem->getSlotY() &&
					fixedItem->getRules() == equipmentLayoutItem->getItemType())
				{
					// if the loaded ammo doesn't match the template item's,
					// remember the weapon for later and continue scanning
					bool skipWeapon = false;
					for (int slot = 0; slot < RuleItem::AmmoSlotMax; ++slot)
					{
						if (!fixedItem->needsAmmoForSlot(slot))
						{
							continue;
						}
						BattleItem* loadedAmmo = fixedItem->getAmmoForSlot(slot);
						if ((needsAmmo[slot] && (!loadedAmmo || targetAmmo[slot] != loadedAmmo->getRules()))
							|| (!needsAmmo[slot] && loadedAmmo))
						{
							// remember the last matched weapon for simplicity (but prefer empty weapons if any are found)
							if (!matchedWeapon || matchedWeapon->getAmmoForSlot(slot))
							{
								matchedWeapon = fixedItem;
							}
							skipWeapon = true;
						}
					}
					if (!skipWeapon)
					{
						matchedWeapon = fixedItem;
						found = true; // found = true, even if not equipped
						break;
					}
				}
			}
		}

		// if we failed to find an exact match, but found unloaded ammo and
		// the right weapon, unload the target weapon, load the right ammo, and use it
		if (!found && matchedWeapon)
		{
			found = true;
			bool allMatch = true;
			for (int slot = 0; slot < RuleItem::AmmoSlotMax; ++slot)
			{
				allMatch &= (needsAmmo[slot] && matchedAmmo[slot]) || (!needsAmmo[slot]);
			}
			if (allMatch)
			{
				for (int slot = 0; slot < RuleItem::AmmoSlotMax; ++slot)
				{
					if (matchedWeapon->needsAmmoForSlot(slot) && (!needsAmmo[slot] || matchedAmmo[slot]))
					{
						// unload the existing ammo (if any) from the weapon
						BattleItem *loadedAmmo = matchedWeapon->setAmmoForSlot(slot, matchedAmmo[slot]);
						if (loadedAmmo)
						{
							_battleGame->getTileEngine()->itemDrop(groundTile, loadedAmmo, false);
						}
					}
				}
			}
			else
			{
				// nope we can't do it.
				found = false;
				matchedWeapon = nullptr;
			}
		}

		if (!found)
		{
			itemMissing = true;
		}

		if (equipmentLayoutItem->isFixed())
		{
			// we have loaded the fixed weapon (if possible) and we don't need to do anything else, it's already in the correct slot
			continue;
		}

		// check if the slot is not occupied already (e.g. by a fixed weapon)
		if (matchedWeapon && !_inv->overlapItems(
			unit,
			matchedWeapon,
			equipmentLayoutItem->getSlot(),
			equipmentLayoutItem->getSlotX(),
			equipmentLayoutItem->getSlotY()))
		{
			// move matched item from ground to the appropriate inventory slot
			matchedWeapon->moveToOwner(unit);
			matchedWeapon->setSlot(equipmentLayoutItem->getSlot());
			matchedWeapon->setSlotX(equipmentLayoutItem->getSlotX());
			matchedWeapon->setSlotY(equipmentLayoutItem->getSlotY());
			matchedWeapon->setFuseTimer(equipmentLayoutItem->getFuseTimer());
		}
		else
		{
			// let the user know or not? probably not... should be obvious why
		}
	}

	if (itemMissing)
	{
		_inv->showWarning(tr("STR_NOT_ENOUGH_ITEMS_FOR_TEMPLATE"));
	}
}

void InventoryState::btnApplyTemplateClick(Action *)
{
	// don't accept clicks when moving items
	// it's ok if the template is empty -- it will just result in clearing the
	// unit's inventory
	if (_inv->getSelectedItem() != 0)
	{
		return;
	}

	_applyInventoryTemplate(_curInventoryTemplate);

	// refresh ui
	_inv->arrangeGround();
	updateStats();
	refreshMouse();

	// give audio feedback
	_game->getMod()->getSoundByDepth(_battleGame->getDepth(), Mod::ITEM_DROP)->play();
}

void InventoryState::btnApplyPersonalTemplateClick(Action *)
{
	// cannot use this feature during the mission!
	if (_tu)
	{
		return;
	}

	// don't accept clicks when moving items
	if (_inv->getSelectedItem() != 0)
	{
		return;
	}

	auto* unit = _battleGame->getSelectedUnit();
	if (unit && unit->getGeoscapeSoldier())
	{
		// optionally load armor too
		if (Options::oxcePersonalLayoutIncludingArmor)
		{
			auto* newArmor = unit->getGeoscapeSoldier()->getPersonalEquipmentArmor();
			if (newArmor && newArmor != unit->getArmor())
			{
				bool success = tryArmorChange(newArmor->getType());

				if (success)
				{
					_reloadUnit = true;
					init();
				}
				else
				{
					// FIXME: a better message? or no message?
					//_inv->showWarning(tr("STR_NOT_ENOUGH_ITEMS_FOR_TEMPLATE"));
				}
			}
		}

		auto& personalTemplate = *unit->getGeoscapeSoldier()->getPersonalEquipmentLayout();

		if (personalTemplate.empty())
		{
			_inv->showWarning(tr("STR_PERSONAL_EQUIPMENT_NOT_DEFINED"));
		}
		else
		{
			_applyInventoryTemplate(personalTemplate);
		}

		// refresh ui
		_inv->arrangeGround();
		updateStats();
		refreshMouse();

		// give audio feedback
		_game->getMod()->getSoundByDepth(_battleGame->getDepth(), Mod::ITEM_DROP)->play();
	}
}

void InventoryState::btnShowPersonalTemplateClick(Action *)
{
	// don't accept clicks when moving items
	if (_inv->getSelectedItem() != 0)
	{
		return;
	}

	auto* unit = _battleGame->getSelectedUnit();
	if (unit && unit->getGeoscapeSoldier())
	{
		_game->pushState(new InventoryPersonalState(unit->getGeoscapeSoldier()));
	}
}

void InventoryState::refreshMouse()
{
	// send a mouse motion event to refresh any hover actions
	int x, y;
	SDL_GetMouseState(&x, &y);
	SDL_WarpMouse(x+1, y);

	// move the mouse back to avoid cursor creep
	SDL_WarpMouse(x, y);
}

void InventoryState::onClearInventory(Action *)
{
	// don't act when moving items
	if (_inv->getSelectedItem() != 0)
	{
		return;
	}

	BattleUnit               *unit       = _battleGame->getSelectedUnit();
	Tile                     *groundTile = unit->getTile();

	_battleGame->getTileEngine()->itemDropInventory(groundTile, unit, true, false);

	// refresh ui
	_inv->arrangeGround();
	updateStats();
	refreshMouse();

	// give audio feedback
	_game->getMod()->getSoundByDepth(_battleGame->getDepth(), Mod::ITEM_DROP)->play();
}


void InventoryState::btnAutoAllClick(Action *action)
{
    // R164: all three prebattle controls share a safe entrypoint but keep
    // independent behavior. Never alter inventory during live tactical TU.
    if (_tu || !_inv || _inv->getSelectedItem() || !_battleGame) return;
    const bool r164LowTuMode = action && action->getSender() == r164LowTuButton;
    if (action && action->getSender() == r164ClearAllButton)
    {
        for (BattleUnit *soldier : *_battleGame->getUnits())
            if (soldier && soldier->getFaction() == FACTION_PLAYER &&
                !soldier->isOut() && soldier->hasInventory() &&
                soldier->getTile() && soldier->getGeoscapeSoldier())
                _battleGame->getTileEngine()->itemDropInventory(
                    soldier->getTile(), soldier, true, false);
        _inv->arrangeGround();
        updateStats();
        refreshMouse();
        return;
    }

    Mod *mod = _game->getMod();
    SavedGame *save = _game->getSavedGame();
    if (!mod || !save) return;

    // Derive eligible PROJECTILES from today's actual purchase/production
    // unlocks, not from whether the weapon itself may be purchased.
    std::set<const RuleItem*> available;
    // Tactical preparation often passes no Base pointer. Derive the actual
    // soldier's home base before testing buy/manufacturing access.
    Base *effectiveBase = _base;
    if (!effectiveBase && _battleGame->getSelectedUnit() &&
        _battleGame->getSelectedUnit()->getGeoscapeSoldier())
    {
        Soldier *selected = _battleGame->getSelectedUnit()->getGeoscapeSoldier();
        if (selected->getCraft())
            effectiveBase = selected->getCraft()->getBase();
        if (!effectiveBase)
            for (Base *base : *save->getBases())
                if (std::find(base->getSoldiers()->begin(),
                              base->getSoldiers()->end(), selected) !=
                    base->getSoldiers()->end())
                { effectiveBase = base; break; }
    }
    RuleBaseFacilityFunctions baseFunctions;
    if (effectiveBase) baseFunctions = effectiveBase->getProvidedBaseFunc({});
    for (const std::string &name : mod->getItemsList())
    {
        const RuleItem *item = mod->getItem(name);
        if (!item || !save->isResearched(item->getRequirements())) continue;
        if (item->getBuyCost() == 0 ||
            !save->isResearched(item->getBuyRequirements())) continue;
        if ((~baseFunctions & item->getRequiresBuyBaseFunc()).any())
            continue;
        bool countryOK = true;
        if (!item->getRequiresBuyCountry().empty())
            for (const Country *country : *save->getCountries())
                if (country->getPact() &&
                    country->getRules()->getType() == item->getRequiresBuyCountry())
                    countryOK = false;
        if (countryOK) available.insert(item);
    }
    if (effectiveBase)
    {
        std::vector<RuleManufacture*> productions;
        save->getAvailableProductions(productions, mod, effectiveBase);
        // getAvailableProductions excludes recipes already being produced;
        // those are obviously still accessible to the player.
        for (Production *ongoing : effectiveBase->getProductions())
            if (ongoing && ongoing->getRules())
                productions.push_back(const_cast<RuleManufacture*>(ongoing->getRules()));
        for (const RuleManufacture *production : productions)
            for (const auto &output : production->getProducedItems())
                if (output.first) available.insert(output.first);
    }

    static const char *const battleTags[6] = {
        "STR_BAT_CAT_UNDERWATER", "STR_BAT_CAT_INFILTRATION",
        "STR_BAT_CAT_STEALTHY", "STR_BAT_CAT_0G",
        "STR_BAT_CAT_EXO", "STR_BAT_CAT_DREAMWORLD"
    };
    auto tagAllowed = [&](const RuleItem *rule) {
        if (!_tagFilter) return true;
        for (int i = 0; i < 6; ++i)
            if ((_tagFilter & (1u << i)) &&
                rule->belongsToCategory(battleTags[i])) return true;
        return false;
    };
    auto environmentAllowed = [&](const RuleItem *rule) {
        if (!rule) return false;
        const bool underwater = _battleGame->getDepth() > 0;
        return !(underwater && rule->isLandOnly()) &&
               !(!underwater && rule->isWaterOnly());
    };
    auto accessible = [&](const RuleItem *rule) {
        return rule && environmentAllowed(rule) &&
               available.find(rule) != available.end() && tagAllowed(rule);
    };
    // Exact IDs from the X-Piratez ruleset, not fuzzy name substrings.
    auto isBandage = [](const RuleItem *rule) {
        return rule && rule->getType() == "STR_BANDAGE";
    };
    auto isWhip = [](const RuleItem *rule) {
        return rule && rule->getType() == "STR_WHIP_LEATHER";
    };
    auto isStunRod = [](const RuleItem *rule) {
        return rule && rule->getType() == "STR_STUN_BATON";
    };
    // The standard high-explosive *grenade* weighs 3, unlike the
    // eight-weight demolition charge STR_HIGH_EXPLOSIVE.
    auto isHighExplosiveGrenade = [](const RuleItem *rule) {
        return rule && rule->getType() == "STR_GRENADE";
    };
    // R160: Korean '세열 수류탄', verified in installed Piratez.rul:
    // STR_GRENADE_FRAG has weight 4; STR_BANDAGE has weight 2.
    auto isFragGrenade = [](const RuleItem *rule) {
        return rule && rule->getType() == "STR_GRENADE_FRAG";
    };
    // R160B: a physical frag already on the mission floor may be equipped
    // even when this base cannot currently buy/manufacture another one.
    // This does not unlock research, bypass battle category/environment
    // restrictions, or create any item absent from the ground inventory.
    auto usableOwnedFrag = [&](const RuleItem *rule) {
        return isFragGrenade(rule) && environmentAllowed(rule) &&
            tagAllowed(rule) && save->isResearched(rule->getRequirements());
    };

    const RuleInventory *belt = mod->getInventoryBelt();
    const RuleInventory *pack = mod->getInventoryBackpack();
    const RuleInventory *quickdraw = mod->getInventory("STR_QD_SLOT", false);
    const RuleInventory *rightShoulder = mod->getInventory("STR_RIGHT_SHOULDER", false);
    const RuleInventory *leftShoulder = mod->getInventory("STR_LEFT_SHOULDER", false);
    const RuleInventory *rightLeg = mod->getInventory("STR_RIGHT_LEG", false);
    const RuleInventory *leftLeg = mod->getInventory("STR_LEFT_LEG", false);
    const RuleInventory *right = mod->getInventoryRightHand();
    const RuleInventory *left = mod->getInventoryLeftHand();
    auto totalWeight = [](BattleUnit *unit, BattleItem *item) {
        return unit->getCarriedWeight() + item->getTotalWeight();
    };
    auto fit = [&](BattleUnit *unit, BattleItem *item, int reserve, bool hands) {
        if (!item || item->getRules()->isFixed() ||
            item->getRules()->getInventoryWidth() <= 0 ||
            item->getRules()->getInventoryHeight() <= 0 ||
            totalWeight(unit, item) + reserve > unit->getBaseStats()->strength)
            return false;
        if (hands)
        {
            // Do not put a two-handed/blocking weapon beside an existing one.
            bool otherHandOccupied = false;
            bool hasMainWeapon = false;
            for (BattleItem *carried : *unit->getInventory())
                if (carried->getSlot() == right || carried->getSlot() == left)
                {
                    otherHandOccupied = true;
                    if (carried->getRules()->isBlockingBothHands()) return false;
                    if (carried->getRules()->getBattleType() == BT_FIREARM ||
                        carried->getRules()->getBattleType() == BT_MELEE)
                        hasMainWeapon = true;
                }
            if (item->getRules()->isBlockingBothHands() && otherHandOccupied)
                return false;
            if (hasMainWeapon && !unit->getArmor()->getAllowTwoMainWeapons() &&
                (item->getRules()->getBattleType() == BT_FIREARM ||
                 item->getRules()->getBattleType() == BT_MELEE))
                return false;
            return unit->fitItemToInventory(right, item) ||
                   unit->fitItemToInventory(left, item);
        }
        // Actual Piratez retrieval costs: quickdraw -> either hand = 3 TU,
        // belt -> either hand = 4 TU, opposite shoulder -> free hand = 4 TU.
        // Preserve that order for *every* spare item type (melee, clips,
        // explosives, bandages), not just main weapons. Fall back only when
        // the preceding section cannot fit the actual item.
        bool rightFree = true, leftFree = true;
        for (BattleItem *held : *unit->getInventory())
        {
            if (held->getSlot() == right) rightFree = false;
            if (held->getSlot() == left) leftFree = false;
        }
        const RuleInventory *oppositeShoulder =
            (leftFree && !rightFree) ? rightShoulder :
            (rightFree && !leftFree) ? leftShoulder : rightShoulder;
        const RuleInventory *otherShoulder =
            oppositeShoulder == rightShoulder ? leftShoulder : rightShoulder;
        const RuleInventory *destinations[] = {
            quickdraw, belt, oppositeShoulder, otherShoulder,
            rightLeg, leftLeg, pack
        };
        // R160: only bandages use an actual retrieval-TU ranking instead
        // of an assumed section order. The real item move-cost modifier and
        // the free hand are considered; ties preserve the stable slot order.
        if (isBandage(item->getRules()))
        {
            std::vector<std::pair<int, const RuleInventory*>> cheapest;
            for (const RuleInventory *destination : destinations)
            {
                if (!destination || !item->getRules()->canBePlacedIntoInventorySection(destination))
                    continue;
                const int raw = rightFree && !leftFree ? destination->getCost(right) :
                    leftFree && !rightFree ? destination->getCost(left) :
                    std::min(destination->getCost(right), destination->getCost(left));
                const int tu = raw == 0 ? 0 : std::max(1,
                    raw * item->getRules()->getInventoryMoveCostPercent() / 100);
                cheapest.emplace_back(tu, destination);
            }
            std::stable_sort(cheapest.begin(), cheapest.end(),
                [](const std::pair<int, const RuleInventory*> &a,
                   const std::pair<int, const RuleInventory*> &b) {
                    return a.first < b.first;
                });
            for (const auto &choice : cheapest)
                if (unit->fitItemToInventory(choice.second, item))
                    return true;
            return false;
        }
        for (const RuleInventory *destination : destinations)
            if (destination && unit->fitItemToInventory(destination, item))
                return true;
        return false;
    };

    // A primary needs at least ONE immediately usable shot. Firearms with
    // magazines of 1..4 shots are now eligible: CombatPowerHud charges their
    // full reload cycle (including inventory-to-hand retrieval) in TU-DPS.
    // A firing mode's spendPerShot matters, not just raw battery units.
    auto hasUsableShot = [](const RuleItem *gun,
                            int ammoSlot, const BattleItem *ammo) {
        if (!gun || !ammo || ammo->getAmmoQuantity() <= 0) return false;
        const RuleItemAction *actions[] = {
            gun->getConfigSnap(), gun->getConfigAuto(), gun->getConfigAimed()
        };
        for (const RuleItemAction *action : actions)
            if (action && action->shots > 0 && action->ammoSlot == ammoSlot &&
                ammo->getAmmoQuantity() >= std::max(1, action->spendPerShot))
                return true;
        return false;
    };

    // For 2..4-round-per-shot firearms, automatic fire determines the
    // reference consumption; without automatic fire use the highest
    // available mode. Other guns keep their existing ammo policy.
    auto burstSpend = [](const RuleItem *gun, int slot) {
        const RuleItemAction *automatic = gun->getConfigAuto();
        int spend = 0;
        if (automatic && automatic->shots > 0 &&
            automatic->ammoSlot == slot)
            spend = std::max(1, automatic->spendPerShot);
        else
        {
            const RuleItemAction *other[] = {
                gun->getConfigSnap(), gun->getConfigAimed()
            };
            for (const RuleItemAction *cfg : other)
                if (cfg && cfg->shots > 0 && cfg->ammoSlot == slot)
                    spend = std::max(spend, std::max(1, cfg->spendPerShot));
        }
        return spend >= 2 && spend <= 4 ? spend : 0;
    };

    // Repeated copies of the same weapon/ammo combination share a score.
    // Key includes the soldier because his TU cost and accuracy matter.
    std::map<std::tuple<BattleUnit*, const RuleItem*, const RuleItem*, int, bool, int>, double> scoreCache;
    // Compare each distinct weapon/ammo pairing's one-hand efficiency only
    // once per soldier. Repeated physical copies share the same 90% gate.
    std::map<std::tuple<BattleUnit*, const RuleItem*, const RuleItem*, int, int>, bool> efficientOneHandCache;

    // Primary weapons use three stable, squad-wide passes before any spare
    // equipment: one-hand-only crews get efficient weapons first, then
    // unrestricted crews, then one-hand-only crews may take leftovers.
    // A fourth pass fills spare equipment in the original roster order.
    for (int pass = 0; pass < 4; ++pass)
    for (BattleUnit *unit : *_battleGame->getUnits())
    {
        if (!unit || unit->getFaction() != FACTION_PLAYER || unit->isOut() ||
            !unit->hasInventory() || !unit->getGeoscapeSoldier() ||
            !unit->getTile()) continue;
        Tile *tile = unit->getTile();
        auto ground = [&]() { return *tile->getInventory(); };

        // R79: a squad-standard PRIMARY is a FIREARM, never a thrown
        // grenade or proxy grenade. Preserve anything already in either hand.
        // Only an empty RIGHT HAND can receive an automatically chosen primary.
        bool rightHandOccupied = false;
        bool leftHandOccupied = false;
        bool leftHasPrimary = false;
        bool leftBlocksBothHands = false;
        for (BattleItem *held : *unit->getInventory())
        {
            if (held->getSlot() == right) rightHandOccupied = true;
            if (held->getSlot() == left)
            {
                leftHandOccupied = true;
                leftBlocksBothHands |= held->getRules()->isBlockingBothHands();
                leftHasPrimary |= held->getRules()->getBattleType() == BT_FIREARM ||
                                  held->getRules()->getBattleType() == BT_MELEE;
            }
        }
        const bool oneHandOnly = leftHandOccupied;
        if ((pass == 0 && !oneHandOnly) ||
            (pass == 1 && oneHandOnly) ||
            (pass == 2 && !oneHandOnly)) continue;
        if (pass != 3 && !rightHandOccupied && !leftBlocksBothHands &&
            (!leftHasPrimary || unit->getArmor()->getAllowTwoMainWeapons()) &&
            unit->getCarriedWeight() < unit->getBaseStats()->strength)
        {
            struct Candidate {
                BattleItem *weapon = nullptr;
                BattleItem *clip = nullptr;
                double score = -1.0;
            } best;
            const auto pool = ground();
            int heOwned = 0, heStock = 0;
            for (BattleItem *carried : *unit->getInventory())
                if (isHighExplosiveGrenade(carried->getRules())) ++heOwned;
            for (BattleItem *availableHe : pool)
                if (isHighExplosiveGrenade(availableHe->getRules()) &&
                    accessible(availableHe->getRules())) ++heStock;
            // R160: the first *actual* four-weight fragmentation grenade
            // takes priority when a soldier has NO explosive. Do not reserve
            // the weight of imaginary stock, and do not discard a usable gun.
            bool ownsAnyGrenade = false;
            for (BattleItem *carried : *unit->getInventory())
                if (carried->getRules()->isGrenadeOrProxy())
                    ownsAnyGrenade = true;
            int fragReserveWeight = 0;
            if (!ownsAnyGrenade)
                for (BattleItem *fragmentation : pool)
                    if (usableOwnedFrag(fragmentation->getRules()))
                    {
                        fragReserveWeight = fragmentation->getTotalWeight();
                        break;
                    }
            const int heReserveWeight = std::max(fragReserveWeight,
                3 * std::min(std::max(0, 3 - heOwned), heStock));
            int firearmsSeen = 0;
            int accessibleAmmoCandidates = 0;
            int sufficientAmmoCandidates = 0;
            for (BattleItem *weapon : pool)
            {
                const RuleItem *rule = weapon->getRules();
                if (!rule || rule->getBattleType() != BT_FIREARM) continue;
                ++firearmsSeen;
                // R87 low-TU mode: the selected firearm MUST possess at
                // least one real 20-TU-or-less firing mode.
                if (r164LowTuMode)
                {
                    const RuleItemAction *modes[] = {
                        rule->getConfigSnap(),rule->getConfigAuto(),
                        rule->getConfigAimed()};
                    const int costs[] = {rule->getCostSnap().Time,
                        rule->getCostAuto().Time,rule->getCostAimed().Time};
                    bool fast = false;
                    for (int m=0;m<3;++m)
                        if (modes[m] && modes[m]->shots > 0 &&
                            costs[m] > 0 && costs[m] <= 20)
                            fast = true;
                    if (!fast) continue;
                }
                if (!tagAllowed(rule) || !environmentAllowed(rule) ||
                    rule->isFixed() ||
                    rule->getInventoryWidth() <= 0 ||
                    rule->getInventoryHeight() <= 0 ||
                    (leftHandOccupied && rule->isBlockingBothHands()))
                    continue;
                if (totalWeight(unit, weapon) > unit->getBaseStats()->strength)
                    continue;
                // Never select a left-hand-only firearm as a substitute.
                if (!rule->canBePlacedIntoInventorySection(right) ||
                    Inventory::overlapItems(unit, weapon, right)) continue;
                // Direct-fired PRIMARY: compare accessible ammunition that
                // physically exists and can fire at least one usable shot.
                {
                    for (const auto &choice : CombatPowerHud::ammoChoices(rule))
                    {
                        if (!accessible(choice.rule)) continue;
                        if (r164LowTuMode)
                        {
                            const RuleItemAction *modes[] = {
                                rule->getConfigSnap(),rule->getConfigAuto(),
                                rule->getConfigAimed()};
                            const int costs[] = {rule->getCostSnap().Time,
                                rule->getCostAuto().Time,rule->getCostAimed().Time};
                            bool fastForAmmo = false;
                            for (int m=0;m<3;++m)
                                if (modes[m] && modes[m]->shots > 0 &&
                                    modes[m]->ammoSlot == choice.slot &&
                                    costs[m] > 0 && costs[m] <= 20)
                                    fastForAmmo = true;
                            if (!fastForAmmo) continue;
                        }
                        ++accessibleAmmoCandidates;
                        BattleItem *clip = nullptr;
                        // A preloaded ground weapon must keep its magazine.
                        // Ranking a different cartridge would promise a power
                        // score that cannot actually be equipped without unloading.
                        const BattleItem *alreadyLoaded =
                            choice.slot >= 0 && choice.slot < RuleItem::AmmoSlotMax ?
                            weapon->getAmmoForSlot(choice.slot) : nullptr;
                        if (alreadyLoaded && alreadyLoaded != weapon)
                        {
                            if (alreadyLoaded->getRules() != choice.rule) continue;
                            // Low-capacity rounds are ranked with actual
                            // reload TU rather than categorically rejected.
                            if (!hasUsableShot(rule, choice.slot, alreadyLoaded)) continue;
                        }
                        else if (choice.rule != rule)
                        {
                            for (BattleItem *candidate : pool)
                                if (candidate != weapon &&
                                    candidate->getRules() == choice.rule &&
                                    hasUsableShot(rule, choice.slot, candidate))
                                { clip = candidate; break; }
                            if (!clip) continue;
                        }
                        // Covers self-powered and internal-magazine firearms,
                        // plus partially depleted preloaded ammunition.
                        const BattleItem *loadedRounds =
                            alreadyLoaded ? alreadyLoaded : (clip ? clip : weapon);
                        if (!hasUsableShot(rule, choice.slot, loadedRounds))
                            continue;
                        if (r164LowTuMode)
                        {
                            const RuleItemAction *modes[] = {
                                rule->getConfigSnap(),rule->getConfigAuto(),
                                rule->getConfigAimed()};
                            const int costs[] = {rule->getCostSnap().Time,
                                rule->getCostAuto().Time,rule->getCostAimed().Time};
                            bool executable = false;
                            for (int m=0;m<3;++m)
                                if (modes[m] && modes[m]->shots > 0 &&
                                    modes[m]->ammoSlot == choice.slot &&
                                    costs[m] > 0 && costs[m] <= 20 &&
                                    loadedRounds->getAmmoQuantity() >=
                                        std::max(1,modes[m]->spendPerShot))
                                    executable = true;
                            if (!executable) continue;
                        }
                        const int spend = burstSpend(rule, choice.slot);
                        if (spend)
                        {
                            // Count completed attacks separately in each
                            // physical magazine. Leftover rounds cannot be
                            // borrowed from another clip to complete a shot.
                            int possibleShots = loadedRounds->getAmmoQuantity() / spend;
                            for (BattleItem *spare : pool)
                                if (spare != loadedRounds && spare != weapon &&
                                    spare->getRules() == choice.rule &&
                                    accessible(spare->getRules()))
                                    possibleShots += spare->getAmmoQuantity() / spend;
                            if (possibleShots < 5 ||
                                loadedRounds->getAmmoQuantity() / spend > 15)
                                continue;
                        }
                        ++sufficientAmmoCandidates;
                        const int extra = clip ? clip->getTotalWeight() : 0;
                        if (totalWeight(unit, weapon) + extra >
                            unit->getBaseStats()->strength) continue;
                        const bool oneHandMode = pass != 1;
                        const int availableRounds = loadedRounds->getAmmoQuantity();
                        const auto key = std::make_tuple(unit, rule,
                            choice.rule, choice.slot, oneHandMode, availableRounds);
                        auto cached = scoreCache.find(key);
                        double score = -1.0;
                        if (cached != scoreCache.end()) score = cached->second;
                        else
                        {
                            const auto result = CombatPowerHud::calculate(
                                _game, rule, nullptr, unit,
                                choice.rule, choice.slot, oneHandMode, false,
                                availableRounds);
                            // R82: rank with exactly the same nine-scenario
                            // POWER shown by the inventory HUD. Summing raw
                            // DPS gave close-range/low-armor cells excessive
                            // weight and could pick a lower-POWER firearm.
                            // The 90% one-hand gate below still compares raw
                            // DPS ratios, independently of display saturation.
                            if (result.applicable)
                                score = result.total;
                            scoreCache.emplace(key, score);
                        }
                        // R89: A firearm with a confirmed usable shot remains
                        // eligible even when all nine armored HUD matchups
                        // predict zero damage. Only invalid scores exclude it.
                        // The -1 best-score sentinel retains zero-power fallback.
                        if (!std::isfinite(score) || score < 0.0) continue;
                        // Prefer a lighter firearm that leaves room for the
                        // reserved HE grenades, but NEVER abandon a usable
                        // primary solely because all guns exceed that reserve.
                        if (heReserveWeight > 0 &&
                            totalWeight(unit, weapon) + extra + heReserveWeight >
                            unit->getBaseStats()->strength)
                            score *= 0.45;
                        if (pass == 0 && rule->isTwoHanded())
                        {
                            // Preserve the 90% eligibility test in raw TU-DPS.
                            // The primary ranking score is normalized POWER,
                            // so it cannot be compared to unnormalized DPS.
                            const auto efficiencyKey = std::make_tuple(
                                unit, rule, choice.rule, choice.slot, availableRounds);
                            auto known = efficientOneHandCache.find(efficiencyKey);
                            bool efficient = false;
                            if (known != efficientOneHandCache.end())
                                efficient = known->second;
                            else
                            {
                                const auto oneHand = CombatPowerHud::calculate(
                                    _game, rule, nullptr, unit,
                                    choice.rule, choice.slot, true, false,
                                    availableRounds);
                                const auto normal = CombatPowerHud::calculate(
                                    _game, rule, nullptr, unit,
                                    choice.rule, choice.slot, false, true,
                                    availableRounds);
                                double oneHandDps = 0.0;
                                for (const auto &armorRow : oneHand.values)
                                    for (double dps : armorRow)
                                        oneHandDps += dps;
                                double normalDps = 0.0;
                                for (const auto &armorRow : normal.values)
                                    for (double dps : armorRow)
                                        normalDps += dps;
                                efficient = oneHand.applicable && normal.applicable &&
                                            normalDps > 0.0 &&
                                            oneHandDps >= normalDps * 0.90;
                                efficientOneHandCache.emplace(efficiencyKey, efficient);
                            }
                            if (!efficient) continue;
                        }
                        Log(LOG_INFO) << "R82 AutoAll candidate: unit=" << unit->getId()
                                      << " pass=" << pass
                                      << " weapon=" << rule->getType()
                                      << " ammo=" << choice.rule->getType()
                                      << " rounds=" << availableRounds
                                      << " power=" << score;
                        if (score > best.score)
                            best = {weapon, clip, score};
                    }
                }
            }
            if (best.weapon)
            {
                // Preflight was done while ranking; load the confirmed usable
                // clip BEFORE equipping, so a failed insertion cannot leave an
                // unloaded primary in the right hand.
                const bool clipLoaded = !best.clip ||
                                        best.weapon->setAmmoPreMission(best.clip);
                if (clipLoaded && unit->fitItemToInventory(right, best.weapon))
                    Log(LOG_INFO) << "R82 AutoAll primary right: unit=" << unit->getId()
                                  << " power=" << best.score
                                  << " weapon=" << best.weapon->getRules()->getType()
                                  << " ammo=" << (best.clip ? best.clip->getRules()->getType() :
                                       best.weapon->getRules()->getType());
                else
                    Log(LOG_WARNING) << "R79 AutoAll rejected failed right-hand load/fit:"
                                     << " unit=" << unit->getId()
                                     << " weapon=" << best.weapon->getRules()->getType();
            }
            else if (firearmsSeen)
            {
                // A missing primary is a diagnostic event, NOT permission to
                // fill the right hand with a grenade. Leave the hand empty.
                Log(LOG_INFO) << "R81 AutoAll no usable firearm: unit=" << unit->getId()
                              << " firearms=" << firearmsSeen
                              << " accessible-ammo=" << accessibleAmmoCandidates
                              << " usable-ammo=" << sufficientAmmoCandidates;
            }
        }

        // All main weapons are assigned before any secondary items.
        if (pass != 3) continue;

        // R160: when there are no explosives, try one real STR_GRENADE_FRAG
        // BEFORE standard grenades, clips and optional medical equipment.
        // If a bandage-heavy previous loadout blocks the four-weight grenade,
        // exchange at most two bandages for it. A failed attempt is rolled
        // back exactly; primary weapons and other equipment are untouched.
        bool hasExplosive = false;
        for (BattleItem *carried : *unit->getInventory())
            if (carried->getRules()->isGrenadeOrProxy())
                hasExplosive = true;
        if (!hasExplosive)
        {
            const auto pool = ground();
            for (BattleItem *fragmentation : pool)
            {
                if (!usableOwnedFrag(fragmentation->getRules())) continue;
                struct ReleasedBandage
                {
                    BattleItem *item;
                    const RuleInventory *slot;
                    int x, y;
                };
                std::vector<ReleasedBandage> released;
                const auto carried = *unit->getInventory();
                std::vector<BattleItem*> bandages;
                for (BattleItem *item : carried)
                    if (isBandage(item->getRules())) bandages.push_back(item);
                auto releaseBandage = [&](BattleItem *item) {
                    released.push_back({item, item->getSlot(),
                        item->getSlotX(), item->getSlotY()});
                    item->moveToOwner(nullptr);
                    tile->addItem(item, mod->getInventoryGround());
                };
                // Two bandages weigh 4, equal to the requested frag grenade.
                // Prefer the explosive rather than preserving both redundantly.
                if (bandages.size() >= 2)
                {
                    releaseBandage(bandages[0]);
                    releaseBandage(bandages[1]);
                }
                bool placed = fit(unit, fragmentation, 0, false);
                while (!placed && released.size() < 2 &&
                    released.size() < bandages.size())
                {
                    releaseBandage(bandages[released.size()]);
                    placed = fit(unit, fragmentation, 0, false);
                }
                if (!placed)
                {
                    // Keep the original equipment intact if the frag
                    // grenade cannot fit even after releasing bandages.
                    for (const ReleasedBandage &prior : released)
                    {
                        prior.item->moveToOwner(unit);
                        prior.item->setSlot(prior.slot);
                        prior.item->setSlotX(prior.x);
                        prior.item->setSlotY(prior.y);
                    }
                }
                else
                    Log(LOG_INFO) << "R160 AutoAll equipped first frag for unit="
                                  << unit->getId() << " freed-bandages=" << released.size();
                break;
            }
        }

        // Preserve R99's standard-HE priority for subsequent grenades.
        // Do not conjure missing stock, displace either hand, or exceed
        // the original eight-bomb limit.
        int heCount = 0;
        int bombsCount = 0;
        for (BattleItem *owned : *unit->getInventory())
            if (owned->getRules()->isGrenadeOrProxy())
            {
                ++bombsCount;
                if (isHighExplosiveGrenade(owned->getRules())) ++heCount;
            }
        if (heCount < 3 && bombsCount < 8)
        {
            const auto priorityPool = ground();
            for (BattleItem *grenade : priorityPool)
            {
                if (heCount >= 3 || bombsCount >= 8) break;
                if (!isHighExplosiveGrenade(grenade->getRules()) ||
                    !accessible(grenade->getRules())) continue;
                if (fit(unit, grenade, 0, false))
                {
                    ++heCount;
                    ++bombsCount;
                }
            }
        }

        // Priority 2: leather whip, then stun rod. Never replace an item.
        for (int priority = 0; priority < 2; ++priority)
        {
            bool already = false;
            for (BattleItem *bi : *unit->getInventory())
                if (priority == 0 ? isWhip(bi->getRules()) :
                                    isStunRod(bi->getRules()))
                    already = true;
            if (already) continue;
            const auto sparePool = ground();
            for (BattleItem *item : sparePool)
                if (accessible(item->getRules()) &&
                    !item->getRules()->isFixed() &&
                    item->getRules()->getInventoryWidth() > 0 &&
                    item->getRules()->getInventoryHeight() > 0 &&
                    (priority == 0 ? isWhip(item->getRules()) :
                                     isStunRod(item->getRules())) &&
                    fit(unit, item, 0, false)) break;
        }

        // R99: magazine budgets are per completed shot, never raw round
        // sums. For burst-consuming guns the cap is 15 usable shots across
        // the loaded magazine and all carried spares; other guns retain the
        // former two-spare policy.
        const auto equippedBeforeSpareAmmo = *unit->getInventory();
        for (BattleItem *owned : equippedBeforeSpareAmmo)
        {
            if (owned->getRules()->getBattleType() != BT_FIREARM) continue;
            const RuleItem *gun = owned->getRules();
            int spares = 0, shotsPacked = 0;
            bool limited = false;
            for (int slot = 0; slot < RuleItem::AmmoSlotMax; ++slot)
            {
                const int spend = burstSpend(gun, slot);
                if (!spend) continue;
                limited = true;
                const BattleItem *loaded = owned->getAmmoForSlot(slot);
                if (loaded) shotsPacked += loaded->getAmmoQuantity() / spend;
            }
            for (BattleItem *carried : *unit->getInventory())
            {
                if (carried->getRules()->getBattleType() != BT_AMMO) continue;
                const int slot = gun->getSlotForAmmo(carried->getRules());
                if (slot < 0) continue;
                ++spares;
                const int spend = burstSpend(gun, slot);
                if (spend) shotsPacked += carried->getAmmoQuantity() / spend;
            }
            const int spareLimit = limited ? 15 : 2;
            if (spares >= spareLimit) continue;
            const auto pool = ground();
            for (BattleItem *clip : pool)
            {
                if (spares >= spareLimit) break;
                if (!accessible(clip->getRules()) ||
                    clip->getRules()->getBattleType() != BT_AMMO)
                    continue;
                const int slot = gun->getSlotForAmmo(clip->getRules());
                if (slot < 0) continue;
                const int spend = burstSpend(gun, slot);
                const int extraShots = spend ? clip->getAmmoQuantity() / spend : 0;
                if (limited && (spend == 0 || extraShots <= 0 ||
                    shotsPacked + extraShots > 15))
                    continue;
                if (fit(unit, clip, 0, false))
                {
                    ++spares;
                    shotsPacked += extraShots;
                }
            }
        }

    }

    // Priority 4 is distributed in full-squad rounds instead of exhausting
    // the common supply on the first soldier. Diversity is per soldier.
    std::vector<BattleUnit*> squad;
    std::map<BattleUnit*, std::map<std::string, int>> grenadeCounts;
    for (BattleUnit *unit : *_battleGame->getUnits())
    {
        if (!unit || unit->getFaction() != FACTION_PLAYER || unit->isOut() ||
            !unit->hasInventory() || !unit->getGeoscapeSoldier() ||
            !unit->getTile()) continue;
        squad.push_back(unit);
        for (BattleItem *item : *unit->getInventory())
            if (item->getRules()->isGrenadeOrProxy())
                grenadeCounts[unit][item->getRules()->getType()]++;
    }
    auto ownsBandage = [&](BattleUnit *unit) {
        for (BattleItem *item : *unit->getInventory())
            if (isBandage(item->getRules())) return true;
        return false;
    };
    for (;;)
    {
        bool movedInRound = false;
        for (BattleUnit *unit : squad)
        {
            const auto& counts = grenadeCounts[unit];
            auto pool = *unit->getTile()->getInventory();
            std::stable_sort(pool.begin(), pool.end(),
                [&](const BattleItem *a, const BattleItem *b) {
                    auto countOf = [&](const std::string &type) {
                        auto it = counts.find(type);
                        return it == counts.end() ? 0 : it->second;
                    };
                    return countOf(a->getRules()->getType()) <
                           countOf(b->getRules()->getType());
                });
            int reserve = 0;
            if (!ownsBandage(unit))
                for (BattleItem *item : pool)
                    if (isBandage(item->getRules()) && accessible(item->getRules()))
                    { reserve = 2; break; }
            bool hasGrenade = false;
            int totalGrenades = 0;
            for (const auto& count : counts)
            {
                if (count.second > 0) hasGrenade = true;
                totalGrenades += count.second;
            }
            if (totalGrenades >= 8) continue;
            for (BattleItem *item : pool)
            {
                const RuleItem *rule = item->getRules();
                if (!rule->isGrenadeOrProxy() || !accessible(rule)) continue;
                // A first grenade beats a bandage when both cannot fit.
                if (fit(unit, item, reserve, false) ||
                    (!hasGrenade && fit(unit, item, 0, false)))
                {
                    grenadeCounts[unit][rule->getType()]++;
                    movedInRound = true;
                    break;
                }
            }
        }
        if (!movedInRound) break;
    }

    // Priority 5: at most one newly assigned two-weight bandage, strictly
    // AFTER the four-weight fragmentation grenade and the remaining bombs.
    for (BattleUnit *unit : squad)
    {
        if (ownsBandage(unit)) continue;
        const auto bandages = *unit->getTile()->getInventory();
        for (BattleItem *item : bandages)
            if (isBandage(item->getRules()) && accessible(item->getRules()) &&
                fit(unit, item, 0, false)) break;
    }

    // R160: also improve an already-carried bandage from an old equipment
    // template when a cheaper retrieval slot is now free. No other carried
    // gear may be moved. Roll back exactly if no equal/better slot exists.
    for (BattleUnit *unit : squad)
    {
        const auto carried = *unit->getInventory();
        for (BattleItem *item : carried)
        {
            if (!isBandage(item->getRules()) || !item->getSlot() ||
                item->getSlot()->getType() != INV_SLOT) continue;
            const RuleInventory *formerSlot = item->getSlot();
            const int formerX = item->getSlotX();
            const int formerY = item->getSlotY();
            const int formerTU = std::min(item->getMoveToCost(right),
                                          item->getMoveToCost(left));
            item->moveToOwner(nullptr);
            unit->getTile()->addItem(item, mod->getInventoryGround());
            const bool found = fit(unit, item, 0, false);
            const int newTU = found && item->getSlot()
                ? std::min(item->getMoveToCost(right), item->getMoveToCost(left))
                : 9999;
            if (!found || newTU > formerTU)
            {
                item->moveToOwner(unit);
                item->setSlot(formerSlot);
                item->setSlotX(formerX);
                item->setSlotY(formerY);
            }
        }
    }
    // R164: on the completed automatic loadout, promote immediately usable
    // weapons ahead of explosives and magazines into the cheapest quickdraw
    // positions. Never discard equipment: any unsuccessful displacement is
    // rolled back to the exact original slot and coordinates.
    if (quickdraw)
    for (BattleUnit *unit : squad)
    {
        auto priority = [&](BattleItem *item) -> int {
            if (!item || !item->getRules()) return 3;
            const RuleItem *rule = item->getRules();
            if (rule->getBattleType() == BT_MELEE) return 0;
            if (rule->getBattleType() == BT_FIREARM)
            {
                const BattleActionType modes[] = {
                    BA_SNAPSHOT, BA_AUTOSHOT, BA_AIMEDSHOT};
                for (BattleActionType mode : modes)
                {
                    const RuleItemAction *cfg = item->getActionConf(mode);
                    if (!cfg || cfg->shots <= 0) continue;
                    BattleItem *ammo = item->getAmmoForAction(mode,nullptr,nullptr);
                    if (ammo && ammo->getAmmoQuantity() >=
                        std::max(1,cfg->spendPerShot)) return 0;
                }
                return 3;
            }
            if (rule->isGrenadeOrProxy()) return 1;
            if (rule->getBattleType() == BT_AMMO) return 2;
            return 3;
        };
        const RuleInventory *fallback[] = {
            belt, rightShoulder, leftShoulder, rightLeg, leftLeg, pack};
        auto carried = *unit->getInventory();
        std::stable_sort(carried.begin(),carried.end(),
            [&](BattleItem *a,BattleItem *b){return priority(a)<priority(b);});
        for (BattleItem *candidate : carried)
        {
            const int candidatePriority=priority(candidate);
            if (candidatePriority > 2 || !candidate->getSlot() ||
                candidate->getSlot() == quickdraw ||
                candidate->getSlot() == right || candidate->getSlot() == left ||
                candidate->getRules()->isFixed() ||
                !candidate->getRules()->canBePlacedIntoInventorySection(quickdraw))
                continue;
            if (unit->fitItemToInventory(quickdraw,candidate)) continue;
            struct Relocated {BattleItem *item; const RuleInventory *slot; int x,y;};
            std::vector<Relocated> displaced;
            bool promoted = false;
            for (BattleItem *victim : carried)
            {
                if (!victim || victim == candidate ||
                    victim->getSlot() != quickdraw ||
                    priority(victim) <= candidatePriority) continue;
                const Relocated previous = {victim,victim->getSlot(),
                    victim->getSlotX(),victim->getSlotY()};
                // Temporarily remove only its slot occupancy, never its owner
                // or its physical item. All alternatives are existing slots.
                victim->setSlot(mod->getInventoryGround());
                bool found = false;
                for (const RuleInventory *dest : fallback)
                    if (dest && unit->fitItemToInventory(dest,victim))
                    {found=true;break;}
                if (!found)
                {
                    victim->setSlot(previous.slot);
                    victim->setSlotX(previous.x);
                    victim->setSlotY(previous.y);
                    continue;
                }
                displaced.push_back(previous);
                if (unit->fitItemToInventory(quickdraw,candidate))
                {promoted=true;break;}
            }
            if (!promoted)
                for (auto it=displaced.rbegin();it!=displaced.rend();++it)
                {
                    it->item->setSlot(it->slot);
                    it->item->setSlotX(it->x);
                    it->item->setSlotY(it->y);
                }
        }
    }
    _inv->arrangeGround();
    updateStats();
}

void InventoryState::onAutoequip(Action *)
{
    // R99: in squad preparation Z invokes the same best-available loadout
    // selector as the AutoAll button. Tactical inventory keeps vanilla
    // auto-equip and its TU restrictions.
    if (!_tu)
    {
        btnAutoAllClick(nullptr);
        return;
    }
	// don't act when moving items
	if (_inv->getSelectedItem() != 0)
	{
		return;
	}

	BattleUnit               *unit          = _battleGame->getSelectedUnit();
	Tile                     *groundTile    = unit->getTile();
	std::vector<BattleItem*>  groundInv     = *groundTile->getInventory();
	Mod                      *mod           = _game->getMod();
	RuleInventory            *groundRuleInv = mod->getInventoryGround();
	int                       worldShade    = _battleGame->getGlobalShade();

	std::vector<BattleUnit*> units;
	units.push_back(unit);
	BattlescapeGenerator::autoEquip(units, mod, &groundInv, groundRuleInv, worldShade, true, true);

	// refresh ui
	_inv->arrangeGround();
	updateStats();
	refreshMouse();

	// give audio feedback
	_game->getMod()->getSoundByDepth(_battleGame->getDepth(), Mod::ITEM_DROP)->play();
}

/**
 * Updates item info.
 * @param action Pointer to an action.
 */
void InventoryState::invClick(Action *act)
{
	updateStats();
	_prev_key = 0, _key_repeats = 0;
}

/**
 * Calculates item damage info.
 */
void InventoryState::calculateCurrentDamageTooltip()
{
	// Differences against battlescape indicator:
	// 1. doesn't consider which action (auto/snap/aim/melee) is used... just takes ammo from primary slot
	// 2. doesn't show psi success chance (distance is unknown)
	// 3. doesn't consider range power reduction (distance is unknown)

	const BattleUnit *currentUnit = _inv->getSelectedUnit();

	if (!currentUnit)
		return;

	if (!_currentDamageTooltipItem)
		return;

	const BattleItem *damageItem = _currentDamageTooltipItem;
	const RuleItem *weaponRule = _currentDamageTooltipItem->getRules();
	const int PRIMARY_SLOT = 0;

	// step 1: determine rule
	const RuleItem *rule;
	if (weaponRule->getBattleType() == BT_PSIAMP)
	{
		rule = weaponRule;
	}
	else if (_currentDamageTooltipItem->needsAmmoForSlot(PRIMARY_SLOT))
	{
		auto* ammo = _currentDamageTooltipItem->getAmmoForSlot(PRIMARY_SLOT);
		if (ammo != nullptr)
		{
			damageItem = ammo;
			rule = ammo->getRules();
		}
		else
		{
			rule = 0; // empty weapon = no rule
		}
	}
	else
	{
		rule = weaponRule;
	}

	// step 2: check if unlocked
	if (_game->getSavedGame()->getMonthsPassed() == -1)
	{
		// new battle mode
	}
	else if (rule)
	{
		// instead of checking the weapon/ammo itself... we're checking their ufopedia articles here
		// same as for the battlescape indicator
		// it's arguable if this is the correct approach, but so far this is what we have
		ArticleDefinition *article = _game->getMod()->getUfopaediaArticle(rule->getType(), false);
		if (article && !Ufopaedia::isArticleAvailable(_game->getSavedGame(), article))
		{
			// ammo/weapon locked
			rule = 0;
		}
		if (rule && rule->getType() != weaponRule->getType())
		{
			article = _game->getMod()->getUfopaediaArticle(weaponRule->getType(), false);
			if (article && !Ufopaedia::isArticleAvailable(_game->getSavedGame(), article))
			{
				// weapon locked
				rule = 0;
			}
		}
	}

	// step 3: calculate and remember
	if (rule)
	{
		if (rule->getBattleType() != BT_CORPSE)
		{
			int totalDamage = 0;
			if (weaponRule->getIgnoreAmmoPower())
			{
				totalDamage += weaponRule->getPowerBonus({ BA_NONE, currentUnit, _currentDamageTooltipItem, damageItem });
			}
			else
			{
				totalDamage += rule->getPowerBonus({ BA_NONE, currentUnit, _currentDamageTooltipItem, damageItem }); //TODO: find what exactly attack we can do
			}
			//totalDamage -= rule->getPowerRangeReduction(distance * 16);
			if (totalDamage < 0) totalDamage = 0;
			std::ostringstream ss;
			ss << rule->getDamageType()->getRandomDamage(totalDamage, 1);
			ss << "-";
			ss << rule->getDamageType()->getRandomDamage(totalDamage, 2);
			if (rule->getDamageType()->RandomType == DRT_UFO_WITH_TWO_DICE)
				ss << "*";
			_currentDamageTooltip = tr("STR_DAMAGE_UC_").arg(ss.str());
		}
	}
	else
	{
		_currentDamageTooltip = tr("STR_DAMAGE_UC_").arg(tr("STR_UNKNOWN"));
	}
}
/**
 * Shows item info.
 * @param action Pointer to an action.
 */
void InventoryState::invMouseOver(Action *)
{
	if (_inv->getSelectedItem() != 0)
	{
		return;
	}

	bool altPressed = _game->isAltPressed();
	bool currentDamageTooltipItemChanged = false;

	BattleItem *item = _inv->getMouseOverItem();
	if (item != _mouseHoverItem)
	{
		_mouseHoverItemFrame = _inv->getAnimFrame();
		_mouseHoverItem = item;
	}
	if (altPressed)
	{
		if (item != _currentDamageTooltipItem)
		{
			currentDamageTooltipItemChanged = true;
			_currentDamageTooltipItem = item;
			_currentDamageTooltip = "";
		}
	}
	else
	{
		_currentDamageTooltipItem = nullptr;
		_currentDamageTooltip = "";
	}
	if (item != 0)
	{
		std::string itemName;
		if (item->getUnit() && item->getUnit()->getStatus() == STATUS_UNCONSCIOUS)
		{
			itemName = item->getUnit()->getName(_game->getLanguage());
		}
		else
		{
			auto* save = _game->getSavedGame();
			if (save->isResearched(item->getRules()->getRequirements()))
			{
				std::string text = tr(item->getRules()->getName());
				for (int slot = 0; slot < RuleItem::AmmoSlotMax; ++slot)
				{
					if (!item->needsAmmoForSlot(slot))
					{
						continue;
					}

					auto* ammo = item->getAmmoForSlot(slot);
					if (!ammo || !save->isResearched(ammo->getRules()->getRequirements()))
					{
						continue;
					}

					const auto& ammoName = ammo->getRules()->getNameAsAmmo();
					if (!ammoName.empty())
					{
						text += " ";
						text += tr(ammoName);
					}
				}
				if (altPressed)
				{
					if (currentDamageTooltipItemChanged)
					{
						calculateCurrentDamageTooltip();
					}
					itemName = _currentDamageTooltip;
				}
				else
				{
					itemName = text;
				}
			}
			else
			{
				itemName = tr("STR_ALIEN_ARTIFACT");
			}
		}

		if (!altPressed)
		{
			std::ostringstream ss;
			ss << itemName;
			ss << " [";
			ss << item->getTotalWeight();
			ss << "]";
			_txtItem->setText(ss.str().c_str());
		}
		else
		{
			_txtItem->setText(itemName);
		}

		_selAmmo->clear();
		bool hasSelfAmmo = item->getRules()->getBattleType() != BT_AMMO && item->getRules()->getClipSize() > 0;
		if ((item->isWeaponWithAmmo() || hasSelfAmmo) && item->haveAnyAmmo())
		{
			updateTemplateButtons(false);
			_txtAmmo->setText("");
		}
		else
		{
			_mouseHoverItem = nullptr;
			updateTemplateButtons(!_tu);
			std::string s;
			if (item->getRules()->getBattleType() == BT_AMMO && (item->getAmmoQuantity() != 0 || item->getRules()->isAmmoRechargeable()))
			{
				s = tr("STR_AMMO_ROUNDS_LEFT").arg(item->getAmmoQuantity());
			}
			else if (item->getRules()->getBattleType() == BT_MEDIKIT)
			{
				s = tr("STR_MEDI_KIT_QUANTITIES_LEFT").arg(item->getPainKillerQuantity()).arg(item->getStimulantQuantity()).arg(item->getHealQuantity());
			}
			_txtAmmo->setText(s);
		}
	}
	else
	{
		if (_currentTooltip.empty())
		{
			_txtItem->setText("");
		}
		_txtAmmo->setText("");
		_selAmmo->clear();
		updateTemplateButtons(!_tu);
	}
}

/**
 * Hides item info.
 * @param action Pointer to an action.
 */
void InventoryState::invMouseOut(Action *)
{
	_txtItem->setText("");
	_txtAmmo->setText("");
	_selAmmo->clear();
	_inv->setMouseOverItem(0);
	_mouseHoverItem = nullptr;
	_currentDamageTooltipItem = nullptr;
	_currentDamageTooltip = "";
	updateTemplateButtons(!_tu);
}

void InventoryState::onMoveGroundInventoryToBase(Action *)
{
	// don't act when moving items
	if (_inv->getSelectedItem() != 0)
	{
		return;
	}

	if (_base == 0)
	{
		// equipment just before the mission (=after briefing) or during the mission
		return;
	}

	if (_noCraft)
	{
		// pre-equipping in the base, but *without* a craft
		return;
	}

	// ok, which craft?
	BattleUnit *unit = _battleGame->getSelectedUnit();
	Soldier *s = unit->getGeoscapeSoldier();
	Craft *c = s->getCraft();

	if (c == 0 || c->getStatus() == "STR_OUT")
	{
		// we're either not in a craft or not in a hangar (should not happen, but just in case)
		return;
	}

	Tile                     *groundTile = unit->getTile();
	std::vector<BattleItem*> *groundInv = groundTile->getInventory();

	// step 1: move stuff from craft to base
	for (auto* bi : *groundInv)
	{
		const auto& weaponType = bi->getRules();
		// check all ammo slots first
		for (int slot = 0; slot < RuleItem::AmmoSlotMax; ++slot)
		{
			if (bi->getAmmoForSlot(slot))
			{
				const auto& ammoType = bi->getAmmoForSlot(slot)->getRules();
				// only real ammo
				if (weaponType != ammoType)
				{
					c->getItems()->removeItem(ammoType);
					_base->getStorageItems()->addItem(ammoType);
				}
			}
		}
		// and the weapon as last
		c->getItems()->removeItem(weaponType);
		_base->getStorageItems()->addItem(weaponType);
	}

	// step 2: clear ground
	for (auto itemIt = groundInv->begin(); itemIt != groundInv->end(); )
	{
		BattleItem* item = (*itemIt);
		item->setOwner(NULL);
		itemIt = groundInv->erase(itemIt);
		_game->getSavedGame()->getSavedBattle()->removeItem(item);
	}

	// refresh ui
	_inv->arrangeGround();
	updateStats();
	refreshMouse();

	// give audio feedback
	_game->getMod()->getSoundByDepth(_battleGame->getDepth(), Mod::ITEM_DROP)->play();
}

/**
 * Takes care of any events from the core game engine.
 * @param action Pointer to an action.
 */
void InventoryState::handle(Action *action)
{
	State::handle(action);

	if (action->getDetails()->type == SDL_KEYDOWN && !_btnQuickSearch->isFocused() && !_txtName->isFocused())
	{
		if (action->getDetails()->key.keysym.sym == SDLK_F8 &&
			!(action->getDetails()->key.keysym.mod & (KMOD_CTRL | KMOD_ALT | KMOD_SHIFT)))
		{
			r48InventoryDamageVisible = !r48InventoryDamageVisible;
			_inv->setDamageOverlayVisible(r48InventoryDamageVisible);
			return;
		}
		// "ctrl+1..9" - save equipment
		// "1..9" - load equipment
		if (action->getDetails()->key.keysym.sym >= SDLK_0 && action->getDetails()->key.keysym.sym <= SDLK_9)
		{
			{
				btnGlobalEquipmentLayoutClick(action);
			}
		}
		else
		{
			_prev_key = 0, _key_repeats = 0;
		}

		if (action->getDetails()->key.keysym.sym == Options::keyInvClear)
		{
			if (_game->isCtrlPressed() && _game->isAltPressed())
			{
				onMoveGroundInventoryToBase(action);
			}
		}
	}

#ifndef __MORPHOS__
	if (Options::oxceThumbButtons && action->getDetails()->type == SDL_MOUSEBUTTONDOWN)
	{
		if (action->getDetails()->button.button == SDL_BUTTON_X1)
		{
			btnNextClick(action);
		}
		else if (action->getDetails()->button.button == SDL_BUTTON_X2)
		{
			btnPrevClick(action);
		}
	}
#endif
}

/**
 * Cycle through loaded ammo in hover over item.
 */
void InventoryState::think()
{
	if (_mouseHoverItem)
	{
		int anim = _inv->getAnimFrame();
		int seq = std::max(((anim - _mouseHoverItemFrame) / 10) - 1, 0); // `-1` cause that first item will be show bit more longer
		int modulo = 0;
		for (int slot = 0; slot < RuleItem::AmmoSlotMax; ++slot)
		{
			bool showSelfAmmo = slot == 0 && _mouseHoverItem->getRules()->getClipSize() > 0;
			if ((_mouseHoverItem->needsAmmoForSlot(slot) || showSelfAmmo) && _mouseHoverItem->getAmmoForSlot(slot))
			{
				++modulo;
			}
		}
		if (modulo)
		{
			seq %= modulo;
		}

		BattleItem* firstAmmo = nullptr;
		for (int slot = 0; slot < RuleItem::AmmoSlotMax; ++slot)
		{
			bool showSelfAmmo = slot == 0 && _mouseHoverItem->getRules()->getClipSize() > 0;
			if ((_mouseHoverItem->needsAmmoForSlot(slot) || showSelfAmmo) && _mouseHoverItem->getAmmoForSlot(slot))
			{
				firstAmmo = _mouseHoverItem->getAmmoForSlot(slot);
				if (slot >= seq)
				{
					break;
				}
			}
			else
			{
				// this will skip empty slot
				++seq;
			}
		}
		if (firstAmmo)
		{
			_txtAmmo->setText(tr("STR_AMMO_ROUNDS_LEFT").arg(firstAmmo->getAmmoQuantity()));
			SDL_Rect r;
			r.x = 0;
			r.y = 0;
			r.w = RuleInventory::HAND_W * RuleInventory::SLOT_W;
			r.h = RuleInventory::HAND_H * RuleInventory::SLOT_H;
			_selAmmo->drawRect(&r, _game->getMod()->getInterface("inventory")->getElement("grid")->color);
			r.x++;
			r.y++;
			r.w -= 2;
			r.h -= 2;
			_selAmmo->drawRect(&r, Palette::blockOffset(0)+15);
			firstAmmo->getRules()->drawHandSprite(_game->getMod()->getSurfaceSet("BIGOBS.PCK"), _selAmmo, firstAmmo, _game->getSavedGame()->getSavedBattle(), anim);
		}
		else
		{
			_selAmmo->clear();
		}
	}
	State::think();
}

/**
 * Shows a tooltip for the OK button.
 * @param action Pointer to an action.
 */
void InventoryState::txtTooltipInExtraOK(Action *action)
{
	if (_inv->getSelectedItem() == 0 && Options::battleTooltips)
	{
		_currentTooltip = action->getSender()->getTooltip();

		std::ostringstream ss;
		ss << tr(_currentTooltip);

		if (!_tu && !_base)
		{
			ss << " - ";

			if (_battleGame->getGlobalShade() <= 0)
			{
				// day (0)
				ss << tr("STR_DAY");
			}
			else if (_battleGame->getGlobalShade() > _game->getMod()->getMaxDarknessToSeeUnits())
			{
				// night (10-15); note: this is configurable in the ruleset (in OXCE only)
				ss << tr("STR_NIGHT");
			}
			else
			{
				// dusk/dawn (1-9)
				ss << tr("STR_DAY");
				ss << "*";
			}
		}

		_txtItem->setText(ss.str().c_str());
	}
}


/**
 * Shows a tooltip for the appropriate button.
 * @param action Pointer to an action.
 */
void InventoryState::txtTooltipIn(Action *action)
{
	if (_inv->getSelectedItem() == 0 && Options::battleTooltips)
	{
		_currentTooltip = action->getSender()->getTooltip();
		_txtItem->setText(tr(_currentTooltip));
	}
}

/**
 * Clears the tooltip text.
 * @param action Pointer to an action.
 */
void InventoryState::txtTooltipOut(Action *action)
{
	if (_inv->getSelectedItem() == 0 && Options::battleTooltips)
	{
		if (_currentTooltip == action->getSender()->getTooltip())
		{
			_currentTooltip = "";
			_txtItem->setText("");
		}
	}
}

/**
* Shows a tooltip for the paperdoll's armor.
* @param action Pointer to an action.
*/
void InventoryState::txtArmorTooltipIn(Action *action)
{
	if (_inv->getSelectedItem() == 0)
	{
		BattleUnit *unit = _inv->getSelectedUnit();
		if (unit != 0)
		{
			action->getSender()->setTooltip(unit->getArmor()->getType());
			_currentTooltip = action->getSender()->getTooltip();
			{
				std::ostringstream ss;

				if (unit->getGeoscapeSoldier())
				{
					auto* soldierRules = unit->getGeoscapeSoldier()->getRules();
					if (soldierRules->getShowTypeInInventory())
					{
						ss << tr(soldierRules->getType());
						ss << ": ";
					}
				}

				ss << tr(_currentTooltip);
				if (unit->getArmor()->getWeight() != 0)
				{
					ss << " [";
					ss << unit->getArmor()->getWeight();
					ss << "]";
				}
				_txtItem->setText(ss.str().c_str());
			}
		}
	}
}

/**
* Clears the armor tooltip text.
* @param action Pointer to an action.
*/
void InventoryState::txtArmorTooltipOut(Action *action)
{
	if (_inv->getSelectedItem() == 0)
	{
		if (_currentTooltip == action->getSender()->getTooltip())
		{
			_currentTooltip = "";
			_txtItem->setText("");
		}
	}
}

void InventoryState::updateTemplateButtons(bool isVisible)
{
	if (isVisible)
	{
		if (_curInventoryTemplate.empty())
		{
			// use "empty template" icons
			_game->getMod()->getSurface("InvCopy")->blitNShade(_btnCreateTemplate, 0, 0);
			_game->getMod()->getSurface("InvPasteEmpty")->blitNShade(_btnApplyTemplate, 0, 0);
			_btnApplyTemplate->setTooltip("STR_CLEAR_INVENTORY");
		}
		else
		{
			// use "active template" icons
			_game->getMod()->getSurface("InvCopyActive")->blitNShade(_btnCreateTemplate, 0, 0);
			_game->getMod()->getSurface("InvPaste")->blitNShade(_btnApplyTemplate, 0, 0);
			_btnApplyTemplate->setTooltip("STR_APPLY_INVENTORY_TEMPLATE");
		}
		_btnCreateTemplate->initSurfaces();
		_btnApplyTemplate->initSurfaces();
	}
	else
	{
		_btnCreateTemplate->clear();
		_btnApplyTemplate->clear();
	}
}

}
