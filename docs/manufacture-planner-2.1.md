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

The **새로 드러나는 부족분까지 반복 탐색** control now re-runs the same
hypothetical queue after adding explicitly unmet material quantities,
up to five bounded rounds. It can reveal downstream shortages that were
not visible in an earlier scenario and explicitly reports if a bound
stops expansion. A zero item shortage count still does not prove the
factory, research, or event conditions are satisfied. The browser never
writes to the original game save.

## Iterative procurement trace panel

The existing bounded repeat-shortage control now displays an independent
**round-by-round procurement history** table. Each row identifies the
iteration, unresolved item types and quantities before the pass, up to 20
newly proposed item names, and total virtual additions for that pass.
The interface separately reports termination reasons and still-unresolved
item types. An additional JSON export preserves the complete expansion
history and comparison without altering the player's original save.
Rerunning the standard what-if comparison or clearing the hypothetical
quantities clears stale history to prevent confusing different scenarios.

## Evidence-based manufacturing blockers and inventory provenance

The procurement what-if result now includes an **order-by-order evidence
matrix**. It separates four distinct dimensions: externally unresolved
materials, facility functions that are explicitly required but missing
from the selected base's saved completed facilities, research references
missing from that save's `discovered` list, and unresolved rule flags.
Every row preserves the relevant detail and a first issue to inspect.
This is an inspection priority, **not** a production-ready verdict.

The table distinguishes **not checked** from **missing**: when no valid
facility roster or no discovered-research evidence is available, it does
not invent a negative conclusion. Even when every explicitly examined
requirement looks covered, engine conditions, events, extra mods,
personnel capacity and game-time availability remain unverified.

A second table distinguishes starting user-entered/loaded inventory from
**hypothetical acquired units**. Because the underlying queue merges both
sources before consumption, the exact origin of consumed items cannot be
recovered. Instead it shows provable lower and upper bounds for the
hypothetical portion consumed:

```text
min hypothetically used = max(0, total used - starting held)
max hypothetically used = min(total used, hypothetically added)
```

A zero material shortage in a hypothetical calculation never means
those items have actually been obtained. The evidence matrix is
included in the what-if JSON download; no save file is changed.

## Full single-recipe material ledger export

The consolidated materials section provides **전체 수급표 CSV 저장**.
Unlike the on-screen table (limited to 200 displayed entries), the exported
Korean UTF-8 CSV includes every calculated material entry: total demand,
starting inventory consumed, surplus production reused, manufactured output,
unresolved external demand, and remaining starting/produced quantities.
The export reflects the current selected recipe, quantities, path choices
and loaded inventory. It is a planning ledger, not a game command, and
does not alter saves or stock. CSV text is escaped for spreadsheet import.

## Shared first-action checklist

The evidence matrix now contains a consolidated **first-action checklist**.
It groups repeating shortages of the same v.o2 item, missing facility
functions, undiscovered research IDs, and unresolved rule flags across
hypothetical production jobs. Each entry identifies the first queue
position it affects, all affected orders, and any summed externally
unresolved material amount. When facility or save research evidence
has not been loaded, the list recommends inspecting the missing evidence
rather than misclassifying it as a missing facility or locked research.

Checklist sorting is by the earliest affected order, then item category
and the number of affected orders. It is not a cost-optimal build order
or guarantee that a game action is available. The entire checklist is
embedded in the JSON comparison export as part of the evidence matrix,
while the original game save remains untouched.

## Combined route acquisition and manufacturing review board (2026-11-18)

The edited-route cascading scenario now generates an additional
**재료 확보·제조 순서 통합 작업표** that can be followed as a
local review worksheet. This board is not a production command queue.
It combines hypothetical material acquisition/remainder records,
unresolved research/facility/rule evidence from the final v.o2
readiness checklist, and dependency-first expanded recipe occurrences.

