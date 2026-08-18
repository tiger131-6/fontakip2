# Installs Fon Takip Programı from win-unpacked (no NSIS — avoids Smart App Control on Setup.exe).
#Usage: powershell -ExecutionPolicy Bypass -File install-windows.ps1
# Run from desktop/ or desktop/installer/ (auto-detects win-unpacked).

$ErrorActionPreference = 'Stop'

$ProductName = 'Fon Takip Programı'
$ExeName = 'Fon Takip Programı.exe'
$Version = '1.0.0'
$InstallDir = Join-Path $env:LOCALAPPDATA "Programs\$ProductName"

function Find-WinUnpacked {
  param([string]$StartDir)
  $candidates = @(
    (Join-Path $StartDir 'win-unpacked'),
    (Join-Path $StartDir 'installer\win-unpacked'),
    (Join-Path (Split-Path $StartDir -Parent) 'installer\win-unpacked')
  )
  foreach ($dir in $candidates) {
    if (Test-Path (Join-Path $dir $ExeName)) { return (Resolve-Path $dir).Path }
  }
  return $null
}

$SourceDir = Find-WinUnpacked -StartDir $PSScriptRoot
if (-not $SourceDir) {
  Write-Error "win-unpacked bulunamadi. Once 'npm run dist' calistirin."
}

Write-Host "Kaynak: $SourceDir"
Write-Host "Hedef:  $InstallDir"

Get-Process -Name $ProductName -ErrorAction SilentlyContinue | Stop-Process -Force

if (Test-Path $InstallDir) {
  Write-Host 'Eski kurulum kaldiriliyor...'
  Remove-Item -LiteralPath $InstallDir -Recurse -Force
}

New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null
& robocopy $SourceDir $InstallDir /E /NFL /NDL /NJH /NJS /NC /NS /NP | Out-Null
if ($LASTEXITCODE -ge 8) {
  throw "Dosya kopyalama basarisiz (robocopy exit $LASTEXITCODE)"
}

$TargetExe = Join-Path $InstallDir $ExeName
Get-ChildItem -LiteralPath $InstallDir -Recurse -File -Filter '*.exe' | ForEach-Object {
  Unblock-File -LiteralPath $_.FullName -ErrorAction SilentlyContinue
}

$uninstallPs1 = @"
`$ErrorActionPreference = 'Stop'
Get-Process -Name '$ProductName' -ErrorAction SilentlyContinue | Stop-Process -Force
`$dir = '$InstallDir'
if (Test-Path `$dir) { Remove-Item -LiteralPath `$dir -Recurse -Force }
`$links = @(
  (Join-Path ([Environment]::GetFolderPath('Desktop')) '$ProductName.lnk'),
  (Join-Path `$env:APPDATA 'Microsoft\Windows\Start Menu\Programs\$ProductName.lnk')
)
foreach (`$l in `$links) { if (Test-Path `$l) { Remove-Item -LiteralPath `$l -Force } }
Remove-Item -LiteralPath 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\$ProductName' -Recurse -Force -ErrorAction SilentlyContinue
Write-Host '$ProductName kaldirildi.'
"@
Set-Content -LiteralPath (Join-Path $InstallDir 'uninstall.ps1') -Value $uninstallPs1 -Encoding UTF8

$WshShell = New-Object -ComObject WScript.Shell
foreach ($folder in @(
  [Environment]::GetFolderPath('Desktop'),
  (Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs')
)) {
  $linkPath = Join-Path $folder "$ProductName.lnk"
  $sc = $WshShell.CreateShortcut($linkPath)
  $sc.TargetPath = $TargetExe
  $sc.WorkingDirectory = $InstallDir
  $sc.Description = $ProductName
  $sc.Save()
}

$regPath = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\$ProductName"
New-Item -Path $regPath -Force | Out-Null
Set-ItemProperty -Path $regPath -Name DisplayName -Value $ProductName
Set-ItemProperty -Path $regPath -Name DisplayVersion -Value $Version
Set-ItemProperty -Path $regPath -Name Publisher -Value $ProductName
Set-ItemProperty -Path $regPath -Name InstallLocation -Value $InstallDir
Set-ItemProperty -Path $regPath -Name DisplayIcon -Value $TargetExe
Set-ItemProperty -Path $regPath -Name UninstallString -Value "powershell.exe -NoProfile -ExecutionPolicy Bypass -File `"$InstallDir\uninstall.ps1`""
Set-ItemProperty -Path $regPath -Name NoModify -Value 1 -Type DWord
Set-ItemProperty -Path $regPath -Name NoRepair -Value 1 -Type DWord

Write-Host ''
Write-Host "Kurulum tamamlandi."
Write-Host "Program: $TargetExe"
Write-Host "Baslat Menusu ve Masaustu kisayolu olusturuldu."
Write-Host ''
Start-Process -FilePath $TargetExe
