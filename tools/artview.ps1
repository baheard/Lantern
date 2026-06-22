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
    # Launch with CDP enabled so tooling (web-agent / Claude) can attach to the reviewer.
    # A dedicated --user-data-dir forces a SEPARATE browser process — otherwise the flag is
    # ignored when it just joins your already-running main browser. Port 9223 avoids clashing
    # with a main browser on the usual 9222. Attach via http://localhost:9223.
    $profileDir = Join-Path $env:TEMP 'lantern-artview-cdp'
    Start-Process $browser -ArgumentList @(
      "--app=$u",
      "--window-size=1180,860",
      "--remote-debugging-port=9223",
      "--user-data-dir=`"$profileDir`""
    )
  } else {
    Start-Process $u   # default browser (opens a normal tab)
  }
}

# Reuse an already-open reviewer window instead of piling up new ones: the app window's
# title is the page <title> ("Art Review"). If we find it, just focus it — the page
# auto-reloads itself when it detects the server restarted (BOOT_ID change in its /api/jobs
# poll), so we DON'T send an F5 keystroke. SendKeys toggles NumLock as a side effect, which
# is what triggered the "numlock on" announcement on every -Restart.
function Show-Reviewer([string]$u) {
  $win = Get-Process msedge, chrome -ErrorAction SilentlyContinue |
    Where-Object { $_.MainWindowTitle -match 'Art Review' } | Select-Object -First 1
  if ($win) {
    try {
      $wsh = New-Object -ComObject WScript.Shell
      if ($wsh.AppActivate($win.Id)) {
        Write-Host "Focused existing reviewer window (it auto-reloads on server restart)."
        return
      }
    } catch { }
  }
  Open-Reviewer $u
}

if ($Restart) { Stop-PortOwner $Port; Start-Sleep -Milliseconds 300 }

if (-not (Test-PortListening $Port)) {
  if (-not $Game) {
    throw "No review server on port $Port. Pass a game slug, e.g. .\tools\artview.ps1 anchorhead"
  }
  Push-Location $repo
  try {
    # Redirect server stdout/stderr to log files so a gen that flashes by in the UI
    # can be reviewed after the fact (Claude reads tools/.artview-server.log).
    $outLog = Join-Path $repo 'tools/.artview-server.log'
    $errLog = Join-Path $repo 'tools/.artview-server.err.log'
    Start-Process node `
      -ArgumentList "tools/review-server.cjs", $Game, "--port", $Port, "--no-open" `
      -WindowStyle Hidden `
      -RedirectStandardOutput $outLog `
      -RedirectStandardError $errLog
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

Show-Reviewer $url
