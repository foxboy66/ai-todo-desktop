$ErrorActionPreference = 'Stop'
$productRoot = $PSScriptRoot

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
if (-not (Test-Path (Join-Path $productRoot 'gateway\node_modules'))) {
  Write-Host '正在安装 AI 网关依赖…' -ForegroundColor Cyan
  Invoke-Npm @('install') (Join-Path $productRoot 'gateway')
}
if (-not (Test-Path (Join-Path $productRoot 'dist\renderer\index.html'))) {
  Write-Host '首次运行，正在构建桌面应用…' -ForegroundColor Cyan
  Invoke-Npm @('run', 'build')
}

$apiKey = Read-Host '请输入 DeepSeek API Key（不会写入文件）'
if ([string]::IsNullOrWhiteSpace($apiKey)) { throw 'API Key 不能为空。' }

$env:DEEPSEEK_API_KEY = $apiKey
$env:DEEPSEEK_BASE_URL = 'https://api.deepseek.com'
$env:DEEPSEEK_MODEL = 'deepseek-v4-flash'
$env:AI_GATEWAY_URL = 'http://127.0.0.1:8787'
$env:PORT = '8787'

$gateway = Start-Process -FilePath 'npm.cmd' -ArgumentList @('exec', 'tsx', 'gateway/src/index.ts') -WorkingDirectory $productRoot -PassThru -WindowStyle Minimized
try {
  $ready = $false
  for ($attempt = 0; $attempt -lt 20; $attempt++) {
    Start-Sleep -Milliseconds 250
    try {
      $health = Invoke-RestMethod 'http://127.0.0.1:8787/health' -TimeoutSec 1
      if ($health.ok) { $ready = $true; break }
    } catch { }
  }
  if (-not $ready) { throw 'AI 网关启动超时，请查看网关窗口。' }
  Write-Host 'AI 网关已启动，正在打开 AI ToDo…' -ForegroundColor Green
  Invoke-Npm @('start')
} finally {
  if ($gateway -and -not $gateway.HasExited) { Stop-Process -Id $gateway.Id -Force -ErrorAction SilentlyContinue }
}