# Builds FundTrack Android APK (requires JDK 21+ and Android SDK)
$ErrorActionPreference = 'Stop'
$Client = Split-Path -Parent $MyInvocation.MyCommand.Path
$Jdk = Get-ChildItem 'C:\Program Files\Microsoft\jdk-*' -ErrorAction SilentlyContinue | Sort-Object Name -Descending | Select-Object -First 1
if ($Jdk) {
  $env:JAVA_HOME = $Jdk.FullName
  $env:PATH = "$env:JAVA_HOME\bin;$env:PATH"
}

Set-Location $Client
npm run cap:sync
Set-Location android
.\gradlew.bat assembleDebug --no-daemon

$apk = Join-Path $Client 'android\app\build\outputs\apk\debug\app-debug.apk'
$out = Join-Path (Split-Path $Client) 'FundTrack-Android.apk'
Copy-Item $apk $out -Force
Write-Host ''
Write-Host "APK hazir: $out" -ForegroundColor Green
explorer /select,"$out"
