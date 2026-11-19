#pragma once
// R186: bounded-cost ground inventory search without a hard page ceiling.
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

// Do not send an unbounded number of equivalent placements to the O(n^2)
// two-item planner. Keep up to four choices per ground page; crucially retain
// candidates from both never-occupied tail pages as alternatives.
struct R186GroundPageBudget
{
    int pageWidth;
    int limitPerPage;
    int currentPage;
    int countOnPage;

    R186GroundPageBudget(int width, int limit = 4) :
        pageWidth(std::max(1, width)), limitPerPage(std::max(1, limit)),
        currentPage(-1), countOnPage(0)
    {
    }

    bool canAccept(int x) const
    {
        const int page = x / pageWidth;
        return page != currentPage || countOnPage < limitPerPage;
    }

    void accepted(int x)
    {
        const int page = x / pageWidth;
        if (page != currentPage)
        {
            currentPage = page;
            countOnPage = 0;
        }
        ++countOnPage;
    }
};

} // namespace OpenXcom
