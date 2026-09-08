$ErrorActionPreference = 'Stop'
$productRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
$registryRoots = @('HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall', 'HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall', 'HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall')
foreach ($registryRoot in $registryRoots) {
  if (Test-Path -LiteralPath $registryRoot) {
    $existing = Get-ChildItem -LiteralPath $registryRoot | Get-ItemProperty | Where-Object { $_.DisplayName -eq 'AI ToDo' }
    if ($existing) { throw 'AI ToDo is already installed. Refusing to modify an existing installation.' }
  }
}
$version = (Get-Content -Raw -LiteralPath (Join-Path $productRoot 'package.json') | ConvertFrom-Json).version
$installer = Join-Path $productRoot "release\AI-ToDo-$version-x64-nsis.exe"
$testRoot = [IO.Path]::GetFullPath((Join-Path $productRoot 'test-results'))
$installRoot = [IO.Path]::GetFullPath((Join-Path $testRoot ('installer-' + [guid]::NewGuid().ToString('N'))))
if (-not $installRoot.StartsWith($testRoot + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) { throw 'Unsafe install test path.' }
$process = Start-Process -FilePath $installer -ArgumentList @('/S', '/currentuser', "/D=$installRoot") -PassThru -Wait -WindowStyle Hidden
if ($process.ExitCode -ne 0) { throw "Installation failed: $($process.ExitCode)" }
$executable = Join-Path $installRoot 'AI ToDo.exe'
$uninstaller = Join-Path $installRoot 'Uninstall AI ToDo.exe'
if (-not (Test-Path -LiteralPath $executable)) { throw "Installed executable not found in $installRoot" }
$previousExecutable = $env:AI_TODO_TEST_EXE
try {
  $env:AI_TODO_TEST_EXE = $executable
  & node (Join-Path $PSScriptRoot 'smoke-desktop.cjs')
  if ($LASTEXITCODE -ne 0) { throw 'Installed application smoke test failed.' }
} finally {
  $env:AI_TODO_TEST_EXE = $previousExecutable
  if (Test-Path -LiteralPath $uninstaller) {
    $uninstallProcess = Start-Process -FilePath $uninstaller -ArgumentList @('/S') -PassThru -Wait -WindowStyle Hidden
    if ($uninstallProcess.ExitCode -ne 0) { throw "Uninstall failed: $($uninstallProcess.ExitCode)" }
  }
}
if (Test-Path -LiteralPath $executable) { throw 'Uninstall did not remove the installed application.' }
Write-Host 'PASS: silent install, installed application verification, and uninstall.'
