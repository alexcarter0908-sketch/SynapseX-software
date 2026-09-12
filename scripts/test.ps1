[CmdletBinding()]
param(
    [string]$ProjectPath = '.',
    [ValidateRange(1, 3600)]
    [int]$Timeout = 300
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
& (Join-Path $PSScriptRoot 'uea.ps1') -Command test -ProjectPath $ProjectPath -Timeout $Timeout
exit $LASTEXITCODE
