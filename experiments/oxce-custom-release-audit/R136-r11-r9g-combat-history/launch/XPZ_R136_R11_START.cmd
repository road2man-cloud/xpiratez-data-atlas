@echo off
setlocal
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0XPZ_R136_R11_START_RESUME.ps1"
set "RC=%ERRORLEVEL%"
if not "%RC%"=="0" (echo R136-R11 launch failed with code %RC%. See user\launch-diagnostics. & pause)
exit /b %RC%
