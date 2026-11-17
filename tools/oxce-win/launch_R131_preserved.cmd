@echo off
setlocal
cd /d "%~dp0"
if not exist "openxcom_R131_INTEGRATED_TU_POW_AUTOALL.exe" (
  echo R131 executable missing from game directory.
  pause
  exit /b 2
)
rem Keep this wrapper alive until OpenXcom exits. Launch in the real user's
rem desktop session, with the game root as working directory.
"openxcom_R131_INTEGRATED_TU_POW_AUTOALL.exe"
set "exitcode=%ERRORLEVEL%"
if not "%exitcode%"=="0" (
  echo OpenXcom R131 exited with code %exitcode%.
  pause
)
exit /b %exitcode%
