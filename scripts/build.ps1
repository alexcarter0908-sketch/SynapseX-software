[CmdletBinding()]
param(
    [switch]$RunTests
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
$python = Join-Path $repoRoot '.venv\Scripts\python.exe'
if (-not (Test-Path -LiteralPath $python -PathType Leaf)) {
    throw 'Virtual environment not found. Run scripts\setup.ps1 first.'
}

Set-Location -LiteralPath $repoRoot
& $python -m compileall -q src
if ($LASTEXITCODE -ne 0) { throw 'Python compilation validation failed.' }

if ($RunTests) {
    & $python -m pytest -q
    if ($LASTEXITCODE -ne 0) { throw 'Automated tests failed.' }
}

Write-Host 'Build validation complete.' -ForegroundColor Green
