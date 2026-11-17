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

## Facility capabilities and saved production orders

The planner also reads `bases[*].facilities` and `bases[*].productions`
from the **user-selected local save**. Facility declarations are taken from a
separate `facilities-v2-index.json`, derived from the *same verified 16 v.o2
rules files* used for the existing item, research and manufacturing indexes.

For a selected **individual base**, the production panel compares each
manufacturing recipe in the expanded plan with that base's saved facility
instances and the rule's explicit `provideBaseFunc` and
`requiresBaseFunc` arrays. Facilities with a positive `buildTime` remain
marked as under construction rather than supplying functions; installed
facilities with no saved build-time marker are treated as completed for this
limited inspection. Unknown additional-mod facility types are reported but
cannot provide inferred functions.

The panel lists the base's saved manufacturing orders by item ID and the
actual saved `assigned`, `amount`, `spent`, and `infinite` fields, as
available. These are **raw save attributes**, not a completion percentage,
elapsed wall-clock duration or an ETA. Neither personnel availability nor
manufacturing throughput is inferred.

When **all bases** are selected for inventory aggregation, their facilities
and manufacturing capacities are **not** pooled into a fictional single
base. The panel instead shows each base's separate facility and saved-order
counts. A user's `.sav` is parsed locally and never committed or uploaded.

### Rebuilding the facility catalogue

```sh
node tools/build-v2-facilities.mjs --source /path/to/user/mods/Piratez
node tools/build-v2-facilities.mjs --source /path/to/user/mods/Piratez --check
npm run check:manufacture:planner:v2
```

The facility snapshot contains 115 explicitly defined facilities in the
verified v.o2 mod. It intentionally does not invent vanilla facility
definitions, engine-supplied defaults, disabled-status logic, or rules from
other user mods.

## Additional-production queue scenarios for an imported base

The production panel now includes a **hypothetical additional-production
queue** after the user selects one specific base from a local v.o2 save.
The calculator offers each saved manufacturing order as an optional
*additional* 1-100 batch scenario, together with the presently selected
new manufacturing target. Users can include/exclude a saved order, change
its **assumed** extra batch count, move the order up/down, and put the
new target first or last.

The results combine all selected jobs against **one shared base inventory**,
deducting each starting item only once. Explicit, deterministic unused
outputs of earlier hypothetical jobs can satisfy later jobs. Jobs that
still require external ingredients or contain unresolved recipe conditions
do **not** produce fictitious transferable stock for subsequent jobs.
A shared materials table shows consumption from starting stock, reuse of
earlier projected outputs, remaining external demand and residual stock.
Each job also reports known manufacturing costs, declared work/time,
and facility/research evidence in the selected base.

**Critical scope:** Saved `amount`, `spent`, and `assigned` are original
save fields, not an API guaranteeing unfinished batch counts or a consumed
ingredient ledger. They are displayed for reference but are **never**
subtracted from the inventory or misrepresented as remaining work. A
one-round saved-order scenario is an *additional hypothetical future order*,
not a reconstruction of the existing unfinished order. The calculator
does not claim an ETA, use engineers as throughput, perform purchases,
combine production facilities across bases, or infer completion feasibility
from missing external resources.

The queue JSON export contains only the calculated v.o2 planning data;
it is generated in the browser without uploading the save. The optional
selected-base queue is hidden in the **all bases** inventory view, because
the separate bases cannot safely share manufacturing capacity.

## Side-by-side order impact (new-first versus saved-orders-first)

The queue view now offers **신규 먼저 vs 나중 비교**, which simulates the
same set of selected additional-production jobs twice with a *fresh, identical
initial base inventory*: once with the new target first, and once with the
saved additional-order assumptions first. It displays the material-specific
difference in unresolved external procurement quantities, alongside both
declared manufacturing-cost sums. Users can still move individual saved
orders up/down and choose any initial order for the main queue.

The comparison does not claim an optimal schedule or compute actual
unfinished-game manufacturing progress. If a hypothetical job has unverified
required inputs, missing facility functions, or required research IDs absent
from the selected save's `discovered` list, future produced items from that
job are **not transferred** to later queue jobs. This conservative gate does
not assert that a missing `discovered` ID proves impossibility; it only
prevents speculative inventory credits.

The order comparison and inventory analysis use v.o2 data in the current
browser page only and are exported as independent JSON scenarios; a user's
saved game is never modified or uploaded.

## Ordered procurement checklist and CSV export

The hypothetical queue now produces a **first-shortage** procurement list.
Each 2.1 item is grouped across all selected queue jobs, with its unresolved
quantity, first queue position requiring it, and subsequent affected jobs.
Ordering is based on first occurrence of unmet demand, then the number of
affected jobs; it does not claim the item is purchasable or globally optimal.
When a v.o2 item declares a numeric `costBuy`, the checklist includes a
reference subtotal. Unknown prices remain unspecified. Export produces a
UTF-8 CSV locally in the browser, without uploading the user's save.
The main queue's order comparison and consolidated material ledger remain
available independently. Saved `spent`, `amount` and `assigned` values
continue to be displayed only as raw game data, never interpreted as
unfinished batches.

## Virtual material acquisition impact analysis

The hypothetical queue includes a **가상 재료 확보 후 제조 계획 비교**
panel. It takes additional quantities for items on the queue procurement
checklist, without changing the imported save inventory or performing a
purchase. **현재 부족 수량으로 가정 채우기** copies up to 300 currently
missing quantities into the editable acquisition plan; users may change
individual quantities, run the comparison again, or clear all virtual
additions.

For each run, the calculator executes the *same job sequence* with the
original holdings and again with the added hypothetical units. It presents
the change in remaining external procurement by item, the first-order
effects on each job, and any remaining facility, research and explicit-rule
uncertainties. Newly freed deterministic outputs from earlier hypothetical
jobs can be reflected in downstream requirements, subject to the same
conservative evidence checks as the manufacturing queue.

The acquisition price uses only explicitly declared `costBuy` fields
from the matching v.o2 item index. It displays a partial known subtotal
when some fields are unknown and never claims a confirmed total or
availability. The standalone JSON export contains two hypothetical
calculation outputs and the chosen virtual quantities. Save data remains
in the browser, is not uploaded, and the original source `.sav` is not
modified. This is **not** an automatic game purchase, work scheduler or
completion-time prediction.
