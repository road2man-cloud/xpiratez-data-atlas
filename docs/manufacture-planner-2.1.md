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
- Enter stock for up to 400 verified v.o2 item IDs using search, row editing or bulk `STR_ID=quantity` input. Starting inventory is decremented before additional production.
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

The planner now accepts explicit, user-entered holdings of up to 400 verified
v.o2 item IDs. Enter entries by searching, changing the amount inline, deleting
individual rows, or by pasting lines such as `STR_CHEMICALS=12`. Inventory is
not read from a save file and stays only in the currently open page.

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
