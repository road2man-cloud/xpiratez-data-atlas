#pragma once
// R188: fast disjoint ground choices with bounded relaxed fallback.
//
// OpenXcom's INV_GROUND uses paginated x coordinates and getSlots() is empty.
// Search two early pages for convenient space, then two pages beyond the last
// grounded item. The latter exist regardless of how far the ground inventory
// has been paged: even 100+ filled pages need only a four-page scan.
//
// This header deliberately contains no game state and can be unit tested.
#include <algorithm>
#include <vector>

namespace OpenXcom
{

struct R186GroundWindow
{
    int beginX;
    int endX;
};

inline std::vector<R186GroundWindow> r186GroundWindows(
    int pageWidth, int lastOccupiedRight)
{
    if (pageWidth <= 0) return {};
    const int localEnd = 2 * pageWidth;
    const int lastRight = std::max(0, lastOccupiedRight);
    const int tailPage = std::max(2, lastRight / pageWidth +
        (lastRight % pageWidth != 0 ? 1 : 0));
    const int tailStart = tailPage * pageWidth;
    return {{0, localEnd}, {tailStart, tailStart + 2 * pageWidth}};
}

// R187: retain up to four *geometrically distinct* placements per page.
// R186 accepted the first four in scan order (usually x=0, y=0..3),
// often four overlapping rectangles. This lost legal two-drop routes even
// when the adjacent columns were empty. Choose rectangles that do not
// collide instead of wasting the budget on equivalent overlapping cells.
struct R187GroundPageBudget
{
    struct Rect { int x, y, width, height; };
    int pageWidth;
    int limitPerPage;
    int currentPage;
    bool allowOverlappingAlternatives;
    std::vector<Rect> acceptedRects;

    // Relaxed choices may overlap OTHER choices for the same item, since
    // only one of those choices will be used. Cross-item conflicts remain
    // forbidden by r184BestClearPlan().
    R187GroundPageBudget(int width, int limit = 4, bool relaxed = false) :
        pageWidth(std::max(1, width)), limitPerPage(std::max(1, limit)),
        currentPage(-1), allowOverlappingAlternatives(relaxed)
    {
    }

    bool canAccept(int x, int y, int width, int height) const
    {
        if (x < 0 || y < 0 || width <= 0 || height <= 0) return false;
        const int page = x / pageWidth;
        if (page != currentPage) return true;
        if (acceptedRects.size() >= static_cast<size_t>(limitPerPage))
            return false;
        if (!allowOverlappingAlternatives)
            for (const Rect &used : acceptedRects)
                if (x < used.x + used.width && used.x < x + width &&
                    y < used.y + used.height && used.y < y + height)
                    return false;
        return true;
    }

    void accepted(int x, int y, int width, int height)
    {
        const int page = x / pageWidth;
        if (page != currentPage)
        {
            currentPage = page;
            acceptedRects.clear();
        }
        acceptedRects.push_back({x, y, width, height});
    }
};

} // namespace OpenXcom
