# FundTrack Local — network demo mode
# Run from fundtrack-local/:  .\start-remote.ps1
# Opens the app to other devices on your LAN / static IP (with router port forward).

$Root = $PSScriptRoot
$Server = Join-Path $Root 'server'
$Client = Join-Path $Root 'client'

Write-Host ''
Write-Host '=== FundTrack Local — Uzaktan Erişim ===' -ForegroundColor Cyan
Write-Host ''

# Show reachable URLs
$lan = (Get-NetIPAddress -AddressFamily IPv4 |
  Where-Object { $_.IPAddress -notlike '127.*' -and $_.PrefixOrigin -ne 'WellKnown' } |
  Select-Object -ExpandProperty IPAddress)
try {
  $wan = (Invoke-RestMethod -Uri 'https://api.ipify.org?format=json' -TimeoutSec 8).ip
} catch {
  $wan = $null
}

Write-Host 'Erişim adresleri (sunucular başladıktan sonra):' -ForegroundColor Yellow
foreach ($ip in $lan) {
  Write-Host "  Aynı ağ (LAN):     http://${ip}:5173/"
}
if ($wan) {
  Write-Host "  Statik IP (WAN):   http://${wan}:5173/"
  Write-Host '    -> Router''da TCP 5173 portunu bu PC''ye yönlendirin (192.168.1.4).' -ForegroundColor DarkGray
}
Write-Host ''
Write-Host 'Windows Güvenlik Duvarı (Yönetici PowerShell):' -ForegroundColor Yellow
Write-Host '  New-NetFirewallRule -DisplayName "FundTrack Dev 5173" -Direction Inbound -LocalPort 5173 -Protocol TCP -Action Allow'
Write-Host ''

$serverCmd = "Set-Location '$Server'; `$env:HOST='0.0.0.0'; npm run dev:remote"
$clientCmd = "Set-Location '$Client'; npm run dev:remote"

Start-Process powershell -ArgumentList '-NoExit', '-Command', $serverCmd
Start-Sleep -Seconds 2
Start-Process powershell -ArgumentList '-NoExit', '-Command', $clientCmd

Write-Host 'İki terminal penceresi açıldı (API + istemci).' -ForegroundColor Green
Write-Host 'Tarayıcıda açın: http://localhost:5173/' -ForegroundColor Green
Write-Host ''
