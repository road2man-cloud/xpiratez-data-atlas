@echo off
setlocal
cd /d "%~dp0"
start "R36KP Texture Lab Server" /min node "%~dp0serve.cjs"
timeout /t 2 /nobreak >nul
start "" "http://127.0.0.1:9402/r36kp-texture-lab-20261127/index.html"
endlocal
