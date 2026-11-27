# V100 recruitment donor-window production

Parallel worker; based on main 8429c261edd02a6454d414e2b751cdbfa925a88f. V99 and all old fingerprint inputs remain unmodified except the publication wrapper and attachment schema mapping, which are not in the producer fingerprint list.

## Production changes
- Retire exhausted origin/donor attempts before the 8/24 donor window, so lower-ranked viable donors can become available in the next batch. Partial research with a retained stage remains eligible under the existing retry rules.
- Resolve stored attempt variants by maximum variant, keeping success sticky; cache branch eligibility and pair identifiers; select the best runnable job in one scan rather than sorting all jobs on each attempt. Deterministic donor-ID tie-break may change exploration order.
- No admission rule, research gate, material assumption, stat replay, or terminal closure predicate is changed. This is a scheduling improvement, not a proof of reachability or of all donors exhausted. Deferred donors remain available next run.

## Resume and publish
The V100 producer migrates the V105 checkpoint only after verifying its original fingerprint; new source list includes the new queue helper. The attachment maps the V106_DONOR_WINDOW schema to the new producer. Run `node tools/test-recruitment-pair-queue.mjs` and then `node tools/produce-atlas-research-tree.mjs --seconds=60 --extension-scope=pair --extension-origins=<known origin IDs> --extension-goals=<known research IDs>` in an isolated worktree of this branch. Use existing V99 options for ordinary runs; the focused extension is optional. Do not publish a V106 ledger to a V99-only checkout. Merge with other workers only after compatible source/schema adoption and replay.

No new gameplay witnesses are claimed until a full production run and attachment succeed.
