@echo off
rem Starts Capri from this folder, with no terminal left open.
cd /d "%~dp0"
if not exist node_modules\electron (
  echo Capri isn't installed yet: run "Install Capri.bat" first.
  pause
  exit /b 1
)
rem Electron's own download can fail during npm install (antivirus, a dropped connection): fetch it again
if not exist node_modules\electron\dist\electron.exe (
  echo Fetching Electron, the engine that runs her ^(once^)...
  call node node_modules\electron\install.js
  if not exist node_modules\electron\dist\electron.exe (
    echo.
    echo   Couldn't fetch Electron. Check your internet connection, or your antivirus
    echo   ^(it sometimes blocks electron.exe^), then try again.
    pause
    exit /b 1
  )
)
start "" "%~dp0node_modules\electron\dist\electron.exe" .
