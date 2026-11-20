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
#include <chrono>
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
// R131: restore the R87/R99 low-TU AutoAll button. External state keeps
// InventoryState's binary layout unchanged for the integrated archive.
static std::map<const InventoryState*, TextButton*> r131LowTuButtons;
static std::map<const InventoryState*, TextButton*> r132ClearButtons;
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
	_btnAutoAll = new TextButton(19, 11, 230, 138);
	TextButton *r132ClearButton = new TextButton(19, 11, 251, 138);
	r132ClearButtons[this] = r132ClearButton;
	TextButton *r131LowTuButton = new TextButton(19, 11, 230, 125);
	r131LowTuButtons[this] = r131LowTuButton;
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
	// Give the restored low-TU button its own space at x=230, y=125.
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
	add(r131LowTuButton, "buttonGround", "inventory", _bg);
	add(r132ClearButton, "buttonGround", "inventory", _bg);

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
	_btnAutoAll->setText("자동");
	_btnAutoAll->setSmall();
	_btnAutoAll->setVisible(!_tu);
	// The old R99 button triggers the SAME AutoAll callback with a distinct
	// low-TU fire-mode flag (max 20 TU to fire), not a decorative label.
	r131LowTuButton->onMouseClick((ActionHandler)&InventoryState::btnAutoAllClick);
	r131LowTuButton->setText("低");
	r131LowTuButton->setSmall();
	r131LowTuButton->setVisible(!_tu);
	r132ClearButton->onMouseClick((ActionHandler)&InventoryState::btnAutoAllClearClick);
	r132ClearButton->setText("해제");
	r132ClearButton->setSmall();
	r132ClearButton->setVisible(!_tu);
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
	r131LowTuButtons.erase(this);
	r132ClearButtons.erase(this);
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


