# X-Piratez 3D — Experimental native Linux program

This directory belongs to the **existing X-Piratez Data Atlas**. It is not a second, competing ruleset.

**Canonical data:** `../../public/reference/items.json`, X-Piratez v.o2 / 2.1, OXCE 8.7.1, Git blob `75e96cc753f78dbd51a813a0bccdf38dedac6486`. Source revision pin and validation claims: [Experiment 04](../../docs/xpiratez-3d/EXPERIMENT_04_LINUX.md).

## Currently committed here

- `tools/export_2_1_declarations.py`: pins and validates the 2.1 Atlas JSON source (exact-file Git blob SHA1, or exact 9-row fixture SHA256), exports nine direct item fields as a TSV. This cannot produce actual effective combat values.
- `tools/test_reference_import.py`: regression tests with invalid versions, records and fake metadata; changes to the fixture are rejected by its exact SHA256.
- `testdata/atlas_2_1_direct_excerpt.json`: 9 actual direct declarations *excerpted from* the existing Atlas, **not a replacement canonical database**.

The **full** independently written native C++ test program for Experiments 01–04 remains in the ChatGPT delivery ZIP (`X-Piratez-3D-Linux-Experiments-01-to-04.zip`, SHA256 `fcd99e04dc86c375d0378b4b47453a36841a9afb6b2af8b8199025e1c9d82808`). This GitHub directory does **not yet** contain that full native code. Do not claim it can build or run the engine from this directory alone.

## Reusing the repository's original indexed fields

From a checkout of the entire **existing** repository, the Python-only converter can be executed without third-party dependencies:

```sh
python3 experiments/xpiratez3d/tools/export_2_1_declarations.py \
  --source public/reference/items.json \
  --output /tmp/xpiratez3d-direct-declarations.tsv
python3 experiments/xpiratez3d/tools/test_reference_import.py
```

The result is a **direct declaration reference**, not a game-resolved weapon/ammo stats file. Unknown direct power (including the Minigun / Assault Cannon fixture records) is written as `UNKNOWN`, never zero.

For full native build instructions and explicit non-verified portions, consult [Experiment 04](../../docs/xpiratez-3d/EXPERIMENT_04_LINUX.md). [Issue #49](../../issues/49) is the active first runnable tactical chamber gate.

## Safety of the existing site

The new files live only in `experiments/` and `docs/` and do not replace the existing website's public data or build commands. **The website's complete CI test suite was not run from this tool environment**; native prototype tests are reported separately.