Tasks have stable IDs within the current single-recipe simulation:
`material::<itemId>`, `condition::<checklist key>` and
`recipe::<expanded sequence position>`. Each task has a locally
grounded next-check description, source status, and a reference to
any prerequisite review tasks. A recipe task links to previously
expanded child recipe steps; direct input materials that are
modelled as existing stock or hypothetical external additions
link to their matching material-check task, without double-counting
an intermediate manufactured item already represented by a child
recipe. Direct research refs and recipe-scoped facility evidence
link to their corresponding evidence tasks when present. Unknown
unlock and runtime constraints remain unverified.

The browser table allows individual **사용자 검토** marks and short
notes (up to 300 characters), with filtering by material, evidence,
recipe or unreviewed tasks; text search; and **100-row pagination**
so even large worklists are navigable. The page shows how many
linked prerequisite tasks have not yet been marked reviewed. This
is a review metric only, NOT a confirmation that any actual input,
research, facility or manufactured output exists in the game.

Both CSV and JSON exports include the entire task list, user review
marks, notes and still-unreviewed dependency IDs, independent of
the currently filtered page. A previously saved review JSON can be
imported into the **identical** action graph; import validates the
source version, recipe goal, task count, exact IDs, quantities,
statuses and dependency references, and refuses stale or unrelated
plans without overwriting the current review. The imported JSON
is read locally in the browser; the game save is not changed.

Changing producer choices, hypothetical material quantities,
source stock or the manufacturing goal invalidates the old
board, review marks and notes. A fresh scenario produces a new
board that can receive a compatible exported review if desired.

**Limitations:** all acquisition quantities remain hypothetical;
local task-review marks and notes are neither saved-game edits nor
manufacturing completion evidence. The displayed order is the
expanded rule dependency representation, not a guaranteed game
production schedule or purchasing route.

## Grounded procurement reasons and dependency-first recipe order (2026-11-18)

The edited-route, single-goal cascading calculation now exports
`materialWorkflow` alongside its pre-existing `acquisitionLedger`.
The new **조달 사유별 확인 작업 · 제조 의존 순서** view groups
material records by the **explicit external reasons** produced
by the current v.o2 manufacturing planner. Supported groups include
user-chosen external supply, missing producer choice, invalid producer
choice, recipe-depth limit, unverified output, cycle/expansion/quantity
stalls, and resources without an explicit available producer.
Unknown or absent reasons remain visibly unverified, rather than
being assigned a market or loot availability category.

Each material row carries the first observed simulation stage, whether
it was included in the initial acquisition, a later cascade round,
or remains unresolved without an acquisition assumption. Current
entered stock, cumulative hypothetical additions, remaining shortages
and a grounded next checking action stay separate. Filtering by
reason does not change the calculated plan.

The new recipe-order table follows `plan.tree` for the final
hypothetical-stock scenario, walking nested producer nodes
**children before their parent**. Each numbered occurrence includes
its exact expanded recipe ID, batch count, explicitly declared
input quantities, child step references and declared cost/time when
present. A comparison against the route-only baseline lists which
expanded recipe occurrences and batch counts differ after virtual
materials are added. A separate plan-stock-consumption table uses
the planner's explicit `inventory.consumed` result. That quantity
combines original input stock and hypothetical extra stock; the UI
does **not** claim to allocate actual consumption by those two
sources or to schedule production in the real game.

**조달·제조 순서 CSV 저장** exports all classified materials
and all final recipe steps, even when a table is visually capped
at 200 entries. The existing scenario JSON preserves the complete
workflow including before/after recipe sequences and grounded
source reasons. The workflow resets when materials or producer
choices change, so stale data cannot be exported. It does not
alter the save, manual inventory, producer choices or other
workers' versions.

**Important boundary:** dependency-first order is a representation
of the expanded bill of materials, **not** a guaranteed in-game
production queue or proof of valid facility, research, unlock,
worker, availability or purchase conditions. The categories are
about planner evidence and next investigation steps, not verified
procurement methods or market inventory.

## Inventory-aware staged procurement ledger (2026-11-18)

