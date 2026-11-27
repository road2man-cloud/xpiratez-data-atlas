@echo off
setlocal
cd /d "%~dp0"
start "R36KX Viewer" /min node "%~dp0serve.cjs"
timeout /t 2 /nobreak >nul
start "" "http://127.0.0.1:9406/r36kx-floor-regularize-20261128/preview/index.html"
endlocal
