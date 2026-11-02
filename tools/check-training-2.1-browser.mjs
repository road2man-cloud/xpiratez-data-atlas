// Compatibility CI entrypoint. Training is no longer a separate public DB.
// The canonical browser suite checks retired deep links, read-only training
// evidence inside Soldier DB, and absence of every local-save input.
await import('./check-soldier-modern-browser.mjs');
