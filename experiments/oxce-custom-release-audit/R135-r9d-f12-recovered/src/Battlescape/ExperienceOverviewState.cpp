/*
 * Copyright 2010-2015 OpenXcom Developers.
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
#include <sstream>
#include <algorithm>
#include "BattlescapeGame.h"
#include "BattlescapeState.h"
#include "Camera.h"
#include "ExperienceOverviewState.h"
#include "Map.h"
#include "../Engine/Action.h"
#include "../Engine/Game.h"
#include "../Engine/Language.h"
#include "../Engine/Options.h"
#include "../Interface/TextButton.h"
#include "../Interface/Window.h"
#include "../Interface/Text.h"
#include "../Interface/TextList.h"
#include "../Mod/Mod.h"
#include "../Savegame/BattleUnit.h"
#include "../Savegame/BattleUnitStatistics.h"
#include "../Savegame/SavedBattleGame.h"
#include "../Savegame/SavedGame.h"

namespace OpenXcom
{

/**
 * Initializes all the elements in the Experience Overview screen.
 */
ExperienceOverviewState::ExperienceOverviewState(BattlescapeState* parent) : _parent(parent), _sortMode(0)
{
	_screen = false;

	// Create objects
	_window = new Window(this, 320, 200, 0, 0);
	_txtTitle = nullptr; // R100: header removed to maximize vertical space.
	_txtName = new Text(100, 10, 10, 39);
	_btnOk = new TextButton(100, 14, 110, 183);
	// R100: TU button replaces the TU column header, XP is adjacent above it.
	_btnSort = new TextButton(26, 10, 260, 39);
	_btnExpSort = new TextButton(27, 10, 279, 27);
	// Maximize soldier rows within native 320x200 without covering OK.
	_lstSoldiers = new TextList(300, 129, 8, 52);
	_txtBravery = new Text(18, 10, 117, 39);
	_txtReactions = new Text(18, 10, 135, 39);
	_txtFiring = new Text(18, 10, 153, 39);
	_txtThrowing = new Text(18, 10, 171, 39);
	_txtPsiSkill = new Text(18, 10, 189, 39);
	_txtPsiStrength = new Text(18, 10, 207, 39);
	_txtMelee = new Text(18, 10, 225, 39);
	_txtMana = new Text(18, 10, 243, 39);
	_txtTu = nullptr; // R100: TU header is now the interactive sort button.
	_txtKills = new Text(18, 10, 289, 39);

    // R99 combined enemy census and experience overview. Match the
    // read-only counting rules used by Map::r32DrawEnemyCounts().
    SavedBattleGame *battle = _game->getSavedGame()->getSavedBattle();
    int fighting = 0, intent = 0, surrendered = 0, knockedOut = 0;
    int remaining = 0, approximateStart = 0;
    std::vector<std::string> activeEnemyCoordinates;
    if (battle)
    for (const BattleUnit *unit : *battle->getUnits())
    {
        if (!unit || unit->getOriginalFaction() != FACTION_HOSTILE)
            continue;
        if (!unit->isIgnored()) ++approximateStart;
        if (unit->isIgnored() || unit->getStatus() == STATUS_DEAD)
            continue;
        ++remaining;
        if (unit->getStatus() == STATUS_UNCONSCIOUS ||
            unit->isOutThresholdExceed())
        {
            ++knockedOut;
            continue;
        }
        const bool psiCaptured = Options::allowPsionicCapture &&
            unit->getFaction() == FACTION_PLAYER && unit->getCapturable();
        if (unit->isSurrendering() && unit->getCapturable() && !psiCaptured)
        {
            ++surrendered;
            continue;
        }
        if (unit->getFaction() == FACTION_HOSTILE && !unit->isOut())
        {
            ++fighting;
            const Position &pos = unit->getPosition();
            std::ostringstream coordinates;
            coordinates << "XYZ " << pos.x << "," << pos.y << "," << pos.z;
            activeEnemyCoordinates.push_back(coordinates.str());
            if (unit->wantsToSurrender() && !unit->isSurrendering())
                ++intent;
        }
    }
    const int initial = battle ? battle->getR32InitialHostiles() : -1;
    const std::string initialCount = initial >= 0
        ? std::to_string(initial) : "~" + std::to_string(approximateStart);
    const std::string censusLines[6] = {
        "FIGHT " + std::to_string(fighting),
        "INTENT " + std::to_string(intent),
        "SURRENDERING " + std::to_string(surrendered),
        "KO " + std::to_string(knockedOut),
        "TOTAL " + std::to_string(remaining),
        "START " + initialCount
    };
    Text *censusText[6];
    for (int i = 0; i < 6; ++i)
        censusText[i] = new Text(i % 3 == 2 ? 104 : 94, 10,
                                 i % 3 == 0 ? 10 : (i % 3 == 1 ? 110 : 205),
                                 i < 3 ? 5 : 16);
    Text *enemyCoordinates = new Text(260, 10, 10, 27);

	// Set palette
	_game->getSavedGame()->getSavedBattle()->setPaletteByDepth(this);

	add(_window, "messageWindowBorder", "battlescape");
	add(_btnOk, "messageWindowButtons", "battlescape");
	add(_btnSort, "messageWindowButtons", "battlescape");
	add(_btnExpSort, "messageWindowButtons", "battlescape");
	add(_txtName, "messageWindows", "battlescape");
	// Title omitted; enemy counts now occupy the uppermost rows.
	add(_lstSoldiers, "optionLists", "battlescape");
    for (int i = 0; i < 6; ++i)
        add(censusText[i], "messageWindows", "battlescape");
    add(enemyCoordinates, "messageWindows", "battlescape");
	add(_txtBravery, "messageWindows", "battlescape");
	add(_txtReactions, "messageWindows", "battlescape");
	add(_txtFiring, "messageWindows", "battlescape");
	add(_txtThrowing, "messageWindows", "battlescape");
	add(_txtPsiSkill, "messageWindows", "battlescape");
	add(_txtPsiStrength, "messageWindows", "battlescape");
	add(_txtMelee, "messageWindows", "battlescape");
	add(_txtMana, "messageWindows", "battlescape");
	// TU column title is replaced by _btnSort.
	add(_txtKills, "messageWindows", "battlescape");

	centerAllSurfaces();

	// Set up objects
	_window->setHighContrast(true);
	_window->setBackground(_game->getMod()->getSurface("TAC00.SCR"));

	_btnOk->setHighContrast(true);
	_btnOk->setText(tr("STR_OK"));
	_btnOk->onMouseClick((ActionHandler)&ExperienceOverviewState::btnOkClick);
	_btnOk->onKeyboardPress((ActionHandler)&ExperienceOverviewState::btnOkClick, Options::keyCancel);
	_btnSort->setHighContrast(true);
	_btnSort->setSmall();
	_btnSort->setText("TU");
	_btnSort->onMouseClick((ActionHandler)&ExperienceOverviewState::btnSortClick);
	_btnExpSort->setHighContrast(true);
	_btnExpSort->setSmall();
	_btnExpSort->setText("XP");
	_btnExpSort->onMouseClick((ActionHandler)&ExperienceOverviewState::btnExpSortClick);

	// Deliberately no Experience Overview title in the R100 compact HUD.

	_txtName->setHighContrast(true);
	_txtBravery->setHighContrast(true);
	_txtReactions->setHighContrast(true);
	_txtFiring->setHighContrast(true);
	_txtThrowing->setHighContrast(true);
	_txtPsiSkill->setHighContrast(true);
	_txtPsiStrength->setHighContrast(true);
	_txtMelee->setHighContrast(true);
	_txtMana->setHighContrast(true);
	_txtKills->setHighContrast(true);
	_txtKills->setText("K"); // Hostile kills in the current battle, not career kills.
    for (int i = 0; i < 6; ++i)
    {
        censusText[i]->setHighContrast(true);
        censusText[i]->setText(censusLines[i]);
    }
    enemyCoordinates->setHighContrast(true);
    if (fighting > 0 && fighting <= 2)
    {
        std::ostringstream coordinates;
        for (size_t i = 0; i < activeEnemyCoordinates.size(); ++i)
        {
            if (i) coordinates << "  |  ";
            coordinates << activeEnemyCoordinates[i];
        }
        enemyCoordinates->setText(coordinates.str());
    }


	_txtName->setText(tr("STR_NAME"));
	_txtBravery->setText(tr("STR_BRAVERY_ABBREVIATION"));
	_txtReactions->setText(tr("STR_REACTIONS_ABBREVIATION"));
	_txtFiring->setText(tr("STR_FIRING_ACCURACY_ABBREVIATION"));
	_txtThrowing->setText(tr("STR_THROWING_ACCURACY_ABBREVIATION"));
	_txtPsiSkill->setText(tr("STR_PSIONIC_SKILL_ABBREVIATION"));
	_txtPsiStrength->setText(tr("STR_PSIONIC_STRENGTH_ABBREVIATION"));
	_txtMelee->setText(tr("STR_MELEE_ACCURACY_ABBREVIATION"));
	if (_game->getMod()->isManaFeatureEnabled() && _game->getMod()->isManaTrainingPrimary())
	{
		_txtMana->setText(tr("STR_MANA_ABBREVIATION"));
	}

	_lstSoldiers->setColumns(11, 108, 18, 18, 18, 18, 18, 18, 18, 18, 26, 18);
	_lstSoldiers->setSelectable(true);
	_lstSoldiers->setHighContrast(true);
	_lstSoldiers->setBackground(_window);
	_lstSoldiers->setMargin(2);
	_lstSoldiers->onMouseClick((ActionHandler)&ExperienceOverviewState::lstSoldiersClick);

	refreshRows();
}

