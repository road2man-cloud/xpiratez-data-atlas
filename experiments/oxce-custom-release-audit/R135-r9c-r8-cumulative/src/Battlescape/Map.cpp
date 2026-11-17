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
#include "Map.h"
#include "../Engine/RNG.h"
#include <map>
#include <cmath>
#include <sstream>
#include <iomanip>
#include <stdint.h>
#include <chrono>
#include <set>
#include "Camera.h"
#include "UnitSprite.h"
#include "ItemSprite.h"
#include "Pathfinding.h"
#include "TileEngine.h"
#include "R69Range.h"
#include "R69Range.h"
#include "Projectile.h"
#include "ProjectileFlyBState.h"
#include "Explosion.h"
#include "BattlescapeState.h"
#include "Particle.h"
#include "../Mod/Mod.h"
#include "../Engine/Action.h"
#include "../Engine/Script.h"
#include "../Engine/SurfaceSet.h"
#include "../Engine/Timer.h"
#include "../Engine/Language.h"
#include "../Engine/Palette.h"
#include "../Engine/Game.h"
#include "../Engine/Screen.h"
#include "../Engine/Logger.h"
#include "../Engine/ShaderDraw.h"
#include "../Engine/Font.h"
#include "../Engine/ShaderMove.h"
#include "../Savegame/SavedBattleGame.h"
#include "../Savegame/Tile.h"
#include "../Savegame/BattleUnit.h"
#include "../Savegame/BattleItem.h"
#include "../Ufopaedia/Ufopaedia.h"
#include "../Mod/RuleItem.h"
#include "../Mod/RuleInterface.h"
#include "../Mod/MapDataSet.h"
#include "../Mod/MapData.h"
#include "../Mod/Armor.h"
#include "../Mod/Unit.h"
#include "../Mod/RuleEnviroEffects.h"
#include "BattlescapeMessage.h"
#include "../Savegame/SavedGame.h"
#include "../Interface/NumberText.h"
#include "../Interface/Text.h"
#include "../fmath.h"


/*
  1) Map origin is top corner.
  2) X axis goes downright. (width of the map)
  3) Y axis goes downleft. (length of the map
  4) Z axis goes up (height of the map)

           0,0
            /\
           /  \
        y+ \  / x+
            \/

  Compass directions

         W  /\  N
           /  \
           \  /
         S  \/  E

  Unit directions

         6  /\  0
           /  \
           \  /
         4  \/  2

  Big units parts

            /\
           /0 \
          /\  /\
         /2 \/1 \
         \  /\  /
          \/3 \/
           \  /
            \/
 */

namespace OpenXcom
{
// Visual-only smoke clarity switch; never changes tile smoke or combat rules.
bool gHighVisibilitySmoke = false;
// RC62: transient highlight of an already-visible enemy, never persisted.
static Position rc62EnemyFlashPosition(-1,-1,-1);
static Uint32 rc62EnemyFlashStart=0;
void rc62FlashVisibleEnemy(const Position &position)
{
    rc62EnemyFlashPosition=position;
    rc62EnemyFlashStart=SDL_GetTicks();
}
// RC59: F8 is the compact aiming HUD. Shift+F8 enables advanced readouts.
// Keep the Map object layout unchanged for the RC54 release-object ABI.
static bool r59DetailedHud=false;
// RC75: one shared HUD Monte Carlo ceiling for native straight and arc shots.
// Real combat RNG/trajectory rules are unchanged.
static constexpr unsigned r22HudMaxTrials = 256U;
// RC84: native HUD trials are CPU-time-budgeted, not gated by a fixed
// 90-95ms sleep. This controls preview responsiveness ONLY; the real
// battle engine and the full 256-trial statistical sample are untouched.
static constexpr Uint32 r84HudBatchIntervalMs = 25U;
static constexpr Uint32 r84HudProgressRedrawMs = 30U;
static constexpr Uint32 r84HudWorkBudgetMs = 7U;

// RC79: expensive HUD Monte Carlo caches are invalidated by meaningful
// battlefield changes, not by an arbitrary clock deadline. Hash ONLY
// already-known terrain and player/visible units; never inspect unseen
// hostile state. A subsecond fingerprint cache avoids scanning the map
// on every animation or HUD repaint.
static unsigned long long r79KnownBattlefieldSignature(SavedBattleGame *battle,
                                                   bool forceRefresh = false)
{
    if (!battle) return 0ULL;
    static SavedBattleGame *lastBattle = nullptr;
    static Uint32 lastChecked = 0U;
    static unsigned long long lastSignature = 0ULL;
    const Uint32 now = SDL_GetTicks();
    if (!forceRefresh && lastBattle == battle && lastSignature &&
        now - lastChecked < 750U)
        return lastSignature;

    unsigned long long hash = 1469598103934665603ULL;
    auto mix = [&hash](unsigned long long value)
    {
        hash ^= value;
        hash *= 1099511628211ULL;
    };
    mix(reinterpret_cast<uintptr_t>(battle));
    mix(static_cast<unsigned>(battle->getTurn()));
    mix(static_cast<unsigned>(battle->getMapSizeX()));
    mix(static_cast<unsigned>(battle->getMapSizeY()));
    mix(static_cast<unsigned>(battle->getMapSizeZ()));
    const int count = battle->getMapSizeXYZ();
    for (int index = 0; index < count; ++index)
    {
        Tile *tile = battle->getTile(index);
        if (!tile) continue;
        const bool discovered = tile->isDiscovered(O_FLOOR);
        const bool visible = tile->getVisible() != 0;
        if (!discovered && !visible) continue;
        mix(static_cast<unsigned>(index + 1));
        mix(static_cast<unsigned>(discovered));
        mix(static_cast<unsigned>(visible));
        mix(static_cast<unsigned>(tile->getTerrainLevel() + 128));
        mix(static_cast<unsigned>(tile->getSmoke()));
        mix(static_cast<unsigned>(tile->getFire()));
        for (int part = 0; part < 4; ++part)
        {
            const TilePart tp = static_cast<TilePart>(part);
            mix(reinterpret_cast<uintptr_t>(tile->getMapData(tp)));
            if (tile->isUfoDoor(tp))
                mix(static_cast<unsigned>(tile->isUfoDoorOpen(tp)));
        }
    }
    for (BattleUnit *unit : *battle->getUnits())
    {
        if (!unit || (unit->getFaction() != FACTION_PLAYER &&
                      !unit->getVisible()))
            continue;
        const Position pos = unit->getPosition();
        mix(static_cast<unsigned>(unit->getId()));
        mix(static_cast<unsigned>(pos.x));
        mix(static_cast<unsigned>(pos.y));
        mix(static_cast<unsigned>(pos.z));
        mix(static_cast<unsigned>(unit->getDirection()));
        mix(static_cast<unsigned>(unit->isKneeled()));
        mix(static_cast<unsigned>(unit->isOut()));
        mix(static_cast<unsigned>(unit->getFaction()));
        if (unit->getFaction() == FACTION_PLAYER)
        {
            mix(static_cast<unsigned>(unit->getHealth()));
            mix(static_cast<unsigned>(unit->getTimeUnits()));
            mix(static_cast<unsigned>(unit->getEnergy()));
            mix(static_cast<unsigned>(unit->getStunlevel()));
        }
    }
    lastBattle = battle;
    lastChecked = now;
    lastSignature = hash;
    return hash;
}

/**
 * Sets up a map with the specified size and position.
 * @param game Pointer to the core game.
 * @param width Width in pixels.
 * @param height Height in pixels.
 * @param x X position in pixels.
 * @param y Y position in pixels.
 * @param visibleMapHeight Current visible map height.
 */
Map::Map(Game *game, int width, int height, int x, int y, int visibleMapHeight) : InteractiveSurface(width, height, x, y),
	_game(game), _isTFTD(false), _arrow(0), _anyIndicator(false), _isAltPressed(false), _isCtrlPressed(false),
	_selectorX(0), _selectorY(0), _mouseX(0), _mouseY(0), _cursorType(CT_NORMAL), _cursorSize(1), _animFrame(0),
	_projectile(0), _followProjectile(true), _projectileInFOV(false), _explosionInFOV(false), _launch(false), _visibleMapHeight(visibleMapHeight),
	_unitDying(false), _smoothingEngaged(false), _flashScreen(false), _bgColor(15), _projectileSet(0), _showObstacles(false), _showInfoOnCursor(false)
{
    r59DetailedHud=false; // New Map starts in compact F8 mode.
	// TODO: extract to a better place later
	for (const auto& pair : Options::mods)
	{
		if (pair.second)
		{
			if (pair.first == "xcom2")
			{
				_isTFTD = true;
				break;
			}
		}
	}

	_iconHeight = _game->getMod()->getInterface("battlescape")->getElement("icons")->h;
	_iconWidth = _game->getMod()->getInterface("battlescape")->getElement("icons")->w;
	_messageColor = _game->getMod()->getInterface("battlescape")->getElement("messageWindows")->color;

	auto* itf = _game->getMod()->getInterface("battlescape")->getElement("thinkingProgressBar");
	_hostileBarColor = itf->color;
	_neutralBarColor = itf->color2;
	_borderBarColor = itf->border;

	PathPreview previewSetting = Options::battleNewPreviewPath;
	_smoothCamera = Options::battleSmoothCamera;
	if (Options::traceAI)
	{
		// turn everything on because we want to see the markers.
		previewSetting = PATH_ARROW_TU;
	}
	_previewSettingArrows = previewSetting & PATH_ARROWS;
	_previewSettingTu     = previewSetting & PATH_TU_COST;
	_previewSettingEnergy = previewSetting & PATH_ENERGY_COST;

	_save = _game->getSavedGame()->getSavedBattle();
	if ((int)(_game->getMod()->getLUTs()->size()) > _save->getDepth())
	{
		_transparencies = &_game->getMod()->getLUTs()->at(_save->getDepth());
	}
	else
	{
		const static std::vector<Uint8> dummy;
		_transparencies = &dummy;
	}

	_spriteWidth = _game->getMod()->getSurfaceSet("BLANKS.PCK")->getFrame(0)->getWidth();
	_spriteHeight = _game->getMod()->getSurfaceSet("BLANKS.PCK")->getFrame(0)->getHeight();
	_message = new BattlescapeMessage(320, (visibleMapHeight < 200)? visibleMapHeight : 200, 0, 0);
	_message->setX(_game->getScreen()->getDX());
	_message->setY((visibleMapHeight - _message->getHeight()) / 2);
	_message->setTextColor(_messageColor);
	_camera = new Camera(_spriteWidth, _spriteHeight, _save->getMapSizeX(), _save->getMapSizeY(), _save->getMapSizeZ(), this, visibleMapHeight);
	_scrollMouseTimer = new Timer(SCROLL_INTERVAL);
	_scrollMouseTimer->onTimer((SurfaceHandler)&Map::scrollMouse);
	_scrollKeyTimer = new Timer(SCROLL_INTERVAL);
	_scrollKeyTimer->onTimer((SurfaceHandler)&Map::scrollKey);
	_camera->setScrollTimer(_scrollMouseTimer, _scrollKeyTimer);
	_obstacleTimer = new Timer(2500);
	_obstacleTimer->stop();
	_obstacleTimer->onTimer((SurfaceHandler)&Map::disableObstacles);

	_showInfoOnCursor = (Options::oxceShowAccuracyOnCrosshair == 1 && Options::battleUFOExtenderAccuracy) || Options::oxceShowAccuracyOnCrosshair == 2;
	_txtAccuracy = new Text(44, 18, 0, 0);
	_txtAccuracy->setSmall();
	_txtAccuracy->setPalette(_game->getScreen()->getPalette());
	_txtAccuracy->setHighContrast(true);
	_txtAccuracy->initText(_game->getMod()->getFont("FONT_BIG"), _game->getMod()->getFont("FONT_SMALL"), _game->getLanguage());
	_cacheActiveWeaponUfopediaArticleUnlocked = -1;
	_cacheIsCtrlPressed = false;
	_cacheCursorPosition = TileEngine::invalid;
	_cacheHasLOS = -1;

	_nightVisionOn = false;
	if (Options::oxceToggleNightVisionType == 2)
	{
		// persisted per campaign
		_nightVisionOn = _game->getSavedGame()->getToggleNightVision();
	}
	else if (Options::oxceToggleNightVisionType == 1)
	{
		// persisted per battle
		_nightVisionOn = _save->getToggleNightVision();
	}

	_debugVisionMode = 0;
	if (Options::oxceToggleBrightnessType == 2)
	{
		// persisted per campaign
		_debugVisionMode = _game->getSavedGame()->getToggleBrightness();
	}
	else if (Options::oxceToggleBrightnessType == 1)
	{
		// persisted per battle
		_debugVisionMode = _save->getToggleBrightness();
	}

	_save->setToggleNightVisionTemp(false);
	_save->setToggleNightVisionColorTemp(0);
	_save->setToggleBrightnessTemp(_debugVisionMode);

	_fadeShade = 16;
	_nvColor = 0;
	_fadeTimer = new Timer(FADE_INTERVAL);
	_fadeTimer->onTimer((SurfaceHandler)&Map::fadeShade);
	_fadeTimer->start();

	auto* enviro = _save->getEnviroEffects();
	if (enviro)
	{
		_bgColor = enviro->getMapBackgroundColor();
	}

	_stunIndicator = _game->getMod()->getSurface("FloorStunIndicator", false);
	_woundIndicator = _game->getMod()->getSurface("FloorWoundIndicator", false);
	_burnIndicator = _game->getMod()->getSurface("FloorBurnIndicator", false);
	_shockIndicator = _game->getMod()->getSurface("FloorShockIndicator", false);
	_anyIndicator = _stunIndicator || _woundIndicator || _burnIndicator || _shockIndicator;

	if (enviro)
	{
		if (!enviro->getMapShockIndicator().empty())
		{
			_shockIndicator = _game->getMod()->getSurface(enviro->getMapShockIndicator(), false);
		}
	}

	_vaporParticlesInit.resize(_camera->getMapSizeY() * _camera->getMapSizeX());
	_vaporParticles.resize(_camera->getMapSizeY() * _camera->getMapSizeX());
}

/**
 * Deletes the map.
 */
Map::~Map()
{
	delete _scrollMouseTimer;
	delete _scrollKeyTimer;
	delete _fadeTimer;
	delete _obstacleTimer;
	delete _arrow;
	delete _message;
	delete _camera;
	delete _txtAccuracy;
}

/**
 * Initializes the map.
 */
void Map::init()
{
	// load the tiny arrow into a surface
	int f = Palette::blockOffset(1); // yellow
	int b = 15; // black
	int pixels[81] = { 0, 0, b, b, b, b, b, 0, 0,
					   0, 0, b, f, f, f, b, 0, 0,
					   0, 0, b, f, f, f, b, 0, 0,
					   b, b, b, f, f, f, b, b, b,
					   b, f, f, f, f, f, f, f, b,
					   0, b, f, f, f, f, f, b, 0,
					   0, 0, b, f, f, f, b, 0, 0,
					   0, 0, 0, b, f, b, 0, 0, 0,
					   0, 0, 0, 0, b, 0, 0, 0, 0 };

	_arrow = new Surface(9, 9);
	_arrow->setPalette(this->getPalette());
	_arrow->lock();
	for (int y = 0; y < 9;++y)
		for (int x = 0; x < 9; ++x)
			_arrow->setPixel(x, y, pixels[x+(y*9)]);
	_arrow->unlock();

	_projectile = 0;
	if (_save->getDepth() == 0)
	{
		_projectileSet = _game->getMod()->getSurfaceSet("Projectiles");
	}
	else
	{
		_projectileSet = _game->getMod()->getSurfaceSet("UnderwaterProjectiles");
	}
}

/**
 * Keeps the animation timers running.
 */
void Map::think()
{
	_scrollMouseTimer->think(0, this);
	_scrollKeyTimer->think(0, this);
	_fadeTimer->think(0, this);
	_obstacleTimer->think(0, this);
    if (rc62EnemyFlashStart && SDL_GetTicks()-rc62EnemyFlashStart<1100U)
        _redraw=true;
    // R37 reaction-risk refresh belongs to the same F8-controlled overlay.
    if (_r22On && _save && _save->getSide() == FACTION_PLAYER &&
        _save->getSelectedUnit() &&
        SDL_GetTicks() - _r37ReactionCheckedAt >= 450U)
        _redraw = true;
    if (_r22On && _save && _save->getSide() == FACTION_PLAYER &&
        _cursorType != CT_NONE &&
        ((_r22StatsKey != 0 && _r22SampleCount < r22HudMaxTrials) ||
         (_r41ThrowSignature && _r41ThrowSamples < 256U) ||
         _r22HullWorkPending ||
         (_r29BlockPass < 3 && !_r29BlockCells.empty())))
    {
        const bool n256Pending =
            (_r22StatsKey != 0 && _r22SampleCount < r22HudMaxTrials) ||
            (_r41ThrowSignature != 0 && _r41ThrowSamples < r22HudMaxTrials);
        const Uint32 tick = SDL_GetTicks();
        if (tick - _r22LastUiRefresh >=
            (n256Pending ? r84HudProgressRedrawMs : 90U))
        {
            _r22LastUiRefresh = tick;
            _redraw = true;
        }
    }
}

/**
 * Draws the whole map, part by part.
 */
void Map::draw()
{
	if (!_redraw)
	{
		return;
	}

	// normally we'd call for a Surface::draw();
	// but we don't want to clear the background with colour 0, which is transparent (aka black)
	// we use colour 15 because that actually corresponds to the colour we DO want in all variations of the xcom and tftd palettes.
	// Note: un-hardcoded the color from 15 to ruleset value, default 15
	_redraw = false;
	ShaderDrawFunc(
		[](Uint8& dest, Uint8 color)
		{
			dest = color;
		},
		ShaderSurface(this),
		ShaderScalar<Uint8>(Palette::blockOffset(0) + _bgColor)
	);

	Tile *t;

	_projectileInFOV = _save->getDebugMode();
	if (_projectile)
	{
		t = _save->getTile(_projectile->getPosition(0).toTile());
		if (_save->getSide() == FACTION_PLAYER || (t && t->getVisible()))
		{
			_projectileInFOV = true;
		}
	}
	_explosionInFOV = _save->getDebugMode();
	if (!_explosions.empty())
	{
		for (auto* explosion : _explosions)
		{
			if (explosion->isBig())
			{
				_explosionInFOV = true;
				break;
			}
			t = _save->getTile(explosion->getPosition().toTile());
			if (t && t->getVisible())
			{
				_explosionInFOV = true;
				break;
			}
		}
	}

	if ((_save->getSelectedUnit() && _save->getSelectedUnit()->getVisible()) || _unitDying || _save->getSide() == FACTION_PLAYER || _save->getDebugMode() || _projectileInFOV || _explosionInFOV)
	{
		drawTerrain(this);
	}
	else
	{
		_message->blit(this->getSurface());
	}


    // RC71: a tiny white flag beside the head of a *visible* surrendered
    // hostile. This is a read-only indicator: never call the battle engine's
    // isSurrendering(bu), which can change surrender state during rendering.
    // Draw after terrain/smoke so the flag stays legible, but before HUD
    // panels. The same projection and walking offset as UnitSprite are used,
    // including all four camera rotations and map scrolling.
    if (_save && _camera && _save->getSide() == FACTION_PLAYER)
    {
        const SDL_Color *palette = getPalette();
        Uint8 white = 15, black = 1;
        if (palette)
        {
            int bestWhite = 0x7fffffff, bestBlack = 0x7fffffff;
            for (int i = 1; i < 256; ++i)
            {
                const int r = palette[i].r, g = palette[i].g, b = palette[i].b;
                const int wr = r - 245, wg = g - 245, wb = b - 245;
                const int br = r - 9, bg = g - 9, bb = b - 11;
                const int whiteDist = wr*wr + wg*wg + wb*wb;
                const int blackDist = br*br + bg*bg + bb*bb;
                if (whiteDist < bestWhite)
                {
                    bestWhite = whiteDist;
                    white = static_cast<Uint8>(i);
                }
                if (blackDist < bestBlack)
                {
                    bestBlack = blackDist;
                    black = static_cast<Uint8>(i);
                }
            }
        }
        for (const BattleUnit *unit : *_save->getUnits())
        {
            if (!unit || unit->getOriginalFaction() != FACTION_HOSTILE ||
                unit->getFaction() == FACTION_PLAYER || !unit->getCapturable() ||
                !unit->isSurrendering() || unit->isOut() || !unit->getVisible())
                continue;

            const Position pos = unit->getPosition();
            if (pos.z > _camera->getViewLevel()) continue;
            Tile *tile = _save->getTile(pos);
            if (!tile || (!tile->getVisible() && !tile->isDiscovered(O_FLOOR)))
                continue;
            // Do not paint a floating flag through an intact upper floor.
            bool hiddenByFloor = false;
            for (int z = pos.z + 1; z <= _camera->getViewLevel(); ++z)
            {
                const Tile *above = _save->getTile(Position(pos.x,pos.y,z));
                if (!above || !above->hasNoFloor(_save))
                {
                    hiddenByFloor = true;
                    break;
                }
            }
            if (hiddenByFloor) continue;

            Position screen;
            _camera->convertMapToScreen(pos, &screen);
            screen += _camera->getMapOffset();
            const Position walk = calculateWalkingOffset(unit).ScreenOffset;
            // Position::TileZ - height gives the same headline as the
            // selected-unit arrow; shift right so the flag does not mask
            // the face or the weapon. Native footprint: just 9x9 pixels.
            const int x = screen.x + walk.x + _spriteWidth / 2 +
                (unit->isBigUnit() ? 11 : 7);
            const int y = screen.y + walk.y + Position::TileZ -
                (unit->getHeight() + unit->getFloatHeight()) - 7 -
                (unit->isBigUnit() ? 3 : 0);
            if (x < 1 || y < 1 || x + 8 >= getWidth() ||
                y + 8 >= std::min(getHeight(), _visibleMapHeight))
                continue;

            drawRect(x-1, y-1, 9, 9, black);
            drawLine(x+1, y, x+1, y+6, white); // pole
            drawLine(x, y+7, x+2, y+7, white); // base
            drawRect(x+2, y, 4, 3, white);     // flag
            setPixel(x+6, y+1, white);         // fluttering tip
        }
    }

    // R41: world coordinates are projected by Camera; HUD text stays readable.
    // No framebuffer mirror, pixel copy, temporary image or per-frame allocation.
    if (_r22On && _save && _camera && _save->getSide() == FACTION_PLAYER && _save->getSelectedUnit())
        r22DrawOverlay();
    // R74: keep the pinned first target's native crosshair. During the
    // second-click origin preview show ONE full standing prism with its
    // foot-level diamond emphasized, never a second crosshair. Render
    // after the probability grid so the box remains readable on terrain.
    const BattleAction *secondAction = (_save && _save->getBattleGame())
        ? _save->getBattleGame()->getCurrentAction() : nullptr;
    if (_r22On && Options::battleConfirmFireMode && _camera && _save &&
        _save->getSide() == FACTION_PLAYER &&
        (_cursorType == CT_AIM || _cursorType == CT_THROW) &&
        !_save->getBattleState()->getMouseOverIcons() &&
        secondAction && secondAction->targeting && !secondAction->sprayTargeting &&
        secondAction->actor == _save->getSelectedUnit() &&
        !secondAction->waypoints.empty() &&
        (secondAction->type == BA_SNAPSHOT || secondAction->type == BA_AIMEDSHOT ||
         secondAction->type == BA_AUTOSHOT || secondAction->type == BA_THROW))
    {
        Position hover;
        getSelectorPosition(&hover);
        Tile *hoverTile = _save->getTile(hover);
        if (hover != secondAction->waypoints.front() && hoverTile &&
            (hoverTile->getVisible() || hoverTile->isDiscovered(O_FLOOR)))
        {
            // R60: anchor the prism to the exact NATIVE FLOOR footprint.
            // Camera::convertVoxelToScreen projects voxel corners ~3 screen
            // pixels above the CURSOR.PCK tile-bottom diamond, which left
            // the yellow lower face visually hovering even at terrain z.
            // Use the same 32x40 CURSOR.PCK lower face (27..39) already
            // used by the R29 probability grid. This is a display-only
            // adjustment: neither the soldier's feet nor muzzle physics
            // and voxel trajectories are changed by it.
            Position tileScreen;
            _camera->convertMapToScreen(hover, &tileScreen);
            tileScreen += _camera->getMapOffset();
            // R69: match the green FLOOR probability diamond exactly.
            // Adding terrainLevel moved this box above the painted floor
            // on raised/mixed-height tiles. Keep terrain and ALL contents;
            // this overlay draws only the 12 transparent outline edges.
            const Position outerBottom[4] = {
                tileScreen + Position(16,27,0),
                tileScreen + Position(30,33,0),
                tileScreen + Position(16,39,0),
                tileScreen + Position(2,33,0)
            };
            Position outerTop[4];
            for (int i = 0; i < 4; ++i)
                outerTop[i] = outerBottom[i] + Position(0,-Position::TileZ,0);
            const SDL_Color *palette = getPalette();
            if (palette)
            {
                auto nearest = [palette](int r, int g, int b) -> Uint8 {
                    int best = 2147483647;
                    Uint8 found = 1;
                    for (int i = 1; i < 256; ++i)
                    {
                        const int dr = int(palette[i].r) - r;
                        const int dg = int(palette[i].g) - g;
                        const int db = int(palette[i].b) - b;
                        const int dist = 2*dr*dr + 3*dg*dg + db*db;
                        if (dist < best) { best = dist; found = Uint8(i); }
                    }
                    return found;
                };
                // R71/R69: ALL outer 12 edges retain the existing pillar
                // color. The R69 floor footprint below is fixed at the
                // native CURSOR.PCK floor; NEVER translate it upward.
                const Uint8 wireColor = nearest(177, 174, 151);
                const Uint8 middleYellow = nearest(255, 233, 72);
                for (int i = 0; i < 4; ++i)
                {
                    const int next = (i + 1) % 4;
                    drawLine(outerTop[i].x, outerTop[i].y,
                             outerTop[next].x, outerTop[next].y, wireColor);
                    drawLine(outerTop[i].x, outerTop[i].y,
                             outerBottom[i].x, outerBottom[i].y, wireColor);
                    drawLine(outerBottom[i].x, outerBottom[i].y,
                             outerBottom[next].x, outerBottom[next].y,
                             wireColor);
                }
                // Yellow is a thin, UNFILLED middle cross-section, never
                // the floor face. It cannot hide units, objects or terrain.
                const Position middleShift(0,-Position::TileZ/2,0);
                for (int i = 0; i < 4; ++i)
                {
                    const int next = (i + 1) % 4;
                    const Position a = outerBottom[i] + middleShift;
                    const Position b = outerBottom[next] + middleShift;
                    drawLine(a.x, a.y, b.x, b.y, middleYellow);
                }
            }
        }
    }
    // R32/R37 render in screen coordinates and are never rotated.
    if (_r32EnemyCounts && _save && _save->getSide() == FACTION_PLAYER)
        r32DrawEnemyCounts();
    if (_r22On)
        r37DrawReactionHud();
    // A small fixed-position orientation label; no HUD row shifting.
    const char *r41ViewLabels[] = {"VIEW 0", "VIEW 90", "VIEW 180", "VIEW 270"};
    const int labelX = std::max(0, getWidth() - 82);
    drawRect(labelX,0,82,12,0);
    drawString(labelX+4,2,r41ViewLabels[_r41Rotation],160);
    // RC63: native iso-floor tile cursor, pulsed in bright fluorescent
    // lime. Screen projection automatically follows camera rotation.
    const Uint32 flashAge=SDL_GetTicks()-rc62EnemyFlashStart;
    if (rc62EnemyFlashStart && flashAge<1100U &&
        (flashAge/135U)%2==0 && _save && _camera)
    {
        Tile *flashTile=_save->getTile(rc62EnemyFlashPosition);
        BattleUnit *flashUnit=flashTile ?
            flashTile->getOverlappingUnit(_save) : nullptr;
        if (flashUnit && flashUnit->getVisible() && !flashUnit->isOut())
        {
            const SDL_Color *palette=getPalette();
            Uint8 neon=15;
            if (palette)
            {
                int best=0x7fffffff;
                for (int i=1;i<256;++i)
                {
                    const int dr=int(palette[i].r)-125;
                    const int dg=int(palette[i].g)-255;
                    const int db=int(palette[i].b)-25;
                    const int delta=dr*dr+dg*dg+db*db;
                    if (delta<best) {best=delta; neon=static_cast<Uint8>(i);}
                }
            }
            const Position foot=rc62EnemyFlashPosition.toVoxel()+
                Position(0,0,1-flashTile->getTerrainLevel());
            const Position corners[]={
                foot,foot+Position(16,0,0),
                foot+Position(16,16,0),foot+Position(0,16,0)};
            Position xy[4];
            for (int k=0;k<4;++k)
                _camera->convertVoxelToScreen(corners[k],&xy[k]);
            for (int k=0;k<4;++k)
                drawLine(xy[k].x,xy[k].y,
                    xy[(k+1)%4].x,xy[(k+1)%4].y,neon);
        }
    }
}

void Map::r40RememberHudRect(int, int, int, int) { }


// RC69: Render ALL custom Map HUD text with precisely the same native
// Text::draw / FONT_SMALL path used by the clearly readable upper-left
// melee action panel. The RC68 direct Font::getChar + ShaderCrop renderer
// incorrectly expanded/garbled bottom HUD glyphs on actual XPiratez assets.
// Convert only the *finished Text widget* into the requested foreground
// color. Text's original transparent pixels stay transparent, so the exact
// native character silhouettes are preserved and no background is painted.
// This alters no native button, action menu, game UI, or map object layout.
void Map::drawString(Sint16 x, Sint16 y, const char *text, Uint8 color)
{
    if (!text || !*text || !color) return;
    Mod *mod = _game ? _game->getMod() : nullptr;
    Font *small = mod ? mod->getFont("FONT_SMALL") : nullptr;
    Font *big = mod ? mod->getFont("FONT_BIG") : nullptr;
    if (!small || !big || !_game->getLanguage())
    {
        Surface::drawString(x,y,text,color);
        return;
    }
    // The Map itself is 320x200 in the native game, even when enlarged by
    // the Windows display scaler. Keep all intermediate operations native.
    const int width = std::min(getWidth(),getWidth()-static_cast<int>(x));
    const int height = std::min(getHeight(),
        std::min(getHeight()-static_cast<int>(y),
            small->getHeight() + small->getSpacing() + 3));
    if (width <= 0 || height <= 0) return;
    Text glyphs(width,height,0,0);
    glyphs.initText(big,small,_game->getLanguage());
    glyphs.setSmall();
    glyphs.setWordWrap(false);
    glyphs.setPalette(getPalette());
    // Reuse the validated melee popup's real text palette group.
    const Element *nativeColors = mod->getInterface("battlescape")
        ->getElement("actionMenu");
    glyphs.setColor(nativeColors->color);
    glyphs.setHighContrast(true);
    glyphs.setText(text);
    glyphs.draw();
    // RC70: SDL_BlitSurface preserves the native Text renderer's *actual*
    // shaded glyph palette indexes and zero-index transparency. NEVER
    // convert every nonzero pixel to one white HUD color: the actual small
    // font contains opaque dark outline/background pixels in each cell,
    // and flattening those was the RC68/RC69 white-block corruption.
    // This is the same compositor used for other on-screen Text widgets.
    glyphs.setX(x);
    glyphs.setY(y);
    glyphs.blit(getSurface());
}

// RC81: draw red/blue glyphs with the same validated native FONT_SMALL,
// but choose the actual red or blue pixels across the ENTIRE 256-color
// battle palette. RC80 picked a 16-color GROUP, which can be purple even
// if its nearest nominal RGB target was blue. Palette group selection is
// not an RGB color conversion! Preserve the Text shader's darkest outline
// and remap only its four visible, nonzero highlight shades.
void Map::r80DrawHudTint(int x, int y, const std::string &fragment,
                         bool increasesDamage)
{
    if (fragment.empty() || x >= getWidth() || y >= getHeight() ||
        !_game || !_game->getMod() || !_game->getLanguage())
        return;
    const SDL_Color *palette = getPalette();
    if (!palette) return;
    Mod *mod = _game->getMod();
    Font *small = mod->getFont("FONT_SMALL");
    Font *big = mod->getFont("FONT_BIG");
    const Element *nativeColors = mod->getInterface("battlescape")
        ->getElement("actionMenu");
    if (!small || !big || !nativeColors) return;

    const int width = std::max(0, std::min(
        getWidth() - x, r68SmallHudWidth(fragment) + 3));
    const int height = std::max(0, std::min(
        getHeight() - y, small->getHeight() + small->getSpacing() + 3));
    if (width <= 0 || height <= 0) return;

    // Draw the native shaded bitmap first, with its existing outlines.
    // With high contrast, font shade indices 1..5 become
    // nativeBase + {3,6,9,12,15} in Text::PaletteShift.
    const int nativeBase = static_cast<int>(nativeColors->color);
    Text label(width, height, 0, 0);
    label.initText(big, small, _game->getLanguage());
    label.setSmall();
    label.setWordWrap(false);
    label.setPalette(palette);
    label.setColor(static_cast<Uint8>(nativeBase));
    label.setHighContrast(true);
    label.setText(fragment);
    label.draw();

    // Dark -> saturated -> bright shades, keeping legible antialiasing.
    // Constrain hue so the blue branch never selects violet/magenta and
    // the red branch never selects orange/yellow or violet.
    static const int redShades[5][3] = {
        {0,0,0}, {92,17,17}, {160,28,30},
        {220,37,40}, {255,86,81}
    };
    static const int blueShades[5][3] = {
        {0,0,0}, {21,37,95}, {30,71,162},
        {45,113,232}, {95,165,255}
    };
    // Only final damage direction controls the color, independent of
    // whether the target is friendly, hostile or neutral.
    const int (*target)[3] = increasesDamage ? redShades : blueShades;
    Uint8 shadeColor[6] = {0,0,0,0,0,0};
    // Shade 1 is the validated dark native outline; shade 2..5 are
    // independently mapped to exact palette entries, not whole groups.
    for (int shade = 2; shade <= 5; ++shade)
    {
        int chosen = -1;
        int best = 0x7fffffff;
        for (int index = 1; index < 256; ++index)
        {
            const SDL_Color &c = palette[index];
            // Low-saturation palette blocks have confused violet for
            // blue before; reject these regardless of Euclidean distance.
            if (increasesDamage)
            {
                if (int(c.r) < int(c.g) + 30 ||
                    int(c.r) < int(c.b) + 30 ||
                    int(c.b) > int(c.g) + 22) continue;
            }
            else
            {
                if (int(c.b) < int(c.r) + 40 ||
                    int(c.b) < int(c.g) + 18 ||
                    int(c.g) + 8 < int(c.r)) continue;
            }
            const int dr = int(c.r) - target[shade-1][0];
            const int dg = int(c.g) - target[shade-1][1];
            const int db = int(c.b) - target[shade-1][2];
            const int score = dr*dr + dg*dg + db*db;
            if (score < best) { best = score; chosen = index; }
        }
        // Extremely restricted mod palettes may lack this hue. In that
        // case use the closest available color, not invisible index 0.
        if (chosen < 0)
        {
            for (int index = 1; index < 256; ++index)
            {
                const SDL_Color &c = palette[index];
                const int dr = int(c.r) - target[shade-1][0];
                const int dg = int(c.g) - target[shade-1][1];
                const int db = int(c.b) - target[shade-1][2];
                const int score = dr*dr + dg*dg + db*db;
                if (score < best) { best = score; chosen = index; }
            }
        }
        shadeColor[shade] = static_cast<Uint8>(
            chosen < 1 ? nativeBase + 3*shade : chosen);
    }

    for (int py = 0; py < height; ++py)
    for (int px = 0; px < width; ++px)
    {
        const Uint8 src = label.getPixel(px,py);
        const int delta = int(src) - nativeBase;
        if (delta >= 6 && delta <= 15 && delta % 3 == 0)
            label.setPixel(px,py,shadeColor[delta/3]);
    }
    label.setX(x);
    label.setY(y);
    label.blit(getSurface());
}


// R67: replace the '=' separator in damage resistance lines with a
// tiny color swatch; leave ALL label glyphs in the native readable color.
// The swatch is drawn over a two-space reserve, never over a glyph.
void Map::r67DrawDamageSwatch(int x, int y, int damageId)
{
    if (x < 0 || y < 0 || x + 6 > getWidth() || y + 7 > getHeight())
        return;
    const SDL_Color *palette=getPalette();
    if (!palette) return;
    // Match the X-Piratez ResistType order used by the F8 reference table.
    static const int color[DAMAGE_TYPES][3] = {
        {225,225,225}, // CHARM
        {227,211,172}, // PIERC
        {255,137,60},  // FIRE
        {255,99,52},   // IMPACT
        {255,233,74},  // LASER
        {202,116,255}, // PLASMA
        {147,237,131}, // DAZE
        {243,193,111}, // CUT
        {139,250,76},  // CHEM
        {176,183,190}, // CHOKE
        {245,210,134}, // AE511
        {90,225,139},  // BIO
        {83,214,255},  // ELEC / sky blue
        {100,170,255}, // EMP
        {238,123,247}, // WARP
        {195,156,255}, // MIND
        {230,202,162}, // STAB16
        {255,132,69},  // HEAT
        {138,224,255}, // COLD
        {209,209,209}  // TYPE19
    };
    const int type=damageId>=0 && damageId<DAMAGE_TYPES ?
        damageId : 0;
    // Battle palettes are indexed, so map each requested RGB swatch to
    // the nearest real in-game color. Never select transparency index 0.
    int best=0x7fffffff;
    int selected=1;
    for (int c=1;c<256;++c)
    {
        const int dr=int(palette[c].r)-color[type][0];
        const int dg=int(palette[c].g)-color[type][1];
        const int db=int(palette[c].b)-color[type][2];
        const int score=dr*dr+dg*dg+db*db;
        if (score<best) {best=score;selected=c;}
    }
    // Five native pixels (~20 display pixels at the screenshot scale).
    drawRect(x+1,y+2,5,5,static_cast<Uint8>(selected));
}

int Map::r68SmallHudWidth(const std::string &text) const
{
    const Font *small = _game && _game->getMod()
        ? _game->getMod()->getFont("FONT_SMALL") : nullptr;
    if (!small) return static_cast<int>(text.size()) * 8;
    int width = 0;
    for (unsigned char c : text)
    {
        if (c == '\n') break;
        width += small->getCharSize(static_cast<UCode>(c)).w;
    }
    return width;
}

// R37: tactical readout controlled by F8 together with R22/R29.
// When enabled, show movement, attacks, kneel/stand. Landing has no
// separate TU charge: it is a follow-up check to a fall, not a player action.
// Known enemy threshold is visibility-gated; hidden enemies remain unknown.
void Map::r37DrawReactionHud()
{
    if (!_r22On || !_save || _save->getSide() != FACTION_PLAYER ||
        !_save->getTileEngine() || getWidth() < 180 ||
        std::min(getHeight(), _visibleMapHeight) < 56)
        return;
    BattleUnit *actor = _save->getSelectedUnit();
    if (!actor || actor->getFaction() != FACTION_PLAYER ||
        actor->isOut() || !actor->getTile())
        return;

    BattleAction *native = _save->getBattleGame()
        ? _save->getBattleGame()->getCurrentAction() : nullptr;
    BattleItem *active = native && native->actor == actor ? native->weapon : nullptr;
    Pathfinding *preview = _save->getPathfinding();
    const bool pathPending = preview && preview->isPathPreviewed() &&
        !preview->getPath().empty();
    const BattleActionMove pathMove = pathPending && native && native->actor == actor
        ? native->getMoveType() : BAM_NORMAL;
    // The first click in Confirm Fire Mode stores a TARGET waypoint, but
    // native->target still refers to the previous action until the second
    // click. Use that pinned waypoint, never cursor hover, for shot risks.
    const bool awaitingShotConfirmation = !pathPending &&
        Options::battleConfirmFireMode && _cursorType != CT_NONE &&
        native && native->actor == actor && native->targeting &&
        !native->sprayTargeting && !native->waypoints.empty() &&
        native->weapon && (native->type == BA_SNAPSHOT ||
        native->type == BA_AIMEDSHOT || native->type == BA_AUTOSHOT);
    const Position pendingShotTarget = awaitingShotConfirmation ?
        native->waypoints.front() : Position(-1, -1, -1);
    Tile *pendingShotTile = awaitingShotConfirmation ?
        _save->getTile(pendingShotTarget) : nullptr;
    BattleUnit *knownShotTarget = pendingShotTile ? pendingShotTile->getUnit() : nullptr;
    if (knownShotTarget && (!knownShotTarget->getVisible() ||
        knownShotTarget->getFaction() == FACTION_PLAYER ||
        knownShotTarget->isOut() || knownShotTarget->isOutThresholdExceed()))
        knownShotTarget = nullptr;
    unsigned long long shotSignature = 0;
    if (awaitingShotConfirmation)
    {
        shotSignature = 1469598103934665603ULL;
        auto add = [&](int x) {
            shotSignature ^= static_cast<unsigned>(x);
            shotSignature *= 1099511628211ULL;
        };
        add(pendingShotTarget.x);
        add(pendingShotTarget.y);
        add(pendingShotTarget.z);
        add(static_cast<int>(native->type));
        add(knownShotTarget ? knownShotTarget->getId() : -1);
    }
    // A newly clicked or changed path must refresh immediately, not wait
    // for the 450ms background refresh timer. The base HUD stays unchanged.
    unsigned long long pathSignature = 0;
    if (pathPending)
    {
        pathSignature = 1469598103934665603ULL;
        auto add = [&](int x) {
            pathSignature ^= static_cast<unsigned>(x);
            pathSignature *= 1099511628211ULL;
        };
        add(actor->getPosition().x);
        add(actor->getPosition().y);
        add(actor->getPosition().z);
        add(static_cast<int>(pathMove));
        add(static_cast<int>(preview->getPath().size()));
        for (int dir : preview->getPath()) add(dir);
    }
    const Uint32 now = SDL_GetTicks();
    if (_r37ReactionRisks.size() != 10 ||
        _r38PathSignature != pathSignature ||
        _r39TargetSignature != shotSignature ||
        _r37ReactionActor != actor ||
        _r37ReactionActorTU != actor->getTimeUnits() ||
        _r37ReactionSelectedWeapon != active ||
        now - _r37ReactionCheckedAt >= 450U)
    {
        _r37ReactionActor = actor;
        _r37ReactionActorTU = actor->getTimeUnits();
        _r37ReactionSelectedWeapon = active;
        _r37ReactionCheckedAt = now;
        _r38PathSignature = pathSignature;
        _r38PathStepCount = 0;
        _r38PathFirstTU = -1;
        _r38PathFirstRisk = -1;
        _r38PathTotalTU = -1;
        _r38PathMaxRisk = -1;
        _r38PathMaxStep = 0;
        _r38PathMode = static_cast<int>(pathMove);
        _r39TargetSignature = shotSignature;
        _r39ShotTU = -1;
        _r39ShotRiskNow = -1;
        _r39ShotRiskIfHit = -1;

        const BattleActionType types[10] = {
            BA_WALK, BA_WALK, BA_WALK, BA_SNAPSHOT, BA_AIMEDSHOT,
            BA_AUTOSHOT, BA_THROW, BA_HIT, BA_LAUNCH, BA_KNEEL
        };
        std::vector<BattleAction> actions(10);
        std::vector<double> postScores(10, -1.0);
        _r37ReactionTUCosts.assign(10, -1);

        // Baseline rows always describe the actor's current facing direction.
        // A first-click path preview has a separate readout below and must
        // never silently change WLK/RUN/SNK costs or risk in this panel.
        Pathfinding *path = _save->getPathfinding();
        const int stepDir = actor->getDirection();

        Position target(-1, -1, -1);
        if (awaitingShotConfirmation && pendingShotTile)
            target = pendingShotTarget;
        else if (native && native->actor == actor && native->targeting &&
            _save->getTile(native->target))
            target = native->target;
        else if (_cursorType != CT_NONE)
        {
            Position hover;
            getSelectorPosition(&hover);
            Tile *hoverTile = _save->getTile(hover);
            if (hoverTile && hoverTile->isDiscovered(O_FLOOR))
                target = hover;
        }

        auto usable = [&](BattleItem *weapon, BattleActionType mode) {
            if (!weapon || !weapon->getRules() ||
                !_save->canUseWeapon(weapon, actor, false, mode))
                return false;
            if (mode == BA_THROW)
            {
                const RuleItem *rule = weapon->getRules();
                if (rule->isFixed() || rule->getCostThrow().Time <= 0)
                    return false;
            }
            else if (!weapon->getActionConf(mode) ||
                     !weapon->getAmmoForAction(mode))
                return false;
            BattleActionCost cost(mode, actor, weapon);
            return cost.Time > 0 && cost.haveTU();
        };

        auto findWeapon = [&](BattleActionType mode) -> BattleItem* {
            // Do not treat the contents of a backpack as ready-to-fire:
            // select an actual held/active weapon or built-in melee weapon.
            BattleItem *candidates[] = {
                active,
                mode == BA_HIT ? actor->getUtilityWeapon(BT_MELEE) : nullptr,
                actor->getMainHandWeapon(false),
                actor->getRightHandWeapon(),
                actor->getLeftHandWeapon(),
                mode == BA_HIT ? actor->getSpecialWeapon(BT_MELEE) : nullptr
            };
            for (BattleItem *weapon : candidates)
                if (usable(weapon, mode)) return weapon;
            return nullptr;
        };

        const int maxTU = actor->getBaseStats()->tu;
        const int currentTU = actor->getTimeUnits();
        for (int i = 0; i < 10; ++i)
        {
            BattleAction &a = actions[i];
            a.type = types[i];
            a.actor = actor;
            a.target = target;
            a.run = (i == 1);
            a.sneak = (i == 2);
            if (native && native->actor == actor && native->type == a.type &&
                i > 2 && native->targeting)
                a.skillRules = native->skillRules;

            if (maxTU <= 0 || currentTU <= 0)
            {
                a.type = BA_NONE;
                continue;
            }
            int spent = 0;
            if (i < 3)
            {
                if ((i == 1 && !actor->getArmor()->allowsRunning(actor->isSmallUnit())) ||
                    (i == 2 && !actor->getArmor()->allowsSneaking(actor->isSmallUnit())))
                {
                    a.type = BA_NONE;
                    continue;
                }
                const BattleActionMove moveType =
                    i == 1 ? BAM_RUN : (i == 2 ? BAM_SNEAK : BAM_NORMAL);
                // When the player has chosen a path, cost its next tile
                // using native terrain, stance and move-mode rules.
                // Otherwise use the currently facing adjacent tile; an
                // invalid direction falls back to the 4-TU flat step.
                spent = Pathfinding::DEFAULT_MOVE_COST;
                if (path && stepDir >= 0 && stepDir <= Pathfinding::DIR_DOWN)
                {
                    const PathfindingStep cost = path->getTUCost(
                        actor->getPosition(), stepDir, actor, nullptr, moveType);
                    if (cost.cost.time > 0 &&
                        cost.cost.time < Pathfinding::INVALID_MOVE_COST)
                        spent = cost.cost.time;
                }
            }
            else if (i == 9)
            {
                // The kneel key toggles both kneeling and standing. The
                // native kneel() path spends the change cost BEFORE it calls
                // checkReactionFire() (BattlescapeGame.cpp).
                if (!actor->getArmor()->allowsKneeling(actor->getType() == "SOLDIER") ||
                    actor->isFloating())
                {
                    a.type = BA_NONE;
                    continue;
                }
                spent = actor->getKneelChangeCost();
            }
            else
            {
                a.weapon = findWeapon(a.type);
                if (!a.weapon)
                {
                    a.type = BA_NONE;
                    continue;
                }
                const BattleActionCost cost(a.type, actor, a.weapon);
                spent = cost.Time;
            }
            if (spent <= 0 || spent > currentTU)
            {
                a.type = BA_NONE;
                continue;
            }
            _r37ReactionTUCosts[i] = spent;
            postScores[i] =
                static_cast<double>(actor->getBaseStats()->reactions) *
                static_cast<double>(currentTU - spent) /
                static_cast<double>(maxTU);
        }
        _r37ReactionRisks = _save->getTileEngine()->
            r37VisibleReactionChances(actor, actions, postScores,
                                      &_r37VisibleEnemyThreshold);

        // R39: conditional reaction AFTER a confirmed shot hit its currently
        // visible, alive target. A successful hit records wasHitBy; unlike
        // the normal branch, it bypasses that enemy's initial facing sector.
        // No damage, turn, RNG advancement or actor position is simulated.
        // The percentage is CONDITIONAL on hit + enemy surviving the burst;
        // it is NOT a made-up shot-hit probability.
        if (awaitingShotConfirmation && knownShotTarget && maxTU > 0 &&
            native && native->weapon &&
            _save->canUseWeapon(native->weapon, actor, false, native->type) &&
            native->weapon->getAmmoForAction(native->type))
        {
            BattleAction selected = *native;
            selected.actor = actor;
            selected.target = pendingShotTarget;
            const BattleActionCost cost(selected.type, actor, selected.weapon);
            if (cost.Time > 0 && cost.Time <= currentTU)
            {
                _r39ShotTU = cost.Time;
                const double postScore = double(actor->getBaseStats()->reactions) *
                    double(currentTU - cost.Time) / double(maxTU);
                const std::vector<BattleAction> oneAction(1, selected);
                const std::vector<double> oneScore(1, postScore);
                const std::vector<int> before = _save->getTileEngine()->
                    r37VisibleReactionChances(actor, oneAction, oneScore);
                const std::vector<int> afterHit = _save->getTileEngine()->
                    r37VisibleReactionChances(actor, oneAction, oneScore,
                                               nullptr, knownShotTarget);
                if (!before.empty()) _r39ShotRiskNow = before.front();
                if (!afterHit.empty()) _r39ShotRiskIfHit = afterHit.front();
            }
        }

        if (pathPending && path && path->getStartDirection() >= 0)
        {
            std::vector<Position> positions;
            std::vector<int> spentTU;
            Position pos = actor->getPosition();
            int totalTU = actor->isKneeled() ? actor->getKneelUpCost() : 0;
            int energy = actor->getEnergy();
            const int firstDir = path->getStartDirection();
            if (actor->getArmor()->getTurnBeforeFirstStep() &&
                firstDir != actor->getDirection() && firstDir < Pathfinding::DIR_UP)
            {
                int turns = std::abs(actor->getDirection() - firstDir);
                if (turns > 4) turns = 8 - turns;
                totalTU += turns * actor->getTurnCost();
            }
            for (auto it = path->getPath().rbegin();
                 it != path->getPath().rend() && positions.size() < 64U; ++it)
            {
                const PathfindingStep step = path->getTUCost(
                    pos, *it, actor, nullptr, pathMove);
                if (step.cost.time < 0 ||
                    step.cost.time >= Pathfinding::INVALID_MOVE_COST ||
                    !_save->getTile(step.pos))
                    break;
                if (positions.empty()) _r38PathFirstTU = step.cost.time;
                totalTU += step.cost.time;
                energy -= step.cost.energy;
                if (totalTU > currentTU || energy < 0) break;
                pos = step.pos;
                positions.push_back(pos);
                spentTU.push_back(totalTU);
            }
            if (!positions.empty())
            {
                const std::vector<int> chances = _save->getTileEngine()->
                    r38VisiblePathReactionChances(actor, positions, spentTU, pathMove);
                _r38PathStepCount = static_cast<int>(positions.size());
                _r38PathTotalTU = spentTU.back();
                _r38PathFirstRisk = chances.front();
                for (size_t i = 0; i < chances.size(); ++i)
                {
                    if (chances[i] > _r38PathMaxRisk)
                    {
                        _r38PathMaxRisk = chances[i];
                        _r38PathMaxStep = static_cast<int>(i + 1);
                    }
                }
            }
        }
    }

    const SDL_Color *palette = getPalette();
    if (!palette) return;
    int dark = 1, light = 15;
    int minLum = 2147483647, maxLum = -1;
    for (int c = 1; c < 256; ++c)
    {
        const int lum = 2126 * int(palette[c].r) +
                        7152 * int(palette[c].g) + 722 * int(palette[c].b);
        if (lum < minLum) { minLum = lum; dark = c; }
        if (lum > maxLum) { maxLum = lum; light = c; }
    }
    // F8-only, compact two-column readout. NEXT is ADDITIONAL TU to spend
    // to reach the visible enemy's reaction-score threshold.
    // O = 0%, X = 100%, 1-99% = intermediate scripted chance;
    // -- = unavailable. This uses only known enemies, never hidden ones.
    const char *names[10] = {
        "WLK", "RUN", "SNK", "SNP", "AIM", "AUT",
        "THR", "MEL", "LCH", actor->isKneeled() ? "STD" : "KNL"
    };
    // RC77: only movement, throw, melee, launch and stance stay in the
    // lower tactical HUD. SNP/AIM/AUT are shown in the top HUD instead.
    std::string rows[9];
    int rowCount = 5;
    {
        std::ostringstream s;
        s << "NEXT ";
        if (_r37VisibleEnemyThreshold < 0.0)
            s << "--";
        else
        {
            const double ownScore = actor->getReactionScore();
            const int baseReactions = actor->getBaseStats()->reactions;
            const int maxTU = actor->getBaseStats()->tu;
            const int needed = ownScore <= _r37VisibleEnemyThreshold ? 0 :
                baseReactions > 0 && maxTU > 0 ?
                static_cast<int>(std::ceil(
                    (ownScore - _r37VisibleEnemyThreshold) * maxTU /
                    double(baseReactions) - 1e-9)) : 0;
            s << needed << "TU";
        }
        rows[0] = s.str();
    }
    std::string actionText[10];
    for (int i = 0; i < 10; ++i)
    {
        std::ostringstream s;
        const int risk = i < int(_r37ReactionRisks.size()) ?
            _r37ReactionRisks[i] : -1;
        const int tuCost = i < int(_r37ReactionTUCosts.size()) ?
            _r37ReactionTUCosts[i] : -1;
        s << std::left << std::setw(4) << names[i] << std::right;
        if (risk < 0 || tuCost < 0)
            s << std::setw(3) << "--" << ' ' << std::setw(4) << "--";
        else
        {
            s << std::setw(3) << tuCost << ' ';
            if (risk == 0)
                s << std::setw(4) << 'O';
            else if (risk == 100)
                s << std::setw(4) << 'X';
            else
                s << std::setw(3) << risk << '%';
        }
        actionText[i] = s.str();
    }
    const int lowerActionIndices[8] = {0,1, 2,6, 7,8, 9,-1};
    for (int line = 0; line < 4; ++line)
    {
        const int first = lowerActionIndices[line * 2];
        const int second = lowerActionIndices[line * 2 + 1];
        rows[line + 1] = actionText[first] +
            (second >= 0 ? "   " + actionText[second] : "");
    }

    auto riskLabel = [](int risk) {
        if (risk < 0) return std::string("--");
        if (risk == 0) return std::string("O");
        if (risk == 100) return std::string("X");
        return std::to_string(risk) + "%";
    };
    // The first click fixes the target and reveals the risk conditional on
    // the known target surviving a direct hit. NOW is the existing state;
    // HIT is the native wasHitBy reaction override AFTER actual damage.
    if (awaitingShotConfirmation && knownShotTarget && _r39ShotTU > 0)
    {
        // Keep conditional reaction information, but omit redundant TGT
        // and the shot-mode label: all three modes now live at the top.
        std::ostringstream selected;
        selected << "NOW " << riskLabel(_r39ShotRiskNow) << " HIT+LIVE "
                 << riskLabel(_r39ShotRiskIfHit);
        rows[rowCount++] = selected.str();
    }
    // After the FIRST movement click, show only the selected path.
    // P1 is its next tile; MAX is the maximum ONE-STEP fire probability.
    if (pathPending)
    {
        const char *modeName = pathMove == BAM_RUN ? "RUN" :
            pathMove == BAM_SNEAK ? "SNK" :
            pathMove == BAM_STRAFE ? "STR" : "WLK";
        std::ostringstream first;
        first << "P1  " << std::left << std::setw(4) << modeName
              << std::right << std::setw(3) << (_r38PathFirstTU >= 0 ?
                  std::to_string(_r38PathFirstTU) : std::string("--"))
              << ' ' << std::setw(4) << riskLabel(_r38PathFirstRisk);
        rows[rowCount++] = first.str();
        if (_r38PathStepCount > 1)
        {
            const bool complete = static_cast<size_t>(_r38PathStepCount) ==
                preview->getPath().size();
            std::ostringstream entire;
            entire << (complete ? "PTH " : "RCH ")
                   << _r38PathTotalTU << "TU MAX "
                   << riskLabel(_r38PathMaxRisk) << " @" << _r38PathMaxStep;
            rows[rowCount++] = entire.str();
        }
    }
    int maxRowWidth = 0;
    for (int i = 0; i < rowCount; ++i)
        maxRowWidth = std::max(maxRowWidth,r68SmallHudWidth(rows[i]));
    const int panelWidth = std::min(getWidth(),5 + maxRowWidth);
    const int baseRows = 5;
    const int bottom = std::min(getHeight(), _visibleMapHeight);
    const int baseHeight = baseRows * 10 + 3;
    const int baseY = std::max(0, bottom - baseHeight);
    // FIXED native rows; their Y never changes when a preview appears.
    drawRect(0, baseY, panelWidth, baseHeight, static_cast<Uint8>(dark));
    for (int i = 0; i < baseRows; ++i)
        drawString(2, baseY + 2 + i * 10, rows[i].c_str(),
            static_cast<Uint8>(light));
    // Additional information grows upwards into unused map space.
    const int extraRows = rowCount - baseRows;
    if (extraRows > 0 && baseY > 0)
    {
        const int extraHeight = std::min(baseY, extraRows * 10);
        const int extraY = baseY - extraHeight;
        drawRect(0, extraY, panelWidth, extraHeight, static_cast<Uint8>(dark));
        for (int i = 0; i < extraRows; ++i)
        {
            const int textY = extraY + 1 + i * 10;
            if (textY + 9 <= baseY)
                drawString(2, textY, rows[baseRows + i].c_str(),
                    static_cast<Uint8>(light));
        }
    }
    // RC78: no fixed SNP/AIM/AUT strip on the second top row.
    // Only the live selected action mode is drawn by r22DrawContrastHud()
    // in the FIRST top row.
}

// R32: the hypothetical shooter stands on the actual raised voxel floor,
// not at the lower tile's nominal z=0. Match native stair-top adjustment
// without calculating a path or altering a live unit's position.
Position Map::r32VirtualStandPosition(const Position &hover, const BattleUnit *actor) const
{
    (void)actor;
    if (!_save || !_save->getTile(hover)) return hover;
    Position pos = hover;
    // Partial (-8/-16) stairs remain on the SAME map level. Their
    // height belongs to the floor's voxel Z, never a forced Z+1 tile.
    while (pos.z + 1 < _save->getMapSizeZ())
    {
        Tile *tile = _save->getTile(pos);
        if (!tile || tile->getTerrainLevel() != -24) break;
        Tile *top = _save->getTile(Position(pos.x,pos.y,pos.z+1));
        if (!top || top->hasNoFloor(_save)) break;
        ++pos.z;
    }
    return pos;
}

// R32: the engine's native getOriginVoxel clamps tall occupants to a lower
// storey when a roof exists. This is correct for REAL actors but wrong for
// a hypothetical actor previewed on a -8/-16 raised stair tile. Keep the
// native direction/XY offset and raise only the hypothetical voxel origin.
Position Map::r32VirtualMuzzle(BattleAction &action, Tile *sourceTile,
    int stanceDelta, bool hypothetical) const
{
    Position muzzle = _save->getTileEngine()->getOriginVoxel(action,sourceTile);
    muzzle.z += stanceDelta;
    if (hypothetical && sourceTile && action.actor &&
        sourceTile->getTerrainLevel() < 0)
    {
        const Position source = sourceTile->getPosition();
        const int desiredZ = source.z * 24 - sourceTile->getTerrainLevel() +
            action.actor->getHeight() + action.actor->getFloatHeight() +
            stanceDelta - (action.type == BA_THROW ? 3 : 4);
        muzzle.z = static_cast<Sint16>(std::max<int>(muzzle.z, desiredZ));
    }
    return muzzle;
}

// Explicit census. This intentionally includes unseen enemies because it is
// only requested by Shift+F8; it never alters visibility or tactical AI.
// FIGHT includes INTENT (units still able to fight despite a past surrender wish).
// SURRENDERING only counts capturable enemies already flagged as surrendering
// by the battle engine. INTENT requires a surrender wish without an active
// surrender flag, and remains a subset of FIGHT rather than a separate bucket.
void Map::r32DrawEnemyCounts()
{
    if (!_save || getHeight() < 30 || getWidth() < 110) return;
    int fighting = 0, intent = 0, surrendered = 0, knockedOut = 0;
    int remaining = 0, approximateStart = 0;
    std::vector<std::string> activeEnemyCoordinates;
    for (const BattleUnit *unit : *_save->getUnits())
    {
        if (!unit || unit->getOriginalFaction() != FACTION_HOSTILE)
            continue;
        if (!unit->isIgnored()) ++approximateStart;
        if (unit->isIgnored() || unit->getStatus() == STATUS_DEAD)
            continue;
        ++remaining;
        if (unit->getStatus() == STATUS_UNCONSCIOUS || unit->isOutThresholdExceed())
        {
            ++knockedOut;
            continue;
        }
        // Mirror tallyUnits() without invoking isSurrendering(bu), which would
        // change the tactical state merely because the player opened the HUD.
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
            std::ostringstream coord;
            coord << "XYZ " << pos.x << "," << pos.y << "," << pos.z;
            activeEnemyCoordinates.push_back(coord.str());
            if (unit->wantsToSurrender() && !unit->isSurrendering())
                ++intent;
        }
    }
    const int initial = _save->getR32InitialHostiles();
    const SDL_Color *pal = getPalette();
    if (!pal) return;
    int darkest = 1, brightest = 15, darkestLum = 2147483647, brightestLum = -1;
    for (int i = 1; i < 256; ++i)
    {
        const int lum = 2126*int(pal[i].r) + 7152*int(pal[i].g) + 722*int(pal[i].b);
        if (lum < darkestLum) { darkestLum = lum; darkest = i; }
        if (lum > brightestLum) { brightestLum = lum; brightest = i; }
    }
    // Six figures in two compact columns (three text rows). INTENT is an
    // informational subset of FIGHT, so it is never added to TOTAL.
    std::ostringstream fightText, intentText, surrenderText, koText, totalText, startText;
    fightText << "FIGHT " << fighting;
    intentText << "INTENT " << intent;
    surrenderText << "SURRENDERING " << surrendered;
    koText << "KO " << knockedOut;
    totalText << "TOTAL " << remaining;
    startText << "START ";
    if (initial >= 0) startText << initial;
    else startText << '~' << approximateStart; // No precise starting count in older saves.
    const std::string fight = fightText.str(), intention = intentText.str();
    const std::string surrender = surrenderText.str(), ko = koText.str();
    const std::string total = totalText.str(), start = startText.str();
    // SDL bitmap characters are 8 pixels wide. Size each column to the data,
    // so large counts never spill into the adjoining column or off screen.
    const int leftWidth = 6 + std::max(r68SmallHudWidth(total),
        std::max(r68SmallHudWidth(fight),r68SmallHudWidth(intention)));
    const int rightWidth = 4 + std::max(r68SmallHudWidth(start),
        std::max(r68SmallHudWidth(surrender),r68SmallHudWidth(ko)));
    const int panelWidth = std::min(getWidth(), leftWidth + rightWidth);
    // Reveal exact locations only after at most two active hostiles remain.
    // KO/dead enemies are deliberately excluded; keep the existing totals intact.
    const bool showCoordinates = fighting > 0 && fighting <= 2;
    const int panelHeight = 30 + (showCoordinates ? 9 * fighting : 0);
    const int x = std::max(0, getWidth() - panelWidth);
    // Previous row began at y=32. Move down two 11px text lines.
    // When the expanded 20-type resistance table is visible, put counts
    // after its final hint row (y=104..113) rather than painting over it.
    const int expandedTableBottom = 27 + ((DAMAGE_TYPES + 2) / 3) * 11 + 10;
    const int preferredY = (_r22On && _r30FullResists) ? expandedTableBottom : 54;
    const int y = std::min(preferredY, std::max(0, _visibleMapHeight - panelHeight));
    const int secondX = x + leftWidth;
    drawRect(x, y, panelWidth, panelHeight, Uint8(darkest));
    drawString(x+2, y+1, fight.c_str(), Uint8(brightest));
    drawString(secondX, y+1, surrender.c_str(), Uint8(brightest));
    drawString(x+2, y+10, intention.c_str(), Uint8(brightest));
    drawString(secondX, y+10, ko.c_str(), Uint8(brightest));
    drawString(x+2, y+19, total.c_str(), Uint8(brightest));
    drawString(secondX, y+19, start.c_str(), Uint8(brightest));
    if (showCoordinates)
    {
        for (size_t i = 0; i < activeEnemyCoordinates.size(); ++i)
            drawString(x+2, y+28+int(i)*9, activeEnemyCoordinates[i].c_str(), Uint8(brightest));
    }
}

// LOSLOF_R22_RECON_PREVIEW.
// This preview is not a replacement for the R21 ballistics, pellet or risk engine.
// R22 HUD: contrast backplate, 5-letter stance, fixed 42px stats origin.
// Only draws; leaves targeting state and input untouched.
void Map::r22DrawContrastHud(const char *stance, bool simulated,
                             const std::string &tail)
{
    const SDL_Color *palette=getPalette();
    if (!palette) return;
    Uint8 dark=1, bright=15, accent=15;
    int lowest=2147483647, highest=-1, warmest=-1;
    // Palette index zero can be transparent; choose from currently drawable
    // colors rather than assuming palette slots 73/160 are always visible.
    for (int i=1;i<256;++i)
    {
        const SDL_Color &rgb=palette[i];
        const int lum=2126*int(rgb.r)+7152*int(rgb.g)+722*int(rgb.b);
        if (lum<lowest) { lowest=lum; dark=static_cast<Uint8>(i); }
        if (lum>highest) { highest=lum; bright=static_cast<Uint8>(i); }
        if (int(rgb.r)>int(rgb.b)+35 && int(rgb.g)>int(rgb.b)+20
            && rgb.r>110 && rgb.g>90 && lum>warmest)
        {
            warmest=lum;
            accent=static_cast<Uint8>(i);
        }
    }
    if (warmest<highest*65/100) accent=bright;
    // RC78: add ONLY the currently active native shot mode to the first
    // line, immediately after stance. No permanent three-mode table.
    // The original accuracy, hit/block/miss and n256 tail is preserved.
    const BattleAction *current = (_save && _save->getBattleGame())
        ? _save->getBattleGame()->getCurrentAction() : nullptr;
    const char *modeName = nullptr;
    if (current && current->targeting && _cursorType != CT_NONE &&
        current->actor == _save->getSelectedUnit())
    {
        switch (current->type)
        {
            case BA_SNAPSHOT: modeName = "SNP"; break;
            case BA_AIMEDSHOT: modeName = "AIM"; break;
            case BA_AUTOSHOT: modeName = "AUT"; break;
            case BA_THROW: modeName = "THR"; break;
            default: break;
        }
    }
    std::string firstLine = modeName ? std::string(" ") + modeName + tail : tail;
    // The top-right VIEW label owns the last 82 native pixels.
    const int maxWidth = std::max(0, getWidth() - 82);
    const int maxTextWidth = std::max(0, maxWidth - 44);
    while (!firstLine.empty() && r68SmallHudWidth(firstLine) > maxTextWidth)
        firstLine.pop_back();
    const int width = std::min(maxWidth, 44 + r68SmallHudWidth(firstLine));
    if (width < 2) return;
    drawRect(0,0,width,12,dark);
    drawLine(0,11,width-1,11,bright);
    // A tiny fixed bar also marks SIM when the palette lacks a distinct hue.
    if (simulated) drawRect(0,1,2,10,accent);
    drawString(2,2,stance,simulated ? accent : bright);
    drawString(42,2,firstLine.c_str(),bright);
    r40RememberHudRect(0, 0, width, 12);
}

/**
 * RC67: pre-fire CQC redirection risk on ordinary gunshots.
 * ProjectileFlyBState executes this check BEFORE trajectory calculation.
 * We replay its visible-neighbor eligibility, sneak-up exclusion and native
 * BA_CQB melee scripts. Results are probabilities, not actual live RNG rolls.
 */
void Map::r67DrawCqcHud(BattleUnit *actor, BattleAction *action,
                         const Position &source)
{
    if (!_r22On || !_save || !_game || !actor || !action ||
        action->actor != actor || !action->weapon ||
        !action->targeting || _save->getSide() != FACTION_PLAYER)
        return;
    if (action->type != BA_SNAPSHOT && action->type != BA_AIMEDSHOT &&
        action->type != BA_AUTOSHOT)
        return;

    const Mod *mod = _game->getMod();
    if (!mod || !_save->getTileEngine())
        return;
    TileEngine *engine = _save->getTileEngine();
    const int tuCost = mod->getCloseQuartersTuCostGlobal();
    const int energyCost = mod->getCloseQuartersEnergyCostGlobal();
    const int sneakChance = mod->getCloseQuartersSneakUpGlobal();
    // RC68: stay completely silent when CQC cannot apply. This is a
    // contextual warning, not a persistent status line. A virtual origin
    // cannot be checked against the unit's real adjacency, so omit it too.
    if (!mod->getEnableCloseQuartersCombat() ||
        actor->getTurretType() != -1 ||
        actor->getArmor()->getIgnoresMeleeThreat() ||
        source != actor->getPosition())
        return;
    std::string info;
    {
        static const int neighbors[8][2] = {
            {0,-1},{1,-1},{1,0},{1,1},
            {0,1},{-1,1},{-1,0},{-1,-1}
        };
        std::vector<BattleUnit*> knownThreats;
        uint64_t signature = 1469598103934665603ULL;
        auto hash = [&](uint64_t value) {
            signature ^= value;
            signature *= 1099511628211ULL;
        };
        hash(reinterpret_cast<uintptr_t>(_save));
        hash(reinterpret_cast<uintptr_t>(actor));
        hash(reinterpret_cast<uintptr_t>(action->weapon));
        hash(static_cast<unsigned>(actor->getId()));
        hash(static_cast<unsigned>(source.x));
        hash(static_cast<unsigned>(source.y));
        hash(static_cast<unsigned>(source.z));
        hash(static_cast<unsigned>(actor->getDirection()));
        hash(static_cast<unsigned>(actor->getTurnsSinceSpotted()));
        hash(static_cast<unsigned>(actor->getHealth()));
        hash(static_cast<unsigned>(tuCost));
        hash(static_cast<unsigned>(energyCost));
        hash(static_cast<unsigned>(sneakChance));
        for (const auto &neighbor : neighbors)
        {
            const Position check(source.x+neighbor[0],
                                 source.y+neighbor[1],source.z);
            if (!_save->getTile(check))
                continue;
            // Native selectUnit uses the clicked footprint for 2x2s.
            BattleUnit *threat = _save->selectUnit(check);
            // Visibility gate is *only* for HUD information. An unseen
            // attacker may still cause native CQB; this is known risk only.
            if (!threat || !threat->getVisible() ||
                threat == actor || threat->getFaction() == actor->getFaction())
                continue;
            if (actor->getFaction() == FACTION_PLAYER &&
                threat->getFaction() == FACTION_NEUTRAL)
                continue;
            if (!threat->getArmor()->getCreatesMeleeThreat() ||
                threat->getTimeUnits() < tuCost ||
                threat->getEnergy() < energyCost)
                continue;
            const int checkDirection = engine->getDirectionTo(
                check, actor->getPosition());
            if (!engine->validMeleeRange(threat, actor, checkDirection))
                continue;
            // Intentionally no de-duplication: native builds a list from
            // all eight adjacent cells, even for multi-tile occupiers.
            knownThreats.push_back(threat);
            hash(static_cast<unsigned>(threat->getId()));
            hash(reinterpret_cast<uintptr_t>(threat));
            hash(static_cast<unsigned>(threat->getTimeUnits()));
            hash(static_cast<unsigned>(threat->getEnergy()));
            hash(static_cast<unsigned>(threat->getDirection()));
            hash(static_cast<unsigned>(threat->getHealth()));
        }
        const int checks = static_cast<int>(knownThreats.size());
        // No confirmed qualifying neighbor: do not draw a CQC message.
        // Hidden enemies are still not tested or guaranteed absent.
        if (!checks) return;
        {
            struct CqcCache {
                uint64_t key = 0;
                const SavedBattleGame *battle = nullptr;
                Uint32 checkedAt = 0;
                unsigned redirected = 0;
                int baseAccuracy = 0;
            };
            static CqcCache cache;
            const Uint32 now = SDL_GetTicks();
            const unsigned trials = 256;
            if (cache.battle != _save || cache.key != signature ||
                now - cache.checkedAt > 850U)
            {
                struct RestoreCombatRng
                {
                    RNG::RandomState before;
                    RestoreCombatRng()
                        : before(RNG::globalRandomState()) {}
                    ~RestoreCombatRng()
                    {
                        RNG::globalRandomState() = before;
                    }
                } restore;
                const uint64_t seed = signature ^ 0x67c0babeaffea55aULL;
                RNG::globalRandomState() = RNG::RandomState(
                    seed ? seed : 1ULL);
                BattleActionAttack cqc = BattleActionAttack::GetBeforeShoot(
                    BA_CQB, actor, action->weapon);
                cache.baseAccuracy = BattleUnit::getFiringAccuracy(
                    cqc, mod);
                unsigned redirected = 0;
                for (unsigned n=0; n<trials; ++n)
                {
                    // Native first determines EVERY eligible contender
                    // including each RNG::percent(sneakChance) bypass.
                    std::vector<BattleUnit*> contenders;
                    for (BattleUnit *threat : knownThreats)
                    {
                        if (RNG::percent(sneakChance))
                        {
                            if (actor->getFaction() == FACTION_HOSTILE)
                            {
                                if (!threat->hasVisibleUnit(actor))
                                    continue;
                            }
                            else if (actor->getTurnsSinceSpotted() > 1)
                                continue;
                        }
                        contenders.push_back(threat);
                    }
                    // Only the first unsuccessful check redirects the shot.
                    for (BattleUnit *threat : contenders)
                    {
                        if (engine->meleeAttackCalculate(cqc,threat) <= 0)
                        {
                            ++redirected;
                            break;
                        }
                    }
                }
                cache.battle = _save;
                cache.key = signature;
                cache.checkedAt = now;
                cache.redirected = redirected;
            }
            std::ostringstream line;
            line << "CQC x" << checks
                 << " REDIRECT~" << (cache.redirected*100U+trials/2)/trials
                 << "% n" << trials << " A" << cache.baseAccuracy
                 << " TU" << tuCost << "/EN" << energyCost;
            info = line.str();
        }
    }

    if (info.empty()) return;
    const SDL_Color *palette = getPalette();
    if (!palette) return;
    auto paletteNearest = [&](int r,int g,int b) -> Uint8 {
        int index = 1, score = 0x7fffffff;
        for (int i=1;i<256;++i)
        {
            const int dr = int(palette[i].r)-r;
            const int dg = int(palette[i].g)-g;
            const int db = int(palette[i].b)-b;
            const int err = dr*dr + dg*dg + db*db;
            if (err < score) { score=err;index=i; }
        }
        return static_cast<Uint8>(index);
    };
    while (!info.empty() && r68SmallHudWidth(info)>getWidth()-4)
        info.pop_back();
    const int width = std::min(getWidth(),4+r68SmallHudWidth(info));
    if (width < 6) return;
    // R51: CQC previously occupied y=27..37, exactly the same row as
    // the visible target resistance (D:DAZE, R/AX) drawn later in
    // r22DrawOverlay(). That later panel overwrote the CQC warning.
    // The RC78 removal of the H GRID legend freed y=14..25, between
    // the fixed shot summary (y=0..11) and resistance (y=27..36).
    // Reserve this independent slot instead of moving or truncating the
    // detailed aim HUD (which begins at y=39).
    const int cqcRowY = 14;
    drawRect(0,cqcRowY,width,12,paletteNearest(10,11,17));
    drawString(2,cqcRowY+2,info.c_str(),paletteNearest(240,210,96));
    r40RememberHudRect(0,cqcRowY,width,12);
}

// RC58: native curved-projectile Monte Carlo. calculateThrow() follows the
// SAME parabola, accuracy RNG and collision code as ProjectileFlyBState.
// Each burst trial is read-only, from an isolated RNG stream. RC58.1:
// when a TARGET UNIT is visible, resolve the trajectory against actual
// terrain even when intermediate tiles are not yet revealed. This matches
// gameplay and prevents the common visible-target/hidden-ground FOG false
// negative. Do not reveal/count invisible units as known targets.
void Map::r58SampleArcOdds(BattleUnit *actor, BattleAction *native,
    const Position &source, const Position &target, const Position &muzzle,
    bool virtualKneeled)
{
    if (!_r22On || !_save || !_game || !actor || !native ||
        native->actor != actor || !native->targeting || !native->weapon ||
        !native->weapon->getArcingShot(native->type) ||
        native->sprayTargeting ||
        (native->type != BA_AIMEDSHOT && native->type != BA_SNAPSHOT &&
         native->type != BA_AUTOSHOT))
        return;

    // Mod callbacks used when obtaining ammo/accuracy can consume global
    // random values, even before the trajectory sampler starts.
    struct RestoreArcRng
    {
        RNG::RandomState saved;
        RestoreArcRng() : saved(RNG::globalRandomState()) {}
        ~RestoreArcRng() { RNG::globalRandomState() = saved; }
    } arcRngGuard;

    auto invalid = [this](const char *reason)
    {
        _r22StatsKey = 0;
        _r22SampleCount = 0;
        _r22HitSamples = _r22BlockedSamples = _r22MissSamples = 0;
        _r22RiskSamples = 0; // RC58: fog/unknown trial count for arcs
        _r22StatsText = reason ? reason : "";
    };
    Tile *targetTile = _save->getTile(target);
    Tile *sourceTile = _save->getTile(source);
    // A visible unit can stand on a floor tile which has never been
    // discovered, e.g. a distant/upper-level unit observed across void.
    // Do not make terrain visibility a prerequisite in that situation.
    BattleUnit *visibleTarget = targetTile ?
        targetTile->getOverlappingUnit(_save) : nullptr;
    if (visibleTarget && (!visibleTarget->getVisible() ||
                          visibleTarget->isOut()))
        visibleTarget = nullptr;
    const bool fullTerrainPreview = visibleTarget != nullptr;
    // Own occupied tile is known even if its floor is not tagged visible
    // (common above roof/empty-floor levels). Do not require visible
    // terrain under the shooter for a non-hypothetical source.
    const bool knownSource = sourceTile &&
        (source == actor->getPosition() || sourceTile->getVisible() ||
         sourceTile->isDiscovered(O_FLOOR));
    if (!knownSource || !targetTile ||
        (!fullTerrainPreview && !targetTile->getVisible() &&
         !targetTile->isDiscovered(O_FLOOR)))
    {
        invalid("ARC ODDS -- FOG");
        return;
    }
    BattleItem *weapon = native->weapon;
    BattleItem *ammo = weapon->getAmmoForAction(native->type,nullptr,nullptr);
    const RuleItemAction *config = weapon->getActionConf(native->type);
    if (!ammo || !ammo->getRules() || !config)
    {
        invalid("ARC ODDS -- NO AMMO");
        return;
    }
    const int shots = config->shots;
    const int consume = std::max(1, config->spendPerShot);
    if (shots < 1 || shots > 16 ||
        ammo->getRules()->getShotgunPellets() > 0)
    {
        invalid("ARC ODDS -- UNSUPPORTED");
        return;
    }
    if (ammo->getRules()->getClipSize() > 0 &&
        ammo->getAmmoQuantity() < shots * consume)
    {
        invalid("ARC ODDS -- LOW AMMO");
        return;
    }

    BattleAction action = *native;
    action.actor = actor;
    action.target = target;
    BattleActionAttack attack =
        BattleActionAttack::GetAferShoot(action, ammo);
    double accuracy = BattleUnit::getFiringAccuracy(attack,
        _game->getMod()) / 100.0;
    const bool changedKneel = virtualKneeled != actor->isKneeled();
    if (changedKneel)
    {
        const double factor = weapon->getRules()->getKneelBonus(
            _game->getMod()) / 100.0;
        if (factor > 0.0)
            accuracy *= virtualKneeled ? factor : 1.0/factor;
    }
    // A visible unit authorizes full-terrain arc collision preview. For
    // empty/unknown target tiles the previous fog-limited rule remains.
    BattleUnit *targetUnit = visibleTarget;
    const int dx=source.x-target.x, dy=source.y-target.y,
              dz=source.z-target.z;
    // RC62: The projectile's native curved trajectory determines whether
    // a shot actually launches. A separate tile-distance cutoff rejected
    // legitimate borderline shots (e.g. displayed D36/36).
    (void)dx; (void)dy; (void)dz;

    // Cache invariants. A changing tile/door is noticed by periodic
    // refresh, and the scenario key includes aim, source, ammo and stats.
    unsigned long long key=1469598103934665603ULL;
    auto mix=[&](unsigned long long part) {
        key^=part;
        key*=1099511628211ULL;
    };
    for (const int value : std::initializer_list<int>{int(actor->getId()),source.x,source.y,source.z,
         target.x,target.y,target.z,muzzle.x,muzzle.y,muzzle.z,
         int(native->type),int(virtualKneeled),int(shots),
         int(ammo->getAmmoQuantity()<shots*consume),int(_r43ArcProbeState)})
        mix(static_cast<unsigned>(value));
    mix(reinterpret_cast<uintptr_t>(weapon));
    mix(reinterpret_cast<uintptr_t>(ammo));
    mix(reinterpret_cast<uintptr_t>(targetUnit));
    mix(static_cast<unsigned long long>(accuracy*1000000.0));
    // RC79: physical battlefield changes invalidate this cached n256.
    mix(r79KnownBattlefieldSignature(_save));

    const Uint32 now = SDL_GetTicks();
    const bool scenarioChanged = key != _r22StatsKey;
    // No fixed 15-second expiration when the scene has not changed.
    if (scenarioChanged)
    {
        _r22StatsKey=key;
        _r22SampleCount=0;
        _r22HitSamples=_r22BlockedSamples=_r22MissSamples=0;
        _r22RiskSamples=0;
        _r68FriendSamples=0;
        _r22StatsBatchTick=0;
        _r22StatsUpdated=now;
        _r22StatsText.clear();
        _r22TileRisks.clear();
    }
    if (_r22SampleCount>=r22HudMaxTrials ||
        (!scenarioChanged &&
         now-_r22StatsBatchTick<r84HudBatchIntervalMs))
        return;

    _r22StatsBatchTick=now;
    // RC84: adapt completed BURSTS per repaint to observed native arc cost.
    // A burst still runs ALL shots, with the exact same OXCE trajectory.
    static double arcUsPerBurst = 0.0;
    if (scenarioChanged) arcUsPerBurst = 0.0;
    const unsigned shotsPerBurst = static_cast<unsigned>(shots);
    const unsigned warmup = std::max(1U, 8U / shotsPerBurst);
    const unsigned traceCap = std::max(1U, 128U / shotsPerBurst);
    const unsigned predicted = arcUsPerBurst > 1.0
        ? std::max(1U, static_cast<unsigned>(
              5500.0 / arcUsPerBurst)) : warmup;
    const unsigned samples=std::min(r22HudMaxTrials-_r22SampleCount,
        std::min(traceCap, predicted));
    const auto arcStarted=std::chrono::steady_clock::now();
    const auto timeBudget=std::chrono::milliseconds(r84HudWorkBudgetMs);
    unsigned processed = 0U;
    const unsigned long long seed=key^
        (0x9e3779b97f4a7c15ULL*(_r22SampleCount+1ULL));
    struct KeepNativeRng
    {
        RNG::RandomState previous;
        KeepNativeRng() : previous(RNG::globalRandomState()) {}
        ~KeepNativeRng() {RNG::globalRandomState()=previous;}
    } preserveCombatRng;
    RNG::RandomState privateRng(seed ? seed : 1ULL);
    // Some damage/weapon callbacks use the global RNG despite their
    // preview argument; ensure the full native state is restored.
    RNG::globalRandomState() = privateRng;

    const std::string &arcType = weapon->getRules()->getType();
    const bool flameJet = arcType.find("FLAMETHROWER") != std::string::npos ||
                          arcType.find("FLAMER") != std::string::npos;
    unsigned hits=0,blocks=0,misses=0,unknown=0, friends=0;
    for (unsigned s=0;s<samples;++s)
    {
        // Stop only BETWEEN complete native bursts, never mid-trajectory.
        if (processed &&
            std::chrono::steady_clock::now()-arcStarted>=timeBudget)
            break;
        bool anyHit=false,allBlocked=true,ambiguous=false,anyFriend=false;
        for(int j=1;j<=shots;++j)
        {
            BattleAction fired=action;
            fired.autoShotCounter=j;
            // TargetVoxel argument is ignored for calculateThrow; the
            // real target is fetched from BattleAction.target.
            Projectile projectile(_game->getMod(),_save,fired,
                source,muzzle,ammo);
            const int impact=projectile.calculateThrow(accuracy,
                &privateRng,&source,&muzzle,virtualKneeled ? 1 : 0);
            const std::vector<Position> &path =
                projectile.getTrajectoryForPreview();
            if (path.empty())
            {
                // Native shot did not launch. For a VISIBLE target the
                // whole terrain is intentionally considered, so this is
                // a failed path (blocked), not artificial FOG. Otherwise
                // preserve the old unknown classification.
                if (!fullTerrainPreview)
                    ambiguous=true;
                break;
            }
            bool pathKnown=true;
            for(const Position &voxel : path)
            {
                Tile *tile=_save->getTile(voxel.toTile());
                if (!tile)
                {
                    // An outbound miss can leave the map. Only known
                    // tiles are required inside the map.
                    continue;
                }
                // Visible target: terrain is treated as known for these
                // odds only. Keep unseen hostile units confidential.
                if (!fullTerrainPreview && !tile->getVisible())
                {
                    pathKnown=false;
                    break;
                }
                BattleUnit *unit=tile->getOverlappingUnit(_save);
                if (!fullTerrainPreview && unit && unit!=actor && !unit->getVisible() &&
                    unit->getFaction()!=actor->getFaction())
                {
                    pathKnown=false;
                    break;
                }
            }
            if (!pathKnown)
            {
                ambiguous=true;
                break;
            }
            const Position end=path.back().toTile();
            Tile *endTile=_save->getTile(end);
            BattleUnit *collided=endTile ?
                endTile->getOverlappingUnit(_save) : nullptr;
            if (impact==V_UNIT && collided && collided!=actor &&
                collided->getFaction()==actor->getFaction())
                anyFriend=true;
            // R68: empty ground needs a REACH event, not a collision.
            // A jet that passes through the aimed tile can ignite or
            // influence it without ending its trajectory there.
            bool reachedEmpty=false;
            if (!targetUnit)
                for (const Position &voxel : path)
                    if (voxel.toTile()==target) {
                        reachedEmpty=true;
                        break;
                    }
            const bool hit=targetUnit ?
                (impact==V_UNIT && collided==targetUnit) : reachedEmpty;
            if(hit)
            {
                anyHit=true;
                allBlocked=false;
                continue;
            }
            bool blocked=false;
            if (impact!=V_EMPTY && impact!=V_OUTOFBOUNDS)
            {
                const Position &last=path.back();
                const double ax=target.x*16+8-muzzle.x;
                const double ay=target.y*16+8-muzzle.y;
                const double norm=ax*ax+ay*ay;
                const double progress=norm>0 ?
                    ((last.x-muzzle.x)*ax+(last.y-muzzle.y)*ay)/norm :
                    1.0;
                // "Blocked" means a collision before reaching the
                // target XY; otherwise it is a stray impact/miss.
                blocked=progress<0.95;
            }
            if(!blocked)
                allBlocked=false;
        }
        if(ambiguous)
            ++unknown;
        else if(anyHit)
            ++hits;
        else if(allBlocked)
            ++blocks;
        else
            ++misses;
        if (!ambiguous && anyFriend) ++friends;
        ++processed;
    }
    // Measure ACTUAL native CPU work, not sleeps or UI rendering.
    if (processed)
    {
        const double spentUs=std::chrono::duration<double,std::micro>(
            std::chrono::steady_clock::now()-arcStarted).count();
        const double observed = spentUs / processed;
        arcUsPerBurst = arcUsPerBurst > 0.0
            ? 0.65*arcUsPerBurst + 0.35*observed : observed;
    }
    _r22HitSamples+=hits;
    _r22BlockedSamples+=blocks;
    _r22MissSamples+=misses;
    _r22RiskSamples+=unknown;
    _r68FriendSamples+=friends;
    _r22SampleCount+=processed;
    std::ostringstream text;
    const unsigned known=_r22SampleCount-_r22RiskSamples;
    if (known==0)
        text << (flameJet ? "JET T/E/F -- n" : "ARC H/B/M -- n")
             << _r22SampleCount << " U" << _r22RiskSamples;
    else if (flameJet)
    {
        text << "JET T~" << _r22HitSamples*100U/known
             << " E~" << _r22BlockedSamples*100U/known
             << " F~" << _r68FriendSamples*100U/known
             << " M~" << _r22MissSamples*100U/known
             << " n" << _r22SampleCount;
        if (_r22RiskSamples) text << " U" << _r22RiskSamples;
    }
    else
    {
        text << "ARC H~" << _r22HitSamples*100U/known
             << " B~" << _r22BlockedSamples*100U/known
             << " M~" << _r22MissSamples*100U/known
             << " n" << _r22SampleCount;
        text << " F~" << _r68FriendSamples*100U/known;
        if (_r22RiskSamples) text << " U" << _r22RiskSamples;
    }
    _r22StatsText=text.str();
    if (_r22SampleCount>=r22HudMaxTrials)
        _r22StatsUpdated=now;
}

// RC55: aimed-fire detail panel. The native action, RNG, terrain and unit
// state are never changed. All power numbers are PRE-ARMOR estimates,
// not predictions of a hit location or post-armor health damage.
void Map::r55DrawAimDetailHud(BattleUnit *actor, BattleAction *action,
                              const Position &source, const Position &target,
                              const Position &muzzle, const Position &aim,
                              bool confirmedTarget)
{
    if (!_r22On || !r59DetailedHud || _r30FullResists || !_save ||
        !actor || !action || action->actor != actor ||
        !action->targeting || !action->weapon ||
        (action->type != BA_SNAPSHOT && action->type != BA_AIMEDSHOT &&
         action->type != BA_AUTOSHOT) || action->sprayTargeting)
        return;
    const bool curved = action->weapon->getArcingShot(action->type);

    // Preserve the fixed R37 reaction grid (63px) at the bottom.
    // Native SDL bitmap glyphs are 8px high: five 8px rows fit in the
    // 39..79 gap on the standard 320x200, 56px-icon battlescape.
    const int top = 39;
    const int rowHeight = 8;
    const int bottom = std::min(getHeight(), _visibleMapHeight);
    const int rowCapacity = std::min(7,
        (bottom - 63 - top) / rowHeight);
    if (rowCapacity < 3 || getWidth() < 190) return;

    // Some mod-supplied stat expressions can call RNG. A HUD redraw must
    // never advance the live battle random stream, even indirectly.
    struct R55RestoreRng
    {
        RNG::RandomState saved;
        R55RestoreRng() : saved(RNG::globalRandomState()) {}
        ~R55RestoreRng() { RNG::globalRandomState() = saved; }
    } preserveRng;

    Tile *targetTile = _save->getTile(target);
    if (!targetTile) return;
    BattleUnit *victim = targetTile->getOverlappingUnit(_save);
    // A concealed occupier must look exactly like an empty discovered
    // tile; never expose the presence or stats of a hidden hostile.
    if (victim && !victim->getVisible()) victim = nullptr;
    // RC63: the ammo's known stats stay readable when the cursor is on
    // ground next to a visible enemy, even if that floor has no discovery
    // marker. Unknown geometry must not be mistaken for a verified hit.

    BattleItem *weapon = action->weapon;
    const RuleItem *weaponRule = weapon->getRules();
    BattleItem *ammo = weapon->getAmmoForAction(action->type, nullptr, nullptr);
    if (!weaponRule || !ammo || !ammo->getRules()) return;
    const RuleItem *ammoRule = ammo->getRules();
    const RuleItem *powerRule = weaponRule->getIgnoreAmmoPower() ?
        weaponRule : ammoRule;
    const RuleDamageType *damage = ammoRule->getDamageType();
    const RuleItemAction *configuration = weapon->getActionConf(action->type);
    if (!damage || !configuration) return;

    const int actionShots = std::max(1, configuration->shots);
    const int roundsPerShot = std::max(1, configuration->spendPerShot);
    const int roundsPerAction = actionShots * roundsPerShot;
    const BattleActionCost cost(action->type, actor, weapon);
    const int remainingTU = actor->getTimeUnits();
    const int remainingEnergy = actor->getEnergy();

    int dx = source.x - target.x;
    int dy = source.y - target.y;
    int dz = source.z - target.z;
    if (actor->isBigUnit())
    {
        if (source.x < target.x) ++dx;
        if (source.y < target.y) ++dy;
    }
    const int distanceSq = dx*dx + dy*dy + dz*dz;
    const int distance = static_cast<int>(
        std::ceil(std::sqrt(static_cast<double>(distanceSq))));
    int upperLimit = 0, lowerLimit = 0;
    const int accuracyDropoff = weaponRule->calculateLimits(
        upperLimit, lowerLimit, _save->getDepth(), action->type);
    BattleAction r69RangeAction = *action;
    r69RangeAction.target = target;
    const bool outOfRange = r69ShotOutOfRange(r69RangeAction,_save,&muzzle);
    // R65: 1-tile STR_CRUSH-style attacks are native short-range shots,
    // not BA_HIT melee. Show a separate frontal contact what-if without
    // pretending that an out-of-range real click can attack.
    const bool r65HypotheticalFront = outOfRange && !curved &&
        weaponRule->getMaxRange() == 1 && victim && victim != actor &&
        victim->getVisible() && !victim->isOut() && victim->getArmor() &&
        victim->getFaction() != actor->getFaction();
    int r65AdjacentAccuracy = 0;
    if (r65HypotheticalFront)
    {
        r65AdjacentAccuracy = BattleUnit::getFiringAccuracy(
            BattleActionAttack::GetBeforeShoot(*action),_game->getMod());
        const bool virtualKneel = _r22StanceOverride &&
            _r22Kneel != actor->isKneeled();
        if (virtualKneel)
        {
            const int bonus = weaponRule->getKneelBonus(_game->getMod());
            if (bonus > 0)
                r65AdjacentAccuracy = static_cast<int>(
                    r65AdjacentAccuracy * (_r22Kneel ? bonus/100.0 :
                    100.0/bonus));
        }
        if (1 > upperLimit)
            r65AdjacentAccuracy -= (1-upperLimit)*accuracyDropoff;
        else if (1 < lowerLimit)
            r65AdjacentAccuracy -= (lowerLimit-1)*accuracyDropoff;
        r65AdjacentAccuracy = std::max(0,r65AdjacentAccuracy);
    }

    // Same attack bonus and range-power reduction as native projectile
    // resolution, using the preview's voxel path length as an estimate.
    const BattleActionAttack attack =
        BattleActionAttack::GetAferShoot(*action, ammo);
    int rawPower = powerRule->getPowerBonus(attack);
    // Compute contact-range power for the explicitly labelled what-if.
    // Never shorten the actual projectile path or change its range checks.
    rawPower -= powerRule->getPowerRangeReduction(
        r65HypotheticalFront ? 16.0f : Position::distance(muzzle, aim));
    rawPower = std::max(0, rawPower);
    const bool showPower = !powerRule->getHidePower();
    const int rawMin = showPower ? damage->getRandomDamage(rawPower, 1) : 0;
    const int rawMax = showPower ? damage->getRandomDamage(rawPower, 2) : 0;
    // RC56 also draws the NOMINAL splash outline. The return text is
    // visible-only and never represents an actual impact prediction.
    const std::string blastSummary = r56DrawBlastEnvelope(
        action,target,source,false,"AIM");
    // The blast engine halves power for FireBlastCalc before any rays.
    // Keep the pre-blast weapon PWR distinct from RAW splash damage.
    const int blastPower = (!blastSummary.empty() && damage->FireBlastCalc) ?
        rawPower / 2 : rawPower;
    const int blastMin = showPower ? damage->getRandomDamage(blastPower,1) : 0;
    const int blastMax = showPower ? damage->getRandomDamage(blastPower,2) : 0;

    // RC63: an explosive aimed at empty GROUND still threatens nearby
    // VISIBLE enemies. Pick the closest visible occupant in nominal 3-D
    // radius. Use only geometry for the upper-bound POT damage: the
    // actual projectile landing, wall blockage and ray attenuation
    // remain uncertain. Keep the target-center RAW0 separate.
    int splashDistance=0;
    if (!victim && !blastSummary.empty())
    {
        const int radius=ammoRule->getExplosionRadius(attack);
        int nearestSq=0x7fffffff;
        if (radius>0)
        for (BattleUnit *candidate : *_save->getUnits())
        {
            if (!candidate || candidate==actor || candidate->isOut() ||
                !candidate->getVisible() ||
                candidate->getFaction()==FACTION_PLAYER)
                continue;
            const Position pos=candidate->getPosition();
            const int span=candidate->isBigUnit()?2:1;
            for(int y=0;y<span;++y)
            for(int x=0;x<span;++x)
            {
                const int dx=target.x-pos.x-x;
                const int dy=target.y-pos.y-y;
                const int dz=target.z-pos.z;
                const int sq=dx*dx+dy*dy+dz*dz;
                if(sq<=radius*radius && sq<nearestSq)
                {
                    victim=candidate;
                    nearestSq=sq;
                }
            }
        }
        if (victim)
            splashDistance=static_cast<int>(std::ceil(
                std::sqrt(static_cast<double>(nearestSq))));
    }
    const int splashPower=std::max(0,static_cast<int>(blastPower-
        splashDistance*damage->RadiusReduction));
    const int splashLow=showPower ?
        damage->getRandomDamage(splashPower,1) : 0;
    const int splashHigh=showPower ?
        damage->getRandomDamage(splashPower,2) : 0;

    // R67: the detailed HUD uses the same X-Piratez resistance names
    // as the compact and expanded F8 tables; labels remain native colored
    // text, with small type-color squares displayed alongside.
    static const char *damageNames[DAMAGE_TYPES] = {
        "CHARM", "PIERC", "FIRE", "IMPACT", "LASER",
        "PLASMA", "DAZE", "CUT", "CHEM", "CHOKE",
        "AE511", "BIO", "ELEC", "EMP", "WARP",
        "MIND", "STAB16", "HEAT", "COLD", "TYPE19"
    };
    const int damageId = static_cast<int>(damage->ResistType);
    const char *damageLabel = damageId >= 0 && damageId < DAMAGE_TYPES ?
        damageNames[damageId] : "OTHER";
    const bool knownArmor = victim && victim->getVisible() &&
        victim != actor && victim->getArmor();
    const int resistance = knownArmor && damageId >= 0 &&
        damageId < DAMAGE_TYPES ?
        static_cast<int>(std::round(victim->getArmor()->getDamageModifier(
            damage->ResistType) * 100.0f)) : -1;
    const int armorMultiplier =
        static_cast<int>(std::round(damage->ArmorEffectiveness * 100.0f));

    std::vector<std::string> rows;
    rows.reserve(7);
    int r67SwatchRow=-1, r67SwatchColumn=-1;
    // RC80: red = helps the player; blue = hurts the player.
    // Color the R and AX substrings independently, not the whole line.
    struct R61Tint
    {
        int row;
        int column;
        std::string label;
        bool red;
    };
    std::vector<R61Tint> colored;
    std::ostringstream line;
    // RC77: shot mode labels are already consolidated in the top HUD.
    // Keep range and ballistics in the detailed panel without duplication.
    if (curved) line << "ARC ";
    line << "D" << distance << '/';
    if (weaponRule->getMaxRange() > 0) line << weaponRule->getMaxRange();
    else line << "--";
    if (outOfRange) line << " OUT-OF-RANGE";
    else line << " OPT " << lowerLimit << '-' << upperLimit;
    rows.push_back(line.str());
    if (r65HypotheticalFront)
    {
        line.str(""); line.clear();
        line << "IF FRONT D1 ACC~" << r65AdjacentAccuracy << "%";
        rows.push_back(line.str());
    }

    line.str(""); line.clear();
    line << "TU " << cost.Time << '/' << remainingTU
         << " EN " << cost.Energy << '/' << remainingEnergy
         << " TUx" << (cost.Time > 0 ? remainingTU / cost.Time : 0);
    rows.push_back(line.str());

    // RC80: three consecutive, true left-aligned damage columns.
    // PWR is before random damage, RAW is before resistance/armor,
    // EST is conditional post-resistance and post-armor damage.
    const bool trackedRounds = ammoRule->getClipSize() > 0;
    line.str(""); line.clear();
    line << "PWR~";
    if (showPower) line << rawPower;
    else line << "--";
    if (actionShots > 1) line << " SH" << actionShots;
    line << " AMMO ";
    if (trackedRounds) line << ammo->getAmmoQuantity();
    else line << "--";
    if (roundsPerAction > 1) line << " USE " << roundsPerAction;
    if (trackedRounds && ammo->getAmmoQuantity() < roundsPerAction)
        line << " LOW";
    rows.push_back(line.str());

    line.str(""); line.clear();
    line << "RAW~";
    if (showPower)
    {
        if (!blastSummary.empty())
            line << blastMin << '-' << blastMax;
        else
            line << rawMin << '-' << rawMax <<
                (damage->RandomType == DRT_UFO_WITH_TWO_DICE ? "*" : "");
    }
    else line << "--";
    // RC83: color denotes the damage direction, never allegiance.
    // R>100 increases final damage (red), R<100 decreases it (blue).
    // AX<100 negates less damage (red), AX>100 negates more (blue).
    // Exactly 100 always retains the original, neutral HUD text color.
    if (resistance >= 0)
    {
        const std::string label = " R" + std::to_string(resistance) + "%";
        if (resistance != 100)
            colored.push_back({static_cast<int>(rows.size()),
                static_cast<int>(line.str().size()), label,
                resistance > 100});
        line << label;
    }
    else if (blastSummary.empty()) line << " R--";
    const std::string axLabel = " AX" + std::to_string(armorMultiplier) + "%";
    if (armorMultiplier != 100)
        colored.push_back({static_cast<int>(rows.size()),
            static_cast<int>(line.str().size()), axLabel,
            armorMultiplier < 100});
    line << axLabel;
    r67SwatchRow=static_cast<int>(rows.size());
    r67SwatchColumn=static_cast<int>(line.str().size());
    // Exactly two blank glyph cells reserve the colored square without
    // recoloring or obscuring the adjacent damage-type name.
    line << "  " << damageLabel;
    if (!blastSummary.empty()) line << ' ' << blastSummary;
    rows.push_back(line.str());

    // Keep EST directly beneath RAW even when target armor is unknown:
    // "--" is honest missing information, never an invented prediction.
    line.str(""); line.clear();
    line << "EST~";
    if (knownArmor && showPower)
    {
        const int baseLow = blastSummary.empty() ? rawMin : splashLow;
        const int baseHigh = blastSummary.empty() ? rawMax : splashHigh;
        // Native damage path: resistance before armor. Ranges cover all
        // incoming sides unless the damage ignores direction or is blast.
        auto postArmor = [&](int raw, UnitSide side) -> int
        {
            int value = victim->reduceByResistance(raw,damage->ResistType);
            if (value <= 0) return 0;
            if (damage->ArmorEffectiveness > 0.0f)
                value -= victim->getArmor(side) * damage->ArmorEffectiveness;
            return std::max(0,value);
        };
        int estLow = 0x7fffffff;
        int estHigh = 0;
        for (const UnitSide side : {SIDE_FRONT,SIDE_LEFT,SIDE_RIGHT,
                                    SIDE_REAR,SIDE_UNDER})
        {
            // Hypothetical contact is explicitly from the target's FRONT;
            // normal forecasts still show the unknown-side armor interval.
            if (r65HypotheticalFront)
            {
                if (side != SIDE_FRONT) continue;
            }
            else if ((damage->IgnoreDirection || !blastSummary.empty()) &&
                side != (damage->IgnoreDirection ? SIDE_FRONT:SIDE_UNDER))
                continue;
            estLow = std::min(estLow,postArmor(baseLow,side));
            estHigh = std::max(estHigh,postArmor(baseHigh,side));
        }
        line << estLow << '-' << estHigh;
        if (splashDistance > 0) line << " POT";
    }
    else line << "--";
    rows.push_back(line.str());

    // RC59: H/B/M remains in the compact top line. Do not duplicate it.
    (void)confirmedTarget;
    // Display actual visible armor separately, below PWR/RAW/EST.
    if (knownArmor)
    {
        line.str(""); line.clear();
        line << "F" << victim->getArmor(SIDE_FRONT)
             << " L" << victim->getArmor(SIDE_LEFT)
             << " R" << victim->getArmor(SIDE_RIGHT)
             << " B" << victim->getArmor(SIDE_REAR);
        rows.push_back(line.str());
        if (splashDistance > 0)
        {
            line.str(""); line.clear();
            line << "SPL d" << splashDistance << " POT RAW~"
                 << splashLow << '-' << splashHigh;
            rows.push_back(line.str());
        }
    }

    const SDL_Color *palette = getPalette();
    if (!palette) return;
    int dark = 1, bright = 15, low = 2147483647, high = -1;
    for (int i = 1; i < 256; ++i)
    {
        const int lum = 2126*int(palette[i].r) +
            7152*int(palette[i].g) + 722*int(palette[i].b);
        if (lum < low) { low = lum; dark = i; }
        if (lum > high) { high = lum; bright = i; }
    }
    const int count = std::min(rowCapacity, static_cast<int>(rows.size()));
    int panelWidth = 5;
    for (int i = 0; i < count; ++i)
    {
        while (!rows[i].empty() && r68SmallHudWidth(rows[i]) > getWidth()-6)
            rows[i].pop_back();
        panelWidth = std::max(panelWidth,5+r68SmallHudWidth(rows[i]));
    }
    panelWidth = std::min(getWidth(), panelWidth);
    drawRect(0, top, panelWidth, count * rowHeight,
             static_cast<Uint8>(dark));
    for (int i = 0; i < count; ++i)
        drawString(2, top + i * rowHeight, rows[i].c_str(),
                   static_cast<Uint8>(bright));
    // RC80: the generic drawString ignores its requested color to keep
    // native glyph contrast. Tint only non-neutral R/AX fragments using
    // palette-native FONT_SMALL text (never recolor the 100% values).
    for (const R61Tint &item : colored)
    {
        if (item.row >= count || item.column >= static_cast<int>(rows[item.row].size()))
            continue;
        const int visible = static_cast<int>(rows[item.row].size())-item.column;
        const std::string fragment = item.label.substr(0,
            std::min(visible,static_cast<int>(item.label.size())));
        const int prefixWidth = r68SmallHudWidth(
            rows[item.row].substr(0,item.column));
        r80DrawHudTint(2 + prefixWidth, top + item.row*rowHeight,
                       fragment, item.red);
    }
    // R67: original readable label glyphs + independent color square.
    if (r67SwatchRow>=0 && r67SwatchRow<count &&
        r67SwatchColumn>=0)
    {
        const std::string &painted=rows[r67SwatchRow];
        const std::string typeName(damageLabel);
        const size_t nameOffset=static_cast<size_t>(r67SwatchColumn)+2;
        if (nameOffset+typeName.size()<=painted.size() &&
            painted.compare(nameOffset,typeName.size(),typeName)==0)
        {
            const int prefixWidth=r68SmallHudWidth(
                painted.substr(0,r67SwatchColumn));
            r67DrawDamageSwatch(2+prefixWidth,
                top+r67SwatchRow*rowHeight,damageId);
        }
    }
}


// RC57: replay the geometry portion of TileEngine::explode() on a
// read-only, CURRENTLY VISIBLE terrain snapshot. This follows the native
// 37x121 angular grid, first-visit tile semantics, power falloff,
// FireBlastCalc diagonal loss, and public native wall/floor blockage.
// It deliberately omits hitUnit, hitTile, detonate, gravity, scripts, RNG
// and FOV changes, so neither exact health loss nor chained terrain
// destruction is predicted. Unknown rays are truncated BEFORE accessing
// hidden terrain data; never use this as a fog-of-war oracle.
static void r57ComputeVisibleBlastExposure(
    SavedBattleGame *save, TileEngine *terrain,
    const Position &blastVoxel, int power, int maxRadius,
    const RuleDamageType *type, std::map<int,int> &out,
    bool &incomplete, const std::set<int> *focus = nullptr)
{
    out.clear();
    incomplete = false;
    if (!save || !terrain || !type || power <= 0 ||
        maxRadius <= 0 || maxRadius > 11) return;

    const Position center = blastVoxel.toTile();
    Tile *centerTile = save->getTile(center);
    if (!centerTile || !centerTile->getVisible())
    {
        incomplete = true;
        return;
    }
    const int heightMode = Clamp(Options::battleExplosionHeight,0,3);
    int verticalDecay = 1000;
    if (heightMode == 1)
        verticalDecay = 3.0f * type->RadiusReduction;
    else if (heightMode == 2)
        verticalDecay = 1.0f * type->RadiusReduction;
    else if (heightMode == 3)
        verticalDecay = 0.5f * type->RadiusReduction;

    int diagonalWall = 0, hitSide = 0;
    if (centerTile->isBigWall() && centerTile->getMapData(O_OBJECT))
    {
        diagonalWall = centerTile->getMapData(O_OBJECT)->getBigWall();
        if (diagonalWall == Pathfinding::BIGWALLNWSE)
            hitSide = ((blastVoxel.x % 16)-(blastVoxel.y % 16)) > 0 ? 1 : -1;
        if (diagonalWall == Pathfinding::BIGWALLNESW)
            hitSide = ((blastVoxel.x % 16)+(blastVoxel.y % 16)-15) > 0 ? 1 : -1;
    }

    const auto known = [&](const Position &pos) -> bool
    {
        Tile *tile = save->getTile(pos);
        return tile && tile->getVisible();
    };
    const int sizeX = save->getMapSizeX();
    const int sizeY = save->getMapSizeY();
    for (int fi=-90; fi<=90; fi+=5)
    for (int te=0; te<=360; te+=3)
    {
        const double cosineTe=cos(Deg2Rad(te));
        const double sineTe=sin(Deg2Rad(te));
        const double sineFi=sin(Deg2Rad(fi));
        const double cosineFi=cos(Deg2Rad(fi));
        // R73: for throw F, only trace rays geometrically capable of
        // reaching a candidate allied tile. Unrelated fog cannot make a
        // fully known, blocked floor look dangerous, and the 256-sample
        // HUD stays responsive. The regular RC57 HUD still traces all rays.
        if (focus)
        {
            bool intersects = false;
            for (int step=0; step<=maxRadius; ++step)
            {
                const Position probe(
                    static_cast<int>(floor(center.x+0.5+step*sineTe*cosineFi)),
                    static_cast<int>(floor(center.y+0.5+step*cosineTe*cosineFi)),
                    static_cast<int>(floor(center.z+0.5+step*sineFi)));
                if (probe.x<0 || probe.x>=sizeX || probe.y<0 ||
                    probe.y>=sizeY || probe.z<0 ||
                    probe.z>=save->getMapSizeZ()) continue;
                const int id=(probe.z*sizeY+probe.y)*sizeX+probe.x;
                if (focus->count(id)) { intersects=true; break; }
            }
            if (!intersects) continue;
        }
        Tile *origin = centerTile;
        Tile *destination = origin;
        double distance=0.0;
        int remaining=power;
        while (remaining>0 && distance<=maxRadius)
        {
            if (!destination || !destination->getVisible())
            {
                incomplete=true;
                break;
            }
            // Native records only the FIRST ray reaching each tile.
            // Do not evaluate random damage or touch anything on the tile.
            const Position tilePos=destination->getPosition();
            const int tileId=(tilePos.z*sizeY+tilePos.y)*sizeX+tilePos.x;
            out.emplace(tileId,remaining);
            if (focus && focus->count(tileId)) return;

            distance += 1.0;
            const Position next(
                static_cast<int>(floor(center.x+0.5+distance*sineTe*cosineFi)),
                static_cast<int>(floor(center.y+0.5+distance*cosineTe*cosineFi)),
                static_cast<int>(floor(center.z+0.5+distance*sineFi)));
            origin=destination;
            destination=save->getTile(next);
            if (!destination) break;
            const Position prev=origin->getPosition();
            // Native horizontalBlockage() may inspect additional diagonal
            // tiles, and verticalBlockage() can inspect the floor above or
            // below. Require the whole local stencil to be currently
            // visible before calling native blockage routines.
            bool stencilKnown=true;
            for (int level=std::min(prev.z,next.z);
                 level<=std::max(prev.z,next.z);++level)
            {
                if (!known(Position(prev.x,prev.y,level)) ||
                    !known(Position(next.x,next.y,level)))
                    stencilKnown=false;
                // Diagonal/native blockage can sample either axis-adjacent
                // tile on each relevant Z level; never query unseen walls.
                if (prev.x!=next.x && prev.y!=next.y &&
                    (!known(Position(next.x,prev.y,level)) ||
                     !known(Position(prev.x,next.y,level))))
                    stencilKnown=false;
            }
            if (!stencilKnown)
            {
                incomplete=true;
                break;
            }

            remaining -= type->RadiusReduction;
            if (prev.z != next.z)
                remaining -= verticalDecay;
            if (type->FireBlastCalc)
            {
                int direction;
                Pathfinding::vectorToDirection(prev-next,direction);
                if (direction!=-1 && direction%2)
                    remaining -= 0.5f*type->RadiusReduction;
            }
            if (distance>0.5)
            {
                bool skipObject=false;
                if (distance<=1.5)
                {
                    skipObject=diagonalWall==0;
                    if (diagonalWall == Pathfinding::BIGWALLNESW)
                    {
                        if (hitSide<0 && te>=135 && te<315) skipObject=true;
                        if (hitSide>0 && (te<135 || te>315)) skipObject=true;
                    }
                    if (diagonalWall == Pathfinding::BIGWALLNWSE)
                    {
                        if (hitSide>0 && te>=45 && te<225) skipObject=true;
                        if (hitSide<0 && (te<45 || te>225)) skipObject=true;
                    }
                }
                remaining -= terrain->verticalBlockage(origin,destination,
                    type->ResistType,skipObject)*2;
                remaining -= terrain->horizontalBlockage(origin,destination,
                    type->ResistType,skipObject)*2;
            }
        }
    }
}

// RC56: read-only nominal explosion envelope for gun-fired, arcing,
// thrown and waypoint-launched explosives. This is the blast region IF
// the projectile detonated at the aim tile; it is not a predicted impact.
// The real explosion traverses 3D rays, reduces power by distance,
// floor/wall blockage, and may alter terrain. Do not imply exact damage.
std::string Map::r56DrawBlastEnvelope(BattleAction *action,
    const Position &target, const Position &source,
    bool standalonePanel, const char *context)
{
    if (!_r22On || !r59DetailedHud || _r30FullResists ||
        !_save || !_camera || !action || !action->weapon ||
        !action->actor || !action->targeting ||
        _save->getSide() != FACTION_PLAYER)
        return "";

    Tile *centerTile = _save->getTile(target);
    if (!centerTile) return "";
    // RC63: weapon power and nominal blast radius are known even when the
    // aimed GROUND tile itself is not revealed. The ray tracer below will
    // mark exposure incomplete without inspecting hidden geometry.

    BattleItem *item = action->type == BA_THROW ? action->weapon :
        action->weapon->getAmmoForAction(action->type, nullptr, nullptr);
    if (!item || !item->getRules() || !action->weapon->getRules())
        return "";
    const RuleItem *itemRule = item->getRules();
    const RuleItem *weaponRule = action->weapon->getRules();
    // Native throw detonation uses a grenade/proximity-grenade item;
    // ordinary thrown objects do not acquire an explosion magically.
    if (action->type == BA_THROW && !itemRule->isGrenadeOrProxy())
        return "";
    const RuleDamageType *damage = itemRule->getDamageType();
    if (!damage) return "";

    // Stat/bonus mod scripts may use global RNG. Restore the complete
    // random state on all exit paths; never consume native battle rolls.
    struct R56RngGuard
    {
        RNG::RandomState snapshot;
        R56RngGuard() : snapshot(RNG::globalRandomState()) {}
        ~R56RngGuard() { RNG::globalRandomState() = snapshot; }
    } randomGuard;

    BattleAction view = *action;
    view.target = target;
    const BattleActionAttack attack =
        BattleActionAttack::GetAferShoot(view, item);
    const int radius = itemRule->getExplosionRadius(attack);
    if (radius <= 0 || radius > 11) return "";

    // Estimated pre-armor source power at NOMINAL aim distance. A curved
    // projectile can travel farther than the straight chord; actual
    // power/radius and outcome may differ. FireBlastCalc halves blast power.
    const RuleItem *powerRule = weaponRule->getIgnoreAmmoPower() ?
        weaponRule : itemRule;
    int power = powerRule->getPowerBonus(attack);
    const float chord = Position::distance(
        source.toVoxel() + Position(8,8,12),
        target.toVoxel() + Position(8,8,12));
    power -= powerRule->getPowerRangeReduction(chord);
    power = std::max(0, power);
    if (damage->FireBlastCalc) power /= 2;
    const int rawMin = powerRule->getHidePower() ? -1 :
        damage->getRandomDamage(power, 1);
    const int rawMax = powerRule->getHidePower() ? -1 :
        damage->getRandomDamage(power, 2);
    // Radius falloff remains part of the native RC57 ray calculation;
    // the numeric D~ label is omitted from the compact RC60 panel.

    // RC57 cache: the static geometry replay can involve ~4,500 rays.
    // Recompute on aim/power/type changes and every 300 ms while hovered.
    // No new Map class fields or save serialization are introduced.
    struct R57BlastCache
    {
        const SavedBattleGame *save = nullptr;
        const RuleDamageType *type = nullptr;
        Position target = Position(-1000,-1000,-1000);
        int power = -1, radius = -1, heightMode = -1;
        Uint32 updated = 0;
        bool incomplete = true;
        std::map<int,int> firstHitPower;
    };
    static R57BlastCache snapshot;
    const Uint32 now = SDL_GetTicks();
    const int heightMode = Clamp(Options::battleExplosionHeight,0,3);
    if (snapshot.save!=_save || snapshot.type!=damage ||
        snapshot.target!=target || snapshot.power!=power ||
        snapshot.radius!=radius || snapshot.heightMode!=heightMode ||
        now-snapshot.updated>=300U)
    {
        snapshot.save=_save; snapshot.type=damage;
        snapshot.target=target; snapshot.power=power;
        snapshot.radius=radius; snapshot.heightMode=heightMode;
        snapshot.updated=now;
        const Position blastVoxel=target.toVoxel()+Position(8,8,
            1-centerTile->getTerrainLevel());
        r57ComputeVisibleBlastExposure(_save,_save->getTileEngine(),
            blastVoxel,power,radius,damage,
            snapshot.firstHitPower,snapshot.incomplete);
    }
    const int mapX=_save->getMapSizeX(), mapY=_save->getMapSizeY();
    auto knownExposurePower = [&](const Position &pos) -> int
    {
        Tile *tile=_save->getTile(pos);
        if (!tile || !tile->getVisible()) return 0;
        const int id=(pos.z*mapY+pos.y)*mapX+pos.x;
        auto it=snapshot.firstHitPower.find(id);
        return it==snapshot.firstHitPower.end() ? 0 : it->second;
    };

    // 3-D, wall-aware exposure on CURRENTLY VISIBLE geometry, not raw
    // geometric radius. A 2x2 unit is one unit (any occupied tile).
    // This still cannot predict damage scripts, unit knockback, armor, etc.
    int maxKnownUnitPower=0;
    for (const BattleUnit *unit : *_save->getUnits())
    {
        if (!unit || unit->getStatus()==STATUS_DEAD ||
            (unit->getFaction()!=FACTION_PLAYER && !unit->getVisible()))
            continue;
        const Position origin=unit->getPosition();
        const int footprint=unit->isBigUnit() ? 2 : 1;
        int unitPower=0;
        for (int y=0;y<footprint;++y)
        for (int x=0;x<footprint;++x)
            unitPower=std::max(unitPower,knownExposurePower(
                Position(origin.x+x,origin.y+y,origin.z)));
        if (unitPower<=0) continue;
        maxKnownUnitPower=std::max(maxKnownUnitPower,unitPower);
    }

    // RC60: the raw F/E/N counts are not actual casualty counts and
    // overloaded the damage readout. The colored per-unit markers remain
    // available in detailed view. AOE<n> is nominal splash radius only.
    std::ostringstream summary;
    summary << "AOE" << radius;
    if (snapshot.incomplete) summary << '?';
    const std::string result=summary.str();
    const int r2=radius*radius;

    // Outline only the known, horizontal NOMINAL radius slice. No
    // hidden unit/terrain contents influence ring pixels. The engine
    // can also propagate vertically depending on battleExplosionHeight.
    if (target.z == _camera->getViewLevel())
    {
        const SDL_Color *palette = getPalette();
        Uint8 ring = 73, ally = 32, other = 160, exposure = 48;
        if (palette)
        {
            auto nearestColor = [&](int r, int g, int b) -> Uint8
            {
                int best = 1, bestDistance = 0x7fffffff;
                for (int k = 1; k < 256; ++k)
                {
                    const int dr = int(palette[k].r) - r;
                    const int dg = int(palette[k].g) - g;
                    const int db = int(palette[k].b) - b;
                    const int d = dr*dr + dg*dg + db*db;
                    if (d < bestDistance) { bestDistance = d; best = k; }
                }
                return static_cast<Uint8>(best);
            };
            ring = nearestColor(255,172,35);
            ally = nearestColor(255,65,78);
            other = nearestColor(235,230,55);
            exposure = nearestColor(36,230,123);
        }
        for (int y = -radius; y <= radius; ++y)
        for (int x = -radius; x <= radius; ++x)
        {
            const int dsq = x*x + y*y;
            if (dsq > r2) continue;
            // Mark only the circumference, never an opaque filled circle.
            if ((x+1)*(x+1)+y*y <= r2 &&
                (x-1)*(x-1)+y*y <= r2 &&
                x*x+(y+1)*(y+1) <= r2 &&
                x*x+(y-1)*(y-1) <= r2)
                continue;
            const Position cell(target.x + x,target.y + y,target.z);
            Tile *tile = _save->getTile(cell);
            if (!tile || (!tile->getVisible() &&
                          !tile->isDiscovered(O_FLOOR))) continue;
            const Position foot = cell.toVoxel() +
                Position(0,0,1-tile->getTerrainLevel());
            const Position corners[] = {
                foot, foot+Position(16,0,0),
                foot+Position(16,16,0), foot+Position(0,16,0)
            };
            Position xy[4];
            for (int i=0; i<4; ++i)
                _camera->convertVoxelToScreen(corners[i],&xy[i]);
            for (int i=0; i<4; ++i)
                drawLine(xy[i].x,xy[i].y,
                         xy[(i+1)%4].x,xy[(i+1)%4].y,ring);
        }
        // RC57: green points represent only tiles reached by native
        // wall/floor-aware rays through visible terrain. The amber outer
        // ring remains the RC56 nominal geometric radius reference.
        for (const auto &tilePower : snapshot.firstHitPower)
        {
            const int id=tilePower.first;
            const int xy=id % (mapX*mapY);
            const Position p(xy%mapX,xy/mapX,id/(mapX*mapY));
            if (p.z!=target.z || tilePower.second<=0) continue;
            Tile *tile=_save->getTile(p);
            if (!tile || !tile->getVisible()) continue;
            Position screen;
            _camera->convertVoxelToScreen(p.toVoxel()+
                Position(8,8,1-tile->getTerrainLevel()),&screen);
            const int mark=tilePower.second*2 >= power ? 3 : 1;
            drawRect(screen.x-mark/2,screen.y-mark/2,mark,mark,exposure);
        }
        // Individual known units get a tiny perimeter marker. Unknown
        // occupants are skipped before reading their positions/metadata.
        for (const BattleUnit *unit : *_save->getUnits())
        {
            if (!unit || unit->getStatus() == STATUS_DEAD ||
                (unit->getFaction() != FACTION_PLAYER && !unit->getVisible()))
                continue;
            const Position u = unit->getPosition();
            if (u.z != target.z) continue;
            bool exposed=false;
            const int span=unit->isBigUnit() ? 2 : 1;
            for (int uy=0;uy<span && !exposed;++uy)
            for (int ux=0;ux<span && !exposed;++ux)
                exposed=knownExposurePower(Position(u.x+ux,u.y+uy,u.z))>0;
            if (!exposed) continue;
            Tile *t = _save->getTile(u);
            if (!t || (!t->getVisible() && !t->isDiscovered(O_FLOOR))) continue;
            Position screen;
            _camera->convertVoxelToScreen(u.toVoxel()+
                Position(8,8,1-t->getTerrainLevel()),&screen);
            const Uint8 color = unit->getFaction()==FACTION_PLAYER ?
                ally : other;
            drawLine(screen.x-3,screen.y-2,screen.x+3,screen.y-2,color);
            drawLine(screen.x+3,screen.y-2,screen.x+3,screen.y+2,color);
            drawLine(screen.x+3,screen.y+2,screen.x-3,screen.y+2,color);
            drawLine(screen.x-3,screen.y+2,screen.x-3,screen.y-2,color);
        }
    }

    if (standalonePanel)
    {
        // RC63: explicit grenade/rocket statistics for an AIMED GROUND
        // tile as well as an occupied tile. Nearby visible hostiles are
        // eligible for conditional blast estimates; hidden units never are.
        BattleUnit *displayEnemy = nullptr;
        int enemyDistanceSq = 0x7fffffff;
        int visibleEnemies = 0, visibleFriends = 0;
        for (BattleUnit *unit : *_save->getUnits())
        {
            if (!unit || unit->isOut() ||
                (unit->getFaction()!=FACTION_PLAYER && !unit->getVisible()))
                continue;
            const Position position = unit->getPosition();
            const int span = unit->isBigUnit() ? 2 : 1;
            int closestSq = 0x7fffffff;
            for (int y=0;y<span;++y)
            for (int x=0;x<span;++x)
            {
                const int dx=position.x+x-target.x;
                const int dy=position.y+y-target.y;
                const int dz=position.z-target.z;
                closestSq=std::min(closestSq,dx*dx+dy*dy+dz*dz);
            }
            if (closestSq > radius*radius) continue;
            if (unit->getFaction()==FACTION_PLAYER)
                ++visibleFriends;
            else
            {
                ++visibleEnemies;
                if (closestSq<enemyDistanceSq)
                {
                    enemyDistanceSq=closestSq;
                    displayEnemy=unit;
                }
            }
        }

        std::vector<std::string> lines;
        std::ostringstream line;
        const bool flamePanel = context &&
            std::string(context).find("FLAME") != std::string::npos;
        const bool bombPanel = context &&
            std::string(context).find("BOMB") != std::string::npos;
        line << (context ? context : "AIM") << " AOE" << radius;
        if (snapshot.incomplete) line << "?";
        line << (flamePanel ? " /JET IF HIT" :
            bombPanel ? " IF IMPACT" : " (IF AIM DETONATES)");
        lines.push_back(line.str());

        const BattleActionCost cost(action->type,action->actor,action->weapon);
        line.str(""); line.clear();
        line << "TU " << cost.Time << '/' << action->actor->getTimeUnits()
             << " EN " << cost.Energy << '/' << action->actor->getEnergy();
        lines.push_back(line.str());

        line.str(""); line.clear();
        line << "PWR~" << power << " RAW0~";
        if (rawMin>=0) line << rawMin << '-' << rawMax;
        else line << "--";
        lines.push_back(line.str());

        line.str(""); line.clear();
        if (flamePanel)
        {
            // R64: report actual action shots/clip instead of pretending
            // a flame jet is one gun bullet or that waypoints share impact.
            const RuleItemAction *conf = action->weapon->getActionConf(action->type);
            const int jets = conf ? std::max(1,conf->shots) : 1;
            const int use = jets * (conf ? std::max(1,conf->spendPerShot) : 1);
            line << "JET x" << jets << " USE " << use << " CLIP ";
            if (itemRule->getClipSize()>0)
                line << item->getAmmoQuantity();
            else line << "--";
            if (action->sprayTargeting)
                line << " WP" << action->waypoints.size();
        }
        else if (action->type==BA_THROW)
        {
            const unsigned verified = _r41Target+_r41Scatter;
            if (!action->waypoints.empty())
                line << "MC n" << verified << '/' << _r41ThrowSamples
                     << " U" << _r41Unknown << " X" << _r41Failed;
            else
                line << "MC: PIN AIM FOR LANDING ODDS";
        }
        else if (bombPanel)
            line << "ARC/SCATTER: IMPACT NOT GUARANTEED";
        else line << "SPLASH: AIM CENTER CONDITIONAL";
        lines.push_back(line.str());

        // Keep the limited six-row tactical space for the per-enemy
        // RAW/R/AX/EST values; nominal radius already identifies candidates.
        // Count labels must not displace the damage estimate off-screen.
        bool colorEnemy = false;
        int rPercent=100, axPercent=100;
        if (displayEnemy && displayEnemy->getArmor())
        {
            // Known voxel-ray exposure wins. If FOG blocks that replay,
            // show only a geometric upper-bound potential, not a guarantee.
            const Position pos=displayEnemy->getPosition();
            const int span=displayEnemy->isBigUnit() ? 2 : 1;
            int rayPower=0;
            for (int y=0;y<span;++y)
            for (int x=0;x<span;++x)
                rayPower=std::max(rayPower,knownExposurePower(
                    Position(pos.x+x,pos.y+y,pos.z)));
            const int distance=static_cast<int>(
                std::ceil(std::sqrt(static_cast<double>(enemyDistanceSq))));
            const int geometryPower=std::max(0,static_cast<int>(power-
                distance*damage->RadiusReduction));
            const bool rayKnown=rayPower>0;
            const int unitPower=rayKnown ? rayPower :
                (snapshot.incomplete ? geometryPower : 0);
            line.str(""); line.clear();
            if (unitPower>0)
            {
                const int enemyMin=damage->getRandomDamage(unitPower,1);
                const int enemyMax=damage->getRandomDamage(unitPower,2);
                line << (rayKnown ? "UNIT" : "POT")
                     << " d" << distance << " RAW~"
                     << enemyMin << '-' << enemyMax;
                lines.push_back(line.str());
                const UnitSide side=damage->IgnoreDirection ?
                    SIDE_FRONT : SIDE_UNDER;
                rPercent=static_cast<int>(std::round(
                    displayEnemy->getArmor()->getDamageModifier(
                    damage->ResistType)*100.0f));
                axPercent=static_cast<int>(std::round(
                    damage->ArmorEffectiveness*100.0f));
                auto postArmor = [&](int raw) -> int
                {
                    int value=displayEnemy->reduceByResistance(
                        raw,damage->ResistType);
                    if (damage->ArmorEffectiveness>0.0f)
                        value-=displayEnemy->getArmor(side)*
                               damage->ArmorEffectiveness;
                    return std::max(0,value);
                };
                line.str(""); line.clear();
                line << "R" << rPercent << "% AX" << axPercent << '%'
                     << " A" << displayEnemy->getArmor(side)
                     << " EST~" << postArmor(enemyMin)
                     << '-' << postArmor(enemyMax);
                lines.push_back(line.str());
                colorEnemy=true;
            }
            else
            {
                lines.push_back("VISIBLE ENEMY: COVERED / NO RAY");
                lines.push_back("EST -- (NO CONFIRMED EXPOSURE)");
            }
        }
        else
        {
            if (visibleEnemies)
                lines.push_back("VISIBLE ENEMY ARMOR UNKNOWN");
            else if (maxKnownUnitPower>0)
            {
                line.str(""); line.clear();
                line << "UNIT RAW~" << damage->getRandomDamage(
                    maxKnownUnitPower,1) << '-'
                     << damage->getRandomDamage(maxKnownUnitPower,2);
                lines.push_back(line.str());
            }
            else lines.push_back("NO VISIBLE UNIT EXPOSURE");
            lines.push_back("EST -- (NO VISIBLE ENEMY)");
        }
        lines.push_back(snapshot.incomplete ?
            "FOG/WALL: BLAST EXPOSURE PARTIAL" :
            "EST=IF HIT; HP/SCRIPTS EXCLUDED");

        const int top = 39, rowHeight = 8;
        const int bottom=std::min(_visibleMapHeight,getHeight());
        const int capacity=std::max(0,std::min(9,
            (bottom-63-top)/rowHeight));
        const SDL_Color *palette=getPalette();
        if (capacity>0 && getWidth()>180 && palette)
        {
            int darkest=1,brightest=15,low=0x7fffffff,high=-1;
            for (int i=1;i<256;++i)
            {
                const int lum=2126*int(palette[i].r)+
                    7152*int(palette[i].g)+722*int(palette[i].b);
                if (lum<low) {low=lum; darkest=i;}
                if (lum>high){high=lum; brightest=i;}
            }
            const int count=std::min(capacity,static_cast<int>(lines.size()));
            int panelWidth=5;
            for (int i=0;i<count;++i)
            {
                while (!lines[i].empty() &&
                    r68SmallHudWidth(lines[i])>getWidth()-6)
                    lines[i].pop_back();
                panelWidth=std::max(panelWidth,5+r68SmallHudWidth(lines[i]));
            }
            drawRect(0,top,std::min(getWidth(),panelWidth),
                count*rowHeight,static_cast<Uint8>(darkest));
            for (int i=0;i<count;++i)
                drawString(2,top+i*rowHeight,lines[i].c_str(),
                    static_cast<Uint8>(brightest));
            if (colorEnemy && count >= 6)
            {
                // RC80: render only non-neutral modifiers in native red/blue.
                // This panel always selects an already-visible enemy.
                const std::string &last = lines[5];
                const size_t posAX = last.find(" AX");
                if (posAX != std::string::npos)
                {
                    const size_t posArmor = last.find(" A", posAX + 2);
                    if (rPercent != 100)
                        r80DrawHudTint(2, top + 5*rowHeight,
                            last.substr(0,posAX), rPercent > 100);
                    if (axPercent != 100)
                        r80DrawHudTint(
                            2 + r68SmallHudWidth(last.substr(0,posAX)),
                            top + 5*rowHeight,
                            last.substr(posAX,posArmor-posAX),
                            axPercent < 100);
                }
            }
        }
    }
    return result;
}

// RC46: Psi targeting uses the native legal-target and resource predicates.
// Tile outlines show whether the command can be attempted, never psi
// success chance. Only units already visible to the player are examined.
void Map::r46DrawPsiTargetHud(BattleUnit *actor, BattleAction *action,
                             const Position &hover)
{
    if (!_r22On || !_save || !_camera || !actor || !action ||
        !action->targeting || !action->weapon ||
        action->weapon->getRules()->getBattleType() != BT_PSIAMP ||
        (action->type != BA_PANIC &&
         action->type != BA_MINDCONTROL &&
         action->type != BA_USE))
        return;

    const RuleItem *rule = action->weapon->getRules();
    BattleActionCost cost(action->type, actor, action->weapon);
    const bool resourcesOK = cost.haveTU();
    // Native TileEngine uses GetAferShoot with the psi amp as its ammo.
    // This is deterministic and does NOT evaluate a random/scripted attack.
    const BattleActionAttack psiAttack =
        BattleActionAttack::GetAferShoot(*action, action->weapon);
    const int attackStrength = BattleUnit::getPsiAccuracy(psiAttack);
    auto chanceFor = [&](const BattleUnit *victim) -> int
    {
        if (!victim || !victim->getArmor()) return 0;
        const int defense = 30 + victim->getArmor()->getPsiDefence(victim);
        const float distance = Position::distance(
            actor->getPosition().toVoxel(), victim->getPosition().toVoxel());
        const int reduction = int(rule->getPsiAccuracyRangeReduction(distance));
        const int margin = attackStrength - defense - reduction;
        const int successes = std::max(0, std::min(56, 55 + margin));
        return (successes * 100 + 28) / 56; // rounded percent; 56 outcomes
    };
    struct PsiCell { int state; const char *reason; int chance = 0; };
    // state 0: hidden area, 1: no target, 2: blocked (P=0),
    // state 3: legal attempt with a default psi success-roll probability (not panic state).
    auto classify = [&](const Position &p, Tile *tile,
                        const BattleUnit *target) -> PsiCell
    {
        if (!tile || (!tile->getVisible() && !tile->isDiscovered(O_FLOOR)))
            return {0, "FOG"};
        if (!target || !target->getVisible())
            return {1, "EMPTY"};
        if (target->isOut())
            return {2, "INACTIVE"};
        const UnitFaction friendly = actor->getFaction();
        const UnitFaction faction = target->getFaction();
        if (!rule->isTargetAllowed(faction, friendly) ||
            (action->type == BA_MINDCONTROL && friendly == faction))
            return {2, "BLOCKED"};
        if (action->type == BA_PANIC &&
            target->getUnitRules() && !target->getUnitRules()->canPanic())
            return {2, "BLOCKED"};
        if (action->type == BA_MINDCONTROL &&
            target->getUnitRules() && !target->getUnitRules()->canBeMindControlled())
            return {2, "BLOCKED"};
        if (rule->isOutOfRange(actor->distance3dToPositionSq(p)))
            return {2, "RANGE"};
        // This is exactly the LOS-required exception in
        // BattlescapeGame::primaryAction(). Do not cast a new FOV ray.
        if (rule->isLOSRequired() &&
            !(friendly == FACTION_PLAYER && faction != FACTION_HOSTILE) &&
            !actor->hasVisibleUnit(target))
            return {2, "LOS"};
        if (!resourcesOK)
            return {2, "COST"};
        return {3, "P-HIT", chanceFor(target)};
    };

    const SDL_Color *pal = getPalette();
    if (!pal) return;
    auto nearest = [pal](int red, int green, int blue) -> Uint8
    {
        int best = 1, score = 2147483647;
        for (int c = 1; c < 256; ++c)
        {
            const int dr = int(pal[c].r) - red;
            const int dg = int(pal[c].g) - green;
            const int db = int(pal[c].b) - blue;
            const int d = 2*dr*dr + 3*dg*dg + db*db;
            if (d < score) { score = d; best = c; }
        }
        return static_cast<Uint8>(best);
    };
    // Same five percentage bands as the native ballistic heatmap.
    const Uint8 colors[] = {
        nearest(48,245,95), nearest(179,239,57),
        nearest(255,223,46), nearest(255,135,27),
        nearest(246,48,48)
    };
    const Uint8 green = colors[0];
    const Uint8 yellow = colors[2];
    const Uint8 red = colors[4];
    const Uint8 bright = nearest(255,255,255);
    const Uint8 dark = nearest(15,15,22);
    auto statusColor = [&](const PsiCell &c) -> Uint8
    {
        if (c.state == 2) return red;
        if (c.state != 3) return yellow;
        return c.chance >= 75 ? colors[0] :
               c.chance >= 50 ? colors[1] :
               c.chance >= 25 ? colors[2] :
               c.chance >= 10 ? colors[3] : colors[4];
    };
    const int level = _camera->getViewLevel();
    auto outline = [&](const Position &p, Uint8 color, bool focus)
    {
        if (p.z != level) return;
        Tile *tile = _save->getTile(p);
        if (!tile || (!tile->getVisible() && !tile->isDiscovered(O_FLOOR)))
            return;
        const Position foot(p.x*16, p.y*16,
                            p.z*24-tile->getTerrainLevel()+1);
        const Position corners[4] = {
            foot, foot+Position(16,0,0), foot+Position(16,16,0),
            foot+Position(0,16,0)
        };
        Position px[4];
        for (int i=0; i<4; ++i)
            _camera->convertVoxelToScreen(corners[i], &px[i]);
        for (int i=0; i<4; ++i)
            drawLine(px[i].x,px[i].y,px[(i+1)%4].x,px[(i+1)%4].y,color);
        if (focus)
        {
            for (int i=0; i<4; ++i)
                drawLine(px[i].x,px[i].y+1,
                         px[(i+1)%4].x,px[(i+1)%4].y+1,color);
        }
    };

    // Preview known unit positions only. Never enumerate invisible enemies
    // into the drawn grid or perform speculative LOS/psi checks. For large
    // units color each OCCUPIED tile, not just the anchor. Native targeting
    // uses Tile::getUnit(), not getOverlappingUnit() across storeys.
    int painted = 0;
    for (BattleUnit *target : *_save->getUnits())
    {
        if (!target || target == actor || !target->getVisible() ||
            target->isOut()) continue;
        const Position root = target->getPosition();
        if (root.z != level) continue;
        const int size = target->getArmor() ?
            std::max(1, std::min(4, target->getArmor()->getSize())) : 1;
        for (int dx = 0; dx < size && painted < 64; ++dx)
        for (int dy = 0; dy < size && painted < 64; ++dy)
        {
            const Position p(root.x + dx, root.y + dy, root.z);
            if (p == hover) continue;
            Tile *tile = _save->getTile(p);
            if (!tile || tile->getUnit() != target) continue;
            PsiCell result = classify(p, tile, target);
            if (result.state == 2 || result.state == 3)
            {
                outline(p, statusColor(result), false);
                ++painted;
            }
        }
        if (painted >= 64) break;
    }

    Tile *tile = _save->getTile(hover);
    // Native primaryAction/selectUnit targets getUnit() on the exact clicked
    // tile; a below-floor overlapping unit is not a legal psi target here.
    const BattleUnit *target = tile ? tile->getUnit() : nullptr;
    if (target && !target->getVisible()) target = nullptr;
    const PsiCell focus = classify(hover, tile, target);
    if (focus.state > 0)
        outline(hover, statusColor(focus), true);

    // Three compact rows, same 5 bands as firing HUD. P is a real psi
    // success-roll probability, NOT a guarantee of panic/mind-control effects.
    std::ostringstream first, second;
    first << (action->type == BA_PANIC ? "PSI PANIC" :
             action->type == BA_MINDCONTROL ? "PSI CONTROL" : "PSI USE")
          << " TU " << actor->getTimeUnits() << "/" << cost.Time
          << " EN " << actor->getEnergy() << "/" << cost.Energy;
    if (focus.state == 3 && target)
    {
        const int defense = 30 + target->getArmor()->getPsiDefence(target);
        const float distance = Position::distance(
            actor->getPosition().toVoxel(), target->getPosition().toVoxel());
        const int reduction = int(rule->getPsiAccuracyRangeReduction(distance));
        second << "P-HIT " << focus.chance << "% A" << attackStrength
               << " D" << defense << " R" << reduction;
    }
    else if (focus.state == 2)
        second << "P-HIT -- " << focus.reason;
    else
        second << "P-HIT --  SELECT VISIBLE TARGET";
    const int width = std::min(getWidth(), 305);
    if (width < 2) return;
    drawRect(0,13,width,39,dark);
    drawString(2,16,first.str().c_str(),bright);
    drawString(2,28,second.str().c_str(),statusColor(focus));
    const char *labels[] = {"75+", "50+", "25+", "10+", "<10"};
    for (int i=0; i<5; ++i)
    {
        const int x=4+i*58;
        drawRect(x,42,7,6,colors[i]);
        drawString(x+9,40,labels[i],bright);
    }
    r40RememberHudRect(0,13,width,39);
}

// R114H HMS: quote the selected actor's remaining TU at the hovered
// hypothetical firing origin using a SEPARATE native pathfinder. The live
// pathfinder must never be re-calculated by a render-only aim preview.
static std::string r114HmsRemainingTu(SavedBattleGame *save,
                                     BattleUnit *shooter,
                                     const Position &destination)
{
    if (!save || !shooter || !shooter->getArmor()) return "TU~--";
    const Position start = shooter->getPosition();
    const int available = shooter->getTimeUnits();
    if (start == destination) return "TU~" + std::to_string(available);

    Tile *destinationTile = save->getTile(destination);
    if (!destinationTile || (!destinationTile->getVisible() &&
                             !destinationTile->isDiscovered(O_FLOOR)))
        return "TU~--";

    // Match the default R62 Quick Mode auto-run (no move modifiers).
    const bool autoRun = Options::battleXcomSpeedOrig >= 1 &&
                         Options::battleXcomSpeedOrig <= 40 &&
                         shooter->getArmor()->allowsRunning(shooter->isSmallUnit());
    const BattleActionMove move = autoRun ? BAM_RUN : BAM_NORMAL;
    const unsigned long long scene = r79KnownBattlefieldSignature(save);
    const Uint32 now = SDL_GetTicks();
    struct Quote
    {
        SavedBattleGame *battle = nullptr;
        BattleUnit *actor = nullptr;
        const Armor *armor = nullptr;
        Position from = Position(-1, -1, -1);
        Position to = Position(-1, -1, -1);
        int tu = -1, energy = -1, facing = -1;
        bool kneeled = false, running = false;
        unsigned long long scene = 0;
        Uint32 checked = 0;
        std::string label;
    };
    static Quote cache;
    if (cache.battle == save && cache.actor == shooter &&
        cache.armor == shooter->getArmor() && cache.from == start &&
        cache.to == destination && cache.tu == available &&
        cache.energy == shooter->getEnergy() &&
        cache.facing == shooter->getDirection() &&
        cache.kneeled == shooter->isKneeled() &&
        cache.running == autoRun && cache.scene == scene &&
        now - cache.checked < 400U)
        return cache.label;

    std::string label = "TU~--";
    Pathfinding isolated(save);
    isolated.calculate(shooter, destination, move, nullptr, 2000);
    const std::vector<int> &directions = isolated.getPath();
    if (!directions.empty())
    {
        // Mirror native Pathfinding::refreshPath kneel/turn/step TU costs.
        int spent = shooter->isKneeled() ? shooter->getKneelUpCost() : 0;
        if (shooter->getArmor()->getTurnBeforeFirstStep())
        {
            const int first = isolated.getStartDirection();
            if (first >= 0 && first < 8 && first != shooter->getDirection())
            {
                int turn = std::abs(first - shooter->getDirection());
                if (turn > 4) turn = 8 - turn;
                spent += turn * shooter->getTurnCost();
            }
        }
        Position reached = start;
        bool valid = true;
        // Native path directions are stored backwards, but the movement
        // costs are applied forwards. Never change the unit's real TU.
        for (auto i = directions.rbegin(); i != directions.rend(); ++i)
        {
            if (*i < 0 || *i >= 10) { valid = false; break; }
            const PathfindingStep step =
                isolated.getTUCost(reached, *i, shooter, nullptr, move);
            if (step.cost.time < 0 ||
                step.cost.time >= Pathfinding::INVALID_MOVE_COST)
            {
                valid = false;
                break;
            }
            spent += step.cost.time;
            reached = step.pos;
        }
        if (valid && reached == destination)
            label = spent <= available
                ? "TU~" + std::to_string(available - spent)
                : "TU~LOW";
    }
    cache.battle = save;
    cache.actor = shooter;
    cache.armor = shooter->getArmor();
    cache.from = start;
    cache.to = destination;
    cache.tu = available;
    cache.energy = shooter->getEnergy();
    cache.facing = shooter->getDirection();
    cache.kneeled = shooter->isKneeled();
    cache.running = autoRun;
    cache.scene = scene;
    cache.checked = now;
    cache.label = label;
    return label;
}

void Map::r22DrawOverlay()
{
    BattleUnit *soldier = _save->getSelectedUnit();
    if (!soldier || !_save->getTileEngine() || !_camera)
        return;
    BattleAction *native = _save->getBattleGame() ?
        _save->getBattleGame()->getCurrentAction() : nullptr;
    // A hidden cursor means a projectile is firing, a turn is resolving,
    // or another native action owns input. Retire stale preview caches first.
    const bool nativeAim = _cursorType != CT_NONE && native &&
        native->targeting && native->weapon &&
        native->actor == soldier &&
        (native->type == BA_SNAPSHOT || native->type == BA_AIMEDSHOT ||
         native->type == BA_AUTOSHOT || native->type == BA_THROW);
    if (_r22StanceActor != soldier)
    {
        _r22StanceActor = soldier;
        _r22StanceOverride = false;
        _r22Kneel = soldier->isKneeled();
        _r22StatsKey = 0;
        _r22HullHash = 0;
    }
    // RC46: panic/mind control are target-select actions, not gun rays.
    // Retire ballistic preview state and paint legal psi attempts only.
    const bool nativePsi = _cursorType == CT_PSI && native &&
        native->targeting && native->weapon && native->actor == soldier &&
        native->weapon->getRules()->getBattleType() == BT_PSIAMP &&
        (native->type == BA_PANIC || native->type == BA_MINDCONTROL ||
         native->type == BA_USE);
    if (nativePsi)
    {
        _r22StanceOverride = false;
        _r22StatsKey = 0;
        _r22ThrowCacheKey = 0;
        _r22StatsText.clear();
        _r22TileRisks.clear();
        _r22SampleCount = 0;
        _r22HullWorkPending = false;
        r29ClearBlockGrid();
        Position hover;
        getSelectorPosition(&hover);
        // RC47 QA: log the exact same-frame selector used by the psi HUD.
        // Never draw hidden target IDs or hidden-unit attributes into the player HUD.
        static Position lastPsiHover(-999, -999, -999);
        static int lastPsiTargetId = -999;
        Tile *qaTile = _save->getTile(hover);
        BattleUnit *qaUnit = qaTile ? qaTile->getUnit() : nullptr;
        const int qaId = (qaUnit && qaUnit->getVisible()) ? qaUnit->getId() : -1;
        if (hover != lastPsiHover || qaId != lastPsiTargetId)
        {
            Log(LOG_INFO) << "RC47_PSI_HOVER" << " screen=" << _mouseX << "," << _mouseY
                          << " selector=" << hover << " level=" << _camera->getViewLevel()
                          << " rot=" << _r41Rotation
                          << " tile=" << (qaTile ? 1 : 0)
                          << " visible=" << (qaTile && qaTile->getVisible() ? 1 : 0)
                          << " discovered=" << (qaTile && qaTile->isDiscovered(O_FLOOR) ? 1 : 0)
                          << " targetId=" << qaId;
            lastPsiHover = hover;
            lastPsiTargetId = qaId;
        }
        r46DrawPsiTargetHud(soldier, native, hover);
        return;
    }
    // Movement remains native. Keep planned LOS only during an actual path
    // preview; do NOT calculate gun rays or probabilities on a move cursor.
    if (!nativeAim)
    {
        _r22StanceOverride = false;
        _r22StatsKey = 0;
        _r22ThrowCacheKey = 0;
        _r22StatsText.clear();
        _r22TileRisks.clear();
        _r22SampleCount = 0;
        _r22HullWorkPending = false;
        r29ClearBlockGrid();
        if (_cursorType == CT_NONE) return;
        // RC56: guided launchers do not use normal hit-odds targeting.
        // A waypoint can be an intermediate steering point, so the
        // outline describes ONLY a hypothetical detonation there.
        if (_cursorType == CT_WAYPOINT && native &&
            native->type == BA_LAUNCH && native->actor == soldier &&
            native->targeting)
        {
            Position waypoint;
            getSelectorPosition(&waypoint);
            r56DrawBlastEnvelope(native,waypoint,soldier->getPosition(),
                                  true,"WPT IF");
            return;
        }
        Pathfinding *finder = _save->getPathfinding();
        if (finder && finder->isPathPreviewed())
        {
            const Position planned = r22PlannedPosition(soldier);
            Tile *tile = _save->getTile(planned);
            if (tile)
            {
                const Position eye(planned.x*16+8, planned.y*16+8,
                    planned.z*24-tile->getTerrainLevel()+
                    soldier->getHeight()+soldier->getFloatHeight()-1);
                r22DrawVisibilityHull(planned,eye,_camera->getViewLevel());
            }
        }
        return;
    }
    Position cursor;
    getSelectorPosition(&cursor);
    // Clicks are owned by native primaryAction(), including movement and
    // optional battleConfirmFireMode's first target-confirmation click.
    // A spray's first waypoint is also a pinned target. The old check
    // explicitly excluded it and prevented the range grid from appearing.
    const bool confirmedTarget = (Options::battleConfirmFireMode ||
        native->type == BA_THROW || native->sprayTargeting) &&
        !native->waypoints.empty();
    // A first-click cursor still resting on its target must retain the HUD:
    // fall back to the true soldier position rather than trying a zero-length ray.
    const Position target = confirmedTarget ? native->waypoints.front() : cursor;
    // R42: first-click target confirmation previews the path FROM the
    // current hover tile TO the pinned target, for throws as for shots.
    // If the cursor still rests on the pinned target, keep the actor's
    // actual origin instead of drawing a zero-length hypothetical throw.
    // This is a read-only origin; the second click still uses the live actor.
    const Position source = confirmedTarget
        ? (cursor != target ? r32VirtualStandPosition(cursor, soldier)
                            : soldier->getPosition())
        : r22PlannedPosition(soldier);
    // Always quote the prospective firing tile, never the pinned target.
    const std::string r114Tu = r114HmsRemainingTu(_save, soldier, source);

    // R64: These curved attacks deliver area effects, not ordinary
    // single-bullet hits. Keep the original fire/throw mechanics intact;
    // only choose the existing explosive/area HUD for their previews.
    const std::string &r64WeaponType = native->weapon->getRules()->getType();
    const bool r64BlackPowderBomb = r64WeaponType == "STR_ANARCHY_BOMB";
    const bool r64Flame = r64WeaponType.find("FLAMETHROWER") != std::string::npos ||
        r64WeaponType.find("FLAMER") != std::string::npos;
    const bool r64AreaHud = r64BlackPowderBomb || r64Flame;

    Tile *startTile = _save->getTile(source);
    Tile *targetTile = _save->getTile(target);
    if (!startTile || !targetTile) return;
    // R115: before the first click, rank nearby POSSIBLE explosive impact
    // tiles (T>=1). These are destinations, NOT hypothetical firing origins.
    // Never sample unknown terrain or touch live action/ammo/RNG state.
    if (!confirmedTarget && target.z == _camera->getViewLevel())
    {
        const bool throwingExplosive = native->type == BA_THROW &&
            native->weapon->getRules()->isGrenadeOrProxy();
        BattleItem *blastAmmo = throwingExplosive ? native->weapon :
            native->weapon->getAmmoForAction(native->type,nullptr,nullptr);
        bool explosive = false;
        if (blastAmmo && blastAmmo->getRules())
        {
            BattleAction blastAction = *native;
            blastAction.target = target;
            const BattleActionAttack blastAttack =
                BattleActionAttack::GetAferShoot(blastAction,blastAmmo);
            explosive = (throwingExplosive ||
                blastAmmo->getRules()->getExplosionRadius(blastAttack)>0);
        }
        if (explosive && !native->sprayTargeting)
        {
            struct R115PreviewCell { Position tile; unsigned t; };
            struct R115PreviewCache {
                const SavedBattleGame *save = nullptr;
                const BattleItem *weapon = nullptr;
                Position origin = Position(-999,-999,-999);
                Position hover = Position(-999,-999,-999);
                int action = -1, stance = -1;
                unsigned long long terrain = 0;
                Uint32 updated = 0;
                std::vector<R115PreviewCell> cells;
            };
            static R115PreviewCache cache;
            const Position realOrigin = soldier->getPosition();
            const unsigned long long terrain = r79KnownBattlefieldSignature(_save);
            const Uint32 now = SDL_GetTicks();
            if (cache.save != _save || cache.weapon != native->weapon ||
                cache.origin != realOrigin || cache.hover != target ||
                cache.action != int(native->type) ||
                cache.stance != int(soldier->isKneeled()) ||
                cache.terrain != terrain || now-cache.updated >= 350U)
            {
                cache.save = _save;
                cache.weapon = native->weapon;
                cache.origin = realOrigin;
                cache.hover = target;
                cache.action = int(native->type);
                cache.stance = int(soldier->isKneeled());
                cache.terrain = terrain;
                cache.updated = now;
                cache.cells.clear();
                Tile *realTile = _save->getTile(realOrigin);
                if (realTile)
                {
                    BattleAction probe = *native;
                    probe.actor = soldier;
                    const Position muzzle = _save->getTileEngine()->
                        getOriginVoxel(probe,nullptr);
                    const bool curved = !throwingExplosive &&
                        native->weapon->getArcingShot(native->type);
                    const RuleItemAction *config =
                        native->weapon->getActionConf(native->type);
                    const int shotCount = config ? std::max(1,config->shots) : 1;
                    const int spending = config ? std::max(1,config->spendPerShot) : 1;
                    const bool enoughAmmo = throwingExplosive ||
                        (config && shotCount >= 1 &&
                         blastAmmo->getAmmoQuantity() >= shotCount*spending);
                    const double accuracy = throwingExplosive ? 1.0 :
                        BattleUnit::getFiringAccuracy(
                            BattleActionAttack::GetAferShoot(probe,blastAmmo),
                            _game->getMod())/100.0;
                    struct PreserveR115Rng {
                        RNG::RandomState old;
                        PreserveR115Rng() : old(RNG::globalRandomState()) {}
                        ~PreserveR115Rng() { RNG::globalRandomState()=old; }
                    } rngGuard;
                    if (enoughAmmo)
                    for (int dy=-2;dy<=2;++dy)
                    for (int dx=-2;dx<=2;++dx)
                    {
                        const Position candidate(target.x+dx,target.y+dy,target.z);
                        Tile *cell = _save->getTile(candidate);
                        if (!cell || !cell->getVisible() ||
                            !cell->isDiscovered(O_FLOOR)) continue;
                        const Position aimed = candidate.toVoxel() +
                            Position(8,8,1-cell->getTerrainLevel());
                        unsigned success=0, known=0;
                        for (unsigned trial=0;trial<4;++trial)
                        {
                            bool reached=false, pathKnown=true;
                            BattleAction shot=probe;
                            shot.target=candidate;
                            shot.autoShotCounter=1;
                            if (throwingExplosive)
                            {
                                const int offsets[4][2] = {{0,0},{-4,0},{4,0},{0,4}};
                                const Position aimVoxel=aimed+
                                    Position(offsets[trial][0],offsets[trial][1],0);
                                double arc=0.0;
                                int collision=V_EMPTY;
                                if (_save->getTileEngine()->validateThrow(
                                    shot,muzzle,aimVoxel,_save->getDepth(),
                                    &arc,&collision,false,false,&realOrigin,
                                    soldier->isKneeled()?1:0,true))
                                {
                                    std::vector<Position> trajectory;
                                    const int impact=_save->getTileEngine()->
                                        calculateParabolaVoxel(muzzle,aimVoxel,
                                            true,&trajectory,soldier,arc,
                                            Position(0,0,0),true);
                                    reached=!trajectory.empty() &&
                                        (impact==V_FLOOR || impact==V_OBJECT ||
                                         impact==V_UNIT) &&
                                        Projectile::getPositionFromEnd(trajectory,
                                            Projectile::ItemDropVoxelOffset).toTile()
                                            ==candidate;
                                    for (const Position &v : trajectory)
                                    {
                                        Tile *t=_save->getTile(v.toTile());
                                        if (t && !t->getVisible()) {
                                            pathKnown=false; break;
                                        }
                                    }
                                }
                            }
                            else
                            {
                                unsigned long long seed=1469598103934665603ULL;
                                for (int value : {int(candidate.x),int(candidate.y),int(candidate.z),
                                                  int(trial),int(soldier->getId())})
                                { seed ^= unsigned(value); seed *= 1099511628211ULL; }
                                RNG::RandomState preview(seed ? seed : 1ULL);
                                RNG::globalRandomState()=preview;
                                Projectile projectile(_game->getMod(),_save,shot,
                                    realOrigin,aimed,blastAmmo);
                                const int collision=curved ?
                                    projectile.calculateThrow(accuracy,&preview,
                                        &realOrigin,&muzzle,
                                        soldier->isKneeled()?1:0) :
                                    projectile.calculateTrajectory(accuracy,muzzle,
                                        true,true,&preview,-1,nullptr);
                                const std::vector<Position> &trajectory=
                                    projectile.getTrajectoryForPreview();
                                if (!trajectory.empty())
                                {
                                    const Position landed=trajectory.back().toTile();
                                    reached=landed==candidate &&
                                        collision!=V_EMPTY &&
                                        collision!=V_OUTOFBOUNDS;
                                    for (const Position &v : trajectory)
                                    {
                                        Tile *t=_save->getTile(v.toTile());
                                        if (t && !t->getVisible()) {
                                            pathKnown=false; break;
                                        }
                                    }
                                }
                            }
                            if (pathKnown) { ++known; if (reached) ++success; }
                        }
                        if (known && success)
                            cache.cells.push_back({candidate,
                                100U*success/known});
                    }
                }
            }
            const SDL_Color *palette=getPalette();
            if (palette)
            for (const R115PreviewCell &entry : cache.cells)
            {
                Tile *cell=_save->getTile(entry.tile);
                if (!cell) continue;
                const int r=entry.t>=75?45:entry.t>=50?170:
                    entry.t>=25?255:240;
                const int g=entry.t>=75?220:entry.t>=50?235:
                    entry.t>=25?190:75;
                const int b=entry.t>=75?80:entry.t>=50?65:
                    entry.t>=25?25:35;
                int best=1,score=2147483647;
                for (int i=1;i<256;++i)
                {
                    const int dr=int(palette[i].r)-r;
                    const int dg=int(palette[i].g)-g;
                    const int db=int(palette[i].b)-b;
                    const int dist=dr*dr+dg*dg+db*db;
                    if (dist<score) { score=dist; best=i; }
                }
                const Position floor=entry.tile.toVoxel()+
                    Position(0,0,1-cell->getTerrainLevel());
                const Position corners[4]={floor,floor+Position(16,0,0),
                    floor+Position(16,16,0),floor+Position(0,16,0)};
                Position screen[4];
                for (int i=0;i<4;++i)
                    _camera->convertVoxelToScreen(corners[i],&screen[i]);
                for (int i=0;i<4;++i)
                    drawLine(screen[i].x,screen[i].y,
                        screen[(i+1)%4].x,screen[(i+1)%4].y,best);
            }
        }
    }
    // RC67: before trajectory, normal gunshots face a separate native
    // close-quarters (BA_CQB) interruption check, even if aiming far away.
    // It is not a BA_HIT melee roll and must be labelled independently.
    r67DrawCqcHud(soldier, native, source);
    // Preview actor replaces an existing ally at the SOURCE tile only.
    // Never alter either BattleUnit, its tile, or the saved game.
    BattleUnit *previewVacatedUnit = source != soldier->getPosition() ?
        startTile->getOverlappingUnit(_save) : nullptr;
    if (previewVacatedUnit &&
        (previewVacatedUnit == soldier ||
         previewVacatedUnit->getFaction() != soldier->getFaction()))
        previewVacatedUnit = nullptr;
    // R53: independent 3-axis gyroscope at the SAME firing-origin voxel
    // passed to native ballistics. Rings are true voxel-space circles
    // projected by Camera, so height and the active map rotation agree.
    // The bright short tick points toward the current shot's aim voxel.
    // This is render-only: never modify the action, soldier or RNG.
    auto drawMuzzleGyro = [&](const Position &actualMuzzle,
                              const Position &actualAim)
    {
        if (actualMuzzle.z < 0 ||
            actualMuzzle.toTile().z > _camera->getViewLevel())
            return;
        const SDL_Color *pal = getPalette();
        if (!pal) return;
        auto nearestGyro = [pal](int r, int g, int b) -> Uint8
        {
            int best = 1, score = 2147483647;
            for (int c = 1; c < 256; ++c)
            {
                const int dr = int(pal[c].r) - r;
                const int dg = int(pal[c].g) - g;
                const int db = int(pal[c].b) - b;
                const int d = 2*dr*dr + 3*dg*dg + db*db;
                if (d < score) { score = d; best = c; }
            }
            return Uint8(best);
        };
        const Uint8 ringColor[3] = {
            nearestGyro(25, 231, 234),
            nearestGyro(85, 161, 255),
            nearestGyro(242, 185, 59)
        };
        const Uint8 coreColor = nearestGyro(255, 250, 235);
        const Uint8 facingColor = nearestGyro(255, 233, 65);
        Position center;
        _camera->convertVoxelToScreen(actualMuzzle, &center);
        if (center.x < -18 || center.x > getWidth()+18 ||
            center.y < -18 || center.y > _visibleMapHeight+18)
            return;
        const double fullCircle = 6.283185307179586;
        const int radius = 5; // voxels: about 10 screen pixels across
        const int segments = 24;
        for (int plane = 0; plane < 3; ++plane)
        {
            Position previous;
            for (int step = 0; step <= segments; ++step)
            {
                const double angle = fullCircle * step / segments;
                const int a = int(std::lround(radius * std::cos(angle)));
                const int b = int(std::lround(radius * std::sin(angle)));
                Position world = actualMuzzle;
                if (plane == 0) { world.x += a; world.y += b; }
                if (plane == 1) { world.x += a; world.z += b; }
                if (plane == 2) { world.y += a; world.z += b; }
                Position screen;
                _camera->convertVoxelToScreen(world, &screen);
                if (step > 0)
                    drawLine(previous.x, previous.y, screen.x, screen.y,
                             ringColor[plane]);
                previous = screen;
            }
        }
        const double dx = double(actualAim.x - actualMuzzle.x);
        const double dy = double(actualAim.y - actualMuzzle.y);
        const double dz = double(actualAim.z - actualMuzzle.z);
        const double length = std::sqrt(dx*dx + dy*dy + dz*dz);
        if (length > 0.5)
        {
            const Position facing(
                actualMuzzle.x + int(std::lround(8.0*dx/length)),
                actualMuzzle.y + int(std::lround(8.0*dy/length)),
                actualMuzzle.z + int(std::lround(8.0*dz/length)));
            Position tip;
            _camera->convertVoxelToScreen(facing, &tip);
            drawLine(center.x, center.y, tip.x, tip.y, facingColor);
            const int sx = (tip.x > center.x) - (tip.x < center.x);
            const int sy = (tip.y > center.y) - (tip.y < center.y);
            if (sx || sy)
            {
                drawLine(tip.x, tip.y,
                         tip.x - 2*sx + sy, tip.y - 2*sy - sx, facingColor);
                drawLine(tip.x, tip.y,
                         tip.x - 2*sx - sy, tip.y - 2*sy + sx, facingColor);
            }
        }
        drawRect(center.x-1, center.y-1, 3, 3, coreColor);
    };
    // R43: curved and waypoint-spray firing must NEVER use the straight
    // projectile line, canTargetUnit(), or gun H/B/M probability model.
    // The native arc probe below is deterministic and labels uncertainty.
    // Ordinary gun/whip/throw paths continue through their old branches.
    if (native->type != BA_THROW &&
        (native->sprayTargeting || native->weapon->getArcingShot(native->type)))
    {
        if (native->sprayTargeting)
        {
            _r22StatsText.clear();
            _r22StatsKey = 0;
            _r22TileRisks.clear();
            _r22SampleCount = 0;
        }
        _r22HullWorkPending = false;
        // R59: regular curved shots (including the flamethrower) now use
        // the same hit-probability FLOOR grid as straight shooting, but
        // their trials use native curved projectiles, not straight rays.
        // Ctrl+Shift spray-waypoints describe DIFFERENT shot destinations;
        // those are not virtual firing positions, so never invent odds.
        if (native->sprayTargeting)
        {
            r29ClearBlockGrid();
            // R68: spray waypoints are different destinations, not candidate
            // launch positions. Do not draw a misleading range-only carpet.
        }
        // RC55: arcing bows use the native R43 curved path probe, NEVER
        // straight-shot H/B/M samples. Still provide exact TU, ammunition,
        // stats-powered damage, resistance and current visible armor.
        if (!native->sprayTargeting)
        {
            BattleAction virtualShot = *native;
            virtualShot.actor = soldier;
            virtualShot.target = target;
            const bool kneeled = _r22StanceOverride ?
                _r22Kneel : soldier->isKneeled();
            const int stanceDelta = (kneeled ? soldier->getKneelHeight() :
                soldier->getStandHeight()) - soldier->getHeight();
            const Position arcMuzzle = r32VirtualMuzzle(virtualShot,
                startTile, stanceDelta, source != soldier->getPosition());
            Position arcAim = target.toVoxel() + Position(8,8,
                1 - targetTile->getTerrainLevel());
            BattleUnit *arcVictim = targetTile->getOverlappingUnit(_save);
            if (arcVictim && arcVictim->getVisible())
                arcAim.z += arcVictim->getFloatHeight() +
                    arcVictim->getHeight()/2 + 1;
            if (r64AreaHud)
            {
                // R68: flame is a curved projectile even when its ammo has
                // no explosive radius. Native trajectory odds are required
                // for occupied AND empty tiles; splash data are conditional.
                if (r64Flame)
                {
                    r58SampleArcOdds(soldier,native,source,target,
                                     arcMuzzle,kneeled);
                    if (!_r22StatsText.empty())
                        r22DrawContrastHud(kneeled ? "KNEEL" : "STAND",
                            source != soldier->getPosition(),
                            " | "+r114Tu+" "+_r22StatsText);
                }
                else
                {
                    _r22StatsText.clear();
                    _r22StatsKey = 0;
                    _r22TileRisks.clear();
                    _r22SampleCount = 0;
                }
                r56DrawBlastEnvelope(native,target,source,true,
                    r64BlackPowderBomb ? "BOMB IF" : "FLAME IF");
                if (confirmedTarget && r59DetailedHud && r64Flame)
                    r29DrawTargetBlockGrid(soldier,native,target);
                else r29ClearBlockGrid();
            }
            else
            {
                // Retain native curved H/B/M and aiming statistics for
                // bows and all non-area curved firearms.
                r58SampleArcOdds(soldier,native,source,target,
                                  arcMuzzle,kneeled);
                if (!_r22StatsText.empty())
                {
                    const bool simulated = source != soldier->getPosition() ||
                        (_r22StanceOverride && kneeled != soldier->isKneeled());
                    r22DrawContrastHud(kneeled ? "KNEEL" : "STAND",simulated,
                                       " | "+r114Tu+" "+_r22StatsText);
                }
                r55DrawAimDetailHud(soldier, native, source, target,
                                     arcMuzzle, arcAim, confirmedTarget);
                if (confirmedTarget)
                    r29DrawTargetBlockGrid(soldier, native, target);
                else
                    r29ClearBlockGrid();
            }
            // Curved projectile: still show its own actual origin voxel.
            if (source.z <= _camera->getViewLevel())
                drawMuzzleGyro(arcMuzzle, arcAim);
        }
        else
        {
            // Spray path may cross multiple tiles. This marks only
            // the pinned/hovered point, never the whole burst impact set.
            r56DrawBlastEnvelope(native,target,source,true,
                                  r64Flame ? "FLAME IF" : "SPR IF");
        }
        return;
    }
    const int viewZ = _camera->getViewLevel();
    const int width = _save->getMapSizeX(), length = _save->getMapSizeY();
    // LOSLOF_R22_HARDENED_VISIBLE_ONLY: native armor-specific stance height.
    int stanceDelta = (_r22StanceOverride && (_r22Kneel != soldier->isKneeled())) ?
        ((_r22Kneel ? soldier->getKneelHeight() : soldier->getStandHeight())
         - soldier->getHeight()) : 0;
    const Position eye(source.x*16+8, source.y*16+8,
        source.z*24 - startTile->getTerrainLevel() +
        soldier->getHeight() + soldier->getFloatHeight() - 1 + stanceDelta);
    const BattleUnit *targetUnit = targetTile->getUnit();
    int aimHeight = targetUnit && targetUnit->getVisible() ?
        std::max(3, targetUnit->getHeight()/2) : 12;
    Position goal(target.x*16+8, target.y*16+8,
        target.z*24-targetTile->getTerrainLevel()+aimHeight);
    std::vector<Position> vision;
    _save->getTileEngine()->calculateLineVoxel(eye, goal, true, &vision, soldier, nullptr, true);

    // Tile-centred floor projection. Exactly one pixel per visited tile.
    std::set<int> seen;
    for (const Position& voxel : vision)
    {
        if (voxel.x < 0 || voxel.y < 0 || voxel.z < 0) continue;
        const int tx=voxel.x/16, ty=voxel.y/16, tz=voxel.z/24;
        if (tx>=width || ty>=length || tz>=_save->getMapSizeZ() || tz>viewZ) continue;
        if (!seen.insert((tz*length+ty)*width+tx).second) continue;
        Tile *t = _save->getTile(Position(tx,ty,tz));
        if (!t || !t->isDiscovered(O_FLOOR)) continue;
        Position xy;
        _camera->convertVoxelToScreen(Position(tx*16+8,ty*16+8,
            tz*24-t->getTerrainLevel()+1), &xy);
        setPixel(xy.x,xy.y,48);
    }

    r22DrawVisibilityHull(source,eye,viewZ);

    const BattleAction *selectedAction=_save->getBattleGame() ?
        _save->getBattleGame()->getCurrentAction() : nullptr;
    if(selectedAction && selectedAction->actor==soldier &&
       selectedAction->type==BA_THROW)
    {
        // R32: preview originates from the ACTUAL 1/3 or 2/3 stair
        // landing elevation, never from the tile's z*24 base plane.
        const Position foot(source.x * 16, source.y * 16,
            source.z * 24 - startTile->getTerrainLevel() + 1);
        const Position corners[] = {foot, foot + Position(16,0,0),
            foot + Position(16,16,0), foot + Position(0,16,0)};
        if (source.z <= viewZ)
        {
            Position pixel[4];
            for (int i = 0; i < 4; ++i)
                _camera->convertVoxelToScreen(corners[i], &pixel[i]);
            for (int i = 0; i < 4; ++i)
                drawLine(pixel[i].x, pixel[i].y,
                    pixel[(i+1)%4].x, pixel[(i+1)%4].y, 160);
        }
        r22DrawThrowPreview(source,target,startTile,targetTile);
        // R58: throws returned here before R53's gun-only gyroscope.
        // Display their genuine native origin (or the preview equivalent)
        // after drawing the arc/HUD, without affecting ballistic RNG.
        BattleAction throwAction = *native;
        throwAction.target = target;
        const bool previewKneeled = _r22StanceOverride ?
            _r22Kneel : soldier->isKneeled();
        const int throwStanceDelta = (previewKneeled ?
            soldier->getKneelHeight() : soldier->getStandHeight()) -
            soldier->getHeight();
        const bool realThrowSource = source == soldier->getPosition() &&
            previewKneeled == soldier->isKneeled();
        const Position throwMuzzle = realThrowSource
            ? _save->getTileEngine()->getOriginVoxel(throwAction, nullptr)
            : r32VirtualMuzzle(throwAction, startTile, throwStanceDelta,
                                source != soldier->getPosition());
        Position throwTarget = target;
        Tile *throwTargetTile = targetTile;
        if (targetTile->getTerrainLevel() == -24 &&
            throwTarget.z + 1 < _save->getMapSizeZ())
        {
            ++throwTarget.z;
            throwTargetTile = _save->getTile(throwTarget);
        }
        if (confirmedTarget) r29DrawTargetBlockGrid(soldier, native, target);
        else r29ClearBlockGrid();
        // Draw the throw-origin gyro last, above the aiming grid.
        if (throwTargetTile && source.z <= viewZ)
            drawMuzzleGyro(throwMuzzle, throwTarget.toVoxel() +
                Position(8,8,1-throwTargetTile->getTerrainLevel()));
        return;
    }
    BattleAction testAction = *native; // read-only action snapshot
    testAction.actor = soldier;
    testAction.target = target;

    // LOSLOF_R22_NATIVE_BALLISTIC_AIM_20261013
    // Reuse native OXCE canTargetUnit's multi-voxel scan on a visible enemy.
    // This matters most when the centre is hidden but a head/side is exposed.
    // Off-centre firing tries CENTRE, LEFT, RIGHT in the same order as OXCE.
    // potentialUnit MUST be null for a REAL visible enemy: passing aimUnit
    // marks the target hypothetical and incorrectly accepts empty rays.
    // Never touch native BattleAction or mark obstacles on the real map.
    // The user may have locked a visible 2x2 unit by its overlapping tile.
    // Resolve its owning tile for the engine's voxel scanner. Critically,
    // this ray probe must NOT gate H/B/M: it can find no straight line
    // while the probabilistic simulation still needs to show blockage.
    BattleUnit *aimUnit=targetTile->getOverlappingUnit(_save);
    Tile *aimRootTile=aimUnit ? _save->getTile(aimUnit->getPosition()) : nullptr;
    if (aimUnit && aimRootTile && aimUnit->getVisible() && aimUnit!=soldier &&
        !testAction.sprayTargeting &&
        !(Options::forceFire && _save->isCtrlPressed(true)) &&
        (targetTile->isDiscovered(O_FLOOR) || aimUnit->getVisible()))
    {
        unsigned long long aimKey=1469598103934665603ULL;
        auto aimMix=[&](unsigned long long v) {
            aimKey^=v; aimKey*=1099511628211ULL;
        };
        for(int v : std::initializer_list<int>{
            soldier->getId(),source.x,source.y,source.z,
            target.x,target.y,target.z,stanceDelta,
            (int)testAction.type, (int)Options::oxceEnableOffCentreShooting,
            aimUnit->getPosition().x,aimUnit->getPosition().y,
            aimUnit->getPosition().z,aimUnit->getHeight()})
            aimMix(static_cast<unsigned>(v));
        aimMix(static_cast<unsigned long long>(reinterpret_cast<uintptr_t>(aimUnit)));
        aimMix(static_cast<unsigned long long>(reinterpret_cast<uintptr_t>(previewVacatedUnit)));
        aimMix(static_cast<unsigned long long>(reinterpret_cast<uintptr_t>(native->weapon)));
        const Uint32 aimNow=SDL_GetTicks();
        if (aimKey != _r22NativeAimKey ||
            aimNow-_r22NativeAimCheckedAt>900U)
        {
            _r22NativeAimFound=false;
            _r22NativeAimSide=0;
            _r22NativeAimGoal=goal;
            const BattleActionOrigin sides[3]={
                BattleActionOrigin::CENTRE,BattleActionOrigin::LEFT,
                BattleActionOrigin::RIGHT};
            for(int side=0;side<3;++side)
            {
                if (side>0 && !Options::oxceEnableOffCentreShooting) break;
                BattleAction testSide=testAction;
                testSide.relativeOrigin=sides[side];
                Position candidateOrigin=r32VirtualMuzzle(testSide,startTile,
                    stanceDelta,source!=soldier->getPosition());
                Position candidateGoal=goal;
                if (_save->getTileEngine()->canTargetUnit(
                    &candidateOrigin,aimRootTile,&candidateGoal,soldier,
                    false,nullptr,true,previewVacatedUnit))
                {
                    _r22NativeAimFound=true;
                    _r22NativeAimSide=side;
                    _r22NativeAimGoal=candidateGoal;
                    break;
                }
            }
            _r22NativeAimKey=aimKey;
            _r22NativeAimCheckedAt=aimNow;
        }
        if (_r22NativeAimFound)
        {
            goal=_r22NativeAimGoal;
            testAction.relativeOrigin=
                _r22NativeAimSide==1 ? BattleActionOrigin::LEFT :
                _r22NativeAimSide==2 ? BattleActionOrigin::RIGHT :
                BattleActionOrigin::CENTRE;
        }
        else
        {
            // No direct exposed voxel from this VIRTUAL firing tile.
            // Keep the default geometric aim point and sample native
            // trajectories. B may reach 100%, but never erase the HUD.
            testAction.relativeOrigin=BattleActionOrigin::CENTRE;
        }
    }
    Position muzzle = r32VirtualMuzzle(testAction,startTile,stanceDelta,
        source!=soldier->getPosition());
    std::vector<Position> bullet;
    VoxelType collision = _save->getTileEngine()->calculateLineVoxel(muzzle,goal,true,&bullet,soldier,nullptr,true,previewVacatedUnit);
    seen.clear();
    for (const Position& voxel : bullet)
    {
        if (voxel.x < 0 || voxel.y < 0 || voxel.z < 0) continue;
        const int tx=voxel.x/16, ty=voxel.y/16, tz=voxel.z/24;
        if (tx>=width || ty>=length || tz>=_save->getMapSizeZ() || tz>viewZ) continue;
        if (!seen.insert((tz*length+ty)*width+tx).second) continue;
        Tile *t = _save->getTile(Position(tx,ty,tz));
        if (!t || !t->isDiscovered(O_FLOOR)) continue;
        Position xy;
        _camera->convertVoxelToScreen(Position(tx*16+8,ty*16+8,
            tz*24-t->getTerrainLevel()+1), &xy);
        setPixel(xy.x+1,xy.y,73);
    }
    if (source.z <= viewZ)
    {
        const Position v(source.x*16, source.y*16,
            source.z*24-startTile->getTerrainLevel()+1);
        Position corners[4] = {v, v+Position(16,0,0),v+Position(16,16,0),v+Position(0,16,0)};
        Position xy[4];
        for (int i=0;i<4;++i) _camera->convertVoxelToScreen(corners[i], &xy[i]);
        for (int i=0;i<4;++i)
            drawLine(xy[i].x,xy[i].y,xy[(i+1)%4].x,xy[(i+1)%4].y,160);
    }
    if (!bullet.empty() && source.z<=viewZ)
    {
        Position a,b;
        _camera->convertVoxelToScreen(muzzle,&a);
        _camera->convertVoxelToScreen(bullet.back(),&b);
        drawLine(a.x,a.y,b.x,b.y,73);
    }
    // Never show hidden-target hit probabilities or unexplored geometry.
    // Confirmed native target is independent of the real soldier's
    // firing line. ALWAYS sample H/B/M from source=cursor when discovered.
    // Even an impossible straight line is a legitimate B/M probability.
    if((targetTile->isDiscovered(O_FLOOR) ||
        (aimUnit && aimUnit->getVisible())) &&
        (!aimUnit || aimUnit->getVisible()))
        r22DrawStats(source,target,goal,muzzle);
    else
        _r22StatsText.clear();
    r22DrawRemoteTargetHud(target,goal);
    const double dx=goal.x-muzzle.x,dy=goal.y-muzzle.y,dz=goal.z-muzzle.z;
    const double intended=dx*dx+dy*dy+dz*dz;
    const Position impact=bullet.empty()?goal:bullet.back();
    const double traveled=(impact.x-muzzle.x)*dx+
        (impact.y-muzzle.y)*dy+(impact.z-muzzle.z)*dz;
    if(collision!=V_EMPTY && !bullet.empty() && intended>0 &&
       traveled<intended &&
       _save->getTile(impact.toTile()) &&
       _save->getTile(impact.toTile())->isDiscovered(O_FLOOR))
    {
        Position xy;
        _camera->convertVoxelToScreen(bullet.back(), &xy);
        drawLine(xy.x-2,xy.y-2,xy.x+2,xy.y+2,32);
        drawLine(xy.x-2,xy.y+2,xy.x+2,xy.y-2,32);
        Tile *impactTile=_save->getTile(impact.toTile());
        if(impactTile)
        {
            bool explosive=false;
            for(int part=0;part<=3;++part)
            {
                MapData *piece=impactTile->getMapData(static_cast<TilePart>(part));
                if(piece && piece->getExplosive()>0)explosive=true;
            }
            if (explosive)
            {
                drawString(xy.x+3,xy.y-4,"MCD!",32);
            }
        }
    }
    // R29: draw this *after* legacy trajectory/risk markings so candidate
    // B colors stay visible; this never touches native click processing.
    if (confirmedTarget && native->type != BA_THROW)
    {
        if (native->sprayTargeting || native->weapon->getArcingShot(native->type))
        {
            // R68: use native LOS/LOF/projectile samples, never a nominal
            // range-only full-screen diamond for curved actions.
            r29DrawTargetBlockGrid(soldier, native, target);
        }
        else r29DrawTargetBlockGrid(soldier, native, target);
    }
    else r29ClearBlockGrid();
    // R53: project the exact r32VirtualMuzzle used above for the ray and
    // trajectory preview. R52's 2x2 best-cell selection is reused natively.
    if (native->type != BA_THROW && source.z <= viewZ)
        drawMuzzleGyro(muzzle, goal);
    // Fixed-width 5-letter stance and readable backplate for any terrain.
    if (!_r22StatsText.empty())
    {
        const bool simulated = _r22StanceOverride &&
            (_r22Kneel != soldier->isKneeled());
        const bool kneel = simulated ? _r22Kneel : soldier->isKneeled();
        r22DrawContrastHud(kneel ? "KNEEL" : "STAND",simulated,
                           " | "+r114Tu+" "+_r22StatsText);
    }

    // RC55: break out range, TU, arrows/ammo, damage and H/B/M samples.
    // The panel is read-only and never changes native targeting or RNG.
    if (r64AreaHud)
        r56DrawBlastEnvelope(native,target,source,true,
            r64BlackPowderBomb ? "BOMB IF" : "FLAME IF");
    else if (native->type != BA_THROW)
        r55DrawAimDetailHud(soldier, native, source, target, muzzle, goal,
                             confirmedTarget);

    // R30.2: default to ONE contextual resistance, not the twenty-type
    // fullscreen table. Shift+F8 toggles the expanded reference on demand.
    // Draw-only: never reveal hidden targets or edit tactical state.
    BattleUnit *resistTarget = targetTile->getOverlappingUnit(_save);
    if ((r59DetailedHud || _r30FullResists) &&
        resistTarget && resistTarget != soldier && resistTarget->getVisible() &&
        resistTarget->getArmor() && resistTarget->getFaction() != soldier->getFaction())
    {
        static const char codes[DAMAGE_TYPES] = {
            'C','P','F','H','L','A','D','K','X','S',
            'N','B','E','M','W','I','T','R','O','Q'
        };
        // RuleDamageType index (ResistType), not arbitrary local naming.
        static const char* names[DAMAGE_TYPES] = {
            "CHARM","PIERC","FIRE","IMPACT","LASER",
            "PLASMA","DAZE","CUT","CHEM","CHOKE",
            "AE511","BIO","ELEC","EMP","WARP",
            "MIND","STAB16","HEAT","COLD","TYPE19"
        };
        const SDL_Color *pal=getPalette();
        if (pal)
        {
            Uint8 dark=1, bright=15;
            int low=2147483647, high=-1;
            for (int c=1;c<256;++c)
            {
                const SDL_Color &rgb=pal[c];
                const int lum=2126*int(rgb.r)+7152*int(rgb.g)+722*int(rgb.b);
                if (lum<low) { low=lum; dark=static_cast<Uint8>(c); }
                if (lum>high) { high=lum; bright=static_cast<Uint8>(c); }
            }
            if (_r30FullResists)
            {
                // Explicitly requested reference view. F8 alone still toggles
                // the original R22/R29 overlay; Shift+F8 closes this view.
                const int cols=3;
                for (int dt=0;dt<DAMAGE_TYPES;++dt)
                {
                    const float modifier=resistTarget->getArmor()->getDamageModifier(
                        static_cast<ItemDamageType>(dt));
                    const int taken=static_cast<int>(modifier*100.0f+
                        (modifier>=0 ? 0.5f : -0.5f));
                    // R67: replace '=' with a native-palette square.
                    // Type names keep the original white/gold text.
                    // RC82's red/blue tint remains ONLY on the number.
                    const std::string before=std::string(1,codes[dt])+
                        ':'+names[dt];
                    const std::string prefix=before+"  ";
                    const std::string value=std::to_string(taken);
                    const std::string label=prefix+value;
                    const int x=(dt%cols)*104;
                    const int y=27+(dt/cols)*11;
                    const int width=std::min(getWidth()-x,
                        5+r68SmallHudWidth(label));
                    if (width>6 && y+10<=getHeight())
                    {
                        drawRect(x,y,width,10,dark);
                        drawString(x+2,y+1,label.c_str(),bright);
                        // Two blank cells take the '=' character's place.
                        r67DrawDamageSwatch(
                            x+2+r68SmallHudWidth(before),y+1,dt);
                        if (taken != 100)
                            r80DrawHudTint(x+2+r68SmallHudWidth(prefix),y+1,
                                value,taken>100);
                        r40RememberHudRect(x, y, width, 10);
                    }
                }
                const std::string hint="SHIFT+F8 BACK | 0 IMM 100 NORM 200 2X";
                const int y=27+((DAMAGE_TYPES+cols-1)/cols)*11;
                const int width=std::min(getWidth(),
                    5+r68SmallHudWidth(hint));
                if (width>6 && y+10<=getHeight())
                {
                    drawRect(0,y,width,10,dark);
                    drawString(2,y+1,hint.c_str(),bright);
                    r40RememberHudRect(0, y, width, 10);
                }
            }
            else
            {
                // Match OXCE's actual ammo selection: the loaded ammunition
                // determines the projectile's damage type, not gun identity.
                // A thrown non-grenade has no reliable projectile damage type.
                BattleItem *damageItem=nullptr;
                if (native->type == BA_THROW)
                {
                    const BattleType type=native->weapon->getRules()->getBattleType();
                    if (type == BT_GRENADE || type == BT_PROXIMITYGRENADE)
                        damageItem=native->weapon;
                }
                else
                    damageItem=native->weapon->getAmmoForAction(
                        native->type,nullptr,nullptr);
                const RuleDamageType *damage=damageItem && damageItem->getRules()
                    ? damageItem->getRules()->getDamageType() : nullptr;
                if (damage && damage->ResistType >= DT_NONE &&
                    damage->ResistType < DAMAGE_TYPES)
                {
                    const ItemDamageType dt=damage->ResistType;
                    const float modifier=resistTarget->getArmor()->getDamageModifier(dt);
                    const int taken=static_cast<int>(modifier*100.0f+
                        (modifier>=0 ? 0.5f : -0.5f));
                    // RC83: PIERC 90% is BLUE for allies and enemies alike.
                    // Multipliers above 100% increase damage and are RED.
                    const std::string before=std::string(1,codes[dt])+
                        ':'+names[dt];
                    const std::string prefix=before+"  ";
                    const std::string value=std::to_string(taken) + '%';
                    const std::string cell=prefix+value;
                    const int width=std::min(getWidth(),
                        5+r68SmallHudWidth(cell));
                    // y=27 is below existing stance/stats (y=2) and R29
                    // block-grid key (y=16): no overlap even at 320x200.
                    if (width>6 && getHeight()>=38)
                    {
                        drawRect(0,27,width,10,dark);
                        drawString(2,28,cell.c_str(),bright);
                        // Same square replaces the delimiter in compact F8.
                        r67DrawDamageSwatch(
                            2+r68SmallHudWidth(before),28,
                            static_cast<int>(dt));
                        if (taken != 100)
                            r80DrawHudTint(2+r68SmallHudWidth(prefix),28,
                                value,taken>100);
                        r40RememberHudRect(0, 27, width, 10);
                    }
                }
            }
        }
    }
}


// LOSLOF_R22_STATISTICS_EXPERIMENTAL:
// EXPERIMENTAL - uses actual OXCE Projectile trace and accuracy, but hypothetical
// actor position/stance, pellet mode and world side effects aren't fully verified.
// Snapshot the global RNG and restore it before returning (including exceptions).

// LOSLOF_R22_RECOVERY_BETA_20261012
// Read only the already-calculated path; do not calculate/change a player's path.
Position Map::r22PlannedPosition(const BattleUnit *unit) const
{
    const Position actual=unit->getPosition();
    Pathfinding *finder=_save ? _save->getPathfinding() : nullptr;
    if(!finder || !finder->isPathPreviewed()) return actual;
    const std::vector<int>& path=finder->getPath();
    if(path.empty()) return actual;
    const bool ctrl=finder->isModifierCtrlUsed(),alt=finder->isModifierAltUsed();
    const bool running=ctrl && unit->getArmor()->allowsRunning(unit->isSmallUnit())
        && (path.size()>1 || alt);
    const bool strafing=!running && ctrl &&
        unit->getArmor()->allowsStrafing(unit->isSmallUnit()) && path.size()==1;
    const bool sneaking=!running && alt &&
        unit->getArmor()->allowsSneaking(unit->isSmallUnit());
    const BattleActionMove move=strafing ? BAM_STRAFE :
        running ? BAM_RUN : sneaking ? BAM_SNEAK : BAM_NORMAL;
    Position pos=actual;
    for(auto it=path.rbegin();it!=path.rend();++it)
    {
        if(*it<0 || *it>=10) return actual;
        const PathfindingStep step=finder->getTUCost(pos,*it,unit,nullptr,move);
        if(step.cost.time>=Pathfinding::INVALID_MOVE_COST ||
           !_save->getTile(step.pos)) return actual;
        pos=step.pos;
    }
    return pos;
}

// Restore LOS outward perimeter while retaining R21's 1x1 INTERNAL pixel dots.
// Bound voxel traces to 64 candidates per 90ms batch. A completed
// hull is cached for three seconds; moving/stance/position changes
// reset it immediately. Render cached candidates without resampling.
void Map::r22DrawVisibilityHull(const Position &source,const Position &eye,int level)
{
    if(level<0 || level>=_save->getMapSizeZ()) return;
    BattleUnit *observer=_save->getSelectedUnit();
    Tile *virtualTile=_save->getTile(source);
    BattleUnit *previewVacatedUnit = observer && virtualTile && source!=observer->getPosition() ?
        virtualTile->getOverlappingUnit(_save) : nullptr;
    if(previewVacatedUnit &&
       (previewVacatedUnit==observer ||
        previewVacatedUnit->getFaction()!=observer->getFaction()))
        previewVacatedUnit=nullptr;
    const int width=_save->getMapSizeX(),length=_save->getMapSizeY();
    const int range=std::min(16,_save->getTileEngine()->getMaxViewDistance());
    if(range<=0 || width<1 || length<1) return;

    unsigned long long key=1469598103934665603ULL;
    const int factors[]={_save->getSelectedUnit()->getId(),source.x,source.y,
        source.z,eye.x,eye.y,eye.z,level,width,length,range};
    for(int x:factors)
    {
        key^=static_cast<unsigned>(x);
        key*=1099511628211ULL;
    }
    const int minX=std::max(0,source.x-range);
    const int maxX=std::min(width-1,source.x+range);
    const int minY=std::max(0,source.y-range);
    const int maxY=std::min(length-1,source.y+range);
    if(minX>maxX || minY>maxY) return;
    const int spanX=maxX-minX+1;
    const size_t scanTotal=size_t(spanX)*size_t(maxY-minY+1);
    const Uint32 tick=SDL_GetTicks();
    // Refresh terrain/door changes, but only after the preceding scan finishes.
    const bool restart =
        _r22VisibleHull.size()!=size_t(width*length) || key!=_r22HullHash ||
        (_r22HullNextIndex>=scanTotal && tick-_r22HullCheckedAt>3000U);
    if(restart)
    {
        _r22VisibleHull.assign(size_t(width*length),0);
        _r22HullNextIndex=0;
        _r22HullHash=key;
        _r22HullCheckedAt=tick;
        _r22HullLastBatchTick=0;
    }
    const bool wasPending=_r22HullNextIndex<scanTotal;
    if(restart || tick-_r22HullLastBatchTick>=90U)
    {
        _r22HullLastBatchTick=tick;
        unsigned processed=0;
        const int radius2=range*range;
        while(_r22HullNextIndex<scanTotal && processed<64U)
        {
            const size_t index=_r22HullNextIndex++;
            ++processed; // even out-of-range candidates consume budget
            const int x=minX+int(index%size_t(spanX));
            const int y=minY+int(index/size_t(spanX));
            const int dx=x-source.x,dy=y-source.y;
            if(dx*dx+dy*dy>radius2) continue;
            Tile *tile=_save->getTile(Position(x,y,level));
            if(!tile || !tile->isDiscovered(O_FLOOR)) continue;
            const Position goal(x*16+8,y*16+8,
                level*24-tile->getTerrainLevel()+10);
            std::vector<Position> path;
            const int voxelResult=_save->getTileEngine()->calculateLineVoxel(
                eye,goal,true,&path,_save->getSelectedUnit(),nullptr,true,previewVacatedUnit);
            if(voxelResult==V_EMPTY || (!path.empty() &&
                path.back().toTile()==tile->getPosition()))
                _r22VisibleHull[size_t(y*width+x)]=1;
        }
    }
    _r22HullWorkPending = _r22HullNextIndex < scanTotal;
    if(wasPending && !_r22HullWorkPending) _r22HullCheckedAt=tick;
    // Avoid forcing a complete terrain repaint inside the render loop.

    const auto visible=[&](int x,int y)->bool
    {
        return x>=0 && y>=0 && x<width && y<length &&
            _r22VisibleHull[size_t(y*width+x)]!=0;
    };
    // Painting is also restricted to the local vision bounding rectangle.
    for(int y=minY;y<=maxY;++y)
    for(int x=minX;x<=maxX;++x)
    {
        if(!visible(x,y)) continue;
        Tile *t=_save->getTile(Position(x,y,level));
        if(!t) continue;
        const int z=level*24-t->getTerrainLevel()+1;
        Position mid;
        _camera->convertVoxelToScreen(Position(x*16+8,y*16+8,z),&mid);
        setPixel(mid.x,mid.y,48); // one game pixel per visible tile
        const Position world[4]={
            Position(x*16,y*16,z),Position((x+1)*16,y*16,z),
            Position((x+1)*16,(y+1)*16,z),Position(x*16,(y+1)*16,z)};
        const bool edge[4]={
            !visible(x,y-1),!visible(x+1,y),!visible(x,y+1),!visible(x-1,y)};
        Position screen[4];
        for(int i=0;i<4;++i)
            _camera->convertVoxelToScreen(world[i],&screen[i]);
        for(int i=0;i<4;++i)
        {
            if(edge[i])drawLine(screen[i].x,screen[i].y,
                screen[(i+1)%4].x,screen[(i+1)%4].y,48);
        }
    }
}

void Map::r22DrawRemoteTargetHud(const Position &target,const Position &aim)
{
    Position screen;
    _camera->convertVoxelToScreen(aim,&screen);
    const int width=getWidth(),height=_visibleMapHeight;
    const int zDiff=target.z-_camera->getViewLevel();
    const int displayedX = screen.x;
    const bool outside=displayedX<5 || displayedX>width-8 ||
        screen.y<31 || screen.y>height-15;
    if(!outside && !zDiff) return;
    const int px=std::max(3,std::min(displayedX,std::max(3,width-136)));
    const int py=std::max(30,std::min(int(screen.y),std::max(30,height-24)));
    const char *arrow=displayedX<5?"<":displayedX>width-8?">":
        screen.y<31?"^":screen.y>height-15?"v":"*";
    std::ostringstream label;
    label<<arrow<<" Z"<<(zDiff>=0?"+":"")<<zDiff;
    // Offscreen HUD is direction and Z only; do not duplicate statistics.
    std::string result=label.str();
    if(result.size()>60)result.resize(60);
    drawString(px,py,result.c_str(),160);
}


// R41: Side-effect-free sampled landing distribution for a PINNED, real-origin
// throw. A private RNG feeds the very same Projectile::calculateThrow()
// (including its 100-attempt acceptance policy) as actual gameplay.
// Percentages are estimates, NEVER deterministic hit guarantees.
std::string Map::r41DrawThrowHeatmap(BattleAction action, const Position &target,
    const Position &from, const Position &muzzle, bool virtualKneeled)
{
    if (!_save || !_camera || !action.actor || !action.weapon ||
        action.type != BA_THROW || _save->getSide() != FACTION_PLAYER)
        return "";
    Tile *targetTile = _save->getTile(target);
    if (!targetTile || (!targetTile->getVisible() &&
                        !targetTile->isDiscovered(O_FLOOR)))
        return "T/S -- AIM FOG";

    action.target = target;
    // Preserve the live relativeOrigin rather than forcing center.
    // Snapshot the entire RNG stream, including accuracy script calls.
    struct RestoreR41Rng
    {
        RNG::RandomState snapshot;
        RestoreR41Rng() : snapshot(RNG::globalRandomState()) {}
        ~RestoreR41Rng() { RNG::globalRandomState() = snapshot; }
    } preserveRng;
    const int accuracyPct = BattleUnit::getFiringAccuracy(
        BattleActionAttack::GetAferShoot(action, nullptr), _game->getMod());
    const double accuracy = accuracyPct / 100.0;
    // R73: nominal blast power and type are needed to decide whether a
    // different-floor friend can actually be reached through known terrain.
    // Prefer an overestimate of power rather than a false all-clear: real
    // thrown-item range loss is deliberately not deducted here.
    const RuleItem *throwRule = action.weapon->getRules();
    const bool throwExplosive = throwRule && throwRule->isGrenadeOrProxy();
    const RuleDamageType *blastType =
        throwExplosive ? throwRule->getDamageType() : nullptr;
    const BattleActionAttack blastAttack =
        BattleActionAttack::GetAferShoot(action, action.weapon);
    const int blastRadius = throwExplosive ? std::max(0,
        throwRule->getExplosionRadius(blastAttack)) : 0;
    int blastPower = (throwExplosive && blastType) ?
        std::max(0, throwRule->getPowerBonus(blastAttack)) : 0;
    if (blastType && blastType->FireBlastCalc) blastPower /= 2;
    // Accuracy and range/scatter depend on the proposed muzzle, not on
    // the real soldier's position while the target is pinned. The
    // projectile runs the native throw algorithm with preview-only inputs.
    const Uint32 now = SDL_GetTicks();

    unsigned long long signature = 1469598103934665603ULL;
    auto mix = [&](unsigned long long value) {
        signature ^= value; signature *= 1099511628211ULL;
    };
    mix(static_cast<unsigned>(action.actor->getId()));
    mix(reinterpret_cast<uintptr_t>(action.weapon));
    // R72: throw F must follow the active native explosion-height mode.
    // A settings change invalidates all cached landing-risk samples.
    const int explosionHeightMode = Clamp(Options::battleExplosionHeight,0,3);
    mix(static_cast<unsigned>(explosionHeightMode));
    mix(static_cast<unsigned>(blastRadius));
    mix(static_cast<unsigned>(blastPower));
    mix(reinterpret_cast<uintptr_t>(blastType));
    const int parts[] = { target.x, target.y, target.z, muzzle.x,
        muzzle.y, muzzle.z, from.x, from.y, from.z,
        int(virtualKneeled), int(action.actor->getTimeUnits()),
        action.actor->getBaseStats()->strength, action.weapon->getTotalWeight(),
        accuracyPct, targetTile->getTerrainLevel(), _save->getTurn(),
        _save->getDepth(), _save->getMapSizeX(), _save->getMapSizeY() };
    for (int p : parts) mix(static_cast<unsigned>(p));

    // Include known units because ally movement changes the blast-risk
    // estimate and visible units can change collision paths.
    // Hidden enemies must never enter the HUD cache signature.
    for (const BattleUnit *unit : *_save->getUnits())
    {
        if (!unit || (unit->getFaction() != FACTION_PLAYER &&
                      !unit->getVisible())) continue;
        const Position u = unit->getPosition();
        mix(static_cast<unsigned>(unit->getId()));
        mix(static_cast<unsigned>(u.x));
        mix(static_cast<unsigned>(u.y));
        mix(static_cast<unsigned>(u.z));
        mix(static_cast<unsigned>(unit->isOut()));
    }

    // Include local target terrain; the global known-scene fingerprint
    // below detects distant physical changes without clock expiry.
    for (int dY = -2; dY <= 2; ++dY)
    for (int dX = -2; dX <= 2; ++dX)
    {
        Tile *t = _save->getTile(target + Position(dX,dY,0));
        if (!t) continue;
        for (int part = 0; part <= 3; ++part)
            mix(reinterpret_cast<uintptr_t>(t->getMapData(static_cast<TilePart>(part))));
        mix(static_cast<unsigned>(t->getTerrainLevel()));
    }
    // RC79: do not repeat n256 after 15 seconds on an unchanged map.
    mix(r79KnownBattlefieldSignature(_save));
    if (_r41ThrowSignature != signature)
    {
        _r41ThrowSignature = signature;
        _r41ThrowChangedAt = now;
        _r41ThrowBatchAt = 0;
        _r41LandingCells.clear();
        _r41ThrowSamples = _r41Target = _r41Scatter = _r41Early = 0;
        _r41FriendlyRadius = _r41Unknown = _r41Failed = 0;
    }

    // RC84: throw/arc/fire share short, CPU-time-bounded preview updates.
    // Allow up to 48 COMPLETE throws per draw when cheap; stop after
    // ~7ms for expensive native 100-retry throws to keep input responsive.
    if (_r41ThrowSamples < r22HudMaxTrials &&
        now - _r41ThrowBatchAt >= r84HudBatchIntervalMs)
    {
        _r41ThrowBatchAt = now;
        const unsigned batch=std::min(48U,
            r22HudMaxTrials-_r41ThrowSamples);
        const int radius = blastRadius;
        const auto batchStarted=std::chrono::steady_clock::now();
        const auto timeBudget=std::chrono::milliseconds(r84HudWorkBudgetMs);
        for (unsigned i = 0; i < batch; ++i)
        {
            // Check only between full native trials, not mid-trajectory.
            if (i &&
                std::chrono::steady_clock::now()-batchStarted>=timeBudget)
                break;
            const unsigned sampleId = _r41ThrowSamples++;
            RNG::RandomState previewRng(
                signature ^ (0x9e3779b97f4a7c15ULL * (sampleId + 1)));
            // Constructing a Projectile does not create or move a real item.
            // No Map::setProjectile(), ammo, fuse, or TU methods are called.
            Projectile test(_game->getMod(), _save, action,
                from, target.toVoxel(), nullptr);
            const int collision = test.calculateThrow(accuracy, &previewRng,
                &from, &muzzle, virtualKneeled ? 1 : 0);
            const auto &trace = test.getTrajectoryForPreview();
            if (trace.empty() ||
                (collision != V_FLOOR && collision != V_UNIT &&
                 collision != V_OBJECT))
            {
                ++_r41Failed;
                continue;
            }
            const Position landing = Projectile::getPositionFromEnd(
                trace, Projectile::ItemDropVoxelOffset).toTile();
            Tile *landTile = _save->getTile(landing);
            if (!landTile) { ++_r41Failed; continue; }

            // No fog / unseen-unit leakage: never draw a result if any
            // visited tile lacks player-discovered terrain. Suppress the
            // entire probability readout when any sample is unknown.
            bool unknown = false;
            for (const Position &voxel : trace)
            {
                Tile *pathTile = _save->getTile(voxel.toTile());
                if (!pathTile ||
                    (!pathTile->getVisible() &&
                     !pathTile->isDiscovered(O_FLOOR)))
                { unknown = true; break; }
                // A hidden hostile standing on a previously visited tile
                // must never be discoverable via the probability heatmap.
                BattleUnit *other = pathTile->getOverlappingUnit(_save);
                if (other && other != action.actor && !other->getVisible()
                    && other->getFaction() != FACTION_PLAYER)
                { unknown = true; break; }
            }
            if (unknown || (!landTile->getVisible() &&
                            !landTile->isDiscovered(O_FLOOR)))
            {
                ++_r41Unknown;
                continue;
            }
            if (landing == target) ++_r41Target;
            else ++_r41Scatter;

            // EARLY is an independent indicator and may overlap SCATTER.
            const Position firstHit = trace.back().toTile();
            const bool early = (collision == V_OBJECT || collision == V_UNIT)
                && firstHit != target;
            if (early) ++_r41Early;

            const int index = (landing.z * _save->getMapSizeY() + landing.y)
                * _save->getMapSizeX() + landing.x;
            R41LandingCell &cell = _r41LandingCells[index];
            // A given landing tile has the same known scene and risk for
            // all preview trials until the throw signature changes. Cache
            // the expensive native blast-ray replay per unique landing.
            bool friendlyInRadius = cell.count && cell.friendlyRadius;
            if (!cell.count && radius > 0)
            {
                const int radiusSquared = radius*radius;
                bool sameFloorCandidate = false;
                std::set<int> crossFloorTiles;
                for (const BattleUnit *unit : *_save->getUnits())
                {
                    if (!unit || unit->isOut() ||
                        unit->getFaction() != FACTION_PLAYER) continue;
                    const Position other = unit->getPosition();
                    const int dz = other.z - landing.z;
                    // R72: a flat explosion (height 0) normally cannot
                    // damage a soldier standing on a different floor.
                    if (explosionHeightMode == 0 && dz != 0) continue;
                    // Consider all four cells of a large 2x2 unit.
                    const int footprint = unit->isBigUnit() ? 2 : 1;
                    for (int fy=0; fy<footprint; ++fy)
                    for (int fx=0; fx<footprint; ++fx)
                    {
                        const int dx=other.x+fx-landing.x;
                        const int dy=other.y+fy-landing.y;
                        if (dx*dx + dy*dy + dz*dz > radiusSquared) continue;
                        if (!dz)
                            sameFloorCandidate = true;
                        else
                        {
                            const int allyId = ((other.z*_save->getMapSizeY()
                                +other.y+fy)*_save->getMapSizeX())+other.x+fx;
                            crossFloorTiles.insert(allyId);
                        }
                    }
                }
                friendlyInRadius = sameFloorCandidate || !crossFloorTiles.empty();
                // R73: in 3-D modes, an upper/lower-floor ally inside the
                // geometric sphere is NOT necessarily exposed. Replay
                // native blast propagation over visible terrain, looking
                // only at rays that could reach those allied cells.
                // If the relevant geometry is unknown, KEEP the warning.
                if (!sameFloorCandidate && !crossFloorTiles.empty() &&
                    explosionHeightMode > 0 && blastType &&
                    blastPower > 0 && radius <= 11)
                {
                    std::map<int,int> exposure;
                    bool uncertain = false;
                    const Position epicenter = landing.toVoxel() +
                        Position(8,8,1-landTile->getTerrainLevel());
                    r57ComputeVisibleBlastExposure(_save,
                        _save->getTileEngine(), epicenter, blastPower,
                        radius, blastType, exposure, uncertain,
                        &crossFloorTiles);
                    if (!uncertain)
                    {
                        friendlyInRadius = false;
                        for (int allyId : crossFloorTiles)
                            if (exposure.count(allyId))
                            { friendlyInRadius = true; break; }
                    }
                }
            }
            if (friendlyInRadius) ++_r41FriendlyRadius;
            cell.tile = landing;
            ++cell.count;
            if (early) ++cell.early;
            if (friendlyInRadius) ++cell.friendlyRadius;
        }
        // preserveRng restores even if a native script consumes RNG.
    }

    // RC63: FOG invalidates only the affected trial. In RC62 a single
    // unknown trajectory permanently replaced all the accumulating landing
    // percentages after about one second. Keep the verified subset visible,
    // with an explicit uncertainty indicator instead of making up accuracy.
    const unsigned verified = _r41Target + _r41Scatter;
    // A failed native throw is an outcome, not an excluded attempt.
    // Report actual failure probability rather than making T+S=100%.
    const unsigned knownAttempts = verified + _r41Failed;
    if (_r41ThrowSamples < 32U)
    {
        std::ostringstream text;
        text << "SAMPLE " << _r41ThrowSamples << "/256";
        if (_r41Unknown) text << '?';
        return text.str();
    }
    if (!knownAttempts)
    {
        std::ostringstream text;
        text << "T/S/X -- FOG n0/" << _r41ThrowSamples;
        return text.str();
    }

    const int observed = static_cast<int>(knownAttempts);
    // Use the active X-Piratez palette to choose actual green/yellow/
    // orange/red rather than assuming the same indexes in every mission.
    auto paletteColor = [&](int r, int g, int b) -> Uint8 {
        const SDL_Color *palette = getPalette();
        int best = 1, score = 0x7fffffff;
        if (!palette) return 1;
        for (int i = 1; i < 256; ++i)
        {
            const int dr = r - int(palette[i].r);
            const int dg = g - int(palette[i].g);
            const int db = b - int(palette[i].b);
            const int dist = dr*dr + dg*dg + db*db;
            if (dist < score) { score = dist; best = i; }
        }
        return static_cast<Uint8>(best);
    };
    const Uint8 green = paletteColor(30,230,100);
    const Uint8 yellow = paletteColor(250,225,40);
    const Uint8 orange = paletteColor(255,130,30);
    const Uint8 red = paletteColor(245,50,55);
    for (const auto &entry : _r41LandingCells)
    {
        const R41LandingCell &cell = entry.second;
        if (cell.tile.z > _camera->getViewLevel()) continue;
        Tile *t = _save->getTile(cell.tile);
        if (!t || (!t->getVisible() && !t->isDiscovered(O_FLOOR)))
            continue;
        const int strength = static_cast<int>(100 * cell.count / observed);
        Position screen;
        _camera->convertVoxelToScreen(
            cell.tile.toVoxel() + Position(8,8,1-t->getTerrainLevel()), &screen);
        const Uint8 color = cell.friendlyRadius ? red :
            (cell.early ? orange : cell.tile == target ? green : yellow);
        // Pixel footprint conveys the observed landing weight. Keep every
        // sampled cell visible even below 1%; N indicates uncertainty.
        const int size = strength >= 25 ? 7 :
            strength >= 10 ? 5 : strength >= 3 ? 3 : 1;
        drawRect(screen.x - size/2, screen.y - size/2, size, size, color);
    }
    // Aim cross remains visible over the distribution.
    Position targetScreen;
    _camera->convertVoxelToScreen(
        target.toVoxel() + Position(8,8,1-targetTile->getTerrainLevel()),
        &targetScreen);
    drawLine(targetScreen.x-7,targetScreen.y,targetScreen.x+7,targetScreen.y,green);
    drawLine(targetScreen.x,targetScreen.y-5,targetScreen.x,targetScreen.y+5,green);

    // Percentages include failed native throws (X). Only trials crossing
    // unknown fog are omitted and marked with '?'. E and F can overlap S.
    auto percentage = [observed](unsigned n) -> int {
        return (int)((100U * n + observed/2) / observed);
    };
    std::ostringstream text;
    // X is the percent of attempts which the live throw engine would
    // reject after its 100 retries, e.g. repeated window collisions.
    // '?' denotes partial FOG data, not an unearned zero probability.
    text << "T" << percentage(_r41Target)
         << " S" << percentage(_r41Scatter)
         << " E" << percentage(_r41Early)
         << " F" << percentage(_r41FriendlyRadius)
         << " X" << percentage(_r41Failed)
         << " n" << observed;
    if (_r41Unknown) text << "?";
    return text.str();
}

// LOSLOF_R22_THROW_PREVIEW_RECOVERY
// Read-only world preview; virtual position and stance actually affect
// native engine throw range and parabolic collision. Re-evaluate cache
// immediately if thrower, target, weapon, stance, floor or 300ms changes.
void Map::r22DrawThrowPreview(const Position& from,const Position& destination,
    const Tile* originTile,const Tile* targetTile)
{
    BattleUnit *actor=_save->getSelectedUnit();
    BattleAction *active=_save->getBattleGame()->getCurrentAction();
    if(!actor || !active || active->actor!=actor || !active->weapon ||
       !originTile || !targetTile) return;
    BattleAction action=*active;
    // Match ProjectileFlyBState::init(): elevated -24 terrain retargets to
    // the floor directly above BEFORE native validateThrow/calculateThrow.
    Position executionTarget = destination;
    const Tile *executionTargetTile = targetTile;
    if (targetTile->getTerrainLevel() == -24 &&
        destination.z + 1 < _save->getMapSizeZ())
    {
        executionTarget.z += 1;
        executionTargetTile = _save->getTile(executionTarget);
        if (!executionTargetTile) return;
    }
    action.target=executionTarget;
    const bool virtualKneeled=_r22StanceOverride ? _r22Kneel : actor->isKneeled();
    const int stanceDelta=(virtualKneeled?actor->getKneelHeight():
        actor->getStandHeight())-actor->getHeight();
    // Native origin is mandatory for a real, pinned throw. Virtual
    // previews retain the old geometry and are labeled hypothetical.
    const bool realSource = from == actor->getPosition() &&
        virtualKneeled == actor->isKneeled();
    // A hypothetical source is not a way of scouting unexplored tiles.
    BattleUnit *sourceOccupant = originTile->getOverlappingUnit(_save);
    if ((!realSource && !originTile->getVisible() &&
         !originTile->isDiscovered(O_FLOOR)) ||
        (sourceOccupant && sourceOccupant != actor &&
         sourceOccupant->getFaction() != FACTION_PLAYER &&
         !sourceOccupant->getVisible()))
    {
        _r22StatsText.clear();
        r22DrawContrastHud(virtualKneeled ? "KNEEL" : "STAND",
            !realSource, " | THROW SOURCE FOG");
        // Even an uncertain virtual origin does not erase the weapon's
        // known, conditional blast statistics on an explicitly aimed tile.
        r56DrawBlastEnvelope(&action,executionTarget,from,true,"THR IF");
        return;
    }
    // For a hypothetical origin occupied by an ally, vacate the preview
    // collision only, just as the pinned shooting HUD already does.
    BattleUnit *previewVacatedUnit = !realSource && from != actor->getPosition() &&
        sourceOccupant && sourceOccupant != actor &&
        sourceOccupant->getFaction() == actor->getFaction()
        ? sourceOccupant : nullptr;
    Position origin = realSource
        ? _save->getTileEngine()->getOriginVoxel(action, nullptr)
        : r32VirtualMuzzle(action,const_cast<Tile*>(originTile),
            stanceDelta,from!=actor->getPosition());
    const Position goal=executionTarget.toVoxel()+
        Position(8,8,1-executionTargetTile->getTerrainLevel());

    unsigned long long key=1469598103934665603ULL;
    const int args[]={actor->getId(),from.x,from.y,from.z,
        executionTarget.x,executionTarget.y,executionTarget.z,
        origin.x,origin.y,origin.z,
        executionTargetTile->getTerrainLevel(), int(virtualKneeled),
        active->weapon->getTotalWeight()};
    for(int x:args){key^=static_cast<unsigned>(x);key*=1099511628211ULL;}
    key^=reinterpret_cast<uintptr_t>(active->weapon);
    key*=1099511628211ULL;
    const Uint32 time=SDL_GetTicks();
    if(key!=_r22ThrowCacheKey || time-_r22ThrowCacheTime>300U)
    {
        _r22ThrowTrajectory.clear();
        _r22ThrowValid=false;
        double curve=0.0;
        int nativeCollision=V_EMPTY;
        // Modified ONLY for preview with 3 trailing arguments.
        // Default real-shot semantics stay identical in TileEngine.
        const bool nativeArc=_save->getTileEngine()->validateThrow(action,origin,goal,
             _save->getDepth(),&curve,&nativeCollision,false,
             false,&from,virtualKneeled?1:0,true,previewVacatedUnit);
        if(nativeArc)
        {
            const int result=_save->getTileEngine()->calculateParabolaVoxel(
                origin,goal,true,&_r22ThrowTrajectory,actor,curve,
                Position(0,0,0),false,previewVacatedUnit);
            // LOSLOF_R22_THROW_WINDOW_AND_LIVE_GRENADE_OPTION
            // Same accepted impact kinds as native throw execution, NOT
            // merely result!=V_OUTOFBOUNDS (which includes window/walls).
            bool accepted=(result==V_FLOOR || result==V_UNIT ||
                           result==V_OBJECT) &&
                          !_r22ThrowTrajectory.empty();
            if(accepted)
            {
                // Exactly mirror Projectile::calculateThrow's item-drop
                // position and impassable-object rejection.
                const Position itemTile=Projectile::getPositionFromEnd(
                    _r22ThrowTrajectory,Projectile::ItemDropVoxelOffset).toTile();
                Tile *endTile=_save->getTile(itemTile);
                if(!endTile) accepted=false;
                else if(endTile->getMapData(O_OBJECT) &&
                        endTile->getMapData(O_OBJECT)->getTUCost(MT_WALK)
                            ==Pathfinding::INVALID_MOVE_COST &&
                        !(endTile->isBigWall() &&
                          (endTile->getMapData(O_OBJECT)->getBigWall()<1 ||
                           endTile->getMapData(O_OBJECT)->getBigWall()>3)))
                    accepted=false;
            }
            _r22ThrowValid=accepted;
        }
        else
        {
            // Show the blocked/parabola path too, rather than an empty
            // screen when range, railings or low ceilings reject the arc.
            const double strength=std::max<int>(1,actor->getBaseStats()->strength);
            const double weight=std::max(1,active->weapon->getTotalWeight());
            const double firstCurve=std::max(0.48,
                1.73/std::sqrt(std::sqrt(strength/weight))+
                (virtualKneeled ? 0.1 : 0.0));
            _save->getTileEngine()->calculateParabolaVoxel(origin,goal,true,
                &_r22ThrowTrajectory,actor,firstCurve,Position(0,0,0),
                false,previewVacatedUnit);
        }
        // Match BattlescapeGame::primaryAction() second-click preflight.
        // The live check uses the original target and muzzle for RANGE,
        // then adjusts elevated -24 tiles before the native arc test.
        if (realSource)
        {
            BattleAction liveCheck = *active;
            liveCheck.target = destination;
            Tile *clickedTile = _save->getTile(destination);
            bool liveArc = false;
            if (clickedTile)
            {
                const Position liveMuzzle = _save->getTileEngine()->getOriginVoxel(
                    liveCheck, nullptr);
                const bool liveRange = ProjectileFlyBState::validThrowRange(
                    &liveCheck, liveMuzzle, clickedTile, _save->getDepth());
                liveCheck.target = executionTarget;
                liveArc = liveRange && _save->getTileEngine()->validateThrow(
                    liveCheck, liveMuzzle, goal, _save->getDepth(), nullptr,
                    nullptr, false, false, nullptr, -1, true);
            }
            _r22ThrowValid = liveArc;
        }
        _r22ThrowCacheKey=key;
        _r22ThrowCacheTime=time;
    }
    // R32: render the real parabolic VOXEL path (not floor-level dots).
    // Filter by already explored XY map positions; don't reveal fog tiles.
    const int width=_save->getMapSizeX(),length=_save->getMapSizeY();
    Position previous(0,0,0);
    bool hasPrevious=false;
    // Draw sampled landing heatmap BEFORE the reference arc so both stay
    // readable in overlapping tiles and across 90-degree view rotations.
    const bool pinned = !active->waypoints.empty() && active->targeting;
    bool baselineFog = false;
    for (const Position &voxel : _r22ThrowTrajectory)
    {
        Tile *seen = _save->getTile(voxel.toTile());
        if (!seen || (!seen->getVisible() && !seen->isDiscovered(O_FLOOR)))
        { baselineFog = true; break; }
        BattleUnit *occupant = seen->getOverlappingUnit(_save);
        if (occupant && occupant != actor && !occupant->getVisible() &&
            occupant->getFaction() != FACTION_PLAYER)
        { baselineFog = true; break; }
    }
    // RC63: an unknown reference path cannot be called CLEAR/BLOCKED,
    // but MUST NOT erase weapon details or independently verified trials.
    // Suppress only the unreliable reference path drawing below.
    // Both real and hypothetical origins use the SAME native 100-retry
    // throw sampler. The cursor's world XY/Z and muzzle are passed to
    // every probability trial, not just to the reference parabola.
    std::string probabilityText = pinned
        ? r41DrawThrowHeatmap(action,executionTarget,from,origin,virtualKneeled)
        : " | CLICK TARGET FOR PROB";
    // Native line through unknown terrain is never drawn as a claimed
    // verified impact. Partial MC and static conditional blast info remain.
    const Uint8 arcColor=_r22ThrowValid ? 73 : 32;
    const size_t step=std::max<size_t>(1,_r22ThrowTrajectory.size()/80);
    if (!baselineFog)
    for(size_t i=0;i<_r22ThrowTrajectory.size();i+=step)
    {
        const Position &voxel=_r22ThrowTrajectory[i];
        if(voxel.x<0 || voxel.y<0 || voxel.z<0) { hasPrevious=false; continue; }
        const int x=voxel.x/16,y=voxel.y/16,z=voxel.z/24;
        if(x>=width || y>=length || z>=_save->getMapSizeZ())
        { hasPrevious=false; continue; }
        // The path can rise above camera Z without changing the XY tile's
        // visibility; use view-level discovery to avoid exposing new ground.
        Tile *known=_save->getTile(Position(x,y,
            std::min(z,_camera->getViewLevel())));
        if(!known || (!known->isDiscovered(O_FLOOR) && !known->getVisible()))
        { hasPrevious=false; continue; }
        Position point;
        _camera->convertVoxelToScreen(voxel,&point);
        if(hasPrevious) drawLine(previous.x,previous.y,point.x,point.y,arcColor);
        else setPixel(point.x,point.y,arcColor);
        previous=point;
        hasPrevious=true;
    }
    if(!baselineFog && !_r22ThrowTrajectory.empty())
    {
        const Position impactVoxel=_r22ThrowTrajectory.back();
        Tile *known=_save->getTile(impactVoxel.toTile());
        if(known && (known->isDiscovered(O_FLOOR) || known->getVisible()))
        {
            Position impact;
            _camera->convertVoxelToScreen(impactVoxel,&impact);
            const Uint8 marker=_r22ThrowValid ? 73 : 32;
            drawLine(impact.x-3,impact.y-3,impact.x+3,impact.y+3,marker);
            drawLine(impact.x-3,impact.y+3,impact.x+3,impact.y-3,marker);
        }
    }
    _r22StatsText.clear(); // Never display stale gun H/B/M while throwing.
    const bool simulated = !realSource;
    std::string arcReason = _r22ThrowValid ? "ARC CLEAR" : "ARC BLOCKED";
    if (!_r22ThrowValid)
    {
        const bool blockedObject = executionTargetTile->getMapData(O_OBJECT) &&
            executionTargetTile->getMapData(O_OBJECT)->getTUCost(MT_WALK) ==
                Pathfinding::INVALID_MOVE_COST &&
            !(executionTargetTile->isBigWall() &&
                (executionTargetTile->getMapData(O_OBJECT)->getBigWall() < 1 ||
                 executionTargetTile->getMapData(O_OBJECT)->getBigWall() > 3));
        if (blockedObject) arcReason = "ARC BLOCKED: OBSTACLE";
        else
        {
            BattleAction rangeAction = action;
            rangeAction.target = destination;
            if (!ProjectileFlyBState::validThrowRange(&rangeAction, origin,
                    const_cast<Tile*>(targetTile), _save->getDepth(), &from))
                arcReason = "ARC BLOCKED: RANGE";
            else arcReason = "ARC BLOCKED: TRAJECTORY / LANDING";
        }
    }
    // RC63: compact F8 retains T/S/E/F and verified sample count;
    // Shift+F8 provides complete labelled rows, including unverified
    // samples, costs, resistance and blast damage for nearby visible foes.
    if (baselineFog) arcReason = "ARC UNKNOWN (FOG)";
    // OK is native click preflight (not a guarantee about RNG scatter).
    // A pinned sample with rejected live-style attempts says RISK.
    const std::string shortReason = baselineFog ? "?" :
        (!_r22ThrowValid ? "NO" :
         (pinned && _r41ThrowSamples < 32U ? "..." :
          (pinned && _r41Failed > 0U ? "RISK" : "OK")));
    std::string hudText = " | " +
        (simulated ? std::string("S ") : std::string()) +
        shortReason + " " + probabilityText;
    const int capacity = std::max(0,(getWidth()-42)/8);
    if (static_cast<int>(hudText.size()) > capacity)
    {
        // Keep every metric in the detailed panel rather than silently
        // truncating a partial number on the compact row.
        // Prefer retaining the rejection probability X on small screens;
        // detailed E/F risk diagnostics remain in Shift+F8.
        const size_t first = hudText.find(" E");
        const size_t fail = hudText.find(" X");
        const size_t last = fail != std::string::npos ? fail : hudText.find(" n");
        if (first!=std::string::npos && last!=std::string::npos && first<last)
            hudText.erase(first,last-first);
    }
    r22DrawContrastHud(virtualKneeled ? "KNEEL" : "STAND",simulated,
                       hudText);
    // RC56: a thrown grenade may DETONATE at its actual landing tile.
    // The circle is only the hypothetical result of a detonation at
    // the pinned aim tile; R41 is still the landing/scatter oracle.
    // AOE is explicitly conditional on detonation at the AIM tile, so it
    // belongs in the detail view even if the actual landing path is FOG
    // or the throw has not yet been confirmed.
    r56DrawBlastEnvelope(&action,executionTarget,from,true,"THR IF");
    r22DrawRemoteTargetHud(executionTarget,goal);
}

// R46: lightweight action identity used even when H ranking is unavailable.
// A psi/throw/arc action must not leave the hotkey rank permanently dormant
// after the player changes back to a supported gun action.
static unsigned long long r46ActionFingerprint(SavedBattleGame *battle,
                                                BattleUnit *actor)
{
    if (!battle || !actor || !battle->getBattleGame()) return 0ULL;
    const BattleAction *action = battle->getBattleGame()->getCurrentAction();
    unsigned long long hash = 1469598103934665603ULL;
    const auto mix = [&hash](unsigned long long value) {
        hash ^= value;
        hash *= 1099511628211ULL;
    };
    mix(reinterpret_cast<uintptr_t>(actor));
    mix(reinterpret_cast<uintptr_t>(actor->getRightHandWeapon()));
    mix(reinterpret_cast<uintptr_t>(actor->getLeftHandWeapon()));
    mix(static_cast<unsigned>(battle->getTUReserved()));
    if (action)
    {
        mix(reinterpret_cast<uintptr_t>(action->actor));
        mix(reinterpret_cast<uintptr_t>(action->weapon));
        mix(static_cast<unsigned>(action->type));
        mix(static_cast<unsigned>(action->targeting));
        mix(static_cast<unsigned>(action->sprayTargeting));
    }
    return hash ? hash : 1ULL;
}

// R45: rank the visible-unit hotkeys by the native H (hit) probability.
// This is the same "at least one projectile hits the intended unit per
// trigger pull" statistic as the F8 H/B/M ballistic readout, NOT the ACC
// weapon stat. The result is a pure preview, never a firing command.
void Map::r45RankVisibleEnemies(BattleUnit *actor,
                                std::vector<BattleUnit*> &enemies)
{
    _r46UiActionSignature = enemies.size() >= 2U ?
        r46ActionFingerprint(_save, actor) : 0ULL;
    auto reset = [this]() {
        _r45HitTargets.clear();
        _r45HitKey = 0;
        _r45HitActor = nullptr;
        _r45HitWeapon = nullptr;
        _r45HitAmmo = nullptr;
        _r45HitPublished = 0;
        _r46HitSceneSignature = 0;
        _r46HitUsedActiveAction = false;
        _r46HitRightHand = nullptr;
        _r46HitLeftHand = nullptr;
    };
    if (!actor || !_save || _save->getSide() != FACTION_PLAYER ||
        enemies.size() < 2 || !_save->getBattleGame())
    {
        reset();
        return;
    }

    // An active, single-target firing mode has priority. Otherwise use
    // the equipped hand firearm's first supported single-target mode.
    // Never treat melee/psi/throw/launch or spray actions as gun H odds.
    const BattleAction *live = _save->getBattleGame()->getCurrentAction();
    BattleItem *weapon = nullptr;
    BattleItem *ammo = nullptr;
    BattleActionType mode = BA_NONE;
    auto valid = [&](BattleItem *candidate, BattleActionType candidateMode) {
        // Match F8: any real single-target BA_* firearm-style action
        // with a valid projectile config qualifies, not just BT_FIREARM.
        if (!candidate || !candidate->getRules() ||
            candidate->getArcingShot(candidateMode))
            return false;
        const RuleItemAction *conf = candidate->getActionConf(candidateMode);
        if (!conf || conf->shots < 1 || conf->shots > 16)
            return false;
        BattleItem *clip = candidate->getAmmoForAction(candidateMode, nullptr, nullptr);
        if (!clip || !clip->getRules() || !clip->getRules()->getDamageType())
            return false;
        const int pellets = clip->getRules()->getShotgunPellets() > 0 &&
            clip->getRules()->getDamageType()->isDirect() ?
            clip->getRules()->getShotgunPellets() : 1;
        return pellets > 0 && pellets <= 20 && conf->shots * pellets <= 256;
    };
    const bool activeTargeting =
        live && live->actor == actor && live->targeting;
    if (activeTargeting)
    {
        // Never silently substitute a default rifle shot for an active
        // psi, throw, arcing, spray or unsupported attack.
        if (live->sprayTargeting ||
            (live->type != BA_SNAPSHOT && live->type != BA_AIMEDSHOT &&
             live->type != BA_AUTOSHOT) ||
            !valid(live->weapon, live->type))
        {
            reset();
            return;
        }
        weapon = live->weapon;
        mode = live->type;
    }
    else
    {
        // Without an active aim use the player's selected TU reservation,
        // then fall back to the first supported gun mode. Tell the user
        // which mode the prediction uses, rather than claiming native H.
        const BattleActionType reserved = _save->getTUReserved();
        for (BattleItem *candidate :
             {actor->getRightHandWeapon(), actor->getLeftHandWeapon()})
        {
            if ((reserved == BA_SNAPSHOT || reserved == BA_AIMEDSHOT ||
                 reserved == BA_AUTOSHOT) && valid(candidate, reserved))
            {
                weapon = candidate;
                mode = reserved;
                break;
            }
            for (BattleActionType candidateMode :
                 {BA_SNAPSHOT, BA_AIMEDSHOT, BA_AUTOSHOT})
            {
                if (valid(candidate, candidateMode))
                {
                    weapon = candidate;
                    mode = candidateMode;
                    break;
                }
            }
            if (weapon) break;
        }
    }
    if (!weapon) { reset(); return; }
    ammo = weapon->getAmmoForAction(mode, nullptr, nullptr);
    const RuleItemAction *conf = weapon->getActionConf(mode);
    const RuleItem *ammoRule = ammo->getRules();
    // The engine can stop a burst early when the clip runs out. Do not
    // score three shots if only one or two can actually leave the muzzle.
    unsigned shots = static_cast<unsigned>(conf->shots);
    const int roundsPerShot = std::max(1, conf->spendPerShot);
    if (!_save->getDebugMode() &&
        conf->ammoSlot != RuleItem::AmmoSlotSelfUse &&
        ammoRule->getClipSize() > 0 && !ammoRule->isAmmoRechargeable())
    {
        shots = std::min(shots,
            static_cast<unsigned>(std::max(0, ammo->getAmmoQuantity()) /
                                  roundsPerShot));
    }
    if (!shots) { reset(); return; }
    const bool shotgun = ammoRule->getShotgunPellets() > 0 &&
                         ammoRule->getDamageType()->isDirect();
    const unsigned pellets = shotgun ?
        static_cast<unsigned>(ammoRule->getShotgunPellets()) : 1U;

    BattleAction action;
    if (live && live->actor == actor && live->targeting &&
        live->weapon == weapon && live->type == mode &&
        !live->sprayTargeting)
        action = *live;
    action.actor = actor;
    action.weapon = weapon;
    action.type = mode;
    action.targeting = true;
    action.sprayTargeting = false;

    // Mods can expose scripted stat expressions. Even reading a bonus
    // must not change the live battle's RNG sequence.
    struct PreserveBattleRng
    {
        RNG::RandomState previous;
        PreserveBattleRng() : previous(RNG::globalRandomState()) {}
        ~PreserveBattleRng() { RNG::globalRandomState() = previous; }
    } guard;
    const BattleActionAttack attack =
        BattleActionAttack::GetAferShoot(action, ammo);
    double accuracy =
        BattleUnit::getFiringAccuracy(attack, _game->getMod()) / 100.0;
    // A Shift+F8 stance preview should use the same kneeling modifier
    // and virtual muzzle as the current HMS gun preview.
    const bool virtualKneelChange = _r22StanceActor == actor &&
        _r22StanceOverride && _r22Kneel != actor->isKneeled();
    if (virtualKneelChange)
    {
        const double factor =
            weapon->getRules()->getKneelBonus(_game->getMod()) / 100.0;
        if (factor > 0.0)
            accuracy *= _r22Kneel ? factor : 1.0 / factor;
    }
    const int stanceDelta = virtualKneelChange ?
        ((_r22Kneel ? actor->getKneelHeight() : actor->getStandHeight()) -
         actor->getHeight()) : 0;
    const Position origin = actor->getPosition();
    Tile *startTile = _save->getTile(origin);
    if (!startTile) { reset(); return; }

    unsigned long long key = 1469598103934665603ULL;
    auto mix = [&key](unsigned long long x) {
        key ^= x; key *= 1099511628211ULL;
    };
    // R46: a rank recalculation must bypass the 750ms HUD fingerprint
    // cache; it is triggered by actual player/visible battlefield events.
    const unsigned long long sceneSignature =
        r79KnownBattlefieldSignature(_save, true);
    mix(sceneSignature);
    mix(reinterpret_cast<uintptr_t>(actor));
    mix(reinterpret_cast<uintptr_t>(weapon));
    mix(reinterpret_cast<uintptr_t>(ammo));
    mix(static_cast<unsigned>(mode));
    mix(static_cast<unsigned>(shots));
    mix(static_cast<unsigned>(pellets));
    mix(static_cast<unsigned>(std::min(ammo->getAmmoQuantity(),
        int(shots) * std::max(1, conf->spendPerShot))));
    mix(static_cast<unsigned long long>(
        static_cast<long long>(accuracy * 1000000.0)));
    mix(static_cast<unsigned>(actor->getHealth()));
    mix(static_cast<unsigned>(actor->getTimeUnits()));
    const Position livePosition = actor->getPosition();
    mix(static_cast<unsigned>(livePosition.x));
    mix(static_cast<unsigned>(livePosition.y));
    mix(static_cast<unsigned>(livePosition.z));
    mix(static_cast<unsigned>(actor->getDirection()));
    mix(static_cast<unsigned>(actor->isKneeled()));
    mix(static_cast<unsigned>(stanceDelta));
    // Use identity-stable order for the signature; the ranking itself
    // must not invalidate the cache at the next UI refresh.
    std::vector<BattleUnit*> signatureEnemies = enemies;
    std::sort(signatureEnemies.begin(), signatureEnemies.end(),
        [](const BattleUnit *a, const BattleUnit *b) {
            return a->getId() < b->getId();
        });
    for (BattleUnit *victim : signatureEnemies)
    {
        mix(reinterpret_cast<uintptr_t>(victim));
        if (!victim) continue;
        const Position p = victim->getPosition();
        mix(static_cast<unsigned>(victim->getId()));
        mix(static_cast<unsigned>(p.x));
        mix(static_cast<unsigned>(p.y));
        mix(static_cast<unsigned>(p.z));
        mix(static_cast<unsigned>(victim->isOut()));
        mix(static_cast<unsigned>(victim->getVisible()));
        mix(static_cast<unsigned>(victim->getFaction()));
    }
    if (!key) key = 1ULL;

    // Snapshot action/clip changes even if the probabilities are identical.
    _r46HitSceneSignature = sceneSignature;
    _r46HitUsedActiveAction = activeTargeting;
    _r46HitEffectiveKneel = virtualKneelChange ? _r22Kneel : actor->isKneeled();
    _r46HitRightHand = actor->getRightHandWeapon();
    _r46HitLeftHand = actor->getLeftHandWeapon();
    _r46HitReservedMode = static_cast<int>(_save->getTUReserved());
    _r46HitAmmoSignature = ammoRule->getClipSize() > 0
        ? std::min(ammo->getAmmoQuantity(),
                   conf->shots * roundsPerShot) : -1;

    if (key != _r45HitKey || _r45HitActor != actor ||
        _r45HitTargets.size() != enemies.size())
    {
        _r45HitKey = key;
        _r45HitActor = actor;
        _r45HitWeapon = weapon;
        _r45HitAmmo = ammo;
        _r45HitMode = static_cast<int>(mode);
        _r45HitShots = shots;
        _r45HitPellets = pellets;
        _r45HitShotgun = shotgun;
        _r45HitNext = 0;
        _r45HitLastBatch = 0;
        _r45HitPublished = 0;
        _r46HitWatchTick = SDL_GetTicks();
        _r45HitTargets.clear();
        _r45HitTargets.reserve(enemies.size());

        const int noLosPenalty =
            weapon->getRules()->getNoLOSAccuracyPenalty(_game->getMod());
        for (BattleUnit *victim : enemies)
        {
            R45HitTarget entry;
            entry.target = victim;
            // The native H is zero for out-of-range or invalid targets;
            // no hidden enemy is consulted while preparing a preview.
            if (!victim || victim->isOut() || !victim->getVisible() ||
                !victim->getArmor())
            {
                entry.trials = 256;
                _r45HitTargets.push_back(entry);
                continue;
            }
            const Position target = victim->getPosition();
            Tile *targetTile = _save->getTile(target);
            if (!targetTile)
            {
                entry.trials = 256;
                _r45HitTargets.push_back(entry);
                continue;
            }
            int dx = origin.x - target.x;
            int dy = origin.y - target.y;
            const int dz = origin.z - target.z;
            if (actor->isBigUnit())
            {
                if (origin.x < target.x) ++dx;
                if (origin.y < target.y) ++dy;
            }
            // Zero nominal accuracy still has a native miss-cloud;
            // only genuine out-of-range shots have H=0 without tracing.
            BattleAction r69HitRange = action;
            r69HitRange.target = target;
            if (r69ShotOutOfRange(r69HitRange,_save))
            {
                entry.trials = 256;
                _r45HitTargets.push_back(entry);
                continue;
            }

            // Reuse the exact native exposed-voxel aim selection and side
            // priority (centre, left, right) from the F8 aim preview.
            action.target = target;
            action.relativeOrigin = BattleActionOrigin::CENTRE;
            const int height = std::max(3, victim->getHeight()/2);
            Position goal(target.x*16+8, target.y*16+8,
                          target.z*24-targetTile->getTerrainLevel()+height);
            const BattleActionOrigin origins[] = {
                BattleActionOrigin::CENTRE, BattleActionOrigin::LEFT,
                BattleActionOrigin::RIGHT
            };
            for (int side = 0; side < 3; ++side)
            {
                if (side > 0 && !Options::oxceEnableOffCentreShooting) break;
                BattleAction test = action;
                test.relativeOrigin = origins[side];
                Position candidate = r32VirtualMuzzle(test, startTile, stanceDelta, false);
                Position candidateGoal = goal;
                if (_save->getTileEngine()->canTargetUnit(
                    &candidate, targetTile, &candidateGoal, actor,
                    false, nullptr, true, nullptr))
                {
                    action.relativeOrigin = origins[side];
                    goal = candidateGoal;
                    break;
                }
            }
            entry.relativeOrigin = static_cast<int>(action.relativeOrigin);
            entry.aim = goal;
            entry.muzzle = r32VirtualMuzzle(action, startTile, stanceDelta, false);
            entry.accuracy = accuracy;
            if (noLosPenalty != -1)
            {
                // Match HMS: probe the actually chosen aim voxel, not the
                // unit's root tile (which differs for exposed 2x2 targets).
                Tile *aimTile = _save->getTile(goal.toTile());
                if (!aimTile) aimTile = targetTile;
                const bool hasLOS = aimTile->getUnit() ?
                    _save->getTileEngine()->r25VirtualVisible(
                        actor, aimTile, origin, stanceDelta) :
                    _save->getTileEngine()->r25VirtualTileInLOS(
                        &action, aimTile, false, origin, stanceDelta);
                entry.virtualHasLOS = hasLOS ? 1 : 0;
            }
            _r45HitTargets.push_back(entry);
        }
        bool alreadyComplete = true;
        for (const R45HitTarget &entry : _r45HitTargets)
            if (entry.trials < 256U) alreadyComplete = false;
        if (alreadyComplete) _r45HitPublished = 256U;
    }

    // R46: never change a numbered hotkey while probabilities are still
    // converging. Publish one stable n256 ranking for this scenario.
    if (_r45HitPublished != 256U) return;
    // Compare unrounded native H estimates (hits / trigger pulls).
    // stable_sort preserves preexisting visual order for equal odds.
    std::stable_sort(enemies.begin(), enemies.end(),
        [this](const BattleUnit *a, const BattleUnit *b)
        {
            const R45HitTarget *left = nullptr, *right = nullptr;
            for (const R45HitTarget &entry : _r45HitTargets)
            {
                if (entry.target == a) left = &entry;
                if (entry.target == b) right = &entry;
            }
            if (!left || !right || !left->trials || !right->trials)
                return false;
            return static_cast<unsigned long long>(left->hits) *
                   right->trials >
                   static_cast<unsigned long long>(right->hits) *
                   left->trials;
        });
}

bool Map::r45GetHitEstimate(const BattleUnit *target,
                             unsigned &hit, unsigned &trials) const
{
    if (_r45HitPublished != 256U || !target) return false;
    for (const R45HitTarget &entry : _r45HitTargets)
    {
        if (entry.target == target && entry.trials)
        {
            trials = entry.trials;
            hit = entry.hits * 100U / trials;
            return true;
        }
    }
    return false;
}

// Compute at most 48 complete trigger pulls and approximately 6ms of work
// per UI tick. Targets share the budget in round-robin order; published
// results refine at n24, n96, and n256 without blocking soldier selection.
// R46: the attack-button order is allowed to change only once per
// meaningful firing scenario, when the complete n256 score is available.
bool Map::r46RankingActive() const
{
    return _save && _save->getSelectedUnit() == _r45HitActor &&
        _r45HitActor && _r45HitTargets.size() >= 2U;
}

unsigned Map::r46RankingProgress() const
{
    if (!r46RankingActive()) return 0U;
    unsigned minimum = 256U;
    for (const R45HitTarget &entry : _r45HitTargets)
        minimum = std::min(minimum, entry.trials);
    return minimum;
}

const char* Map::r46RankingShotLabel() const
{
    switch (static_cast<BattleActionType>(_r45HitMode))
    {
    case BA_AIMEDSHOT: return "AIM";
    case BA_AUTOSHOT: return "AUTO";
    case BA_SNAPSHOT: return "SNAP";
    default: return "SHOT";
    }
}

// Poll only while an unfinished/finished rank is active. A 150ms watcher
// catches control, known geometry, direction, clip, stance and action changes
// even if the engine did not request a fresh FOV/UI update. It never reads
// unknown enemy attributes or changes battle RNG.
bool Map::r46RankingNeedsRefresh()
{
    if (!_save || !_save->getBattleGame() ||
        _save->getSide() != FACTION_PLAYER ||
        !_save->getSelectedUnit() || !_r46UiActionSignature)
        return false;
    const Uint32 now = SDL_GetTicks();
    if (now - _r46HitWatchTick < 150U) return false;
    _r46HitWatchTick = now;
    if (r46ActionFingerprint(_save, _save->getSelectedUnit()) !=
        _r46UiActionSignature)
        return true;
    if (!r46RankingActive()) return false;

    const BattleAction *action = _save->getBattleGame()->getCurrentAction();
    const bool active = action && action->actor == _r45HitActor &&
                        action->targeting;
    if (active != _r46HitUsedActiveAction) return true;
    if (active &&
        (action->weapon != _r45HitWeapon ||
         static_cast<int>(action->type) != _r45HitMode ||
         action->sprayTargeting))
        return true;
    if (static_cast<int>(_save->getTUReserved()) != _r46HitReservedMode)
        return true;
    const bool effectiveKneel = _r22StanceActor == _r45HitActor &&
        _r22StanceOverride ? _r22Kneel : _r45HitActor->isKneeled();
    if (effectiveKneel != _r46HitEffectiveKneel) return true;
    if (_r45HitActor->getRightHandWeapon() != _r46HitRightHand ||
        _r45HitActor->getLeftHandWeapon() != _r46HitLeftHand)
        return true;

    // Do not dereference a clip that might have been consumed/destroyed.
    // First prove the formerly selected weapon is still owned/aimed.
    if (!active && _r45HitActor->getRightHandWeapon() != _r45HitWeapon &&
        _r45HitActor->getLeftHandWeapon() != _r45HitWeapon)
        return true;
    if (!_r45HitWeapon || !_r45HitWeapon->getRules()) return true;
    const auto mode = static_cast<BattleActionType>(_r45HitMode);
    const RuleItemAction *conf = _r45HitWeapon->getActionConf(mode);
    if (!conf) return true;
    BattleItem *currentAmmo =
        _r45HitWeapon->getAmmoForAction(mode, nullptr, nullptr);
    if (currentAmmo != _r45HitAmmo || !currentAmmo ||
        !currentAmmo->getRules())
        return true;
    const int quantity = currentAmmo->getRules()->getClipSize() > 0 ?
        std::min(currentAmmo->getAmmoQuantity(),
                 conf->shots * std::max(1, conf->spendPerShot)) : -1;
    if (quantity != _r46HitAmmoSignature) return true;
    return r79KnownBattlefieldSignature(_save, true) !=
           _r46HitSceneSignature;
}

bool Map::r45AdvanceHitRanking()
{
    if (!_save || _save->getSide() != FACTION_PLAYER ||
        !_r45HitActor || _save->getSelectedUnit() != _r45HitActor ||
        !_r45HitKey || !_r45HitWeapon || !_r45HitAmmo ||
        _r45HitTargets.size() < 2)
        return false;
    const Uint32 now = SDL_GetTicks();
    if (now - _r45HitLastBatch < 25U) return false;
    _r45HitLastBatch = now;

    const RuleItem *ammoRule = _r45HitAmmo->getRules();
    const int spread = ammoRule->getShotgunSpread();
    const int shotgunBehavior = ammoRule->getShotgunBehaviorType();
    const double choke = _r45HitWeapon->getRules()->getShotgunChoke()/100.0;
    const auto started = std::chrono::steady_clock::now();

    struct PreserveBattleRng
    {
        RNG::RandomState previous;
        PreserveBattleRng() : previous(RNG::globalRandomState()) {}
        ~PreserveBattleRng() { RNG::globalRandomState() = previous; }
    } guard;
    unsigned completePulls = 0;
    while (completePulls < 48U &&
           std::chrono::steady_clock::now()-started <
               std::chrono::milliseconds(6))
    {
        const size_t length = _r45HitTargets.size();
        R45HitTarget *entry = nullptr;
        for (size_t n = 0; n < length; ++n)
        {
            R45HitTarget &test = _r45HitTargets[_r45HitNext];
            _r45HitNext = (_r45HitNext+1) % length;
            if (test.trials < 256U)
            {
                entry = &test;
                break;
            }
        }
        if (!entry) break;

        // A stable per-target/per-trial private seed makes the n256
        // estimate independent of frame rate and sampling batch sizes.
        unsigned long long seed = _r45HitKey ^
            (0x9e3779b97f4a7c15ULL *
            (static_cast<unsigned long long>(entry->target->getId()+1)*257ULL +
             entry->trials + 1ULL));
        if (!seed) seed = 1ULL;
        RNG::globalRandomState() = RNG::RandomState(seed);
        RNG::RandomState preview(seed);
        BattleAction firing;
        firing.actor = _r45HitActor;
        firing.weapon = _r45HitWeapon;
        firing.type = static_cast<BattleActionType>(_r45HitMode);
        firing.targeting = true;
        firing.target = entry->target->getPosition();
        firing.relativeOrigin =
            static_cast<BattleActionOrigin>(entry->relativeOrigin);
        bool anyHit = false, firstRejected = false;
        for (unsigned shotIndex = 1; shotIndex <= _r45HitShots; ++shotIndex)
        {
            Position firstImpact = entry->aim;
            for (unsigned pellet = 0; pellet < _r45HitPellets; ++pellet)
            {
                Position aimed = entry->aim;
                double pelletAccuracy = entry->accuracy;
                if (pellet && _r45HitShotgun)
                {
                    if (shotgunBehavior == 1)
                    {
                        if (firstImpact != entry->muzzle)
                            aimed = firstImpact;
                        pelletAccuracy = std::max(0.0,
                            (1.0 - spread/100.0)*choke);
                    }
                    else
                    {
                        pelletAccuracy = std::max(0.0,
                            entry->accuracy -
                            pellet*5.0*spread/100.0);
                    }
                }
                firing.autoShotCounter = static_cast<int>(shotIndex);
                Projectile projectile(_game->getMod(), _save, firing,
                                      _r45HitActor->getPosition(),
                                      aimed, _r45HitAmmo);
                const int status = projectile.calculateTrajectory(
                    pelletAccuracy, entry->muzzle, true, true,
                    &preview, entry->virtualHasLOS, nullptr);
                const std::vector<Position> &path =
                    projectile.getTrajectoryForPreview();
                if (path.empty())
                {
                    if (shotIndex == 1 && pellet == 0)
                        firstRejected = true;
                    break;
                }
                if (pellet == 0)
                    firstImpact = path.size()>2 ? path[path.size()-3] :
                                                  path.front();
                const Tile *landed = _save->getTile(path.back().toTile());
                BattleUnit *victim = landed ?
                    landed->getOverlappingUnit(_save) : nullptr;
                if (status == V_UNIT && victim == entry->target)
                    anyHit = true;
            }
            if (firstRejected) break;
        }
        ++entry->trials;
        if (anyHit) ++entry->hits;
        ++completePulls;
    }

    unsigned minimum = 256U;
    for (const R45HitTarget &entry : _r45HitTargets)
        minimum = std::min(minimum, entry.trials);
    // A rank transition halfway through an aiming gesture is unsafe:
    // a single complete publication replaces three partial reshuffles.
    const unsigned stage = minimum >= 256U ? 256U : 0U;
    if (stage > _r45HitPublished)
    {
        _r45HitPublished = stage;
        return true;  // BattlescapeState refreshes only UI, without FOV.
    }
    return false;
}

void Map::r22DrawStats(const Position& origin, const Position& target,
                      const Position& aim, const Position& muzzle)
{
    // Never display a previous weapon's probabilities after deselection or
    // switching to an action that the ballistic sampler does not support.
    auto clearInvalidPreview = [this]() {
        _r22StatsText.clear();
        _r22TileRisks.clear();
        _r22StatsKey = 0;
        _r22SampleCount = 0;
        _r22HitSamples = 0;
        _r22BlockedSamples = 0;
        _r22MissSamples = 0;
        _r22RiskSamples = 0;
        _r68FriendSamples = 0;
    };
    BattleUnit *shooter = _save->getSelectedUnit();
    if (!shooter || !_save->getBattleGame()) { clearInvalidPreview(); return; }
    BattleAction *current = _save->getBattleGame()->getCurrentAction();
    if (!current || current->actor != shooter || !current->weapon) {
        clearInvalidPreview(); return;
    }
    if (current->type != BA_SNAPSHOT && current->type != BA_AIMEDSHOT &&
        current->type != BA_AUTOSHOT) { clearInvalidPreview(); return; }

    BattleItem *weapon = current->weapon;
    if (weapon->getArcingShot(current->type)) { clearInvalidPreview(); return; }
    BattleItem *ammo = weapon->getAmmoForAction(current->type,nullptr,nullptr);
    if (!ammo || !ammo->getRules()) { clearInvalidPreview(); return; }
    const RuleItemAction *conf = weapon->getActionConf(current->type);
    const int shots = conf ? conf->shots : 1;
    // Fully loaded for the action? A lower-but-still-sufficient clip
    // DOES NOT change weapon accuracy or the burst distribution.
    // Saturating the clip cache signature keeps the same deterministic
    // Monte Carlo stream after spending 6 of 42 SMG rounds.
    // Below full-burst capacity, preserve distinct cache keys.
    const int roundsPerShot = conf ? std::max(1, conf->spendPerShot) : 1;
    const int roundsForBurst = shots * roundsPerShot;
    const int ammoSignature = ammo->getRules()->getClipSize() > 0
        ? std::min(ammo->getAmmoQuantity(), roundsForBurst)
        : ammo->getAmmoQuantity();
    const bool shotgun = ammo->getRules()->getShotgunPellets() > 0 &&
                         ammo->getRules()->getDamageType()->isDirect();
    const int pellets = shotgun ? ammo->getRules()->getShotgunPellets() : 1;
    // Unsupported action sizes don't show invented probabilities.
    // Never exceed 256 engine bullet traces in a render frame, even in
    // unusual ammunition containing many pellets and huge bursts.
    if (shots < 1 || shots > 16 || pellets < 1 || pellets > 20 ||
        shots*pellets > 256) {
        clearInvalidPreview(); return;
    }
    // Resolve actual occupier, not merely the owner/root tile. Multi-tile
    // soldiers and units intersecting the floor above use native overlap rules.
    Tile *targetTile=_save->getTile(target);
    BattleUnit *targetUnit=targetTile ?
        targetTile->getOverlappingUnit(_save) : nullptr;
    if (targetUnit && !targetUnit->getVisible()) targetUnit=nullptr;
    Tile *originTile=_save->getTile(origin);
    BattleUnit *previewVacatedUnit = originTile && origin!=shooter->getPosition() ?
        originTile->getOverlappingUnit(_save) : nullptr;
    if (previewVacatedUnit &&
        (previewVacatedUnit==shooter ||
         previewVacatedUnit->getFaction()!=shooter->getFaction()))
        previewVacatedUnit=nullptr;

    // Compute current accuracy BEFORE the cache key. Skills, injuries,
    // buffs, ammo and selected action can change without moving the cursor.
    BattleAction action=*current;
    action.actor=shooter;
    action.target=target;
    BattleActionAttack attack=BattleActionAttack::GetAferShoot(action,ammo);
    double accuracy=BattleUnit::getFiringAccuracy(attack,_game->getMod())/100.0;
    const bool virtualKneelChange = _r22StanceOverride &&
        _r22Kneel != shooter->isKneeled();
    const double kneelFactor = weapon->getRules()->getKneelBonus(_game->getMod())/100.0;
    if (virtualKneelChange && kneelFactor > 0.0)
        accuracy *= _r22Kneel ? kneelFactor : 1.0 / kneelFactor;
    const int stanceDelta = virtualKneelChange ?
        ((_r22Kneel ? shooter->getKneelHeight() : shooter->getStandHeight())
        - shooter->getHeight()) : 0;
    // Resolve no-LOS from the exact firing SOURCE. Native firing is
    // unchanged; TileEngine copies the pinned OXCE rules read-only.
    const int noLosPenalty = weapon->getRules()->getNoLOSAccuracyPenalty(_game->getMod());
    int virtualHasLOS = -1;
    if (noLosPenalty != -1)
    {
        Tile *aimedTile = _save->getTile(aim.toTile());
        if (aimedTile)
        {
            bool visible = aimedTile->getUnit() ?
                _save->getTileEngine()->r25VirtualVisible(shooter,aimedTile,origin,stanceDelta) :
                _save->getTileEngine()->r25VirtualTileInLOS(&action,aimedTile,false,origin,stanceDelta);
            virtualHasLOS = visible ? 1 : 0;
        }
    }
    // Native crosshair uses tile-centre (ceil) distance, not the
    // voxel distance used by the trajectory's fractional dropoff.
    int dx=origin.x-target.x,dy=origin.y-target.y,dz=origin.z-target.z;
    if (shooter->isBigUnit())
    {
        if (origin.x < target.x) ++dx;
        if (origin.y < target.y) ++dy;
    }
    const int distanceSq=dx*dx+dy*dy+dz*dz;
    const int distance=int(std::ceil(std::sqrt(float(distanceSq))));
    int upperLimit=0, lowerLimit=0;
    const int dropoff=weapon->getRules()->calculateLimits(
        upperLimit,lowerLimit,_save->getDepth(),action.type);
    int displayedAccuracy=BattleUnit::getFiringAccuracy(
        BattleActionAttack::GetBeforeShoot(action),_game->getMod());
    if (virtualKneelChange && kneelFactor>0.0)
        displayedAccuracy=int(displayedAccuracy*(_r22Kneel ? kneelFactor : 1.0/kneelFactor));
    if (distance>upperLimit) displayedAccuracy-=(distance-upperLimit)*dropoff;
    else if (distance<lowerLimit) displayedAccuracy-=(lowerLimit-distance)*dropoff;
    if (noLosPenalty!=-1 && virtualHasLOS==0)
        displayedAccuracy=displayedAccuracy*noLosPenalty/100;
    // R69: use the same physical 2x2 muzzle as the real shot.
    // All one-tile unit ranges continue using the native predicate.
    const bool outOfRange=!action.sprayTargeting &&
        r69ShotOutOfRange(action,_save,&muzzle);
    if (outOfRange || displayedAccuracy<=0) displayedAccuracy=0;
    // Real ProjectileFlyBState rejects fire beyond the weapon max range.
    // Never show an attainable hit chance when native fire is forbidden.
    if (outOfRange)
    {
        clearInvalidPreview();
        // Keep the R65 contact-shot context without showing a nominal ACC
        // in the HMS bar, whose first field is now movement TU.
        if (weapon->getRules()->getMaxRange()==1 && targetUnit &&
            targetUnit!=shooter && targetUnit->getVisible() &&
            !targetUnit->isOut() &&
            targetUnit->getFaction()!=shooter->getFaction())
            _r22StatsText="OUT OF RANGE / IF FRONT";
        else
            _r22StatsText="OUT OF RANGE";
        return;
    }

    unsigned long long key=1469598103934665603ULL;
    auto mix=[&](unsigned long long value) {
        key^=value; key*=1099511628211ULL;
    };
    for (int x : std::initializer_list<int>{shooter->getId(), origin.x,origin.y,origin.z,
                  target.x,target.y,target.z,aim.x,aim.y,aim.z,
                  muzzle.x,muzzle.y,muzzle.z,(int)current->type,
                  (int)_r22Kneel,(int)shooter->isKneeled(),
                  ammoSignature,shots,pellets})
        mix((unsigned int)x);
    mix((unsigned long long)(uintptr_t)weapon);
    mix((unsigned long long)(uintptr_t)weapon->getRules());
    mix((unsigned long long)(uintptr_t)ammo);
    mix((unsigned long long)(uintptr_t)ammo->getRules());
    mix((unsigned long long)(uintptr_t)targetUnit);
    mix((unsigned long long)(uintptr_t)previewVacatedUnit);
    mix((unsigned long long)(uintptr_t)targetTile);
    mix((unsigned long long)(static_cast<long long>(accuracy*1000000.0)));
    mix((unsigned int)(virtualHasLOS+1));
    mix((unsigned int)displayedAccuracy);
    // A newly opened door, destroyed wall or newly blocking target must
    // invalidate Monte Carlo results without waiting for cache expiration.
    // Native voxel obstruction probing consumes no RNG and respects fog.
    std::vector<Position> obstructionPoint;
    const int directCollision=_save->getTileEngine()->calculateLineVoxel(
        muzzle,aim,false,&obstructionPoint,shooter,nullptr,true,previewVacatedUnit);
    mix(static_cast<unsigned>(directCollision));
    if (!obstructionPoint.empty())
    {
        const Position& p=obstructionPoint.back();
        mix(static_cast<unsigned>(p.x));
        mix(static_cast<unsigned>(p.y));
        mix(static_cast<unsigned>(p.z));
    }
    // RC79: react to real known battlefield changes, including opened
    // doors and modified visible terrain; never expire finished n256 by
    // time alone when the scene and aim are unchanged.
    mix(r79KnownBattlefieldSignature(_save));
    unsigned long now=SDL_GetTicks();
    // Replay-free batched Monte Carlo: never perform more than 256
    // projectile traces in one frame. Both straight and arcing HUD
    // previews now stop at 256 trials, including the tile-risk map.
    const bool newScenario = (key != _r22StatsKey);
    if (newScenario)
    {
        _r22StatsText.clear();
        _r22TileRisks.clear();
        _r22SampleCount=0;
        _r22HitSamples=0;
        _r22BlockedSamples=0;
        _r22MissSamples=0;
        _r22RiskSamples=0;
        _r68FriendSamples=0;
        _r22StatsKey=key;
        _r22StatsUpdated=now;
        _r22StatsBatchTick=0;
    }
    // Animation redraws and mouse movement may run much faster than the
    // sampling budget. Do not repeat the expensive native traces each draw.
    if (_r22SampleCount < r22HudMaxTrials &&
        (newScenario || now-_r22StatsBatchTick>=r84HudBatchIntervalMs))
    {
        _r22StatsBatchTick=now;
        const unsigned projectilesPerTrial=static_cast<unsigned>(shots*pellets);
        // RC84: adapt how many complete trigger-pull trials to perform
        // to the measured CPU time of the preceding batch. Always run
        // native trajectories, all pellets, and exactly n256 trials;
        // never preempt partway through a complete pull.
        static double straightUsPerTrial = 0.0;
        if (newScenario) straightUsPerTrial = 0.0;
        const unsigned warmup=std::max(1U, 24U/projectilesPerTrial);
        const unsigned traceCap=std::max(1U,128U/projectilesPerTrial);
        const unsigned predicted=straightUsPerTrial > 1.0
            ? std::max(1U,static_cast<unsigned>(
                  5500.0/straightUsPerTrial)) : warmup;
        const unsigned samples=std::min(r22HudMaxTrials-_r22SampleCount,
            std::min(traceCap,predicted));
        const auto batchStarted=std::chrono::steady_clock::now();
        const auto timeBudget=std::chrono::milliseconds(r84HudWorkBudgetMs);
        unsigned processed=0U;
        // Each batch has its own deterministic seed; never reseed every
        // frame to the same prefix of the old samples.
        const unsigned long long sampleSeed=key^
            (0x9e3779b97f4a7c15ULL*(_r22SampleCount+1ULL));
        struct KeepRng {
            RNG::RandomState previous;
            explicit KeepRng(unsigned long long seed)
                : previous(RNG::globalRandomState()) {
                RNG::globalRandomState()=RNG::RandomState(seed);
            }
            ~KeepRng() { RNG::globalRandomState()=previous; }
        } keep(sampleSeed ? sampleSeed : 1ULL);
        RNG::RandomState previewRng(sampleSeed ? sampleSeed : 1ULL);

        const int width=_save->getMapSizeX();
        const int length=_save->getMapSizeY();
        const int height=_save->getMapSizeZ();
        unsigned hit=0, blocked=0, missed=0, friendTrials=0;
        auto shot=[&](const Position& aimed, double acc, int shotIndex,
                      bool& isHit, bool& isBlocked, bool& friendHit,
                      std::vector<int>& risk, Position& impact, Position& preImpact,
                      bool& rejectedByNative)
        {
            BattleAction fired=action;
            fired.autoShotCounter=shotIndex;
            Projectile projectile(_game->getMod(), _save, fired, origin, aimed, ammo);
            const int status=projectile.calculateTrajectory(acc,muzzle,true,true,&previewRng,virtualHasLOS,previewVacatedUnit);
            const std::vector<Position>& path=projectile.getTrajectoryForPreview();
            if (path.empty())
            {
                // The first projectile was NOT launched in OXCE.
                // Its burst cannot continue into later shot counters.
                rejectedByNative=true;
                isBlocked = true;
                return;
            }
            impact=path.back();
            preImpact=path.size()>2 ? path[path.size()-3] : path.front();
            // All 256 HUD trials may contribute to risk; keep the
            // tile sets bounded by the same per-scenario trial cap.
            if (_r22RiskSamples < r22HudMaxTrials)
            {
                int previousTile=-1;
                for (const Position& voxel : path)
                {
                    if (voxel.x<0 || voxel.y<0 || voxel.z<0) continue;
                    int tx=voxel.x/16,ty=voxel.y/16,tz=voxel.z/24;
                    if (tx>=width || ty>=length || tz>=height) continue;
                    const int tileIndex=(tz*length+ty)*width+tx;
                    // Many voxels share one tile; insert once per contiguous
                    // tile segment, while the set still deduplicates pellets.
                    if (tileIndex != previousTile)
                    {
                        risk.push_back(tileIndex);
                        previousTile=tileIndex;
                    }
                }
            }
            const Position collisionTile=impact.toTile();
            Tile *t=_save->getTile(collisionTile);
            BattleUnit *victim=t ? t->getOverlappingUnit(_save) : nullptr;
            if (victim && !victim->getVisible()) victim=nullptr;
            if (status==V_UNIT && victim && victim!=shooter &&
                victim->getFaction()==shooter->getFaction())
                friendHit=true;
            if (status==V_UNIT && victim && targetUnit && victim==targetUnit)
            {
                isHit=true; return;
            }
            if (!targetUnit && t && collisionTile==target &&
                status!=V_EMPTY && status!=V_OUTOFBOUNDS && status!=V_UNIT)
            {
                isHit=true; return;
            }
            if (status==V_EMPTY || status==V_OUTOFBOUNDS) return;
            const double dx=aim.x-muzzle.x,dy=aim.y-muzzle.y,dz=aim.z-muzzle.z;
            const double den=dx*dx+dy*dy+dz*dz;
            if (den>0)
            {
                const double proj=((impact.x-muzzle.x)*dx+
                     (impact.y-muzzle.y)*dy+(impact.z-muzzle.z)*dz)/den;
                if (proj<1.0) isBlocked=true;
            }
        };

        // Compact contiguous risk indices, reusing one allocation across
        // all trials; sorting at the end preserves each tile's once-per-
        // trigger probability without a heap-backed std::set insertion.
        std::vector<int> tileRisk;
        tileRisk.reserve(128);
        for (unsigned sample=0; sample<samples; ++sample)
        {
            if (processed &&
                std::chrono::steady_clock::now()-batchStarted>=timeBudget)
                break;
            bool anyHit=false, allBlocked=true, anyFriend=false;
            bool firstShotRejected=false;
            tileRisk.clear();
            for (int shotIndex=1; shotIndex<=shots; ++shotIndex)
            {
                Position firstImpact=aim;
                for (int pellet=0; pellet<pellets; ++pellet)
                {
                    Position aimed=aim;
                    double pelletAcc=accuracy;
                    if (pellet && shotgun)
                    {
                        const int spread=ammo->getRules()->getShotgunSpread();
                        if (ammo->getRules()->getShotgunBehaviorType()==1)
                        {
                            if (firstImpact != muzzle) aimed=firstImpact;
                            pelletAcc=std::max(0.0,(1.0-spread/100.0)*
                                weapon->getRules()->getShotgunChoke()/100.0);
                        }
                        else pelletAcc=std::max(0.0,
                            accuracy-pellet*5.0*spread/100.0);
                    }
                    bool oneHit=false, oneBlocked=false;
                    Position collision=aim, nearCollision=aim;
                    bool nativeRejected=false;
                    shot(aimed,pelletAcc,shotIndex,oneHit,oneBlocked,
                         anyFriend,tileRisk,collision,nearCollision,nativeRejected);
                    if (shotIndex==1 && pellet==0 && nativeRejected)
                    {
                        firstShotRejected=true;
                        break;
                    }
                    if (pellet==0) firstImpact=nearCollision;
                    if (oneHit) anyHit=true;
                    if (!oneBlocked && !oneHit) allBlocked=false;
                }
                if (firstShotRejected) break;
            }
            if (!firstShotRejected && anyFriend) ++friendTrials;
            if (firstShotRejected) ++blocked;
            else if (anyHit) ++hit;
            else if (allBlocked) ++blocked;
            else ++missed;
            if (_r22RiskSamples < r22HudMaxTrials)
            {
                std::sort(tileRisk.begin(),tileRisk.end());
                tileRisk.erase(std::unique(tileRisk.begin(),tileRisk.end()),
                               tileRisk.end());
                for (int t : tileRisk) ++_r22TileRisks[t];
                ++_r22RiskSamples;
            }
            ++processed;
        }
        if (processed)
        {
            const double spentUs=std::chrono::duration<double,std::micro>(
                std::chrono::steady_clock::now()-batchStarted).count();
            const double observed=spentUs/processed;
            straightUsPerTrial = straightUsPerTrial > 0.0
                ? 0.65*straightUsPerTrial + 0.35*observed : observed;
        }
        _r22HitSamples+=hit;
        _r22BlockedSamples+=blocked;
        _r22MissSamples+=missed;
        _r68FriendSamples+=friendTrials;
        _r22SampleCount+=processed;
        std::ostringstream label;
        // All H/B/M samples are estimates, NOT the native hit stat.
        // Show n to distinguish an unstable 20-burst sample from
        // 256-burst convergence; auto counts whole bursts, not shots.
        label << "H~" << _r22HitSamples*100U/_r22SampleCount
              << "% B " << _r22BlockedSamples*100U/_r22SampleCount
              << "% M " << _r22MissSamples*100U/_r22SampleCount
              << "% F~" << _r68FriendSamples*100U/_r22SampleCount
              << "% n" << _r22SampleCount;
        _r22StatsText=label.str();
        if (_r22SampleCount >= r22HudMaxTrials) _r22StatsUpdated=now;
        // Map::think() schedules the next incremental redraw at a bounded
        // rate; never force another full frame from within drawing.
    }

    // Show at most one outline per tile, no opaque filled surfaces.
    int width=_save->getMapSizeX(), length=_save->getMapSizeY();
    for (const auto& entry : _r22TileRisks)
    {
        if (!_r22RiskSamples || entry.second*100U<_r22RiskSamples)
            continue; // 1% risk threshold, same 256-trial HUD budget
        int tx=entry.first%width,ty=(entry.first/width)%length;
        int tz=entry.first/(width*length);
        if (tz>_camera->getViewLevel()) continue;
        Tile *t=_save->getTile(Position(tx,ty,tz));
        if (!t || !t->isDiscovered(O_FLOOR)) continue;
        Position p;
        _camera->convertVoxelToScreen(Position(tx*16+8,ty*16+8,
            tz*24-t->getTerrainLevel()+1),&p);
        const unsigned riskPct=entry.second*100U/_r22RiskSamples;
        const int color=riskPct>=40U ? 32 : riskPct>=10U ? 160 : 73;
        // Open, one-pixel diamond perimeter; R19-style graduated hatching
        // without opaque fill or oversized LOS dots.
        drawLine(p.x-4,p.y,p.x,p.y-2,color);
        drawLine(p.x,p.y-2,p.x+4,p.y,color);
        drawLine(p.x+4,p.y,p.x,p.y+2,color);
        drawLine(p.x,p.y+2,p.x-4,p.y,color);
        if (riskPct>=25U)
        {
            drawLine(p.x-2,p.y-1,p.x,p.y+1,color);
            drawLine(p.x,p.y-1,p.x+2,p.y+1,color);
        }
        if (riskPct>=50U)
        {
            drawLine(p.x-4,p.y+1,p.x,p.y-1,color);
            drawLine(p.x,p.y-1,p.x+4,p.y+1,color);
        }
    }
    // The compact HUD is rendered once by Map::r22DrawOverlay().
}

void Map::r29ClearBlockGrid()
{
    _r29BlockCells.clear();
    _r29BlockKey = 0;
    _r29BlockNext = 0;
    _r29BlockPass = 3;
    _r29BlockStamp = 0;
    _r29BlockBatchStamp = 0;
}

// R29: map the chance that a COMPLETE trigger pull is blocked when firing
// from nearby hypothetical origins toward the first-click locked target.
// Separate isolated RNG, read-only snapshots, fog-limited drawing, and a
// bounded 128-projectile budget per UI refresh preserve native gameplay.
// R36: first-click candidate tiles for curved trajectories and spray fire.
// A flame/rocket/spit weapon may use calculateThrow(), not a straight-line
// Projectile. Never apply the straight-shot H/B/M Monte Carlo to its arc:
// show only origins that satisfy the SAME RuleItem::isOutOfRange predicate
// used by native fire. A range-valid tile is not a guaranteed clear shot.
void Map::r36DrawArcRangeGrid(BattleUnit *shooter, BattleAction *action,
                             const Position &target, const Position &source)
{
    if (!_r22On || !r59DetailedHud || _r30FullResists ||
        !shooter || !action || !action->weapon ||
        !_save || !_camera || !action->targeting ||
        _camera->getViewLevel() < 0)
        return;
    Tile *targetTile = _save->getTile(target);
    if (!targetTile) return;
    BattleUnit *victim = targetTile->getOverlappingUnit(_save);
    if (victim && !victim->getVisible()) return;
    if (!victim && !targetTile->getVisible() &&
        !targetTile->isDiscovered(O_FLOOR)) return;

    const RuleItem *rule = action->weapon->getRules();
    if (!rule) return;
    const int z = _camera->getViewLevel();
    // RC77: no 24-tile radius cutoff. Range-valid origins throughout
    // the whole map are eligible on the currently displayed level;
    // render only known tiles actually inside the screen viewport.
    const SDL_Color *palette = getPalette();
    if (!palette) return;
    int best = 1, score = 2147483647;
    for (int i = 1; i < 256; ++i)
    {
        const int dr = int(palette[i].r) - 50;
        const int dg = int(palette[i].g) - 220;
        const int db = int(palette[i].b) - 125;
        const int d = 2*dr*dr + 3*dg*dg + db*db;
        if (d < score) { score = d; best = i; }
    }
    const Uint8 rangeColor = static_cast<Uint8>(best);
    for (int y = 0; y < _save->getMapSizeY(); ++y)
    for (int x = 0; x < _save->getMapSizeX(); ++x)
    {
        const Position origin(x, y, z);
        Position visibleScreen;
        _camera->convertMapToScreen(origin, &visibleScreen);
        visibleScreen += _camera->getMapOffset();
        if (visibleScreen.x < -32 || visibleScreen.x > getWidth() + 32 ||
            visibleScreen.y < -48 || visibleScreen.y > _visibleMapHeight + 48)
            continue;
        Tile *tile = _save->getTile(origin);
        if (!tile || (!tile->getVisible() &&
            !tile->isDiscovered(O_FLOOR))) continue;
        if (tile->hasNoFloor(_save) && origin != shooter->getPosition())
            continue;
        MapData *object = tile->getMapData(O_OBJECT);
        if (object &&
            object->getTUCost(MT_WALK) >= Pathfinding::INVALID_MOVE_COST)
            continue;
        BattleUnit *occupant = tile->getOverlappingUnit(_save);
        // Never reveal a hidden occupant by suppressing its grid cell.
        if (occupant && occupant != shooter && occupant->getVisible() &&
            occupant->getFaction() != shooter->getFaction()) continue;
        int ddx = origin.x - target.x;
        int ddy = origin.y - target.y;
        const int ddz = origin.z - target.z;
        if (shooter->isBigUnit())
        {
            if (origin.x < target.x) ++ddx;
            if (origin.y < target.y) ++ddy;
        }
        if (rule->isOutOfRange(ddx*ddx + ddy*ddy + ddz*ddz))
            continue;
        // Floor diamond uses the tile's own raised terrain level.
        const Position foot(origin.x*16, origin.y*16,
            origin.z*24 - tile->getTerrainLevel() + 1);
        const Position points[4] = {
            foot, foot + Position(16,0,0),
            foot + Position(16,16,0), foot + Position(0,16,0)
        };
        Position px[4];
        for (int i = 0; i < 4; ++i)
            _camera->convertVoxelToScreen(points[i], &px[i]);
        for (int i = 0; i < 4; ++i)
            drawLine(px[i].x, px[i].y, px[(i+1)%4].x,
                     px[(i+1)%4].y, rangeColor);
    }
    // R43: test only the CURRENT hovered source, never all map grid
    // cells. Native validateThrow is deterministic, does not spend ammo/TU,
    // and rememberObstacles=false forbids tile-obstacle writes.
    // RC58.1: a visible target unit permits full terrain collision tests,
    // even if the tiles along that path have not been revealed.
    const bool curved = action->weapon->getArcingShot(action->type);
    if (curved && _save->getTileEngine())
    {
        Tile *sourceTile = _save->getTile(source);
        unsigned long long signature = 1469598103934665603ULL;
        auto mix = [&](unsigned long long n)
        {
            signature ^= n;
            signature *= 1099511628211ULL;
        };
        for (int n : {int(shooter->getId()), int(source.x),int(source.y),int(source.z),
                      int(target.x),int(target.y),int(target.z), int(action->type),
                      int(_r22StanceOverride), int(_r22Kneel),
                      sourceTile ? int(sourceTile->getTerrainLevel()) : 0,
                      int(targetTile->getTerrainLevel())})
            mix(static_cast<unsigned>(n));
        mix(reinterpret_cast<uintptr_t>(action->weapon));
        const Uint32 now = SDL_GetTicks();
        if (_r43ArcProbeKey != signature ||
            now - _r43ArcProbeAt >= 400U)
        {
            _r43ArcProbeKey = signature;
            _r43ArcProbeAt = now;
            _r43ArcProbeState = 0; // No claim until a wholly known path exists.
            if (sourceTile && (source == shooter->getPosition() ||
                               sourceTile->getVisible() ||
                               sourceTile->isDiscovered(O_FLOOR)))
            {
                const bool kneeled = _r22StanceOverride ?
                    _r22Kneel : shooter->isKneeled();
                int dx = source.x - target.x, dy = source.y - target.y;
                const int dz = source.z - target.z;
                if (shooter->isBigUnit())
                {
                    if (source.x < target.x) ++dx;
                    if (source.y < target.y) ++dy;
                }
                if (rule->isOutOfRange(dx*dx + dy*dy + dz*dz))
                    _r43ArcProbeState = 2;
                else if (!sourceTile->hasNoFloor(_save) ||
                         source == shooter->getPosition())
                {
                    BattleAction probe = *action;
                    probe.actor = shooter;
                    probe.target = target;
                    const int stanceDelta = (kneeled ?
                        shooter->getKneelHeight() : shooter->getStandHeight())
                        - shooter->getHeight();
                    const bool virtualSource = source != shooter->getPosition() ||
                        kneeled != shooter->isKneeled();
                    Position muzzle = virtualSource ?
                        r32VirtualMuzzle(probe,sourceTile,stanceDelta,
                                         source != shooter->getPosition()) :
                        _save->getTileEngine()->getOriginVoxel(probe,nullptr);
                    BattleUnit *vacate = source == shooter->getPosition() ?
                        nullptr : sourceTile->getOverlappingUnit(_save);
                    if (vacate && (vacate == shooter ||
                        vacate->getFaction() != shooter->getFaction() ||
                        !vacate->getVisible()))
                        vacate = nullptr;
                    const Position base = target.toVoxel() +
                        Position(8,8,1-targetTile->getTerrainLevel());
                    std::vector<Position> aims;
                    if (victim && victim->getVisible())
                    {
                        const Position raised = base +
                            Position(0,0,victim->getFloatHeight());
                        aims.push_back(raised + Position(0,0,victim->getHeight()/2+1));
                        aims.push_back(raised + Position(0,0,2));
                        aims.push_back(raised + Position(0,0,victim->getHeight()-1));
                    }
                    else if (targetTile->getMapData(O_OBJECT))
                    {
                        const Position foot = target.toVoxel()+Position(8,8,0);
                        for (int zOffset : {13,8,23,2})
                            aims.push_back(foot+Position(0,0,zOffset));
                    }
                    else if (targetTile->getMapData(O_NORTHWALL))
                    {
                        const Position wall = target.toVoxel()+Position(8,0,0);
                        for (int zOffset : {13,8,20,3})
                            aims.push_back(wall+Position(0,0,zOffset));
                    }
                    else if (targetTile->getMapData(O_WESTWALL))
                    {
                        const Position wall = target.toVoxel()+Position(0,8,0);
                        for (int zOffset : {13,8,20,2})
                            aims.push_back(wall+Position(0,0,zOffset));
                    }
                    else aims.push_back(base);
                    // If a unit at the target is visible, use all terrain
                    // along the trajectory regardless of discovery status.
                    // A hidden hostile unit remains an unknown blocker.
                    const bool visibleUnitTarget = victim && victim->getVisible();
                    auto knownPath = [&](const std::vector<Position> &trace) -> bool
                    {
                        if (trace.empty()) return false;
                        for (const Position &voxel : trace)
                        {
                            Tile *tile = _save->getTile(voxel.toTile());
                            if (!tile || (!visibleUnitTarget &&
                                          !tile->getVisible() &&
                                          !tile->isDiscovered(O_FLOOR)))
                                return false;
                            BattleUnit *hidden = tile->getOverlappingUnit(_save);
                            if (hidden && hidden != shooter &&
                                !hidden->getVisible() &&
                                hidden->getFaction() != shooter->getFaction())
                                return false;
                        }
                        return true;
                    };
                    for (const Position &aim : aims)
                    {
                        double curve = 0.0;
                        int test = V_OUTOFBOUNDS;
                        // No global RNG, obstacle markers, or actual action
                        // modification. This is NOT a hit-probability test.
                        const bool visibleArc = _save->getTileEngine()->validateThrow(
                            probe,muzzle,aim,_save->getDepth(),&curve,&test,
                            false,false,&source,kneeled ? 1 : 0,false,vacate);
                        if (!visibleArc) continue;
                        std::vector<Position> visibleTrace;
                        _save->getTileEngine()->calculateParabolaVoxel(
                            muzzle,aim,true,&visibleTrace,shooter,curve,
                            Position(0,0,0),true,vacate);
                        if (!knownPath(visibleTrace)) continue;
                        double fullCurve = 0.0;
                        const bool fullArc = _save->getTileEngine()->validateThrow(
                            probe,muzzle,aim,_save->getDepth(),&fullCurve,&test,
                            false,false,&source,kneeled ? 1 : 0,true,vacate);
                        if (!fullArc) continue;
                        std::vector<Position> fullTrace;
                        const int end = _save->getTileEngine()->calculateParabolaVoxel(
                            muzzle,aim,true,&fullTrace,shooter,fullCurve,
                            Position(0,0,0),false,vacate);
                        if (knownPath(fullTrace) && end != V_OUTOFBOUNDS &&
                            Projectile::getPositionFromEnd(fullTrace,
                                Projectile::ItemDropVoxelOffset).toTile() == target)
                        {
                            _r43ArcProbeState = 1;
                            break;
                        }
                    }
                }
            }
        }
    }
    // RC59: remove the two confusing cyan labels. Candidate origins
    // remain range-only; the actual H/B/M calculation is shown at y=2.
    // A deterministic 'UNVERIFIED' probe is NOT equivalent to n256 odds
    // and need not be repeated above the detailed panel.
}

void Map::r29DrawTargetBlockGrid(BattleUnit *shooter, BattleAction *native,
                                  const Position &target)
{
    if (!_r22On || !shooter || !native || !native->weapon ||
        !_save || !_camera || !_save->getTileEngine())
    {
        r29ClearBlockGrid();
        return;
    }
    // R59: keep gameplay RNG unchanged even if an ammo or accuracy
    // callback unexpectedly draws global randomness during UI sampling.
    struct RestoreR29LiveRng
    {
        RNG::RandomState saved;
        RestoreR29LiveRng() : saved(RNG::globalRandomState()) {}
        ~RestoreR29LiveRng() { RNG::globalRandomState() = saved; }
    } preserveLiveRng;
    const bool throwing = native->type == BA_THROW;
    if (!throwing && native->type != BA_SNAPSHOT &&
        native->type != BA_AIMEDSHOT && native->type != BA_AUTOSHOT)
    {
        r29ClearBlockGrid();
        return;
    }
    BattleItem *weapon = native->weapon;
    // Spray waypoints select per-shot TARGETS, not candidate shooter tiles.
    // Their floor overlay is deliberately kept separate from H odds.
    if (native->sprayTargeting)
    {
        r29ClearBlockGrid();
        return;
    }
    const bool curved = !throwing && weapon->getArcingShot(native->type);
    BattleItem *ammo = throwing ? nullptr :
        weapon->getAmmoForAction(native->type, nullptr, nullptr);
    Tile *targetTile = _save->getTile(target);
    if ((!throwing && (!ammo || !ammo->getRules())) || !targetTile)
    {
        r29ClearBlockGrid();
        return;
    }
    BattleUnit *targetUnit = targetTile->getOverlappingUnit(_save);
    if (targetUnit && !targetUnit->getVisible()) targetUnit = nullptr;
    if (!targetUnit && !targetTile->getVisible() &&
        !targetTile->isDiscovered(O_FLOOR))
    {
        r29ClearBlockGrid(); // Never reveal a genuinely unknown target.
        return;
    }
    const RuleItemAction *config = throwing ? nullptr : weapon->getActionConf(native->type);
    unsigned shots = config ? std::max(1, config->shots) : 1;
    const int spend = config ? std::max(1, config->spendPerShot) : 1;
    if (!throwing && ammo->getRules()->getClipSize() > 0 &&
        ammo->getAmmoQuantity() >= 0 && ammo->getAmmoQuantity() < int(shots) * spend)
        shots = unsigned(ammo->getAmmoQuantity() / spend);
    const bool shotgun = !throwing && ammo->getRules()->getShotgunPellets() > 0 &&
                          ammo->getRules()->getDamageType()->isDirect();
    const unsigned pellets = shotgun ?
        unsigned(ammo->getRules()->getShotgunPellets()) : 1U;
    if (shots == 0 || shots > 16 || pellets == 0 || pellets > 20 ||
        shots * pellets > 48)
    {
        r29ClearBlockGrid(); // Unsupported large volleys must not freeze UI.
        return;
    }

    const int viewZ = _camera->getViewLevel();
    if (viewZ < 0 || viewZ >= _save->getMapSizeZ())
    {
        r29ClearBlockGrid();
        return;
    }
    const bool changedStance = _r22StanceOverride &&
                               _r22Kneel != shooter->isKneeled();
    const int stanceDelta = changedStance ?
        (_r22Kneel ? shooter->getKneelHeight() : shooter->getStandHeight())
          - shooter->getHeight() : 0;
    BattleAction baseAction = *native;
    baseAction.actor = shooter;
    baseAction.target = target;
    double accuracy = throwing ? 1.0 : BattleUnit::getFiringAccuracy(
        BattleActionAttack::GetAferShoot(baseAction, ammo), _game->getMod()) / 100.0;
    const double kneelFactor = weapon->getRules()->getKneelBonus(_game->getMod()) / 100.0;
    if (!throwing && changedStance && kneelFactor > 0.0)
        accuracy *= _r22Kneel ? kneelFactor : 1.0 / kneelFactor;

    unsigned long long key = 1469598103934665603ULL;
    auto mix = [&key](unsigned long long value) {
        key ^= value; key *= 1099511628211ULL;
    };
    mix(reinterpret_cast<uintptr_t>(shooter));
    mix(reinterpret_cast<uintptr_t>(weapon));
    mix(reinterpret_cast<uintptr_t>(ammo));
    mix(reinterpret_cast<uintptr_t>(targetUnit));
    for (int v : {int(target.x), int(target.y), int(target.z), viewZ,
                  int(shooter->getPosition().x), int(shooter->getPosition().y),
                  int(shooter->getPosition().z), int(native->type),
                  stanceDelta, int(shots), int(pellets),
                  throwing ? weapon->getTotalWeight() :
                  std::min(ammo->getAmmoQuantity(), int(shots) * spend),
                  int(accuracy * 100000.0)})
        mix(unsigned(v));
    // RC79: full-map grid remains cached until the battlefield or
    // active targeting scenario actually changes.
    mix(r79KnownBattlefieldSignature(_save));
    const Uint32 now = SDL_GetTicks();
    if (key != _r29BlockKey)
    {
        r29ClearBlockGrid();
        _r29BlockKey = key;
        _r29BlockStamp = now;
        _r29BlockPass = 0;
        // RC77: cover the COMPLETE map XY at the currently viewed level.
        // No artificial target-radius cutoff. Never enumerate unknown
        // terrain or display hidden occupants. One pass assembles the
        // candidate index; expensive native ballistics remain progressive.
        const int mapW = _save->getMapSizeX();
        const int mapH = _save->getMapSizeY();
        // R60: hard-capped short-range attacks (flamers, whips, etc.)
        // must search valid candidate firing tiles near the locked TARGET,
        // not thousands of guaranteed-red cells around the shooter.
        // Use the engine's real distance predicate, including diagonal
        // exceptions for range 1/2. Long-range weapons keep R49 ordering.
        const bool targetFirstLimitedRange = !throwing &&
            weapon->getRules()->getMaxRange() > 0 &&
            weapon->getRules()->getMaxRange() <= 24;
        _r29BlockCells.reserve(std::min<size_t>(
            static_cast<size_t>(mapW) * static_cast<size_t>(mapH), 65536U));
        for (int y = 0; y < mapH; ++y)
            for (int x = 0; x < mapW; ++x)
            {
                const Position pos(x, y, viewZ);
                Tile *tile = _save->getTile(pos);
                if (!tile || (!tile->isDiscovered(O_FLOOR) &&
                              !tile->getVisible()))
                    continue;
                if (tile->hasNoFloor(_save) && pos != shooter->getPosition())
                    continue;
                MapData *object = tile->getMapData(O_OBJECT);
                if (object && object->getTUCost(MT_WALK) >=
                              Pathfinding::INVALID_MOVE_COST)
                    continue;
                BattleUnit *occupant = tile->getOverlappingUnit(_save);
                // Unknown enemies must not be exposed by an absent cell.
                if (occupant && occupant != shooter &&
                    occupant->getVisible() &&
                    (throwing ||
                     occupant->getFaction() != shooter->getFaction()))
                    continue;
                int dxRange = pos.x - target.x;
                int dyRange = pos.y - target.y;
                const int dzRange = pos.z - target.z;
                if (shooter->isBigUnit())
                {
                    if (pos.x < target.x) ++dxRange;
                    if (pos.y < target.y) ++dyRange;
                }
                const bool beyondRange = !throwing &&
                    weapon->getRules()->isOutOfRange(
                        dxRange * dxRange + dyRange * dyRange +
                        dzRange * dzRange);
                // The short-range map contains only potentially reachable
                // launch points. A red tile here now means a sampled low
                // chance, not merely a position outside weapon range.
                if (targetFirstLimitedRange && beyondRange)
                    continue;
                R29BlockCell cell;
                cell.source = pos;
                // Range-impossible positions have zero hit probability.
                // Mark these completed WITHOUT tracing projectiles; they
                // use the lowest-probability color on the entire map.
                if (beyondRange)
                {
                    cell.trials = 8U;
                    cell.blocked = 8U;
                }
                _r29BlockCells.push_back(cell);
            }
        // R71: a locked target is not the center of the origin-choice
        // H/B/M grid. On EVERY displayed floor, prioritize launch tiles by
        // their XY distance from the real shooter's position. Retain R60's
        // target-range candidate pruning; only visit order changes.
        const Position shooterOrigin = shooter->getPosition();
        const Position gridCentre = shooterOrigin;
        std::sort(_r29BlockCells.begin(), _r29BlockCells.end(),
            [gridCentre](const R29BlockCell &a, const R29BlockCell &b)
            {
                const int da = std::max(std::abs(a.source.x-gridCentre.x),
                                        std::abs(a.source.y-gridCentre.y));
                const int db = std::max(std::abs(b.source.x-gridCentre.x),
                                        std::abs(b.source.y-gridCentre.y));
                if (da != db) return da < db;
                if (a.source.y != b.source.y)
                    return a.source.y < b.source.y;
                return a.source.x < b.source.x;
            });
        if (_r29BlockCells.empty()) _r29BlockPass = 3;
    }

    // Up to 128 native projectile trajectories per refresh, never per mouse
    // position. Sample 1, 4, then 8 full trigger pulls per candidate.
    // R71: after switching floors, n256 cursor sampling can persist as
    // the cursor moves. Do not STARVE the new floor's source-centred
    // origin grid: give it a separately throttled, small trace budget.
    const bool n256InProgress = _r22StatsKey != 0 &&
        _r22SampleCount < r22HudMaxTrials;
    const Uint32 gridInterval = n256InProgress ?
        (curved ? 300U : 120U) : (curved ? 180U : 85U);
    if (_r29BlockPass < 3 &&
        (_r29BlockBatchStamp == 0 ||
         now - _r29BlockBatchStamp >= gridInterval))
    {
        _r29BlockBatchStamp = now;
        TileEngine *engine = _save->getTileEngine();
        Tile *aimRoot = targetUnit ? _save->getTile(targetUnit->getPosition()) : nullptr;
        // Throws are geometric 5-point samples within the same target
        // tile, not gun RNG trials. Mark the legend accordingly below.
        const unsigned targetSamples[] = {1U, throwing ? 3U : 4U,
                                            throwing ? 5U : 8U};
        const unsigned cost = throwing ? 1U : shots * pellets;
        const unsigned normalBudget = throwing ? 12U :
            curved ? 24U : 128U;
        const unsigned backgroundBudget =
            std::max(cost, std::min(64U, cost * 8U));
        unsigned budget = n256InProgress ? backgroundBudget : normalBudget;
        unsigned checkedOrigins = 0U;
        const auto gridWorkStart = std::chrono::steady_clock::now();
        // Every call that could use global RNG is guarded as an additional
        // safety layer beyond Projectile's own isolated preview stream.
        struct RestoreRng
        {
            RNG::RandomState saved;
            RestoreRng() : saved(RNG::globalRandomState()) {}
            ~RestoreRng() { RNG::globalRandomState() = saved; }
        } keepRng;
        // Native canTargetUnit and LOS scans can be much costlier than
        // projectile traces. Cap them separately to avoid frame spikes.
        while (_r29BlockPass < 3 && budget >= cost &&
               checkedOrigins < (n256InProgress ? (curved ? 1U : 8U) :
                                 curved ? 3U : throwing ? 6U : 12U))
        {
            if (checkedOrigins &&
                std::chrono::steady_clock::now() - gridWorkStart >=
                    std::chrono::milliseconds(n256InProgress ? 4 : 6))
                break;
            if (_r29BlockNext >= _r29BlockCells.size())
            {
                _r29BlockNext = 0;
                ++_r29BlockPass;
                if (_r29BlockPass == 3)
                    _r29BlockStamp = now; // Refresh after settling, not mid-scan.
                continue;
            }
            R29BlockCell &cell = _r29BlockCells[_r29BlockNext];
            if (cell.trials >= targetSamples[_r29BlockPass])
            {
                ++_r29BlockNext;
                continue;
            }
            ++checkedOrigins;
            Tile *sourceTile = _save->getTile(cell.source);
            if (!sourceTile)
            {
                cell.trials = throwing ? 5 : 8;
                ++_r29BlockNext;
                continue;
            }
            if (throwing)
            {
                // Same native range + parabola + target-tile collision test
                // as the live throw; never modify real unit/action/obstacles.
                // 5 voxel sample points reveal partial window/railing cover.
                const int deltaX[5] = {0, -4, 4, 0, 0};
                const int deltaY[5] = {0, 0, 0, -4, 4};
                const unsigned remaining = targetSamples[_r29BlockPass] - cell.trials;
                const unsigned count = std::min(remaining, budget);
                BattleAction throwingAction = baseAction;
                throwingAction.relativeOrigin = BattleActionOrigin::CENTRE;
                const Position throwOrigin = r32VirtualMuzzle(throwingAction,
                    sourceTile,stanceDelta,cell.source!=shooter->getPosition());
                for (unsigned n = 0; n < count; ++n)
                {
                    const unsigned sample = cell.trials;
                    const Position goal(target.x * 16 + 8 + deltaX[sample],
                        target.y * 16 + 8 + deltaY[sample],
                        target.z * 24 - targetTile->getTerrainLevel() + 1);
                    double arc = 0.0;
                    int collision = V_EMPTY;
                    bool clear = engine->validateThrow(throwingAction, throwOrigin,
                        goal, _save->getDepth(), &arc, &collision, false,
                        false, &cell.source,
                        (_r22StanceOverride ? _r22Kneel : shooter->isKneeled()) ? 1 : 0,
                        true);
                    if (clear)
                    {
                        std::vector<Position> trace;
                        const int end = engine->calculateParabolaVoxel(throwOrigin,
                            goal, true, &trace, shooter, arc,
                            Position(0,0,0), true);
                        clear = (end == V_FLOOR || end == V_UNIT || end == V_OBJECT) &&
                                !trace.empty();
                        if (clear)
                        {
                            Tile *landed = _save->getTile(Projectile::getPositionFromEnd(
                                trace, Projectile::ItemDropVoxelOffset).toTile());
                            if (!landed) clear = false;
                            else if (landed->getMapData(O_OBJECT) &&
                                landed->getMapData(O_OBJECT)->getTUCost(MT_WALK) ==
                                    Pathfinding::INVALID_MOVE_COST &&
                                !(landed->isBigWall() &&
                                  (landed->getMapData(O_OBJECT)->getBigWall() < 1 ||
                                   landed->getMapData(O_OBJECT)->getBigWall() > 3)))
                                clear = false;
                        }
                    }
                    if (!clear) ++cell.blocked;
                    else ++cell.hits;
                    ++cell.trials;
                }
                budget -= count;
                if (cell.trials >= targetSamples[_r29BlockPass]) ++_r29BlockNext;
                continue;
            }
            if (curved)
            {
                // R59: the source-tile floor bands now measure the chance
                // that at least one flame/spit/arc projectile in the
                // COMPLETE native burst hits the locked target. Each trial
                // calls calculateThrow() with its own private RNG. No live
                // actor, action, tiles, ammunition or combat RNG is changed.
                const unsigned remaining =
                    targetSamples[_r29BlockPass] - cell.trials;
                const unsigned count = std::min(remaining, budget / cost);
                const bool previewKneel = _r22StanceOverride ?
                    _r22Kneel : shooter->isKneeled();
                BattleAction curvedAction = baseAction;
                curvedAction.relativeOrigin = BattleActionOrigin::CENTRE;
                const Position arcMuzzle = r32VirtualMuzzle(curvedAction,
                    sourceTile, stanceDelta,
                    cell.source != shooter->getPosition());
                for (unsigned n = 0; n < count; ++n)
                {
                    unsigned long long seed = key;
                    for (int v : {int(cell.source.x), int(cell.source.y),
                                  int(cell.source.z), int(cell.trials)})
                    {
                        seed ^= static_cast<unsigned>(v);
                        seed *= 1099511628211ULL;
                    }
                    RNG::RandomState previewRng(seed ? seed : 1ULL);
                    RNG::globalRandomState() = previewRng;
                    bool anyHit = false, unknown = false;
                    for (unsigned shotIndex = 1; shotIndex <= shots; ++shotIndex)
                    {
                        BattleAction shot = curvedAction;
                        shot.autoShotCounter = shotIndex;
                        Projectile arc(_game->getMod(), _save, shot,
                            cell.source, arcMuzzle, ammo);
                        const int impact = arc.calculateThrow(accuracy,
                            &previewRng, &cell.source, &arcMuzzle,
                            previewKneel ? 1 : 0);
                        const std::vector<Position> &trace =
                            arc.getTrajectoryForPreview();
                        if (trace.empty())
                        {
                            // As in R58's main arc HUD, an unexplored
                            // empty-target trajectory is not a known miss.
                            if (!targetUnit) unknown = true;
                            continue;
                        }
                        if (!targetUnit)
                        {
                            for (const Position &voxel : trace)
                            {
                                Tile *sampleTile = _save->getTile(voxel.toTile());
                                if (!sampleTile) continue;
                                if (!sampleTile->getVisible() &&
                                    !sampleTile->isDiscovered(O_FLOOR))
                                {
                                    unknown = true;
                                    break;
                                }
                                BattleUnit *hidden =
                                    sampleTile->getOverlappingUnit(_save);
                                if (hidden && hidden != shooter &&
                                    !hidden->getVisible() &&
                                    hidden->getFaction() != shooter->getFaction())
                                {
                                    unknown = true;
                                    break;
                                }
                            }
                        }
                        if (unknown) break;
                        const Position end = trace.back().toTile();
                        Tile *impactTile = _save->getTile(end);
                        BattleUnit *impactedUnit = impactTile ?
                            impactTile->getOverlappingUnit(_save) : nullptr;
                        if ((targetUnit && impact == V_UNIT &&
                             impactedUnit == targetUnit) ||
                            (!targetUnit && end == target &&
                             impact != V_EMPTY && impact != V_OUTOFBOUNDS))
                            anyHit = true;
                    }
                    ++cell.trials;
                    if (unknown) ++cell.unknown;
                    else if (anyHit) ++cell.hits;
                    else ++cell.blocked;
                }
                budget -= count * cost;
                if (cell.trials >= targetSamples[_r29BlockPass])
                    ++_r29BlockNext;
                continue;
            }
            BattleUnit *vacated = cell.source != shooter->getPosition() ?
                sourceTile->getOverlappingUnit(_save) : nullptr;
            if (vacated && (vacated == shooter ||
                vacated->getFaction() != shooter->getFaction()))
                vacated = nullptr;
            BattleAction firing = baseAction;
            firing.relativeOrigin = BattleActionOrigin::CENTRE;
            firing.autoShotCounter = 1;
            Position muzzle = r32VirtualMuzzle(firing,sourceTile,stanceDelta,
                cell.source!=shooter->getPosition());
            Position aim(target.x * 16 + 8, target.y * 16 + 8,
                target.z * 24 - targetTile->getTerrainLevel() +
                (targetUnit ? std::max(3, targetUnit->getHeight() / 2) : 12));
            // Pick an actually exposed native target voxel, including a
            // visible unit whose underlying FLOOR remains undiscovered.
            if (targetUnit && aimRoot)
            {
                const BattleActionOrigin sides[3] = {
                    BattleActionOrigin::CENTRE,
                    BattleActionOrigin::LEFT, BattleActionOrigin::RIGHT
                };
                for (int side = 0; side < 3; ++side)
                {
                    if (side > 0 && !Options::oxceEnableOffCentreShooting) break;
                    BattleAction test = firing;
                    test.relativeOrigin = sides[side];
                    Position trialMuzzle = r32VirtualMuzzle(test,sourceTile,stanceDelta,
                        cell.source!=shooter->getPosition());
                    Position trialAim = aim;
                    if (engine->canTargetUnit(&trialMuzzle, aimRoot, &trialAim,
                        shooter, false, nullptr, true, vacated))
                    {
                        firing.relativeOrigin = sides[side];
                        muzzle = trialMuzzle;
                        aim = trialAim;
                        break;
                    }
                }
            }
            else
            {
                TilePart part = O_FLOOR;
                if (targetTile->getMapData(O_OBJECT)) part = O_OBJECT;
                else if (targetTile->getMapData(O_NORTHWALL)) part = O_NORTHWALL;
                else if (targetTile->getMapData(O_WESTWALL)) part = O_WESTWALL;
                Position trialAim = aim;
                if (engine->canTargetTile(&muzzle, targetTile, part,
                    &trialAim, shooter, false, vacated))
                    aim = trialAim;
            }
            // A failed direct-voxel scan must NOT force B=100: native
            // scatter can still produce a reachable trajectory. Use the
            // geometric fallback and actually sample its projectiles.
            int virtualLOS = 1;
            if (weapon->getRules()->getNoLOSAccuracyPenalty(_game->getMod()) != -1)
            {
                Tile *aimTile = _save->getTile(aim.toTile());
                if (!aimTile) aimTile = targetTile;
                virtualLOS = aimTile->getUnit() ?
                    (engine->r25VirtualVisible(shooter, aimTile, cell.source, stanceDelta) ? 1 : 0) :
                    (engine->r25VirtualTileInLOS(&firing, aimTile, false,
                        cell.source, stanceDelta) ? 1 : 0);
            }
            const unsigned remaining = targetSamples[_r29BlockPass] - cell.trials;
            const unsigned count = std::min(remaining, budget / cost);
            for (unsigned n = 0; n < count; ++n)
            {
                unsigned long long seed = key;
                for (int v : {int(cell.source.x), int(cell.source.y), int(cell.source.z), int(cell.trials)})
                {
                    seed ^= unsigned(v);
                    seed *= 1099511628211ULL;
                }
                RNG::RandomState previewRng(seed ? seed : 1ULL);
                bool hit = false, allBlocked = true, nativeRejected = false;
                for (unsigned shot = 1; shot <= shots && !nativeRejected; ++shot)
                {
                    Position firstImpact = aim;
                    for (unsigned pellet = 0; pellet < pellets; ++pellet)
                    {
                        Position pelletAim = aim;
                        double pelletAccuracy = accuracy;
                        if (pellet && shotgun)
                        {
                            const int spread = ammo->getRules()->getShotgunSpread();
                            if (ammo->getRules()->getShotgunBehaviorType() == 1)
                            {
                                if (firstImpact != muzzle) pelletAim = firstImpact;
                                pelletAccuracy = std::max(0.0,
                                    (1.0 - spread / 100.0) *
                                    weapon->getRules()->getShotgunChoke() / 100.0);
                            }
                            else
                                pelletAccuracy = std::max(0.0,
                                    accuracy - pellet * 5.0 * spread / 100.0);
                        }
                        firing.autoShotCounter = shot;
                        Projectile projectile(_game->getMod(), _save, firing,
                            cell.source, pelletAim, ammo);
                        const int status = projectile.calculateTrajectory(
                            pelletAccuracy, muzzle, true, true,
                            &previewRng, virtualLOS, vacated);
                        const std::vector<Position> &trace =
                            projectile.getTrajectoryForPreview();
                        if (trace.empty())
                        {
                            if (shot == 1 && pellet == 0)
                                nativeRejected = true;
                            continue;
                        }
                        if (pellet == 0)
                            firstImpact = trace.size() > 2 ?
                                trace[trace.size() - 3] : trace.front();
                        const Position &end = trace.back();
                        const Position endTilePos = end.toTile();
                        Tile *endTile = _save->getTile(endTilePos);
                        BattleUnit *victim = endTile ?
                            endTile->getOverlappingUnit(_save) : nullptr;
                        if (victim && !victim->getVisible()) victim = nullptr;
                        const bool oneHit = (status == V_UNIT &&
                            targetUnit && victim == targetUnit) ||
                            (!targetUnit && endTile && endTilePos == target &&
                             status != V_EMPTY && status != V_OUTOFBOUNDS &&
                             status != V_UNIT);
                        if (oneHit)
                        {
                            hit = true;
                            continue;
                        }
                        bool oneBlocked = false;
                        if (status != V_EMPTY && status != V_OUTOFBOUNDS)
                        {
                            const double vx = aim.x - muzzle.x;
                            const double vy = aim.y - muzzle.y;
                            const double vz = aim.z - muzzle.z;
                            const double denom = vx*vx + vy*vy + vz*vz;
                            if (denom > 0.0)
                                oneBlocked = ((end.x-muzzle.x)*vx +
                                    (end.y-muzzle.y)*vy +
                                    (end.z-muzzle.z)*vz) < denom;
                        }
                        if (!oneBlocked) allBlocked = false;
                    }
                }
                if (!hit && (nativeRejected || allBlocked))
                    ++cell.blocked;
                if (hit) ++cell.hits;
                ++cell.trials;
            }
            budget -= count * cost;
            if (cell.trials >= targetSamples[_r29BlockPass])
                ++_r29BlockNext;
        }
    }

    // RC66: preserve the native cursor's bottom-face projection. The RC65
    // voxel grid landed about 8 pixels above CURSOR.PCK's lower diamond,
    // giving the misleading appearance of a mid-height box. All probability
    // sampling remains unchanged; only the screen-space paint changes.
    const SDL_Color *palette = getPalette();
    if (!palette) return;
    auto nearest = [palette](int red, int green, int blue) -> Uint8 {
        int best = 1, score = 2147483647;
        for (int i = 1; i < 256; ++i)
        {
            const int dr = int(palette[i].r) - red;
            const int dg = int(palette[i].g) - green;
            const int db = int(palette[i].b) - blue;
            const int dist = 2*dr*dr + 3*dg*dg + db*db;
            if (dist < score) { score = dist; best = i; }
        }
        return Uint8(best);
    };
    const Uint8 colors[] = {
        nearest(48, 245, 95), nearest(179, 239, 57),
        nearest(255, 223, 46), nearest(255, 135, 27),
        nearest(246, 48, 48)
    };
    // Native cursor comes from a 32x40 PCK sprite. It is painted by
    // drawTerrain BEFORE this overlay, so even a one-pixel colored line can
    // conceal it. Protect the union of opaque CURSOR.PCK pixels, including
    // both halves and the different aim/throw cursor frames. This leaves the
    // engine's original cursor layering and animation untouched.
    Uint8 cursorOpaque[32 * 40] = {};
    Position cursorScreen;
    const bool protectCursor = _cursorType != CT_NONE &&
        !_save->getBattleState()->getMouseOverIcons() &&
        _save->getTile(Position(_selectorX, _selectorY,
            _camera->getViewLevel())) != nullptr;
    if (protectCursor)
    {
        _camera->convertMapToScreen(Position(_selectorX, _selectorY,
            _camera->getViewLevel()), &cursorScreen);
        cursorScreen += _camera->getMapOffset();
        auto *cursorSet = _game->getMod()->getSurfaceSet("CURSOR.PCK");
        if (cursorSet)
        {
            for (int f = 0; f < 17; ++f)
            {
                const Surface *sprite = cursorSet->getFrame(f);
                if (!sprite) continue;
                for (int y = 0; y < 40; ++y)
                    for (int x = 0; x < 32; ++x)
                        if (sprite->getPixel(x,y))
                            cursorOpaque[y * 32 + x] = 1;
            }
        }
    }
    // Single-pixel stippling (no thick diagonals or crosshatching). Dots
    // are evaluated at native screen pixels so the cursor can always win.
    auto thinEdge = [&](const Position &a, const Position &b,
                        Uint8 color, int spacing)
    {
        const int steps = std::max(std::abs(b.x-a.x), std::abs(b.y-a.y));
        if (!steps) return;
        for (int n = 0; n < steps; n += spacing)
        {
            const int x = a.x + (b.x-a.x) * n / steps;
            const int y = a.y + (b.y-a.y) * n / steps;
            if (protectCursor && x >= cursorScreen.x &&
                x < cursorScreen.x + 32 && y >= cursorScreen.y &&
                y < cursorScreen.y + 40 &&
                cursorOpaque[(y-cursorScreen.y)*32 + (x-cursorScreen.x)])
                continue;
            setPixel(x, y, color);
        }
    };
    for (const R29BlockCell &cell : _r29BlockCells)
    {
        if (!cell.trials) continue;
        Tile *tile = _save->getTile(cell.source);
        if (!tile || (!tile->getVisible() && !tile->isDiscovered(O_FLOOR)))
            continue;
        // R59: unobserved arc trajectories must not be painted as 0%.
        const unsigned known = cell.trials - cell.unknown;
        if (known == 0U) continue;
        const unsigned h = (100U * cell.hits + known / 2U) / known;
        // R68: sparse probability indications, no field-wide colored
        // outlines for near-certain blocked or range-only candidates.
        if (h < 10U) continue;
        const unsigned band = h >= 75U ? 0 : h >= 50U ? 1 :
                              h >= 25U ? 2 : h >= 10U ? 3 : 4;
        const Uint8 color = colors[band];
        Position anchor;
        _camera->convertMapToScreen(cell.source, &anchor);
        anchor += _camera->getMapOffset();
        // Full-map cache, but paint only the actually visible viewport.
        // Off-screen rows retain their samples until the camera moves.
        if (anchor.x < -32 || anchor.x > getWidth() + 32 ||
            anchor.y < -48 || anchor.y > _visibleMapHeight + 48)
            continue;
        // The bottom diamond in native CURSOR.PCK is at local y=27..39,
        // x=2..30. Unlike voxel projection this EXACTLY follows the native
        // cursor at all view rotations and map levels, even on raised stairs.
        const Position lower[4] = {
            anchor + Position(16,27,0), anchor + Position(30,33,0),
            anchor + Position(16,39,0), anchor + Position(2,33,0)
        };
        for (int i = 0; i < 4; ++i)
            thinEdge(lower[i], lower[(i+1)%4], color, 5);
        // Terrain is genuinely raised on a stair/slope. Show that separate
        // plane as faint, sparse dots only; never move the colored base up.
        if (tile->getTerrainLevel() != 0)
        {
            const Uint8 subdued = nearest(58, 70, 66);
            const Position lift(0, tile->getTerrainLevel(), 0);
            for (int i = 0; i < 4; ++i)
                thinEdge(lower[i] + lift, lower[(i+1)%4] + lift,
                    subdued, 4);
        }
    }
    // RC78: remove H GRID legend and numeric bands; leave the entire
    // second top row unused. Current mode appears in the FIRST top row.
    // Individual candidate colors remain native n1 -> n4 -> n8 odds;
    // the hovered source still reports its own n256 H/B/M estimate.
}

void Map::refreshAIProgress(int progress)
{
	if (_save->getSide() == FACTION_NEUTRAL)
	{
		_message->setProgressBarColor(_neutralBarColor, _borderBarColor);
	}
	else
	{
		_message->setProgressBarColor(_hostileBarColor, _borderBarColor);
	}
	_message->setProgressValue(progress);
}

/**
 * Replaces a certain amount of colors in the surface's palette.
 * @param colors Pointer to the set of colors.
 * @param firstcolor Offset of the first color to replace.
 * @param ncolors Amount of colors to replace.
 */
void Map::setPalette(const SDL_Color *colors, int firstcolor, int ncolors)
{
	Surface::setPalette(colors, firstcolor, ncolors);
	for (auto* mds : *_save->getMapDataSets())
	{
		mds->getSurfaceset()->setPalette(colors, firstcolor, ncolors);
	}
	_message->setPalette(colors, firstcolor, ncolors);
	refreshHiddenMovementBackground();
	_message->initText(_game->getMod()->getFont("FONT_BIG"), _game->getMod()->getFont("FONT_SMALL"), _game->getLanguage());
	_message->setText(_game->getLanguage()->getString("STR_HIDDEN_MOVEMENT"), _game->getLanguage()->getString("STR_THINKING"));
}

void Map::refreshHiddenMovementBackground()
{
	_message->setBackground(_game->getMod()->getSurface(_save->getHiddenMovementBackground()));
}

/**
 * Get shade of wall.
 * @param part For what wall do calculations.
 * @param tileFrot Tile of wall.
 * @return Current shade of wall.
 */
int Map::getWallShade(TilePart part, Tile* tileFrot)
{
	int shade;
	if (tileFrot->isDiscovered(O_FLOOR))
	{
		shade = reShade(tileFrot);
	}
	else
	{
		shade = 16;
	}
	if (part)
	{
		if ((tileFrot->isDoor(part) || tileFrot->isUfoDoor(part)) && tileFrot->isDiscovered(part))
		{
			Position offset =
				part == O_NORTHWALL ? Position(1,0,0) :
				part == O_WESTWALL ? Position(0,1,0) :
					throw Exception("Unsupported tile part for wall shade");

			Tile *tileBehind = _save->getTile(tileFrot->getPosition() - offset);

			shade = std::min(reShade(tileFrot), tileBehind ? tileBehind->getShade() + 5 : 16);
		}
	}
	return shade;
}

/**
 * Check two positions if have same XY cords
 */
static bool positionHaveSameXY(Position a, Position b)
{
	return a.x == b.x && a.y == b.y;
}

/**
 * Check two positions if have same XY cords
 */
static bool positionInRangeXY(Position a, Position b, int diff)
{
	return std::abs(a.x - b.x) <= diff && std::abs(a.y - b.y) <= diff;
}

namespace
{

static const int ArrowBobOffsets[8] = {0,1,2,1,0,1,2,1};

static const int ArrowColorsUFO[4]  = { 6,  3, 14, 4 }; // white,    red, blue, green
static const int ArrowColorsTFTD[4] = { 4, 11, 16, 6 }; // white, orange, blue, green

int getArrowBobForFrame(int frame)
{
	return ArrowBobOffsets[frame % 8];
}

int getShadePulseForFrame(int shade, int frame)
{
	if (shade > 7) shade = 7;
	if (shade < 2) shade = 2;
	shade += (ArrowBobOffsets[frame % 8] * 2 - 2);
	return shade;
}

}
/**
 * R41: draw a physically-owned world wall on its rotated visual edge.
 * Source wall art is never modified: swap-side 90/270 deg perspectives
 * are cached as 8-bit horizontal mirrors for smooth frame rendering.
 * The wall's discovery, shade, door frame and obstacle flags remain
 * attached to its original world tile; battle physics are untouched.
 */
void Map::r41BlitWall(Surface *surface, Tile *owner, TilePart part,
    int x, int y, bool half, bool mirror)
{
    // Mirrored walls may belong to an adjacent tile. Do not expose
    // undiscovered geometry merely because the display tile is known.
    if (!owner || (!owner->isDiscovered(O_FLOOR) && !owner->isDiscovered(part)))
        return;
    SurfaceRaw<const Uint8> wall = owner->getSprite(part);
    if (!wall) return;
    if (mirror)
    {
        const int width = wall.getWidth(), height = wall.getHeight();
        const int pitch = wall.getPitch();
        auto key = std::make_tuple(wall.getBuffer(),width,height,pitch);
        auto found = _r41WallFlipCache.find(key);
        if (found == _r41WallFlipCache.end())
        {
            std::vector<Uint8> flipped(static_cast<size_t>(width) * height);
            const Uint8 *data = wall.getBuffer();
            for (int sy = 0; sy < height; ++sy)
            for (int sx = 0; sx < width; ++sx)
                flipped[static_cast<size_t>(sy) * width + sx] =
                    data[static_cast<size_t>(sy) * pitch + (width - 1 - sx)];
            found = _r41WallFlipCache.emplace(key,std::move(flipped)).first;
        }
        wall = SurfaceRaw<const Uint8>(found->second.data(),width,height,width);
    }
    const int wallShade = getWallShade(part,owner);
    const int shade = owner->getObstacle(part)
        ? getShadePulseForFrame(wallShade,_animFrame) : wallShade;
    Surface::blitRaw(surface,wall,x,y-owner->getYOffset(part),shade,half,_nvColor);
}

/**
 * Draw part of unit graphic that overlap current tile.
 * @param surface
 * @param unitTile
 * @param currTile
 * @param currTileScreenPosition
 * @param shade
 * @param obstacleShade
 * @param topLayer
 */
void Map::drawUnit(UnitSprite &unitSprite, Tile *unitTile, Tile *currTile, Position currTileScreenPosition, bool topLayer, BattleUnit* movingUnit)
{
	const int tileFoorWidth = 32;
	const int tileFoorHeight = 16;
	const int tileHeight = 40;

	if (!unitTile)
	{
		return;
	}
	BattleUnit* bu = unitTile->getOverlappingUnit(_save, TUO_ALWAYS);
	Position unitOffset;
	bool unitFromBelow = false;
	bool unitFromAbove = false;
	if (bu)
	{
		if (bu != unitTile->getUnit())
		{
			unitFromBelow = true;
		}
	}
	else if (movingUnit && unitTile == currTile)
	{
		auto* upperTile = _save->getAboveTile(unitTile);
		if (upperTile && upperTile->hasNoFloor(_save))
		{
			bu = upperTile->getUnit();
		}
		if (bu != movingUnit)
		{
			return;
		}
		unitFromAbove = true;
	}
	else
	{
		return;
	}

	if (!(bu->getVisible() || _save->getDebugMode()))
	{
		return;
	}

	unitOffset.x = unitTile->getPosition().x - bu->getPosition().x;
	unitOffset.y = unitTile->getPosition().y - bu->getPosition().y;
	int part = unitOffset.x + unitOffset.y*2;

	bool moving = bu->getStatus() == STATUS_WALKING || bu->getStatus() == STATUS_FLYING;
	int bonusWidth = moving ? 0 : tileFoorWidth;
	int topMargin = 0;
	int bottomMargin = 0;

	//if unit is from below then we draw only part that in in tile
	if (unitFromBelow)
	{
		bottomMargin = -tileFoorHeight / 2;
		topMargin = tileFoorHeight;
	}
	else if (topLayer)
	{
		topMargin = 2 * tileFoorHeight;
	}
	else
	{
		const Tile *top = _save->getAboveTile(unitTile);
		if (top && top->getOverlappingUnit(_save, TUO_ALWAYS) == bu)
		{
			topMargin = -tileFoorHeight / 2;
		}
		else
		{
			topMargin = tileFoorHeight;
		}
	}

	GraphSubset mask = GraphSubset(tileFoorWidth + bonusWidth, tileHeight + topMargin + bottomMargin).offset(currTileScreenPosition.x - bonusWidth / 2, currTileScreenPosition.y - topMargin);

	if (moving)
	{
		GraphSubset leftMask = mask.offset(-tileFoorWidth/2, 0);
		GraphSubset rightMask = mask.offset(+tileFoorWidth/2, 0);
		// Moving-unit slice masks follow the rotated screen direction.
		int direction = (bu->getDirection() + 8 - 2 * _r41Rotation) & 7;
		auto visualToWorld = [&](Position offset) -> Position
		{
			switch (_r41Rotation)
			{
			case 1: return Position(-offset.y,offset.x,offset.z);
			case 2: return Position(-offset.x,-offset.y,offset.z);
			case 3: return Position(offset.y,-offset.x,offset.z);
			default: return offset;
			}
		};
		Position partCurr = currTile->getPosition();
		Position partDest = bu->getDestination() + unitOffset;
		Position partLast = bu->getLastPosition() + unitOffset;
		bool isTileDestPos = positionHaveSameXY(partDest, partCurr);
		bool isTileLastPos = positionHaveSameXY(partLast, partCurr);

		if (unitFromAbove && partLast != unitTile->getPosition())
		{
			//this tile is below moving unit and it do not change levels, nothing to draw
			return;
		}

		//adjusting mask
		if (positionHaveSameXY(partLast, partDest))
		{
			if (currTile == unitTile)
			{
				//no change
			}
			else
			{
				//nothing to draw
				return;
			}
		}
		else if (isTileDestPos)
		{
			//unit is moving to this tile
			switch (direction)
			{
			case 0:
			case 1:
				mask = GraphSubset::intersection(mask, rightMask);
				break;
			case 2:
				//no change
				break;
			case 3:
				//no change
				break;
			case 4:
				//no change
				break;
			case 5:
			case 6:
				mask = GraphSubset::intersection(mask, leftMask);
				break;
			case 7:
				//nothing to draw
				return;
			}
		}
		else if (isTileLastPos)
		{
			//unit is exiting this tile
			switch (direction)
			{
			case 0:
				//no change
				break;
			case 1:
			case 2:
				mask = GraphSubset::intersection(mask, leftMask);
				break;
			case 3:
				//nothing to draw
				return;
			case 4:
			case 5:
				mask = GraphSubset::intersection(mask, rightMask);
				break;
			case 6:
				//no change
				break;
			case 7:
				//no change
				break;
			}
		}
		else
		{
			Position leftPos = partCurr + visualToWorld(Position(-1, 0, 0));
			Position rightPos = partCurr + visualToWorld(Position(0, -1, 0));
			if (!topLayer && (partDest.z > partCurr.z || partLast.z > partCurr.z))
			{
				//unit change layers, it will be drawn by upper layer not lower.
				return;
			}
			else if (
				(direction == 1 && (partDest == rightPos || partLast == leftPos)) ||
				(direction == 5 && (partDest == leftPos || partLast == rightPos)))
			{
				mask = GraphSubset(tileFoorWidth, tileHeight + 2 * tileFoorHeight).offset(currTileScreenPosition.x, currTileScreenPosition.y - 2 * tileFoorHeight);
			}
			else
			{
				//unit is not moving close to tile
				return;
			}
		}
	}
	else if (unitTile != currTile || unitFromAbove)
	{
		return;
	}

	Position tileScreenPosition;
	_camera->convertMapToScreen(unitTile->getPosition() + Position(0,0, (-unitFromBelow) + (+unitFromAbove)), &tileScreenPosition);
	tileScreenPosition += _camera->getMapOffset();

	//get shade helpers
	auto getTileShade = [&](Tile* tile)
	{
		return tile ? (tile->isDiscovered(O_FLOOR) ? reShade(tile) : 16) : 16;
	};
	auto getMixedTileShade = [&](Tile* tile, int heightOffset, bool below)
	{
		int shadeLower = 0;
		int shadeUpper = 0;
		if (below)
		{
			shadeLower = getTileShade(_save->getBelowTile(tile));
			shadeUpper = getTileShade(tile);
		}
		else
		{
			shadeLower = getTileShade(tile);
			shadeUpper = getTileShade(_save->getAboveTile(tile));
		}

		return Interpolate(shadeLower, shadeUpper, -heightOffset, Position::TileZ);
	};

	// draw unit
	int shade = 0;
	UnitWalkingOffset offsets = calculateWalkingOffset(bu);
	if (moving)
	{
		const Position start = bu->getPosition();
		const Position end = bu->getDestination();
		const auto minLevel = std::min(start.z, end.z); // Sint16
		const int startShade = getMixedTileShade(_save->getTile(start), start.z == minLevel ? offsets.TerrainLevelOffset : 0, false);
		const int endShade = getMixedTileShade(_save->getTile(end), end.z == minLevel ? offsets.TerrainLevelOffset : 0, false);
		shade = Interpolate(startShade, endShade, offsets.NormalizedMovePhase, 16);
	}
	else
	{
		shade = getMixedTileShade(currTile, offsets.TerrainLevelOffset, unitFromBelow);
		if (_showObstacles && unitTile->getObstacle(4))
		{
			shade = getShadePulseForFrame(shade, _animFrame);
		}
	}
	if (_debugVisionMode == 1)
	{
		shade = std::min(+NIGHT_VISION_SHADE, shade);
	}
	unitSprite.draw(bu, part, tileScreenPosition.x + offsets.ScreenOffset.x, tileScreenPosition.y + offsets.ScreenOffset.y, shade, mask, _isAltPressed && !_isCtrlPressed);
}

/**
 * Draw the terrain.
 * Keep this function as optimised as possible. It's big to minimise overhead of function calls.
 * @param surface The surface to draw on.
 */
void Map::drawTerrain(Surface *surface)
{
	_isAltPressed = _game->isAltPressed(true);
	_isCtrlPressed = _game->isCtrlPressed(true);
	int frameNumber = 0;
	SurfaceRaw<const Uint8> tmpSurface;
	Tile *tile;
	int beginX = 0, endX = _save->getMapSizeX() - 1;
	int beginY = 0, endY = _save->getMapSizeY() - 1;
	int beginZ = 0, endZ = _save->getMapSizeZ() - 1;
	Position mapPosition, screenPosition, bulletPositionScreen, movingUnitPosition;
	int bulletLowX=16000, bulletLowY=16000, bulletLowZ=16000, bulletHighX=0, bulletHighY=0, bulletHighZ=0;
	int dummy;
	BattleUnit *movingUnit = _save->getTileEngine()->getMovingUnit();
	int tileShade, tileColor, obstacleShade;
	UnitSprite unitSprite(surface, _game->getMod(), _save, _animFrame, _save->getDepth() != 0,
		_isTFTD ? ArrowColorsTFTD[1] : ArrowColorsUFO[1], _isTFTD ? ArrowColorsTFTD[2] : ArrowColorsUFO[2], _r41Rotation);
	ItemSprite itemSprite(surface, _game->getMod(), _save, _animFrame);

	const int halfAnimFrame = (_animFrame / 2) % 4;
	const int halfAnimFrameRest = (_animFrame % 2);

	// R73: after a confirmed first target, the cursor selects a hypothetical
	// firing origin. The native aiming reticle would misleadingly mark a
	// SECOND target at mid-height. Draw its floor footprint once in draw().
	const BattleAction *hoverAction = _save->getBattleGame()
		? _save->getBattleGame()->getCurrentAction() : nullptr;
	const bool secondClickFloor = _r22On && Options::battleConfirmFireMode &&
		_save->getSide() == FACTION_PLAYER &&
		(_cursorType == CT_AIM || _cursorType == CT_THROW) &&
		hoverAction && hoverAction->targeting && !hoverAction->sprayTargeting &&
		hoverAction->actor == _save->getSelectedUnit() &&
		!hoverAction->waypoints.empty() &&
		(hoverAction->type == BA_SNAPSHOT || hoverAction->type == BA_AIMEDSHOT ||
		 hoverAction->type == BA_AUTOSHOT || hoverAction->type == BA_THROW) &&
		Position(_selectorX, _selectorY, _camera->getViewLevel()) !=
			hoverAction->waypoints.front();

	NumberText *_numWaypid = 0;

	// if we got bullet, get the highest x and y tiles to draw it on
	if (_projectile && _explosions.empty())
	{
		int part = _projectile->getItem() ? 0 : BULLET_SPRITES-1;
		for (int i = 0; i <= part; ++i)
		{
			if (_projectile->getPosition(1-i).x < bulletLowX)
				bulletLowX = _projectile->getPosition(1-i).x;
			if (_projectile->getPosition(1-i).y < bulletLowY)
				bulletLowY = _projectile->getPosition(1-i).y;
			if (_projectile->getPosition(1-i).z < bulletLowZ)
				bulletLowZ = _projectile->getPosition(1-i).z;
			if (_projectile->getPosition(1-i).x > bulletHighX)
				bulletHighX = _projectile->getPosition(1-i).x;
			if (_projectile->getPosition(1-i).y > bulletHighY)
				bulletHighY = _projectile->getPosition(1-i).y;
			if (_projectile->getPosition(1-i).z > bulletHighZ)
				bulletHighZ = _projectile->getPosition(1-i).z;
		}
		// divide by 16 to go from voxel to tile position
		bulletLowX = bulletLowX / 16;
		bulletLowY = bulletLowY / 16;
		bulletLowZ = bulletLowZ / 24;
		bulletHighX = bulletHighX / 16;
		bulletHighY = bulletHighY / 16;
		bulletHighZ = bulletHighZ / 24;

		// if the projectile is outside the viewport - center it back on it
		_camera->convertVoxelToScreen(_projectile->getPosition(), &bulletPositionScreen);

		if (_projectileInFOV && _followProjectile)
		{
			Position newCam = _camera->getMapOffset();
			if (newCam.z != bulletHighZ) //switch level
			{
				newCam.z = bulletHighZ;
				if (_projectileInFOV)
				{
					_camera->setMapOffset(newCam);
					_camera->convertVoxelToScreen(_projectile->getPosition(), &bulletPositionScreen);
				}
			}
			if (_smoothCamera)
			{
				if (_launch)
				{
					_launch = false;
					if ((bulletPositionScreen.x < 1 || bulletPositionScreen.x > surface->getWidth() - 1 ||
						bulletPositionScreen.y < 1 || bulletPositionScreen.y > _visibleMapHeight - 1))
					{
						_camera->centerOnPosition(Position(bulletLowX, bulletLowY, bulletHighZ), false);
						_camera->convertVoxelToScreen(_projectile->getPosition(), &bulletPositionScreen);
					}
				}
				if (!_smoothingEngaged)
				{
					if (bulletPositionScreen.x < 1 || bulletPositionScreen.x > surface->getWidth() - 1 ||
						bulletPositionScreen.y < 1 || bulletPositionScreen.y > _visibleMapHeight - 1)
					{
						_smoothingEngaged = true;
					}
				}
				else
				{
					_camera->jumpXY(surface->getWidth() / 2 - bulletPositionScreen.x, _visibleMapHeight / 2 - bulletPositionScreen.y);
				}
			}
			else
			{
				bool enough;
				do
				{
					enough = true;
					if (bulletPositionScreen.x < 0)
					{
						_camera->jumpXY(+surface->getWidth(), 0);
						enough = false;
					}
					else if (bulletPositionScreen.x > surface->getWidth())
					{
						_camera->jumpXY(-surface->getWidth(), 0);
						enough = false;
					}
					else if (bulletPositionScreen.y < 0)
					{
						_camera->jumpXY(0, +_visibleMapHeight);
						enough = false;
					}
					else if (bulletPositionScreen.y > _visibleMapHeight)
					{
						_camera->jumpXY(0, -_visibleMapHeight);
						enough = false;
					}
					_camera->convertVoxelToScreen(_projectile->getPosition(), &bulletPositionScreen);
				}
				while (!enough);
			}
		}
	}

	// R41: the original culler assumes X grows down-right and Y down-left.
	// Use native fast culling at 0 degrees, but the full map bounds when
	// rotated to avoid losing tiles on any of the four projection quadrants.
	if (_r41Rotation == 0)
	{
		_camera->convertScreenToMap(0, 0, &beginX, &dummy);
		_camera->convertScreenToMap(surface->getWidth(), 0, &dummy, &beginY);
		_camera->convertScreenToMap(surface->getWidth() + _spriteWidth, surface->getHeight() + _spriteHeight, &endX, &dummy);
		_camera->convertScreenToMap(0, surface->getHeight() + _spriteHeight, &dummy, &endY);
		beginY -= (_camera->getViewLevel() * 2);
		beginX -= (_camera->getViewLevel() * 2);
		if (beginX < 0) beginX = 0;
		if (beginY < 0) beginY = 0;
	}
	else
	{
		// Conservative rotation-independent viewport culling. Four corners
		// padded for upper layers, shadows and tall walls, clipped to map.
		const int px = _spriteWidth * 2, py = _spriteHeight * 2;
		const int corners[4][2] = {
			{-px,-py}, {surface->getWidth()+px,-py},
			{-px,surface->getHeight()+py},
			{surface->getWidth()+px,surface->getHeight()+py}
		};
		int loX = _save->getMapSizeX(), hiX = 0;
		int loY = _save->getMapSizeY(), hiY = 0;
		for (const auto &corner : corners)
		{
			int x = 0, y = 0;
			_camera->convertScreenToMap(corner[0],corner[1],&x,&y);
			loX = std::min(loX,x); hiX = std::max(hiX,x);
			loY = std::min(loY,y); hiY = std::max(hiY,y);
		}
		const int margin = 4 + _camera->getViewLevel() * 2;
		beginX = std::max(0,loX-margin);
		beginY = std::max(0,loY-margin);
		endX = std::min(_save->getMapSizeX(),hiX+margin+1);
		endY = std::min(_save->getMapSizeY(),hiY+margin+1);
	}

	if (!_camera->getShowAllLayers())
	{
		endZ = std::min(endZ, _camera->getViewLevel());
	}
	if (_camera->getShowSingleLayer())
	{
		beginZ = _camera->getViewLevel();
		endZ = _camera->getViewLevel();
	}


	bool pathfinderTurnedOn = _save->getPathfinding()->isPathPreviewed();

	if (!_waypoints.empty() || (pathfinderTurnedOn && (_previewSettingTu || _previewSettingEnergy)))
	{
		_numWaypid = new NumberText(15, 15, 20, 30);
		_numWaypid->setPalette(getPalette());
		_numWaypid->setColor(pathfinderTurnedOn ? _messageColor + 1 : Palette::blockOffset(1));
	}

	if (movingUnit)
	{
		movingUnitPosition = movingUnit->getPosition();
	}

	surface->lock();
	const Position cameraPos = _camera->getMapOffset();
	// R44: Terrain-data driven stair reprojection. Unlike the aircraft's
	// special ramp, architectural stair sprites contain both treads and
	// their vertical risers. Never rotate every negative terrain-level
	// object: rocks and cliffs use the same MCD height field.
	auto r44RotatedStair = [&](Tile *paintTile, TilePart part,
		SurfaceRaw<const Uint8> source) -> SurfaceRaw<const Uint8>
	{
		if (_r41Rotation == 0 || !source || !paintTile ||
			source.getWidth() != 32 || source.getHeight() != 40)
			return source;
		MapData *data = paintTile->getMapData(part);
		if (!data || !data->getDataset() ||
			(part != O_OBJECT && part != O_FLOOR) ||
			data->getYOffset() != 0 || data->getBigWall() > 1 ||
			data->getTUCost(MT_WALK) >= 255)
			return source;
		const int t = data->getTerrainLevel();
		if (t >= 0 || t <= -24) return source;
		const int topHeight = -t;
		// Locate a neighboring stair of a DIFFERENT height in the
		// SAME terrain family, then infer world-up instead of assuming
		// north, south, east or west. Contradictory axes are ambiguous.
		const Position steps[4] = {Position(1,0,0),Position(-1,0,0),
			Position(0,1,0),Position(0,-1,0)};
		int up = -1, rise = 0;
		for (int i = 0; i != 4; ++i)
		{
			Tile *neighbor = _save->getTile(paintTile->getPosition() + steps[i]);
			MapData *other = neighbor ? neighbor->getMapData(part) : nullptr;
			if (!other || !other->getDataset() ||
				other->getDataset()->getName() != data->getDataset()->getName() ||
				other->getYOffset() != 0 || other->getBigWall() > 1 ||
				other->getTUCost(MT_WALK) >= 255) continue;
			const int otherT = other->getTerrainLevel();
			const int delta = std::abs(t - otherT);
			if (otherT >= 0 || otherT <= -24 ||
				(delta != 4 && delta != 6 && delta != 8 && delta != 10))
				continue;
			const int inferred = otherT < t ? i : (i ^ 1);
			if (up >= 0 && (up != inferred || rise != delta))
				return source;
			up = inferred;
			rise = delta;
		}
		if (up < 0 || rise <= 0 || topHeight <= rise/2) return source;
		// All special handling is pure 8-bit sprite output. The MCD,
		// tile height, movement, collision and visibility remain native.
		const int keyMode = 3000 + up*600 + topHeight*20 + rise;
		const auto key = std::make_tuple(source.getBuffer(),32,40,
			source.getPitch(),_r41Rotation,keyMode);
		auto hit = _r42RampRotateCache.find(key);
		if (hit == _r42RampRotateCache.end())
		{
			std::vector<Uint8> pixels(32*40,0);
			const Uint8 *raw = source.getBuffer();
			const int pitch = source.getPitch();
			const double low = std::max(0,topHeight-rise);
			const int camX = (_r41Rotation == 0 || _r41Rotation == 3) ? 1 : -1;
			const int camY = (_r41Rotation == 0 || _r41Rotation == 1) ? 1 : -1;
			const int upX = up == 0 ? 1 : up == 1 ? -1 : 0;
			const int upY = up == 2 ? 1 : up == 3 ? -1 : 0;
			const bool riserVisible = camX*upX + camY*upY < 0;
			auto pixelAt = [&](int a,int b)->Uint8
			{
				return a>=0 && a<32 && b>=0 && b<40 ?
					raw[static_cast<size_t>(b)*pitch+a] : 0;
			};
			// Each input pixel is authored for the normal SE camera. The
			// reverse camera must borrow an actual painted *side* from
			// east/south, not a nearby top pixel (RC1 invented brown slabs).
			auto sample = [&](double wx,double wy,double z,
				bool top,bool outer,bool riser) -> Uint8
			{
				if (outer)
				{
					if (wx < 0.75) wx=16.0; // unseen west -> painted east
					if (wy < 0.75) wy=16.0; // unseen north -> painted south
				}
				const int sx=static_cast<int>(std::lround(16+wx-wy));
				const int sy=static_cast<int>(std::lround(24+(wx+wy)/2-z));
				Uint8 pixel=pixelAt(sx,sy);
				if (pixel) return pixel;
				// Small 1-pixel gaps can result from forward/inverse
				// isometric rounding; never extrapolate across three pixels.
				for (int d=1;d<=2;++d)
				for (int oy=-d;oy<=d;++oy)
				for (int ox=-d;ox<=d;++ox)
				{
					if (std::abs(ox)!=d && std::abs(oy)!=d) continue;
					pixel=pixelAt(sx+ox,sy+oy);
					if (pixel) return pixel;
				}
				return 0;
			};
			for (int y=0; y<40; ++y)
			for (int x=0; x<32; ++x)
			{
				Uint8 chosen=0;
				double bestDepth=-1e9;
				for (int zi=0; zi<=topHeight*2; ++zi)
				{
					const double z=zi*0.5;
					const double vu=y-24.0+z+(x-16.0)*0.5;
					const double vv=y-24.0+z-(x-16.0)*0.5;
					if (vu<0.0 || vv<0.0 || vu>=16.0 || vv>=16.0) continue;
					double wx=vu,wy=vv;
					switch (_r41Rotation)
					{
					case 1: wx=16.0-vv; wy=vu; break;
					case 2: wx=16.0-vu; wy=16.0-vv; break;
					case 3: wx=vv; wy=16.0-vu; break;
					default: break;
					}
					const double ascent=up==0 ? wx : up==1 ? 16.0-wx :
						up==2 ? wy : 16.0-wy;
					const int step=std::min(4,std::max(1,
						static_cast<int>(std::floor(ascent/4.0))+1));
					const double height=low+rise*step/4.0;
					const bool top=std::abs(z-height)<=0.35;
					const bool outerSide=(vu>=15.6 || vv>=15.6) && z<height;
					const double stepBoundary=ascent-4.0*std::floor(ascent/4.0);
					const bool riserSide=riserVisible && stepBoundary<0.7 &&
						z<height && z>=height-rise/4.0;
					if (!top && !outerSide && !riserSide) continue;
					const Uint8 pixel=sample(wx,wy,z,top,outerSide,riserSide);
					if (!pixel) continue;
					const double depth=vu+vv+z*0.05;
					if (depth>bestDepth) { bestDepth=depth; chosen=pixel; }
				}
				pixels[static_cast<size_t>(y)*32+x]=chosen;
			}
			hit=_r42RampRotateCache.emplace(key,std::move(pixels)).first;
		}
		return SurfaceRaw<const Uint8>(hit->second.data(),32,40,32);
	};

	// R42: reproject native PLANE/PLANE2 8-bit art, not external images.
	// A tread is planar; a fuselage is top + two vertical faces. World
	// tiles, MCD/LoFT collision, ballistics and pathfinding are immutable.
	auto r42RotatedRamp = [&](Tile *paintTile, TilePart part,
		SurfaceRaw<const Uint8> source) -> SurfaceRaw<const Uint8>
	{
		if (_r41Rotation == 0 || !source || !paintTile ||
			source.getWidth() != 32 || source.getHeight() != 40)
			return source;
		MapData *data = paintTile->getMapData(part);
		if (!data || !data->getDataset()) return source;
		const std::string &dataset = data->getDataset()->getName();
		const int frame = data->getSprite(0);
		const bool classic = (dataset == "PLANE" || dataset == "PLANE_VR");
		const bool later = (dataset == "PLANE2" || dataset == "PLANE2R");
		if (!classic && !later) return source; // Keep rejected R44 generic stairs out of this release.
		const bool rampTread = part == O_OBJECT && data->getTerrainLevel() < 0 &&
			((classic && frame == 62) || (later && frame == 50));
		// RC17: PLANE frame 62 is a real 3D slope (z rises with +Y),
		// NOT a flat stair. Do not apply this model to PLANE2 frame 50.
		const bool skyrangerSlope = classic && rampTread && frame == 62;
		// The thin overhangs, tiny tail tips and spar fragments are flat
		// native aircraft art, NOT volumetric hull cubes. In particular
		// they are O_OBJECT even though all their pixels lie on a floor.
		const bool thinAircraftPiece = part == O_OBJECT &&
			((classic && (frame == 16 || frame == 20 || frame == 25 ||
				frame == 38 || frame == 39 || frame == 40)) ||
			 (later && (frame == 12 || frame == 16 || frame == 21 ||
				frame == 34 || frame == 35 || frame == 36 || frame == 39)));
		const bool flatTread = part == O_FLOOR || thinAircraftPiece;
		// Some aircraft nose plates live at the TOP of a tile (y=0..20),
		// not on its floor (y=24..40). Rotating them as filled cubes
		// invents slab walls and breaks the silhouette on reverse views.
		const bool roofPlate = part == O_OBJECT &&
			((classic && frame >= 48 && frame <= 51) ||
			 (later && (frame == 120 || frame == 121)));
		// RC26: PLANE.MAP places actual port/starboard side runs at
		// x=3 (frames 5..8) and x=6 (frames 11..14), z=1.
		// Frame 3 occurs on the elevated aft hatch at x=4/5,z=2
		// and must not be treated as a longitudinal side wall.
		const bool pairedHullSide = classic && part == O_OBJECT &&
			((frame >= 5 && frame <= 8) || (frame >= 11 && frame <= 14));
		const bool landingGear = part == O_OBJECT && (frame == 0 || frame == 1);
		// R43_QA_RC7: aircraft roof strips and rear hatch lip are
		// encoded as FLOOR, but pixels extend beyond a 32x40 diamond.
		// Reproject them in a transparent overscan canvas so their
		// existing palette indices are not clipped by camera rotation.
		const bool oversizedRoof = classic && part == O_FLOOR &&
			(frame == 52 || frame == 53 || frame == 60 || frame == 61);
		const bool fuselage = part == O_OBJECT && !rampTread &&
			!thinAircraftPiece && !landingGear;
		if (!flatTread && !rampTread && !fuselage && !landingGear) return source;
		const int width = source.getWidth(), height = source.getHeight();
		// Extended roof strips need 16px overscan in every direction;
		// ramp overhang uses the existing one-pixel extension.
		const int outputMargin = rampTread ? 1 : oversizedRoof ? 16 : 0;
		// RC11 isolated QA: connect a PLANE F2 landing to the real
		// adjacent frame-62 ramp below without redrawing the native F2.
		int landingFaceHeight = 0;
		if (part == O_FLOOR && classic && frame == 2 &&
			(_r41Rotation == 2 || _r41Rotation == 3) &&
			paintTile->getPosition().z > 0)
		{
			Tile *outer = _save->getTile(paintTile->getPosition() + Position(0,-1,-1));
			MapData *outerData = outer ? outer->getMapData(O_OBJECT) : nullptr;
			if (outerData && outerData->getDataset() &&
				outerData->getDataset()->getName() == dataset &&
				outerData->getSprite(0) == 62 && outerData->getYOffset() == 16)
				landingFaceHeight = 8;
		}
		// RC14: the native PLANE ramp rises with world +Y. The first
		// two steps have 8px exposed faces; the terminal MCD-64 step
		// has P_Level=0 but still rises 4px (T_Level=-4) above sand.
		// Render that last lip only when the downhill neighbor is flat.
		const bool downhillFace = rampTread && (_r41Rotation == 2 || _r41Rotation == 3);
		const bool terminalLip = classic && rampTread && frame == 62 &&
			data->getYOffset() == 0 && data->getTerrainLevel() == -4;
		int exposedHeight = 0;
		if (downhillFace)
		{
			Tile *nextTile = _save->getTile(paintTile->getPosition() + Position(0, -1, 0));
			MapData *nextData = nextTile ? nextTile->getMapData(O_OBJECT) : nullptr;
			if (nextData && nextData->getDataset() &&
				nextData->getDataset()->getName() == dataset &&
				nextData->getSprite(0) == frame)
				exposedHeight = std::min(8, std::max(0,
					data->getYOffset() - nextData->getYOffset()));
			else if (terminalLip) // last step always exposes 4px above Z0 ground
				exposedHeight = 4;
		}
		// Native art already encodes the rise. Fake risers created
		// detached slabs on Q2/Q3; keep only true geometry.
		const int riserHeight = skyrangerSlope ? 0 : downhillFace ? exposedHeight :
			(rampTread ? std::min(8, std::max(0, terminalLip ? 4 : data->getYOffset())) : 0);
		const int outWidth = width + outputMargin*2;
		const int baseHeight = height + outputMargin*2;
		const int outHeight = baseHeight + std::max(riserHeight, landingFaceHeight);
		const int pitch = source.getPitch();
		// RC27: A middle hull tile joins native panels at both Y edges.
		// Roof donors from the opposite side must not overwrite its
		// continuous upper shoulder. Treat terminal tiles separately.
		auto adjacentHullPanel = [&](int dy) -> bool
		{
			if (!pairedHullSide) return false;
			Tile *neighbor = _save->getTile(paintTile->getPosition() + Position(0,dy,0));
			MapData *other = neighbor ? neighbor->getMapData(O_OBJECT) : nullptr;
			if (!other || !other->getDataset()) return false;
			const std::string &otherName = other->getDataset()->getName();
			const int otherFrame = other->getSprite(0);
			const bool sameSet = otherName == dataset;
			return sameSet && ((frame >= 5 && frame <= 8 && otherFrame >= 5 && otherFrame <= 8) ||
				(frame >= 11 && frame <= 14 && otherFrame >= 11 && otherFrame <= 14));
		};
		const bool continuousHullY = adjacentHullPanel(-1) && adjacentHullPanel(1);
		const auto key = std::make_tuple(source.getBuffer(),width,height,pitch,_r41Rotation,
			(landingFaceHeight ? 60+landingFaceHeight : rampTread ? 20+riserHeight : oversizedRoof ? 50 : roofPlate ? 4 : landingGear ? 3 : pairedHullSide ? (continuousHullY ? 102 : 2) : fuselage ? 1 : 0));
		auto found = _r42RampRotateCache.find(key);
		if (found == _r42RampRotateCache.end())
		{
			std::vector<Uint8> pixels(static_cast<size_t>(outWidth)*outHeight,0);
			const Uint8 *raw = source.getBuffer();
			// A fuselage side is a partial curved *surface*, not an
			// independent 32x40 cube. Its counterpart on the other side
			// of the aircraft is available as native indexed pixel art.
			// Reflected donor keeps the line-work and curved outline.
			SurfaceRaw<const Uint8> pairedSource;
			if (pairedHullSide)
			{
				int partner=(frame < 9) ? frame+6 : frame-6;
				if (auto* frames=data->getDataset()->getSurfaceset())
					pairedSource=frames->getFrame(partner);
			}
			// RC22 QA: retain the physical panel's own native roof and corner
			// art. The west exterior/interior face is unseen in the native
			// camera and needs its paired source only when facing Q1/Q2.
			// RC20 replaced the entire panel (including its ceiling/caps),
			// which visibly displaced the fuselage and unit occlusion.
			const bool useWestHullDonor = pairedHullSide && bool(pairedSource) &&
				(_r41Rotation == 1 || _r41Rotation == 2);
			const Uint8 *hullFace = raw;
			const int hullFacePitch = pitch;
			const Uint8 *hullOpposite = pairedSource ? pairedSource.getBuffer() : nullptr;
			const int hullOppositePitch = pairedSource ? pairedSource.getPitch() : 0;
			// Only three cached directional frames are built per native PCK
			// frame; zero-degree uses the exact original sprite pointer.
			auto sample = [&](double wx,double wy,double z,bool side,
				bool oppositeRoof) -> Uint8
			{
				// The native image exposes east/south faces. For unseen
				// north/west use a reflected native face (same palette).
				// RC24 QA: a PLANE hull panel is a curved OPEN shoulder,
				// not an opaque cube ceiling. Reproject its vertical faces
				// independently from a thin top-rim silhouette. RC23's
				// entire donor-filled top invented a solid cabin slab.
				const bool westFaceDonor = side && useWestHullDonor && wx < 0.75;
				const Uint8 *faceArt = westFaceDonor ? hullOpposite : hullFace;
				const int facePitch = westFaceDonor ? hullOppositePitch : hullFacePitch;
				const Uint8 *gapArt = westFaceDonor ? hullFace : hullOpposite;
				const int gapPitch = westFaceDonor ? hullFacePitch : hullOppositePitch;
				if (side)
				{
					if (wx < 0.75) wx = 16.0;
					if (wy < 0.75) wy = 16.0;
				}
				const int sx = static_cast<int>(std::lround(16.0+wx-wy));
				const int sy = static_cast<int>(std::lround(24.0+(wx+wy)/2.0-z));
				if (sx<0 || sx>=width || sy<0 || sy>=height) return 0;
				// RC28 QA: a middle hull panel is an upright strip, not
				// an independent ceiling slab. Its upper edge is provided
				// by adjacent continuous panels; retain endcap top art.
				if (!side && continuousHullY && _r41Rotation == 2)
					return 0;
				const bool isolatedShoulder = !side && useWestHullDonor;
				const Uint8 *topArt = isolatedShoulder ? hullFace :
					(oppositeRoof ? pairedSource.getBuffer() : faceArt);
				const int topPitch = isolatedShoulder ? hullFacePitch :
					(oppositeRoof ? pairedSource.getPitch() : facePitch);
				Uint8 pixel=topArt[static_cast<size_t>(sy)*topPitch+sx];
				if (isolatedShoulder && pixel)
				{
					// RC25-26: keep ONLY the outer upper envelope of the
					// native panel. RC24's nearest-transparent search also
					// kept the inner C-shaped hole, producing jagged teeth
					// along the cabin in reverse views. Each native source
					// column yields at most three rim pixels, with no new
					// colors or fabricated solid horizontal surfaces.
					int firstOpaque=height;
					for (int iy=0; iy<height; ++iy)
						if (hullFace[static_cast<size_t>(iy)*hullFacePitch+sx])
						{ firstOpaque=iy; break; }
					if (firstOpaque>=24 || sy>firstOpaque+2)
						pixel=0;
				}
				// Fill only otherwise-empty back-face pixels using the
				// corresponding opposite native hull panel. Original
				// windows, edge lines and front-face textures survive.
				if (!pixel && side && gapArt && sx<width && sy<height)
				{
					// Repair one-pixel seams but never flood a large native
					// opening in either the outward or inward panel.
					bool nativeEdge=false;
					for (int oy=-1;oy<=1 && !nativeEdge;++oy)
					for (int ox=-1;ox<=1 && !nativeEdge;++ox)
					{
						const int nx=sx+ox,ny=sy+oy;
						if (nx>=0 && ny>=0 && nx<width && ny<height &&
							faceArt[static_cast<size_t>(ny)*facePitch+nx])
							nativeEdge=true;
					}
					if(nativeEdge)
						pixel=gapArt[static_cast<size_t>(sy)*gapPitch+sx];
				}
				// Repair isolated sampling gaps only inside native paired hull panels.
				if (!pixel && side && pairedHullSide &&
					sx > 0 && sx + 1 < width && sy > 0 && sy + 1 < height)
				{
					const Uint8 left = faceArt[static_cast<size_t>(sy)*facePitch+sx-1];
					const Uint8 right = faceArt[static_cast<size_t>(sy)*facePitch+sx+1];
					const Uint8 above = faceArt[static_cast<size_t>(sy-1)*facePitch+sx];
					const Uint8 below = faceArt[static_cast<size_t>(sy+1)*facePitch+sx];
					if (left && right && left == right) pixel=left;
					else if (above && below && above == below) pixel=above;
				}
				return pixel;
			};
			for (int y=0;y<baseHeight;++y)
			for (int x=0;x<outWidth;++x)
			{
				const int imageX=x-outputMargin;
				const int imageY=y-outputMargin;
				if (landingGear)
				{
					// A wheel and strut are vertical billboards, not solid
					// cubes; reflect the native indexed pixels for the
					// reverse camera hemisphere instead of voxel-warping.
					const int sx = (_r41Rotation == 1 || _r41Rotation == 2)
						? width-1-x : x;
					pixels[static_cast<size_t>(y)*outWidth+x] =
						raw[static_cast<size_t>(imageY)*pitch+sx];
					continue;
				}
				if (roofPlate)
				{
					// Inverse 90-degree diamond transform around the
					// ceiling anchor y=0 rather than the floor anchor y=24.
					int sx=imageX,sy=imageY;
					switch (_r41Rotation)
					{
					case 1: sx=32-2*imageY; sy=imageX/2; break;
					case 2: sx=32-imageX; sy=16-imageY; break;
					case 3: sx=2*imageY; sy=16-imageX/2; break;
					default: break;
					}
					if(sx>=0 && sy>=0 && sx<width && sy<height)
						pixels[static_cast<size_t>(y)*outWidth+x]=
							raw[static_cast<size_t>(sy)*pitch+sx];
					continue;
				}
				if (skyrangerSlope)
				{
					// The native sprite encodes z=worldY/2 (one height
					// voxel per 2 horizontal voxels) inside each 16x16 tile.
					// Native PCK: sx=16+worldX-worldY, sy=24+worldX/2.
					// Invert the *rotated* 3D isometric projection rather
					// than rotating its compressed image as a flat diamond.
					const double dx=static_cast<double>(imageX);
					const double dy=static_cast<double>(imageY);
					double wx=0.0,wy=0.0;
					switch (_r41Rotation)
					{
					case 1: wx=64.0-2.0*dy; wy=dx-wx; break;
					case 2: wx=(56.0-dx-dy)*2.0/3.0; wy=dx-16.0+wx; break;
					case 3: wx=(dy-dx)*2.0/3.0; wy=32.0-dx-wx; break;
					default: break;
					}
					if (wx>=0.0 && wy>=0.0 && wx<16.0 && wy<16.0)
					{
						const int sx=static_cast<int>(std::lround(16.0+wx-wy));
						const int sy=static_cast<int>(std::lround(24.0+wx/2.0));
						if (sx>=0 && sx<width && sy>=0 && sy<height)
							pixels[static_cast<size_t>(y)*outWidth+x]=
								raw[static_cast<size_t>(sy)*pitch+sx];
					}
					continue;
				}
				if (flatTread || rampTread)
				{
					// Isometric floor diamond: top (16,24), edges
					// (0,32), (32,32), and bottom (16,40).
					int sx=imageX,sy=imageY;
					switch (_r41Rotation)
					{
					case 1: sx=80-2*imageY; sy=24+imageX/2; break;
					case 2: sx=32-imageX; sy=64-imageY; break;
					case 3: sx=2*imageY-48; sy=40-imageX/2; break;
					default: break;
					}
					if (sx>=0&&sx<width&&sy>=0&&sy<height)
						pixels[static_cast<size_t>(y)*outWidth+x] =
							raw[static_cast<size_t>(sy)*pitch+sx];
					continue;
				}
				// Reconstruct three visible faces of the X-COM tile cube.
				// Screen (x,y) comes from (u,v,z) where the roof z=24,
				// the east face u=16 and the south face v=16.
				const double px=x+0.5, py=y+0.5, diff=px-16.0;
				const double u=py+diff/2.0, v=py-diff/2.0;
				double viewU=0.0, viewV=0.0, z=0.0;
				bool top=false, side=false;
				if (u>=0.0 && u<=16.0 && v>=0.0 && v<=16.0)
				{
					viewU=u; viewV=v; z=24.0; top=true;
				}
				else if (px<16.0)
				{
					viewU=px; viewV=16.0;
					z=24.0+(viewU+viewV)/2.0-py;
					side=z>=0.0 && z<=24.0;
				}
				else
				{
					viewU=16.0; viewV=32.0-px;
					z=24.0+(viewU+viewV)/2.0-py;
					side=z>=0.0 && z<=24.0;
				}
				if (!top && !side) continue;
				// RC27 diagnostic: remove ONLY the hypothetical flat
				// ceiling of the longitudinal hull panels. The original
				// PCK panels are open C-section walls; this isolates
				// whether the reverse-view slab is a top or side artifact.
				if (pairedHullSide && top &&
					(_r41Rotation == 1 || _r41Rotation == 2)) continue;
				double wx=viewU, wy=viewV;
				switch (_r41Rotation)
				{
				case 1: wx=16.0-viewV; wy=viewU; break;
				case 2: wx=16.0-viewU; wy=16.0-viewV; break;
				case 3: wx=viewV; wy=16.0-viewU; break;
				default: break;
				}
				// R43_QA_RC7: RC3 paired roof is retained; aircraft roof
				// overscan changes floor masks, not the object side art.
				const bool oppositeRoof=top && pairedHullSide && !continuousHullY &&
					frame>=11 && frame<=14 && _r41Rotation==2 && bool(pairedSource);
				pixels[static_cast<size_t>(y)*outWidth+x]=
					sample(wx,wy,z,side,oppositeRoof);
			}
			if (riserHeight > 0)
			{
				if (downhillFace)
				{
					// Only the native tread's downhill world-Y edge is
					// vertical here. The donor color is its own continuous
					// rim (row 31); checkerboard top pixels are NOT repeated
					// down the face (the rejected RC8 produced stripes).
					const Uint8 rim = raw[31 * pitch + 20];
					if (rim)
					for (int x = outputMargin; x < outWidth-outputMargin; ++x)
					{
						const int xx = x - outputMargin;
						if ((_r41Rotation == 2 && xx > 17) ||
							(_r41Rotation == 3 && xx < 15)) continue;
						int edge = -1;
						double nearest = 100.0;
						for (int y = 0; y < baseHeight; ++y)
						{
							if (!pixels[static_cast<size_t>(y)*outWidth+x]) continue;
							const int yy = y - outputMargin;
							const int sx = _r41Rotation == 2 ? 32-xx : 2*yy-48;
							const int sy = _r41Rotation == 2 ? 64-yy : 40-xx/2;
							const double worldY = (sy-24)-(sx-16)/2.0;
							if (worldY < -1.0 || worldY > 2.0) continue;
							if (std::abs(worldY) < nearest)
							{
								nearest = std::abs(worldY);
								edge = y;
							}
						}
						// MCD64's native PCK is a very thin triangular tread.
						// On the far camera the analytic world-Y rim may miss
						// every nontransparent pixel. For this last 4px step
						// alone, anchor the face to the visible native edge.
						if (edge < 0 && terminalLip)
						{
							for (int y=baseHeight-1; y>=0; --y)
								if (pixels[static_cast<size_t>(y)*outWidth+x])
								{ edge=y; break; }
						}
						if (edge < 0) continue;
						const Uint8 topPixel = pixels[static_cast<size_t>(edge)*outWidth+x];
						for (int dy = 1; dy <= riserHeight && edge+dy < outHeight; ++dy)
						{
							const size_t i = static_cast<size_t>(edge+dy)*outWidth+x;
							if (!pixels[i]) pixels[i] = (dy == 1 ? topPixel : rim);
						}
					}
				}
				else
				{
					// Existing one-pixel-overscan RC7 riser for Q1.
					for (int x=outputMargin;x<outWidth-outputMargin;++x)
					{
						int bottom=-1;
						for (int y=baseHeight-1;y>=0;--y)
						{
							if (pixels[static_cast<size_t>(y)*outWidth+x])
							{
								bottom=y;
								break;
							}
						}
						if (bottom<0) continue;
						const Uint8 nativeEdge=pixels[static_cast<size_t>(bottom)*outWidth+x];
						const Uint8 riserColor=nativeEdge == 88 ? 86 : nativeEdge == 9 ? 8 : 6;
						for (int dy=1;dy<=riserHeight && bottom+dy<outHeight;++dy)
							pixels[static_cast<size_t>(bottom+dy)*outWidth+x]=riserColor;
					}
				}
			}
			// RC14: the 4px lip can be hidden by the adjacent ground tile
			// in reverse views. Shade only the last two *visible* pixels
			// of its native PCK edge, without fabricating a full dark slab.
			if (terminalLip && downhillFace && !skyrangerSlope)
			{
				const Uint8 lipShade=raw[31*pitch+20];
				if (lipShade)
				for (int x=outputMargin;x<outWidth-outputMargin;++x)
				{
					const int xx=x-outputMargin;
					if ((_r41Rotation==2 && xx>17) ||
						(_r41Rotation==3 && xx<15)) continue;
					int bottom=-1;
					for (int y=baseHeight-1;y>=0;--y)
						if (pixels[static_cast<size_t>(y)*outWidth+x])
						{ bottom=y; break; }
					if (bottom<1) continue;
					for (int dy=0;dy<2;++dy)
					{
						const size_t i=static_cast<size_t>(bottom-dy)*outWidth+x;
						if (pixels[i]) pixels[i]=lipShade;
					}
				}
			}
			if (landingFaceHeight)
			{
				// The original edge index is from the native F2 PCK.
				// RC10 was rejected: painting inside its original 40px
				// silhouette covered the hull with a bright slab. Limit
				// this mask to the genuinely NEW pixels below y=40.
				const Uint8 fascia = raw[29*pitch+4];
				if (fascia)
				for (int x=1; x<outWidth-1; ++x)
				{
					if ((_r41Rotation==2 && x>16) || (_r41Rotation==3 && x<16)) continue;
					int edge=-1; double nearest=100.0;
					for (int y=24; y<baseHeight; ++y)
					{
						if (!pixels[static_cast<size_t>(y)*outWidth+x]) continue;
						const int sx=_r41Rotation==2 ? 32-x : 2*y-48;
						const int sy=_r41Rotation==2 ? 64-y : 40-x/2;
						const double worldY=(sy-24)-(sx-16)/2.0;
						if (worldY<-1.0 || worldY>2.0) continue;
						if (std::abs(worldY)<nearest)
						{ nearest=std::abs(worldY); edge=y; }
					}
					if (edge<0) continue;
					for (int dy=1; dy<=landingFaceHeight && edge+dy<outHeight; ++dy)
					{
						const size_t i=static_cast<size_t>(edge+dy)*outWidth+x;
						if (edge+dy>=baseHeight && !pixels[i]) pixels[i]=fascia;
					}
				}
			}
			found=_r42RampRotateCache.emplace(key,std::move(pixels)).first;
		}
		return SurfaceRaw<const Uint8>(found->second.data(),outWidth,outHeight,outWidth);
	};

	// The neighbor offset lists below encode visual back/front tiles.
	// Convert them to world deltas rather than relying on world-north.
	auto viewToWorldDelta = [&](Position v) -> Position
	{
		switch (_r41Rotation)
		{
		case 1: return Position(-v.y, v.x, v.z);
		case 2: return Position(-v.x,-v.y, v.z);
		case 3: return Position( v.y,-v.x, v.z);
		default: return v;
		}
	};
	for (int itZ = beginZ; itZ <= endZ; itZ++)
	{
		bool topLayer = itZ == endZ;
		// Painter traversal follows rotated screen-space diagonal order.
		for (int row = 0; row < endY - beginY; ++row)
		{
			const int itY = (_r41Rotation == 2 || _r41Rotation == 3)
				? endY - 1 - row : beginY + row;
			for (int col = 0; col < endX - beginX; ++col)
			{
				const int itX = (_r41Rotation == 1 || _r41Rotation == 2)
					? endX - 1 - col : beginX + col;
				mapPosition = Position(itX, itY, itZ);
				tile = _save->getTile(mapPosition);
				if (!tile) continue;
				_camera->convertMapToScreen(mapPosition, &screenPosition);
				screenPosition += cameraPos;

				// only render cells that are inside the surface
				if (screenPosition.x > -_spriteWidth && screenPosition.x < surface->getWidth() + _spriteWidth &&
					screenPosition.y > -_spriteHeight && screenPosition.y < surface->getHeight() + _spriteHeight )
				{
					bool isUnitMovingNearby = movingUnit && positionInRangeXY(movingUnitPosition, mapPosition, 2);

					if (tile->isDiscovered(O_FLOOR))
					{
						tileShade = reShade(tile);
						obstacleShade = tileShade;
						if (_showObstacles)
						{
							if (tile->isObstacle())
							{
								obstacleShade = getShadePulseForFrame(tileShade, _animFrame);
							}
						}
					}
					else
					{
						tileShade = 16;
						obstacleShade = 16;
					}

					tileColor = tile->getMarkerColor();

					// R41: BIGWALL back/front classification is view-dependent.
					// 4=W, 5=N, 6=E, 7=S, 8=E+S, 9=W+N.
					// Physics and world-facing large-wall flags are unchanged.
					bool r41ObjectBack = tile->isBackTileObject(O_OBJECT);
					if (_r41Rotation != 0 && tile->getMapData(O_OBJECT))
					{
						MapData *objectData = tile->getMapData(O_OBJECT);
						const int bigWall = objectData->getBigWall();
						// RC26 corrected PLANE.MAP side-run identification:
						// west MCD 5..8; east MCD 11..14 (not elevated rear MCD 3).
						// Their BigWall flag is 1 (whole tile), so ordinary wall
						// classification never changes when the camera rotates.
						// Only the side facing the camera may cover foreground
						// units; the opposite side is drawn behind the cabin.
						const std::string datasetName = objectData->getDataset()
							? objectData->getDataset()->getName() : "";
						const int frame = objectData->getSprite(0);
						const bool planeSide = datasetName == "PLANE" || datasetName == "PLANE_VR";
						const bool westSide = planeSide && frame >= 5 && frame <= 8;
						const bool eastSide = planeSide && frame >= 11 && frame <= 14;
						if (westSide || eastSide)
						{
							const bool westFacesCamera = _r41Rotation == 1 || _r41Rotation == 2;
							r41ObjectBack = westSide ? !westFacesCamera : westFacesCamera;
						}
						else if (bigWall >= 4 && bigWall <= 9)
						{
							static constexpr bool viewBack[4][6] = {
								{true,true,false,false,false,true},   // W, N
								{false,true,true,false,true,true},   // N, E
								{false,false,true,true,true,false}, // E, S
								{true,false,false,true,true,true}   // S, W
							};
							r41ObjectBack = viewBack[_r41Rotation][bigWall - 4];
						}
					}

					// Draw floor. R43_QA_RC7: selected aircraft roof sprites
					// need a wider transparent canvas after 90-degree
					// projection. The drawing origin offsets by exactly
					// half the added width, so world tile geometry stays put.
					tmpSurface = r42RotatedRamp(tile,O_FLOOR,tile->getSprite(O_FLOOR));
					if (tmpSurface)
					{
						const int expandedPad=std::max(0,(tmpSurface.getWidth()-32)/2);
						const int px=screenPosition.x-expandedPad;
						const int py=screenPosition.y-expandedPad-tile->getYOffset(O_FLOOR);
						if (tile->getObstacle(O_FLOOR))
							Surface::blitRaw(surface, tmpSurface, px, py, obstacleShade, false, _nvColor);
						else
							Surface::blitRaw(surface, tmpSurface, px, py, tileShade, false, _nvColor);
					}

					// RC16: paint each exposed PLANE ramp riser AFTER the
					// next downhill (-Y) tile's floor, BEFORE its object/units.
					// Reverse-view painter order otherwise hides the 8/8/4px
					// downward faces under the front neighbor's floor.
					// This strictly affects art: terrain/MCD, collision, FOV
					// and pathfinding remain native.
					if ((_r41Rotation == 2 || _r41Rotation == 3) &&
						tile->isDiscovered(O_FLOOR))
					{
						Tile *uphill = _save->getTile(mapPosition + Position(0,1,0));
						MapData *step = uphill ? uphill->getMapData(O_OBJECT) : nullptr;
						if (step && step->getDataset() &&
							(step->getDataset()->getName() == "PLANE" ||
							 step->getDataset()->getName() == "PLANE_VR") &&
							step->getSprite(0) == 62 &&
							uphill->isDiscovered(O_FLOOR))
						{
							const int p = step->getYOffset();
							const int t = step->getTerrainLevel();
							// Only the native three-stage Skyranger stair.
							const bool validStep = (p == 0 || p == 8 || p == 16) &&
								t == -(p+4);
							MapData *lower = tile->getMapData(O_OBJECT);
							const bool neighboringStep = lower && lower->getDataset() &&
								lower->getDataset()->getName() == step->getDataset()->getName() &&
								lower->getSprite(0) == 62 && lower->getYOffset() == p-8;
							const bool validDownhill = p == 0 ? !neighboringStep : neighboringStep;
							const int riserH = p == 0 ? 4 : 8;
							if (validStep && validDownhill)
							{
								SurfaceRaw<const Uint8> whole = r42RotatedRamp(
									uphill,O_OBJECT,uphill->getSprite(O_OBJECT));
								if (whole && whole.getWidth() == 34 &&
									whole.getHeight() == 42+riserH)
								{
									const int w=whole.getWidth(),h=whole.getHeight();
									const int pitch=whole.getPitch();
									const int baseH=h-riserH;
									std::vector<Uint8> face(static_cast<size_t>(w)*h,0);
									int painted=0;
									for (int x=1; x<w-1; ++x)
									{
										const int xx=x-1;
										if ((_r41Rotation==2 && xx>17) ||
											(_r41Rotation==3 && xx<15)) continue;
										int edge=-1;
										double nearest=100.0;
										for (int y=0; y<baseH; ++y)
										{
											if (!whole.getBuffer()[static_cast<size_t>(y)*pitch+x]) continue;
											const int yy=y-1;
											const int sx=_r41Rotation==2 ? 32-xx : 2*yy-48;
											const int sy=_r41Rotation==2 ? 64-yy : 40-xx/2;
											const double worldY=(sy-24)-(sx-16)/2.0;
											if (worldY < -1.0 || worldY > 2.0) continue;
											if (std::abs(worldY)<nearest)
											{ nearest=std::abs(worldY);edge=y; }
										}
										if (edge<0 && p==0)
											for (int y=baseH-1; y>=0; --y)
												if (whole.getBuffer()[static_cast<size_t>(y)*pitch+x])
												{ edge=y;break; }
										if (edge<0) continue;
										for (int dy=1; dy<=riserH && edge+dy<h; ++dy)
										{
											const size_t src=static_cast<size_t>(edge+dy)*pitch+x;
											const Uint8 pixel=whole.getBuffer()[src];
											if (!pixel) continue;
											face[static_cast<size_t>(edge+dy)*w+x]=pixel;
											++painted;
										}
									}
									if (painted)
									{
										Position upScreen;
										_camera->convertMapToScreen(uphill->getPosition(),&upScreen);
										upScreen += cameraPos;
										Surface::blitRaw(surface,SurfaceRaw<const Uint8>(
											face.data(),w,h,w),
											upScreen.x-1,upScreen.y-1-p,
											reShade(uphill),false,_nvColor);
										if (_r41Rotation==2 && itX==24)
										{
											static bool loggedP[3]={false,false,false};
											const int idx=p/8;
											if (!loggedP[idx])
											{
												loggedP[idx]=true;
												Log(LOG_INFO) << "RC16_RISER_COMPOSITE P=" << p
													<< " faceH=" << riserH << " painted=" << painted;
											}
										}
									}
								}
							}
						}
					}

					auto* unit = tile->getUnit();

					// Draw cursor back (not a second aim reticle for floor-origin preview).
					if (_cursorType != CT_NONE && _selectorX > itX - _cursorSize && _selectorY > itY - _cursorSize && _selectorX < itX+1 && _selectorY < itY+1 && !_save->getBattleState()->getMouseOverIcons() && !(secondClickFloor && _camera->getViewLevel() == itZ))
					{
						if (_camera->getViewLevel() == itZ)
						{
							if (_cursorType != CT_AIM)
							{
								if (unit && (unit->getVisible() || _save->getDebugMode()))
									frameNumber = halfAnimFrameRest; // yellow box
								else
									frameNumber = 0; // red box
							}
							else
							{
								if (unit && (unit->getVisible() || _save->getDebugMode()))
									frameNumber = 7 + halfAnimFrame; // yellow animated crosshairs
								else
									frameNumber = 6; // red static crosshairs
							}
							tmpSurface = _game->getMod()->getSurfaceSet("CURSOR.PCK")->getFrame(frameNumber);
							Surface::blitRaw(surface, tmpSurface, screenPosition.x, screenPosition.y, 0);
						}
						else if (_camera->getViewLevel() > itZ)
						{
							frameNumber = 2; // blue box
							tmpSurface = _game->getMod()->getSurfaceSet("CURSOR.PCK")->getFrame(frameNumber);
							Surface::blitRaw(surface, tmpSurface, screenPosition.x, screenPosition.y, 0);
						}
					}

					if (isUnitMovingNearby)
					{
						// special handling for a moving unit in background of tile.
						constexpr static Position backPos[] =
						{
							Position(0, -1, 0),
							Position(-1, -1, 0),
							Position(-1, 0, 0),
						};

						for (size_t b = 0; b < std::size(backPos); ++b)
						{
							drawUnit(unitSprite, _save->getTile(mapPosition + viewToWorldDelta(backPos[b])), tile, screenPosition, topLayer);
						}
					}

					// Draw walls. R41: wall ownership remains in *world* tiles;
					// only the screen-side edge changes with camera rotation.
					// Moving the actual physical boundary rather than moving a
					// same-tile picture is essential to correct unit occlusion.
					{
						if (_r41Rotation == 0)
						{
							// Preserve the unmodified native fast path at 0 degrees.
							tmpSurface = tile->getSprite(O_WESTWALL);
							if (tmpSurface)
							{
								int wallShade = getWallShade(O_WESTWALL, tile);
								if (tile->getObstacle(O_WESTWALL))
									Surface::blitRaw(surface, tmpSurface, screenPosition.x, screenPosition.y - tile->getYOffset(O_WESTWALL), obstacleShade, false, _nvColor);
								else
									Surface::blitRaw(surface, tmpSurface, screenPosition.x, screenPosition.y - tile->getYOffset(O_WESTWALL), wallShade, false, _nvColor);
							}
							tmpSurface = tile->getSprite(O_NORTHWALL);
							if (tmpSurface)
							{
								int wallShade = getWallShade(O_NORTHWALL, tile);
								if (tile->getObstacle(O_NORTHWALL))
									Surface::blitRaw(surface, tmpSurface, screenPosition.x, screenPosition.y - tile->getYOffset(O_NORTHWALL), obstacleShade, bool(tile->getSprite(O_WESTWALL)), _nvColor);
								else
									Surface::blitRaw(surface, tmpSurface, screenPosition.x, screenPosition.y - tile->getYOffset(O_NORTHWALL), wallShade, bool(tile->getSprite(O_WESTWALL)), _nvColor);
							}
						}
						else
						{
							// Visual WEST/NORTH are respectively the negative U/V
							// boundaries of the rotated diamond. The positive-facing
							// world edges belong to the adjacent physical tile.
							Tile *screenWestOwner = tile;
							Tile *screenNorthOwner = tile;
							TilePart screenWestPart = O_WESTWALL;
							TilePart screenNorthPart = O_NORTHWALL;
							switch (_r41Rotation)
							{
							case 1:
								screenWestPart = O_NORTHWALL;
								screenNorthOwner = _save->getTile(mapPosition + Position(1,0,0));
								screenNorthPart = O_WESTWALL;
								break;
							case 2:
								screenWestOwner = _save->getTile(mapPosition + Position(1,0,0));
								screenNorthOwner = _save->getTile(mapPosition + Position(0,1,0));
								break;
							case 3:
								screenWestOwner = _save->getTile(mapPosition + Position(0,1,0));
								screenWestPart = O_NORTHWALL;
								screenNorthPart = O_WESTWALL;
								break;
							}
							// Mirror wall art only if axes are exchanged by the view.
							// Store the mirror once per unique sprite frame.
							r41BlitWall(surface,screenWestOwner,screenWestPart,
								screenPosition.x,screenPosition.y,false,bool(_r41Rotation & 1));
							r41BlitWall(surface,screenNorthOwner,screenNorthPart,
								screenPosition.x,screenPosition.y,
								screenWestOwner && bool(screenWestOwner->getSprite(screenWestPart)),
								bool(_r41Rotation & 1));
						}
						// Draw object
						tmpSurface = r42RotatedRamp(tile,O_OBJECT,tile->getSprite(O_OBJECT));
						if (tmpSurface)
						{
							if (r41ObjectBack)
							{
								const int edge = tmpSurface.getWidth() == 34 && tmpSurface.getHeight() >= 42 ? -1 : 0;
								if (tile->getObstacle(O_OBJECT))
									Surface::blitRaw(surface, tmpSurface, screenPosition.x + edge, screenPosition.y + edge - tile->getYOffset(O_OBJECT), obstacleShade, false, _nvColor);
								else
									Surface::blitRaw(surface, tmpSurface, screenPosition.x + edge, screenPosition.y + edge - tile->getYOffset(O_OBJECT), tileShade, false, _nvColor);
							}
						}
						// draw an item on top of the floor (if any)
						BattleItem* item = tile->getTopItem();
						if (item)
						{
							itemSprite.draw(item,
								screenPosition.x,
								screenPosition.y + tile->getTerrainLevel(),
								tileShade
							);
							if (_anyIndicator)
							{
								BattleUnit *itemUnit = item->getUnit();
								if (itemUnit && itemUnit->getStatus() == STATUS_UNCONSCIOUS && itemUnit->indicatorsAreEnabled())
								{
									if (_burnIndicator && itemUnit->getFire() > 0)
									{
										_burnIndicator->blitNShade(surface,
											screenPosition.x,
											screenPosition.y + tile->getTerrainLevel(),
											tileShade);
									}
									else if (_woundIndicator && itemUnit->getFatalWounds() > 0)
									{
										_woundIndicator->blitNShade(surface,
											screenPosition.x,
											screenPosition.y + tile->getTerrainLevel(),
											tileShade);
									}
									else if (_shockIndicator && itemUnit->hasNegativeHealthRegen())
									{
										_shockIndicator->blitNShade(surface,
											screenPosition.x,
											screenPosition.y + tile->getTerrainLevel(),
											tileShade);
									}
									else if (_stunIndicator)
									{
										_stunIndicator->blitNShade(surface,
											screenPosition.x,
											screenPosition.y + tile->getTerrainLevel(),
											tileShade);
									}
								}
							}
						}
					}

					// check if we got bullet && it is in Field Of View
					if (_projectile && _projectileInFOV)
					{
						tmpSurface = nullptr;
						BattleItem* item = _projectile->getItem();
						if (item)
						{
							Position voxelPos = _projectile->getPosition();
							// draw shadow on the floor
							voxelPos.z = _save->getTileEngine()->castedShade(voxelPos);
							if (voxelPos.x / 16 >= itX &&
								voxelPos.y / 16 >= itY &&
								voxelPos.x / 16 <= itX+1 &&
								voxelPos.y / 16 <= itY+1 &&
								voxelPos.z / 24 == itZ &&
								_save->getTileEngine()->isVoxelVisible(voxelPos))
							{
								_camera->convertVoxelToScreen(voxelPos, &bulletPositionScreen);

								itemSprite.drawShadow(item,
									bulletPositionScreen.x - 16,
									bulletPositionScreen.y - 26
								);
							}

							voxelPos = _projectile->getPosition();
							// draw thrown object
							if (voxelPos.x / 16 >= itX &&
								voxelPos.y / 16 >= itY &&
								voxelPos.x / 16 <= itX+1 &&
								voxelPos.y / 16 <= itY+1 &&
								voxelPos.z / 24 == itZ &&
								_save->getTileEngine()->isVoxelVisible(voxelPos))
							{
								_camera->convertVoxelToScreen(voxelPos, &bulletPositionScreen);

								itemSprite.draw(item,
									bulletPositionScreen.x - 16,
									bulletPositionScreen.y - 26,
									tileShade
								);
							}
						}
						else
						{
							// draw bullet on the correct tile
							if (itX >= bulletLowX && itX <= bulletHighX && itY >= bulletLowY && itY <= bulletHighY)
							{
								int begin = 0;
								int end = BULLET_SPRITES;
								int direction = 1;
								if (_projectile->isReversed())
								{
									begin = BULLET_SPRITES - 1;
									end = -1;
									direction = -1;
								}

								for (int i = begin; i != end; i += direction)
								{
									tmpSurface = _projectileSet->getFrame(_projectile->getParticle(i));
									if (tmpSurface)
									{
										Position voxelPos = _projectile->getPosition(1-i);
										// draw shadow on the floor
										voxelPos.z = _save->getTileEngine()->castedShade(voxelPos);
										if (voxelPos.x / 16 == itX &&
											voxelPos.y / 16 == itY &&
											voxelPos.z / 24 == itZ &&
											_save->getTileEngine()->isVoxelVisible(voxelPos))
										{
											_camera->convertVoxelToScreen(voxelPos, &bulletPositionScreen);
											bulletPositionScreen.x -= tmpSurface.getWidth() / 2;
											bulletPositionScreen.y -= tmpSurface.getHeight() / 2;
											Surface::blitRaw(surface, tmpSurface, bulletPositionScreen.x, bulletPositionScreen.y, 16, false, _nvColor);
										}

										// draw bullet itself
										voxelPos = _projectile->getPosition(1-i);
										if (voxelPos.x / 16 == itX &&
											voxelPos.y / 16 == itY &&
											voxelPos.z / 24 == itZ &&
											_save->getTileEngine()->isVoxelVisible(voxelPos))
										{
											_camera->convertVoxelToScreen(voxelPos, &bulletPositionScreen);
											bulletPositionScreen.x -= tmpSurface.getWidth() / 2;
											bulletPositionScreen.y -= tmpSurface.getHeight() / 2;
											Surface::blitRaw(surface, tmpSurface, bulletPositionScreen.x, bulletPositionScreen.y, 0, false, _nvColor);
										}
									}
								}
							}
						}
					}

					//draw particle clouds
					int pixelMaskArray[] = { 0, 2, 1, 3 };
					SurfaceRaw<int> pixelMask(pixelMaskArray, 2, 2);
					const int vaporScreenOriginX = screenPosition.x + _spriteWidth / 2;
					const int vaporScreenOriginY = screenPosition.y + _spriteHeight - _spriteWidth / 2 + tile->getPosition().toVoxel().z;
					const Uint8* const transparetPtr = _transparencies->data();

					//draw particle clouds behind solder
					for (const Particle& p : getVaporParticle(tile, 0))
					{
						int vaporX = vaporScreenOriginX + p.getOffsetX();
						int vaporY = vaporScreenOriginY + p.getOffsetY();
						auto transparetOffsets = transparetPtr
							+ (p.getColor() * Mod::TransparenciesOpacityLevels * Mod::TransparenciesPaletteColors)
							+ (p.getOpacity() * Mod::TransparenciesPaletteColors);

						ShaderDrawFunc(
							[&](Uint8& dest, int size)
							{
								if (p.getSize() <= size)
								{
									dest = transparetOffsets[dest];
								}
							},
							ShaderSurface(this),
							ShaderMove(pixelMask, vaporX, vaporY)
						);
					}

					unit = tile->getUnit();
					// Draw soldier from this tile, below or above
					drawUnit(unitSprite, tile, tile, screenPosition, topLayer, isUnitMovingNearby ? movingUnit : nullptr);
                    // R132: XP-blocked hostile indicator is independent of
                    // surrender flags. Never disclose a hidden enemy.
                    if (topLayer && unit &&
                        unit->getOriginalFaction() == FACTION_HOSTILE &&
                        (unit->getVisible() || _save->getDebugMode()) &&
                        _game->getMod()->getScriptGlobal())
                    {
                        const ScriptTag<BattleUnit> xpBlockTag =
                            _game->getMod()->getScriptGlobal()->getTag<ScriptTag<BattleUnit> >(
                                "Tag.IXP_HOSTILE_UNIT_XP_BLOCK_LEVEL");
                        if (unit->getScriptUnitTag(xpBlockTag) >= 2)
                        {
                            const int iconX = screenPosition.x + _spriteWidth / 2 + 7;
                            const int iconY = screenPosition.y - 11;
                            drawRect(iconX - 1, iconY - 1, 11, 11, 1);
                            drawString(iconX, iconY, "X", 15);
                        }
                    }

					if (isUnitMovingNearby)
					{
						// special handling for a moving unit in foreground of tile.
						constexpr static Position frontPos[] =
						{
							Position(-1, +1, 0),
							Position(0, +1, 0),
							Position(+1, +1, 0),
							Position(+1, 0, 0),
							Position(+1, -1, 0),
						};

						for (size_t f = 0; f < std::size(frontPos); ++f)
						{
							drawUnit(unitSprite, _save->getTile(mapPosition + viewToWorldDelta(frontPos[f])), tile, screenPosition, topLayer);
						}
					}

					// R41: some physically-owned world walls at the map's
					// west/north rim would otherwise be mapped to the back edge
					// of an OUT-OF-BOUNDS neighbor. Draw those as front edges
					// after units, offset by a half diamond (16x8 pixels).
					// Their real tile, discovery and collision are untouched.
					if (_r41Rotation && tile->isDiscovered(O_FLOOR))
					{
						if ((_r41Rotation == 1 || _r41Rotation == 2) &&
							mapPosition.x == 0)
						{
							const int xoff = _r41Rotation == 1 ? -16 : 16;
							r41BlitWall(surface,tile,O_WESTWALL,
								screenPosition.x + xoff,screenPosition.y + 8,
								false,bool(_r41Rotation & 1));
						}
						if ((_r41Rotation == 2 || _r41Rotation == 3) &&
							mapPosition.y == 0)
						{
							const int xoff = _r41Rotation == 2 ? -16 : 16;
							r41BlitWall(surface,tile,O_NORTHWALL,
								screenPosition.x + xoff,screenPosition.y + 8,
								false,bool(_r41Rotation & 1));
						}
					}

					// Draw smoke/fire
					if (tile->getSmoke() && tile->isDiscovered(O_FLOOR))
					{
						frameNumber = 0;
						int shade = 0;
						if (!tile->getFire())
						{
							if (_save->getDepth() > 0)
							{
								frameNumber += Mod::UNDERWATER_SMOKE_OFFSET;
							}
							else
							{
								frameNumber += Mod::SMOKE_OFFSET;
							}
							if (Mod::EXTENDED_SMOKE_OFFSET == 0)
							{
								frameNumber += int(floor((tile->getSmoke() / 6.0) - 0.1)); // see http://www.ufopaedia.org/images/c/cb/Smoke.gif
							}
							else if (Mod::EXTENDED_SMOKE_OFFSET == 1)
							{
								frameNumber += int(floor((tile->getSmoke() / 6.0) - 0.1)) * 4;
							}
							else // if (Mod::EXTENDED_SMOKE_OFFSET == 2)
							{
								frameNumber += (tile->getSmoke() - 1) / 5 * 4;
							}
							shade = tileShade;
						}

						if (halfAnimFrame + tile->getAnimationOffset() > 3)
						{
							frameNumber += halfAnimFrame + tile->getAnimationOffset() - 4;
						}
						else
						{
							frameNumber += halfAnimFrame + tile->getAnimationOffset();
						}
						tmpSurface = _game->getMod()->getSurfaceSet("SMOKE.PCK")->getFrame(frameNumber);
						if (gHighVisibilitySmoke && !tile->getFire() && tmpSurface)
						{
							// Indexed-color sprites do not support per-pixel alpha here.
							// Keep ~25% of interior pixels and ~65% of silhouette pixels.
							// Cache masks per animation frame instead of allocating on every tile.
							static std::map<int, std::vector<Uint8>> clarityFrames;
							const int w = tmpSurface.getWidth(), h = tmpSurface.getHeight();
							std::vector<Uint8>& pixels = clarityFrames[frameNumber];
							if (pixels.size() != static_cast<size_t>(w * h))
							{
								pixels.assign(w * h, 0);
								const Uint8* src = tmpSurface.getBuffer();
								const int pitch = tmpSurface.getPitch();
								for (int sy = 0; sy < h; ++sy)
								for (int sx = 0; sx < w; ++sx)
								{
									const Uint8 color = src[sy * pitch + sx];
									if (!color) continue;
									const bool edge = sx == 0 || sy == 0 || sx + 1 == w || sy + 1 == h ||
										src[sy * pitch + sx - 1] == 0 || src[sy * pitch + sx + 1] == 0 ||
										src[(sy - 1) * pitch + sx] == 0 || src[(sy + 1) * pitch + sx] == 0;
									const int pattern = (sx * 7 + sy * 13 + (sx * sy) * 3) % 20;
									if (pattern < (edge ? 13 : 5)) pixels[sy * w + sx] = color;
								}
							}
							Surface::blitRaw(surface, SurfaceRaw<const Uint8>(pixels.data(), w, h, w), screenPosition.x, screenPosition.y, shade, false, _nvColor);
						}
						else
						{
							Surface::blitRaw(surface, tmpSurface, screenPosition.x, screenPosition.y, shade, false, _nvColor);
						}
					}

					//draw particle clouds on front of solder
					for (const Particle& p : getVaporParticle(tile, topLayer ? 3 : 1))
					{
						int vaporX = vaporScreenOriginX + p.getOffsetX();
						int vaporY = vaporScreenOriginY + p.getOffsetY();
						auto transparetOffsets = transparetPtr
							+ (p.getColor() * Mod::TransparenciesOpacityLevels * Mod::TransparenciesPaletteColors)
							+ (p.getOpacity() * Mod::TransparenciesPaletteColors);

						ShaderDrawFunc(
							[&](Uint8& dest, int size)
							{
								if (p.getSize() <= size)
								{
									dest = transparetOffsets[dest];
								}
							},
							ShaderSurface(this),
							ShaderMove(pixelMask, vaporX, vaporY)
						);
					}

					// Draw Path Preview
					if (_previewSettingArrows && tile->getPreview() != -1 && tile->isDiscovered(O_FLOOR))
					{
						if (itZ > 0 && tile->hasNoFloor(_save))
						{
							tmpSurface = _game->getMod()->getSurfaceSet("Pathfinding")->getFrame(11);
							if (tmpSurface)
							{
								Surface::blitRaw(surface, tmpSurface, screenPosition.x, screenPosition.y+2, 0, false, tile->getMarkerColor());
							}
						}
						tmpSurface = _game->getMod()->getSurfaceSet("Pathfinding")->getFrame(tile->getPreview() >= 0 && tile->getPreview() < 8 ? ((tile->getPreview() + 8 - 2 * _r41Rotation) & 7) : tile->getPreview());
						if (tmpSurface)
						{
							Surface::blitRaw(surface, tmpSurface, screenPosition.x, screenPosition.y + tile->getTerrainLevel(), 0, false, tileColor);
						}
					}

					{
						// Draw object
						tmpSurface = r42RotatedRamp(tile,O_OBJECT,tile->getSprite(O_OBJECT));
						if (tmpSurface)
						{
							if (!r41ObjectBack)
							{
								const int edge = tmpSurface.getWidth() == 34 && tmpSurface.getHeight() >= 42 ? -1 : 0;
								if (tile->getObstacle(O_OBJECT))
									Surface::blitRaw(surface, tmpSurface, screenPosition.x + edge, screenPosition.y + edge - tile->getYOffset(O_OBJECT), obstacleShade, false, _nvColor);
								else
									Surface::blitRaw(surface, tmpSurface, screenPosition.x + edge, screenPosition.y + edge - tile->getYOffset(O_OBJECT), tileShade, false, _nvColor);
							}
						}
					}
					// Draw cursor front (floor-origin preview has its own single footprint).
					if (_cursorType != CT_NONE && _selectorX > itX - _cursorSize && _selectorY > itY - _cursorSize && _selectorX < itX+1 && _selectorY < itY+1 && !_save->getBattleState()->getMouseOverIcons() && !(secondClickFloor && _camera->getViewLevel() == itZ))
					{
						if (_camera->getViewLevel() == itZ)
						{
							if (_cursorType != CT_AIM)
							{
								if (unit && (unit->getVisible() || _save->getDebugMode()))
									frameNumber = 3 + halfAnimFrameRest; // yellow box
								else
									frameNumber = 3; // red box
							}
							else
							{
								if (unit && (unit->getVisible() || _save->getDebugMode()))
									frameNumber = 7 + halfAnimFrame; // yellow animated crosshairs
								else
									frameNumber = 6; // red static crosshairs
							}
							tmpSurface = _game->getMod()->getSurfaceSet("CURSOR.PCK")->getFrame(frameNumber);
							Surface::blitRaw(surface, tmpSurface, screenPosition.x, screenPosition.y, 0);

							// UFO extender accuracy: display adjusted accuracy value on crosshair in real-time.
							if (_cursorType >= CT_AIM && _showInfoOnCursor && (_cursorType != CT_THROW || !Options::oxceDisableInfoOnThrowCursor) &&
								!(_r22On && Options::battleConfirmFireMode &&
								  _save->getBattleGame() &&
								  _save->getBattleGame()->getCurrentAction() &&
								  _save->getBattleGame()->getCurrentAction()->targeting &&
								  !_save->getBattleGame()->getCurrentAction()->waypoints.empty() &&
								  Position(itX,itY,itZ) !=
								    _save->getBattleGame()->getCurrentAction()->waypoints.front()))
							{
								BattleAction *action = _save->getBattleGame()->getCurrentAction();
								const RuleItem *weapon = action->weapon->getRules();
								std::ostringstream ss;
								BattleActionAttack attack = BattleActionAttack::GetBeforeShoot(*action);
								int distanceSq = action->actor->distance3dToPositionSq(Position(itX, itY,itZ));
								int distance = (int)std::ceil(sqrt(float(distanceSq)));

								if (_cursorType == CT_AIM || _cursorType == CT_THROW)
								{
									int accuracy = BattleUnit::getFiringAccuracy(attack, _game->getMod());

									{
										int upperLimit, lowerLimit;
										int dropoff = weapon->calculateLimits(upperLimit, lowerLimit, _save->getDepth(), action->type);

										// at this point, let's assume the shot is adjusted and set the text amber.
										_txtAccuracy->setColor(Palette::blockOffset(Pathfinding::yellow - 1) - 1);

										if (distance > upperLimit)
										{
											accuracy -= (distance - upperLimit) * dropoff;
										}
										else if (distance < lowerLimit)
										{
											accuracy -= (lowerLimit - distance) * dropoff;
										}
										else
										{
											// no adjustment made? set it to green.
											_txtAccuracy->setColor(Palette::blockOffset(Pathfinding::green - 1) - 1);
										}
									}

									// Include LOS penalty for tiles in the unit's current view range
									// Don't recalculate LOS for outside of the current FOV
									int noLOSAccuracyPenalty = action->weapon->getRules()->getNoLOSAccuracyPenalty(_game->getMod());
									if (noLOSAccuracyPenalty != -1)
									{
										bool hasLOS = false;
										if (Position(itX, itY, itZ) == _cacheCursorPosition && _isCtrlPressed == _cacheIsCtrlPressed && _cacheHasLOS != -1)
										{
											// use cached result
											hasLOS = (_cacheHasLOS == 1);
										}
										else
										{
											// recalculate
											if (unit && (unit->getVisible() || _save->getDebugMode()))
											{
												hasLOS = _save->getTileEngine()->visible(action->actor, tile);
											}
											else
											{
												hasLOS = _save->getTileEngine()->isTileInLOS(action, tile, true);
											}
											// remember
											_cacheIsCtrlPressed = _isCtrlPressed;
											_cacheCursorPosition = Position(itX, itY, itZ);
											_cacheHasLOS = hasLOS ? 1 : 0;
										}

										if (!hasLOS)
										{
											accuracy = accuracy * noLOSAccuracyPenalty / 100;
											_txtAccuracy->setColor(Palette::blockOffset(Pathfinding::yellow - 1) - 1);
										}
									}

                                    BattleAction r69CursorAction = *action;
                                    r69CursorAction.target = Position(itX,itY,itZ);
                                    bool outOfRange = action->type == BA_THROW
                                        ? weapon->isOutOfThrowRange(distanceSq, _save->getDepth())
                                        : r69ShotOutOfRange(r69CursorAction,_save);

									// zero accuracy or out of range: set it red.
									if (accuracy <= 0 || outOfRange)
									{
										accuracy = 0;
										_txtAccuracy->setColor(Palette::blockOffset(Pathfinding::red - 1) - 1);
									}
									ss << accuracy;
									ss << "%";
								}

								//TODO: merge this code with `InventoryState::calculateCurrentDamageTooltip` as 90% is same or should be same
								// display additional damage and psi-effectiveness info
								if (_isAltPressed)
								{
									// step 1: determine rule
									const RuleItem *rule;
									if (weapon->getBattleType() == BT_PSIAMP)
									{
										rule = weapon;
									}
									else if (action->weapon->needsAmmoForAction(action->type))
									{
										auto* ammo = attack.damage_item;
										if (ammo != nullptr)
										{
											rule = ammo->getRules();
										}
										else
										{
											rule = 0; // empty weapon = no rule
										}
									}
									else
									{
										rule = weapon;
									}

									// step 2: check if unlocked
									if (_cacheActiveWeaponUfopediaArticleUnlocked == -1)
									{
										_cacheActiveWeaponUfopediaArticleUnlocked = 0;
										if (_game->getSavedGame()->getMonthsPassed() == -1)
										{
											_cacheActiveWeaponUfopediaArticleUnlocked = 1; // new battle mode
										}
										else if (rule)
										{
											_cacheActiveWeaponUfopediaArticleUnlocked = 1; // assume unlocked
											ArticleDefinition *article = _game->getMod()->getUfopaediaArticle(rule->getType(), false);
											if (article && !Ufopaedia::isArticleAvailable(_game->getSavedGame(), article))
											{
												_cacheActiveWeaponUfopediaArticleUnlocked = 0; // ammo/weapon locked
											}
											if (rule->getType() != weapon->getType())
											{
												article = _game->getMod()->getUfopaediaArticle(weapon->getType(), false);
												if (article && !Ufopaedia::isArticleAvailable(_game->getSavedGame(), article))
												{
													_cacheActiveWeaponUfopediaArticleUnlocked = 0; // weapon locked
												}
											}
										}
									}

									// step 3: calculate and draw
									if (rule && _cacheActiveWeaponUfopediaArticleUnlocked == 1)
									{
										if (rule->getBattleType() == BT_PSIAMP)
										{
											float attackStrength = BattleUnit::getPsiAccuracy(attack);
											float defenseStrength = 30.0f; // indicator ignores: +victim->getArmor()->getPsiDefence(victim);

											float dis = Position::distance(action->actor->getPosition().toVoxel(), Position(itX, itY, itZ).toVoxel());
											int min = attackStrength - defenseStrength - rule->getPsiAccuracyRangeReduction(dis);
											int max = min + 55;
											if (max <= 0)
											{
												ss << "0%";
											}
											else
											{
												ss << min << "-" << max << "%";
											}
										}
										if (rule->getBattleType() != BT_PSIAMP || action->type == BA_USE)
										{
											int totalDamage = 0;
											if (weapon->getIgnoreAmmoPower())
											{
												totalDamage += weapon->getPowerBonus(attack);
												totalDamage -= weapon->getPowerRangeReduction(distance * 16);
											}
											else
											{
												totalDamage += rule->getPowerBonus(attack);
												totalDamage -= rule->getPowerRangeReduction(distance * 16);
											}
											if (totalDamage < 0) totalDamage = 0;
											if (_cursorType != CT_WAYPOINT)
												ss << "\n";
											ss << rule->getDamageType()->getRandomDamage(totalDamage, 1);
											ss << "-";
											ss << rule->getDamageType()->getRandomDamage(totalDamage, 2);
											if (rule->getDamageType()->RandomType == DRT_UFO_WITH_TWO_DICE)
												ss << "*";
										}
									}
									else
									{
										ss << "\n?-?";
									}
								}

								_txtAccuracy->setText(ss.str());
								_txtAccuracy->draw();
								_txtAccuracy->blitNShade(surface, screenPosition.x, screenPosition.y, 0);
							}
						}
						else if (_camera->getViewLevel() > itZ)
						{
							frameNumber = 5; // blue box
							tmpSurface = _game->getMod()->getSurfaceSet("CURSOR.PCK")->getFrame(frameNumber);
							Surface::blitRaw(surface, tmpSurface, screenPosition.x, screenPosition.y, 0);
						}
						if (!_isAltPressed && _cursorType > CT_AIM && _camera->getViewLevel() == itZ)
						{
							bool ignore = false;
							if (_cursorType == CT_PSI || _cursorType == CT_WAYPOINT)
							{
								BattleAction* action = _save->getBattleGame()->getCurrentAction();
								int distanceSq = action->actor->distance3dToPositionSq(Position(itX, itY, itZ));
								if (action->weapon->getRules()->isOutOfRange(distanceSq))
								{
									// weapon doesn't work at this distance, just draw a normal cursor with a red 0% hint text
									ignore = true;
									_txtAccuracy->setColor(Palette::blockOffset(Pathfinding::red - 1) - 1);
									_txtAccuracy->setText("0%");
									_txtAccuracy->draw();
									_txtAccuracy->blitNShade(surface, screenPosition.x, screenPosition.y, 0);
								}
							}
							if (!ignore)
							{
								int frame[6] = { 0, 0, 0, 11, 13, 15 };
								tmpSurface = _game->getMod()->getSurfaceSet("CURSOR.PCK")->getFrame(frame[_cursorType] + (_animFrame / 4) % 2);
								Surface::blitRaw(surface, tmpSurface, screenPosition.x, screenPosition.y, 0);
							}
						}
					}

					// Draw waypoints if any on this tile
					int waypid = 1;
					int waypXOff = 2;
					int waypYOff = 2;

					for (const auto& waypoint : _waypoints)
					{
						if (waypoint == mapPosition)
						{
							if (waypXOff == 2 && waypYOff == 2)
							{
								tmpSurface = _game->getMod()->getSurfaceSet("CURSOR.PCK")->getFrame(7);
								Surface::blitRaw(surface, tmpSurface, screenPosition.x, screenPosition.y, 0);
							}
							if (_save->getBattleGame()->getCurrentAction()->type == BA_LAUNCH || _save->getBattleGame()->getCurrentAction()->sprayTargeting)
							{
								_numWaypid->setValue(waypid);
								_numWaypid->setBordered(true); // OXCE, not configurable
								_numWaypid->draw();
								_numWaypid->blitNShade(surface, screenPosition.x + waypXOff, screenPosition.y + waypYOff, 0);

								waypXOff += waypid > 9 ? 10 : 6; // OXCE
								if (waypXOff >= 26)
								{
									waypXOff = 2;
									waypYOff += 8;
								}
							}
						}
						waypid++;
					}
				}
			}
		}
	}
	if (pathfinderTurnedOn)
	{
		if (_numWaypid)
		{
			_numWaypid->setBordered(true); // give it a border for the pathfinding display, makes it more visible on snow, etc.
		}
		for (int itZ = beginZ; itZ <= endZ; itZ++)
		{
			for (int itX = beginX; itX <= endX; itX++)
			{
				for (int itY = beginY; itY <= endY; itY++)
				{
					mapPosition = Position(itX, itY, itZ);
					_camera->convertMapToScreen(mapPosition, &screenPosition);
					screenPosition += _camera->getMapOffset();

					// only render cells that are inside the surface
					if (screenPosition.x > -_spriteWidth && screenPosition.x < surface->getWidth() + _spriteWidth &&
						screenPosition.y > -_spriteHeight && screenPosition.y < surface->getHeight() + _spriteHeight )
					{
						tile = _save->getTile(mapPosition);
						if (!tile || !tile->isDiscovered(O_FLOOR) || tile->getPreview() == -1)
							continue;
						int adjustment = -tile->getTerrainLevel();
						if (_previewSettingArrows)
						{
							if (itZ > 0 && tile->hasNoFloor(_save))
							{
								tmpSurface = _game->getMod()->getSurfaceSet("Pathfinding")->getFrame(23);
								if (tmpSurface)
								{
									Surface::blitRaw(surface, tmpSurface, screenPosition.x, screenPosition.y+2, 0, false, tile->getMarkerColor());
								}
							}
							int overlay = (tile->getPreview() >= 0 && tile->getPreview() < 8 ? ((tile->getPreview() + 8 - 2 * _r41Rotation) & 7) : tile->getPreview()) + 12;
							tmpSurface = _game->getMod()->getSurfaceSet("Pathfinding")->getFrame(overlay);
							if (tmpSurface)
							{
								Surface::blitRaw(surface, tmpSurface, screenPosition.x, screenPosition.y - adjustment, 0, false, tile->getMarkerColor());
							}
						}

						if ((_previewSettingTu || _previewSettingEnergy) && (tile->getTUMarker() > -1 || tile->getEnergyMarker() > -1))
						{
							int off = tile->getTUMarker() > 9 ? 5 : 3;
							int offE = tile->getEnergyMarker() > 9 ? 5 : 3;
							int mcolor = _previewSettingArrows ? 0 : tile->getMarkerColor();
							if (_previewSettingArrows)
							{
								adjustment += 7;
							}
							if (_save->getSelectedUnit() && _save->getSelectedUnit()->isBigUnit())
							{
								adjustment += 1;
								if (!_previewSettingArrows)
								{
									adjustment += 7;
								}
							}
							if (_previewSettingTu)
							{
								_numWaypid->setValue(tile->getTUMarker());
								_numWaypid->draw();
								if (_previewSettingEnergy)
								{
									// TU
									_numWaypid->blitNShade(surface, screenPosition.x + 16 - off, screenPosition.y + (22 - adjustment), 0, false, mcolor);
									// and Energy
									_numWaypid->setValue(tile->getEnergyMarker());
									_numWaypid->draw();
									_numWaypid->blitNShade(surface, screenPosition.x + 16 - offE, screenPosition.y + (29 - adjustment), 0, false, mcolor);
								}
								else
								{
									// only TU
									_numWaypid->blitNShade(surface, screenPosition.x + 16 - off, screenPosition.y + (29 - adjustment), 0, false, mcolor);
								}
							}
							else if (_previewSettingEnergy)
							{
								// only Energy
								_numWaypid->setValue(tile->getEnergyMarker());
								_numWaypid->draw();
								_numWaypid->blitNShade(surface, screenPosition.x + 16 - offE, screenPosition.y + (29 - adjustment), 0, false, mcolor);
							}
						}
					}
				}
			}
		}
		if (_numWaypid)
		{
			_numWaypid->setBordered(false); // make sure we remove the border in case it's being used for missile waypoints.
		}
	}

	auto* selectedUnit = _save->getSelectedUnit();
	if (selectedUnit && (_save->getSide() == FACTION_PLAYER || _save->getDebugMode()) && selectedUnit->getPosition().z <= _camera->getViewLevel())
	{
		_camera->convertMapToScreen(selectedUnit->getPosition(), &screenPosition);
		screenPosition += _camera->getMapOffset();
		Position offset = calculateWalkingOffset(selectedUnit).ScreenOffset;
		if (selectedUnit->isBigUnit())
		{
			offset.y += 4;
		}
		offset.y += Position::TileZ - (selectedUnit->getHeight() + selectedUnit->getFloatHeight());
		if (selectedUnit->isKneeled())
		{
			offset.y -= 2;
		}
		if (this->getCursorType() != CT_NONE)
		{
			_arrow->blitNShade(surface, screenPosition.x + offset.x + (_spriteWidth / 2) - (_arrow->getWidth() / 2), screenPosition.y + offset.y - _arrow->getHeight() + getArrowBobForFrame(_animFrame), 0);
		}
	}

	// Draw motion scanner arrows
	if (_isAltPressed && _save->getSide() == FACTION_PLAYER && this->getCursorType() != CT_NONE)
	{
		for (auto* myUnit : *_save->getUnits())
		{
			bool motionScan = myUnit->getScannedTurn() == _save->getTurn() && myUnit->getFaction() != FACTION_PLAYER && !myUnit->isOut();
			bool customMarker = myUnit->getCustomMarker() > 0 && myUnit->getFaction() == FACTION_PLAYER && !myUnit->isOut();
			if (motionScan || customMarker)
			{
				Position temp = myUnit->getPosition();
				temp.z = _camera->getViewLevel();
				_camera->convertMapToScreen(temp, &screenPosition);
				screenPosition += _camera->getMapOffset();
				Position offset;
				//calculateWalkingOffset(myUnit, &offset);
				if (myUnit->isBigUnit())
				{
					offset.y += 4;
				}
				if (motionScan)
				{
					offset.y += Position::TileZ - /*myUnit->getHeight()*/ 21; // no spoilers
				}
				else if (customMarker)
				{
					offset.y += Position::TileZ - (myUnit->getHeight() + myUnit->getFloatHeight());
				}
				if (myUnit->isKneeled())
				{
					offset.y -= 2;
				}
				if (motionScan)
				{
					_arrow->blitNShade(
						surface,
						screenPosition.x + offset.x + (_spriteWidth / 2) - (_arrow->getWidth() / 2),
						screenPosition.y + offset.y - _arrow->getHeight() + getArrowBobForFrame(_animFrame),
						0);
				}
				else if (customMarker)
				{
					Surface::blitRaw(
						surface,
						_arrow,
						screenPosition.x + offset.x + (_spriteWidth / 2) - (_arrow->getWidth() / 2),
						screenPosition.y + offset.y - _arrow->getHeight() + getArrowBobForFrame(_animFrame),
						0,
						false,
						_isTFTD ? ArrowColorsTFTD[myUnit->getCustomMarker() % 4] : ArrowColorsUFO[myUnit->getCustomMarker() % 4]);
				}
			}
		}
	}
	delete _numWaypid;

	// Draw craft deployment preview arrows
	if (_isAltPressed && _save->isPreview() && this->getCursorType() != CT_NONE)
	{
		for (auto& pos : _save->getCraftTiles())
		{
			if (pos.z == _camera->getViewLevel())
			{
				_camera->convertMapToScreen(pos, &screenPosition);
				screenPosition += _camera->getMapOffset();
				screenPosition.y += 2; // based on vanilla soldier standHeight
				_arrow->blitNShade(
					surface,
					screenPosition.x + (_spriteWidth / 2) - (_arrow->getWidth() / 2),
					screenPosition.y - _arrow->getHeight() + getArrowBobForFrame(_animFrame),
					0);
			}
		}
	}

	// check if we got big explosions
	if (_explosionInFOV)
	{
		// big explosions cause the screen to flash as bright as possible before any explosions are actually drawn.
		// this causes everything to look like EGA for a single frame.
		if (_flashScreen)
		{
			for (int x = 0, y = 0; x < surface->getWidth() && y < surface->getHeight();)
			{
				Uint8 pixel = surface->getPixel(x, y);
				if (pixel)
				{
					pixel = (pixel & 0xF0) + 1; //avoid 0 pixel
					surface->setPixelIterative(&x, &y, pixel);
				}
			}
			_flashScreen = false;
		}
		else
		{
			for (const auto* explosion : _explosions)
			{
				_camera->convertVoxelToScreen(explosion->getPosition(), &bulletPositionScreen);
				if (explosion->isBig())
				{
					if (explosion->getCurrentFrame() >= 0)
					{
						tmpSurface = _game->getMod()->getSurfaceSet("X1.PCK")->getFrame(explosion->getCurrentFrame());
						Surface::blitRaw(surface, tmpSurface, bulletPositionScreen.x - (tmpSurface.getWidth() / 2), bulletPositionScreen.y - (tmpSurface.getHeight() / 2), 0, false, _nvColor);
					}
				}
				else if (explosion->isHit())
				{
					tmpSurface = _game->getMod()->getSurfaceSet("HIT.PCK")->getFrame(explosion->getCurrentFrame());
					Surface::blitRaw(surface, tmpSurface, bulletPositionScreen.x - 15, bulletPositionScreen.y - 25, 0, false, _nvColor);
				}
				else
				{
					tmpSurface = _game->getMod()->getSurfaceSet("SMOKE.PCK")->getFrame(explosion->getCurrentFrame());
					Surface::blitRaw(surface, tmpSurface, bulletPositionScreen.x - 15, bulletPositionScreen.y - 15, 0, false, _nvColor);
				}
			}
		}
	}

	surface->unlock();
}

/**
 * Handles mouse presses on the map.
 * @param action Pointer to an action.
 * @param state State that the action handlers belong to.
 */
void Map::mousePress(Action *action, State *state)
{
	InteractiveSurface::mousePress(action, state);
	_camera->mousePress(action, state);
}

/**
 * Handles mouse releases on the map.
 * @param action Pointer to an action.
 * @param state State that the action handlers belong to.
 */
void Map::mouseRelease(Action *action, State *state)
{
	InteractiveSurface::mouseRelease(action, state);
	_camera->mouseRelease(action, state);
}

/**
 * Handles keyboard presses on the map.
 * @param action Pointer to an action.
 * @param state State that the action handlers belong to.
 */
void Map::keyboardPress(Action *action, State *state)
{

    // LOSLOF_R22_NATIVE_INPUT_FIX: do NOT intercept map clicks.
    // F8 only toggles passive drawing. Backslash toggles virtual stance
    // while native OXCE is in an actual weapon-targeting state.
    if (action && action->getDetails()->type == SDL_KEYDOWN)
    {
        const SDLKey key = action->getDetails()->key.keysym.sym;
        // R41: Shift+F10 clockwise; Ctrl+Shift+F10 counterclockwise.
        // De-bounce key repeat; keep the world point at viewport center.
        if (key == SDLK_F10 && (action->getDetails()->key.keysym.mod & KMOD_SHIFT))
        {
            const Uint32 rotateNow = SDL_GetTicks();
            const Uint32 elapsedSinceLastRotation = rotateNow - _r41LastRotationAt;
            // Debounce auto-repeat while accepting every distinct tap.
            if (_camera && elapsedSinceLastRotation >= 180U)
            {
                _r41LastRotationAt = rotateNow;
                _camera->stopMouseScrolling();
                _camera->stopKeyScrolling();
                // Cached _center may be stale after loading a save.
                // Resolve the WORLD tile at the viewport center BEFORE
                // changing the orientation; then project that same tile.
                // Preserve one world pivot across successive rotations.
                // Rounding in inverse tile projection otherwise accumulates
                // >10 tiles of drift with every 90-degree turn.
                const Position currentOffset = _camera->getMapOffset();
                if (!_r41PivotValid || elapsedSinceLastRotation > 10000U)
                {
                    int centerX=0, centerY=0;
                    _camera->convertScreenToMap(getWidth()/2,
                        _visibleMapHeight/2, &centerX, &centerY);
                    _r41PivotWorld = Position(centerX,centerY,_camera->getViewLevel());
                    _r41PivotValid = true;
                }
                const int change = (action->getDetails()->key.keysym.mod & KMOD_CTRL) ? 3 : 1;
                const int oldRotation = _r41Rotation;
                _r41Rotation = (_r41Rotation + change) % 4;
                _camera->centerOnPosition(_r41PivotWorld, false);
                _r41PivotOffset = _camera->getMapOffset();
                Log(LOG_INFO) << "R41_VIEW_ROTATE " << oldRotation
                    << " -> " << _r41Rotation << " center=" << _r41PivotWorld;
                setSelectorPosition(_mouseX, _mouseY);
                _r22ThrowCacheKey = 0;
                _r22StatsKey = 0;
                r29ClearBlockGrid();
                _redraw = true;
            }
            return;
        }
        if (key == SDLK_F8)
        {
            // RC59: F8 is compact H/B/M. Shift+F8 toggles only ballistic
            // details; Ctrl+Shift+F8 opens the old resistance reference;
            // Alt+Shift+F8 separately opens the old enemy census.
            // Never stack these overlapping panels on the same viewport.
            const SDLMod modifier = action->getDetails()->key.keysym.mod;
            if (modifier & KMOD_SHIFT)
            {
                if (!_r22On)
                {
                    _r22On = true;
                    _r22StanceActor = _save ? _save->getSelectedUnit() : nullptr;
                    _r22StanceOverride = false;
                    _r22Kneel = _r22StanceActor ?
                        _r22StanceActor->isKneeled() : false;
                    _r22StatsKey = 0;
                    _r22HullHash = 0;
                    _r37ReactionCheckedAt = 0;
                    _r37ReactionRisks.clear();
                    _r22ThrowCacheKey = 0;
                    _r22ThrowTrajectory.clear();
                    _r22ThrowValid = false;
                    _r22StatsText.clear();
                    _r22TileRisks.clear();
                    r29ClearBlockGrid();
                }
                if (modifier & KMOD_CTRL)
                {
                    r59DetailedHud = true;
                    _r30FullResists = !_r30FullResists;
                    _r32EnemyCounts = false;
                }
                else if (modifier & KMOD_ALT)
                {
                    _r32EnemyCounts = !_r32EnemyCounts;
                    r59DetailedHud = false;
                    _r30FullResists = false;
                }
                else
                {
                    r59DetailedHud = !r59DetailedHud;
                    _r30FullResists = false;
                    _r32EnemyCounts = false;
                }
                _redraw = true;
                return;
            }
            _r22On = !_r22On;
            r59DetailedHud = false;
            _r32EnemyCounts = false;
            _r30FullResists = false;
            _r22StanceActor = _save ? _save->getSelectedUnit() : nullptr;
            _r22StanceOverride = false;
            _r22Kneel = _r22StanceActor ?
                _r22StanceActor->isKneeled() : false;
            _r22StatsKey = 0;
            _r22HullHash = 0;
            // Force fresh visible-reaction estimates after every F8 toggle.
            _r37ReactionCheckedAt = 0;
            _r37ReactionRisks.clear();
            _r22ThrowCacheKey = 0;
            _r22ThrowTrajectory.clear();
            _r22ThrowValid = false;
            _r22StatsText.clear();
            _r22TileRisks.clear();
            r29ClearBlockGrid();
            _redraw = true;
            return;
        }
        if (key == SDLK_BACKSLASH && _r22On && _save &&
            _save->getSide() == FACTION_PLAYER && _save->getBattleGame())
        {
            BattleAction *native = _save->getBattleGame()->getCurrentAction();
            BattleUnit *actor = _save->getSelectedUnit();
            if (native && native->targeting && actor && native->actor == actor &&
                (native->type == BA_SNAPSHOT || native->type == BA_AIMEDSHOT ||
                 native->type == BA_AUTOSHOT || native->type == BA_THROW))
            {
                if (_r22StanceActor != actor)
                {
                    _r22StanceActor = actor;
                    _r22StanceOverride = false;
                }
                const bool current = _r22StanceOverride ?
                    _r22Kneel : actor->isKneeled();
                _r22Kneel = !current; // virtual only; NO kneel() call.
                _r22StanceOverride = true;
                _r22StatsKey = 0;
                _r22HullHash = 0;
                _r22ThrowCacheKey = 0;
                _r22StatsText.clear();
                _r22TileRisks.clear();
                r29ClearBlockGrid();
                _redraw = true;
                return;
            }
        }
    }

	InteractiveSurface::keyboardPress(action, state);
	_camera->keyboardPress(action, state);
}

/**
 * Handles map vision toggle mode.
 */

void Map::enableNightVision()
{
	_nightVisionOn = true;
	_debugVisionMode = 0;
	persistToggles();
}

void Map::toggleNightVision()
{
	_nightVisionOn = !_nightVisionOn;
	_debugVisionMode = 0;
	persistToggles();
}

void Map::toggleDebugVisionMode()
{
	_debugVisionMode = (_debugVisionMode + 1) % 3;
	_nightVisionOn = false;
	persistToggles();
}

void Map::persistToggles()
{
	if (Options::oxceToggleNightVisionType == 2)
	{
		// persisted per campaign
		_game->getSavedGame()->setToggleNightVision(_nightVisionOn);
	}
	else if (Options::oxceToggleNightVisionType == 1)
	{
		// persisted per battle
		_save->setToggleNightVision(_nightVisionOn);
	}

	if (Options::oxceToggleBrightnessType == 2)
	{
		// persisted per campaign
		_game->getSavedGame()->setToggleBrightness(_debugVisionMode);
	}
	else if (Options::oxceToggleBrightnessType == 1)
	{
		// persisted per battle
		_save->setToggleBrightness(_debugVisionMode);
	}

	_save->setToggleBrightnessTemp(_debugVisionMode);
}

/**
 * Handles fade-in and fade-out shade modification
 * @param original tile/item/unit shade
 */

int Map::reShade(Tile *tile) const
{
	// when modders just don't know where to stop...
	if (_debugVisionMode > 0)
	{
		if (_debugVisionMode == 1)
		{
			// Reaver's tests
			return tile->getShade() / 2;
		}
		// Meridian's debug helper
		return 0;
	}

	// no night vision
	if (_nvColor == 0)
	{
		return tile->getShade();
	}

	// already bright enough
	if ((tile->getShade() <= NIGHT_VISION_SHADE))
	{
		return tile->getShade();
	}

	// hybrid night vision (local)
	for (const auto* bu : *_save->getUnits())
	{
		if (bu->getFaction() == FACTION_PLAYER && !bu->isOut())
		{
			if (Position::distance2dSq(tile->getPosition(), bu->getPosition()) <= bu->getMaxViewDistanceAtDarkSquared())
			{
				return tile->getShade() > _fadeShade ? _fadeShade : tile->getShade();
			}
		}
	}

	// hybrid night vision (global)
	return std::min(+NIGHT_VISION_MAX_SHADE, tile->getShade());
}

int Map::reShadeMinimap(int maxShade) const
{
	if (_debugVisionMode > 0)
	{
		if (_debugVisionMode == 1)
		{
			return maxShade / 2;
		}
		return 0;
	}

	if (_nvColor == 0)
	{
		return maxShade;
	}

	return std::min(+NIGHT_VISION_MAX_SHADE / 2, maxShade);
}

/**
 * Handles keyboard releases on the map.
 * @param action Pointer to an action.
 * @param state State that the action handlers belong to.
 */
void Map::keyboardRelease(Action *action, State *state)
{
	InteractiveSurface::keyboardRelease(action, state);
	_camera->keyboardRelease(action, state);
}

/**
 * Handles mouse over events on the map.
 * @param action Pointer to an action.
 * @param state State that the action handlers belong to.
 */
void Map::mouseOver(Action *action, State *state)
{
	InteractiveSurface::mouseOver(action, state);
	_camera->mouseOver(action, state);
	_mouseX = (int)action->getAbsoluteXMouse();
	_mouseY = (int)action->getAbsoluteYMouse();
	setSelectorPosition(_mouseX, _mouseY);
}


/**
 * Sets the selector to a certain tile on the map.
 * @param mx mouse x position.
 * @param my mouse y position.
 */
void Map::setSelectorPosition(int mx, int my)
{
	int oldX = _selectorX, oldY = _selectorY;

	_camera->convertScreenToMap(mx, my + _spriteHeight/4, &_selectorX, &_selectorY);

	if (oldX != _selectorX || oldY != _selectorY)
	{
		_redraw = true;
	}
}

/**
 * Handles animating tiles. 8 Frames per animation.
 * @param redraw Redraw the battlescape?
 */
void Map::animate(bool redraw)
{
	_save->nextAnimFrame();
	_animFrame = _save->getAnimFrame();

	// random ambient sounds
	{
		if (!_save->getAmbienceRandom().empty())
		{
			_save->decreaseCurrentAmbienceDelay();
			if (_save->getCurrentAmbienceDelay() <= 0)
			{
				_save->resetCurrentAmbienceDelay();
				_save->playRandomAmbientSound();
			}
		}
	}

	// animate tiles
	for (int i = 0; i < _save->getMapSizeXYZ(); ++i)
	{
		_save->getTile(i)->animate();
	}

	// animate vapor
	for (auto i : Collections::rangeValueLess(_vaporParticles.size()))
	{
		auto& v = _vaporParticles[i];
		int posX = i % _camera->getMapSizeX();
		int posY = i / _camera->getMapSizeX();

		Collections::removeIf(
			v,
			[&](Particle& p)
			{
				if (p.animate())
				{
					Position tileOffset = p.updateScreenPosition();
					if (tileOffset != Position(0,0,0))
					{
						addVaporParticle(Position(posX,posY,0) + tileOffset, p);
						return true;
					}
					return false;
				}
				else
				{
					return true;
				}
			}
		);
	}

	// init vapor vector
	for (auto i : Collections::rangeValueLess(_vaporParticlesInit.size()))
	{
		auto& vi = _vaporParticlesInit[i];
		auto& vDest = _vaporParticles[i];
		if (vi.empty())
		{
			continue;
		}

		if (vDest.empty())
		{
			vi.swap(vDest);
		}
		else
		{
			vDest.insert(std::begin(vDest), std::begin(vi), std::end(vi));
		}


		Collections::removeAll(vi);
	}

	for (auto& tilePar : _vaporParticles)
	{
		if (tilePar.empty())
		{
			Collections::removeAll(tilePar);
		}
		else
		{
			std::sort(std::begin(tilePar), std::end(tilePar), [](const Particle& a, const Particle& b){ return a.getLayerZ() < b.getLayerZ(); });
		}
	}

	// animate certain units (large flying units have a propulsion animation)
	for (auto* bu : *_save->getUnits())
	{
		const Position pos = bu->getPosition();

		// skip units that do not have position
		if (pos == TileEngine::invalid)
		{
			continue;
		}

		if (_save->getDepth() > 0)
		{
			bu->setFloorAbove(false);

			// make sure this unit isn't obscured by the floor above him, otherwise it looks weird.
			if (_camera->getViewLevel() > pos.z)
			{
				for (int z = std::min(_camera->getViewLevel(), _save->getMapSizeZ() - 1); z != pos.z; --z)
				{
					if (!_save->getTile(Position(pos.x, pos.y, z))->hasNoFloor(0))
					{
						bu->setFloorAbove(true);
						break;
					}
				}
			}
		}

		bu->breathe();
	}

	if (redraw) _redraw = true;
}

/**
 * Draws the rectangle selector.
 * @param pos Pointer to a position.
 */
void Map::getSelectorPosition(Position *pos) const
{
	pos->x = _selectorX;
	pos->y = _selectorY;
	pos->z = _camera->getViewLevel();
}

/**
 * Calculates the offset of a soldier, when it is walking in the middle of 2 tiles.
 * @param unit Pointer to BattleUnit.
 * @param offset Pointer to the offset to return the calculation.
 */
UnitWalkingOffset Map::calculateWalkingOffset(const BattleUnit *unit) const
{
	UnitWalkingOffset result = { };

	int offsetX[8] = { 1, 1, 1, 0, -1, -1, -1, 0 };
	int offsetY[8] = { 1, 0, -1, -1, -1, 0, 1, 1 };
	int phase = unit->getWalkingPhase() + unit->getDiagonalWalkingPhase();
	// Movement interpolation follows the displayed direction, not native XY.
	int dir = (unit->getDirection() + 8 - 2 * _r41Rotation) % 8;
	int midphase = 4 + 4 * (dir % 2);
	int endphase = 8 + 8 * (dir % 2);
	int size = unit->getArmor()->getSize();

	result.ScreenOffset.x = 0;
	result.ScreenOffset.y = 0;

	if (size > 1)
	{
		if (dir < 1 || dir > 5)
			midphase = endphase;
		else if (dir == 5)
			midphase = 12;
		else if (dir == 1)
			midphase = 5;
		else
			midphase = 1;
	}
	if (unit->getVerticalDirection())
	{
		midphase = 4;
		endphase = 8;
	}
	else if ((unit->getStatus() == STATUS_WALKING || unit->getStatus() == STATUS_FLYING))
	{
		if (phase < midphase)
		{
			result.ScreenOffset.x = phase * 2 * offsetX[dir];
			result.ScreenOffset.y = - phase * offsetY[dir];
		}
		else
		{
			result.ScreenOffset.x = (phase - endphase) * 2 * offsetX[dir];
			result.ScreenOffset.y = - (phase - endphase) * offsetY[dir];
		}
	}

	result.NormalizedMovePhase = endphase == 16 ? phase : phase * 2;

	// If we are walking in between tiles, interpolate it's terrain level.
	if (unit->getStatus() == STATUS_WALKING || unit->getStatus() == STATUS_FLYING)
	{
		const Position posCurr = unit->getPosition();
		const Position posDest = unit->getDestination();
		const Position posLast = unit->getLastPosition();
		if (phase < midphase)
		{
			int fromLevel = getTerrainLevel(posCurr, size);
			int toLevel = getTerrainLevel(posDest, size);
			if (posCurr.z > posDest.z)
			{
				// going down a level, so toLevel 0 becomes +24, -8 becomes  16
				toLevel += Position::TileZ*(posCurr.z - posDest.z);
			}
			else if (posCurr.z < posDest.z)
			{
				// going up a level, so toLevel 0 becomes -24, -8 becomes -16
				toLevel = -Position::TileZ*(posDest.z - posCurr.z) + abs(toLevel);
			}
			result.TerrainLevelOffset = Interpolate(fromLevel, toLevel, phase, endphase);
		}
		else
		{
			// from phase 4 onwards the unit behind the scenes already is on the destination tile
			// we have to get it's last position to calculate the correct offset
			int fromLevel = getTerrainLevel(posLast, size);
			int toLevel = getTerrainLevel(posDest, size);
			if (posLast.z > posDest.z)
			{
				// going down a level, so fromLevel 0 becomes -24, -8 becomes -32
				fromLevel -= Position::TileZ*(posLast.z - posDest.z);
			}
			else if (posLast.z < posDest.z)
			{
				// going up a level, so fromLevel 0 becomes +24, -8 becomes 16
				fromLevel = Position::TileZ*(posDest.z - posLast.z) - abs(fromLevel);
			}
			result.TerrainLevelOffset = Interpolate(fromLevel, toLevel, phase, endphase);
		}
	}
	else
	{
		result.TerrainLevelOffset = getTerrainLevel(unit->getPosition(), size);
	}
	result.ScreenOffset.y += result.TerrainLevelOffset;
	return result;
}


/**
  * Terrainlevel goes from 0 to -24. For a larger sized unit, we need to pick the highest terrain level, which is the lowest number...
  * @param pos Position.
  * @param size Size of the unit we want to get the level from.
  * @return terrainlevel.
  */
int Map::getTerrainLevel(const Position& pos, int size) const
{
	int lowestlevel = 0;

	for (int x = 0; x < size; x++)
	{
		for (int y = 0; y < size; y++)
		{
			int l = _save->getTile(pos + Position(x,y,0))->getTerrainLevel();
			if (l < lowestlevel)
				lowestlevel = l;
		}
	}

	return lowestlevel;
}

/**
 * Sets the 3D cursor to selection/aim mode.
 * @param type Cursor type.
 * @param size Size of cursor.
 */
void Map::setCursorType(CursorType type, int size)
{
	// reset cursor indicator cache
	_cacheActiveWeaponUfopediaArticleUnlocked = -1;
	_cacheIsCtrlPressed = false;
	_cacheCursorPosition = TileEngine::invalid;
	_cacheHasLOS = -1;

	_cursorType = type;
	if (_cursorType == CT_NORMAL)
		_cursorSize = size;
	else
		_cursorSize = 1;
}

/**
 * Gets the cursor type.
 * @return cursor type.
 */
CursorType Map::getCursorType() const
{
	return _cursorType;
}

/**
 * Puts a projectile sprite on the map.
 * @param projectile Projectile to place.
 */
void Map::setProjectile(Projectile *projectile)
{
	_projectile = projectile;
	if (projectile && Options::battleSmoothCamera)
	{
		_launch = true;
	}
}

/**
 * Gets the current projectile sprite on the map.
 * @return Projectile or 0 if there is no projectile sprite on the map.
 */
Projectile *Map::getProjectile() const
{
	return _projectile;
}

/**
 * Add new vapor particle.
 * @param pos Tile position of particle.
 * @param particle Particle to add.
 */
void Map::addVaporParticle(Position pos, Particle particle)
{
	if ((int)(_transparencies->size()) < (particle.getColor() + 1) * Mod::TransparenciesOpacityLevels * Mod::TransparenciesPaletteColors)
	{
		return;
	}
	if (pos.x >= _camera->getMapSizeX() || pos.y >= _camera->getMapSizeY())
	{
		return;
	}
	if (pos.x < 0 || pos.y < 0)
	{
		return;
	}

	auto& v = _vaporParticlesInit[_camera->getMapSizeX() * pos.y + pos.x];

	// as there will usually be more than one Particle, we prepare more space
	if (v.capacity() < 64)
	{
		v.reserve(64);
	}

	v.push_back(particle);
}

/**
 * Get all vapor for tile.
 * @param tile current tile.
 * @param topLayer if tile is top visible layer, if true then will return particles belongs to upper tiles.
 * @return range of particles that should be drawn.
 */
Collections::Range<const Particle*> Map::getVaporParticle(const Tile* tile, int topLayer) const
{
	Position pos = tile->getPosition();
	auto& v = _vaporParticles[_camera->getMapSizeX() * pos.y + pos.x];
	int startZ = pos.z * Particle::LayerAccuracy + (topLayer & 1);
	int endZ = startZ + Particle::LayerAccuracy / 2;
	auto* s = std::partition_point(v.data(), v.data() + v.size(), [&](const Particle& a){ return a.getLayerZ() < startZ; });
	auto* e = (topLayer & 2) ? v.data() + v.size() : std::partition_point(s, v.data() + v.size(), [&](const Particle& a){ return a.getLayerZ() < endZ; });
	return Collections::Range{ s, e };
}

/**
 * Gets a list of explosion sprites on the map.
 * @return A list of explosion sprites.
 */
std::list<Explosion*> *Map::getExplosions()
{
	return &_explosions;
}

/**
 * Gets the pointer to the camera.
 * @return Pointer to camera.
 */
Camera *Map::getCamera()
{
	return _camera;
}

/**
 * Timers only work on surfaces so we have to pass this on to the camera object.
 */
void Map::scrollMouse()
{
	_camera->scrollMouse();
}

/**
 * Timers only work on surfaces so we have to pass this on to the camera object.
 */
void Map::scrollKey()
{
	_camera->scrollKey();
}

/**
 * Modify the fade shade level if fade's in progress.
 */
void Map::fadeShade()
{
	bool hold = SDL_GetKeyState(NULL)[Options::keyNightVisionHold];
	if ((_nightVisionOn && !hold) || (!_nightVisionOn && hold))
	{
		_nvColor = Options::oxceNightVisionColor;
		_save->setToggleNightVisionTemp(true);
		_save->setToggleNightVisionColorTemp(_nvColor);
		if (_fadeShade > NIGHT_VISION_SHADE) // 0 = max brightness
		{
			--_fadeShade;
		}
	}
	else
	{
		if (_nvColor != 0)
		{
			if (_fadeShade < _save->getGlobalShade())
			{
				// gradually fade away
				++_fadeShade;
			}
			else
			{
				// and at the end turn off night vision
				_nvColor = 0;
				_save->setToggleNightVisionTemp(false);
				_save->setToggleNightVisionColorTemp(0);
			}
		}
	}
}

/**
 * Gets a list of waypoints on the map.
 * @return A list of waypoints.
 */
std::vector<Position> *Map::getWaypoints()
{
	return &_waypoints;
}

/**
 * Sets mouse-buttons' pressed state.
 * @param button Index of the button.
 * @param pressed The state of the button.
 */
void Map::setButtonsPressed(Uint8 button, bool pressed)
{
	setButtonPressed(button, pressed);
}

/**
 * Sets the unitDying flag.
 * @param flag True if the unit is dying.
 */
void Map::setUnitDying(bool flag)
{
	_unitDying = flag;
}

/**
 * Updates the selector to the last-known mouse position.
 */
void Map::refreshSelectorPosition()
{
	setSelectorPosition(_mouseX, _mouseY);
}

/**
 * Special handling for setting the height of the map viewport.
 * @param height the new base screen height.
 */
void Map::setHeight(int height)
{
	Surface::setHeight(height);
	_visibleMapHeight = height - _iconHeight;
	_message->setHeight((_visibleMapHeight < 200)? _visibleMapHeight : 200);
	_message->setY((_visibleMapHeight - _message->getHeight()) / 2);
}

/**
 * Special handling for setting the width of the map viewport.
 * @param width the new base screen width.
 */
void Map::setWidth(int width)
{
	int dX = width - getWidth();
	Surface::setWidth(width);
	_message->setX(_message->getX() + dX / 2);
}

/**
 * Get the hidden movement screen's vertical position.
 * @return the vertical position of the hidden movement window.
 */
int Map::getMessageY() const
{
	return _message->getY();
}

/**
 * Get the icon height.
 */
int Map::getIconHeight() const
{
	return _iconHeight;
}

/**
 * Get the icon width.
 */
int Map::getIconWidth() const
{
	return _iconWidth;
}

/**
 * Returns the angle(left/right balance) of a sound effect,
 * based off a map position.
 * @param pos the map position to calculate the sound angle from.
 * @return the angle of the sound (280 to 440).
 */
int Map::getSoundAngle(const Position& pos) const
{
	int midPoint = getWidth() / 2;
	Position relativePosition;

	_camera->convertMapToScreen(pos, &relativePosition);
	// cap the position to the screen edges relative to the center,
	// negative values indicating a left-shift, and positive values shifting to the right.
	relativePosition.x = Clamp((relativePosition.x + _camera->getMapOffset().x) - midPoint, -midPoint, midPoint);

	// convert the relative distance to a relative increment of an 80 degree angle
	// we use +- 80 instead of +- 90, so as not to go ALL the way left or right
	// which would effectively mute the sound out of one speaker.
	// since Mix_SetPosition uses modulo 360, we can't feed it a negative number, so add 360 instead.
	return 360 + (relativePosition.x / (midPoint / 80.0));
}

/**
 * Reset the camera smoothing bool.
 */
void Map::resetCameraSmoothing()
{
	_smoothingEngaged = false;
}

/**
 * Set the "explosion flash" bool.
 * @param flash should the screen be rendered in EGA this frame?
 */
void Map::setBlastFlash(bool flash)
{
	_flashScreen = flash;

	// Meridian: no frikin flashing!!
	_flashScreen = false;
}

/**
 * Checks if the screen is still being rendered in EGA.
 * @return if we are still in EGA mode.
 */
bool Map::getBlastFlash() const
{
	return _flashScreen;
}

/**
 * Resets obstacle markers.
 */
void Map::resetObstacles(void)
{
	for (int z = 0; z < _save->getMapSizeZ(); z++)
		for (int y = 0; y < _save->getMapSizeY(); y++)
			for (int x = 0; x < _save->getMapSizeX(); x++)
			{
				Tile *tile = _save->getTile(Position(x, y, z));
				if (tile) tile->resetObstacle();
			}
	_showObstacles = false;
}

/**
 * Enables obstacle markers.
 */
void Map::enableObstacles(void)
{
	_showObstacles = true;
	if (_obstacleTimer)
	{
		_obstacleTimer->stop();
		_obstacleTimer->start();
	}
}

/**
 * Disables obstacle markers.
 */
void Map::disableObstacles(void)
{
	_showObstacles = false;
	if (_obstacleTimer)
	{
		_obstacleTimer->stop();
	}
}

}
