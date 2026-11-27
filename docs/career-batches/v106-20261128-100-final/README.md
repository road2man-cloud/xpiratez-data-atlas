# V106 career batch

61 imported routes; 100 final combinations in isolated snapshot. Counts are not live site totals.

Restore only against the exact baseRef, in an isolated checkout. Do not apply this transport patch directly on a newer main.

```sh
node tools/test-join-career-batch-chunks.mjs
node tools/join-career-batch-chunks.mjs docs/career-batches/v106-20261128-100-final v106-restored.json.gz
node --max-old-space-size=12288 tools/career-batch-transport.mjs check v106-restored.json.gz
node --max-old-space-size=12288 tools/career-batch-transport.mjs apply v106-restored.json.gz
```

After restoration, commit the four recovered files in the isolated checkout and use the current append-only merger with the latest main, then regenerate indexes and final classifications. The transport patch is not a merge. The joiner accepts canonical gitBlobSha and legacy sha fields, rejects conflicts, and verifies chunk order, lengths and hashes before creating a non-existing output file.
