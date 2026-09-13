@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File ".\scripts\new-raw-note.ps1"
set "EXITCODE=%ERRORLEVEL%"
if not "%EXITCODE%"=="0" (
    echo.
    echo Exit code: %EXITCODE%
    echo Press any key to close this window...
    pause >nul
)
exit /b %EXITCODE%
