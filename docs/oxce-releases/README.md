# Custom OXCE R131–R135 cumulative release policy

Tracked by [issue #64](https://github.com/road2man-cloud/xpiratez-data-atlas/issues/64).

## What was actually found on the game PC (2026-11-17 Korea time)
Installed game root: `C:\Dioxine_XPiratez_o2.1\Dioxine_XPiratez`.

The installation contains, among others:
- `openxcom_R131_INTEGRATED_TU_POW_AUTOALL.exe` (27,180,867 bytes)
- `openxcom_R132_R131_FEATURES_PRESERVED.exe` (27,190,392 bytes)
- `openxcom_R134_AUTOALL_MED_OFFHAND_WEAR.exe` (27,218,546 bytes)

**These files were located, not execution-tested.** Sizes come from the remote directory inventory. File SHA-256 has not been captured: the remote PowerShell sessions returned empty output even for a trivial `Write-Output` command. None of the binaries is a verified source baseline; R131 is only the user's preferred candidate.

## Stop-loss / integration rule
1. Do not change or delete the installed game files as part of source discovery.
2. Locate and archive original *custom OXCE native C++ source* and old patches. Never use data-atlas's `experiments/xpiratez3d` source as a substitute for that custom 2D OXCE build.
3. Inventory the ancestor chain for R131/R132/R134, fingerprint binary artifacts and source commits, and create a per-feature source-symbol and test evidence ledger.
4. Audit R131 against all prior features (R114–R130 included). An observed R131 slowdown or missing feature is a **fail**, not a preserved behavior.
5. Merge improvements cumulatively; preserve all earlier controls, HUD, movement, and inventory behavior. No whole-file overwrite from feature branches.
6. R135 must have a release manifest containing a real source repo/commit, matching toolchain, binary SHA-256, actual compile result, runtime result, and **all 15** feature tests with source locations. See `tools/oxce-release-gate.mjs`.
7. A FAIL or UNVERIFIED feature forbids calling an EXE R135 accepted. A separate pre-release binary can still be built for debugging, clearly marked unverified.
8. The release gate checks *presence/consistency of supplied evidence*, not whether a human-supplied claim is truthful. Review source evidence and actual game behavior independently.

## Running the gate
```powershell
node tools/oxce-release-gate.mjs docs/oxce-releases/release-R135.json --exe 'C:\path\to\openxcom_R135.exe'
node --test tools/oxce-release-gate.test.mjs
```

Do not create a passing manifest by filling placeholders with `PASS`. Only evidence from a real tested build is acceptable.

## Pending / unavailable
- Location of canonical custom OXCE R131–R134 C++ source: UNKNOWN.
- SHA-256 hashes and common Git ancestry: UNKNOWN.
- Source-level audit of R131: NOT DONE.
- Repair of R134 regression and R135 MSVC build: NOT DONE.
- Game runtime acceptance testing: NOT DONE.

The CI test suite verifies that the release *gate* fails closed on missing evidence. It does **not** certify R131, R134, or R135.
