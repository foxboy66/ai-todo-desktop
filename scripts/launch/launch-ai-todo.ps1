$ErrorActionPreference = 'Stop'
$productRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))

function Hide-LauncherConsole {
  if (-not ('AiTodoConsoleWindow' -as [type])) {
    Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class AiTodoConsoleWindow {
  [DllImport("kernel32.dll")] public static extern IntPtr GetConsoleWindow();
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
}
"@
  }
  $handle = [AiTodoConsoleWindow]::GetConsoleWindow()
  if ($handle -ne [IntPtr]::Zero) { [void][AiTodoConsoleWindow]::ShowWindow($handle, 0) }
}
function Invoke-Npm([string[]]$Arguments, [string]$WorkingDirectory = $productRoot) {
  Push-Location $WorkingDirectory
  try {
    & npm.cmd @Arguments
    if ($LASTEXITCODE -ne 0) { throw "npm $($Arguments -join ' ') 执行失败" }
  } finally { Pop-Location }
}

if (-not (Get-Command node.exe -ErrorAction SilentlyContinue)) {
  throw '未找到 Node.js。请先安装 Node.js 22 或更高版本后重试。'
}
if (-not (Get-Command npm.cmd -ErrorAction SilentlyContinue)) {
  throw '未找到 npm。请确认 Node.js 已正确安装。'
}

if (-not (Test-Path (Join-Path $productRoot 'node_modules'))) {
  Write-Host '首次运行，正在安装桌面端依赖…' -ForegroundColor Cyan
  Invoke-Npm @('install')
}
Push-Location $productRoot
try {
  $electronVersion = ((& npm.cmd exec electron -- --version | Select-Object -Last 1).Trim())
} finally {
  Pop-Location
}
if ($electronVersion.StartsWith('v')) { $electronVersion = $electronVersion.Substring(1) }
if ($electronVersion -notmatch '^\d+\.\d+\.\d+$') {
  throw "无法识别 Electron 版本：$electronVersion"
}
$nativeVersionMarker = Join-Path $productRoot 'node_modules\.ai-todo-electron-version'
$nativeVersion = if (Test-Path $nativeVersionMarker) { (Get-Content -Raw -LiteralPath $nativeVersionMarker).Trim() } else { '' }
if ($nativeVersion -ne $electronVersion) {
  Write-Host "正在为 Electron $electronVersion 重建 SQLite 原生模块…" -ForegroundColor Cyan
  Invoke-Npm @('rebuild', 'better-sqlite3', '--runtime=electron', "--target=$electronVersion", '--dist-url=https://electronjs.org/headers')
  [System.IO.File]::WriteAllText($nativeVersionMarker, $electronVersion, [System.Text.UTF8Encoding]::new($false))
}

Write-Host '正在构建桌面应用…' -ForegroundColor Cyan
Invoke-Npm @('run', 'build')
Write-Host '正在打开 AI ToDo，可在软件内选择是否使用大模型。' -ForegroundColor Green
Hide-LauncherConsole
Invoke-Npm @('start')
