# V104 medal-free integrated final careers

Exact base: 1d1ad60d5ec2ac34fc754d0184611edc3a99f6ca.
80 imported routes after deduplication; total 6024 routes, 8458 states, 3733 research-line combinations, 87 unique final combinations and 119 final witnesses. Six additional finals: three Weirdgals, three Cat Warriors. Policy: CAREER_COMPARISON_NO_COMMENDATION_BONUS_V1. No rejected stat projections.

Restore only in an isolated checkout of this branch:

```sh
node tools/join-career-batch-chunks.mjs docs/career-batches/v104-20261128-medalfree-87-final career-batch.json.gz
node --max-old-space-size=12288 tools/career-batch-transport.mjs apply career-batch.json.gz
```

The transport verifies base and target JSON hashes. Main has advanced since this baseline; use the current append-only merger and rebuild admission before publishing. Do not apply the old DB directly over current main. Restore utility end-to-end execution not performed in this session.
