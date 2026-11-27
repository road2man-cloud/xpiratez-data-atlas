# R36LM scene bundle loader

Pack an existing R36LL package: `python bundle.py ../r36ll/output/multi output/multi.xpzscene` (output must not exist). Build and run: `g++ -std=c++17 -Wall -Wextra -Werror -O2 smoke.cpp -o smoke && ./smoke output/multi.xpzscene`.

XPZSCN1 is a custom handoff format, not an S2 file. Little-endian header, deduplicated MMP data, then per-primitive mesh bytes and texture/alpha references. The packer verifies SHA256 of selected input payloads; the C++ reader validates structure, counts, indices, mip sizes and finite vertex coordinates. No cryptographic authentication of the bundle itself. No UV1, normal-map or PBR integration. The engine adapter copies the R36LL reference packed vectors directly into the observed 32-byte SVertex layout; exact engine rounding may differ. Real engine compilation, texture-provider integration, GPU resource creation and world placement are pending. Do not skin CPU-posed geometry again.

Three synthetic bundles produced and read successfully: multi (928 bytes, 2 textures, 4 primitives), helper75 (206 bytes, 1 texture, 1 primitive), hinge_half (310 bytes, 1 texture, 1 primitive). Not real F11 models.