The route-aware single-recipe cascading scenario now includes an
**단계별 확보 계획 · 현재 재고 대조** panel, separate from the
existing shortage trace. It reconstructs the initial **user-entered**
stock, the user's manually chosen first-batch hypothetical acquisitions,
each subsequent bounded cascade pass, accumulated additional acquisition
quantities and the hypothetical final on-hand inventory for every item.
Rows also show unresolved remaining shortages, including uncatalogued
materials that could not be virtually acquired.

Each material's hypothetical final on-hand target is explicitly
`initial manually entered stock + the sum of stage additions`.
First-pass quantities are not repeated in later rounds, and additions
for the same item in more than one stage are accumulated only once
per round. The stage reconstruction checks unique IDs, integers,
per-item stock limits and agreement with the final cascade report
before displaying or exporting a ledger.

The new table offers item ID/Korean-name search and sort orders for
largest hypothetical acquisition, greatest remaining shortage or
item name. The on-screen view is limited to the first **200 filtered**
items, but **단계별 조달 계획 CSV 저장** exports every material
with one column per calculated pass. The CSV includes UTF-8 BOM for
Korean spreadsheet apps and preserves zeroes and unknown reference
prices without manufacturing new values. The existing full JSON
export also embeds the structured acquisition ledger as
`acquisitionLedger`, including the complete stage-by-stage sums.

Ruleset `costBuy` values are only rough reference unit prices.
The ledger shows how many item kinds have known prices, a subtotal
for those kinds, and an overall reference subtotal only when every
hypothetically acquired material has a known explicit reference
price. It does **not** imply those items are sold, purchasable,
affordable or that the workbench's producer choices can execute in
the game. Existing stock shown in the table comes from input or an
imported single selected base, and is not treated as a newly
acquired quantity. When the route or selected acquisition changes,
the old ledger and download button are cleared with the invalidated
scenario; the original game save remains unmodified.

## Edited-route cascading material acquisition (2026-11-18)

The route-aware single-goal batch editor now includes
**뒤이어 생기는 부족분 반복 가정 (최대 4단계)** after an explicit
one-pass hypothetical acquisition. The button is enabled only when
the first independent route-aware calculation has unresolved
materials. This supplements the existing multi-job queue iteration
but works with the user's *edited single recipe* and its explicit
producer choices instead of changing queued manufacturing jobs.

The engine always uses a copy of the original manually entered stock.
The first pass preserves the user's chosen partial acquisition
quantities. Subsequent rounds inspect the newly calculated external
shortage entries (including newly exposed downstream ingredients),
validate their v.o2 catalogue IDs, and hypothetically add quantities
up to the remaining per-item stock limit. It recalculates the entire
edited recipe with **cumulative** stock after every round, rather
than adding an earlier assumption twice. The number of rounds is
bounded (UI uses four, engine supports one through six), with a
5,000-kind/10,000,000-per-item stock cap.

A visible trace records each pass's starting shortage counts,
newly assumed materials/units, items first exposed after the pass
and remaining shortages. Its stop reason distinguishes exhaustion
of modelled external shortages from round limits, stock/item limits
and no further progress. A zero-external-shortage result does
**not** prove market availability, physical manufacturing readiness,
research unlocks or completed production.

After iteration the route-aware summary, A/B snapshot, stock-input
draft, CSV and JSON refer to the **cumulative** hypothetical
acquisitions. The JSON retains initial and additional assumptions
separately, the full step trace and the remaining external materials.
The stock draft contains exact hypothetical total-on-hand quantities
and requires a separate, user-triggered application in the existing
bulk-stock editor. Editing the producer route or any selected material
invalidates the earlier iterative result; failure of later rounds
preserves the valid one-pass calculation instead of showing stale
iteration data. The source game save is never edited.

## Route-edited manufacturing with independent bulk procurement (2026-11-18)

The **제조 준비·조달 체크리스트** now has
**이 제조 목표의 경로·조달 작업대 열기**. This opens the existing
single-recipe route workbench directly from the current calculated
manufacturing goal when at least one catalogued shortage is available,
without first running bounded procurement-candidate exploration.

