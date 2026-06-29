@echo off
REM Launch Artview as a standalone app window. Starts the review server if needed.
cd /d E:\Project\Lantern

REM Start the server only if nothing is already listening on 3009.
powershell -NoProfile -Command "if (-not (Get-NetTCPConnection -LocalPort 3009 -State Listen -ErrorAction SilentlyContinue)) { Start-Process -WindowStyle Hidden node 'tools/review-server.cjs' -WorkingDirectory 'E:\Project\Lantern' }"

REM Give a fresh server a moment to bind.
powershell -NoProfile -Command "1..20 | ForEach-Object { if (Get-NetTCPConnection -LocalPort 3009 -State Listen -ErrorAction SilentlyContinue) { exit } ; Start-Sleep -Milliseconds 150 }"

start "" "C:\Program Files\Google\Chrome\Application\chrome.exe" --app=http://localhost:3009