void ExperienceOverviewState::refreshRows()
{
	_lstSoldiers->clearList();
	_soldiers.clear();
	std::vector<BattleUnit*> units;
	for (auto* soldier : *_game->getSavedGame()->getSavedBattle()->getUnits())
	{
		if (soldier->getGeoscapeSoldier() && soldier->getStatus() != STATUS_DEAD && soldier->getStatus() != STATUS_IGNORE_ME)
			units.push_back(soldier);
	}
	if (_sortMode == 1)
		std::stable_sort(units.begin(), units.end(), [](BattleUnit* a, BattleUnit* b) { return a->getTimeUnits() > b->getTimeUnits(); });
	else if (_sortMode == 2)
		std::stable_sort(units.begin(), units.end(), [](BattleUnit* a, BattleUnit* b) { return a->getTimeUnits() < b->getTimeUnits(); });
	else if (_sortMode == 3 || _sortMode == 4)
	{
		auto totalExp = [](BattleUnit* unit) {
			const UnitStats* s = unit->getExpStats();
			return s->bravery + s->reactions + s->firing + s->throwing + s->psiSkill + s->psiStrength + s->melee + s->mana;
		};
		const bool descending = _sortMode == 3;
		std::stable_sort(units.begin(), units.end(), [&](BattleUnit* a, BattleUnit* b) {
			return descending ? totalExp(a) > totalExp(b) : totalExp(a) < totalExp(b);
		});
	}

	int row = 0;
	for (auto* soldier : units)
	{
		if (!soldier->getGeoscapeSoldier())
		{
			continue;
		}
		if (soldier->getStatus() == STATUS_DEAD || soldier->getStatus() == STATUS_IGNORE_ME)
		{
			continue;
		}

		const UnitStats* stats = soldier->getExpStats();

		std::ostringstream bravery;
		bravery << stats->bravery;
		std::ostringstream reactions;
		reactions << stats->reactions;
		std::ostringstream firing;
		firing << stats->firing;
		std::ostringstream throwing;
		throwing << stats->throwing;
		std::ostringstream psiSkill;
		psiSkill << stats->psiSkill;
		std::ostringstream psiStrength;
		psiStrength << stats->psiStrength;
		std::ostringstream melee;
		melee << stats->melee;
		std::ostringstream mana;
		if (_game->getMod()->isManaFeatureEnabled() && _game->getMod()->isManaTrainingPrimary())
		{
			mana << stats->mana;
		}

		std::ostringstream tu;
		tu << soldier->getTimeUnits();
		int killCount = 0;
		// Use the same hostile/dead semantics as the post-battle debriefing.
		for (const auto* kill : soldier->getStatistics()->kills)
		{
			if (kill && kill->faction == FACTION_HOSTILE && kill->status == STATUS_DEAD)
				++killCount;
		}
		std::ostringstream kills;
		kills << killCount;
		_soldiers.push_back(soldier);
		// R9D: retain the R100 F12 enemy census while restoring the
		// R132 selected-soldier visual marker in the same compact table.
		_lstSoldiers->addRow(11,
			(soldier == _game->getSavedGame()->getSavedBattle()->getSelectedUnit() ? std::string("> ") : std::string("  ")).append(soldier->getName(_game->getLanguage())).c_str(),
			bravery.str().c_str(),
			reactions.str().c_str(),
			firing.str().c_str(),
			throwing.str().c_str(),
			psiSkill.str().c_str(),
			psiStrength.str().c_str(),
			melee.str().c_str(),
			mana.str().c_str(),
			tu.str().c_str(),
			kills.str().c_str());
		for (int col = 1; col < 9; ++col)
		{
			if (_lstSoldiers->getCellText(row, col) != "0")
			{
				_lstSoldiers->setCellColor(row, col, _lstSoldiers->getSecondaryColor());
			}
		}
		if (soldier == _game->getSavedGame()->getSavedBattle()->getSelectedUnit())
			_lstSoldiers->setCellColor(row, 0, _lstSoldiers->getSecondaryColor());
		if (soldier->getTimeUnits() > 0)
			_lstSoldiers->setCellColor(row, 9, _lstSoldiers->getSecondaryColor());
		if (killCount > 0)
			_lstSoldiers->setCellColor(row, 10, _lstSoldiers->getSecondaryColor());
		row++;
	}
}

