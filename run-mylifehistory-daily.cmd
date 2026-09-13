@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File ".\scripts\run-daily-finalize.ps1"
set "EXITCODE=%ERRORLEVEL%"
echo.
echo ============================================
echo  Exit code: %EXITCODE%
echo  Press any key to close this window...
echo ============================================
pause >nul
exit /b %EXITCODE%
