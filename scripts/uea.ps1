[CmdletBinding()]
param(
    [Parameter(Mandatory = $true, Position = 0)]
    [ValidateSet('inspect', 'audit', 'status', 'test', 'report', 'plan', 'task', 'change', 'baseline', 'dbcheck', 'init')]
    [string]$Command,

    [Parameter(Position = 1)]
    [string]$ProjectPath = 'workspace',

    [switch]$Json,
    [switch]$NoWrite,
    [ValidateRange(1, 3600)]
    [int]$Timeout = 300
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
$env:UEA_HOME = $repoRoot
$venvPython = Join-Path $repoRoot '.venv\Scripts\python.exe'
if (Test-Path -LiteralPath $venvPython -PathType Leaf) {
    $python = $venvPython
} elseif (Get-Command py -ErrorAction SilentlyContinue) {
    $python = 'py'
} elseif (Get-Command python -ErrorAction SilentlyContinue) {
    $python = 'python'
} else {
    throw 'Python 3 was not found. Run scripts\setup.ps1 first.'
}

$arguments = @('-m', 'uea', $Command, $ProjectPath)
if ($Json) { $arguments += '--json' }
if ($NoWrite) { $arguments += '--no-write' }
if ($Command -eq 'test') { $arguments += @('--timeout', $Timeout.ToString()) }

& $python @arguments
exit $LASTEXITCODE
