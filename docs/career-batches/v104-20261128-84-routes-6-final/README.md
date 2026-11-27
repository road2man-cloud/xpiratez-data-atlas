# V104 focused production batch

Base: 8484e3b90108980eb67ee8c5d62fcaa456fa7e0b. 84 independently replayed route additions; 6 newly admitted final combinations (3 Weirdgals, 3 Cat Warriors), 75 -> 81, under the historical comparison policy.

Reconstruct in an isolated checkout of this branch:

```sh
node tools/join-career-batch-chunks.mjs docs/career-batches/v104-20261128-84-routes-6-final career-batch.json.gz
node --max-old-space-size=12288 tools/career-batch-transport.mjs apply career-batch.json.gz
```

The apply command checks exact base JSON hashes and target hashes. Do not apply to changed main. To integrate with current main, restore in isolation, use the existing append-only career merge workflow, and rebuild the shared registry and final classification under the medal-free comparison policy. The older final counts are not certification under the new policy. No additional game execution is claimed.
