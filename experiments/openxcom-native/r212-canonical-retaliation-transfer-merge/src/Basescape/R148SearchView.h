#pragma once
// R148: per-state cached search keys and identity-based scroll anchors.
// Neither class changes the layout of OpenXcom's already-compiled screens.
#include <algorithm>
#include <cstddef>
#include <string>
#include <vector>
#include "R145QuickSearch.h"

namespace OpenXcom
{
class R148SearchCache
{
    struct Entry
    {
        const void *rule;
        int type;
        std::string name;
        std::string searchableUpper;
        bool populated;
        Entry() : rule(nullptr), type(-1), populated(false) {}
    };
    std::vector<Entry> _entries;
public:
    template <class Row, class Build>
    bool matches(size_t index, const Row &row, const R145QuickSearch &search, Build build)
    {
        if (!search.active()) return true;
        if (index >= _entries.size()) _entries.resize(index + 1);
        Entry &entry = _entries[index];
        const void *rule = static_cast<const void *>(row.rule);
        const int type = static_cast<int>(row.type);
        if (!entry.populated || entry.rule != rule || entry.type != type || entry.name != row.name)
        {
            entry.rule = rule;
            entry.type = type;
            entry.name = row.name;
            entry.searchableUpper = build();
            Unicode::upperCase(entry.searchableUpper);
            entry.populated = true;
        }
        return search.matchesUppercase(entry.searchableUpper);
    }
};

// A stable item identity is captured BEFORE any in-place sort of _items.
// Scroll anchors and arrow selection are restored against freshly rebuilt _rows.
class R148RowAnchor
{
    const void *_rule;
    int _type;
    std::string _name;
    bool _valid;
public:
    R148RowAnchor() : _rule(nullptr), _type(-1), _valid(false) {}
    template <class Row>
    R148RowAnchor(size_t visibleIndex, const std::vector<int> &display,
                  const std::vector<Row> &items)
        : _rule(nullptr), _type(-1), _valid(false)
    {
        if (visibleIndex >= display.size()) return;
        const int itemIndex = display[visibleIndex];
        if (itemIndex < 0 || static_cast<size_t>(itemIndex) >= items.size()) return;
        const Row &item = items[static_cast<size_t>(itemIndex)];
        _rule = static_cast<const void *>(item.rule);
        _type = static_cast<int>(item.type);
        _name = item.name;
        _valid = true;
    }
    bool valid() const { return _valid; }
    template <class Row>
    size_t find(const std::vector<int> &display, const std::vector<Row> &items) const
    {
        if (!_valid) return static_cast<size_t>(-1);
        for (size_t displayIndex = 0; displayIndex < display.size(); ++displayIndex)
        {
            const int itemIndex = display[displayIndex];
            if (itemIndex < 0 || static_cast<size_t>(itemIndex) >= items.size()) continue;
            const Row &candidate = items[static_cast<size_t>(itemIndex)];
            if (static_cast<const void *>(candidate.rule) == _rule &&
                static_cast<int>(candidate.type) == _type &&
                candidate.name == _name)
                return displayIndex;
        }
        return static_cast<size_t>(-1);
    }
};
}