A new **변경된 제조 경로의 부족 재료 일괄 확보** section in the workbench
uses the route-edited plan **before any hypothetical acquisition**.
It lists that route's actual unresolved materials, including items
not present in the original route. Users choose individual quantities,
select all eligible materials, or clear the selection. This editor is
distinct from the legacy explored-candidate acquisition controls, so
their stock additions are never silently combined or counted twice.

On **경로 + 일괄 확보 재계산**, the route is replayed with the
original manual inventory and current workbench producer choices.
The edited route's shortage checklist is checked for staleness
before the selected quantities are applied to a stock copy.
An independent route-aware batch plan is then recalculated, retaining
three comparisons: original goal, edited route only, and edited route
plus hypothetical acquisitions. The report separates checklist
requirements added/removed by the producer-route edit from those
changed by the later virtual procurement step.

Successful results have explicit **재고 입력문 준비**, **A에 저장**,
**B에 저장**, **통합 결과 JSON 저장** and **확보 초안 CSV 저장**.
The stock draft uses validated total-on-hand quantities and is written
only to an empty bulk-editor input. The user must separately activate
the pre-existing **여러 재고 적용** action to change calculator stock;
the original game save is never edited. A/B entries include the edited
route choices and are accepted only against compatible baselines.
A/B comparisons now also normalize and compare explicit producer-route
choices, preventing two unrelated manufacturing paths with accidentally
identical shortage totals and declared costs from being treated as the
same source scenario. Saving a new incompatible A/B result clears the
opposite saved slot rather than silently mixing incompatible routes.

Changing any route, selected material, or acquisition quantity
invalidates the previous route-aware result and disables stale
exports. When the selected route requires no unresolved external
materials, the new editor reports that nothing can be acquired
instead of inventing a shortage. Facilities, research unlock
conditions, market availability and game execution remain evidence
checks, not claimed manufacturing readiness.

## Readiness checklist to batch acquisition handoff (2026-11-18)

The single-goal **제조 준비·조달 체크리스트** now contains an embedded
multi-material acquisition editor. Materials in its checklist have
an independent checkbox and a bounded integer **일괄 확보 수량** field;
the local review checkbox remains a separate annotation. Users can
select every eligible shortage or explicitly choose a subset and
replace full shortages with partial acquisition quantities.

**선택 재료 확보 후 재계산** validates all current material IDs and
shortages against the active v.o2 recipe plan, the 10,000,000
per-item stock cap and the item catalog. It applies the acquisition
to a copy of the current inventory, independently recalculates the
selected manufacturing goal and reconstructs the entire material,
facility, research and rule checklist. Results distinguish new
checklist items, items absent from the simulated result and changes
to quantities or evidence status. Newly exposed downstream material
shortages remain listed; disappearance from a simulated checklist
never means that a game task was actually completed.

The scenario includes a per-material table showing shortage, starting
stock, hypothetical acquisition, hypothetical resulting stock, and
optional original ruleset buy-price reference. Prices are not treated
as proof of current market availability or a real payable amount.
The full before/after simulation and checklist change ledger can be
downloaded as local JSON, while an Excel-friendly UTF-8 BOM CSV
contains the precise per-material stock draft and available price
references. Every export is generated in the browser without
uploading the user's save.

**재고 입력 초안 준비** writes exact target stock totals, not deltas,
into the existing bulk stock editor only if it is empty. The user
must click the pre-existing **여러 재고 적용** button to make any
change to the calculator's manual stock; the original game save is
never edited. A selected scenario can also be saved explicitly to
the existing A/B comparison slots. Changing selected materials
or amounts invalidates the old preview and disables stale exports.
Changing recipes, producer routes, inventory or research inputs
rebuilds and resets the scenario and its independent review marks.

The full material selection can include items beyond the first
200 rendered checklist rows, but the engine uses only current
catalogued shortages and the existing stock limits. Facility
requirements never pool stock or facilities from different bases,
and evidence gaps remain unverified instead of being declared
proof of impossible production.

