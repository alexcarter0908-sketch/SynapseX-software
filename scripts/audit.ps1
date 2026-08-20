[CmdletBinding()]
param(
    [string]$ProjectPath = '.',
    [switch]$Json,
    [switch]$NoWrite
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$arguments = @{ Command = 'audit'; ProjectPath = $ProjectPath }
if ($Json) { $arguments.Json = $true }
if ($NoWrite) { $arguments.NoWrite = $true }
& (Join-Path $PSScriptRoot 'uea.ps1') @arguments
exit $LASTEXITCODE
