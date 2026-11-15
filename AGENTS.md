# X-Piratez source-version policy

Current authoritative source for game-specific answers and future data builds: **X-Piratez 2.1 (v.o2), OXCE 8.7.1**, using the full 2.1 ruleset and matching Language/ko.yml from the same release.

NEVER use, quote, link, fetch, parse or derive gameplay assertions from X-Piratez v.o1.1.1 or other legacy ruleset files, previously generated legacy atlas indexes, historical Git revisions, or cached tool output. This applies even when an old file has a familiar name (Piratez.rul) or happens to be easier to read.

The retired source public/ruleset/Piratez.rul was deleted from main. Do not recreate it with v.o1.1.1 content. Git history and derived old database outputs may still contain legacy data; they are **not authoritative** and must not be used for current answers.

Before answering a version-sensitive question, confirm the complete source's version/commit and use the current 2.1 rules and same-version Korean translation. The 2.1 reference/items.json is a limited explicit training-mode snapshot only: it is NOT a complete ruleset. If the required 2.1 rule cannot be inspected, say it is unverified rather than falling back to 1.1.

Legacy files must not be published as ruleset sources. CI runs tools/check-no-legacy-rules.mjs and rejects public/ruleset/*.rul and known obsolete source blobs.
