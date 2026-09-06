$ErrorActionPreference = 'Stop'

# Keep the Windows .bat entry point ASCII-only. The actual launcher keeps its
# user-facing messages in the existing Chinese-named script next to this file.
$currentName = [System.IO.Path]::GetFileName($PSCommandPath)
$target = Get-ChildItem -LiteralPath $PSScriptRoot -Filter '*.ps1' |
  Where-Object { $_.Name -ne $currentName } |
  Select-Object -First 1

if (-not $target) {
  throw 'The main launcher script was not found.'
}

& $target.FullName
exit $LASTEXITCODE