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
#include "MissionDetectedState.h"
#include "R206MissionIntel.h"
#include "../Savegame/SavedGame.h"
#include <sstream>
#include "../Engine/Game.h"
#include "../Mod/Mod.h"
#include "../Interface/TextButton.h"
#include "../Interface/Window.h"
#include "../Interface/Text.h"
#include "GeoscapeState.h"
#include "Globe.h"
#include "../Savegame/MissionSite.h"
#include "../Engine/Options.h"
#include "InterceptState.h"
#include "../Mod/AlienDeployment.h"

namespace OpenXcom
{

/**
 * Initializes all the elements in the Mission Detected window.
 * @param game Pointer to the core game.
 * @param mission Pointer to the respective Mission Site.
 * @param state Pointer to the Geoscape.
 */
MissionDetectedState::MissionDetectedState(MissionSite *mission, GeoscapeState *state) : _mission(mission), _state(state)
{
	_screen = false;

	int soundId = mission->getDeployment()->getAlertSound();
	if (soundId != Mod::NO_SOUND)
	{
		_customSound = _game->getMod()->getSound("GEO.CAT", soundId);
	}

	// Create objects
	_window = new Window(this, 256, 200, 0, 0, POPUP_BOTH);
	_btnIntercept = new TextButton(200, 16, 28, 130);
	_btnCenter = new TextButton(200, 16, 28, 150);
	_btnCancel = new TextButton(200, 16, 28, 170);
	_txtTitle = new Text(246, 32, 5, 48);
	_txtCity = new Text(246, 17, 5, 80);
	Text *r206Intel = new Text(238, 29, 9, 99);

	// Set palette
	setInterface("terrorSite");

	add(_window, "window", "terrorSite");
	add(_btnIntercept, "button", "terrorSite");
	add(_btnCenter, "button", "terrorSite");
	add(_btnCancel, "button", "terrorSite");
	add(_txtTitle, "text", "terrorSite");
	add(_txtCity, "text", "terrorSite");
	add(r206Intel, "text", "terrorSite");

	centerAllSurfaces();

	// Set up objects
	_window->setBackground(_game->getMod()->getSurface(mission->getDeployment()->getAlertBackground()));

	_btnIntercept->setText(tr("STR_INTERCEPT"));
	_btnIntercept->onMouseClick((ActionHandler)&MissionDetectedState::btnInterceptClick);

	_btnCenter->setText(tr("STR_CENTER_ON_SITE_TIME_5_SECONDS"));
	_btnCenter->onMouseClick((ActionHandler)&MissionDetectedState::btnCenterClick);

	_btnCancel->setText(tr("STR_CANCEL_UC"));
	_btnCancel->onMouseClick((ActionHandler)&MissionDetectedState::btnCancelClick);
	_btnCancel->onKeyboardPress((ActionHandler)&MissionDetectedState::btnCancelClick, Options::keyCancel);

	_txtTitle->setBig();
	_txtTitle->setAlign(ALIGN_CENTER);
	_txtTitle->setWordWrap(true);
	_txtTitle->setText(tr(mission->getDeployment()->getAlertMessage()));

	_txtCity->setBig();
	_txtCity->setAlign(ALIGN_CENTER);
	_txtCity->setText(tr(mission->getCity()));

	// R206: deployment rule forecast for normal and special sites.
	const R206MissionIntel intel = r206EstimateMissionIntel(
		mission->getDeployment(), _game->getMod(), mission->getAlienRace(),
		static_cast<int>(_game->getSavedGame()->getDifficulty()));
	std::ostringstream forecast;
	if (intel.valid)
	{
		forecast << u8"적 배치규칙: " << intel.minEnemies;
		if (intel.minEnemies != intel.maxEnemies) forecast << "~" << intel.maxEnemies;
		forecast << u8"명 (예상)";
		forecast << "\n" << u8"최강 후보: "
			<< (intel.strongestType.empty() ? tr("STR_UNKNOWN") : tr(intel.strongestType));
	}
	else forecast << u8"적 인원/최강 후보: 정보 없음";
	r206Intel->setAlign(ALIGN_CENTER);
	r206Intel->setWordWrap(true);
	r206Intel->setText(forecast.str());
}

/**
 *
 */
MissionDetectedState::~MissionDetectedState()
{

}

/**
 * Picks a craft to intercept the mission site.
 * @param action Pointer to an action.
 */
void MissionDetectedState::btnInterceptClick(Action *)
{
	_state->timerReset();
	_state->getGlobe()->center(_mission->getLongitude(), _mission->getLatitude());
	_game->pushState(new InterceptState(_state->getGlobe(), false, 0, _mission));
}

/**
 * Centers on the mission site and returns to the previous screen.
 * @param action Pointer to an action.
 */
void MissionDetectedState::btnCenterClick(Action *)
{
	_state->timerReset();
	_state->getGlobe()->center(_mission->getLongitude(), _mission->getLatitude());
	_game->popState();
}

/**
 * Returns to the previous screen.
 * @param action Pointer to an action.
 */
void MissionDetectedState::btnCancelClick(Action *)
{
	_game->popState();
}

}
