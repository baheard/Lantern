<#
.SYNOPSIS
  Launch (or reuse) the Lantern location-art review server in a dedicated app window.

.DESCRIPTION
  - If the review server is already listening on the port, just opens the UI — no
    second server, no extra browser tab.
  - Otherwise starts it (hidden) for the given game, waits for it to come up, then opens.
  - Opens in an Edge/Chrome "app window" (chromeless, its own taskbar entry) when one
    is found, so it doesn't pile up tabs in your main browser. Falls back to the
    default browser if neither is installed.

.PARAMETER Game
  Game slug under docs/games/images/ (e.g. anchorhead). Required only when the server
  isn't already running.

.PARAMETER Port
  Port to use / detect. Default 3009 (matches review-server.cjs default).

.PARAMETER Restart
  Stop whatever is on the port first, then start fresh for -Game. Use when switching
  games (the server is bound to a single game per run).

.EXAMPLE
  .\tools\artview.ps1 anchorhead
.EXAMPLE
  .\tools\artview.ps1 lostpig -Restart
#>
param(
  [Parameter(Position = 0)][string]$Game,
  [int]$Port = 3009,
  [switch]$Restart
)

$ErrorActionPreference = 'Stop'
$repo = Split-Path $PSScriptRoot -Parent   # tools\ -> repo root
$url  = "http://localhost:$Port"

function Test-PortListening([int]$p) {
  [bool](Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction SilentlyContinue)
}

function Stop-PortOwner([int]$p) {
  $c = Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction SilentlyContinue
  if ($c) { Stop-Process -Id $c.OwningProcess -Force -ErrorAction SilentlyContinue }
}

function Find-AppBrowser {
  $candidates = @(
    "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
    "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
    "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
    "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe"
  )
  foreach ($c in $candidates) { if ($c -and (Test-Path $c)) { return $c } }
  return $null
}

function Open-Reviewer([string]$u) {
  $browser = Find-AppBrowser
  if ($browser) {
    Start-Process $browser -ArgumentList "--app=$u", "--window-size=1180,860"
  } else {
    Start-Process $u   # default browser (opens a normal tab)
  }
}

if ($Restart) { Stop-PortOwner $Port; Start-Sleep -Milliseconds 300 }

if (-not (Test-PortListening $Port)) {
  if (-not $Game) {
    throw "No review server on port $Port. Pass a game slug, e.g. .\tools\artview.ps1 anchorhead"
  }
  Push-Location $repo
  try {
    Start-Process node `
      -ArgumentList "tools/review-server.cjs", $Game, "--port", $Port, "--no-open" `
      -WindowStyle Hidden
  } finally { Pop-Location }

  # Poll until it's accepting connections (server boot is sub-second; cap at ~5s).
  for ($i = 0; $i -lt 50 -and -not (Test-PortListening $Port); $i++) {
    Start-Sleep -Milliseconds 100
  }
  if (-not (Test-PortListening $Port)) { throw "Review server failed to start on port $Port." }
  Write-Host "Started review server for '$Game' on $url"
} else {
  Write-Host "Reusing review server already on $url"
}

Open-Reviewer $url
