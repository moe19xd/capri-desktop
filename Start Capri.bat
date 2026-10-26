@echo off
rem Starts Capri from this folder, with no terminal left open.
cd /d "%~dp0"
if not exist node_modules\electron (
  echo Capri isn't installed yet: run "Install Capri.bat" first.
  pause
  exit /b 1
)
start "" "%~dp0node_modules\electron\dist\electron.exe" .