## Unified single-goal readiness and procurement checklist (2026-11-18)

The main manufacturing calculator now produces a **제조 준비·조달 체크리스트**
without requiring an exploration candidate. It unifies the selected
recipe's remaining external input quantities, saved-base facility
observations, `discovered` research evidence, unresolved research
references and rule uncertainty flags into a single ordered local
worksheet. Each record retains an actionable next check, its rule/save
evidence, a stable ID and the affected recipe IDs where applicable.

The table groups these observations into material, facility function,
research, unresolved reference and rule categories. Shared facility
functions are counted only once per selected base, even when multiple
recipes require the same function, with all affected recipes preserved.
Known completed facilities and observed research IDs are omitted from
the *outstanding-action* list, but the checklist does not assert that
all conditions for execution are satisfied. Its order prefers checking
external shortages, finishing or identifying facilities, then research
evidence and uncertain rules. It does not rank cost, availability,
production feasibility or independent item value.

Users can filter by category, mark items as **locally reviewed**, reset
review marks and export the full list as Korean UTF-8 CSV or JSON.
The JSON records review marks separately as UI-only notes, never as
proof that game requirements are complete. Export includes all items
even when the view displays at most 200 rows. The direct material
action prepares one item for the existing stock input controls, without
applying it or modifying the imported save.

The producer-route workbench now additionally compares checklist
counts for its three independent scenarios (original, route edit,
route edit plus assumed acquisition), and identifies newly introduced,
removed and quantity/status-changed actions for each transition.
The workbench can export its final checklist as CSV; its existing
JSON export embeds all three complete checklists and their change
records. Invalid or changed workbench inputs cannot export a stale
checklist.

Missing research IDs in `discovered` are **not** interpreted as proof
of a locked recipe; unknown facility types and absent facility rosters
remain unverified. Users' local saves, starting inventory, rule data
and default routes are never changed by checklist viewing or export.

## Conservatively linked research and facility evidence (2026-11-18)

The single-goal producer-route workbench now includes a conservative
**연구·시설 조건 증거 비교** section below its material accounting.
Three independent plans (active, edited route, and route plus hypothetical
stock) show expanded recipe counts, explicitly required facility functions,
provided/pending/not-observed/unverified function evidence and research
IDs observed or absent from a locally selected save's `discovered` list.

The active recipe tree is traversed to identify exactly which explicitly
expanded recipes need which `requiresBaseFunc` entries. Facility status
is evaluated using the saved **single selected base**, completed
facility instances and the v.o2 catalog's `provideBaseFunc` declarations.
Under-construction facilities are pending. Unknown facility types,
an absent facility roster, the optional all-base stock union and missing
facility-index evidence remain **unverified**; the UI does not merge
facility capabilities across bases. A feature that is not observed in
an otherwise recognized completed-facility list is only **not observed**,
never definitive proof that a recipe is impossible to execute.

The research side shows direct recipe `requires` and
`unlockedByResearch` references alongside the planner's transitive
research closure. Each known ID is marked as observed/not observed in
the selected save's `discovered` list, or unverified without a save.
Unknown references and dependency cycles remain identified; the
UI does not interpret unknown AND/OR, special events or engine unlocks.

The workbench identifies introduced and eliminated recipe IDs,
recipe-scoped facility functions, direct research references and
transitive research IDs separately for route edits and subsequent
virtual material acquisitions. Its final-plan table and bounded
checklist enumerate concrete items to verify, and the workbench's
local JSON export preserves the full evidence rather than only the
first 100 displayed recipe rows or first 80 action rows.

The bounded procurement explorer also attaches independent research
and facility evidence to each successfully evaluated candidate,
displays a compact summary per candidate and includes it in JSON
exports. Hypothetical basket previews and saved A/B scenarios preserve
this evidence when available. An A/B comparison displays evidence
counts for each side but never labels either scenario manufacturing
ready. Explicit `provideBaseFunc` declarations can be either a
single string or an array, without treating a string as individual
characters. Saved game files and original inventory remain untouched.

