// R189: a valid quick grenade clearance path need not be the cheapest.
#include "../src/Battlescape/GrenadeTuLabel.h"
#include <iostream>
#include <limits>
#include <stdexcept>
#include <vector>

using namespace OpenXcom;

static void check(const char *name, bool condition)
{
    if (!condition) throw std::runtime_error(name);
    std::cout << "PASS " << name << "\n";
}

int main()
{
    const void *ground = reinterpret_cast<const void *>(1);
    const void *belt = reinterpret_cast<const void *>(2);
    const void *backpack = reinterpret_cast<const void *>(3);
    // Both items have a cheap ground choice at the SAME cell. Their other
    // choices are expensive but legal; R188 would stop at that valid route.
    std::vector<R184Placement> fastFirst{
        {ground, 0, 0, 2, 2, 1, true},
        {belt, 0, 0, 2, 2, 7, false}
    };
    std::vector<R184Placement> fastSecond{
        {ground, 0, 0, 2, 2, 1, true},
        {backpack, 0, 0, 2, 2, 7, false}
    };

    auto fast = r184BestClearPlan(fastFirst, &fastSecond);
    check("fast-route-valid", fast.valid);
    check("fast-route-cost-suboptimal", fast.cost == 8);
    check("independent-bound-cheaper", r189IndependentClearLowerBound(fastFirst,fastSecond) == 2);
    check("suboptimal-valid-route-triggers-expansion",
          r189NeedsExpandedClearSearch(fast,fastFirst,fastSecond));
    auto expandedSecond = fastSecond;
    expandedSecond.push_back({ground, 2, 0, 2, 2, 1, true});
    auto expanded = r184BestClearPlan(fastFirst,&expandedSecond);
    check("expansion-finds-cheap-two-drop",expanded.valid && expanded.cost == 2 &&
          expanded.mode == R184_CLEAR_DROP);
    check("expanded-choice-does-not-overlap",
          !r184PlacesConflict(fastFirst[0],expandedSecond.back()));
    check("expanded-optimal-skips-further-search",
          !r189NeedsExpandedClearSearch(expanded,fastFirst,expandedSecond));

    std::vector<R184Placement> alreadyFeasibleFirst{{ground,0,0,2,2,1,true}};
    std::vector<R184Placement> alreadyFeasibleSecond{{ground,2,0,2,2,3,true}};
    auto optimal = r184BestClearPlan(alreadyFeasibleFirst,&alreadyFeasibleSecond);
    check("fast-optimal-route-keeps-fast-path",
        !r189NeedsExpandedClearSearch(optimal,alreadyFeasibleFirst,alreadyFeasibleSecond));
    check("optimal-cost-equals-independent-bound",
        optimal.cost == r189IndependentClearLowerBound(alreadyFeasibleFirst,alreadyFeasibleSecond));

    R184ClearPlan invalid;
    check("invalid-route-still-expands",
        r189NeedsExpandedClearSearch(invalid,fastFirst,fastSecond));
    const std::vector<R184Placement> empty;
    check("empty-list-uses-infinite-lower-bound",
        r189IndependentClearLowerBound(empty,fastSecond) ==
        std::numeric_limits<int>::max());
    check("empty-list-invalid-route-still-expands",
        r189NeedsExpandedClearSearch(invalid,empty,fastSecond));

    // Lower bound should remain a lower bound when move costs are negative
    // due to malformed ruleset data; engine clamps negative TU to zero.
    const std::vector<R184Placement> zeroish{
        {belt,0,0,1,1,-99,false}
    };
    check("negative-move-tus-clamped",
        r189IndependentClearLowerBound(zeroish,alreadyFeasibleSecond)==3);
    return 0;
}
