# IdentitySphere - start API + React dashboard
$ErrorActionPreference = "Stop"
$root = $PSScriptRoot

Write-Host "IdentitySphere AI - starting services..." -ForegroundColor Cyan
Write-Host "Project: $root" -ForegroundColor DarkGray

function Test-AuthApi {
  try {
    $r = Invoke-WebRequest -Uri "http://127.0.0.1:8000/api/auth/status" -UseBasicParsing -TimeoutSec 2
    return $r.StatusCode -eq 200
  } catch {
    return $false
  }
}

function Stop-PortListener([int]$Port) {
  $lines = netstat -ano | Select-String ":$Port\s"
  foreach ($line in $lines) {
    if ($line -match "LISTENING\s+(\d+)$") {
      $procId = [int]$Matches[1]
      try {
        Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
      } catch {}
    }
  }
}

$apiRunning = $false
try {
  $tcp = New-Object System.Net.Sockets.TcpClient
  $tcp.Connect("127.0.0.1", 8000)
  $apiRunning = $true
  $tcp.Close()
} catch {}

$authReady = $apiRunning -and (Test-AuthApi)
if ($apiRunning -and -not $authReady) {
  Write-Host "Stale API on port 8000 (missing auth routes) - restarting..." -ForegroundColor Yellow
  Stop-PortListener 8000
  Start-Sleep -Seconds 1
  $apiRunning = $false
}

if (-not $apiRunning) {
  Write-Host "Starting API on http://127.0.0.1:8000 ..." -ForegroundColor Yellow
  Start-Process powershell -ArgumentList @(
    "-NoExit", "-Command",
    "Set-Location '$root'; python -m uvicorn api_server:app --reload --port 8000"
  ) | Out-Null
  Start-Sleep -Seconds 3
} else {
  Write-Host "API already running on port 8000 (auth ready)." -ForegroundColor Green
}

# Frontend on 5173
$feRunning = $false
try {
  $tcp = New-Object System.Net.Sockets.TcpClient
  $tcp.Connect("127.0.0.1", 5173)
  $feRunning = $true
  $tcp.Close()
} catch {}

if (-not $feRunning) {
  Write-Host "Starting dashboard on http://localhost:5173 ..." -ForegroundColor Yellow
  Start-Process powershell -ArgumentList @(
    "-NoExit", "-Command",
    "Set-Location '$root\frontend'; if (-not (Test-Path node_modules)) { npm install }; npm run dev"
  ) | Out-Null
  Start-Sleep -Seconds 3
} else {
  Write-Host "Dashboard already running on port 5173." -ForegroundColor Green
}

Write-Host ""
Write-Host "Open in browser:" -ForegroundColor Green
Write-Host "  Login:  http://localhost:5173/login.html" -ForegroundColor White
Write-Host "  Admin:  http://localhost:5173/admin" -ForegroundColor White
Write-Host "  Employee: http://localhost:5173/employee" -ForegroundColor White
Write-Host ""
Write-Host "Demo: admin@identitysphere.ai / Admin123!Secure (MFA code shown in API terminal or inbox)" -ForegroundColor DarkGray