## Integrated candidate procurement and producer-route workbench (2026-11-18)

Every successful bounded procurement candidate has a **작업대에서 경로 편집**
action. The independent workbench opens with that candidate's hypothetical
stock quantities and a copy of the current producer choices. Users may
select/deselect included materials, enter integer acquisition quantities,
and switch directly declared sub-manufacturing producer recipes or
external procurement. A change recalculates both the route-only plan
(unmodified stock) and route-plus-acquisition plan (stock copied with
hypothetical additions), without affecting the main calculator.

The workbench shows three columns: the original main plan, edited
producer routes without extra stock, and edited routes with hypothetical
acquisition. This separation prevents misattributing a route change
to a material purchase. Per-material shortage differences below the
summary compare only the last two columns. The available producer
selectors are discovered from the current and newly expanded recipe
trees; all entries are validated against the matching v.o2 producer list.

**재고 입력문 준비** copies validated target quantities into the bulk
stock editor only if it is empty; the game save is never modified.
**제조 경로만 본 계산기에 적용** is a separate explicit action that
updates only the main planner's producer-choice settings and reruns it.
**A에 저장** and **B에 저장** keep the hypothetical result available
for the existing A/B comparison. Different producer-choice baselines
cannot be compared as equivalent: when a saved workbench result uses
a different baseline, saving it clears the incompatible opposite slot.

The workbench JSON export contains route choices, acquired items,
three independent summaries, and before/after shortage deltas. Invalid
input disables stale exports and handoff buttons. All UI operations
are local browser computations; the ruleset, source indexes, user's
manual stock, and imported game save stay unchanged until the user
explicitly applies a main-planner setting or bulk stock input.

## Exploration candidate to stock-input handoff (2026-11-18)

Each successful single-goal exploration row now has two explicit handoff actions.
**재고 입력문 준비** converts its validated hypothetical acquisitions into
verified `STR_ID=total_on_hand` lines in the existing bulk stock editor.
The target quantity is current input stock plus the candidate acquisition,
not just the missing quantity. It refuses to overwrite existing unsaved
bulk-editor text. The user must separately click **여러 재고 적용**
before the calculator updates its input stock; the game save is never written.

**선택에 불러오기** restores the candidate's materials and exact
acquisition quantities to the existing checkbox/quantity controls.
This permits adjustments and an explicit new calculation. Since those
controls change, the previous bounded exploration result is invalidated
rather than retained as a stale, downloadable report. Stored A/B slots
remain separate until the underlying base plan is recalculated.

Both actions validate the current recipe, v.o2 source, verified item IDs,
missing quantities and the stock input caps before preparing any draft.
The original inventory and source save remain immutable during handoff.

## Bounded procurement-combination explorer (2026-11-18)

The **조달 조합 자동 탐색** action uses the current single recipe, stock,
research evidence, batch count, depth and explicit producer choices.
It enumerates the selected missing materials as individual baskets,
two-item baskets and an all-selected basket, then recalculates each
candidate independently using a copy of the current inventory.

The search is intentionally bounded to the six selected materials with
the largest explicitly entered hypothetical acquisition quantities.
This means at most **22 scenarios** (6 singles + 15 pairs + 1 all);
additional selected materials are reported as omitted, not silently
claimed to be evaluated. A failed candidate does not discard successful
results, and per-candidate errors are retained in the downloadable JSON.

The results table shows material assumptions, remaining external-shortage
kinds and units, reduction in missing units, reduction per hypothesized
acquired unit, declared manufacturing cost/work and rule-uncertainty
counts. The user may reorder without recalculating by shortage reduction,
per-acquisition-unit reduction, lowest remaining shortage, or least
hypothetical stock acquired. Each candidate can be saved directly into
the existing A/B slots for a detailed comparison. The entire bounded
exploration can be exported to a local JSON file.

