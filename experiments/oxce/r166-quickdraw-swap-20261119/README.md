# R166 Quickdraw Atomic Swap — 2026-11-19

R165 cumulative (R160B grenade/bandage, R163 air tile preview, R164B inventory UI, R165 WALK/FLY TU) plus a new independent improvement to InventoryState.cpp.

The R164B automatic quickdraw promotion could fail when all alternate inventory sections were occupied, even if the quickdraw magazine could physically be swapped with a useful weapon. R166 first attempts a direct **footprint-checked swap** between a lower-priority quickdraw item and a higher-priority item in another equipped section, preserving the same owner and physical items. Only when both final positions fit and do not overlap does it commit; otherwise restores both items to their exact previous slot and X/Y coordinates. Existing fallback relocation logic remains unchanged.

Priority: usable weapon (melee or loaded firearm with sufficient ammunition) > grenade/proxy > magazine > other. Never move an existing hand item or fixed item. In inventory preparation only.

Build output: `D:\daphne_auto\XPZ_R166_AUTOLOAD_QUICKDRAW_SWAP_20261119\build\openxcom_R166_ALLPATCH_QUICKDRAW_SWAP.exe` (27,484,747 bytes).
SHA256: `80EB21B23BAA787F7474DF207BB0244F98164E1CF7969741D218094242AD0BB3`.
Installed to game directory with `XPZ_R166_ALLPATCH_QUICKDRAW_START.cmd`.
Parent R165 SHA256: `7D345C2404931DD1E59A09A42541551814F8AD32A369CC43B5821E80FC7C9EE2`.
Archive members: 413, unchanged order; only `InventoryState.cpp.obj` changed. `Map.cpp.obj` retained exactly.
Compiled and linked successfully. **No real gameplay verification or claim of GUI behavior is made.** Existing EXE and saves untouched.
