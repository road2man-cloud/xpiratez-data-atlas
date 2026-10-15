/*
 * R27 fast standalone C++ timer formatting tests, no game runtime needed.
 * The values at 531000 and 192600 are from 25.sav, missionSites[].
 */
#include "R27GeoscapeTimer.h"
#include <cassert>
#include <limits>
#include <string>
using OpenXcom::r27FormatRemainingGeoscapeTime;

int main()
{
    assert(r27FormatRemainingGeoscapeTime(531000u) == "TIME LEFT: 6d 3h 30m");
    assert(r27FormatRemainingGeoscapeTime(192600u) == "TIME LEFT: 2d 5h 30m");
    assert(r27FormatRemainingGeoscapeTime(0u) == "TIME LEFT: 0d 0h");
    assert(r27FormatRemainingGeoscapeTime(1u) == "TIME LEFT: 0d 0h 1m");
    assert(r27FormatRemainingGeoscapeTime(59u) == "TIME LEFT: 0d 0h 1m");
    assert(r27FormatRemainingGeoscapeTime(60u) == "TIME LEFT: 0d 0h 1m");
    assert(r27FormatRemainingGeoscapeTime(3599u) == "TIME LEFT: 0d 1h");
    assert(r27FormatRemainingGeoscapeTime(3600u) == "TIME LEFT: 0d 1h");
    assert(r27FormatRemainingGeoscapeTime(3601u) == "TIME LEFT: 0d 1h 1m");
    assert(r27FormatRemainingGeoscapeTime(86399u) == "TIME LEFT: 1d 0h");
    assert(r27FormatRemainingGeoscapeTime(86400u) == "TIME LEFT: 1d 0h");
    assert(r27FormatRemainingGeoscapeTime(86401u) == "TIME LEFT: 1d 0h 1m");
    assert(r27FormatRemainingGeoscapeTime(90061u) == "TIME LEFT: 1d 1h 2m");
    assert(r27FormatRemainingGeoscapeTime(86u*86400u) == "TIME LEFT: 86d 0h");
    // Never overflow by adding 59 seconds to the original size_t.
    const std::string huge=r27FormatRemainingGeoscapeTime(
        std::numeric_limits<size_t>::max());
    assert(huge.rfind("TIME LEFT: ",0) == 0);
    return 0;
}
