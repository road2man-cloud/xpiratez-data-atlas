# V108 hero production

Eight new hero routes, 6931 -> 6939 total, 145 -> 153 hero. V114 migration included. No final admission claimed. Restore in an isolated checkout of the exact baseRef in the receipt using `node --max-old-space-size=12288 tools/career-batch-transport.mjs apply docs/career-batches/v108-hero-8-routes.json.gz`. Commit recovered ledger, then merge against current main using compatible append-only merger and independently attach/replay. Do not apply patch directly on newer main. Supply evidence preserved, no new supply proof.
