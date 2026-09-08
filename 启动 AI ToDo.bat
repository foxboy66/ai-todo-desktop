@echo off
setlocal
cd /d "%~dp0"
wscript.exe "%~dp0scripts\launch\launch-ai-todo.vbs"
if errorlevel 1 pause
