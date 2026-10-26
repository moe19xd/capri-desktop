@echo off
setlocal
title Capri - install
cd /d "%~dp0"

echo.
echo   ==============================
echo     Capri - one-click install
echo   ==============================
echo.

rem 1. Node.js (what runs her), installed with winget if it isn't there
where node >nul 2>nul
if errorlevel 1 (
  echo [1/3] Node.js is missing: installing it with winget...
  winget install --id OpenJS.NodeJS.LTS --exact --silent --accept-source-agreements --accept-package-agreements
  if errorlevel 1 (
    echo.
    echo   Could not install Node.js by itself.
    echo   Install it from https://nodejs.org ^(the LTS button^), then run this file again.
    pause
    exit /b 1
  )
  rem the new install isn't on this window's PATH yet
  set "PATH=%PATH%;%ProgramFiles%\nodejs"
) else (
  echo [1/3] Node.js found.
)

rem 2. Her pieces (Electron, her voice engines)
echo [2/3] Downloading her pieces ^(a few minutes the first time^)...
call npm install --no-audit --no-fund
if errorlevel 1 (
  echo.
  echo   npm install failed. Check your internet connection and run this file again.
  pause
  exit /b 1
)

rem Electron's own download can fail silently inside npm install: make sure it's really there
if not exist node_modules\electron\dist\electron.exe (
  echo       Electron didn't come down with the rest: fetching it again...
  call node node_modules\electron\install.js
  if not exist node_modules\electron\dist\electron.exe (
    echo.
    echo   Couldn't fetch Electron. Check your internet connection, or your antivirus
    echo   ^(it sometimes blocks electron.exe^), then run this file again.
    pause
    exit /b 1
  )
)

rem 3. A desktop shortcut that starts her
echo [3/3] Adding a "Capri" shortcut on your desktop...
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$s = (New-Object -ComObject WScript.Shell).CreateShortcut([Environment]::GetFolderPath('Desktop') + '\Capri.lnk');" ^
  "$s.TargetPath = '%~dp0Start Capri.bat'; $s.WorkingDirectory = '%~dp0'; $s.WindowStyle = 7;" ^
  "$s.IconLocation = '%~dp0assets\icons\capri.ico'; $s.Save()"

echo.
echo   Done! Starting Capri...
echo   Next time, just double-click "Capri" on your desktop.
echo   Then right-click her ^> Voice ^> Listen to me, to talk to her.
echo.
start "" "%~dp0Start Capri.bat"
timeout /t 8 >nul
