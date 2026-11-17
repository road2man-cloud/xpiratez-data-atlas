@echo off
setlocal
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0XPZ_R135_R9E_START_RESUME.ps1"
set "RC=%ERRORLEVEL%"
if not "%RC%"=="0" (echo R9E launch failed with code %RC%. See user\launch-diagnostics. & pause)
exit /b %RC%
