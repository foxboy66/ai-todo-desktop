@echo off
setlocal
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0product\启动 AI ToDo.ps1"
if errorlevel 1 pause