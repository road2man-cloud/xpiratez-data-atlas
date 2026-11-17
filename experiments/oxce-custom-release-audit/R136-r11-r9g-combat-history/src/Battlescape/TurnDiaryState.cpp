/*
 * Copyright 2010-2019 OpenXcom Developers.
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
#include "TurnDiaryState.h"
#include <sstream>
#include "../Engine/Action.h"
#include "../Engine/Game.h"
#include "../Engine/Options.h"
#include "../Engine/Logger.h"
#include "../Interface/Window.h"
#include "../Interface/Text.h"
#include "../Interface/TextButton.h"
#include "../Interface/TextList.h"
#include "../Mod/Mod.h"
#include "../Savegame/HitLog.h"
#include "../Savegame/SavedBattleGame.h"
#include "../Savegame/SavedGame.h"
#include "../Savegame/BattleUnitStatistics.h"
#include "../Savegame/BattleUnit.h"

namespace OpenXcom
{

/**
 * Initializes all the elements in the Turn Diary window.
 */
TurnDiaryState::TurnDiaryState(const HitLog *hitLog)
{
	_screen = false;

	// Create objects
	_window = new Window(this, 216, 160, 52, 20, POPUP_BOTH);
	_txtTitle = new Text(206, 17, 57, 32);
	_btnCancel = new TextButton(140, 16, 90, 156);
	_lstTurnDiary = new TextList(180, 96, 65, 52);

	// Set palette
	_game->getSavedGame()->getSavedBattle()->setPaletteByDepth(this);

	add(_window, "messageWindowBorder", "battlescape");
	add(_txtTitle, "messageWindows", "battlescape");
	add(_btnCancel, "messageWindowButtons", "battlescape");
	add(_lstTurnDiary, "optionLists", "battlescape");

	centerAllSurfaces();

	// Set up objects
	_window->setHighContrast(true);
	_window->setBackground(_game->getMod()->getSurface("TAC00.SCR"));

	_txtTitle->setAlign(ALIGN_CENTER);
	_txtTitle->setBig();
	_txtTitle->setHighContrast(true);
	_txtTitle->setText(tr("STR_HIT_LOG"));

	_btnCancel->setText(tr("STR_CANCEL_UC"));
	_btnCancel->setHighContrast(true);
	_btnCancel->onMouseClick((ActionHandler)&TurnDiaryState::btnCancelClick);
	_btnCancel->onKeyboardPress((ActionHandler)&TurnDiaryState::btnCancelClick, Options::keyCancel);

	_lstTurnDiary->setColumns(1, 172);
	_lstTurnDiary->setSelectable(true);
	_lstTurnDiary->setBackground(_window);
	_lstTurnDiary->setMargin(8);
	_lstTurnDiary->setAlign(ALIGN_CENTER);
	_lstTurnDiary->setHighContrast(true);
	_lstTurnDiary->setWordWrap(true);

	// Display the most recent *completed hostile turn* FIRST. The old mixed
	// diary buried hostile shots below newer environmental/turn messages.
	// The HitLog ABI is unchanged; structured events use the existing vector.
	size_t row = 0;
	auto addLogRow = [this, &row](const std::string &value)
	{
		_lstTurnDiary->addRow(1, value.c_str());
		if (row % 2 != 0) _lstTurnDiary->setRowColor(row, _lstTurnDiary->getSecondaryColor());
		++row;
	};

	const std::vector<std::string> enemy = hitLog->getLastHostileTurnDiary();
#ifdef XPZ_PREV_ENEMY_DIAG
	Log(LOG_INFO) << "[XPZ_HISTORY_DIAG] OPEN hasHostile=" << hitLog->hasCompletedHostileTurnDiary()
		<< " hostileEvents=" << enemy.size() << " diarySize=" << hitLog->getTurnDiary().size();
	for (size_t i = 0; i < hitLog->getTurnDiary().size(); ++i)
	{
		if (HitLog::isDiaryMetadata(hitLog->getTurnDiary()[i]))
		{
			Log(LOG_INFO) << "[XPZ_HISTORY_DIAG] ENTRY " << i << " " << hitLog->getTurnDiary()[i].substr(1, 90);
		}
	}
#endif
	if (hitLog->hasCompletedHostileTurnDiary())
	{
		addLogRow(std::string("직전 적 턴: ") + std::to_string(enemy.size()) + "건");
		if (enemy.empty())
		{
			addLogRow("공격/피해 기록 없음");
		}
		else
		{
			// Recent events first; TextList remains scrollable for large fights.
			for (std::vector<std::string>::const_reverse_iterator it = enemy.rbegin(); it != enemy.rend(); ++it)
			{
				addLogRow(*it);
			}
		}
	}
	else
	{
		addLogRow("직전 적 턴 기록 없음 (이 실행 이후부터 기록)");
	}

    // R136-R11: expose persisted casualty metadata in Ctrl+Alt+H without
    // touching save-file layout or the existing completed-hostile-turn diary.
    SavedBattleGame *battle = _game->getSavedGame()->getSavedBattle();
    const std::vector<BattleUnit*> &units = *battle->getUnits();
    addLogRow("--- 사망/기절 원인 (저장된 기록) ---");
    bool hasCasualties = false;
    auto readableItem = [this](const std::string &id) -> std::string
    {
        if (id.empty()) return "기록 없음";
        const std::string localized = tr(id);
        return localized.empty() || localized == id ? id : localized + " [" + id + "]";
    };

    for (BattleUnit *victim : units)
    {
        if (!victim || victim->getOriginalFaction() != FACTION_PLAYER)
            continue;
        const UnitStatus status = victim->getStatus();
        if (status != STATUS_DEAD && status != STATUS_UNCONSCIOUS)
            continue;
        hasCasualties = true;

        const std::string victimName = victim->getName(_game->getLanguage());
        addLogRow(victimName + (status == STATUS_DEAD ? " [사망]" : " [기절]"));
        const int murdererId = victim->getMurdererId();
        BattleUnit *killer = nullptr;
        for (BattleUnit *actor : units)
        {
            if (actor && murdererId > 0 && actor->getId() == murdererId)
            {
                killer = actor;
                break;
            }
        }

        // A kill-statistic is a separate piece of evidence, not a replacement
        // for the victim's saved fatal-blow attribution.
        BattleUnit *statActor = nullptr;
        const BattleUnitKills *statEntry = nullptr;
        for (BattleUnit *actor : units)
        {
            if (!actor || !actor->getStatistics()) continue;
            for (const BattleUnitKills *entry : actor->getStatistics()->kills)
            {
                if (!entry || entry->id != victim->getId() ||
                    entry->status != status) continue;
                if (!statEntry || entry->turn > statEntry->turn)
                {
                    statActor = actor;
                    statEntry = entry;
                }
            }
        }

        std::string attacker = "가해자: ";
        if (killer)
        {
            attacker += killer->getName(_game->getLanguage());
            if (killer->getOriginalFaction() == FACTION_PLAYER)
                attacker += " [아군]";
        }
        else if (murdererId > 0)
            attacker += "ID " + std::to_string(murdererId) + " (대원 정보 없음)";
        else if (statActor)
        {
            attacker += statActor->getName(_game->getLanguage());
            attacker += " (전투 통계 추정)";
            if (statActor->getOriginalFaction() == FACTION_PLAYER)
                attacker += " [아군]";
        }
        else
            attacker += "기록 없음";
        addLogRow(attacker);

        if (killer && statActor && killer != statActor)
            addLogRow("주의: 치명타 기록과 처치 통계의 가해자가 다름");

        std::string weapon = victim->getMurdererWeapon();
        std::string ammo = victim->getMurdererWeaponAmmo();
        if (weapon.empty() && statEntry) weapon = statEntry->weapon;
        if (ammo.empty() && statEntry) ammo = statEntry->weaponAmmo;
        addLogRow(std::string("무기: ") + readableItem(weapon));
        addLogRow(std::string("탄약: ") + readableItem(ammo));
        if (statEntry)
            addLogRow(std::string("처치 통계 턴키: ") + std::to_string(statEntry->turn));

        const Position tile = victim->getPosition();
        std::ostringstream detail;
        detail << "좌표: (" << tile.x << "," << tile.y << "," << tile.z << ")";
        detail << " | HP: " << victim->getHealth();
        addLogRow(detail.str());
        if (victim->getStatistics())
            addLogRow(std::string("아군 피격 누적: ") +
                std::to_string(victim->getStatistics()->shotByFriendlyCounter) +
                "회 (치명타 증거 아님)");
        addLogRow("정확한 마지막 피해량: 저장 기록 없음");
    }
    if (!hasCasualties)
        addLogRow("사망/기절 대원 없음");
    addLogRow("--- 현재 턴 ---");
	const std::string active = hitLog->getHitLogText(true);
	if (!active.empty()) addLogRow(active);
	const std::vector<std::string> current = hitLog->getCurrentTurnDiary();
	for (std::vector<std::string>::const_reverse_iterator it = current.rbegin(); it != current.rend(); ++it)
	{
		addLogRow(*it);
	}
}

/**
 * Returns to the previous screen.
 * @param action Pointer to an action.
 */
void TurnDiaryState::btnCancelClick(Action *)
{
	_game->popState();
}

}
