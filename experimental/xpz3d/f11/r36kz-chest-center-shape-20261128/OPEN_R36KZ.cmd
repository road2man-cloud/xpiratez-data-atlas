@echo off
setlocal
cd /d "%~dp0"
start "R36KZ Viewer" /min node "%~dp0serve.cjs"
timeout /t 2 /nobreak >nul
start "" "http://127.0.0.1:9408/r36kz-chest-center-shape-20261128/preview/index.html"
endlocal
