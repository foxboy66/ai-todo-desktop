@echo off
setlocal
cd /d "%~dp0"
if exist "%~dp0product\.env" (
  findstr /r /b /c:"[ ]*DEEPSEEK_API_KEY[ ]*=[ ]*[^ ]" "%~dp0product\.env" >nul
  if not errorlevel 1 (
    wscript.exe "%~dp0product\launch-ai-todo.vbs"
    exit /b 0
  )
)
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0product\launch-ai-todo.ps1"
if errorlevel 1 pause
