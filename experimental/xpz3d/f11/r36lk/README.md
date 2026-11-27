# R36LK native MMP material production

Run: `python -m pip install numpy Pillow`, then `python produce.py output_new`.
For a real packet: `python material_stage.py input.xpzp native_out`.
Build standalone reader: `g++ -std=c++17 -Wall -Wextra -Werror -O2 mmp_smoke.cpp -o mmp_smoke`.
Read: `./mmp_smoke output/native/materials/0/base.mmp`.

Source reference: met-nikita/Silent-Storm-Reconstruction at f5b5b620d4b251d7548b36134ae16d3abe4457e5, Main/mmpFormat.h, GPixelFormat.h, GTexture.cpp, GfxBuffers.h, GMaterial.h/cpp. Native MMP header 24 bytes, signature 0x00504D4D, format 6, BGRA8. The mip chain stops at the first axis of length one to avoid the engine loader's unclamped shifts. Base color is converted in linear space, alpha is ignored before filtering for opaque materials. Original PNGs and PBR/normal metadata are retained; no PBR-to-bump equivalence is assumed. No NPOT resizing. Unsupported sampler/UV/alpha semantics are explicitly recorded.

The independent producer and C++ reader ran in the GPT container on synthetic textures; four MMPs (604 bytes total), two PNGs, four primitive bindings, and truncated-file rejection. `engine_texture.h` targets actual MakeTexture, CTextureLock, and CreateMaterial APIs; it has NOT been compiled against the engine or run on a GPU. It returns a fresh texture, not an NDb record; the caller still needs to supply a texture provider, retain ownership, and attach material to geometry. Actual F11 GLB/packet not available in this container. No game deployment or normal map rendering claimed. Keep R36LD/LE/LF unchanged.
