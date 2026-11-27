@echo off
setlocal
cd /d "%~dp0"
start "R36KW Designed Skin" /min node "%~dp0serve.cjs"
timeout /t 2 /nobreak >nul
start "" "http://127.0.0.1:9405/r36kw-designed-skin-20261128/preview/index.html"
endlocal
