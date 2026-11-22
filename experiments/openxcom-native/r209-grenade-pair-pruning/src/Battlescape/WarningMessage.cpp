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
#include "WarningMessage.h"
#include <SDL.h>
#include <string>
#include "../fmath.h"
#include "../Engine/Timer.h"
#include "../Engine/Options.h"
#include "../Engine/Palette.h"
#include <algorithm>
#include <map>
#include "../Interface/Text.h"

namespace OpenXcom
{

// Keep WarningMessage binary layout unchanged: BattlescapeState.cpp in the
// cumulative archive allocates objects using the original sizeof(class).
struct R206WarningLayout
{
    Uint8 baseColor = 0, baseTextColor = 0;
    int x = 0, y = 0, width = 0, height = 0;
    bool cqc = false;
};
static std::map<const WarningMessage*, R206WarningLayout> r206WarningLayouts;

/**
 * Sets up a blank warning message with the specified size and position.
 * @param width Width in pixels.
 * @param height Height in pixels.
 * @param x X position in pixels.
 * @param y Y position in pixels.
 */
WarningMessage::WarningMessage(int width, int height, int x, int y) : Surface(width, height, x, y), _color(0), _fade(0)
{
	r206WarningLayouts[this] = R206WarningLayout{0, 0, x, y, width, height, false};
	_text = new Text(width, height, 0, 0);
	_text->setHighContrast(true);
	_text->setAlign(ALIGN_CENTER);
	_text->setVerticalAlign(ALIGN_MIDDLE);
	_text->setWordWrap(true);

	_timer = new Timer(50);
	_timer->onTimer((SurfaceHandler)&WarningMessage::fade);

	setVisible(false);
}

/**
 * Deletes timers.
 */
WarningMessage::~WarningMessage()
{
	r206WarningLayouts.erase(this);
	delete _timer;
	delete _text;
}

/**
 * Changes the color for the message background.
 * @param color Color value.
 */
void WarningMessage::setColor(Uint8 color)
{
	_color = color;
	if (!r206WarningLayouts[this].cqc) r206WarningLayouts[this].baseColor = color;
}

/**
 * Changes the color for the message text.
 * @param color Color value.
 */
void WarningMessage::setTextColor(Uint8 color)
{
	_text->setColor(color);
	if (!r206WarningLayouts[this].cqc) r206WarningLayouts[this].baseTextColor = color;
}

/**
 * Changes the various resources needed for text rendering.
 * The different fonts need to be passed in advance since the
 * text size can change mid-text, and the language affects
 * how the text is rendered.
 * @param big Pointer to large-size font.
 * @param small Pointer to small-size font.
 * @param lang Pointer to current language.
 */
void WarningMessage::initText(Font *big, Font *small, Language *lang)
{
	_text->initText(big, small, lang);
}

/**
 * Replaces a certain amount of colors in the surface's palette.
 * @param colors Pointer to the set of colors.
 * @param firstcolor Offset of the first color to replace.
 * @param ncolors Amount of colors to replace.
 */
void WarningMessage::setPalette(const SDL_Color *colors, int firstcolor, int ncolors)
{
	Surface::setPalette(colors, firstcolor, ncolors);
	_text->setPalette(colors, firstcolor, ncolors);
}

/**
 * Displays the warning message.
 * @param msg Message string.
 * @param time How long message will be visible.
 */
void WarningMessage::showMessage(const std::string &msg, int time)
{
	// R206: the CQC interception has its own transient upper-right layout.
	// Do not occupy or reserve a permanent second header row. Normal
	// warnings restore their exact position, dimensions and palette.
	R206WarningLayout &layout = r206WarningLayouts[this];
	const bool cqc = msg.compare(0, 4, "CQC!") == 0;
	if (cqc)
	{
		layout.cqc = true;
		const int width = 176, height = 43;
		setWidth(width);
		setHeight(height);
		_text->setWidth(width);
		_text->setHeight(height);
		setX(std::max(0, Options::baseXResolution - width - 32));
		setY(2);
		_color = Palette::blockOffset(2) + 1;
		_text->setColor(Palette::blockOffset(2) + 12);
	}
	else if (layout.cqc)
	{
		layout.cqc = false;
		setWidth(layout.width);
		setHeight(layout.height);
		_text->setWidth(layout.width);
		_text->setHeight(layout.height);
		setX(layout.x);
		setY(layout.y);
		_color = layout.baseColor;
		_text->setColor(layout.baseTextColor);
	}
	_text->setText(msg);
	_fade = time * 12;
	_redraw = true;
	setVisible(true);
	_timer->start();
}

/**
 * Keeps the animation timers running.
 */
void WarningMessage::think()
{
	_timer->think(0, this);
}

/**
 * Plays the message fade animation.
 */
void WarningMessage::fade()
{
	_fade--;
	_redraw = true;
	if (_fade == 0)
	{
		setVisible(false);
		_timer->stop();
	}
}

/**
 * Draws the warning message.
 */
void WarningMessage::draw()
{
	Surface::draw();
	drawRect(0, 0, getWidth(), getHeight(), _color + Clamp(24 - _fade, 0, 12));
	_text->blit(this->getSurface());
}

}
