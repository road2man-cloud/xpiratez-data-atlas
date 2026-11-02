// Compatibility entrypoint: the public Soldier DB is 2.1-only.
// The retired 1.1.1 browser table has intentionally been removed.
await import("./check-soldier-modern-browser.mjs");