// R132: explicit squad-wide equipment clear, leaving fixed equipment intact.
void InventoryState::btnAutoAllClearClick(Action *)
{
    if (_tu || !_inv || _inv->getSelectedItem() || !_battleGame) return;
    bool changed = false;
    for (BattleUnit *unit : *_battleGame->getUnits())
    {
        if (!unit || unit->getFaction() != FACTION_PLAYER || unit->isOut() ||
            !unit->hasInventory() || !unit->getGeoscapeSoldier() ||
            !unit->getTile()) continue;
        bool hasMovable = false;
        for (BattleItem *held : *unit->getInventory())
            if (held && held->getRules() && !held->getRules()->isFixed())
            {
                hasMovable = true;
                break;
            }
        if (!hasMovable) continue;
        _battleGame->getTileEngine()->itemDropInventory(unit->getTile(), unit, true, false);
        changed = true;
    }
    if (changed)
    {
        _inv->arrangeGround();
        updateStats();
        refreshMouse();
        _game->getMod()->getSoundByDepth(_battleGame->getDepth(), Mod::ITEM_DROP)->play();
    }
}
void InventoryState::btnAutoAllClick(Action *action)
{
    const auto lowTuButton = r131LowTuButtons.find(this);
    const bool r131LowTuMode = lowTuButton != r131LowTuButtons.end() &&
        action && action->getSender() == lowTuButton->second;
    // Preparation inventory only: never spend tactical TUs or replace equipment.
    if (_tu || !_inv || _inv->getSelectedItem() || !_battleGame) return;

    Mod *mod = _game->getMod();
    SavedGame *save = _game->getSavedGame();
    if (!mod || !save) return;
    const auto r133Start = std::chrono::steady_clock::now();

    // R133: only physically present items can be equipped. The old loop
    // evaluated the ENTIRE Piratez ruleset on EVERY click, including items
    // that were not present on any squad inventory or preparation ground.
    // Keep exactly the R131 research/buy/production eligibility checks below,
    // but apply them to this complete physically reachable subset.
    std::set<const RuleItem*> r133RelevantRules;
    // Embedded/preloaded cartridges are physical inventory stock too, even
    // when there are no loose copies of their RuleItem on the floor.
    auto r133IndexPhysical = [&](BattleItem *item) {
        if (!item || !item->getRules()) return;
        r133RelevantRules.insert(item->getRules());
        for (int slot = 0; slot < RuleItem::AmmoSlotMax; ++slot)
        {
            BattleItem *loaded = item->getAmmoForSlot(slot);
            if (loaded && loaded->getRules())
                r133RelevantRules.insert(loaded->getRules());
        }
    };
    std::set<const Tile*> r133IndexedTiles;
    for (BattleUnit *member : *_battleGame->getUnits())
    {
        if (!member || member->getFaction() != FACTION_PLAYER ||
            member->isOut() || !member->hasInventory() ||
            !member->getGeoscapeSoldier() || !member->getTile()) continue;
        for (BattleItem *item : *member->getInventory())
            r133IndexPhysical(item);
        if (r133IndexedTiles.insert(member->getTile()).second)
            for (BattleItem *item : *member->getTile()->getInventory())
                r133IndexPhysical(item);
    }
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
    for (const RuleItem *item : r133RelevantRules)
    {
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
                if (output.first && r133RelevantRules.count(output.first))
                    available.insert(output.first);
    }
    const auto r133AfterEligibility = std::chrono::steady_clock::now();

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
    // R132: the standard grenade kit is one frag, one Willy Pete and one HE.
    // Other damaging explosives may fill shortages; nonlethal, smoke, flash,
    // foam, gas and other utility grenades never count toward these three.
    static const char *const r132PreferredGrenades[3] = {
        "STR_GRENADE_FRAG", "STR_WP_GRENADE", "STR_GRENADE"
    };
    static const char *const r132FallbackGrenades[] = {
        "STR_GRENADE_FRAG_PS", "STR_PIR_ALIEN_GRENADE",
        "STR_VR_ALIEN_GRENADE", "STR_GRENADE_WARPCORE",
        "STR_GRENADE_FUSION", "STR_HOLY_HANDGRENADE"
    };
    auto isHighPowerGrenade = [](const RuleItem *rule) {
        if (!rule || !rule->isGrenadeOrProxy()) return false;
        const std::string &id = rule->getType();
        for (const char *candidate : r132PreferredGrenades)
            if (id == candidate) return true;
        for (const char *candidate : r132FallbackGrenades)
            if (id == candidate) return true;
        return false;
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
    const RuleInventory *wearHat = mod->getInventory("STR_WEAR_HAT", false);
    const RuleInventory *wearJewelry = mod->getInventory("STR_WEAR_JEWELRY", false);
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
        for (const RuleInventory *destination : destinations)
            if (destination && unit->fitItemToInventory(destination, item))
                return true;
        return false;
    };

    // R126: restore the old R83 single-shot-special exclusion, which was
    // lost in the R116 AutoAll rewrite. A one-shot cartridge must NEVER
    // cause AutoAll to equip its weapon, even if there are 15 loose shells.
    // Do not alter manually equipped weapons or the gyro/other ammo budgets.
    // For all OTHER primaries, at least one usable shot is needed.
    auto hasUsableShot = [](const RuleItem *gun,
                            int ammoSlot, const BattleItem *ammo) {
        if (!gun || !ammo) return false;
        // Unlimited integrated energy is encoded by clipSize == -1,
        // ammoQuantity == -1. This is NOT an empty magazine.
        const bool infinite = ammoSlot == RuleItem::AmmoSlotSelfUse ||
            ammo->getRules()->getClipSize() == -1;
        if (!infinite && ammo->getAmmoQuantity() <= 0) return false;
        const RuleItemAction *actions[] = {
            gun->getConfigSnap(), gun->getConfigAuto(), gun->getConfigAimed()
        };
        for (const RuleItemAction *action : actions)
            if (action && action->shots > 0 && action->ammoSlot == ammoSlot &&
                (infinite ||
                    ammo->getAmmoQuantity() >= std::max(1, action->spendPerShot)))
                return true;
        return false;
    };

    // R131 restored the original R87/99 low-TU mode. Only the auto-selected
    // RIGHT-HAND primary is restricted; other inventory items are unchanged.
    // A firing mode must actually exist, use the candidate ammo slot and
    // need no more than 20 TU. For auto fire, require a complete burst.
    auto canFireLowTu = [](const BattleUnit *actor, const RuleItem *gun,
                           int slot, const BattleItem *ammo) {
        if (!actor || !gun || !ammo) return false;
        const RuleItemAction *modes[] = {
            gun->getConfigSnap(), gun->getConfigAuto(), gun->getConfigAimed()
        };
        // The cost rules are often PERCENTAGES of the soldier's maximum TU,
        // not flat TU. Use OXCE's actor-aware conversion for the 20-TU gate.
        const int costs[] = {
            actor->getActionTUs(BA_SNAPSHOT, gun).Time,
            actor->getActionTUs(BA_AUTOSHOT, gun).Time,
            actor->getActionTUs(BA_AIMEDSHOT, gun).Time
        };
        const bool infinite = slot == RuleItem::AmmoSlotSelfUse ||
            ammo->getRules()->getClipSize() == -1;
        for (int i=0;i<3;++i)
        {
            const RuleItemAction *mode=modes[i];
            if (!mode || mode->shots <= 0 || mode->ammoSlot != slot ||
                costs[i] <= 0 || costs[i] > 20) continue;
            const int needed = std::max(1,mode->spendPerShot) *
                (i == 1 ? mode->shots : 1);
            if (infinite || ammo->getAmmoQuantity() >= needed) return true;
        }
        return false;
    };

    // Original R83 classification: use FULL cartridge capacity, not the
    // current rounds in a partly spent magazine. Check all executable
    // modes for this gun/ammo-slot pair so a normal multi-shot gun cannot
    // be mistaken for a one-shot launcher.
    auto isOneShotPair = [](const RuleItem *gun,
                            const RuleItem *ammo, int ammoSlot) {
        if (!gun || !ammo || ammoSlot == RuleItem::AmmoSlotSelfUse ||
            ammo->getClipSize() < 1) return false;
        const int capacity = ammo->getClipSize();
        const RuleItemAction *actions[] = {
            gun->getConfigSnap(), gun->getConfigAuto(), gun->getConfigAimed()
        };
        bool oneShotMode = false;
        for (const RuleItemAction *action : actions)
        {
            if (!action || action->shots <= 0 ||
                action->ammoSlot != ammoSlot) continue;
            const int completeShots =
                capacity / std::max(1, action->spendPerShot);
            if (completeShots >= 2) return false;
            if (completeShots == 1) oneShotMode = true;
        }
        return oneShotMode;
    };

    // R125: budget a complete automatic TRIGGER as a single usable
    // attack for the gyro SAW (4 bullets) and Painbringer (8 bullets).
    // RuleItemAction::spendPerShot is PER PROJECTILE. Budget a complete
    // AUTO burst for every automatic firearm, not just those two known
    // examples, so the 15-use guarantee is not bypassed by other modes.
    auto burstSpend = [](const RuleItem *gun, int slot) {
        if (!gun) return 0;
        const RuleItemAction *automatic = gun->getConfigAuto();
        int spend = 0;
        if (automatic && automatic->shots > 0 &&
            automatic->ammoSlot == slot)
        {
            const int perProjectile = std::max(1, automatic->spendPerShot);
            spend = std::max(1, automatic->shots) * perProjectile;
        }
        else
        {
            const RuleItemAction *other[] = {
                gun->getConfigSnap(), gun->getConfigAimed()
            };
            for (const RuleItemAction *cfg : other)
                if (cfg && cfg->shots > 0 && cfg->ammoSlot == slot)
                    spend = std::max(spend, std::max(1, cfg->spendPerShot));
        }
        return spend >= 2 && spend <= 64 ? spend : 0;
    };

    // Repeated copies of the same weapon/ammo combination share a score.
    // Key includes the soldier because his TU cost and accuracy matter.
    std::map<std::tuple<BattleUnit*, const RuleItem*, const RuleItem*, int, bool, int>, double> scoreCache;
    // Compare each distinct weapon/ammo pairing's one-hand efficiency only
    // once per soldier. Repeated physical copies share the same 90% gate.
    std::map<std::tuple<BattleUnit*, const RuleItem*, const RuleItem*, int, int>, bool> efficientOneHandCache;
    int r133CandidateLogCount = 0;

    // R128: only weapons THIS AutoAll invocation selected may be removed
    // if the physical 15-attack ammunition requirement cannot be met.
    // A manually equipped firearm and its magazines are never touched.
    std::map<BattleUnit*, BattleItem*> r128AutoPrimary;
    // R129: proof that a newly chosen gun has ALREADY been physically
    // equipped with >=15 complete attacks. No delayed pass-3 guesswork.
    std::map<BattleUnit*, int> r129ReadyAttacks;

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
                // R131: an offhand shield or one-handed melee utility is
                // not a PRIMARY FIREARM. Previously all melee-class shields
                // suppressed right-hand automatic gun assignment.
                // Two-handed blocking is still enforced independently.
                leftHasPrimary |= held->getRules()->getBattleType() == BT_FIREARM;
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
                int ammoSlot = RuleItem::AmmoSlotSelfUse;
                const RuleItem *ammoRule = nullptr;
            };
            std::vector<Candidate> ranked;
            const auto pool = ground();
            // R133: a single physical-ground index for ammunition lookup
            // and O(1) reuse of ammunition-attack totals across many guns.
            std::map<const RuleItem*, std::vector<BattleItem*> > r133PoolByRule;
            for (BattleItem *physical : pool)
                if (physical && physical->getRules())
                    r133PoolByRule[physical->getRules()].push_back(physical);
            std::map<std::pair<const RuleItem*, int>, int> r133StockShotCache;
            auto r133GroundShots = [&](const RuleItem *ammoRule, int perAttack) {
                const auto key = std::make_pair(ammoRule, perAttack);
                const auto known = r133StockShotCache.find(key);
                if (known != r133StockShotCache.end()) return known->second;
                int total = 0;
                const auto slot = r133PoolByRule.find(ammoRule);
                if (slot != r133PoolByRule.end() &&
                    ammoRule && ammoRule->getBattleType() == BT_AMMO &&
                    accessible(ammoRule))
                    for (BattleItem *spare : slot->second)
                        total += std::max(0, spare->getAmmoQuantity()) /
                            std::max(1, perAttack);
                r133StockShotCache.emplace(key, total);
                return total;
            };
            std::map<const RuleItem*, std::vector<CombatPowerHudAmmoChoice> > r133ChoicesCache;
            // Reserve space for up to three damaging grenades. Never reserve
            // smoke/utility grenades. Use the actual physical items on ground
            // and count manual high-power grenades already carried.
            std::map<std::string, int> reservedTypes;
            int combatOwned = 0;
            for (BattleItem *held : *unit->getInventory())
                if (held && isHighPowerGrenade(held->getRules()))
                {
                    ++combatOwned;
                    ++reservedTypes[held->getRules()->getType()];
                }
            int missing = std::max(0, 3 - combatOwned);
            int heReserveWeight = 0;
            std::set<BattleItem*> reservedInstances;
            auto reserveById = [&](const std::string &id, bool unique) {
                if (missing <= 0 || (unique && reservedTypes[id] > 0)) return false;
                for (BattleItem *candidate : pool)
                {
                    if (!candidate || !candidate->getRules() ||
                        candidate->getRules()->getType() != id ||
                        !accessible(candidate->getRules()) ||
                        reservedInstances.count(candidate)) continue;
                    reservedInstances.insert(candidate);
                    heReserveWeight += candidate->getTotalWeight();
                    ++reservedTypes[id];
                    --missing;
                    return true;
                }
                return false;
            };
            for (const char *id : r132PreferredGrenades) reserveById(id, true);
            for (const char *id : r132FallbackGrenades) reserveById(id, true);
            for (BattleItem *candidate : pool)
                if (missing > 0 && candidate && candidate->getRules() &&
                    isHighPowerGrenade(candidate->getRules()) &&
                    accessible(candidate->getRules()))
                    reserveById(candidate->getRules()->getType(), false);
            int firearmsSeen = 0;
            int accessibleAmmoCandidates = 0;
            int sufficientAmmoCandidates = 0;
            for (BattleItem *weapon : pool)
            {
                const RuleItem *rule = weapon->getRules();
                if (!rule || rule->getBattleType() != BT_FIREARM) continue;
                ++firearmsSeen;
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
                    auto choices = r133ChoicesCache.find(rule);
                    if (choices == r133ChoicesCache.end())
                        choices = r133ChoicesCache.emplace(
                            rule, CombatPowerHud::ammoChoices(rule)).first;
                    for (const auto &choice : choices->second)
                    {
                        // Built-in energy needs no separate ammo purchase.
                        // The gun is already a real physical item on ground;
                        // only external cartridges must pass procurement.
                        const bool ownEnergy = choice.rule == rule &&
                            environmentAllowed(rule) && tagAllowed(rule);
                        if (!accessible(choice.rule) && !ownEnergy) continue;
                        // R129: avoid phantom "self-use" gun-power choices
                        // when AUTO fire really consumes external cartridges.
                        // Minigun previously won via STR_MINIGUN self-use,
                        // while its actual 300/30 belt allowed only 10 bursts.
                        const RuleItemAction *autoCfg=rule->getConfigAuto();
                        if (choice.slot == RuleItem::AmmoSlotSelfUse &&
                            autoCfg && autoCfg->shots > 0 &&
                            autoCfg->ammoSlot >= 0 &&
                            autoCfg->ammoSlot < RuleItem::AmmoSlotMax)
                            continue;
                        // R126: always reject genuine single-shot special
                        // weapons as AutoAll primaries (incl. recoilless
                        // rifle); no 15-round / POWER / stock exception.
                        // Leave these weapons and their shells on the ground.
                        if (isOneShotPair(rule, choice.rule, choice.slot))
                        {
                            if (Options::traceAI && r133CandidateLogCount++ < 256)
                            Log(LOG_INFO) << "R126 AutoAll excluded one-shot:"
                                          << " unit=" << unit->getId()
                                          << " weapon=" << rule->getType()
                                          << " ammo=" << choice.rule->getType();
                            continue;
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
                            auto matching = r133PoolByRule.find(choice.rule);
                            if (matching != r133PoolByRule.end())
                                for (BattleItem *candidate : matching->second)
                                    if (candidate != weapon &&
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
                        if (r131LowTuMode &&
                            !canFireLowTu(unit, rule, choice.slot, loadedRounds))
                            continue;
                        const bool infiniteRounds =
                            choice.slot == RuleItem::AmmoSlotSelfUse ||
                            loadedRounds->getRules()->getClipSize() == -1;
                        // R133: preserve exact per-magazine floor(rounds/spend)
                        // accounting, but cache the common ground contribution.
                        // Loaded clip in ground must be subtracted once; a
                        // preloaded magazine already inside a gun is not in
                        // ground and is therefore not subtracted.
                        const int spend = std::max(1, burstSpend(rule, choice.slot));
                        int possibleShots = 15;
                        if (!infiniteRounds)
                        {
                            possibleShots = std::max(0, loadedRounds->getAmmoQuantity()) /
                                spend + r133GroundShots(choice.rule, spend);
                            if (clip && clip->getRules()->getBattleType() == BT_AMMO &&
                                accessible(clip->getRules()))
                                possibleShots -= std::max(0, clip->getAmmoQuantity()) / spend;
                        }
                        if (possibleShots < 15) continue;
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
                        if (Options::traceAI && r133CandidateLogCount++ < 256)
                        Log(LOG_INFO) << "R82 AutoAll candidate: unit=" << unit->getId()
                                      << " pass=" << pass
                                      << " weapon=" << rule->getType()
                                      << " ammo=" << choice.rule->getType()
                                      << " rounds=" << availableRounds
                                      << " power=" << score;
                        // Keep every viable weapon/ammo pairing. If the
                        // strongest gun cannot physically fit 15 complete
                        // attacks, we must try the NEXT ranked candidate.
                        ranked.push_back({weapon, clip, score,
                                          choice.slot, choice.rule});
                    }
                }
            }
            // R129: no single "best only" assignment. A physically
            // unfillable high-POWER weapon cannot prevent a slightly lower
            // POWER firearm with 15 attacks' ammunition from being issued.
            // Preserve the existing 90% one-hand eligibility gate and score
            // ordering; only the concrete equipment feasibility is new.
            std::stable_sort(ranked.begin(), ranked.end(),
                [](const Candidate &a, const Candidate &b) {
                    return a.score > b.score;
                });
            bool assignedPrimary = false;
            int tried = 0;
            for (const Candidate &candidate : ranked)
            {
                // A prior failed trial may have moved this cartridge; only
                // physical loose ground stock may be assigned to a new gun.
                if (!candidate.weapon) continue;
                const RuleItem *gunRule = candidate.weapon->getRules();
                BattleItem *gun = candidate.weapon;
                if (std::find(tile->getInventory()->begin(),
                              tile->getInventory()->end(), gun) ==
                    tile->getInventory()->end()) continue;
                if (candidate.clip &&
                    std::find(tile->getInventory()->begin(),
                              tile->getInventory()->end(), candidate.clip) ==
                    tile->getInventory()->end()) continue;

                ++tried;
                bool loadedHere = false;
                if (candidate.clip)
                {
                    if (!gun->setAmmoPreMission(candidate.clip)) continue;
                    loadedHere = true;
                }
                // Return a just-loaded trial clip to the original tile if
                // the gun itself cannot be fitted into the right hand.
                if (!unit->fitItemToInventory(right, gun))
                {
                    if (loadedHere)
                    {
                        BattleItem *removed =
                            gun->setAmmoForSlot(candidate.ammoSlot, nullptr);
                        if (removed)
                            _battleGame->getTileEngine()->itemDrop(tile, removed, false);
                    }
                    continue;
                }

                // Count ONLY ammunition of this exact candidate's firing
                // mode, not self-use pseudo-ammo or other slot consumables.
                // Each magazine independently supplies floor(rounds/spend)
                // complete attacks; magazines cannot share fractional bursts.
                const int spend = std::max(1,
                    burstSpend(gunRule, candidate.ammoSlot));
                const BattleItem *loaded =
                    candidate.ammoSlot == RuleItem::AmmoSlotSelfUse ?
                    gun : gun->getAmmoForSlot(candidate.ammoSlot);
                int ready = loaded ?
                    ((candidate.ammoSlot == RuleItem::AmmoSlotSelfUse ||
                      loaded->getRules()->getClipSize() == -1) ? 15 :
                     loaded->getAmmoQuantity() / spend) : 0;
                for (BattleItem *carried : *unit->getInventory())
                    if (carried != gun &&
                        carried->getRules() == candidate.ammoRule &&
                        carried->getRules()->getBattleType() == BT_AMMO)
                        ready += carried->getAmmoQuantity() / spend;

                std::vector<BattleItem*> trialSpares;
                for (BattleItem *spare : ground())
                {
                    if (ready >= 15) break;
                    if (!spare || spare == gun ||
                        spare->getRules() != candidate.ammoRule ||
                        spare->getRules()->getBattleType() != BT_AMMO)
                        continue;
                    // Existing owned ammunition identical to the loaded
                    // magazine is also eligible if its *purchase* research
                    // is locked, as in R125. Never bypass environment/tags.
                    const bool sameLoaded = loaded &&
                        loaded->getRules() == spare->getRules() &&
                        environmentAllowed(spare->getRules()) &&
                        tagAllowed(spare->getRules());
                    if (!accessible(spare->getRules()) && !sameLoaded)
                        continue;
                    const int extra = spare->getAmmoQuantity() / spend;
                    if (extra <= 0) continue;
                    if (fit(unit, spare, 0, false))
                    {
                        ready += extra;
                        trialSpares.push_back(spare);
                    }
                }
                if (ready < 15)
                {
                    // Undo ONLY trial-inserted items, never manual loadouts.
                    // Return the test clip as a loose item too, restoring
                    // the ground pool for the next ranked firearm.
                    for (BattleItem *spare : trialSpares)
                        _battleGame->getTileEngine()->itemDrop(tile, spare, false);
                    if (loadedHere)
                    {
                        BattleItem *removed =
                            gun->setAmmoForSlot(candidate.ammoSlot, nullptr);
                        if (removed)
                            _battleGame->getTileEngine()->itemDrop(tile, removed, false);
                    }
                    _battleGame->getTileEngine()->itemDrop(tile, gun, false);
                    if (tried <= 8)
                    {
                        Log(LOG_INFO) << "R129 AutoAll next ranked candidate:"
                                      << " unit=" << unit->getId()
                                      << " reject=" << gunRule->getType()
                                      << " ready=" << ready
                                      << " required=15 score=" << candidate.score;
                    }
                    continue;
                }

                // The full, physically fitted 15-use equipment package is
                // already committed. Pass 3 must not revoke or add to it.
                assignedPrimary = true;
                r128AutoPrimary[unit] = gun;
                r129ReadyAttacks[unit] = ready;
                Log(LOG_INFO) << "R129 AutoAll committed 15-attack primary:"
                              << " unit=" << unit->getId()
                              << " weapon=" << gunRule->getType()
                              << " ammo=" << candidate.ammoRule->getType()
                              << " score=" << candidate.score
                              << " ready=" << ready
                              << " spares=" << trialSpares.size()
                              << " candidates-tried=" << tried;
                break;
            }
            if (!assignedPrimary && firearmsSeen)
            {
                Log(LOG_INFO) << "R129 AutoAll no FITTABLE 15-attack primary:"
                              << " unit=" << unit->getId()
                              << " firearms=" << firearmsSeen
                              << " ammo-pairs=" << accessibleAmmoCandidates
                              << " possible-15=" << sufficientAmmoCandidates
                              << " ranked=" << ranked.size()
                              << " tried=" << tried;
            }
        }

        // All main weapons are assigned before any secondary items.
        if (pass != 3) continue;

        // R125: spare magazines are budgeted for 15 COMPLETED actions
        // (4-round gyro bursts, 8-round Painbringer bursts). Never divide
        // a burst across magazines. Whole magazines may cross 15 attacks.
        // Other firearms retain their former two-spare policy.
        const auto equippedBeforeSpareAmmo = *unit->getInventory();
        for (BattleItem *owned : equippedBeforeSpareAmmo)
        {
            if (owned->getRules()->getBattleType() != BT_FIREARM) continue;
            const RuleItem *gun = owned->getRules();
            // Only count magazines actually equipped, never hypothetical
            // ground stock. Record newly allocated magazines for a precise
            // rollback if a newly selected primary remains under 15 attacks.
            std::vector<BattleItem*> r128NewSpares;
            const bool r128NewPrimary =
                r128AutoPrimary.count(unit) && r128AutoPrimary[unit] == owned;
            if (r128NewPrimary && r129ReadyAttacks[unit] >= 15)
            {
                // R129 physically placed its complete ammo set BEFORE
                // reserving grenades, so no pass-3 recount/rollback.
                continue;
            }
            int spares = 0, shotsPacked = 0;
            bool limited = false;
            const RuleItem *loadedAmmoRule = nullptr;
            for (int slot = 0; slot < RuleItem::AmmoSlotMax; ++slot)
            {
                const int spend = std::max(1, burstSpend(gun, slot));
                if (burstSpend(gun, slot)) limited = true;
                const BattleItem *loaded = owned->getAmmoForSlot(slot);
                if (loaded)
                {
                    shotsPacked += loaded->getRules()->getClipSize() == -1 ?
                        15 : loaded->getAmmoQuantity() / spend;
                    if (loaded->getRules()->getBattleType() == BT_AMMO)
                        loadedAmmoRule = loaded->getRules();
                }
            }
            for (BattleItem *carried : *unit->getInventory())
            {
                if (carried->getRules()->getBattleType() != BT_AMMO) continue;
                const int slot = gun->getSlotForAmmo(carried->getRules());
                if (slot < 0) continue;
                ++spares;
                const int spend = std::max(1, burstSpend(gun, slot));
                shotsPacked += carried->getAmmoQuantity() / spend;
            }
            // The 15-attack floor applies to all AutoAll primaries.
            // Keep the legacy two-spare limit for other/manual weapons.
            const int spareLimit = (limited || r128NewPrimary) ? 15 : 2;
            const auto pool = ground();
            for (BattleItem *clip : pool)
            {
                // Stop only AFTER reaching 15 completed firing actions.
                // In particular, loaded gyro 50/4=12 and spare 50/4=12
                // must be accepted (12+12=24), not rejected for overflow.
                if (spares >= spareLimit ||
                    ((limited || r128NewPrimary) && shotsPacked >= 15))
                    break;
                const RuleItem *spareRule = clip->getRules();
                if (spareRule->getBattleType() != BT_AMMO)
                    continue;
                // A magazine already owned and physically present on the
                // ground is fair game if it EXACTLY matches the one loaded
                // in this firearm, even when buying this ammo has not yet
                // been unlocked. Do not invent clips or bypass environment
                // / active loadout-tag restrictions.
                const bool matchingLoadedStock = limited &&
                    loadedAmmoRule && spareRule == loadedAmmoRule &&
                    environmentAllowed(spareRule) && tagAllowed(spareRule);
                if (!accessible(spareRule) && !matchingLoadedStock)
                    continue;
                const int slot = gun->getSlotForAmmo(spareRule);
                if (slot < 0) continue;
                const int spend = std::max(1, burstSpend(gun, slot));
                const int extraShots = clip->getAmmoQuantity() / spend;
                if ((limited || r128NewPrimary) && extraShots <= 0)
                    continue;
                if (fit(unit, clip, 0, false))
                {
                    ++spares;
                    shotsPacked += extraShots;
                    if (r128NewPrimary) r128NewSpares.push_back(clip);
                }
            }
            if (r128NewPrimary && shotsPacked < 15)
            {
                // Never leave a newly allocated firearm with fewer than
                // 15 complete attacks. Drop the new weapon AND only the
                // spare magazines added for this exact weapon in this pass.
                // Do not disturb pre-existing/manual inventory items.
                for (BattleItem *allocated : r128NewSpares)
                    _battleGame->getTileEngine()->itemDrop(tile, allocated, false);
                _battleGame->getTileEngine()->itemDrop(tile, owned, false);
                r128AutoPrimary.erase(unit);
                Log(LOG_INFO) << "R128 AutoAll rolled back insufficient ammo:"
                              << " unit=" << unit->getId()
                              << " gun=" << gun->getType()
                              << " ready=" << shotsPacked << " min=15"
                              << " auto-added-spares=" << r128NewSpares.size();
            }
            else if (r128NewPrimary)
            {
                Log(LOG_INFO) << "R128 AutoAll primary ammo guaranteed:"
                              << " unit=" << unit->getId()
                              << " gun=" << gun->getType()
                              << " shots-ready=" << shotsPacked
                              << " min=15" << " spares=" << spares;
            }
            else if (limited)
            {
                // This weapon existed before AutoAll. Do not claim a
                // guarantee, nor modify it if it is below the minimum.
                Log(LOG_INFO) << "R128 AutoAll existing weapon ammo:"
                              << " unit=" << unit->getId()
                              << " gun=" << gun->getType()
                              << " shots-ready=" << shotsPacked;
            }
        }

        // R134: issue functional medical gear BEFORE optional spare grenades
        // or the old whip/stun-rod extras. Each soldier gets at most one new
        // treatment item here. Manual gear and required primary ammunition
        // remain untouched. Owned campaign gear need not be buyable again.
        auto physicallyPermitted = [&](const RuleItem *rule) {
            return rule && !rule->isFixed() &&
                save->isResearched(rule->getRequirements()) &&
                tagAllowed(rule) && environmentAllowed(rule);
        };
        auto hasMedical = [&]() {
            for (BattleItem *held : *unit->getInventory())
                if (held && held->getRules() &&
                    held->getRules()->getBattleType() == BT_MEDIKIT)
                    return true;
            return false;
        };
        if (!hasMedical())
        {
            static const char *const medicalPriority[] = {
                "STR_FIRST_AID_KIT_SMALL", "STR_FIRST_AID_KIT",
                "STR_HEALING_GEL", "STR_BANDAGE",
                "STR_STIMM", "STR_PAINKILLERS"
            };
            for (const char *type : medicalPriority)
            {
                bool placed = false;
                const auto medPool = ground();
                for (BattleItem *medical : medPool)
                {
                    if (!medical || !medical->getRules() ||
                        medical->getRules()->getType() != type ||
                        !physicallyPermitted(medical->getRules())) continue;
                    // Prefer the free offhand for healing when the equipped
                    // primary is truly one-handed. Do not displace a manually
                    // carried offhand item or violate slot compatibility.
                    bool medOffhand = false;
                    BattleItem *medRightPrimary = nullptr;
                    bool medLeftOccupied = false;
                    for (BattleItem *held : *unit->getInventory())
                    {
                        if (!held || !held->getRules()) continue;
                        if (held->getSlot() == right &&
                            held->getRules()->getBattleType() == BT_FIREARM)
                            medRightPrimary = held;
                        if (held->getSlot() == left) medLeftOccupied = true;
                    }
                    if (medRightPrimary && !medLeftOccupied &&
                        !medRightPrimary->getRules()->isTwoHanded() &&
                        !medRightPrimary->getRules()->isBlockingBothHands() &&
                        medical->getRules()->canBePlacedIntoInventorySection(left) &&
                        totalWeight(unit, medical) <= unit->getBaseStats()->strength)
                        medOffhand = unit->fitItemToInventory(left, medical);
                    if (medOffhand || fit(unit, medical, 0, false))
                    {
                        placed = true;
                        break;
                    }
                }
                if (placed) break;
            }
        }

        // R134: If right hand holds a one-handed primary, fill the free
        // left hand with a compatible medical item, shield, or utility.
        // Never assign an incompatible second primary or disturb manual gear.
        BattleItem *rightPrimary = nullptr;
        bool leftFree = true;
        for (BattleItem *held : *unit->getInventory())
        {
            if (!held || !held->getRules()) continue;
            if (held->getSlot() == right &&
                held->getRules()->getBattleType() == BT_FIREARM)
                rightPrimary = held;
            if (held->getSlot() == left) leftFree = false;
        }
        if (leftFree && rightPrimary && !rightPrimary->getRules()->isTwoHanded() &&
            !rightPrimary->getRules()->isBlockingBothHands())
        {
            BattleItem *bestOffhand = nullptr;
            int bestScore = -1;
            const auto offhandPool = ground();
            for (BattleItem *candidate : offhandPool)
            {
                if (!candidate || !candidate->getRules()) continue;
                const RuleItem *rule = candidate->getRules();
                if (!physicallyPermitted(rule) ||
                    !rule->canBePlacedIntoInventorySection(left) ||
                    rule->isBlockingBothHands() || rule->isTwoHanded() ||
                    rule->getBattleType() == BT_FIREARM ||
                    rule->getInventoryWidth() <= 0 || rule->getInventoryHeight() <= 0 ||
                    totalWeight(unit,candidate) > unit->getBaseStats()->strength)
                    continue;
                int score = -1;
                if (rule->getBattleType() == BT_MEDIKIT) score = 500;
                else if (rule->getType().find("SHIELD") != std::string::npos)
                    score = 350 + std::max(0, rule->getArmor());
                else if (isWhip(rule)) score = 200;
                else if (isStunRod(rule)) score = 190;
                else if (rule->getBattleType() == BT_MELEE) score = 100;
                if (score > bestScore)
                {
                    bestScore = score;
                    bestOffhand = candidate;
                }
            }
            if (bestOffhand && bestScore >= 0)
                unit->fitItemToInventory(left, bestOffhand);
        }

        // R134: use genuine jewelry/hat inventory slots, not ordinary
        // backpack cells. This respects actual ruleset slot compatibility,
        // armor inventories, weight and any existing manually worn item.
        auto fillWearSlot = [&](const RuleInventory *wearSlot) {
            if (!wearSlot) return;
            for (BattleItem *held : *unit->getInventory())
                if (held && held->getSlot() == wearSlot) return;
            BattleItem *best = nullptr;
            int score = -1;
            for (BattleItem *candidate : ground())
            {
                if (!candidate || !candidate->getRules()) continue;
                const RuleItem *rule = candidate->getRules();
                if (!physicallyPermitted(rule) ||
                    rule->getType().find("INV_NULL_") == 0 ||
                    !rule->canBePlacedIntoInventorySection(wearSlot) ||
                    rule->getInventoryWidth() <= 0 || rule->getInventoryHeight() <= 0 ||
                    totalWeight(unit,candidate) > unit->getBaseStats()->strength)
                    continue;
                // Medical accessories first, then protective/functional gear.
                int candidateScore = (rule->getBattleType() == BT_MEDIKIT ? 10000 : 0) +
                    std::max(0, rule->getArmor()) * 10 +
                    std::max(0, rule->getPower());
                if (candidateScore > score) { score = candidateScore; best = candidate; }
            }
            if (best) unit->fitItemToInventory(wearSlot, best);
        };
        fillWearSlot(wearJewelry);
        fillWearSlot(wearHat);
        // R132: preferred 1+1+1 HE/frag/WP kit. If a type is not available,
        // use only other powerful damaging grenades for the shortfall.
        // Manually equipped grenades are left in place, and the 8-item
        // limit, strength, space, unlocks and tag filters still apply.
        int combatGrenades = 0;
        int bombsCount = 0;
        std::map<std::string, int> ownedTypes;
        for (BattleItem *owned : *unit->getInventory())
        {
            if (!owned || !owned->getRules() || !owned->getRules()->isGrenadeOrProxy())
                continue;
            ++bombsCount;
            if (isHighPowerGrenade(owned->getRules()))
            {
                ++combatGrenades;
                ++ownedTypes[owned->getRules()->getType()];
            }
        }
        auto equipById = [&](const std::string &id, bool unique) {
            if (combatGrenades >= 3 || bombsCount >= 8 ||
                (unique && ownedTypes[id] > 0)) return false;
            const auto grenadePool = ground();
            for (BattleItem *candidate : grenadePool)
            {
                if (!candidate || !candidate->getRules() ||
                    candidate->getRules()->getType() != id ||
                    !accessible(candidate->getRules())) continue;
                if (fit(unit, candidate, 0, false))
                {
                    ++combatGrenades;
                    ++bombsCount;
                    ++ownedTypes[id];
                    return true;
                }
            }
            return false;
        };
        for (const char *id : r132PreferredGrenades) equipById(id, true);
        for (const char *id : r132FallbackGrenades) equipById(id, true);
        while (combatGrenades < 3 && bombsCount < 8)
        {
            bool equipped = false;
            for (const char *id : r132PreferredGrenades)
                if (equipById(id, false)) { equipped = true; break; }
            if (!equipped)
                for (const char *id : r132FallbackGrenades)
                    if (equipById(id, false)) { equipped = true; break; }
            if (!equipped) break;
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

    }

    const auto r133AfterPrimary = std::chrono::steady_clock::now();
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
            // R133: never sort the ENTIRE ground (weapons, ammo, armor,
            // etc.) in every grenade round. The old comparator effectively
            // sorted only grenades by rarity; filter first, then sort.
            std::vector<BattleItem*> pool;
            for (BattleItem *candidate : *unit->getTile()->getInventory())
                if (candidate && candidate->getRules() &&
                    candidate->getRules()->isGrenadeOrProxy() &&
                    accessible(candidate->getRules()))
                    pool.push_back(candidate);
            if (pool.empty()) continue;
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
            int corePowerCount = 0;
            for (const auto &count : counts)
                if (isHighPowerGrenade(mod->getItem(count.first)))
                    corePowerCount += count.second;
            for (BattleItem *item : pool)
            {
                const RuleItem *rule = item->getRules();
                if (corePowerCount < 3 && !isHighPowerGrenade(rule)) continue;
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

    // Priority 5: one two-weight bandage after explosives, if possible.
    for (BattleUnit *unit : squad)
    {
        if (ownsBandage(unit)) continue;
        const auto bandages = *unit->getTile()->getInventory();
        for (BattleItem *item : bandages)
            if (isBandage(item->getRules()) && accessible(item->getRules()) &&
                fit(unit, item, 0, false)) break;
    }
    _inv->arrangeGround();
    updateStats();
    const auto r133Done = std::chrono::steady_clock::now();
    const auto elapsed = [](decltype(r133Done) a, decltype(r133Done) b) {
        return std::chrono::duration_cast<std::chrono::milliseconds>(b-a).count();
    };
    Log(LOG_INFO) << "R133 AutoAll timing:"
                  << " mode=" << (r131LowTuMode ? "LOW20" : "AUTO")
                  << " eligible_items=" << r133RelevantRules.size()
                  << " score_cache=" << scoreCache.size()
                  << " eligibility_ms=" << elapsed(r133Start, r133AfterEligibility)
                  << " primary_ms=" << elapsed(r133AfterEligibility, r133AfterPrimary)
                  << " spare_ms=" << elapsed(r133AfterPrimary, r133Done)
                  << " total_ms=" << elapsed(r133Start, r133Done);
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

		// R116: actor-specific prime and throw TU on grenade hover.
		const RuleItem *hoverRule = item->getRules();
		const BattleType hoverType = hoverRule->getBattleType();
		const bool isGrenadeLike = hoverType == BT_GRENADE ||
			hoverType == BT_PROXIMITYGRENADE || hoverType == BT_FLARE;
		const bool hasFuse = hoverRule->getFuseTimerType() != BFT_NONE;
		if (isGrenadeLike && hasFuse && !altPressed)
		{
			BattleUnit *actor = _inv->getSelectedUnit();
			if (actor)
			{
				const int throwTu = actor->getActionTUs(BA_THROW, item).Time;
				const int primeTu = actor->getActionTUs(BA_PRIME, item).Time;
				const bool canThrow = !hoverRule->isFixed() && hoverRule->getCostThrow().Time > 0;
				const bool canPrime = item->getFuseTimer() == -1 && hoverRule->getCostPrime().Time > 0;
				std::ostringstream grenadeTu;
				if (canPrime)
					grenadeTu << "점화 TU " << primeTu;
				else if (item->getFuseTimer() >= 0)
					grenadeTu << "점화 완료";
				else
					grenadeTu << "점화 불가";
				grenadeTu << "\n";
				if (canThrow)
					grenadeTu << "투척 TU " << throwTu;
				else
					grenadeTu << "투척 불가";
				_txtAmmo->setWidth(96);
				_txtAmmo->setX(224);
				_txtAmmo->setText(grenadeTu.str());
			}
		}
		else
		{
			_txtAmmo->setWidth(66);
			_txtAmmo->setX(254);
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
	_txtAmmo->setWidth(66);
	_txtAmmo->setX(254);
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
