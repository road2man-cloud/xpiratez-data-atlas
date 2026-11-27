# V108 hero 27-route registered batch

Cumulative delta from 43a3e80f: 6931 -> 6958 registered routes; hero 145 -> 172. This session: one research-first recruitment graph (STR_HERO_RED_TRAINING) and 18 followups; 19 independent replays. Prior eight routes retained. Final admission not recalculated; not a live-site update.

Restore in an isolated checkout at the exact baseRef, with the transport tools and package present:

```sh
node tools/join-career-batch-chunks.mjs docs/career-batches/v108-hero-27-registered v108-hero-27-restored.json.gz
node --max-old-space-size=12288 tools/career-batch-transport.mjs apply v108-hero-27-restored.json.gz
```

This supersedes earlier 8-route packets for exact-base restoration. Never apply directly on newer main. Merge via the compatible append-only workflow and recalculate final admission. Attach succeeded with 19 new replays; append audit optimization was disabled because the already registered input differed from the original base DB.
