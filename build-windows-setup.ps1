<#
.SYNOPSIS
  Build a Windows x64 FigCraft Setup.exe from this source tree.
.DESCRIPTION
  Checks local build prerequisites and invokes the repository's Windows packaging script.
  See docs/windows-setup-exe.md for installation instructions for the prerequisites.
#>
[CmdletBinding()]
param(
  [ValidateSet('x64', 'x86', 'arm64')]
  [string] $Arch = 'x64'
)

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path

$missing = @()
foreach ($command in @('cargo', 'rustup', 'dotnet', 'wix', 'makensis')) {
  if (-not (Get-Command $command -ErrorAction SilentlyContinue)) {
    $missing += $command
  }
}
if ($missing.Count -gt 0) {
  throw "Missing build tools: $($missing -join ', '). Install the prerequisites in docs/windows-setup-exe.md, then run this script again."
}

$target = switch ($Arch) {
  'x64' { 'x86_64-pc-windows-msvc' }
  'x86' { 'i686-pc-windows-msvc' }
  'arm64' { 'aarch64-pc-windows-msvc' }
}
$installedTargets = & rustup target list --installed
if ($LASTEXITCODE -ne 0) { throw 'Could not query installed Rust targets.' }
if ($installedTargets -notcontains $target) {
  & rustup target add $target
  if ($LASTEXITCODE -ne 0) { throw "Could not install Rust target $target." }
}

& (Join-Path $Root 'packaging/windows/package.ps1') -Arch $Arch
if ($LASTEXITCODE -ne 0) { throw 'Windows packaging failed.' }

$dist = Join-Path $Root 'dist/release'
$setup = Get-ChildItem -Path $dist -Filter "figcraft-*-windows-$Arch-setup.exe" -File |
  Sort-Object LastWriteTime -Descending |
  Select-Object -First 1
if (-not $setup) { throw "The packaging script completed but no Setup.exe was found in $dist." }
Write-Host "`nSetup installer created: $($setup.FullName)" -ForegroundColor Green
