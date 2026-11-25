# R135 source-only low-TU restoration: native compile and link receipt

Date: 2026-11-17 (Asia/Seoul)

This is a **TEST-ONLY** build. R131 full-function census and actual gameplay runtime have **not** passed.

## Verified local evidence

Local source stage: `D:\daphne_auto\oxce-r135-source-audit-20261117`

- `InventoryState.cpp` restores R131 low-TU button width 40 (was 19) and label `저TU` (was `低`), using the R134 integration source as base.
- Source file (local) SHA-256: `5CE28B57E5834D24B8B2F881F1E5D10380F2FBC175E513A011E00836850740E3`; 140,140 bytes.
- MinGW-w64 GCC 14.3 GNU++17 compilation **passed** for `InventoryState.cpp`.
- Generated object: `InventoryState.r135.obj`, 477,666 bytes, SHA-256 `18AEBAB910115AB93ED7409A240546661705467A65B2759E1867F71199B07843`.
- Original unmodified R134 object archive cloned into isolated R135 candidate archive.
- Original R134 archive: 413 members; candidate archive: 413 members. No member names missing or added.
- Standalone PE64 linker step **passed**; resulting file is PEI x86-64, not Win32 x86.
- Result: `D:\daphne_auto\oxce-r135-source-audit-20261117\openxcom_R135_UNVERIFIED_LOW_TU_CANDIDATE.exe`
- Bytes: **27,218,546**
- SHA-256: `7A114ED02075A6C3F86960C079FC1ECB9CFEDA51120AA8F2B090E962BE2A8C56`
- Original installed R134 binary remains SHA-256 `638D4F172D392A51F1B01EF1ABA3C239D93C91943ABE9DB94485A41846011416`.

## First failure and correction

Initial archive creation inserted `InventoryState.r135.obj` under a **different archive member name**, accidentally increasing the archive from 413 to 414 members. This candidate was REJECTED before linking. A fresh second archive was created, replacing the original member by its matching name `InventoryState.cpp.obj`; strict 413-member and full-name-set verification passed before linking.

The first compile attempt also surfaced PowerShell native stderr being treated as terminating errors. A local isolated compilation script was corrected; the subsequent compile passed.

## Outstanding acceptance gates

- Gameplay UI startup; Korean text rendering, clickable low-TU semantics, no button overlap: UNVERIFIED.
- All R131 regressions and R132–R134 functional audit on representative save: UNVERIFIED.
- Large squad 3–4-minute AutoAll regression improvement: UNVERIFIED.
- Canonical complete custom OXCE C++ source repository and incremental releases: source exists on Windows but not yet imported as whole history.
- No R135 production release may be issued from this receipt.

Local build scripts:
- `D:\daphne_auto\oxce-r135-source-audit-20261117\compile_r135_inventory.ps1`
- `D:\daphne_auto\oxce-r135-source-audit-20261117\link_r135_candidate.ps1`

Source/reference: [issue #64](https://github.com/road2man-cloud/xpiratez-data-atlas/issues/64).
