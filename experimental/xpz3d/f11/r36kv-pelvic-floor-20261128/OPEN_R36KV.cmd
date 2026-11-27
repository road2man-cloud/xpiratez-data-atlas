@echo off
setlocal
cd /d "%~dp0"
start "R36KV Viewer" /min node "%~dp0serve.cjs"
timeout /t 2 /nobreak >nul
start "" "http://127.0.0.1:9404/r36kv-pelvic-floor-20261128/preview/index.html"
endlocal
