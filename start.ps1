#!/usr/bin/env pwsh
<#
.SYNOPSIS
    BookHaven — Start Full-Stack (Frontend + Django API Backend) in one command.

.DESCRIPTION
    Starts the frontend HTTP server on port 8080 and Django REST API on port 8001.
    Run from the BookHaven-Website root directory:
        .\start.ps1
#>

$ROOT_DIR = $PSScriptRoot
$FRONTEND_DIR = "$ROOT_DIR\frontend"
$BACKEND_DIR = "$ROOT_DIR\backend"

Write-Host ""
Write-Host "=================================================" -ForegroundColor Cyan
Write-Host "    BookHaven — Full-Stack Literary Platform    " -ForegroundColor Cyan
Write-Host "=================================================" -ForegroundColor Cyan
Write-Host ""

# ── 1. Start Frontend Server (Port 8080) ──────────────────────────
Write-Host "[Frontend] Starting local HTTP server on port 8080..." -ForegroundColor Yellow
$frontendRunning = Get-NetTCPConnection -LocalPort 8080 -ErrorAction SilentlyContinue
if ($frontendRunning) {
    Write-Host "[Frontend] Server already listening on http://127.0.0.1:8080" -ForegroundColor Green
} else {
    Start-Process -FilePath "python" `
        -ArgumentList "-m http.server 8080 --directory `"$FRONTEND_DIR`"" `
        -WindowStyle Hidden
    Start-Sleep -Seconds 1
    Write-Host "[Frontend] Running at: http://127.0.0.1:8080/index.html" -ForegroundColor Green
}

# ── 2. Start Django API Backend (Port 8001) ───────────────────────
Write-Host "[Backend]  Checking Django REST API on port 8001..." -ForegroundColor Yellow
$backendRunning = Get-NetTCPConnection -LocalPort 8001 -ErrorAction SilentlyContinue
if ($backendRunning) {
    Write-Host "[Backend]  Django API already running on http://127.0.0.1:8001" -ForegroundColor Green
} else {
    Write-Host "[Backend]  Starting Django dev server on port 8001..." -ForegroundColor Yellow
    Set-Location $BACKEND_DIR
    & ".\venv\Scripts\Activate.ps1"
    Start-Process -FilePath ".\venv\Scripts\python.exe" `
        -ArgumentList "manage.py runserver 8001" `
        -WorkingDirectory $BACKEND_DIR `
        -WindowStyle Hidden
    Start-Sleep -Seconds 2
    Write-Host "[Backend]  Running at: http://127.0.0.1:8001/api/" -ForegroundColor Green
}

Set-Location $ROOT_DIR

Write-Host ""
Write-Host "=================================================" -ForegroundColor Cyan
Write-Host "  Website URL:  http://127.0.0.1:8080/index.html " -ForegroundColor White
Write-Host "  API Base:     http://127.0.0.1:8001/api/       " -ForegroundColor White
Write-Host "  API Health:   http://127.0.0.1:8001/api/health/" -ForegroundColor White
Write-Host "  Admin Panel:  http://127.0.0.1:8001/admin/     " -ForegroundColor White
Write-Host "=================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Opening BookHaven website in your default browser..." -ForegroundColor Green
Start-Process "http://127.0.0.1:8080/index.html"
