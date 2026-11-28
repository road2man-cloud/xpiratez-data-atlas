# V108 hero cumulative 43-route registered batch

Cumulative delta from 43a3e80f: 6931 -> 6974 registered routes, hero 145 -> 188. All 16 additional routes relative to the prior registered 27-route packet are independently replayed and attached. Last explicit focused closure run appended 10 routes, with six more already present in its input; those six are counted in the registered delta, not attributed to that last invocation. New routes represent RED_TRAINING research progress, not completed ascension. Preserve GREEN/GOLD staged research for resumption. No final-admission or live-site count is claimed.

Restore at the exact baseRef in an isolated checkout:

```sh
node tools/join-career-batch-chunks.mjs docs/career-batches/v108-hero-43-registered v108-hero-43-restored.json.gz
node --max-old-space-size=12288 tools/career-batch-transport.mjs apply v108-hero-43-restored.json.gz
```

This cumulative packet supersedes the 27-route packet for exact-base restoration. Merge through the compatible append-only workflow rather than applying to a newer main. Campaign-start chronological certification and final-admission recalculation remain pending. Append-audit optimization was disabled because the registered DB differed from the original base; 16 new witness replays succeeded.
