#pragma once
// R145 unified quick search for purchase / fence / transfer.
// AND between words, "-" excludes a word, double quotes match an exact phrase.
// Works with UTF-8 localized Korean names after OpenXcom's Unicode case folding.
#include <string>
#include <vector>
#include "../Engine/Unicode.h"

namespace OpenXcom
{
class R145QuickSearch
{
    struct Term
    {
        std::string text;
        bool exclude;
        Term(const std::string &term, bool negated) : text(term), exclude(negated) {}
    };
    std::vector<Term> _terms;
public:
    explicit R145QuickSearch(std::string input)
    {
        Unicode::upperCase(input);
        for (size_t pos = 0; pos < input.size(); )
        {
            while (pos < input.size() && (input[pos] == ' ' || input[pos] == '\t' ||
                   input[pos] == '\r' || input[pos] == '\n')) ++pos;
            if (pos >= input.size()) break;
            bool exclude = input[pos] == '-' && pos + 1 < input.size();
            if (exclude) ++pos;
            bool quoted = false;
            std::string token;
            while (pos < input.size())
            {
                const char ch = input[pos];
                if (ch == '"') { quoted = !quoted; ++pos; continue; }
                if (!quoted && (ch == ' ' || ch == '\t' || ch == '\r' || ch == '\n')) break;
                token.push_back(ch);
                ++pos;
            }
            if (!token.empty()) _terms.emplace_back(token, exclude);
        }
    }
    bool active() const { return !_terms.empty(); }
    // R148: reusable indexed strings have already been normalized to uppercase.
    bool matchesUppercase(const std::string &haystack) const
    {
        for (const Term &term : _terms)
        {
            const bool found = haystack.find(term.text) != std::string::npos;
            if (term.exclude ? found : !found) return false;
        }
        return true;
    }
    bool matches(std::string haystack) const
    {
        if (_terms.empty()) return true;
        Unicode::upperCase(haystack);
        return matchesUppercase(haystack);
    }
};
}
