@echo off
title Fon Takip Programi Kaldir
echo.
echo Fon Takip Programi kaldiriliyor...
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$ProductName='Fon Takip Programı';" ^
  "Get-Process -Name $ProductName -ErrorAction SilentlyContinue | Stop-Process -Force;" ^
  "$dir=Join-Path $env:LOCALAPPDATA ('Programs\' + $ProductName);" ^
  "if (Test-Path $dir) { Remove-Item -LiteralPath $dir -Recurse -Force };" ^
  "Remove-Item -LiteralPath (Join-Path ([Environment]::GetFolderPath('Desktop')) ($ProductName + '.lnk')) -Force -ErrorAction SilentlyContinue;" ^
  "Remove-Item -LiteralPath (Join-Path $env:APPDATA ('Microsoft\Windows\Start Menu\Programs\' + $ProductName + '.lnk')) -Force -ErrorAction SilentlyContinue;" ^
  "Remove-Item -LiteralPath ('HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\' + $ProductName) -Recurse -Force -ErrorAction SilentlyContinue;" ^
  "Write-Host 'Kaldirildi. Veritabani: ' (Join-Path $env:APPDATA ($ProductName + '\funds.db'))"
pause
