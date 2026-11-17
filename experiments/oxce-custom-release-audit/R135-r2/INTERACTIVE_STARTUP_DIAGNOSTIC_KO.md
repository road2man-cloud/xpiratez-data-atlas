# Windows interactive startup smoke — 2026-11-17 KST

**Purpose:** Investigate user's report that previously working R131/R132/R134 executables were showing as "Suspended" or remaining as invisible processes after an earlier R135 test build hung.

## Investigation and safe remediation

- Windows actual desktop user: `DESKTOP-HDMLU0F\road4`, console session **1**.
- Remote Thin MCP/PowerShell agent: `DESKTOP-HDMLU0F\daphne_mcp`, service session **0**.
- Session 0 `Get-Process.MainWindowHandle` showing `0` for a session 1 process is **not reliable evidence** of an invisible/suspended window; cross-session desktop enumeration is isolated. Never call it a failed game launch based solely on this field.
- Earlier R135 `openxcom_R135_UNVERIFIED_LOW_TU_CANDIDATE.exe` test stalled; four known instances were terminated by exact matching name/path, leaving no instances of that EXE. No EXE binary or save was deleted.
- Native PE64 installed R131/R132/R134 SHA-256 remained unchanged in the live game directory.
- Windows Application event and Defender logs contained no relevant new block for the tested executables; no current memory shortage.
- The game's `openxcom.log` showed `Data loaded successfully.`, `Language loaded successfully.`, `OpenXcom started successfully!` for R131.

## Verified **within session 1** (not session 0)

A temporary Scheduled Task `InteractiveToken` probe was executed as `road4` with the game's correct root as working directory, and the diagnostic itself sampled `MainWindowHandle` + `Responding` **inside** session 1 once per second for 12 seconds:

| EXE | User-session GUI window visible, responsive samples | Result |
| --- | ---: | --- |
| `openxcom_R131_INTEGRATED_TU_POW_AUTOALL.exe` | 12 / 12 | PASS, 12-second window responsiveness smoke |
| `openxcom_R132_R131_FEATURES_PRESERVED.exe` | 12 / 12 | PASS, 12-second window responsiveness smoke |
| `openxcom_R134_AUTOALL_MED_OFFHAND_WEAR.exe` | 12 / 12 | PASS, 12-second window responsiveness smoke |

Test-only R132 and R134 PIDs were terminated by exact name and PID from the same diagnostic after measurements. Temporary diagnostic scheduled tasks were removed. Diagnostic scripts/results are held locally under:
`D:\daphne_auto\oxce-r135-ammo-whip-backspace-20261117\diagnose-r131-visible.json`
`D:\daphne_auto\oxce-r135-ammo-whip-backspace-20261117\diagnose-r132-r134-interactive.json`.

Independent user-launched R131 processes were observed later and were **not touched**.

## Reversible launcher workaround

Created, without replacing original game binaries:
`C:\Dioxine_XPiratez_o2.1\Dioxine_XPiratez\launch_R131_preserved.cmd`

Created Windows shortcut under `C:\Users\road4\Desktop`: `XPZ R131 - 안정 실행.lnk`

The launcher sets its working directory to the real game folder and runs the existing R131 EXE synchronously. Source copy: `tools/oxce-win/launch_R131_preserved.cmd`.

**Limits:** This verifies legacy Windows GUI startup for twelve seconds in the actual user session. It does *not* certify all subsequent user-play scenarios, explain precisely why user's earlier direct launch was marked "Suspended", or certify the separate R135-r2 game. Do not alter Defender protections, video drivers, GPU settings, user options, or saved campaigns without reproducing a specific cause.

## Unfinished native work

R135-r2 C++ four-file compilation and PE64 linker succeeded; archive retained 413 original members; static source regression tests 9 / 9 passed. R135-r2 runtime (gameplay, auto equipment, Backspace route) **NOT YET EXECUTED**. Do not install or publish as production.

Tracking: PR #66 and issue #64.
