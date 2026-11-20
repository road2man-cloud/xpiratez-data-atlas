// R187: spatially independent ground candidates for double hand clearance.
// R186 took four geometrically overlapping positions in column 0.
#include "../src/Battlescape/GroundScan.h"
#include "../src/Battlescape/GrenadeTuLabel.h"
#include <stdexcept>
#include <iostream>
#include <vector>
using namespace OpenXcom;
static void check(const char *name, bool pass)
{
    if (!pass) throw std::runtime_error(name);
    std::cout << "PASS " << name << "\n";
}
int main()
{
    auto no = r186GroundWindows(0, 40);
    check("invalid-page-width", no.empty());
    auto early = r186GroundWindows(12, 0);
    check("early-two-pages", early.size() == 2 &&
        early[0].beginX == 0 && early[0].endX == 24);
    check("following-two-pages", early[1].beginX == 24 &&
        early[1].endX == 48);
    auto far = r186GroundWindows(12, 1925);
    check("hundred-page-tail", far[1].beginX == 1932 &&
        far[1].endX == 1956);
    check("negative-last-right", r186GroundWindows(12, -100)[1].beginX == 24);

    R187GroundPageBudget b(12, 4);
    check("first-grid-position", b.canAccept(0, 0, 2, 3));
    b.accepted(0, 0, 2, 3);
    check("reject-overlap-in-y", !b.canAccept(0, 1, 2, 3));
    check("reject-overlap-in-x", !b.canAccept(1, 0, 2, 3));
    check("allow-spaced-y", b.canAccept(0, 3, 2, 3));
    b.accepted(0, 3, 2, 3);
    check("allow-spaced-x", b.canAccept(2, 0, 2, 3));
    b.accepted(2, 0, 2, 3);
    check("fourth-disjoint-choice", b.canAccept(2, 3, 2, 3));
    b.accepted(2, 3, 2, 3);
    check("per-page-quota", !b.canAccept(4, 0, 2, 3));
    check("new-page-resets-quota", b.canAccept(12, 0, 2, 3));
    b.accepted(12, 0, 2, 3);
    check("new-page-still-avoids-overlap", !b.canAccept(12, 1, 2, 3));
    check("far-page-still-accepted", b.canAccept(1932, 0, 2, 3));

    R187GroundPageBudget horizontal(12, 4);
    std::vector<R184Placement> placed;
    const void *ground = reinterpret_cast<const void *>(0x120);
    // A tall ground item cannot fit twice vertically. R186 chose three
    // overlapping y positions at x=0, missing a legal second column.
    for (int x=0; x<12; ++x)
        for (int y=0; y<3; ++y)
            if (horizontal.canAccept(x, y, 3, 3))
            {
                horizontal.accepted(x, y, 3, 3);
                placed.push_back({ground,x,y,3,3,6,true});
            }
    check("distinct-ground-columns", placed.size()==4 &&
        placed[0].x == 0 && placed[1].x == 3 &&
        placed[2].x == 6 && placed[3].x == 9);
    auto pair = r184BestClearPlan(placed, &placed);
    check("dual-drop-pair-now-valid", pair.valid &&
        pair.moves == 2 && pair.mode == R184_CLEAR_DROP &&
        pair.cost == 12);

    R187GroundPageBudget invalid(0, 0);
    check("invalid-dimensions-rejected", !invalid.canAccept(0,0,0,2) &&
        !invalid.canAccept(-1,0,2,2));
    check("normalized-budget", invalid.canAccept(0,0,1,1));
    invalid.accepted(0,0,1,1);
    check("normalized-budget-exhausted", !invalid.canAccept(0,1,1,1));
    return 0;
}
