# XPZ3D F11 — Append-only revision ledger

This directory is the GitHub-backed handoff point for F11 skin/mesh work. Never silently promote a QA model to a user's approved trim model.

## Immutable user intent

- Source: `r21AO-F11-skin-separated-rev92-base.glb`
- User's manually sculpted controls: 106
- User's 2026-11-16 15:28 deletion selection: **101 original triangle IDs**
- Expected trimmed base count: 3,546 triangles (= 3,647 - 101)
- Rig: 63 bones
- Garment: 370 separate triangles
- Deleted faces MUST remain deleted; central anatomical opening MUST NOT be reconstructed merely to reach 3,647 faces.

## Actual state at 2026-11-17

1. The exact 15:28 deletion JSON with 101 entries was **not found** in the inspected remote working files. Do not claim it has been recovered or generate a fake deletion list.
2. The local rev95 QA snapshot (`rev95-multiface-settings-qa.json`) has 106 controls and 754 position edits, but **one TEST deletion**, not the user 101-face selection.
3. The interim reconstructed sculpt-only base has 3,647 triangles and **zero deletions**; it reintroduces previously removed strings/webs. **Not approved**.
4. Experimental cross-primitive bridge r3 results: minimal +8 faces (3,655 total); smooth +28 (3,675 total), both built on the interim sculpt-only base. 63 bones and 370 garment faces preserved. Both are **non-final experiments**.
5. The r5 review overlays new bridge triangles red. The historical lateral flares/string-like geometry remain. Screenshots do **not** prove repair of the user trim.
6. GitHub history begins here. Local artifacts remain under `D:\daphne_auto\F11-r21AO-rev96-trim-seam-20261117-gpt6` and local review HTML under `D:\daphne_auto\F11_Web_Review_ghpages_20261105\f11\r21al`.

## Commit discipline

- Work on `xpz3d/f11-rev96-history-20261117`, not main. Do not stage unrelated work in `D:\xpiratez-data-atlas`.
- Preserve the user snapshot as the canonical source of deletions once recovered. Save source and SHA-256, `deletedFaces` list, control count, vertex edits, and baseline GLB hash.
- Record each revision as new files, with `sourceSha256`, `snapshotSha256`, source code, output file SHA-256, face counts, 63 bones / 370 garment evidence, screenshots and explicit QA status.
- Distinguish: `experiment`, `trim-recovered`, `candidate`, and `user-approved`. Only promote after the 101 deletion IDs are applied and checked.
- Preserve rev92–rev95 source builds and images. Never auto-restore closed loops, and never overwrite the user's manual edits.
- Large GLBs and image captures should be committed through Git LFS or a GitHub release artifact after independent checksum checking; this GitHub text ledger provides their exact local names/hashes until archived.

## Next action

Locate the exact user-generated JSON (possibly in browser downloads, localStorage/export history, or chat attachment); verify 101 unique deleted face keys and the matching 3,647-triangle source. Run trim and only then seal selected remaining skin boundaries. Never use the interim zero-delete base as a final input.
