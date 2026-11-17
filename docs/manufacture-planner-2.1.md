# X-Piratez v.o2 manufacturing and procurement route planner

The calculator at `public/manufacture-v2/planner/` builds a nested
bill of materials from three independent, source-aligned X-Piratez **v.o2**
indexes: items (4,014), research (4,629), and manufacture (2,175).

## Features

- Search and select a recipe; set 1-100 production batches.
- Expand up to six levels of ingredient manufacture, tracking quantities,
  rounded-up production batches and surplus outputs without double-using
  surplus from separate branches.
- Automatically expand only a **single eligible manufacturer** with an
  explicitly stated output quantity.
- Keep items with multiple producers as external procurement until the user
  chooses one; show declared cost, time, number of ingredient types and
  research conditions for the alternatives.
- Separate manufacturing costs and times from *reference-only* item purchase
  values. Unknown prices are omitted, not assumed zero.
- Track direct research references and the declared dependency closure, with
  warnings for unresolved research and cycles.
- Provide a manufacturing tree, unresolved/external procurement list, and an
  exportable plan JSON, without changing the source indexes.
- Detect recursion cycles and limit the expansion to 500 recipe nodes.
- Enter stock for up to 5,000 verified v.o2 item IDs using search, row editing, bulk `STR_ID=quantity` input, or an explicitly chosen Extended 8.7.1 / piratez v.o2 save. Starting inventory is decremented before additional production.
- Reuse excess batches and explicit co-products across sibling branches in one shared deterministic inventory ledger, including a consolidated quantity table and remaining inventory.
- Compare up to 12 alternate producers under the same starting stock, with independently recomputed declared manufacturing cost/time, unresolved materials and partial buy-price references. Candidate display ordering is based on immediate declared cost per unit and is **not** a proven global minimum.

### Optional assumptions

An unchecked option permits **no inference** when `producedItems` is absent.
Checking it permits a recipe with an ID identical to a known item ID to be
treated as producing **one item per execution**. Such branches are explicitly
flagged `assumed-yield` and are never presented as verified output.

The shared stock ledger is calculated afresh for every plan and comparison scenario. It prevents duplicate use of leftovers; output is credited only after the inputs of the selected recipe have been expanded. Sibling material processing favors a candidate that has declared co-products matching another required sibling, but this is a local deterministic heuristic rather than globally optimized batch scheduling. A single global producer choice is applied per item ID across the plan.

An absent item output, stochastic output recipe, multiple viable production
recipes, or a depth/complexity cutoff stays externally unresolved. Choices
made for one item apply to every occurrence of that item in the tree.

## Important limitations

This is a planning and source-inspection aid, **not a runnable-game manufacturing
availability simulation**. Research requirements can involve logical gates,
`getOneFree`, events, facilities, factions, and save state. The planner shows
literal research IDs; it does not establish AND/OR semantics or completion
status. Item purchase prices do not prove market availability, and summing
them with recipe manufacturing costs does not establish an executable bill.
The planner cannot determine which alternative is cheapest without evidence
for all recursively required resources. It does **not** combine v.o1.1.1
databases, vanilla content, optional mods or unverified engine defaults.

## Development

```sh
node --test tools/test-v2-manufacture-planner.mjs
node tools/check-v2-manufacture-planner-browser.mjs
```

All manufacturing and research source data remains separate from the original
mod ruleset/translation files. No copyrighted source files are republished.


## Shared inventory and alternative-cost improvement (2026-11-17)

The planner accepts holdings of up to 5,000 verified v.o2 item IDs. Enter entries
by searching, changing the amount inline, deleting individual rows, or by pasting
lines such as `STR_CHEMICALS=12`. An explicitly selected compatible save file can
replace the entered inventory for one base, or aggregate multiple bases with an
explicit warning that transport constraints are not modeled. Inventory remains
in the open page only.

When a recipe needs an item, the planner subtracts that item from initial
holdings first and then from its shared pool of previously produced outputs.
Only the remaining shortage is passed to a selected sub-recipe or external
procurement. All nodes in a plan share those ledgers; an ingredient is never
used twice. An explicit recipe's additional producedItems are shared as
co-products. When an entire item demand is covered, no additional recipe is
scheduled. Surplus remaining after the full traversal stays in the plan.

The consolidated material table shows gross demand, consumed initial stock,
consumed manufactured stock, total produced stock, remaining external supply,
and stock balances per item. Manufacturing cost/time reflects **only recipes
that actually ran**, avoiding unnecessary extra batches when holdings suffice.
This is a deterministic depth-first bill-of-materials schedule: it prioritizes
recipes that produce ingredients needed by other siblings but does not perform
a global integer-programming optimization or choose producer alternatives
without user input.

The alternative comparison button runs up to 12 candidate producers as fresh,
independent simulations using identical starting holdings. Each row shows
declared manufacturing expense and time, external resource uncertainty, and
the portion of external list purchase prices available. Candidates are ordered
for display by *direct* manufacturing cost per declared yield, **not by final
cost**. Their purchasing availability, research gates, or global optimum are
not verified. Missing prices are never treated as zero in a claimed total;
a fully priced reference exists only when all external source price fields and
executed recipe cost fields are present.

Changes to inventory, supplier choices, depth, or batch count recompute the
plan; JSON export includes the consolidated ledger and remaining inventory.
The new ledger does not modify the underlying public v.o2 data indexes.

## Import a local X-Piratez v.o2 game save

1. On the planner page, choose a local `.sav` file from the game's
   `user/piratez/` directory. No file is selected automatically.
2. The **local browser only** reads the file with `File.text()` and inspects
   a strict subset of the OXCE YAML save: metadata header, top-level
   `bases[*].items` storage maps, and the top-level `discovered` list.
   It does not parse nested craft inventory as base storage.
3. The reader requires the header values `Extended 8.7.1`, `engine: Extended`,
   and `piratez ver: v.o2`. Incorrect/legacy headers, malformed inventory,
   missing stores, or missing research sections are rejected rather than
   falling back to the historical 1.1 database.
4. Choose a specific base (default: first base), or consciously choose the
   **all bases** option. The aggregate ignores distance, transport and base
   assignment; it is a strategic inventory overview, not immediate shared
   stock available at a single factory.
5. Click **Apply** to replace manual stock with only IDs present in the
   versioned 2.1 item index. Unknown/extra-mod IDs are not imported. The
   preview shows the skipped-entry count and other-mod warning before apply.
6. The linked research display marks each direct prerequisite as **present**
   or **absent** in the saved `discovered` list. An absent ID does **not**
   prove that a technology is permanently unavailable or reveal the actual
   logical gates for manufacturing. Disconnect the save research overlay
   without deleting manually edited stock using the dedicated button.

The save contents are not sent to any server, stored in browser localStorage,
written to GitHub, or retained by the page after it closes. The parser
returns only filtered storage IDs, counts and the matching research IDs;
other unrecognized IDs are counted but not copied into the manufacturing plan.
A save header does not contain the source ruleset SHA-256. Its version label
cannot prove byte-for-byte consistency with the 2.1 public index: matching
source installation hashes must still be checked separately.

For developers, the normal tests use **synthetic** save fixtures and do not
embed a player's save. A local installation can be cross-checked on demand
without copying the save to the repository:

```sh
node --test tools/test-v2-save-import.mjs
# Optional local-only compatibility test:
# XPIRATEZ_V2_SAVE=/path/to/current.sav node --test tools/test-v2-save-import.mjs
```
