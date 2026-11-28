# R138H native Silent Storm S2 character gallery

Real R36MK 2100-triangle, 63-bone GLB, with corrected hair atlas, was actually rendered in the native Silent Storm S2 engine via Nival IGScene CreateMesh. The Windows Session 1 executable produced the trace `R138G_NATIVE_S2_PALETTE_ATTACHED groups=24 tris=2100` and a real 656x519 desktop-window capture.

R138G before: green source hair atlas mean RGB (44,84,17); R138H correction: chestnut RGB (136,92,62), retaining original strand intensity. Output GLB SHA256: `9b8e98cc88ee4cd78ec1394674c8fdd96efaad4d362b1588a9c4ba8bf11ef524`. The new 24-group XPZC geometry/flat-color packet SHA256: `cef088fa3a8e81a3722f1a0988df5158c8a5c216c310674e420ee9b4f2cc344f`. Actual S2 window PNG SHA256: `3a0566a50c0509d4dd2714a1a733d7b7acb33dc60ba8e5e3c8268338451fb2a4`.

Source generated locally with Node.js; no imitation renderer. The S2 Win32 binary is separately compiled and not redistributed. The current render is static, color-binned (24 mesh groups); not a full UV texture or normal-map GPU material. The R138F and R138G binaries are preserved. Development assets exist under `D:\daphne_auto\_xpz3d_launch_integration_20261117\r138e-s2-character` and `r138g-s2-palette`.
