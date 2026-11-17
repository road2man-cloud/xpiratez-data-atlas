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

### Optional assumptions

An unchecked option permits **no inference** when `producedItems` is absent.
Checking it permits a recipe with an ID identical to a known item ID to be
treated as producing **one item per execution**. Such branches are explicitly
flagged `assumed-yield` and are never presented as verified output.

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