Quantity counts combine different resource units only as a rough
descriptive heuristic. The rankings do **not** use verified market
pricing, travel/supply constraints, probability, game engine gates or
facilities, so they are not an optimum-purchase or feasible-production
recommendation. Neither the imported save nor the original input
inventory is modified, and editing a selected amount invalidates any
old exploration results to prevent stale exports.

## Partial acquisition quantities and A/B scenarios (2026-11-18)

The single-goal external materials table now has an editable **가정 확보 수량**
field for each catalogued missing material. It starts at the full
shortage (or the remaining stock input cap) and accepts only whole
numbers from 1 through the current shortage, subject to the
10,000,000-per-item stock limit. Selecting an item alone does not
assume that the entire missing quantity can be acquired; the
current amount in its field is what the simulation adds.

After choosing material checkboxes and quantities, **현재 확보량 A로 저장**
or **현재 확보량 B로 저장** computes an independent scenario for that
same goal. Edit amounts and save the other slot, then select **A/B 비교**
to inspect remaining shortage kinds/units, declared manufacturing
expense/work, rule flags and per-material differences between the
two scenarios. The compared quantities, independent assumptions and
their totals can be exported in a UTF-8 JSON report.

Changing the main recipe, depth, producer path, batches, stock or saved
research invalidates both stored A/B scenarios. Editing the draft
quantities does not overwrite a saved slot until the user explicitly
saves that slot again. The original inventory and imported game save
are not modified by saving or comparing scenarios. Missing market
availability, facility gates and uncertain research conditions are
not inferred from a reduction in material shortages.

## Selected multi-item acquisition basket (2026-11-18)

The **외부 조달·미해결 재료** table now offers a per-material
**일괄 선택** checkbox. The actions above the table can select every
catalogued, quantity-safe unresolved item or clear the selection. The
**선택 재료 일괄 확보 가정** action recalculates the same single manufacturing
goal with all selected missing quantities added to a **copy** of the
currently entered inventory. The result shows shortage kinds and units,
declared manufacturing cost/work, warning counts and every changed
external-material quantity. A JSON download preserves the selected
quantities and the before/after comparison; it does not upload game data.

**선택 수량 재고 입력란 준비** uses the same validated basket to populate
`STR_ID=target_quantity` lines in the existing bulk-stock editor. It
never applies them without a separate click on **여러 재고 적용**, and
refuses to replace preexisting unsaved text in that editor. Clearing the
selection or recalculating the main plan invalidates the previous basket
comparison. All actions are limited to catalogued v.o2 items and the
existing 10,000,000-per-item and 5,000-kind stock input caps.

Neither preview nor input preparation mutates the save, chooses a
manufacturing facility, guarantees market availability, or interprets
unverified research/event conditions. This is a multiple-material
scenario for **one selected recipe**, not a comparison across bases.

## Single-goal external procurement actions (2026-11-18)

The **외부 조달·미해결 재료** panel has two actions per eligible item.
**확보 시 변화** simulates adding only that item's currently unresolved
quantity to a fresh copy of the input inventory. It recalculates the
**same recipe, batches, depth, producer choices and discovered research**
and reports external item counts/units, declared manufacturing cost/work,
and per-item shortage changes. This preview neither edits the save nor
writes inventory back into the active planner, and resets whenever the
active plan is recalculated.

**재고 입력** fills the existing stock editor with the currently entered
quantity plus the unresolved quantity. It does **not** apply or assert
acquisition: the user must explicitly select **재고 추가/수정** to update
the planner's manual input. The original save always remains unchanged.
Rows outside the verified 2.1 item index or above the 10,000,000-item
input limit cannot use the actions.

The standalone **조달 목록 CSV 저장** button exports all current external
material rows, independent of the currently previewed hypothetical
scenario. CSV fields are quoted, spreadsheet formula prefixes escaped,
and UTF-8 BOM emitted for Korean spreadsheet compatibility. A failed
plan calculation disables downloads to avoid exporting stale results.
