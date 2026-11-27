@echo off
setlocal
cd /d "%~dp0"
start "R36LA Surface Flow" /min node "%~dp0serve.cjs"
timeout /t 2 /nobreak >nul
start "" "http://127.0.0.1:9409/r36la-surface-flow-20261128/preview/index.html"
endlocal
