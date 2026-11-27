# R36LJ native mesh bridge

Reconstructed missing native bridge as a new revision; not a byte-for-byte R36LI recovery. Keep R36LD/LE/LF models unchanged. Dependency: ../r36lh/xpz_packet.hpp (Git blob 569009daa2aab39eb448f920547ee71957b19063).

Portable build: `g++ -std=c++17 -Wall -Wextra -Werror -O2 smoke.cpp -o smoke && ./smoke synthetic.obj`.

Real engine: add engine_smoke.cpp to an isolated engine target, add Main to include paths and use C++17 with the existing StdAfx configuration. The exported XPZLJ_AssignPacket function takes a fresh CObjectInfo, packet path, node, primitive, animation clip (-1 for rest), seconds, explicit z-up switch and positive scale. Call separately for each primitive; material ID is retained in Mesh but engine resource binding is not implemented. Do not attach CPU-posed geometry to another skin. On failure discard the fresh object; keep the currently published resource untouched. Use engine-native CalcCompactVector and AssignFast, not guessed binary packing.

Engine interface inspected at met-nikita/Silent-Storm-Reconstruction f5b5b620d4b251d7548b36134ae16d3abe4457e5: Main/GGeometry.h, Main/GGeometry.cpp, Main/GPixelFormat.h. The engine translation unit has NOT been compiled or linked. UV0 required; UV range conservative for signed 16-bit quantization; UV1 and authored normal/tangent preservation not implemented. Recomputed basis can differ from the source normal map. No GPU material, texture, world entity, or real-time game integration claimed.

Local production: g++ 14.2.0 portable smoke passed: 4 vertices, 2 triangles, 3 polygon offsets, mirrored UV, degenerate/UV fallback, and three invalid-input rejections. Synthetic OBJ produced. Actual F11 packet and real engine runtime not tested.
