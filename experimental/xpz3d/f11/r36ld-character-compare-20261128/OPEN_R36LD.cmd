@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
 echo Node.js is required to open the R36LD comparison dashboard.
 pause
 exit /b 1
)
start "" "http://127.0.0.1:9406/experimental/xpz3d/f11/r36ld-character-compare-20261128/preview/index.html"
node serve.cjs
pause
