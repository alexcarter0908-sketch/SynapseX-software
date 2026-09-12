[CmdletBinding()]
param(
    [switch]$UpgradePip
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $repoRoot

if (-not (Get-Command py -ErrorAction SilentlyContinue) -and -not (Get-Command python -ErrorAction SilentlyContinue)) {
    throw 'Python 3 was not found. Install Python 3.10 or newer and run this script again.'
}

$pythonLauncher = if (Get-Command py -ErrorAction SilentlyContinue) { 'py' } else { 'python' }
$venvPath = Join-Path $repoRoot '.venv'

if (-not (Test-Path -LiteralPath $venvPath -PathType Container)) {
    & $pythonLauncher -m venv $venvPath
    if ($LASTEXITCODE -ne 0) { throw 'Failed to create the virtual environment.' }
}

$python = Join-Path $venvPath 'Scripts\python.exe'
if (-not (Test-Path -LiteralPath $python -PathType Leaf)) {
    throw "Virtual environment Python was not found at $python"
}

if ($UpgradePip) {
    & $python -m pip install --upgrade pip
    if ($LASTEXITCODE -ne 0) { throw 'Failed to upgrade pip.' }
}

& $python -m pip install -e '.[dev]'
if ($LASTEXITCODE -ne 0) { throw 'Failed to install UEA.' }

$env:UEA_HOME = $repoRoot
& $python -m uea init workspace
if ($LASTEXITCODE -ne 0) { throw 'Failed to initialize the internal UEA workspace.' }

Write-Host "UEA setup complete. Activate with: .\.venv\Scripts\Activate.ps1" -ForegroundColor Green