void ExperienceOverviewState::btnSortClick(Action*)
{
	_sortMode = _sortMode == 1 ? 2 : 1;
	_btnSort->setText(_sortMode == 1 ? "TUv" : "TU^");
	_btnExpSort->setText("XP");
	refreshRows();
}

void ExperienceOverviewState::btnExpSortClick(Action*)
{
	_sortMode = _sortMode == 3 ? 4 : 3;
	_btnExpSort->setText(_sortMode == 3 ? "XPv" : "XP^");
	_btnSort->setText("TU");
	refreshRows();
}

/**
 * Returns to the previous screen.
 * @param action Pointer to an action.
 */
void ExperienceOverviewState::btnOkClick(Action*)
{
	_game->popState();
}

/**
 * Selects the soldier if possible and returns to the previous screen.
 * @param action Pointer to an action.
 */
void ExperienceOverviewState::lstSoldiersClick(Action*)
{
	if (_parent->allowButtons())
	{
		auto index = _lstSoldiers->getSelectedRow();
		if (index >= _soldiers.size())
			return;
		auto* bu = _soldiers.at(index);

		if (bu->isSelectable(_game->getSavedGame()->getSavedBattle()->getSide(), false, false))
		{
			// select
			_parent->getBattleGame()->cancelAllActions();
			_parent->getBattleGame()->primaryAction(bu->getPosition());
		}

		// center on position
		_parent->getMap()->getCamera()->centerOnPosition(bu->getPosition());

		_game->popState();
	}
}

}
