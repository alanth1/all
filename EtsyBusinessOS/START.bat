@echo off
setlocal
title Etsy Business OS
cd /d "%~dp0"

echo ==================================================
echo   ETSY BUSINESS OS - starting...
echo ==================================================

if not exist "runtime\.ready" (
  echo First start: preparing private Python and libraries.
  echo This needs internet and takes about 3-10 minutes. Please wait.
  powershell -NoProfile -ExecutionPolicy Bypass -File "bootstrap\setup.ps1"
  if errorlevel 1 (
    echo.
    echo [ERROR] Setup failed. See logs\setup.log and send it for support.
    pause
    exit /b 1
  )
)

rem Re-install libraries when requirements.txt changed (new version zip)
fc /b "requirements.txt" "runtime\requirements.installed" >nul 2>&1
if errorlevel 1 (
  echo Updating libraries for the new version...
  powershell -NoProfile -ExecutionPolicy Bypass -File "bootstrap\setup.ps1" -OnlyRequirements
  if errorlevel 1 (
    echo [ERROR] Library update failed. See logs\setup.log
    pause
    exit /b 1
  )
)

where ollama >nul 2>&1
if errorlevel 1 (
  if not exist "%LOCALAPPDATA%\Programs\Ollama\ollama.exe" (
    echo.
    echo [INFO] Ollama is not installed. AI features will run in DEMO mode.
    echo        Install it from https://ollama.com/download then restart.
    echo.
  )
)

echo Opening http://127.0.0.1:8765 in your browser...
"runtime\python\python.exe" -m app
if errorlevel 1 (
  echo.
  echo [ERROR] The application stopped with an error. See logs\app.log
  pause
)
endlocal
