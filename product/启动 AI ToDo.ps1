$ErrorActionPreference = 'Stop'
$productRoot = $PSScriptRoot

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
function Read-DotEnv([string]$Path) {
  $values = @{}
  if (-not (Test-Path -LiteralPath $Path)) { return $values }

  foreach ($line in Get-Content -LiteralPath $Path) {
    $text = $line.Trim()
    if ([string]::IsNullOrWhiteSpace($text) -or $text.StartsWith('#')) { continue }
    if ($text -notmatch '^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$') { continue }

    $name = $Matches[1]
    $value = $Matches[2].Trim()
    $isDoubleQuoted = $value.Length -ge 2 -and $value.StartsWith('"') -and $value.EndsWith('"')
    $isSingleQuoted = $value.Length -ge 2 -and $value.StartsWith("'") -and $value.EndsWith("'")
    if ($isDoubleQuoted -or $isSingleQuoted) { $value = $value.Substring(1, $value.Length - 2) }
    [void]($values[$name] = $value)
  }

  return $values
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

if (-not (Test-Path (Join-Path $productRoot 'gateway\node_modules'))) {
  Write-Host '正在安装 AI 网关依赖…' -ForegroundColor Cyan
  Invoke-Npm @('install') (Join-Path $productRoot 'gateway')
}
if (-not (Test-Path (Join-Path $productRoot 'dist\renderer\index.html'))) {
  Write-Host '首次运行，正在构建桌面应用…' -ForegroundColor Cyan
  Invoke-Npm @('run', 'build')
}

$envFile = Join-Path $productRoot '.env'
$envConfig = Read-DotEnv $envFile
$apiKey = [string]$envConfig['DEEPSEEK_API_KEY']
if ([string]::IsNullOrWhiteSpace($apiKey)) {
  $apiKey = Read-Host '请输入 DeepSeek API Key（.env 未配置）'
}
if ([string]::IsNullOrWhiteSpace($apiKey)) { throw 'API Key 不能为空。' }

$env:DEEPSEEK_API_KEY = $apiKey
$env:DEEPSEEK_BASE_URL = if ($envConfig['DEEPSEEK_BASE_URL']) { $envConfig['DEEPSEEK_BASE_URL'] } else { 'https://api.deepseek.com' }
$env:DEEPSEEK_MODEL = if ($envConfig['DEEPSEEK_MODEL']) { $envConfig['DEEPSEEK_MODEL'] } else { 'deepseek-v4-flash' }
$env:AI_GATEWAY_URL = if ($envConfig['AI_GATEWAY_URL']) { $envConfig['AI_GATEWAY_URL'] } else { 'http://127.0.0.1:8787' }
$env:PORT = if ($envConfig['PORT']) { $envConfig['PORT'] } else { '8787' }
$tsxCli = Join-Path $productRoot 'gateway\node_modules\tsx\dist\cli.mjs'
if (-not (Test-Path -LiteralPath $tsxCli)) { throw '未找到 AI 网关运行时，请重新启动项目以安装依赖。' }
$gateway = Start-Process -FilePath 'node.exe' -ArgumentList @($tsxCli, 'gateway/src/index.ts') -WorkingDirectory $productRoot -PassThru -WindowStyle Hidden
$healthUrl = "$($env:AI_GATEWAY_URL.TrimEnd('/'))/health"
try {
  $ready = $false
  for ($attempt = 0; $attempt -lt 20; $attempt++) {
    Start-Sleep -Milliseconds 250
    try {
      $health = Invoke-RestMethod $healthUrl -TimeoutSec 1
      if ($health.ok) { $ready = $true; break }
    } catch { }
  }
  if (-not $ready) { throw 'AI 网关启动超时，请查看网关窗口。' }
  Write-Host 'AI 网关已启动，正在打开 AI ToDo…' -ForegroundColor Green
  Hide-LauncherConsole
  Invoke-Npm @('start')
} finally {
  if ($gateway -and -not $gateway.HasExited) { Stop-Process -Id $gateway.Id -Force -ErrorAction SilentlyContinue }
}